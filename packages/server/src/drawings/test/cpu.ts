/**
 * The time this process has spent running, in milliseconds, its worker threads included. A loaded
 * machine stretches the clock while a test waits for a turn, but not this, so budget tests measured
 * with it fail for slow code and not for a busy machine.
 */
export function cpuNow(): number {
  const usage = process.cpuUsage();
  return (usage.user + usage.system) / 1000;
}

/** Runs something and says how much CPU time it took, in milliseconds, with what it gave. */
export function timed<T>(run: () => T): { value: T; took: number } {
  const started = cpuNow();
  const value = run();
  return { value, took: cpuNow() - started };
}
