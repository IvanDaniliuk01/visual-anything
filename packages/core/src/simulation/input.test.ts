import { describe, expect, it } from 'vitest';
import { testProject } from '../test/fixtures';
import { markableOf, simulateInputAt, simulationInputOf } from './input';

describe('what a tick is given and may mark', () => {
  const project = testProject();

  it('gives the run its parameters, the state before, the tick and its simulated time', () => {
    const base = simulationInputOf(project, 'api');
    expect(base).toBeDefined();
    if (!base) return;
    const input = simulateInputAt(base, {
      parameters: { arrivals: 3 },
      state: { queue: 2 },
      tick: 4,
      tickLength: { length: 0.5, unit: 's' },
    });
    expect(input.context).toMatchObject({
      parameters: { arrivals: 3 },
      state: { queue: 2 },
      tick: 4,
      time: 2,
      unit: 's',
    });
    expect(input.context.relations.map((each) => each.id)).toContain('api-reads-db');
  });

  it('lets a tick mark the element, what lies around it and, given the project, the relations between its contents', () => {
    const base = simulationInputOf(project, 'system');
    if (!base) throw new Error('No system.');
    expect([...markableOf(base)].sort()).toEqual(
      ['api', 'api-in-system', 'db', 'db-in-system', 'system'].sort(),
    );
    expect(markableOf(base, project).has('api-reads-db')).toBe(true);
    // A relation from inside to outside is not between its contents.
    expect(markableOf(base, project).has('client-calls-api')).toBe(false);
  });
});
