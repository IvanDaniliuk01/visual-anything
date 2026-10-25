/** The import phases of the benchmark read and prepare each of their files, and time it. */
import { describe, expect, it } from 'vitest';
import { importPhases } from './imports';
import { syntheticProject } from './synthetic';

describe('importPhases', () => {
  it('reads and prepares each file, once each when asked once', { timeout: 120_000 }, () => {
    const phases = importPhases(syntheticProject({ elements: 60 }), 1);
    expect(phases.map((phase) => [phase.name, phase.steps.length])).toEqual([
      ['Import: read a 1,000-node flowchart', 1],
      ['Import: prepare a 1,000-node flowchart', 1],
      ['Import: read a 10,000-node flowchart', 1],
      ['Import: prepare a 10,000-node flowchart', 1],
      ['Import: read a 10,000-row spreadsheet', 1],
      ['Import: prepare a 10,000-row spreadsheet', 1],
    ]);
    for (const step of phases.flatMap((phase) => phase.steps)) {
      expect(step.total).toBeGreaterThan(0);
    }
  });
});
