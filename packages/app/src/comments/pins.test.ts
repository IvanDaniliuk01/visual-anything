import type { CommentAnchor, CommentFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { buildScene, relationLinesOf, shownBy } from '../canvas/scene';
import { loadSample } from '../test/sample';
import { pinsOf } from './pins';

const VIEW = 'system-overview';
const sample = loadSample();
const scene = buildScene(sample, VIEW);

function thread(id: string, anchor: CommentAnchor, resolved = false): CommentFile {
  return {
    id,
    anchor,
    ...(resolved ? { resolved: true } : {}),
    comments: [{ id: 'c', author: { kind: 'claude' }, time: '2026-10-25T10:00:00Z', text: 'x' }],
  };
}

describe('pinsOf', () => {
  it('pins an element on its first shape’s top right corner, and threads about it share the pin', () => {
    const shape = shownBy(scene, 'patient');
    if (!shape) throw new Error('The sample draws no patient.');
    const pins = pinsOf(scene, VIEW, [
      thread('a', { kind: 'element', element: 'patient' }),
      thread('b', { kind: 'element', element: 'patient' }, true),
    ]);
    expect(pins).toEqual([
      {
        key: `shape:${shape.key}`,
        at: { x: shape.rect.x + shape.rect.width, y: shape.rect.y },
        threads: [
          expect.objectContaining({ id: 'a' }),
          expect.objectContaining({ id: 'b' }),
        ] as unknown,
        resolved: false,
      },
    ]);
  });

  it('pins a relation at its line’s middle, and a point where it is', () => {
    const line = relationLinesOf(scene).get('agent-to-api');
    if (!line) throw new Error('The sample draws no agent-to-api.');
    const pins = pinsOf(scene, VIEW, [
      thread('r', { kind: 'relation', relation: 'agent-to-api' }, true),
      thread('p', { kind: 'point', view: VIEW, x: 12, y: -30 }),
    ]);
    expect(pins.map((pin) => [pin.key, pin.at, pin.resolved])).toEqual([
      ['line:agent-to-api', line.middle, true],
      ['point:p', { x: 12, y: -30 }, false],
    ]);
  });

  it('pins nothing for a view, another view’s point, what is gone or what the filters hide', () => {
    const shape = shownBy(scene, 'patient');
    expect(
      pinsOf(
        scene,
        VIEW,
        [
          thread('v', { kind: 'view', view: VIEW }),
          thread('o', { kind: 'point', view: 'other', x: 0, y: 0 }),
          thread('g', { kind: 'element', element: 'gone' }),
          thread('h', { kind: 'element', element: 'patient' }),
          thread('l', { kind: 'relation', relation: 'agent-to-api' }),
        ],
        new Set([shape?.key ?? '', 'agent-to-api']),
      ),
    ).toEqual([]);
  });
});
