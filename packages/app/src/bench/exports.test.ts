// @vitest-environment node
// In Node: the phase writes a PDF, as the command line does.
import { describe, expect, it } from 'vitest';
import { measureExports } from './exports';
import { syntheticProject } from './synthetic';

describe('measureExports', () => {
  it('writes each format of the synthetic view, the PDF once, and measures time and size', async () => {
    let clock = 0;
    const { sceneMs, measures } = await measureExports(
      syntheticProject({ elements: 60 }),
      'everything',
      { runs: 3, now: () => (clock += 10) },
    );
    expect(sceneMs).toBe(10);
    expect(measures.map((measure) => measure.format)).toEqual([
      'svg',
      'pdf',
      'md',
      'mermaid',
      'structurizr',
    ]);
    for (const measure of measures) {
      expect(measure.times).toHaveLength(measure.format === 'pdf' ? 1 : 3);
      expect(measure.p50).toBe(10);
      expect(measure.size).toBeGreaterThan(1000);
    }
  }, 60_000);
});
