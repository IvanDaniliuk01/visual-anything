/**
 * What an emphasis does to a scene is the same whether a small highlight's shapes and lines are
 * found by their keys, as the canvas finds them with its indexed scene, or by going through every
 * shape and line (A4): the same shapes and lines, in the scene's order, aggregated lines and their
 * ends, hidden ones and markers included.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { loadSample } from '../test/sample';
import { emphasize } from './emphasize';
import { indexScene } from './hit';
import { buildScene, type Scene } from './scene';

const sample = loadSample();
const VIEW = 'system-overview';

/** The sample's overview with a system collapsed, so that some of its lines are aggregated. */
function collapsed(): Scene {
  const project: ProjectSnapshot = {
    ...sample,
    views: sample.views.map((each) =>
      each.id === VIEW ? { ...each, collapsed: ['scheduling'] } : each,
    ),
  };
  return buildScene(project, VIEW);
}

/** Every key an emphasis may name in a scene: shapes, lines, the relations they stand for, free shapes. */
function keysOf(scene: Scene): string[] {
  return [
    ...scene.shapes.map((shape) => shape.key),
    ...scene.relations.flatMap((line) => [line.relation, ...(line.aggregate?.relations ?? [])]),
    ...scene.notes.map((note) => note.id),
    ...scene.arrows.map((arrow) => arrow.id),
    'not-in-the-scene',
  ];
}

describe('an emphasis found by keys', () => {
  for (const [name, scene] of [
    ['the sample, collapsed', collapsed()],
    ['the synthetic view', buildScene(syntheticProject({ elements: 400 }), 'everything')],
  ] as const) {
    it(`does to ${name} what going through every shape and line does`, () => {
      const keys = keysOf(scene);
      const { indexOfKey } = indexScene(scene);
      const some = fc.uniqueArray(fc.constantFrom(...keys), { maxLength: 6 });
      fc.assert(
        fc.property(some, some, some, (highlighted, hidden, moving) => {
          const emphasis = {
            highlighted: new Set(highlighted),
            hidden: new Set(hidden),
            markers: moving.map((relation) => ({ relation, progress: 0.5 })),
          };
          expect(emphasize(scene, emphasis, indexOfKey)).toEqual(emphasize(scene, emphasis));
        }),
        { numRuns: 200 },
      );
    });
  }
});
