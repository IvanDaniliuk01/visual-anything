/**
 * Connection points reach layout from the resolved appearance (interface I3). Until the core resolves
 * them, `appearanceOf` here stands in for it, giving Services an in and an out point.
 */
import type * as Core from '@visual-anything/core';
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it, vi } from 'vitest';
import { loadSample } from '../../test/sample';
import { buildScene } from '../scene';
import { blockGraph } from './engine';
import { layoutInput } from './input';

const POINTS = [
  { name: 'in', side: 'left', at: 0.5 },
  { name: 'out', side: 'right', at: 0.5 },
];

vi.mock('@visual-anything/core', async (original) => {
  const core = await original<typeof Core>();
  return {
    ...core,
    appearanceOf: (...args: Parameters<typeof Core.appearanceOf>) => {
      const resolved = core.appearanceOf(...args);
      return args[0].component === 'systems.service'
        ? { ...resolved, connectionPoints: POINTS }
        : resolved;
    },
  };
});

describe('connection points in the layout input', () => {
  const sample = loadSample();
  const scene = buildScene(sample, 'system-overview');

  it('gives a free shape the connection points its appearance sets, and others none', () => {
    const input = layoutInput(scene, sample, { kind: 'view' });
    const of = (element: string) => input?.shapes.find((shape) => shape.element === element);
    expect(of('appointments-api')?.points).toEqual(POINTS);
    expect(of('whatsapp')?.points).toBeUndefined();
  });

  it('becomes ELK ports that the relations end on', async () => {
    const input = layoutInput(scene, sample, { kind: 'view' });
    if (!input) throw new Error('Nothing to lay out.');
    const api = input.shapes.findIndex((shape) => shape.element === 'appointments-api');
    const reminders = input.shapes.findIndex((shape) => shape.element === 'reminder-service');
    const size = { width: 180, height: 72 };
    const graph = blockGraph(
      'scheduling',
      [api, reminders],
      new Map([
        [api, size],
        [reminders, size],
      ]),
      (node) => input.shapes[node]?.points,
      [{ u: api, v: reminders, uDirect: true, vDirect: true }],
    );
    expect(graph.edges).toEqual([
      { id: 'e0', sources: [`s${api}:1`], targets: [`s${reminders}:0`] },
    ]);
    // ELK lays it out with its ports where they are: out on the right, in on the left.
    const laid = await new ELK().layout(graph);
    const ports = laid.children?.flatMap((child) => child.ports ?? []) ?? [];
    // ELK may write a zero as -0.
    expect(ports.map((port) => [port.id, (port.x ?? 0) + 0, (port.y ?? 0) + 0])).toEqual([
      [`s${api}:1`, 180, 36],
      [`s${reminders}:0`, 0, 36],
    ]);
  });
});
