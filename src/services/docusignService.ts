import { setTimeout as delay } from "node:timers/promises";
import { env } from "../config/env";
import { CircuitBreaker } from "../lib/circuitBreaker";

interface SimulatedDocuSignInput {
  batchId: string;
  documentId: string;
  userId: string;
}

const docuSignCircuitBreaker = new CircuitBreaker({
  failureThreshold: env.DOCUSIGN_FAILURE_THRESHOLD,
  resetTimeoutMs: env.DOCUSIGN_RESET_TIMEOUT_MS,
  requestTimeoutMs: env.DOCUSIGN_REQUEST_TIMEOUT_MS
});

export async function simulateDocuSignCall(input: SimulatedDocuSignInput): Promise<{ envelopeId: string }> {
  return docuSignCircuitBreaker.execute(async () => {
    await delay(env.DOCUSIGN_SIMULATED_LATENCY_MS);

    if (Math.random() < env.DOCUSIGN_SIMULATED_FAILURE_RATE) {
      throw new Error(`DocuSign simulated failure for document ${input.documentId}`);
    }

    return {
      envelopeId: `sim-${input.batchId}-${input.userId}`
    };
  });
}

export function getDocuSignCircuitBreakerState() {
  return docuSignCircuitBreaker.getSnapshot();
}
