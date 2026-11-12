/**
 * Explorables in the scene (ADR 0107, A10.3): a loose explorable shape is a picture that names its
 * explorable and the element it is bound to, named after its explorable; an element's shape whose
 * appearance shows one draws it on a plate above its name band, only when it is a plain shape.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../../test/sample';
import { explorableAt } from '../controller';
import { buildScene, buildSceneAfresh, picturesOf } from '../scene';
import { pictureOn } from '../shape-images';

const ID = 'quadratic.parabola';

/** The sample, with the vertex, a plain shape, showing the parabola too. */
function withVertexShowing(project: ProjectSnapshot): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.map((element) =>
        element.id === 'vertex'
          ? { ...element, appearance: { ...element.appearance, explorable: { explorable: ID } } }
          : element,
      ),
    },
  };
}

describe('explorables in the scene', () => {
  it('gives a loose explorable shape as a picture that names its explorable and element', () => {
    const scene = buildSceneAfresh(loadSample('quadratic-function'), 'the-function');
    const loose = picturesOf(scene).find((each) => each.id === 'the-parabola');
    expect(loose).toMatchObject({
      rect: { x: 624, y: 0, width: 480, height: 320 },
      name: 'The parabola of the quadratic function',
      named: true,
      explorable: { id: ID, element: 'quadratic-function' },
    });
    expect(explorableAt({ kind: 'picture', picture: loose! }, { x: 700, y: 10 })).toEqual({
      spot: 'the-parabola',
      explorable: ID,
      element: 'quadratic-function',
    });
  });

  it('draws one on a plain shape’s plate, above its name band, and none on a container', () => {
    const scene = buildSceneAfresh(
      withVertexShowing(loadSample('quadratic-function')),
      'the-function',
    );
    const vertex = scene.shapes.find((shape) => shape.element === 'vertex');
    const shown = vertex?.explorable;
    expect(shown).toMatchObject({ id: ID, placement: 'drawing' });
    expect(pictureOn(vertex!)).toBe(shown);
    expect(vertex?.plate).toBeDefined();
    // The plate lies inside the shape, and its band below the plate.
    const { rect, box, band } = shown!;
    expect(box.x).toBeGreaterThanOrEqual(vertex!.rect.x);
    expect(box.y + box.height).toBeLessThanOrEqual(band!.y + 1e-9);
    expect(rect.width).toBeLessThan(box.width);
    // A double-click on the plate explores it; one on its name band does not.
    const hit = { kind: 'shape' as const, shape: vertex! };
    expect(explorableAt(hit, { x: rect.x + 2, y: rect.y + 2 })).toEqual({
      spot: vertex!.key,
      explorable: ID,
      element: 'vertex',
    });
    expect(explorableAt(hit, { x: band!.x + 2, y: band!.y + band!.height - 1 })).toBeUndefined();
    // The function, a container showing its contents, draws its contents rather than the explorable.
    const function_ = scene.shapes.find((shape) => shape.element === 'quadratic-function');
    expect(function_?.holdsContents).toBe(true);
    expect(function_?.explorable).toBeUndefined();
  });

  it('places it again when its shape moves, as a build from nothing would', () => {
    const project = withVertexShowing(loadSample('quadratic-function'));
    buildScene(project, 'the-function');
    const moved: ProjectSnapshot = {
      ...project,
      views: project.views.map((view) =>
        view.id === 'the-function'
          ? {
              ...view,
              positions: view.positions.map((position) =>
                position.element === 'vertex' ? { ...position, x: position.x + 8 } : position,
              ),
            }
          : view,
      ),
    };
    const vertexOf = (scene: ReturnType<typeof buildScene>) =>
      scene.shapes.find((shape) => shape.element === 'vertex');
    const kept = vertexOf(buildScene(moved, 'the-function'));
    const afresh = vertexOf(buildSceneAfresh(moved, 'the-function'));
    expect(kept?.explorable).toEqual(afresh?.explorable);
    expect(kept?.plate).toEqual(afresh?.plate);
  });
});
