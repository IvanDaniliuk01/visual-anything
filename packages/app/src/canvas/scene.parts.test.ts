/**
 * The scene's seam for shapes beyond boxes (M8b, ADR 0066, ADR 0067, ADR 0069): free geometry and
 * named parts as each shape's own outline, drawings with parts with their pictures and anchored
 * parts, and every line's style, automatic ones included.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { FRAME, beyondBoxes } from '../test/beyond';
import { shapeBorderPoint, shapeHolds } from './outlines';
import { buildScene, buildSceneAfresh, type ElementShape, type Scene } from './scene';

const VIEW = 'anatomy';
const project = () => beyondBoxes(VIEW);

function shapeOf(scene: Scene, key: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.key === key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

function changed(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

describe('a drawing with parts (ADR 0067)', () => {
  it('draws its picture under its header, at a unit per unit of the image', () => {
    const body = shapeOf(buildScene(project(), VIEW), 'body');
    expect(body.picture).toEqual({ rect: { x: 24, y: 48, width: 300, height: 100 }, scale: 1 });
    expect(body.image).toMatchObject({ placement: 'parts', rect: body.picture?.rect });
    expect(body.holdsContents).toBe(true);
    expect(body.rect.width).toBeGreaterThanOrEqual(300 + 48);
  });

  it('places each anchored part in its part’s place, the first content for each part', () => {
    const scene = buildScene(project(), VIEW);
    const left = shapeOf(scene, 'body/left');
    expect(left.rect).toEqual({ x: 34, y: 58, width: 80, height: 80 });
    expect(left.part).toEqual({
      image: 'anatomy.organs',
      part: 'left',
      color: '#C0392B',
      inDrawing: true,
    });
    expect(left.positioned).toBe('placed');
    expect(left.outline).toBeDefined();
    // What an anchored part holds is not drawn, as a row's is not.
    expect(left.undrawn).toEqual(['inner']);
    expect(scene.shapes.some((shape) => shape.element === 'inner')).toBe(false);
    expect(shapeOf(scene, 'body/right').rect).toEqual({ x: 134, y: 58, width: 80, height: 80 });
    // A second content naming the same part, and one naming none, are placed below the picture.
    for (const key of ['body/twin', 'body/extra']) {
      const shape = shapeOf(scene, key);
      expect(shape.part).toBeUndefined();
      expect(shape.rect.y).toBeGreaterThanOrEqual(48 + 100 + 40);
    }
  });

  it('fits its picture to the body of the size the view stores', () => {
    const sized = changed(project(), {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'body', x: 0, y: 0, width: 198, height: 400 }],
    });
    const scene = buildScene(sized, VIEW);
    expect(shapeOf(scene, 'body').picture).toEqual({
      rect: { x: 24, y: 48, width: 150, height: 50 },
      scale: 0.5,
    });
    expect(shapeOf(scene, 'body/left').rect).toEqual({ x: 29, y: 53, width: 40, height: 40 });
    expect(scene).toEqual(buildSceneAfresh(sized, VIEW));
  });

  it('draws its anchored parts in its picture’s order, whatever the stacking order', () => {
    const stacked = changed(project(), {
      type: 'restack',
      view: VIEW,
      moves: [{ shape: { element: 'left', container: 'body' }, to: 'back' }],
    });
    for (const state of [project(), stacked]) {
      const scene = buildScene(state, VIEW);
      const drawn = (scene.drawing ?? scene.shapes.map((_, at) => at)).map(
        (at) => (scene.shapes[at] as ElementShape).key,
      );
      expect(drawn.indexOf('body/left')).toBeLessThan(drawn.indexOf('body/right'));
      expect(drawn.indexOf('body')).toBeLessThan(drawn.indexOf('body/left'));
    }
  });

  it('keeps its parts’ outlines as it moves, and equals a scene built from nothing', () => {
    const state = project();
    const before = buildScene(state, VIEW);
    const moved = changed(state, {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'body', x: 40, y: 20 }],
    });
    const after = buildScene(moved, VIEW);
    expect(after).toEqual(buildSceneAfresh(moved, VIEW));
    const left = shapeOf(after, 'body/left');
    expect(left.rect).toEqual({ x: 74, y: 78, width: 80, height: 80 });
    expect(left.outline).toBe(shapeOf(before, 'body/left').outline);
    expect(shapeOf(after, 'body').picture?.rect).toEqual({ x: 64, y: 68, width: 300, height: 100 });
  });

  it('draws a content as an ordinary one once its drawing shows its image otherwise', () => {
    const plain = changed(project(), {
      type: 'update-element',
      id: 'body',
      changes: { appearance: { image: { image: 'anatomy.organs', placement: 'icon' } } },
    });
    const scene = buildScene(plain, VIEW);
    expect(shapeOf(scene, 'body').picture).toBeUndefined();
    // One that names its image is drawn as its part on its own; one that names none, as its kind.
    expect(shapeOf(scene, 'body/left').part?.inDrawing).toBe(false);
    expect(shapeOf(scene, 'body/right').part).toBeUndefined();
    expect(shapeOf(scene, 'body/left/inner')).toBeDefined();
    expect(scene).toEqual(buildSceneAfresh(plain, VIEW));
  });
});

describe('a shape’s own outline (ADR 0066, ADR 0067)', () => {
  it('fits free geometry to the shape, holding by its outline and leaving its hole', () => {
    const framed = shapeOf(buildScene(project(), VIEW), 'framed');
    expect(framed.rect).toEqual({ x: 800, y: 300, width: 200, height: 100 });
    expect(framed.outline?.fitted.width).toBe(200);
    expect(shapeHolds(framed, { x: 810, y: 310 })).toBe(true);
    // The hole, and a point beside the outline, find what lies behind.
    expect(shapeHolds(framed, { x: 900, y: 350 })).toBe(false);
    expect(shapeHolds(framed, { x: 900, y: 350 }, 0.5)).toBe(false);
    const exit = shapeBorderPoint(framed, { x: 810, y: 350 }, { x: 2000, y: 350 });
    expect(exit.x).toBeCloseTo(1000, 6);
    expect(exit.y).toBeCloseTo(350, 6);
  });

  it('draws a part on its own with its part’s outline, its proportions kept', () => {
    const loose = shapeOf(buildScene(project(), VIEW), 'loose');
    expect(loose.part).toEqual({
      image: 'anatomy.organs',
      part: 'ring',
      color: '#27AE60',
      inDrawing: false,
    });
    const { rect } = loose;
    const side = Math.min(rect.width, rect.height);
    const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    expect(shapeHolds(loose, middle)).toBe(false);
    expect(shapeHolds(loose, { x: middle.x - side * 0.4, y: middle.y })).toBe(true);
    // Outside its outline, inside its box.
    if (rect.width > rect.height)
      expect(shapeHolds(loose, { x: rect.x + 1, y: middle.y })).toBe(false);
  });

  it('draws geometry that is not geometry as its kind, and a part without its image as its kind outside a drawing', () => {
    const state = project();
    const broken: ProjectSnapshot = {
      ...state,
      model: {
        ...state.model,
        elements: state.model.elements.map((each) =>
          each.id === 'framed'
            ? { ...each, appearance: { geometry: { ...FRAME, outline: [] } } }
            : each.id === 'loose'
              ? { ...each, appearance: { part: { part: 'ring' } } }
              : each,
        ),
      },
    };
    const scene = buildScene(broken, VIEW);
    expect(shapeOf(scene, 'framed').outline).toBeUndefined();
    expect(shapeOf(scene, 'loose').outline).toBeUndefined();
    expect(shapeOf(scene, 'loose').part).toBeUndefined();
  });
});

describe('every line’s style (ADR 0069)', () => {
  const line = (scene: Scene, id: string) => scene.relations.find((each) => each.relation === id);

  it('takes the view’s style, then the relation type’s, and routes automatic curves as curves', () => {
    expect(line(buildScene(project(), VIEW), 'tie')?.style).toBeUndefined();
    const curved = changed(project(), {
      type: 'update-view',
      id: VIEW,
      changes: { routeStyle: 'curved' },
    });
    const scene = buildScene(curved, VIEW);
    const tie = line(scene, 'tie');
    expect(tie?.style).toBe('curved');
    expect(tie?.curve?.length).toBe(1);
    expect(tie?.hand).toBeUndefined();
    expect(scene).toEqual(buildSceneAfresh(curved, VIEW));
    const straight = changed(curved, {
      type: 'set-relation-type-appearance',
      relationType: 'anatomy.flows',
      appearanceTraits: { route: 'straight' },
    });
    const drawn = line(buildScene(straight, VIEW), 'tie');
    expect(drawn?.style).toBe('straight');
    expect(drawn?.route).toHaveLength(2);
  });

  it('routes the lines again when the view’s style changes', () => {
    const state = project();
    const before = buildScene(state, VIEW);
    const curved = changed(state, {
      type: 'update-view',
      id: VIEW,
      changes: { routeStyle: 'curved' },
    });
    const after = buildScene(curved, VIEW);
    expect(line(after, 'tie')).not.toBe(line(before, 'tie'));
    expect(after).toEqual(buildSceneAfresh(curved, VIEW));
  });
});
