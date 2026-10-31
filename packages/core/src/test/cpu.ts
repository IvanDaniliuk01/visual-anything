/**
 * The time this process has spent running, in milliseconds, where tests run in Node; the clock
 * elsewhere. A loaded machine stretches the clock while a test waits for a turn, but not this, so
 * budget tests measured with it fail for slow code and not for a busy machine.
 */
export function cpuNow(): number {
  const usage = (
    globalThis as { process?: { cpuUsage?: () => { user: number; system: number } } }
  ).process?.cpuUsage?.();
  return usage === undefined ? Date.now() : (usage.user + usage.system) / 1000;
}

/**
 * A stopwatch for budget tests: the time since it started, as the least of the clock and the time
 * this process spent running. A loaded machine stretches the clock, but not the process's time; the
 * process's time counts every thread of it, the garbage collector's helpers included, which the clock
 * does not. What the code under test spent on its own thread is at most either (as `app/src/test/cpu.ts`).
 */
export function stopwatch(): () => number {
  const cpu = cpuNow();
  const wall = typeof performance === 'undefined' ? Date.now() : performance.now();
  const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
  return () => Math.min(cpuNow() - cpu, now() - wall);
}
