/**
 * A small project with solids, for the scene's tests (M9, ADR 0075): an arm drawn with its solid's
 * parts, contents anchored to its named parts and others not; in World, a motor showing the solid as
 * an icon, a part of it drawn on its own, a shape whose appearance shows both an image and the solid,
 * and one naming a solid no package defines. The solid's definition is described from a canonical
 * file, as the program would describe it.
 */
import { readSolid, solidHash, type ProjectSnapshot } from '@visual-anything/core';
import type { Element, PackageFile, Relation, SolidDefinition } from '@visual-anything/schema';
import { boxMesh, writeTestSolid } from '../../../core/src/test/solids';

/** The solid's id. */
export const ARM_ID = 'robotics.arm-k3f9q2';

/** An image of the package, which `pictured` shows beside the solid. */
export const BADGE_ID = 'robotics.badge';

/**
 * An arm of five named parts, in depth-first order: `base` (0), `link` (1) on it, `wrist` (2), which
 * draws nothing of its own, held by the link, `tip` (3) held by the wrist, and `gripper` (4) on the
 * link.
 */
export const ARM_FILE = writeTestSolid({
  nodes: [
    { name: 'base', mesh: 0, children: [1] },
    { name: 'link', mesh: 1, children: [2, 4] },
    { name: 'wrist', children: [3] },
    { name: 'tip', mesh: 2 },
    { name: 'gripper', mesh: 3 },
  ],
  meshes: [
    boxMesh([-0.5, 0, -0.5], [0.5, 0.2, 0.5]),
    boxMesh([-0.1, 0.2, -0.1], [0.1, 1, 0.1]),
    boxMesh([0.3, 1, -0.05], [0.5, 1.1, 0.05]),
    boxMesh([-0.2, 1, -0.05], [0.2, 1.2, 0.05]),
  ],
});

/** The arm's definition, its description read from its file. */
export function armDefinition(id = ARM_ID, bytes?: number): SolidDefinition {
  const read = readSolid(ARM_FILE);
  if (!read.ok) throw new Error(read.problems.map((each) => each.message).join(' '));
  const { bounds, counts, parts, animations } = read.description;
  return {
    id,
    name: 'Arm',
    description: 'A test arm of five parts.',
    hash: solidHash(ARM_FILE),
    bytes: bytes ?? read.bytes,
    bounds,
    counts,
    parts,
    camera: { azimuth: 30, elevation: 20 },
    ...(animations.length > 0 ? { animations } : {}),
  };
}

const NS = 'xmlns="http://www.w3.org/2000/svg"';

function robotics(solids: SolidDefinition[]): PackageFile {
  return {
    id: 'robotics',
    name: 'Robotics',
    components: [
      {
        id: 'robotics.arm',
        name: 'Arm',
        derivesFrom: 'essence',
        appearance: { solid: { solid: ARM_ID, placement: 'parts' } },
      },
      { id: 'robotics.link', name: 'Link', derivesFrom: 'essence' },
      {
        id: 'robotics.motor',
        name: 'Motor',
        derivesFrom: 'essence',
        appearance: { solid: { solid: ARM_ID, placement: 'icon', lighting: 'flat' } },
      },
    ],
    relationTypes: [
      { id: 'robotics.is-part-of', name: 'is part of', derivesFrom: 'relates-to', nests: true },
      { id: 'robotics.drives', name: 'drives', derivesFrom: 'relates-to', direction: 'directed' },
    ],
    images: [
      {
        kind: 'svg',
        id: BADGE_ID,
        name: 'Badge',
        width: 40,
        height: 40,
        svg: `<svg viewBox="0 0 40 40" ${NS}><circle cx="20" cy="20" r="18" fill="#2980B9"/></svg>`,
      },
    ],
    solids,
  };
}

const link = (id: string, appearance?: Element['appearance']): Element => ({
  id,
  component: 'robotics.link',
  name: id,
  ...(appearance ? { appearance } : {}),
});

const inside = (from: string, to: string): Relation => ({
  id: `${from}-in-${to}`,
  relationType: 'robotics.is-part-of',
  from,
  to,
});

/**
 * The arm drawn with its solid's parts: `base`, `link` and `gripper` anchored to its parts, `link` by
 * naming the solid, `wrist` to the part that draws nothing of its own, `twin` naming `base` again and
 * `extra` naming none, both placed below the picture, and `inner` inside `link`, which an anchored
 * part does not draw. In World: `motor`, showing the solid as an icon; `loose`, the gripper drawn on
 * its own; `pictured`, whose appearance shows an image and the solid, as a drawing; and `unknown`,
 * naming a solid no package defines, with an image.
 */
export function withSolids(
  view = 'robot',
  solids: SolidDefinition[] = [armDefinition()],
): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Robot', packages: ['robotics'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'arm', component: 'robotics.arm', name: 'Arm' },
        link('base', { part: { part: 'base' } }),
        link('link', { part: { part: 'link', solid: ARM_ID } }),
        link('gripper', { part: { part: 'gripper' } }),
        link('wrist', { part: { part: 'wrist' } }),
        link('twin', { part: { part: 'base' } }),
        link('extra'),
        link('inner'),
        { id: 'motor', component: 'robotics.motor', name: 'Motor' },
        link('loose', { part: { part: 'gripper', solid: ARM_ID } }),
        link('pictured', {
          image: { image: BADGE_ID, placement: 'drawing' },
          solid: { solid: ARM_ID, placement: 'drawing' },
          width: 200,
          height: 160,
        }),
        link('unknown', {
          image: { image: BADGE_ID, placement: 'icon' },
          solid: { solid: 'robotics.none' },
        }),
      ],
      relations: [
        inside('base', 'arm'),
        inside('link', 'arm'),
        inside('gripper', 'arm'),
        inside('wrist', 'arm'),
        inside('twin', 'arm'),
        inside('extra', 'arm'),
        inside('inner', 'link'),
        { id: 'drives', relationType: 'robotics.drives', from: 'motor', to: 'gripper' },
        { id: 'holds', relationType: 'robotics.drives', from: 'link', to: 'base' },
        { id: 'deep', relationType: 'robotics.drives', from: 'inner', to: 'loose' },
      ],
    },
    packages: [robotics(solids)],
    views: [
      {
        id: view,
        name: 'Robot',
        perspective: { name: 'Structure' },
        nestingRelationTypes: ['robotics.is-part-of'],
        positions: [
          { element: 'arm', x: 0, y: 0 },
          // An anchored part's own position is not used.
          { element: 'base', container: 'arm', x: 999, y: 999 },
          { element: 'motor', x: 800, y: 0 },
          { element: 'loose', x: 800, y: 300 },
          { element: 'pictured', x: 800, y: 600 },
          { element: 'unknown', x: 1100, y: 0 },
        ],
        freeShapes: [],
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}
