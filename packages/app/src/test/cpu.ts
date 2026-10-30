/**
 * The time this process has spent running, in milliseconds, where tests run in Node; the clock
 * elsewhere. A loaded machine stretches the clock while a test waits for a turn, but not this, so
 * budget tests measured with it fail for slow code and not for a busy machine.
 */
export function cpuNow(): number {
  const { process } = globalThis as {
    process?: { cpuUsage?: () => { user: number; system: number } };
  };
  const usage = process?.cpuUsage?.();
  return usage === undefined ? performance.now() : (usage.user + usage.system) / 1000;
}

/**
 * A stopwatch for budget tests: the time since it started, as the least of the clock and the time
 * this process spent running. A loaded machine stretches the clock while a test waits for a turn, but
 * not the process's time. The process's time counts every thread of it, the garbage collector's
 * helpers and the compiler's included, and Windows counts each in steps of 15.6 ms, so one collection
 * that runs on eight threads during a move of 3 ms reads as 78 ms of it; the clock does not count
 * those. What the code under test spent on its own thread is at most either.
 */
export function stopwatch(): () => number {
  const cpu = cpuNow();
  const wall = performance.now();
  return () => Math.min(cpuNow() - cpu, performance.now() - wall);
}
