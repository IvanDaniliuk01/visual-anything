import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../../test/sample';
import { blockGraph, layOut } from '../layout/engine';
import { layoutInput } from '../layout/input';
import { buildScene } from '../scene';

const VIEW = 'system-overview';
const sample = loadSample();

function routed(): ProjectSnapshot {
  const outcome = executeCommand(sample, {
    type: 'set-route',
    view: VIEW,
    relation: 'api-to-reminders',
    from: { kind: 'border', side: 'bottom', at: 0.25 },
    to: { kind: 'border', side: 'top', at: 0.75 },
    bendPoints: [{ x: 40, y: 20 }],
  });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

describe('layout and routes chosen by hand', () => {
  it('gives the ends chosen by hand to layout as fixed ports, and no bend points', () => {
    const project = routed();
    const input = layoutInput(buildScene(project, VIEW), project, { kind: 'view' });
    const relation = input?.relations.find((each) => each.relation === 'api-to-reminders');
    expect(relation).toMatchObject({
      fromPort: { side: 'bottom', at: 0.25 },
      toPort: { side: 'top', at: 0.75 },
    });
    expect(relation).not.toHaveProperty('bendPoints');
    const automatic = input?.relations.find((each) => each.relation === 'api-reads-db');
    expect(automatic).not.toHaveProperty('fromPort');
  });

  it('makes each fixed end a port where it was put, its node keeping the ports in place', () => {
    const graph = blockGraph(
      'level',
      [0, 1],
      new Map([
        [0, { width: 100, height: 60 }],
        [1, { width: 100, height: 60 }],
      ]),
      () => undefined,
      [{ u: 0, v: 1, uDirect: true, vDirect: true, uPort: { side: 'bottom', at: 0.25 } }],
    );
    const [first, second] = graph.children ?? [];
    expect(first?.layoutOptions).toEqual({ 'elk.portConstraints': 'FIXED_POS' });
    expect(first?.ports).toEqual([
      {
        id: 's0@bottom 0.25',
        x: 25,
        y: 60,
        width: 0,
        height: 0,
        layoutOptions: { 'elk.port.side': 'SOUTH' },
      },
    ]);
    expect(second?.ports).toBeUndefined();
    expect(graph.edges).toEqual([{ id: 'e0', sources: ['s0@bottom 0.25'], targets: ['s1'] }]);
  });

  it('lays a view out with them, and leaves the routes as they were', async () => {
    const project = routed();
    const input = layoutInput(buildScene(project, VIEW), project, { kind: 'view' });
    if (!input) throw new Error('Nothing to lay out.');
    const result = await layOut(input, new ELK());
    expect(result.shapes.length).toBeGreaterThan(0);
    expect(project.views[0]?.routes?.['api-to-reminders']).toBeDefined();
  });
});
