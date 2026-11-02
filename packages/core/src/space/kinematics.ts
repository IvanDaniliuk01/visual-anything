/**
 * Joints move what they carry (ADR 0090): forward kinematics over physical space, worked out from the
 * model and never stored.
 *
 * A joint is an element of the Physical AI package's Joint, or of a component derived from it. Its
 * `kind`, `axis` and limits say how it moves, and its `position` how far: degrees for a joint that
 * turns, meters for one that slides, 0 when it has none. What a joint carries is read from the model:
 * an element's parent is what it **is attached to** (`physical-ai.is-attached-to`, or a relation type
 * derived from it), or else what it is posed or anchored in. A joint turns, about its axis through
 * its origin, everything below it, at any depth; joints above it carry it and its axis along.
 *
 * Each element's motion is the product, from the top down, of the motions of the joints above it,
 * each worked out where that joint stands at rest. An attachment that closes a cycle is not followed.
 */
import type { Element, Id, SpacePoint } from '@visual-anything/schema';
import { componentOrEssence, type Definitions } from '../definitions';
import type { ModelIndex } from '../model-index';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import { IDENTITY, matrixOf, multiply, type Matrix } from './math';

/** The component every joint is, or derives from. */
export const JOINT_COMPONENT = 'physical-ai.joint';
/** The relation type every attachment is, or derives from. */
export const ATTACHED_TO = 'physical-ai.is-attached-to';

/** How a joint moves, with its position, kept within its limits. */
export interface JointMotion {
  kind: 'revolute' | 'continuous' | 'prismatic';
  /** Its axis in its own frame, of length 1. */
  axis: SpacePoint;
  /** Degrees for a joint that turns, meters for one that slides, within its limits. */
  position: number;
  lower?: number;
  upper?: number;
}

/** Whether an element is a joint: of the Joint component or of one derived from it. */
export function isJoint(element: Pick<Element, 'component'>, definitions: Definitions): boolean {
  return componentOrEssence(definitions, element.component).lineage.includes(JOINT_COMPONENT);
}

/**
 * How a joint moves, its position the one given, or else its own, or 0, drawn within its limits; none
 * for an element that is no joint, a fixed joint, or one without an axis it can read.
 */
export function jointMotionOf(
  element: Element,
  definitions: Definitions,
  position?: number,
): JointMotion | undefined {
  if (!isJoint(element, definitions)) return undefined;
  const values = element.attributes ?? {};
  const kind = values.kind ?? 'revolute';
  if (kind !== 'revolute' && kind !== 'continuous' && kind !== 'prismatic') return undefined;
  const axis = axisOf(values.axis);
  if (axis === undefined) return undefined;
  const lower = finite(values.lowerLimit);
  const upper = finite(values.upperLimit);
  const asked = finite(position) ?? finite(values.position) ?? 0;
  let kept = asked;
  if (kind !== 'continuous') {
    if (lower !== undefined) kept = Math.max(kept, lower);
    if (upper !== undefined) kept = Math.min(kept, upper);
  }
  return {
    kind,
    axis,
    position: kept,
    ...(lower === undefined ? {} : { lower }),
    ...(upper === undefined ? {} : { upper }),
  };
}

/** An axis written as three numbers, such as "0 0 1", made of length 1; none when unreadable. */
export function axisOf(value: unknown): SpacePoint | undefined {
  if (typeof value !== 'string') return undefined;
  const parts = value.trim().split(/[\s,]+/);
  if (parts.length !== 3) return undefined;
  const [x, y, z] = parts.map(Number) as [number, number, number];
  if (![x, y, z].every(Number.isFinite)) return undefined;
  const length = Math.hypot(x, y, z);
  if (length < 1e-9) return undefined;
  return { x: x / length, y: y / length, z: z / length };
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * The motion a joint makes, in the coordinates its frame is given in: about its axis through its
 * origin by its position for a joint that turns, along it for one that slides.
 */
export function motionMatrix(motion: JointMotion, frame: Matrix): Matrix {
  // The axis in the frame's coordinates: the frame's turn applied to it.
  const axis = {
    x:
      (frame[0] as number) * motion.axis.x +
      (frame[4] as number) * motion.axis.y +
      (frame[8] as number) * motion.axis.z,
    y:
      (frame[1] as number) * motion.axis.x +
      (frame[5] as number) * motion.axis.y +
      (frame[9] as number) * motion.axis.z,
    z:
      (frame[2] as number) * motion.axis.x +
      (frame[6] as number) * motion.axis.y +
      (frame[10] as number) * motion.axis.z,
  };
  if (motion.kind === 'prismatic') {
    return matrixOf({
      x: axis.x * motion.position,
      y: axis.y * motion.position,
      z: axis.z * motion.position,
    });
  }
  const half = (motion.position * Math.PI) / 360;
  const sin = Math.sin(half);
  const turn = matrixOf(
    { x: 0, y: 0, z: 0 },
    { x: axis.x * sin, y: axis.y * sin, z: axis.z * sin, w: Math.cos(half) },
  );
  const pivot = { x: frame[12] as number, y: frame[13] as number, z: frame[14] as number };
  return multiply(
    matrixOf(pivot),
    multiply(turn, matrixOf({ x: -pivot.x, y: -pivot.y, z: -pivot.z })),
  );
}

/** What each element is attached to, by the first attachment it starts, of those the model holds. */
export function attachmentsOf(project: ProjectSnapshot): ReadonlyMap<Id, Id> {
  const definitions = definitionsIn(project);
  const attaches = new Map<Id, boolean>();
  const isAttachment = (relationType: Id) => {
    let known = attaches.get(relationType);
    if (known === undefined) {
      known =
        definitions.relationType(relationType)?.lineage.includes(ATTACHED_TO) ??
        relationType === ATTACHED_TO;
      attaches.set(relationType, known);
    }
    return known;
  };
  const parents = new Map<Id, Id>();
  for (const relation of project.model.relations) {
    if (parents.has(relation.from) || relation.from === relation.to) continue;
    if (isAttachment(relation.relationType)) parents.set(relation.from, relation.to);
  }
  return parents;
}

/** An element at rest in physical space: where its origin and axes are, and what holds it there. */
export interface Rest {
  readonly matrix: Matrix;
  readonly in?: Id;
}

/**
 * Where every element is once its joints move it: each motion that is not the identity, by element,
 * to be applied before its rest matrix. `positions` stands in for joints' own positions.
 */
export function motionsOf(
  project: ProjectSnapshot,
  rest: ReadonlyMap<Id, Rest>,
  positions?: ReadonlyMap<Id, number>,
): ReadonlyMap<Id, Matrix> {
  const definitions = definitionsIn(project);
  const index: ModelIndex = modelIndexOf(project);
  const attached = attachmentsOf(project);
  const jointMotions = new Map<Id, JointMotion | null>();
  const motionOfJoint = (id: Id): JointMotion | undefined => {
    let known = jointMotions.get(id);
    if (known === undefined) {
      const element = index.element(id);
      known = (element && jointMotionOf(element, definitions, positions?.get(id))) ?? null;
      jointMotions.set(id, known);
    }
    return known ?? undefined;
  };
  const parentOf = (id: Id): Id | undefined => {
    const attachedTo = attached.get(id);
    if (attachedTo !== undefined && rest.has(attachedTo)) return attachedTo;
    return rest.get(id)?.in;
  };
  const parentInSpace = (id: Id): Id | undefined => {
    const parent = parentOf(id);
    return parent !== undefined && rest.has(parent) ? parent : undefined;
  };
  // Worked out without recursion and once for each element, so that however long a chain a file
  // holds, it takes linear time and no deeper a stack.
  const accumulated = new Map<Id, Matrix>();
  const accumulate = (id: Id): Matrix => {
    const path: Id[] = [];
    const onPath = new Set<Id>();
    let at: Id | undefined = id;
    while (at !== undefined && !accumulated.has(at) && !onPath.has(at)) {
      path.push(at);
      onPath.add(at);
      at = parentInSpace(at);
    }
    // An attachment that closes a cycle is not followed: the cycle's members move nothing.
    if (at !== undefined && onPath.has(at)) {
      for (const each of path.slice(path.indexOf(at))) accumulated.set(each, IDENTITY);
    }
    for (let i = path.length - 1; i >= 0; i -= 1) {
      const each = path[i] as Id;
      if (accumulated.has(each)) continue;
      const parent = parentInSpace(each);
      let motion: Matrix = IDENTITY;
      if (parent !== undefined) {
        motion = accumulated.get(parent) ?? IDENTITY;
        const joint = motionOfJoint(parent);
        const frame = rest.get(parent)?.matrix;
        if (joint !== undefined && frame !== undefined && joint.position !== 0) {
          motion = multiply(motion, motionMatrix(joint, frame));
        }
      }
      accumulated.set(each, motion);
    }
    return accumulated.get(id) ?? IDENTITY;
  };
  const motions = new Map<Id, Matrix>();
  for (const id of rest.keys()) {
    const motion = accumulate(id);
    if (motion !== IDENTITY) motions.set(id, motion);
  }
  return motions;
}

/** The attachments that close a cycle, as warnings: one for each element where a cycle closes. */
export function kinematicsWarnings(project: ProjectSnapshot): Problem[] {
  const warnings: Problem[] = [];
  const definitions = definitionsIn(project);
  const attached = attachmentsOf(project);
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  // Each element is walked once: on the walk now, or done (linear time, as for any file).
  const walked = new Map<Id, 'walking' | 'done'>();
  for (const start of attached.keys()) {
    if (walked.has(start)) continue;
    const walk: Id[] = [];
    let at: Id | undefined = start;
    while (at !== undefined && !walked.has(at)) {
      walked.set(at, 'walking');
      walk.push(at);
      at = attached.get(at);
    }
    if (at !== undefined && walked.get(at) === 'walking') {
      const cycle = walk.slice(walk.indexOf(at));
      const named = cycle.slice(0, 5).map((each) => `"${nameOf(each)}"`);
      if (cycle.length > 5) named.push(`${cycle.length - 5} more`);
      warnings.push(
        problem(
          'attachment-cycle',
          `${named.join(', ')} are attached to each other in a cycle, so their joints move none of them.`,
          cycle,
        ),
      );
    }
    for (const each of walk) walked.set(each, 'done');
  }
  for (const element of project.model.elements) {
    if (!isJoint(element, definitions)) continue;
    const position = finite(element.attributes?.position);
    const kind = element.attributes?.kind ?? 'revolute';
    if (position === undefined || kind === 'continuous' || kind === 'fixed') continue;
    const lower = finite(element.attributes?.lowerLimit);
    const upper = finite(element.attributes?.upperLimit);
    if ((lower !== undefined && position < lower) || (upper !== undefined && position > upper)) {
      warnings.push(
        problem(
          'joint-out-of-limits',
          `The position of "${element.name}", ${position}, is outside its limits, from ${lower ?? '…'} to ${upper ?? '…'}; it is drawn at the nearest one.`,
          [element.id],
        ),
      );
    }
  }
  return warnings;
}
