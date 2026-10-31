import type { ProjectSnapshot } from '@visual-anything/core';
import type { Element, Pose } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { workcell } from '../../test/space';
import {
  degreesOfPose,
  placedPose,
  poseContainersOf,
  poseInWorldWhereItWas,
  poseMeasuredFrom,
  poseStatusOf,
  poseWithAt,
  poseWithDegrees,
} from './pose';

const elementOf = (project: ProjectSnapshot, id: string): Element => {
  const found = project.model.elements.find((each) => each.id === id);
  if (!found) throw new Error(`no element ${id}`);
  return found;
};

/** The workcell with each element's pose replaced as given, `null` taking it away. */
function withPoses(project: ProjectSnapshot, poses: Record<string, Pose | null>): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.map((each) => {
        if (!(each.id in poses)) return each;
        const pose = poses[each.id];
        const rest = { ...each };
        delete rest.pose;
        return pose === null || pose === undefined ? rest : { ...rest, pose };
      }),
    },
  };
}

/** The workcell with a cup inside the table, and without the relations named. */
function withCup(project: ProjectSnapshot, without: readonly string[] = []): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      elements: [...project.model.elements, { id: 'cup', component: 'cell.thing', name: 'Cup' }],
      relations: [
        ...project.model.relations.filter((each) => !without.includes(each.id)),
        { id: 'cup-in-table', relationType: 'cell.inside', from: 'cup', to: 'table' },
      ],
    },
  };
}

describe('where the Pose section says an element is', () => {
  it('says World is what physical space is measured from', () => {
    const project = workcell();
    expect(poseStatusOf(project, project.model.world)).toEqual({ kind: 'world' });
  });

  it('says what an element is posed in, and whether that is in physical space under World', () => {
    const project = workcell();
    expect(poseStatusOf(project, elementOf(project, 'table'))).toEqual({
      kind: 'posed',
      pose: { at: { x: 0, y: 0, z: 0 } },
      in: 'world',
      inWorld: true,
    });
    expect(poseStatusOf(project, elementOf(project, 'camera'))).toMatchObject({
      kind: 'posed',
      in: 'table',
      inWorld: true,
    });
    const tableOut = withPoses(project, { table: null });
    expect(poseStatusOf(tableOut, elementOf(tableOut, 'camera'))).toMatchObject({
      kind: 'posed',
      in: 'table',
      inWorld: false,
    });
  });

  it('says which part of which solid an anchored element is, and where that part is', () => {
    const project = workcell();
    expect(poseStatusOf(project, elementOf(project, 'elbow'))).toEqual({
      kind: 'anchored',
      in: 'arm',
      part: 'elbow',
      solid: 'Arm',
      at: { x: 0, y: 1, z: 0 },
    });
    // Also while its container is in no place, and with a pose of its own, kept and not used.
    const unposed = withPoses(workcell({ posed: false }), { elbow: { at: { x: 5, y: 0, z: 0 } } });
    expect(poseStatusOf(unposed, elementOf(unposed, 'elbow'))).toMatchObject({
      kind: 'anchored',
      in: 'arm',
      pose: { at: { x: 5, y: 0, z: 0 } },
    });
  });

  it('says a pose whose container no longer holds it is not used', () => {
    const project = workcell();
    const gone = { ...project, model: { ...project.model, relations: [] } };
    expect(poseStatusOf(gone, elementOf(gone, 'camera'))).toEqual({
      kind: 'unusable',
      pose: { in: 'table', at: { x: 0, y: 0.8, z: 0 } },
      in: 'table',
    });
  });

  it('says an element with neither a pose nor a part is not in physical space', () => {
    const project = workcell();
    expect(poseStatusOf(project, elementOf(project, 'lamp'))).toEqual({ kind: 'none' });
    expect(poseStatusOf(project, elementOf(project, 'spare'))).toEqual({ kind: 'none' });
  });
});

describe('the poses the Pose section sends', () => {
  const shifted = () =>
    withPoses(workcell(), {
      table: { at: { x: 1, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    });

  it('offers World and the element’s containers to measure it from', () => {
    expect(poseContainersOf(workcell(), 'camera')).toEqual(['world', 'table']);
    expect(poseContainersOf(workcell(), 'lamp')).toEqual(['world']);
  });

  it('keeps an element’s place when it is measured from another container', () => {
    const project = shifted();
    const camera = elementOf(project, 'camera').pose as Pose;
    expect(poseMeasuredFrom(project, 'camera', camera, 'world')).toEqual({
      pose: { at: { x: 1, y: 0.8, z: 0 } },
      kept: true,
    });
  });

  it('keeps its numbers when what it is measured from is not in physical space', () => {
    const project = withPoses(workcell(), { table: null });
    const camera = elementOf(project, 'camera').pose as Pose;
    expect(poseMeasuredFrom(project, 'camera', camera, 'world')).toEqual({
      pose: { at: { x: 0, y: 0.8, z: 0 } },
      kept: false,
    });
    const table = withPoses(workcell(), { camera: { at: { x: 0, y: 0.5, z: 0 } }, table: null });
    expect(
      poseMeasuredFrom(table, 'camera', elementOf(table, 'camera').pose as Pose, 'table'),
    ).toEqual({ pose: { in: 'table', at: { x: 0, y: 0.5, z: 0 } }, kept: false });
  });

  it('changes one coordinate, or one angle, and leaves no turn out', () => {
    const pose: Pose = { in: 'table', at: { x: 0, y: 0.8, z: 0 } };
    expect(poseWithAt(pose, 'z', 0.05)).toEqual({ in: 'table', at: { x: 0, y: 0.8, z: 0.05 } });
    const turned = poseWithDegrees(pose, 'z', 90);
    expect(turned.rotation?.z).toBeCloseTo(Math.SQRT1_2, 9);
    expect(turned.rotation?.w).toBeCloseTo(Math.SQRT1_2, 9);
    expect(degreesOfPose(turned).z).toBeCloseTo(90, 9);
    const both = poseWithDegrees(turned, 'x', 30);
    expect(degreesOfPose(both).x).toBeCloseTo(30, 9);
    expect(degreesOfPose(both).z).toBeCloseTo(90, 9);
    expect(poseWithDegrees(turned, 'z', 0)).toEqual(pose);
    expect(poseWithDegrees(turned, 'z', 360)).toEqual(pose);
  });

  it('places an element in its first container in physical space, else in World', () => {
    expect(placedPose(workcell(), 'lamp')).toEqual({ at: { x: 0, y: 0, z: 0 } });
    expect(placedPose(withCup(workcell()), 'cup')).toEqual({
      in: 'table',
      at: { x: 0, y: 0, z: 0 },
    });
    const unposed = withCup(workcell({ posed: false }));
    expect(placedPose(unposed, 'cup')).toEqual({ at: { x: 0, y: 0, z: 0 } });
    // A container the panel shows is in physical space there.
    expect(placedPose(unposed, 'cup', 'table')).toEqual({ in: 'table', at: { x: 0, y: 0, z: 0 } });
  });

  it('poses an element in World where it was, or at the origin when that is not known', () => {
    const project = shifted();
    const gone = { ...project, model: { ...project.model, relations: [] } };
    const camera = elementOf(gone, 'camera').pose as Pose;
    expect(poseInWorldWhereItWas(gone, camera)).toEqual({
      pose: { at: { x: 1, y: 0.8, z: 0 } },
      known: true,
    });
    const turned: Pose = {
      in: 'table',
      at: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 1, w: 0 },
    };
    const unknown = withPoses(gone, { table: null });
    expect(poseInWorldWhereItWas(unknown, turned)).toEqual({
      pose: { at: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 1, w: 0 } },
      known: false,
    });
  });
});
