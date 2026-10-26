/**
 * Anchored parts under the pointer and the keys (ADR 0067): dragging one drags its drawing, since its
 * place is the drawing's; the keys step through a drawing's parts in its picture's order, and the
 * outline lists them in that order, before the drawing's other contents.
 */
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, type Selection } from '../editor/selection';
import { outlineOf, type OutlineItem } from '../shell/outlineItems';
import { beyondBoxes } from '../test/beyond';
import { carriedKeys, movingShapes } from './gestures';
import { hitAt, indexScene } from './hit';
import { firstInside, nearestInDirection, partsInOrder, setHidden } from './navigation';
import { buildScene, type ElementShape } from './scene';

const VIEW = 'anatomy';

function selecting(...elements: string[]): Selection {
  return { ...EMPTY_SELECTION, elements: new Set(elements) };
}

function indexed() {
  return indexScene(buildScene(beyondBoxes(), VIEW));
}

function shapeOf(key: string): ElementShape {
  const found = indexed().byKey.get(key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

describe('pressing an anchored part', () => {
  it('finds the part, drawn over its drawing’s picture, and the drawing beside it', () => {
    const scene = indexed();
    const left = shapeOf('body/left');
    const inPart = { x: left.rect.x + left.rect.width / 2, y: left.rect.y + left.rect.height / 2 };
    expect(hitAt(scene, inPart, 0)).toMatchObject({ kind: 'shape', shape: { key: 'body/left' } });
    // On the picture beside every part, the drawing.
    const beside = { x: left.rect.x - 5, y: left.rect.y + 5 };
    expect(hitAt(scene, beside, 0)).toMatchObject({ kind: 'shape', shape: { key: 'body' } });
  });
});

describe('dragging an anchored part', () => {
  it('drags its drawing with parts, with everything in it', () => {
    const scene = indexed();
    const moving = movingShapes(scene, selecting('left'));
    expect(moving.map((shape) => shape.key)).toEqual(['body']);
    expect(carriedKeys(scene, moving)).toEqual(
      new Set(['body', 'body/right', 'body/left', 'body/twin', 'body/extra']),
    );
    // A content below the picture moves on its own.
    expect(movingShapes(scene, selecting('extra')).map((shape) => shape.key)).toEqual([
      'body/extra',
    ]);
  });
});

describe('the keys among anchored parts', () => {
  it('step through a drawing’s parts in its picture’s order', () => {
    const scene = indexed();
    expect(partsInOrder(scene, 'body').map((shape) => shape.key)).toEqual([
      'body/left',
      'body/right',
    ]);
    const left = shapeOf('body/left');
    const right = shapeOf('body/right');
    const from = (shape: ElementShape) => ({ rect: shape.rect, shape });
    expect(nearestInDirection(scene, from(left), 'down')).toEqual({ kind: 'shape', shape: right });
    expect(nearestInDirection(scene, from(right), 'up')).toEqual({ kind: 'shape', shape: left });
    // Past the last part, the keys go on as they do among shapes.
    expect(nearestInDirection(scene, from(right), 'right')).not.toEqual({
      kind: 'shape',
      shape: left,
    });
  });

  it('start a drawing with its first part, and skip what the canvas hides', () => {
    const scene = indexed();
    expect(firstInside(scene, shapeOf('body'))?.key).toBe('body/left');
    setHidden(scene.scene, new Set(['body/left']));
    expect(firstInside(scene, shapeOf('body'))?.key).toBe('body/right');
    setHidden(scene.scene, undefined);
  });
});

describe('the outline of a drawing with parts', () => {
  it('lists its anchored parts first, in its picture’s order, then its other contents', () => {
    const project = beyondBoxes();
    const scene = buildScene(project, VIEW);
    const outline = outlineOf(scene, project, undefined);
    const body = outline.top.find(
      (item): item is Extract<OutlineItem, { kind: 'shape' }> =>
        item.kind === 'shape' && item.shape.key === 'body',
    );
    if (!body) throw new Error('No row for the body.');
    const inside = outline
      .inside(body)
      .flatMap((item) => (item.kind === 'shape' ? [item.shape.key] : []));
    expect(inside).toEqual(['body/left', 'body/right', 'body/twin', 'body/extra']);
  });
});
