import { ChildProcess, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import pidusage from "pidusage";
import { env } from "../config/env";

interface BenchmarkOptions {
  baseUrl: string;
  batchSize: number;
  pollIntervalMs: number;
  outputDir: string;
  spawnLocal: boolean;
  monitorPids: number[];
}

interface BatchDetailsResponse {
  batchId: string;
  status: "pending" | "processing" | "completed" | "failed";
  totalDocuments: number;
  processedDocuments: number;
  completedDocuments: number;
  failedDocuments: number;
}

interface ProcessSample {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryMb: number;
}

interface BenchmarkSample {
  elapsedMs: number;
  processedDocuments: number;
  completedDocuments: number;
  failedDocuments: number;
  averageDocsPerSecond: number;
  instantaneousDocsPerSecond: number;
  totalCpuPercent: number;
  totalMemoryMb: number;
  processes: ProcessSample[];
}

function parseArgs(): BenchmarkOptions {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const options: BenchmarkOptions = {
    baseUrl: "http://127.0.0.1:3000",
    batchSize: 1000,
    pollIntervalMs: env.BENCHMARK_POLL_INTERVAL_MS,
    outputDir: path.resolve(projectRoot, "benchmark-results", timestamp),
    spawnLocal: true,
    monitorPids: []
  };

  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--base-url") {
      options.baseUrl = args[++index] ?? options.baseUrl;
      continue;
    }

    if (arg === "--batch-size") {
      options.batchSize = Number(args[++index] ?? options.batchSize);
      continue;
    }

    if (arg === "--poll-interval") {
      options.pollIntervalMs = Number(args[++index] ?? options.pollIntervalMs);
      continue;
    }

    if (arg === "--output-dir") {
      options.outputDir = path.resolve(args[++index] ?? options.outputDir);
      continue;
    }

    if (arg === "--no-spawn") {
      options.spawnLocal = false;
      continue;
    }

    if (arg === "--pids") {
      const rawPids = args[++index] ?? "";
      options.monitorPids = rawPids
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);
    }
  }

  return options;
}

function ensureOk(response: Response, message: string) {
  if (!response.ok) {
    throw new Error(`${message} (${response.status} ${response.statusText})`);
  }
}

async function waitForHealth(baseUrl: string, timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await delay(500);
  }

  throw new Error(`API not healthy after ${timeoutMs} ms`);
}

async function startLocalServices(outputDir: string) {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const serverEntry = path.resolve(projectRoot, "dist", "server.js");
  const workerEntry = path.resolve(projectRoot, "dist", "worker.js");

  const processes: Array<{ name: string; child: ChildProcess }> = [];

  const apiLogPath = path.join(outputDir, "api.log");
  const workerLogPath = path.join(outputDir, "worker.log");

  const apiProcess = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const workerProcess = spawn(process.execPath, [workerEntry], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  apiProcess.stdout?.on("data", async (chunk: Buffer) => {
    await writeFile(apiLogPath, chunk, { flag: "a" });
  });
  apiProcess.stderr?.on("data", async (chunk: Buffer) => {
    await writeFile(apiLogPath, chunk, { flag: "a" });
  });
  workerProcess.stdout?.on("data", async (chunk: Buffer) => {
    await writeFile(workerLogPath, chunk, { flag: "a" });
  });
  workerProcess.stderr?.on("data", async (chunk: Buffer) => {
    await writeFile(workerLogPath, chunk, { flag: "a" });
  });

  processes.push({ name: "api", child: apiProcess });
  processes.push({ name: "worker", child: workerProcess });

  return processes;
}

async function stopLocalServices(processes: Array<{ name: string; child: ChildProcess }>) {
  await Promise.all(
    processes.map(async ({ child }) => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }

      await delay(250);
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    })
  );
}

async function createBatch(baseUrl: string, batchSize: number) {
  const userIds = Array.from({ length: batchSize }, (_, index) => `benchmark-user-${index + 1}`);

  const response = await fetch(`${baseUrl}/api/documents/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userIds })
  });

  ensureOk(response, "Unable to create benchmark batch");
  return (await response.json()) as { batchId: string; totalDocuments: number };
}

async function getBatchDetails(baseUrl: string, batchId: string) {
  const response = await fetch(`${baseUrl}/api/documents/batch/${batchId}`);
  ensureOk(response, "Unable to fetch batch status");
  return (await response.json()) as BatchDetailsResponse;
}

async function sampleProcesses(processDefinitions: Array<{ name: string; pid: number }>): Promise<ProcessSample[]> {
  if (processDefinitions.length === 0) {
    return [];
  }

  const usage = await pidusage(processDefinitions.map((processDefinition) => processDefinition.pid));

  return processDefinitions.map((processDefinition) => ({
    pid: processDefinition.pid,
    name: processDefinition.name,
    cpuPercent: Number((usage[processDefinition.pid]?.cpu ?? 0).toFixed(2)),
    memoryMb: Number((((usage[processDefinition.pid]?.memory ?? 0) / 1024) / 1024).toFixed(2))
  }));
}

function downsample<T>(values: T[], maxPoints = 20) {
  if (values.length <= maxPoints) {
    return values;
  }

  const step = Math.ceil(values.length / maxPoints);
  return values.filter((_, index) => index % step === 0 || index === values.length - 1);
}

function buildMermaidChart(title: string, yAxisLabel: string, values: number[], labels: number[]) {
  const maxValue = Math.max(...values, 0);
  const yMax = Math.max(1, Math.ceil(maxValue * 1.1));

  return [
    "```mermaid",
    "xychart-beta",
    `    title "${title}"`,
    `    x-axis [${labels.join(", ")}]`,
    `    y-axis "${yAxisLabel}" 0 --> ${yMax}`,
    `    line [${values.join(", ")}]`,
    "```"
  ].join("\n");
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const index = Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * ratio));
  return sortedValues[index];
}

function buildReport(options: BenchmarkOptions, batchId: string, durationMs: number, samples: BenchmarkSample[]) {
  const lastSample = samples.at(-1);
  const safeSamples = samples.length > 0 ? samples : [
    {
      elapsedMs: durationMs,
      processedDocuments: 0,
      completedDocuments: 0,
      failedDocuments: 0,
      averageDocsPerSecond: 0,
      instantaneousDocsPerSecond: 0,
      totalCpuPercent: 0,
      totalMemoryMb: 0,
      processes: []
    }
  ];

  const throughputValues = safeSamples.map((sample) => Number(sample.instantaneousDocsPerSecond.toFixed(2)));
  const cpuValues = safeSamples.map((sample) => Number(sample.totalCpuPercent.toFixed(2)));
  const memoryValues = safeSamples.map((sample) => Number(sample.totalMemoryMb.toFixed(2)));

  const chartSamples = downsample(safeSamples, 24);
  const chartLabels = chartSamples.map((sample) => Number((sample.elapsedMs / 1000).toFixed(1)));
  const processedChart = chartSamples.map((sample) => sample.processedDocuments);
  const throughputChart = chartSamples.map((sample) => Number(sample.instantaneousDocsPerSecond.toFixed(2)));
  const cpuChart = chartSamples.map((sample) => Number(sample.totalCpuPercent.toFixed(2)));
  const memoryChart = chartSamples.map((sample) => Number(sample.totalMemoryMb.toFixed(2)));

  const perProcessStats = new Map<string, { cpu: number[]; memory: number[] }>();
  for (const sample of safeSamples) {
    for (const processSample of sample.processes) {
      const current = perProcessStats.get(processSample.name) ?? { cpu: [], memory: [] };
      current.cpu.push(processSample.cpuPercent);
      current.memory.push(processSample.memoryMb);
      perProcessStats.set(processSample.name, current);
    }
  }

  const processSummary = [...perProcessStats.entries()]
    .map(([name, stats]) => {
      const averageCpu = stats.cpu.reduce((sum, value) => sum + value, 0) / stats.cpu.length;
      const peakCpu = Math.max(...stats.cpu, 0);
      const averageMemory = stats.memory.reduce((sum, value) => sum + value, 0) / stats.memory.length;
      const peakMemory = Math.max(...stats.memory, 0);
      return `- ${name}: CPU moyenne ${averageCpu.toFixed(2)}%, CPU max ${peakCpu.toFixed(2)}%, memoire moyenne ${averageMemory.toFixed(2)} MB, memoire max ${peakMemory.toFixed(2)} MB`;
    })
    .join("\n");

  const averageThroughput = durationMs > 0 && lastSample ? lastSample.processedDocuments / (durationMs / 1000) : 0;
  const peakThroughput = Math.max(...throughputValues, 0);
  const p95Throughput = percentile(throughputValues, 0.95);
  const averageCpu = cpuValues.reduce((sum, value) => sum + value, 0) / cpuValues.length;
  const peakCpu = Math.max(...cpuValues, 0);
  const averageMemory = memoryValues.reduce((sum, value) => sum + value, 0) / memoryValues.length;
  const peakMemory = Math.max(...memoryValues, 0);

  return `# Rapport de benchmark\n\n- Date: ${new Date().toISOString()}\n- Batch ID: ${batchId}\n- Taille du batch: ${options.batchSize}\n- Duree totale: ${(durationMs / 1000).toFixed(2)} s\n- Documents traites: ${lastSample?.processedDocuments ?? 0}\n- Documents completes: ${lastSample?.completedDocuments ?? 0}\n- Documents en echec: ${lastSample?.failedDocuments ?? 0}\n- Debit moyen: ${averageThroughput.toFixed(2)} documents/s\n- Debit max instantane: ${peakThroughput.toFixed(2)} documents/s\n- P95 du debit instantane: ${p95Throughput.toFixed(2)} documents/s\n- CPU agregee moyenne: ${averageCpu.toFixed(2)}%\n- CPU agregee max: ${peakCpu.toFixed(2)}%\n- Memoire agregee moyenne: ${averageMemory.toFixed(2)} MB\n- Memoire agregee max: ${peakMemory.toFixed(2)} MB\n\n## Resume des processus surveilles\n${processSummary || "- Aucun processus surveille"}\n\n## Courbes\n\n### Progression des documents\n${buildMermaidChart("Progression des documents", "Documents", processedChart, chartLabels)}\n\n### Debit instantane\n${buildMermaidChart("Debit instantane", "Docs/s", throughputChart, chartLabels)}\n\n### CPU agregee\n${buildMermaidChart("CPU agregee", "% CPU", cpuChart, chartLabels)}\n\n### Memoire agregee\n${buildMermaidChart("Memoire agregee", "MB", memoryChart, chartLabels)}\n\n## Donnees brutes\n\nLes echantillons complets sont exportes dans \`samples.json\` et \`summary.json\` a cote de ce rapport.\n`;
}

async function main() {
  const options = parseArgs();
  await mkdir(options.outputDir, { recursive: true });

  const localProcesses = options.spawnLocal ? await startLocalServices(options.outputDir) : [];
  const monitoredProcesses = [
    ...localProcesses
      .map(({ name, child }) => ({ name, pid: child.pid ?? 0 }))
      .filter((processDefinition) => processDefinition.pid > 0),
    ...options.monitorPids.map((pid) => ({ name: `pid-${pid}`, pid }))
  ];

  const cleanup = async () => {
    if (localProcesses.length > 0) {
      await stopLocalServices(localProcesses);
    }
  };

  try {
    if (options.spawnLocal) {
      await waitForHealth(options.baseUrl, 30000);
    }

    const batch = await createBatch(options.baseUrl, options.batchSize);
    const startedAt = Date.now();
    const samples: BenchmarkSample[] = [];
    let previousSampleTime = startedAt;
    let previousProcessed = 0;
    let batchState: BatchDetailsResponse | null = null;

    while (true) {
      batchState = await getBatchDetails(options.baseUrl, batch.batchId);
      const now = Date.now();
      const elapsedMs = now - startedAt;
      const elapsedSeconds = Math.max(0.001, elapsedMs / 1000);
      const deltaSeconds = Math.max(0.001, (now - previousSampleTime) / 1000);
      const processSamples = await sampleProcesses(monitoredProcesses);
      const totalCpuPercent = processSamples.reduce((sum, sample) => sum + sample.cpuPercent, 0);
      const totalMemoryMb = processSamples.reduce((sum, sample) => sum + sample.memoryMb, 0);
      const instantaneousDocsPerSecond = (batchState.processedDocuments - previousProcessed) / deltaSeconds;

      samples.push({
        elapsedMs,
        processedDocuments: batchState.processedDocuments,
        completedDocuments: batchState.completedDocuments,
        failedDocuments: batchState.failedDocuments,
        averageDocsPerSecond: batchState.processedDocuments / elapsedSeconds,
        instantaneousDocsPerSecond,
        totalCpuPercent: Number(totalCpuPercent.toFixed(2)),
        totalMemoryMb: Number(totalMemoryMb.toFixed(2)),
        processes: processSamples
      });

      if (batchState.status === "completed" || batchState.status === "failed") {
        const durationMs = Date.now() - startedAt;
        const report = buildReport(options, batch.batchId, durationMs, samples);
        const summary = {
          batchId: batch.batchId,
          status: batchState.status,
          durationMs,
          totalDocuments: batchState.totalDocuments,
          processedDocuments: batchState.processedDocuments,
          completedDocuments: batchState.completedDocuments,
          failedDocuments: batchState.failedDocuments,
          averageDocsPerSecond:
            durationMs > 0 ? Number((batchState.processedDocuments / (durationMs / 1000)).toFixed(2)) : 0,
          peakDocsPerSecond: Number(Math.max(...samples.map((sample) => sample.instantaneousDocsPerSecond), 0).toFixed(2)),
          peakCpuPercent: Number(Math.max(...samples.map((sample) => sample.totalCpuPercent), 0).toFixed(2)),
          peakMemoryMb: Number(Math.max(...samples.map((sample) => sample.totalMemoryMb), 0).toFixed(2))
        };

        await writeFile(path.join(options.outputDir, "samples.json"), JSON.stringify(samples, null, 2));
        await writeFile(path.join(options.outputDir, "summary.json"), JSON.stringify(summary, null, 2));
        await writeFile(path.join(options.outputDir, "report.md"), report);

        console.log(JSON.stringify({ outputDir: options.outputDir, summary }, null, 2));
        break;
      }

      previousSampleTime = now;
      previousProcessed = batchState.processedDocuments;
      await delay(options.pollIntervalMs);
    }
  } finally {
    await cleanup();
    await pidusage.clear();
  }
}

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await pidusage.clear();
  process.exit(1);
});
