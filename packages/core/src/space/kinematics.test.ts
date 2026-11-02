/**
 * Joints move what they carry (ADR 0090): a robot of two joints in a chain, each turning about its
 * axis through its origin everything attached below it, at any depth; positions kept within limits,
 * given over the joints' own, and warned about past them; attachments in a cycle followed by none.
 */
import type { Element, PackageFile } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { builtinPackage } from '../builtin';
import { checkProject } from '../check';
import type { ProjectSnapshot } from '../snapshot';
import { kinematicsWarnings, jointMotionOf } from './kinematics';
import { transformPoint } from './math';
import { spaceOf } from './space';
import { definitionsIn } from '../state';

const PHYSICAL_AI = builtinPackage('physical-ai') as PackageFile;

const part = (id: string, component: string, x: number, more: Partial<Element> = {}): Element => ({
  id,
  component: `physical-ai.${component}`,
  name: id,
  pose: { in: 'robot', at: { x, y: 1, z: 0 } },
  ...more,
});

const joint = (id: string, x: number, attributes: Element['attributes'] = {}) =>
  part(id, 'joint', x, {
    attributes: {
      kind: 'revolute',
      axis: '0 0 1',
      lowerLimit: -170,
      upperLimit: 170,
      ...attributes,
    },
  });

/**
 * A robot in World at its origin; its base at x 0, joint 1 at x 0 on the base, link 1 at x 1 on joint
 * 1, joint 2 at x 2 on link 1, and link 2 at x 3 on joint 2, all at y 1, each turning about +Z.
 */
function robot(positions: { j1?: number; j2?: number } = {}): ProjectSnapshot {
  const partOf = (from: string) => ({
    id: `${from}-in-robot`,
    relationType: 'physical-ai.is-part-of',
    from,
    to: 'robot',
  });
  const attached = (from: string, to: string) => ({
    id: `${from}-on-${to}`,
    relationType: 'physical-ai.is-attached-to',
    from,
    to,
  });
  return {
    project: { schemaVersion: 1, name: 'Arm', packages: ['physical-ai'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        {
          id: 'robot',
          component: 'physical-ai.robot',
          name: 'Robot',
          pose: { at: { x: 0, y: 0, z: 0 } },
        },
        part('base', 'link', 0),
        joint('j1', 0, positions.j1 === undefined ? {} : { position: positions.j1 }),
        part('l1', 'link', 1),
        joint('j2', 2, positions.j2 === undefined ? {} : { position: positions.j2 }),
        part('l2', 'link', 3),
      ],
      relations: [
        ...['base', 'j1', 'l1', 'j2', 'l2'].map(partOf),
        attached('j1', 'base'),
        attached('l1', 'j1'),
        attached('j2', 'l1'),
        attached('l2', 'j2'),
      ],
    },
    packages: [PHYSICAL_AI],
    views: [],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

const at = (project: ProjectSnapshot, id: string, positions?: ReadonlyMap<string, number>) => {
  const entry = spaceOf(project, undefined, undefined, positions).entries.get(id);
  if (!entry) throw new Error(`${id} is not in space`);
  const p = transformPoint(entry.matrix, { x: 0, y: 0, z: 0 });
  const round = (value: number) => Math.round(value * 1e6) / 1e6 + 0;
  return { x: round(p.x), y: round(p.y), z: round(p.z) };
};

describe('forward kinematics', () => {
  it('leaves everything where it is posed while every joint is at 0', () => {
    const project = robot();
    expect(at(project, 'l2')).toEqual({ x: 3, y: 1, z: 0 });
    expect(spaceOf(project).motions).toBeUndefined();
  });

  it('turns what a joint carries about its axis through its origin, at any depth', () => {
    const project = robot({ j1: 90 });
    expect(at(project, 'base')).toEqual({ x: 0, y: 1, z: 0 });
    expect(at(project, 'j1')).toEqual({ x: 0, y: 1, z: 0 });
    expect(at(project, 'l1')).toEqual({ x: 0, y: 2, z: 0 });
    expect(at(project, 'j2')).toEqual({ x: 0, y: 3, z: 0 });
    expect(at(project, 'l2')).toEqual({ x: 0, y: 4, z: 0 });
    const space = spaceOf(project);
    expect([...(space.motions?.keys() ?? [])].sort()).toEqual(['j2', 'l1', 'l2']);
  });

  it('composes joints down the chain, each carrying the axes of those below it', () => {
    expect(at(robot({ j2: 90 }), 'l2')).toEqual({ x: 2, y: 2, z: 0 });
    expect(at(robot({ j1: 90, j2: 90 }), 'l2')).toEqual({ x: -1, y: 3, z: 0 });
  });

  it('takes positions given over the joints’ own, as sliders and tours give them', () => {
    const project = robot({ j1: 90 });
    expect(at(project, 'l2', new Map([['j1', 0]]))).toEqual({ x: 3, y: 1, z: 0 });
    expect(at(project, 'l2', new Map([['j2', 90]]))).toEqual({ x: -1, y: 3, z: 0 });
  });

  it('draws a position past its limits at the nearest one, and warns about it', () => {
    const project = robot({ j1: 200 });
    const definitions = definitionsIn(project);
    const j1 = project.model.elements.find((each) => each.id === 'j1') as Element;
    expect(jointMotionOf(j1, definitions)?.position).toBe(170);
    expect(kinematicsWarnings(project).map((each) => each.code)).toEqual(['joint-out-of-limits']);
    expect(checkProject(project).warnings.map((each) => each.code)).toContain(
      'joint-out-of-limits',
    );
  });

  it('moves nothing for a fixed joint or one without an axis it can read', () => {
    const fixed = robot({ j1: 90 });
    const j1 = fixed.model.elements.find((each) => each.id === 'j1') as Element;
    j1.attributes = { ...j1.attributes, kind: 'fixed' };
    expect(at(fixed, 'l2')).toEqual({ x: 3, y: 1, z: 0 });
    j1.attributes = { ...j1.attributes, kind: 'revolute', axis: 'up' };
    expect(at(fixed, 'l2')).toEqual({ x: 3, y: 1, z: 0 });
  });

  it('slides what a prismatic joint carries along its axis', () => {
    const project = robot();
    const j2 = project.model.elements.find((each) => each.id === 'j2') as Element;
    j2.attributes = {
      kind: 'prismatic',
      axis: '0 1 0',
      lowerLimit: 0,
      upperLimit: 1,
      position: 0.5,
    };
    expect(at(project, 'l2')).toEqual({ x: 3, y: 1.5, z: 0 });
  });

  it('follows no attachment of a cycle, and warns about it', () => {
    const project = robot({ j1: 90 });
    project.model.relations.push({
      id: 'base-on-l2',
      relationType: 'physical-ai.is-attached-to',
      from: 'base',
      to: 'l2',
    });
    expect(kinematicsWarnings(project).map((each) => each.code)).toContain('attachment-cycle');
    expect(() => spaceOf(project)).not.toThrow();
  });

  it('keeps the distance between consecutive parts of the chain, whatever the positions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -170, max: 170 }),
        fc.integer({ min: -170, max: 170 }),
        (j1, j2) => {
          const project = robot({ j1, j2 });
          const distance = (a: string, b: string) => {
            const p = at(project, a);
            const q = at(project, b);
            return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
          };
          expect(distance('j1', 'l1')).toBeCloseTo(1, 5);
          expect(distance('l1', 'j2')).toBeCloseTo(1, 5);
          expect(distance('j2', 'l2')).toBeCloseTo(1, 5);
          expect(distance('j1', 'l2')).toBeLessThanOrEqual(3 + 1e-6);
        },
      ),
      { numRuns: 100 },
    );
  });
});
