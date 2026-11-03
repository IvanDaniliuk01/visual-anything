/**
 * Claude's kinematics tools (ADR 0090): reading the chain of joints of a robot or of the whole model
 * (`get_kinematics`), and setting joints' positions (`set_joint_positions`), one undoable action of
 * Claude's sent as one `batch` of `update-element` changes to each joint's `position`, as the
 * panel's "Keep these positions" sends the person's.
 *
 * - **The chain** is the core's (`core/src/space/kinematics.ts`): what an element is attached to,
 *   through `physical-ai.is-attached-to` or a relation type derived from it, or else what it is posed
 *   in. A joint carries everything below it, at any depth.
 * - **Limits only warn** (CLAUDE.md): a position past them is set, drawn at the nearest one, and the
 *   answer says so, as the core's `joint-out-of-limits` does on opening.
 * - **Data, never instructions** (ADR 0029): names come from the model, and are given as data.
 */
import {
  attachmentsOf,
  definitionsIn,
  isJoint,
  jointMotionOf,
  kinematicsWarnings,
  modelIndexOf,
  type Command,
  type ModelIndex,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element, Id } from '@visual-anything/schema';
import { z } from 'zod';
import { READ, WRITE, act, fail, id, ok, tool } from './kit';
import type { Tool } from './tools';

/** The most elements of a chain one call of get_kinematics lists. */
export const MAX_KINEMATICS_LISTED = 500;

/** The most joints one call of set_joint_positions sets, as a view state gives at most. */
export const MAX_JOINTS_SET = 200;

/** The farthest a joint's position goes either way, as a view state's does. */
const MAX_POSITION = 100_000;

/** What a joint's position is measured in, as each tool says it. */
const POSITIONS =
  'A position is in degrees for a joint that turns (revolute or continuous) and in meters for one that slides (prismatic); 0 when it has none.';

/** What carries what, as each tool says it. */
const CHAIN =
  'An element hangs from what it is attached to, through "is attached to" or a relation type derived from it (such as the robot-arm sample\'s "is mounted on"), or else from what it is posed in; a joint turns, about its axis through its origin, or slides along it, everything that hangs from it at any depth.';

/** Each element's parent in the chain: what it is attached to, or else what it is posed in. */
function parentsOf(project: ProjectSnapshot, index: ModelIndex): Map<Id, Id> {
  const parents = new Map(attachmentsOf(project));
  for (const element of project.model.elements) {
    const posedIn = element.pose?.in;
    if (!parents.has(element.id) && posedIn !== undefined && index.element(posedIn)) {
      parents.set(element.id, posedIn);
    }
  }
  return parents;
}

/** The element and everything it contains, at any depth, under any nesting relation type. */
function containedIn(index: ModelIndex, root: Id): Set<Id> {
  const found = new Set<Id>([root]);
  const queue = [root];
  for (let at = 0; at < queue.length; at++) {
    for (const child of index.contentsOf(queue[at] as Id)) {
      if (found.has(child)) continue;
      found.add(child);
      queue.push(child);
    }
  }
  return found;
}

interface Link {
  element: Element;
  depth: number;
  parent: Id | undefined;
}

/**
 * The chain, depth first from its tops, in the model's order: of the whole model, the trees that hold
 * a joint; of a robot, those of what it contains, with what they carry. Each element once, even where
 * attachments close a cycle.
 */
function chainOf(project: ProjectSnapshot, robot: Id | undefined) {
  const index = modelIndexOf(project);
  const definitions = definitionsIn(project);
  const parents = parentsOf(project, index);
  const children = new Map<Id, Id[]>();
  for (const element of project.model.elements) {
    const parent = parents.get(element.id);
    if (parent === undefined) continue;
    const list = children.get(parent) ?? [];
    list.push(element.id);
    children.set(parent, list);
  }
  const members = robot === undefined ? undefined : containedIn(index, robot);
  // The top of each element's chain, its walk stopping where a cycle closes.
  const topOf = (start: Id): Id => {
    const seen = new Set<Id>([start]);
    let at = start;
    for (;;) {
      const parent = parents.get(at);
      if (parent === undefined || seen.has(parent)) return at;
      if (members !== undefined && !members.has(parent)) return at;
      seen.add(parent);
      at = parent;
    }
  };
  const joints = project.model.elements.filter(
    (each) => isJoint(each, definitions) && (members === undefined || members.has(each.id)),
  );
  const tops = new Set(joints.map((each) => topOf(each.id)));
  const links: Link[] = [];
  const reached = new Set<Id>();
  const carried = new Map<Id, number>();
  const visit = (start: Id) => {
    // Iterative, so that a chain thousands deep walks as any other.
    const stack: { id: Id; depth: number; parent: Id | undefined }[] = [
      { id: start, depth: 0, parent: undefined },
    ];
    while (stack.length > 0) {
      const next = stack.pop() as { id: Id; depth: number; parent: Id | undefined };
      if (reached.has(next.id)) continue;
      const element = index.element(next.id);
      if (!element) continue;
      reached.add(next.id);
      links.push({ element, depth: next.depth, parent: next.parent });
      const below = children.get(next.id) ?? [];
      for (let at = below.length - 1; at >= 0; at--) {
        stack.push({ id: below[at] as Id, depth: next.depth + 1, parent: next.id });
      }
    }
  };
  for (const element of project.model.elements) if (tops.has(element.id)) visit(element.id);
  // How much each element carries in all: its links below, counted from the deepest up.
  for (let at = links.length - 1; at >= 0; at--) {
    const link = links[at] as Link;
    if (link.parent === undefined) continue;
    carried.set(
      link.parent,
      (carried.get(link.parent) ?? 0) + 1 + (carried.get(link.element.id) ?? 0),
    );
  }
  return { links, children, carried, reached, joints: joints.length };
}

const getKinematics = tool({
  name: 'get_kinematics',
  title: 'Read the chain of joints',
  description: `Reads how a robot moves, or the whole model when robot is left out: its chain, depth first from the top, each element with what it hangs from (hangsFrom), its depth, and, for a joint, its kind (revolute, continuous, prismatic or fixed), its axis as written and as a unit vector in the joint's own frame (for a joint anchored to a part of a solid, the solid's axes, +Y up), its limits, its stored position and the one it is drawn at, within its limits, the unit, whether it moves (a fixed joint, or one without an axis it can read, moves nothing), what it carries directly and how many elements it carries in all. It also gives the warnings of the chain: positions past their limits, and attachments that close a cycle, which no joint then moves. It changes nothing.

${CHAIN} ${POSITIONS} Of a robot, the chain is what it contains, at any depth, with what that carries; of the whole model, every tree that holds a joint. At most ${MAX_KINEMATICS_LISTED} elements a call, from offset; total says how many there are.

Then set_joint_positions stores positions, a tour's step shows them without storing them (viewState.space.joints), and get_space says where each element is.

Example: { "robot": "arm" }
Example: {}
Example: { "robot": "arm", "offset": 500, "limit": 500 }`,
  input: {
    robot: id()
      .optional()
      .describe('The robot, or any element, whose chain to read; left out, the whole model.'),
    offset: z.number().int().min(0).optional().describe('The first element to list, from 0.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_KINEMATICS_LISTED)
      .optional()
      .describe(`At most this many elements; ${MAX_KINEMATICS_LISTED} by default.`),
  },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const index = modelIndexOf(state);
    const definitions = definitionsIn(state);
    const robot = args.robot === undefined ? undefined : index.element(args.robot);
    if (args.robot !== undefined && robot === undefined) {
      return fail(
        `There is no element "${args.robot}". Use find_elements to find the robot, or leave robot out for the whole model.`,
      );
    }
    const { links, children, carried, reached, joints } = chainOf(state, robot?.id);
    const nameOf = (each: Id) => index.element(each)?.name ?? each;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? MAX_KINEMATICS_LISTED;
    const listed = links.slice(offset, offset + limit);
    const more = links.length - offset - listed.length;
    const warnings = kinematicsWarnings(state)
      .filter((each) => robot === undefined || each.subjects?.some((one) => reached.has(one)))
      .map((each) => ({ code: each.code, message: each.message, elements: each.subjects ?? [] }));
    return ok({
      of: robot === undefined ? 'the whole model' : { id: robot.id, name: robot.name },
      joints,
      units: POSITIONS,
      total: links.length,
      offset,
      items: listed.map(({ element, depth, parent }) => ({
        id: element.id,
        name: element.name,
        component: element.component,
        depth,
        hangsFrom: parent === undefined ? null : { id: parent, name: nameOf(parent) },
        ...(isJoint(element, definitions)
          ? {
              joint: jointOf(
                element,
                definitions,
                children.get(element.id) ?? [],
                carried.get(element.id) ?? 0,
                nameOf,
              ),
            }
          : {}),
      })),
      ...(more > 0 ? { more, next: `Call again with offset ${offset + listed.length}.` } : {}),
      ...(links.length === 0
        ? {
            note:
              robot === undefined
                ? 'The model holds no joint.'
                : `"${robot.name}" contains no joint: its parts are attached to nothing that moves.`,
          }
        : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  },
});

/** A joint as get_kinematics gives it. */
function jointOf(
  element: Element,
  definitions: ReturnType<typeof definitionsIn>,
  below: readonly Id[],
  inAll: number,
  nameOf: (id: Id) => string,
): Record<string, unknown> {
  const values = element.attributes ?? {};
  const kind = typeof values.kind === 'string' ? values.kind : 'revolute';
  const motion = jointMotionOf(element, definitions);
  const stored = typeof values.position === 'number' ? values.position : 0;
  const lower = typeof values.lowerLimit === 'number' ? values.lowerLimit : undefined;
  const upper = typeof values.upperLimit === 'number' ? values.upperLimit : undefined;
  const why =
    motion !== undefined
      ? undefined
      : kind === 'fixed'
        ? 'It is fixed.'
        : !['revolute', 'continuous', 'prismatic'].includes(kind)
          ? `Its kind, "${kind}", is not one that moves.`
          : 'Its axis is not three numbers, such as "0 1 0".';
  return {
    kind,
    ...(typeof values.axis === 'string' ? { axis: values.axis } : {}),
    ...(motion ? { unitAxis: motion.axis } : {}),
    unit: kind === 'prismatic' ? 'meters' : 'degrees',
    ...(lower === undefined && upper === undefined
      ? {}
      : {
          limits: {
            ...(lower === undefined ? {} : { lower }),
            ...(upper === undefined ? {} : { upper }),
          },
        }),
    position: stored,
    ...(motion && motion.position !== stored ? { drawnAt: motion.position } : {}),
    moves: motion !== undefined,
    ...(why === undefined ? {} : { why }),
    carries: below.map((each) => ({ id: each, name: nameOf(each) })),
    carriesInAll: inAll,
  };
}

const setJointPositions = tool({
  name: 'set_joint_positions',
  title: 'Set joints’ positions',
  description: `Stores the positions of one joint or several, as one undoable action of yours, as the physical-space panel's "Keep these positions" does: each joint's position attribute. What each joint carries moves with it, at any depth, in the panel and wherever the model is drawn in physical space. A position past the joint's limits is stored and drawn at the nearest limit, and the answer warns, as every limit only warns.

${POSITIONS} ${CHAIN} get_kinematics lists the joints, their kinds, axes and limits. To show positions without storing them, give them in a tour's step (viewState.space.joints) or a view address; to move a joint along a run, a component's simulate answers joints.

Example: { "positions": { "joint-2": 30, "joint-3": -45 } }
Example: { "positions": { "gripper-slide": 0.02 } }`,
  input: {
    positions: z
      .record(id(), z.number().min(-MAX_POSITION).max(MAX_POSITION))
      .describe(
        `The positions, by joint id: degrees for a joint that turns, meters for one that slides; at most ${MAX_JOINTS_SET} joints.`,
      ),
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    const index = modelIndexOf(state);
    const definitions = definitionsIn(state);
    const given = Object.entries(args.positions);
    if (given.length === 0) return fail('Give the position of at least one joint.');
    if (given.length > MAX_JOINTS_SET) {
      return fail(`Set at most ${MAX_JOINTS_SET} joints' positions a call.`);
    }
    const unknown = given.filter(([joint]) => index.element(joint) === undefined);
    if (unknown.length > 0) {
      return fail(
        `There is no element ${unknown.map(([joint]) => `"${joint}"`).join(', ')}. get_kinematics lists the joints.`,
      );
    }
    const notJoints = given.filter(
      ([joint]) => !isJoint(index.element(joint) as Element, definitions),
    );
    if (notJoints.length > 0) {
      return fail(
        `${notJoints.map(([joint]) => `"${index.element(joint)?.name ?? joint}"`).join(', ')} ${notJoints.length === 1 ? 'is no joint' : 'are no joints'}: only an element of the Joint component, or of one derived from it, has a position. get_kinematics lists the joints.`,
      );
    }
    const warnings: string[] = [];
    for (const [joint, position] of given) {
      const element = index.element(joint) as Element;
      const motion = jointMotionOf(element, definitions, position);
      if (motion === undefined) {
        warnings.push(`"${element.name}" moves nothing: it is fixed, or its axis is not readable.`);
      } else if (motion.position !== position) {
        warnings.push(
          `The position of "${element.name}", ${position}, is outside its limits, from ${motion.lower ?? '…'} to ${motion.upper ?? '…'}; it is drawn at ${motion.position}.`,
        );
      }
    }
    const [first] = given;
    const label =
      given.length === 1 && first
        ? `Set the position of "${index.element(first[0])?.name ?? first[0]}"`
        : `Set the positions of ${given.length} joints`;
    const command: Command = {
      type: 'batch',
      label,
      commands: given.map(([joint, position]) => ({
        type: 'update-element' as const,
        id: joint,
        changes: { attributes: { position } },
      })),
    };
    return act(program, command, () => ({ ...(warnings.length > 0 ? { warnings } : {}) }), [
      'joint-out-of-limits',
    ]);
  },
});

/** The kinematics tools, in the order Claude reads them. */
export const KINEMATICS_TOOLS: readonly Tool[] = [getKinematics, setJointPositions];
