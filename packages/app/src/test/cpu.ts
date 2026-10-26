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
