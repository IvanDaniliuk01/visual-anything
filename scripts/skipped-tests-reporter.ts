/**
 * A Vitest reporter that ends the run with every test it skipped and why, so that the suite says on
 * each system (Windows, macOS, Linux) what it did not check there. A test that depends on the system
 * skips with a reason, as `context.skip('Windows has no FIFOs.')`; one skipped without a reason is
 * listed as such, to be given one.
 */
import type { Reporter, TestModule } from 'vitest/node';

export default class SkippedTestsReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const skipped: string[] = [];
    for (const testModule of testModules) {
      const project = testModule.project.name;
      for (const test of testModule.children.allTests('skipped')) {
        const result = test.result();
        const note = result.state === 'skipped' ? result.note : undefined;
        const where = `${project === '' ? '' : `${project} `}${testModule.relativeModuleId}`;
        skipped.push(`  ${where} > ${test.fullName}\n      ${note ?? 'No reason given.'}`);
      }
    }
    const system = `${process.platform} ${process.arch}, Node.js ${process.versions.node}`;
    if (skipped.length === 0) {
      console.log(`\nNo test was skipped on ${system}.`);
      return;
    }
    console.log(`\n${skipped.length} tests skipped on ${system}:\n${skipped.join('\n')}`);
  }
}
