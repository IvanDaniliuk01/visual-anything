/**
 * Times typesetting 10,000 distinct formulas in Node (A9.5), as the command line's exports and Claude's
 * tools typeset them: `pnpm exec tsx packages/app/src/bench/math-typeset.ts`. It typesets them twice,
 * each time formulas none of which was typeset before: first as a program that has just started, then
 * once KaTeX and the layout have run. Recorded, never held.
 */
import { performance } from 'node:perf_hooks';
import { typesetDistinct, type TypesetTiming } from './math';

const COUNT = 10_000;

function summary(name: string, timing: TypesetTiming): string {
  const sorted = [...timing.each].sort((a, b) => a - b);
  const at = (share: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
  return `${name}: ${timing.count.toLocaleString('en')} formulas in ${timing.total.toFixed(0)} ms, ${(timing.total / timing.count).toFixed(3)} ms each on average, p50 ${at(0.5)?.toFixed(3)} ms, p95 ${at(0.95)?.toFixed(3)} ms, worst ${sorted.at(-1)?.toFixed(1)} ms; ${timing.failed} failed`;
}

const now = () => performance.now();
console.log(`Node ${process.version}, ${process.platform} ${process.arch}`);
console.log(summary('First run', typesetDistinct(COUNT, 'first', now)));
console.log(summary('Second run', typesetDistinct(COUNT, 'second', now)));
