/**
 * A small project in physical space for the panel's tests (ADR 0076): a workcell with a table posed
 * in World, a camera posed on the table, an arm posed in World that shows a solid with named parts,
 * its elbow anchored to one of them, a spare arm that is in no place, and a lamp that is not in
 * physical space at all.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Element, PackageFile, SolidDefinition, ViewFile } from '@visual-anything/schema';

export const ARM_SOLID_ID = 'cell.arm-k3f9q2';
const INSIDE = 'cell.inside';

export const ARM_SOLID: SolidDefinition = {
  id: ARM_SOLID_ID,
  name: 'Arm',
  hash: 'b'.repeat(64),
  bytes: 1000,
  bounds: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } },
  counts: { triangles: 60, vertices: 40, nodes: 3, textures: 0 },
  parts: [
    { name: 'base', point: { x: 0, y: 0.1, z: 0 } },
    { name: 'elbow', parent: 0, point: { x: 0, y: 1, z: 0 } },
  ],
  camera: { azimuth: 30, elevation: 20 },
};

const CELL: PackageFile = {
  id: 'cell',
  name: 'Cell',
  components: [
    {
      id: 'cell.robot',
      name: 'Robot',
      derivesFrom: 'essence',
      appearance: { solid: { solid: ARM_SOLID_ID, placement: 'parts' } },
    },
    { id: 'cell.thing', name: 'Thing', derivesFrom: 'essence' },
  ],
  relationTypes: [{ id: INSIDE, name: 'is inside', derivesFrom: 'relates-to', nests: true }],
  solids: [ARM_SOLID],
};

const thing = (id: string, name: string, more: Partial<Element> = {}): Element => ({
  id,
  component: 'cell.thing',
  name,
  ...more,
});

/** The workcell, with its elements' poses as given, and one view of everything. */
export function workcell(
  options: { posed?: boolean; view?: Partial<ViewFile> } = {},
): ProjectSnapshot {
  const posed = options.posed ?? true;
  const inside = (from: string, to: string) => ({
    id: `${from}-in-${to}`,
    relationType: INSIDE,
    from,
    to,
  });
  return {
    project: { schemaVersion: 1, name: 'Workcell', packages: ['cell'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        thing('table', 'Table', posed ? { pose: { at: { x: 0, y: 0, z: 0 } } } : {}),
        thing(
          'camera',
          'Camera',
          posed ? { pose: { in: 'table', at: { x: 0, y: 0.8, z: 0 } } } : {},
        ),
        {
          id: 'arm',
          component: 'cell.robot',
          name: 'Arm',
          ...(posed ? { pose: { at: { x: 2, y: 0, z: 0 } } } : {}),
        },
        thing('elbow', 'Elbow', { appearance: { part: { part: 'elbow', solid: ARM_SOLID_ID } } }),
        { id: 'spare', component: 'cell.robot', name: 'Spare arm' },
        thing('lamp', 'Lamp'),
      ],
      relations: [inside('camera', 'table'), inside('elbow', 'arm')],
    },
    packages: [CELL],
    views: [
      {
        id: 'cell-view',
        name: 'Cell',
        perspective: { name: 'Layout' },
        nestingRelationTypes: [INSIDE],
        positions: [],
        freeShapes: [],
        ...options.view,
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}
