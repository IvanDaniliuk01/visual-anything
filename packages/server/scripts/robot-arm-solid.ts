/**
 * The robot arm's solid (M9, ADR 0075): a six-axis arm on a round base, made for Visual Anything
 * from boxes and cylinders, written by the program's own canonical writer (`src/solids/canonical.ts`)
 * as a file the cleaner takes back unchanged. The sample `examples/robot-arm` shows it, and anchors
 * its links, joints, gripper and camera to its named parts. `robot-arm.ts` writes the file and the
 * definition; the test beside it holds the committed file to these bytes.
 *
 * The arm stands in meters with +Y up and its front toward +Z, as glTF has it: the base on the
 * floor, the upper arm upright and the forearm reaching forward. Its named parts are the meshes, and
 * the joints' frames between them are nodes with no name, so that every part stands on its own
 * (none holds another) while turning a frame still carries everything beyond it, as the animation
 * "Pick a part" does.
 */
import type { SolidDefinition } from '@visual-anything/schema';
import { readSolid } from '@visual-anything/core';
import {
  writeCanonicalSolid,
  type CleanAnimation,
  type CleanMaterial,
  type CleanMesh,
  type CleanNode,
  type CleanPrimitive,
  type CleanSolid,
  type Quat,
  type Vec3,
} from '../src/solids/canonical';

/** The solid's id in the sample's package, `robot-arm`. */
export const ROBOT_ARM_SOLID = 'robot-arm.six-axis-arm';

/** What the package says of the solid beside what its file describes. */
export const ROBOT_ARM_TEXT = {
  name: 'Six-axis arm',
  description:
    'A six-axis arm on a round base, in orange with dark joints: its upper arm upright, its forearm reaching forward to a two-jawed gripper with a camera above it, seen from the front right, a little above.',
  source: 'Made for Visual Anything by packages/server/scripts/robot-arm-solid.ts',
  license: 'CC0-1.0',
} as const;

/** The camera its pictures are drawn from: three-quarters from the front right, a little above. */
export const ROBOT_ARM_CAMERA = { azimuth: 50, elevation: 20 } as const;

/** Segments around each cylinder. */
const SEGMENTS = 24;

type Axis = 'x' | 'y' | 'z';

/** One piece of geometry, before it joins a part's primitive. */
export interface Piece {
  positions: number[];
  normals: number[];
  indices: number[];
}

/**
 * A box from `min` to `max`, its faces flat, each a fan around a vertex at its middle. The vertex
 * nearest the box's middle is then the middle of a face across its thinnest side, the first of +X,
 * +Y and +Z where two tie, which face the camera: the part's point, where relations end, shows.
 */
export function box(min: Vec3, max: Vec3): Piece {
  const piece: Piece = { positions: [], normals: [], indices: [] };
  const faces: { normal: Vec3; corners: Vec3[] }[] = [
    {
      normal: [1, 0, 0],
      corners: [
        [1, 0, 0],
        [1, 1, 0],
        [1, 1, 1],
        [1, 0, 1],
      ],
    },
    {
      normal: [-1, 0, 0],
      corners: [
        [0, 0, 1],
        [0, 1, 1],
        [0, 1, 0],
        [0, 0, 0],
      ],
    },
    {
      normal: [0, 1, 0],
      corners: [
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 0],
        [0, 1, 0],
      ],
    },
    {
      normal: [0, -1, 0],
      corners: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1],
      ],
    },
    {
      normal: [0, 0, 1],
      corners: [
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
        [0, 0, 1],
      ],
    },
    {
      normal: [0, 0, -1],
      corners: [
        [0, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [1, 0, 0],
      ],
    },
  ];
  const at = (corner: Vec3): Vec3 => [
    corner[0] === 1 ? max[0] : min[0],
    corner[1] === 1 ? max[1] : min[1],
    corner[2] === 1 ? max[2] : min[2],
  ];
  for (const face of faces) {
    const middle = piece.positions.length / 3;
    const corners = face.corners.map(at);
    const sum = corners.reduce<Vec3>(
      (total, each) => [total[0] + each[0], total[1] + each[1], total[2] + each[2]],
      [0, 0, 0],
    );
    piece.positions.push(sum[0] / 4, sum[1] / 4, sum[2] / 4);
    piece.normals.push(...face.normal);
    for (const corner of corners) {
      piece.positions.push(...corner);
      piece.normals.push(...face.normal);
    }
    for (let side = 0; side < 4; side++) {
      piece.indices.push(middle, middle + 1 + side, middle + 1 + ((side + 1) % 4));
    }
  }
  return piece;
}

/** Where each cylinder's seam lies, in degrees around its axis, so that its point faces the camera. */
const SEAM: Record<Axis, number> = { x: 45, y: 40, z: 45 };

/**
 * A cylinder along an axis, from `from` to `to` on it, around `center` across it, its side smooth and
 * its ends flat. One more vertex lies at the middle of its side, on the seam, and its ends have no
 * vertex at their middles: that vertex is the one nearest the cylinder's middle, its part's point, on
 * the side that faces the camera.
 */
function cylinder(axis: Axis, center: [number, number], radius: number, from: number, to: number) {
  const piece: Piece = { positions: [], normals: [], indices: [] };
  // The axis and the two directions across it, in the order x, y, z.
  const along = { x: 0, y: 1, z: 2 }[axis];
  const across = [0, 1, 2].filter((each) => each !== along) as [number, number];
  const seam = (SEAM[axis] * Math.PI) / 180;
  const angleOf = (at: number) => seam + (at / SEGMENTS) * Math.PI * 2;
  const point = (height: number, angle: number): [number, number, number] => {
    const p: [number, number, number] = [0, 0, 0];
    p[along] = height;
    p[across[0]] = center[0] + Math.cos(angle) * radius;
    p[across[1]] = center[1] + Math.sin(angle) * radius;
    return p;
  };
  const direction = (angle: number): [number, number, number] => {
    const n: [number, number, number] = [0, 0, 0];
    n[across[0]] = Math.cos(angle);
    n[across[1]] = Math.sin(angle);
    return n;
  };
  const axial = (sign: number): [number, number, number] => {
    const n: [number, number, number] = [0, 0, 0];
    n[along] = sign;
    return n;
  };
  // The side: two rings of vertices, the seam's twice, and the seam's middle.
  for (let at = 0; at <= SEGMENTS; at++) {
    const angle = angleOf(at);
    piece.positions.push(...point(from, angle), ...point(to, angle));
    piece.normals.push(...direction(angle), ...direction(angle));
  }
  const m = piece.positions.length / 3;
  piece.positions.push(...point((from + to) / 2, seam));
  piece.normals.push(...direction(seam));
  // The ring turns from the first direction across toward the second, which about y runs inward.
  const outward = along !== 1;
  for (let at = 0; at < SEGMENTS; at++) {
    const a = at * 2;
    const [b, c, d] = [a + 1, a + 2, a + 3];
    if (at === 0) {
      // The first quad, as a fan around the seam's middle, which lies on its edge from a to b.
      if (outward) piece.indices.push(m, a, c, m, c, d, m, d, b);
      else piece.indices.push(m, b, d, m, d, c, m, c, a);
    } else if (outward) piece.indices.push(a, c, b, b, c, d);
    else piece.indices.push(a, b, c, b, d, c);
  }
  // The ends: a fan from the first vertex of each ring.
  for (const [height, sign] of [
    [from, -1],
    [to, 1],
  ] as const) {
    const first = piece.positions.length / 3;
    for (let at = 0; at < SEGMENTS; at++) {
      piece.positions.push(...point(height, angleOf(at)));
      piece.normals.push(...axial(sign));
    }
    const faces = sign > 0 === outward;
    for (let at = 1; at < SEGMENTS - 1; at++) {
      if (faces) piece.indices.push(first, first + at, first + at + 1);
      else piece.indices.push(first, first + at + 1, first + at);
    }
  }
  return piece;
}

/** Pieces joined into one primitive of a material. */
export function primitive(material: number, ...pieces: Piece[]): CleanPrimitive {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const piece of pieces) {
    const first = positions.length / 3;
    positions.push(...piece.positions);
    normals.push(...piece.normals);
    indices.push(...piece.indices.map((index) => index + first));
  }
  return {
    positions: new Float32Array(positions.map(round)),
    normals: new Float32Array(normals.map(round)),
    indices: new Uint32Array(indices),
    material,
  };
}

/** Rounds to a hundredth of a millimetre, so that every platform writes the same floats. */
function round(value: number): number {
  const rounded = Math.round(value * 100_000) / 100_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** A color written as sRGB hexadecimal, as glTF's linear factors, rounded to four places. */
function linear(hex: string): [number, number, number, number] {
  const channel = (at: number) => {
    const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    const lin = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return Math.round(lin * 10_000) / 10_000;
  };
  return [channel(1), channel(3), channel(5), 1];
}

export function material(hex: string, metallic: number, roughness: number): CleanMaterial {
  return {
    baseColorFactor: linear(hex),
    metallicFactor: metallic,
    roughnessFactor: roughness,
    emissiveFactor: [0, 0, 0],
    alphaMode: 'OPAQUE',
    alphaCutoff: 0.5,
    doubleSided: false,
    unlit: false,
  };
}

// Numbered as the cleaner numbers materials, by their first use from the last node back.
const CAMERA = 0;
const LENS = 1;
const STEEL = 2;
const JOINT = 3;
const PAINT = 4;
const MATERIALS: CleanMaterial[] = [
  material('#1E2226', 0.2, 0.5),
  material('#2E5C8A', 0.1, 0.15),
  material('#A9AEB3', 0.8, 0.3),
  material('#3A3F45', 0.6, 0.35),
  material('#E8862A', 0, 0.45),
];

/** The arm's named parts, each one mesh, in the order the tree below meets them. */
const PARTS: { name: string; mesh: CleanMesh }[] = [
  { name: 'base', mesh: { primitives: [primitive(JOINT, cylinder('y', [0, 0], 0.13, 0, 0.08))] } },
  {
    name: 'joint-1',
    mesh: { primitives: [primitive(JOINT, cylinder('y', [0, 0], 0.09, 0, 0.05))] },
  },
  {
    name: 'link-1',
    mesh: { primitives: [primitive(PAINT, cylinder('y', [0, 0], 0.07, 0.05, 0.22))] },
  },
  {
    name: 'joint-2',
    mesh: { primitives: [primitive(JOINT, cylinder('x', [0, 0], 0.065, -0.09, 0.09))] },
  },
  {
    name: 'link-2',
    mesh: { primitives: [primitive(PAINT, box([-0.045, 0.05, -0.04], [0.045, 0.4, 0.04]))] },
  },
  {
    name: 'joint-3',
    mesh: { primitives: [primitive(JOINT, cylinder('x', [0, 0], 0.055, -0.08, 0.08))] },
  },
  {
    name: 'link-3',
    mesh: { primitives: [primitive(PAINT, box([-0.04, -0.035, 0.05], [0.04, 0.035, 0.22]))] },
  },
  {
    name: 'joint-4',
    mesh: { primitives: [primitive(JOINT, cylinder('z', [0, 0], 0.045, -0.03, 0.02))] },
  },
  {
    name: 'link-4',
    mesh: { primitives: [primitive(PAINT, cylinder('z', [0, 0], 0.035, 0.02, 0.16))] },
  },
  {
    name: 'joint-5',
    mesh: { primitives: [primitive(JOINT, cylinder('x', [0, 0], 0.04, -0.05, 0.05))] },
  },
  {
    name: 'link-5',
    mesh: { primitives: [primitive(PAINT, box([-0.03, -0.03, 0.035], [0.03, 0.03, 0.08]))] },
  },
  {
    name: 'joint-6',
    mesh: { primitives: [primitive(JOINT, cylinder('z', [0, 0], 0.032, -0.01, 0.01))] },
  },
  {
    name: 'link-6',
    mesh: { primitives: [primitive(STEEL, cylinder('z', [0, 0], 0.04, 0.01, 0.03))] },
  },
  {
    name: 'gripper',
    mesh: {
      primitives: [
        primitive(
          STEEL,
          box([-0.045, -0.02, 0.03], [0.045, 0.02, 0.05]),
          box([0.025, -0.015, 0.05], [0.04, 0.015, 0.11]),
          box([-0.04, -0.015, 0.05], [-0.025, 0.015, 0.11]),
        ),
      ],
    },
  },
  {
    name: 'camera',
    mesh: {
      primitives: [
        primitive(CAMERA, box([-0.02, 0.04, -0.01], [0.02, 0.07, 0.04])),
        primitive(LENS, cylinder('z', [0, 0.055], 0.012, 0.04, 0.05)),
      ],
    },
  },
];

/** The joints' frames: where each stands on the one before, and the axis it turns about. */
const FRAMES: { at: Vec3; axis: Vec3 }[] = [
  { at: [0, 0.08, 0], axis: [0, 1, 0] },
  { at: [0, 0.18, 0], axis: [1, 0, 0] },
  { at: [0, 0.45, 0], axis: [1, 0, 0] },
  { at: [0, 0, 0.25], axis: [0, 0, 1] },
  { at: [0, 0, 0.19], axis: [1, 0, 0] },
  { at: [0, 0, 0.09], axis: [0, 0, 1] },
];

/**
 * "Pick a part": over 6 s, the arm turns toward the part, reaches down to it, turns its wrist, closes
 * on it, lifts it and turns it to the other side, then comes back to rest. Each frame's angle, in
 * degrees, at each keyframe.
 */
const PICK_TIMES = [0, 1.5, 2.5, 3.5, 4.5, 6];
const PICK_ANGLES: number[][] = [
  [0, 35, 35, 35, -30, 0],
  [0, 30, 42, 25, 20, 0],
  [0, 20, 32, 12, 10, 0],
  [0, 30, 30, 30, 0, 0],
  [0, 30, 42, 20, 15, 0],
  [0, 90, 90, 90, 0, 0],
];

/** A turn about an axis, as a quaternion rounded to six places. */
function turn(axis: Vec3, degrees: number): Quat {
  const half = (degrees * Math.PI) / 360;
  const s = Math.sin(half);
  const six = (value: number) => {
    const rounded = Math.round(value * 1_000_000) / 1_000_000;
    return Object.is(rounded, -0) ? 0 : rounded;
  };
  return [six(axis[0] * s), six(axis[1] * s), six(axis[2] * s), six(Math.cos(half))];
}

const REST: Quat = [0, 0, 0, 1];
const ONE: Vec3 = [1, 1, 1];

/**
 * The arm as the cleaner keeps a solid: nodes in depth-first order from the one root, the base's
 * part and the first joint's frame under it; each frame holding its joint's and its link's parts,
 * then the next frame; the last frame the flange's, the gripper's and the camera's.
 */
export function robotArmSolid(): CleanSolid {
  const nodes: CleanNode[] = [];
  const meshes: CleanMesh[] = [];
  const add = (
    node: Omit<CleanNode, 'children' | 'translation' | 'rotation' | 'scale'> & {
      translation?: Vec3;
    },
  ): CleanNode => {
    const made: CleanNode = {
      ...(node.name === undefined ? {} : { name: node.name }),
      children: [],
      ...(node.mesh === undefined ? {} : { mesh: node.mesh }),
      translation: node.translation ?? [0, 0, 0],
      rotation: REST,
      scale: ONE,
    };
    nodes.push(made);
    return made;
  };
  const part = (holder: CleanNode, name: string) => {
    const found = PARTS.find((each) => each.name === name);
    if (!found) throw new Error(`No part ${name}`);
    holder.children.push(nodes.length);
    meshes.push(found.mesh);
    add({ name, mesh: meshes.length - 1 });
  };
  const root = add({});
  part(root, 'base');
  let holder = root;
  const frames: number[] = [];
  FRAMES.forEach((frame, at) => {
    holder.children.push(nodes.length);
    frames.push(nodes.length);
    const next = add({ translation: frame.at });
    part(next, `joint-${at + 1}`);
    part(next, `link-${at + 1}`);
    holder = next;
  });
  part(holder, 'gripper');
  part(holder, 'camera');
  // Children are numbered as they are added, which is depth-first already; each frame's next frame
  // is added after its parts, so the order holds.
  const times = new Float32Array(PICK_TIMES);
  const animation: CleanAnimation = {
    channels: FRAMES.map((frame, at) => ({
      node: frames[at] as number,
      path: 'rotation' as const,
      times,
      values: new Float32Array(
        (PICK_ANGLES[at] as number[]).flatMap((degrees) => [...turn(frame.axis, degrees)]),
      ),
      interpolation: 'LINEAR' as const,
    })),
  };
  return {
    nodes,
    roots: [0],
    meshes,
    materials: MATERIALS,
    textures: [],
    animations: [animation],
  };
}

/** The arm's canonical file. */
export function robotArmFile(): Uint8Array {
  return writeCanonicalSolid(robotArmSolid());
}

/** The arm's definition in the sample's package, its description read from its file by the core. */
export function robotArmDefinition(bytes: Uint8Array = robotArmFile()): SolidDefinition {
  const read = readSolid(bytes);
  if (!read.ok) throw new Error(read.problems.map((each) => each.message).join(' '));
  const { bounds, counts, parts, animations } = read.description;
  return {
    id: ROBOT_ARM_SOLID,
    ...ROBOT_ARM_TEXT,
    hash: read.hash,
    bytes: read.bytes,
    bounds,
    counts,
    parts,
    camera: { ...ROBOT_ARM_CAMERA },
    ...(animations.length > 0 ? { animations } : {}),
  };
}
