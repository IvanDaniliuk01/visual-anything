/**
 * The robot arm's workcell solids (M15, ADR 0090): its table, a bin and the workpiece, made for Visual
 * Anything from boxes as the arm is (`robot-arm-solid.ts`), written by the program's canonical writer
 * as files the cleaner takes back unchanged. The sample `examples/robot-arm` shows each through its
 * component's appearance, so that the physical-space panel draws the arm reaching into a bin.
 *
 * Each stands in meters with +Y up, its origin where it is posed: the table's at the middle of its
 * top, which is 75 cm up; a bin's at the middle of its floor's underside; the workpiece's at its
 * middle, where the gripper closes on it.
 */
import type { SolidDefinition } from '@visual-anything/schema';
import { readSolid } from '@visual-anything/core';
import {
  writeCanonicalSolid,
  type CleanMaterial,
  type CleanMesh,
  type CleanSolid,
  type Vec3,
} from '../src/solids/canonical';
import { box, material, primitive, type Piece } from './robot-arm-solid';

/** What the package says of a workcell solid beside what its file describes. */
interface WorkcellSolid {
  id: string;
  name: string;
  description: string;
  /** Its pieces, by material. */
  pieces: { material: number; boxes: [Vec3, Vec3][] }[];
  materials: CleanMaterial[];
}

const SOURCE = 'Made for Visual Anything by packages/server/scripts/workcell-solids.ts';
const CAMERA = { azimuth: 40, elevation: 25 } as const;

/** The table's top: 1.2 m across, 0.8 m deep, 4 cm thick, its back under the arm. */
const TOP = { x: 0.6, back: -0.5, front: 0.35, thickness: 0.04, height: 0.75 };
const LEG = 0.04;

const legs: [Vec3, Vec3][] = [
  [-1, TOP.back],
  [1, TOP.back],
  [-1, TOP.front],
  [1, TOP.front],
].map(([side, z]) => {
  const x = (side as number) * (TOP.x - 0.05);
  const at = (z as number) < 0 ? (z as number) + 0.05 : (z as number) - 0.05;
  return [
    [x - LEG / 2, -TOP.height, at - LEG / 2],
    [x + LEG / 2, -TOP.thickness, at + LEG / 2],
  ];
});

/** A bin: 20 cm across, 16 cm deep, 8 cm high, open at the top, its walls 6 mm thick. */
const BIN = { x: 0.1, z: 0.08, height: 0.08, wall: 0.006 };

export const WORKCELL_SOLIDS: readonly WorkcellSolid[] = [
  {
    id: 'robot-arm.work-table',
    name: 'Table',
    description:
      'A table with a pale wooden top on four grey steel legs, 1.2 m across and 75 cm high, seen from the front right, a little above.',
    pieces: [
      // Numbered as the cleaner numbers materials, by their first use from the last node back.
      { material: 0, boxes: legs },
      {
        material: 1,
        boxes: [
          [
            [-TOP.x, -TOP.thickness, TOP.back],
            [TOP.x, 0, TOP.front],
          ],
        ],
      },
    ],
    materials: [material('#7A8087', 0.7, 0.4), material('#D9C3A0', 0, 0.7)],
  },
  {
    id: 'robot-arm.parts-bin',
    name: 'Bin',
    description:
      'An open blue plastic bin, 20 cm across and 8 cm high, seen from the front right, a little above.',
    pieces: [
      {
        material: 0,
        boxes: [
          // Its floor, then its walls: back, front, left and right.
          [
            [-BIN.x, 0, -BIN.z],
            [BIN.x, BIN.wall, BIN.z],
          ],
          [
            [-BIN.x, BIN.wall, -BIN.z],
            [BIN.x, BIN.height, -BIN.z + BIN.wall],
          ],
          [
            [-BIN.x, BIN.wall, BIN.z - BIN.wall],
            [BIN.x, BIN.height, BIN.z],
          ],
          [
            [-BIN.x, BIN.wall, -BIN.z + BIN.wall],
            [-BIN.x + BIN.wall, BIN.height, BIN.z - BIN.wall],
          ],
          [
            [BIN.x - BIN.wall, BIN.wall, -BIN.z + BIN.wall],
            [BIN.x, BIN.height, BIN.z - BIN.wall],
          ],
        ],
      },
    ],
    materials: [material('#3C78B4', 0, 0.6)],
  },
  {
    id: 'robot-arm.machined-block',
    name: 'Workpiece',
    description:
      'A small red machined block, 4 cm by 3 cm by 4 cm, seen from the front right, a little above.',
    pieces: [
      {
        material: 0,
        boxes: [
          [
            [-0.02, -0.015, -0.02],
            [0.02, 0.015, 0.02],
          ],
        ],
      },
    ],
    materials: [material('#C8462D', 0.3, 0.45)],
  },
];

/** A workcell solid as the cleaner keeps it: one node holding one mesh, a primitive per material. */
export function workcellSolid(solid: WorkcellSolid): CleanSolid {
  const mesh: CleanMesh = {
    primitives: solid.pieces.map((each) =>
      primitive(each.material, ...each.boxes.map(([min, max]): Piece => box(min, max))),
    ),
  };
  return {
    nodes: [
      { children: [], mesh: 0, translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    ],
    roots: [0],
    meshes: [mesh],
    materials: solid.materials,
    textures: [],
    animations: [],
  };
}

/** A workcell solid's canonical file. */
export function workcellFile(solid: WorkcellSolid): Uint8Array {
  return writeCanonicalSolid(workcellSolid(solid));
}

/** A workcell solid's definition in the sample's package, its description read from its file. */
export function workcellDefinition(
  solid: WorkcellSolid,
  bytes: Uint8Array = workcellFile(solid),
): SolidDefinition {
  const read = readSolid(bytes);
  if (!read.ok) throw new Error(read.problems.map((each) => each.message).join(' '));
  const { bounds, counts, parts, animations } = read.description;
  return {
    id: solid.id,
    name: solid.name,
    description: solid.description,
    source: SOURCE,
    license: 'CC0-1.0',
    hash: read.hash,
    bytes: read.bytes,
    bounds,
    counts,
    parts,
    camera: { ...CAMERA },
    ...(animations.length > 0 ? { animations } : {}),
  };
}
