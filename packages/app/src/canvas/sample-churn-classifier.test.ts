/**
 * The Churn classifier sample (P1 W62) as the canvas lays it out: the layers of its Transformer block
 * drawn as the drawing's named parts (ADR 0067), and every shape with an outline of its own, free
 * geometry or a part, writing its name whole inside itself rather than under it (ADR 0066).
 */
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { labelAreaOn, nameLinesInside, partNameLines, writesNameInside } from './outlined';
import { buildScene } from './scene';

const project = loadSample('churn-classifier');

describe('the Churn classifier sample', () => {
  it('draws the layers of its Transformer block as the parts of its picture', () => {
    const scene = buildScene(project, 'architecture');
    const drawing = scene.shapes.find((shape) => shape.element === 'sequence-encoder');
    expect(drawing?.picture).toBeDefined();
    expect(
      scene.shapes.filter((shape) => shape.part?.inDrawing === true).map((shape) => shape.element),
    ).toEqual([
      'event-embedding',
      'positional-encoding',
      'self-attention',
      'add-norm-1',
      'feed-forward',
      'add-norm-2',
      'encoded-events',
    ]);
    // The forward pass goes upward through the picture: the embedding at its foot, the output on top.
    const top = (id: string) => scene.shapes.find((shape) => shape.element === id)?.rect.y ?? 0;
    expect(top('event-embedding')).toBeGreaterThan(top('self-attention'));
    expect(top('self-attention')).toBeGreaterThan(top('encoded-events'));
  });

  // The pipeline view shows only kinds: its sources, transforms, store and datasets.
  it.each(['architecture', 'training'])(
    'writes every name in %s whole inside its shape',
    (viewId) => {
      const outlined = buildScene(project, viewId).shapes.filter((shape) => shape.outline);
      expect(outlined.length).toBeGreaterThan(0);
      for (const shape of outlined) {
        const outline = shape.outline!;
        const lines =
          shape.part?.inDrawing === true
            ? partNameLines(shape.name, labelAreaOn({ rect: shape.rect, outline }))
            : nameLinesInside({ ...shape, outline });
        expect(lines, `${viewId}: ${shape.element}`).toBeDefined();
        if (shape.part?.inDrawing !== true) {
          expect(writesNameInside(shape), `${viewId}: ${shape.element}`).toBe(true);
        }
      }
    },
  );
});
