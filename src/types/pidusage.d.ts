declare module "pidusage" {
  interface ProcessStat {
    cpu: number;
    memory: number;
    ctime: number;
    elapsed: number;
    timestamp: number;
    pid: number;
    ppid: number;
  }

  function pidusage(pid: number): Promise<ProcessStat>;
  function pidusage(pids: number[]): Promise<Record<number, ProcessStat>>;
  namespace pidusage {
    function clear(): Promise<void>;
  }

  export default pidusage;
}
