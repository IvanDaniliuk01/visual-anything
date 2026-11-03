/**
 * Claude's space tools (ADR 0076): reading what is in physical space for a view and the element the
 * physical-space panel shows (`get_space`), posing elements (`set_pose`) and taking their poses away
 * (`clear_pose`), each call one undoable action of Claude's sent as one `set-poses`, and the guidance
 * `space`, which opens the panel, chooses what it shows, moves its camera, frames elements, or closes
 * it (`show_space`), recording nothing.
 *
 * - **Words.** The glossary avoids "root" for World in what people read: the panel "shows" an
 *   element, World or another. The field that names it stays `root`, as view states name it.
 * - **Refusals** of a pose come from the core (`invalid-pose`, `world-not-allowed`), in its words;
 *   its warnings (`pose-not-in-container`) are passed on.
 * - **Data, never instructions** (ADR 0029): names come from the model, and are given as data.
 */
import {
  MAX_GUIDANCE_TARGETS,
  MAX_JOINT_POSITION,
  MAX_SPACE_DISTANCE,
  MAX_VIEW_STATE_JOINTS,
  degreesOfRotation,
  modelIndexOf,
  poseIn,
  poseIsUsable,
  rotationFromDegrees,
  spaceMath,
  spaceOf,
  type Guidance,
  type ProjectSnapshot,
  type SpaceEntry,
} from '@visual-anything/core';
import type { Element, Id, Pose, Rotation, ViewFile } from '@visual-anything/schema';
import { z } from 'zod';
import { GUIDE, ONE_TAB, READ, WRITE, act, fail, guideApps, id, ok, tool } from './kit';
import type { Tool } from './tools';

/** The most elements one call of get_space lists, and one call of set_pose or clear_pose takes. */
export const MAX_SPACE_LISTED = 500;

/** The most posed elements a write tool's answer gives back one by one. */
const MAX_POSED_ANSWERED = 50;

/** How physical space measures, as each tool says it. */
const UNITS =
  'Physical space is in meters, right-handed, with +Y up and +Z toward the front, as glTF writes.';

/** What a pose is measured from, as the tools say it. */
const MEASURED =
  'A pose is measured from one of the element’s containers (in), under any nesting relation type, or from World when in is left out: from a posed container’s origin and axes, wherever its own pose puts them; from an anchored part’s point, with its solid’s axes; and from the origin of the solid an element shows.';

const point = () =>
  z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  });

const quaternion = () =>
  z
    .object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() })
    .describe('A unit quaternion, as glTF writes rotations.');

const degrees = () =>
  z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      z: z.number().optional(),
    })
    .describe(
      'Degrees about the fixed axes X, then Y, then Z, each 0 when left out; turned into one quaternion.',
    );

const spaceCamera = () =>
  z
    .object({
      target: point().describe(
        'The point it turns around, in meters, in the coordinates of the element the panel shows.',
      ),
      azimuth: z
        .number()
        .min(-180)
        .max(180)
        .describe('Degrees around +Y; 0 looks from +Z toward −Z, 90 from +X.'),
      elevation: z
        .number()
        .min(-89)
        .max(89)
        .describe('Degrees above the horizon, or below it when negative.'),
      distance: z
        .number()
        .positive()
        .max(MAX_SPACE_DISTANCE)
        .describe('How far from the target, in meters.'),
    })
    .describe('Where the physical-space panel looks from.');

/** The physical-space panel in a view state, as get_view_address, open_app and the tours take it. */
export const SPACE_PART = z
  .object({
    root: id()
      .optional()
      .describe(
        'The element the panel shows, at its origin, with what is posed or anchored in it; World, by its id or when left out.',
      ),
    camera: spaceCamera()
      .optional()
      .describe('Where the panel looks; left out, it fits what it draws.'),
    cut: z
      .object({
        axis: z.enum(['x', 'y', 'z']),
        at: z.number().describe('Where the plane crosses the axis, in meters.'),
        keep: z.enum(['below', 'above']).describe('The side kept.'),
      })
      .optional()
      .describe('A cutting plane across one axis, keeping one side of it.'),
    explode: z
      .number()
      .min(0)
      .max(2)
      .optional()
      .describe('How far each part moves away from the middle of what holds it: 0 to 2.'),
    relations: z.boolean().optional().describe('Draws the selection’s relations in space.'),
    names: z.boolean().optional().describe('Writes names for the parts nearest the camera.'),
    joints: z
      .record(id(), z.number().min(-MAX_JOINT_POSITION).max(MAX_JOINT_POSITION))
      .optional()
      .describe(
        `Joints' positions the panel shows over their stored ones, by joint id (get_kinematics lists them): degrees for a joint that turns, meters for one that slides; at most ${MAX_VIEW_STATE_JOINTS}. Nothing is stored; a tour's step glides them from the step before.`,
      ),
  })
  .describe(
    'The physical-space panel, open beside the canvas: {} opens it as it opens; left out, it is closed.',
  );

/** What get_view_address and open_app say of the panel in a view state. */
export const SPACE_HELP =
  'space opens the physical-space panel beside the canvas, which shows the elements in physical space where they are: root is the element it shows (World when left out), camera where it looks from, in meters in that element’s coordinates, cut a cutting plane, explode an exploded view, relations and names what it draws, joints the positions its joints are shown at; { "space": {} } opens it alone.';

const getSpace = tool({
  name: 'get_space',
  title: 'Read what is in physical space',
  description: `Reads what is in physical space for a view and for the element the physical-space panel shows (World when root is left out), as the panel draws it: each element with its id and name; how it is there (shown: the element the panel shows, at the origin; posed: by its pose; anchored: drawn as a named part of the solid of the element that holds it); what it is posed or anchored in; its stored pose; its place in meters and its rotation, as a quaternion and as degrees about X, then Y, then Z, about fixed axes, in the coordinates of the element the panel shows; its solid and its part; the collapsed container it is drawn as (drawnAs); and the containers the view does not show, through which a shown element is in physical space, drawn faintly (faint). It also names the poses kept and not used, whose in is not one of their element's containers.

${UNITS} An element is in physical space when it is posed in an element in physical space, or in World, or when it is anchored to a part of a solid shown there; an element that shows a solid is not in physical space until it is posed. With view left out it reads the whole model, as no view's scope or collapsed containers apply. At most ${MAX_SPACE_LISTED} elements a call, from offset; total says how many there are.

Then set_pose poses elements, clear_pose takes poses away, and show_space shows the panel to the person.

Example: { "view": "workcell" }
Example: { "view": "workcell", "root": "arm" }
Example: { "root": "world", "offset": 500, "limit": 500 }`,
  input: {
    view: id()
      .optional()
      .describe('The view whose scope and collapsed containers apply; left out, the whole model.'),
    root: id().optional().describe('The element the panel shows, by id; World when left out.'),
    offset: z.number().int().min(0).optional().describe('The first element to list, from 0.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_SPACE_LISTED)
      .optional()
      .describe(`At most this many elements; ${MAX_SPACE_LISTED} by default.`),
  },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const view = args.view === undefined ? undefined : viewOf(state, args.view);
    if (view === null) return fail(`There is no view "${args.view ?? ''}".`);
    const index = modelIndexOf(state);
    const shown = args.root === undefined ? index.world : index.element(args.root);
    if (shown === undefined) {
      return fail(
        `There is no element "${args.root ?? ''}" for the panel to show. Use find_elements to find the right one, or leave root out for World.`,
      );
    }
    const space = spaceOf(state, view, shown.id);
    const all: { entry: SpaceEntry; faint: boolean }[] = [
      ...[...space.entries.values()].map((entry) => ({ entry, faint: false })),
      ...[...space.faint.values()].map((entry) => ({ entry, faint: true })),
    ];
    const offset = args.offset ?? 0;
    const limit = args.limit ?? MAX_SPACE_LISTED;
    const listed = all.slice(offset, offset + limit);
    const more = all.length - offset - listed.length;
    const unused = posesNotUsed(state);
    return ok({
      view: view?.id ?? null,
      ...(view === undefined
        ? { note: 'No view was named: this is the whole model, as no view’s scope applies.' }
        : {}),
      shows: { id: shown.id, name: shown.name },
      units: `${UNITS} Places and rotations are in the coordinates of "${shown.name}".`,
      total: all.length,
      offset,
      items: listed.map(({ entry, faint }) => itemOf(state, entry, faint)),
      ...(more > 0 ? { more, next: `Call again with offset ${offset + listed.length}.` } : {}),
      ...(unused.length > 0
        ? {
            posesNotUsed: unused.slice(0, MAX_POSED_ANSWERED),
            ...(unused.length > MAX_POSED_ANSWERED
              ? { morePosesNotUsed: unused.length - MAX_POSED_ANSWERED }
              : {}),
          }
        : {}),
    });
  },
});

const setPose = tool({
  name: 'set_pose',
  title: 'Pose elements in physical space',
  description: `Poses one element or several in physical space, as one undoable action of yours: where each is (at, in meters) and which way it is turned (rotation, a unit quaternion, or degrees about X, then Y, then Z, about fixed axes; not both), measured from in, one of its containers, or World when in is left out. Each pose replaces the element's pose whole; a rotation left out, or of no turn, is not turned. An element is in physical space at most once, wherever it sits on the canvas.

${MEASURED} ${UNITS}

With at left out, the element stays where it is in physical space under World, measured from in now, which changes the container it is measured from and keeps its place; with rotation or degrees too, it turns there. Coordinates go at most 1,000 km from the container either way. An element anchored to a part of a solid is drawn as that part, and its pose is kept and not used. get_space reads where things are; clear_pose takes a pose away.

Example: { "poses": [{ "element": "wrist-camera", "in": "wrist", "at": { "x": 0, "y": 0.04, "z": 0.03 }, "degrees": { "z": 90 } }] }
Example: { "poses": [{ "element": "bin-a", "in": "workcell", "at": { "x": 0.6, "y": 0, "z": -0.4 } }, { "element": "bin-b", "in": "workcell", "at": { "x": -0.6, "y": 0, "z": -0.4 }, "rotation": { "x": 0, "y": 0.7071068, "z": 0, "w": 0.7071068 } }] }
Example, keeping its place while it is measured from World: { "poses": [{ "element": "wrist-camera" }] }`,
  input: {
    poses: z
      .array(
        z.object({
          element: id().describe('The element to pose.'),
          in: id()
            .optional()
            .describe('One of its containers to measure from; World when left out.'),
          at: point()
            .optional()
            .describe('Where its origin is, in meters; left out, where it is now.'),
          rotation: quaternion().optional(),
          degrees: degrees().optional(),
        }),
      )
      .min(1)
      .max(MAX_SPACE_LISTED),
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    const index = modelIndexOf(state);
    const poses: { element: Id; pose: Pose }[] = [];
    for (const given of args.poses) {
      const element = index.element(given.element);
      if (!element) {
        return fail(
          `There is no element "${given.element}". Use find_elements or get_space to find the right one.`,
        );
      }
      const planned = poseFor(state, element, given);
      if (!planned.ok) return fail(planned.message);
      poses.push({ element: element.id, pose: planned.pose });
    }
    return act(program, { type: 'set-poses', poses }, async () => ({
      posed: posedAnswer(
        await program.project(),
        poses.map((each) => each.element),
      ),
      ...(poses.length > MAX_POSED_ANSWERED
        ? { morePosed: poses.length - MAX_POSED_ANSWERED }
        : {}),
    }));
  },
});

const clearPose = tool({
  name: 'clear_pose',
  title: 'Take elements out of physical space',
  description: `Takes the poses of one element or several away, as one undoable action of yours: they leave physical space, with what was posed in them, unless they are anchored to a part of a solid, which places them whatever their pose. On the canvas nothing moves. An element without a pose changes nothing.

Example: { "elements": ["wrist-camera"] }
Example: { "elements": ["bin-a", "bin-b"] }`,
  input: {
    elements: z.array(id()).min(1).max(MAX_SPACE_LISTED).describe('The elements, by id.'),
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    const index = modelIndexOf(state);
    const unknown = args.elements.filter((each) => index.element(each) === undefined);
    if (unknown.length > 0) {
      return fail(
        `There is no element ${unknown.map((each) => `"${each}"`).join(', ')}. Use find_elements or get_space to find the right ones.`,
      );
    }
    return act(program, {
      type: 'set-poses',
      poses: args.elements.map((element) => ({ element, pose: null })),
    });
  },
});

const showSpace = tool({
  name: 'show_space',
  title: 'Show the physical-space panel',
  description: `Opens the physical-space panel beside the canvas in the open apps, as the person's Physical space does, or keeps it open: it shows root, World or another element, at its origin with what is posed or anchored in it, or what it shows already when root is left out; then it looks from camera, in meters in that element's coordinates, or frames the elements of frame, never both. close: true closes it, and takes nothing else. It changes nothing in the project and records nothing: the person moves the panel's camera, chooses what it shows and closes it at will, and the canvas stays as it is. Use it to show the person where something is, beside the view that describes it; get_space says what the panel can show and where.

${UNITS} The camera's azimuth is degrees around +Y, 0 looking from +Z toward −Z and 90 from +X; its elevation is degrees above the horizon. ${ONE_TAB}

Example: { "root": "world", "frame": ["robot-arm", "bin-a"] }
Example: { "view": "workcell", "root": "arm", "camera": { "target": { "x": 0, "y": 0.8, "z": 0 }, "azimuth": 45, "elevation": 20, "distance": 2.5 } }
Example: { "close": true }`,
  input: {
    root: id()
      .optional()
      .describe(
        'The element the panel shows, by id, World’s included; left out, what it shows now.',
      ),
    camera: spaceCamera().optional(),
    frame: z
      .array(id())
      .min(1)
      .max(MAX_GUIDANCE_TARGETS)
      .optional()
      .describe('Elements to frame, which must be in physical space under the element it shows.'),
    view: id()
      .optional()
      .describe(`The view to open first; left out, the view the person has open. ${ONE_TAB}`),
    close: z.literal(true).optional().describe('Closes the panel.'),
  },
  hints: GUIDE,
  run: async (args, program) => {
    const state = await program.project();
    const view = args.view === undefined ? undefined : viewOf(state, args.view);
    if (view === null) return fail(`There is no view "${args.view ?? ''}".`);
    const index = modelIndexOf(state);
    const shown = args.root === undefined ? undefined : index.element(args.root);
    if (args.root !== undefined && shown === undefined) {
      return fail(
        `There is no element "${args.root}" for the panel to show. Use find_elements or get_space to find the right one.`,
      );
    }
    const notes: string[] = [];
    if (args.frame !== undefined) {
      const unknown = args.frame.filter((each) => index.element(each) === undefined);
      if (unknown.length > 0) {
        return fail(
          `There is no element ${unknown.map((each) => `"${each}"`).join(', ')}. Use get_space to find what the panel can frame.`,
        );
      }
      const space = spaceOf(state, view, shown?.id);
      const outside = args.frame.filter(
        (each) => !space.entries.has(each) && !space.faint.has(each),
      );
      const under = shown ?? index.world;
      const names = outside.map((each) => `"${index.element(each)?.name ?? each}"`).join(', ');
      if (outside.length > 0 && shown !== undefined) {
        return fail(
          `${names} ${outside.length === 1 ? 'is' : 'are'} not in physical space under "${under.name}"${view === undefined ? '' : ` as the view "${view.name}" shows it`}, so the panel cannot frame ${outside.length === 1 ? 'it' : 'them'}. get_space says what is; set_pose poses an element.`,
        );
      }
      if (outside.length > 0) {
        notes.push(
          `${names} ${outside.length === 1 ? 'is' : 'are'} not in physical space under World: the panel frames ${outside.length === 1 ? 'it' : 'them'} only while it shows an element ${outside.length === 1 ? 'it is' : 'they are'} posed or anchored in.`,
        );
      }
    }
    const guidance: Guidance = {
      kind: 'space',
      ...(args.close === undefined ? {} : { close: args.close }),
      ...(args.root === undefined ? {} : { root: args.root }),
      ...(args.camera === undefined ? {} : { camera: args.camera }),
      ...(args.frame === undefined ? {} : { frame: args.frame }),
      ...(args.view === undefined ? {} : { view: args.view }),
    };
    return guideApps(program, guidance, {
      ...(shown === undefined ? {} : { shows: { id: shown.id, name: shown.name } }),
      recorded: 'Nothing: the panel changes nothing stored.',
      ...(notes.length > 0 ? { warnings: notes } : {}),
    });
  },
});

/** Claude's space tools, in the order Claude reads them. */
export const SPACE_TOOLS: readonly Tool[] = [getSpace, setPose, clearPose, showSpace];

// ——— Helpers ———

/** A view by id; `null` when the project has none such. */
function viewOf(state: ProjectSnapshot, viewId: Id): ViewFile | null {
  return state.views.find((each) => each.id === viewId) ?? null;
}

/** A length in meters to the micrometer, with no negative zero. */
function meters(value: number): number {
  return plain(Math.round(value * 1e6) / 1e6);
}

/** A quaternion's part to seven places, as the ADR writes them. */
function unit(value: number): number {
  return plain(Math.round(value * 1e7) / 1e7);
}

/** Degrees to a ten-thousandth. */
function degreesRounded(value: number): number {
  return plain(Math.round(value * 1e4) / 1e4);
}

function plain(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

/** Where a matrix puts an origin, and how it turns, as the tools give them. */
function placeOf(matrix: SpaceEntry['matrix']) {
  const { at, rotation } = spaceMath.decompose(matrix);
  const turned = degreesOfRotation(rotation);
  return {
    at: { x: meters(at.x), y: meters(at.y), z: meters(at.z) },
    rotation: {
      x: unit(rotation.x),
      y: unit(rotation.y),
      z: unit(rotation.z),
      w: unit(rotation.w),
    },
    degrees: {
      x: degreesRounded(turned.x),
      y: degreesRounded(turned.y),
      z: degreesRounded(turned.z),
    },
  };
}

/** One element in physical space, as get_space lists it. */
function itemOf(state: ProjectSnapshot, entry: SpaceEntry, faint: boolean) {
  const index = modelIndexOf(state);
  const element = index.element(entry.element);
  const named = (each: Id) => ({ id: each, name: index.element(each)?.name ?? each });
  const how = entry.how === 'root' ? 'shown' : entry.how;
  const place = placeOf(entry.matrix);
  return {
    id: entry.element,
    name: element?.name ?? entry.element,
    how,
    ...(entry.in === undefined ? {} : { in: named(entry.in) }),
    ...(element?.pose === undefined ? {} : { pose: element.pose }),
    ...(element?.pose !== undefined && entry.how === 'anchored'
      ? {
          poseUnused:
            'Kept and not used: it is anchored to a part of its container’s solid, which places it.',
        }
      : {}),
    ...place,
    ...(entry.solid === undefined
      ? {}
      : { solid: { id: entry.solid.id, name: entry.solid.definition.name } }),
    ...(entry.part === undefined ? {} : { part: entry.part }),
    ...(entry.drawnAs === undefined ? {} : { drawnAs: named(entry.drawnAs) }),
    ...(faint ? { faint: true } : {}),
  };
}

/** The poses kept and not used, whose `in` is not one of their element's containers. */
function posesNotUsed(state: ProjectSnapshot) {
  const index = modelIndexOf(state);
  return state.model.elements.flatMap((element) => {
    const pose = element.pose;
    if (pose === undefined || poseIsUsable(pose, element.id, index)) return [];
    const container = pose.in as Id;
    const named = index.element(container)?.name;
    return [
      {
        id: element.id,
        name: element.name,
        in: container,
        why:
          named === undefined
            ? `Its pose is measured from "${container}", which is gone.`
            : `Its pose is measured from "${named}", which is not one of its containers.`,
      },
    ];
  });
}

/** What one entry of set_pose asks for. */
interface PoseArgs {
  in?: Id | undefined;
  at?: { x: number; y: number; z: number } | undefined;
  rotation?: Rotation | undefined;
  degrees?: { x?: number | undefined; y?: number | undefined; z?: number | undefined } | undefined;
}

/** The pose one entry of set_pose asks for, or why it asks for none; the core checks the rest. */
function poseFor(
  state: ProjectSnapshot,
  element: Element,
  given: PoseArgs,
): { ok: true; pose: Pose } | { ok: false; message: string } {
  if (given.rotation !== undefined && given.degrees !== undefined) {
    return {
      ok: false,
      message: `"${element.name}": give rotation or degrees, not both. Nothing changed.`,
    };
  }
  const asked =
    given.degrees === undefined
      ? given.rotation
      : rotationFromDegrees(given.degrees.x ?? 0, given.degrees.y ?? 0, given.degrees.z ?? 0);
  const turnGiven = given.rotation !== undefined || given.degrees !== undefined;
  const container = given.in;
  if (given.at !== undefined) {
    return { ok: true, pose: posed(container, given.at, asked) };
  }
  // Where it is now, measured from the container it is posed in from now on.
  const kept = poseIn(state, element.id, container);
  if (kept === undefined) {
    const placed = spaceOf(state);
    const why = !placed.entries.has(element.id)
      ? `"${element.name}" is not in physical space under World`
      : `"${modelIndexOf(state).element(container ?? '')?.name ?? container ?? ''}" is not in physical space under World`;
    return {
      ok: false,
      message: `${why}, so there is no place to keep: give at. Nothing changed.`,
    };
  }
  return {
    ok: true,
    pose: posed(container, kept.at, turnGiven ? asked : kept.rotation),
  };
}

/** A pose as set-poses takes it: `in` as given, and a rotation only when it turns. */
function posed(
  container: Id | undefined,
  at: { x: number; y: number; z: number },
  rotation: Rotation | undefined,
): Pose {
  return {
    ...(container === undefined ? {} : { in: container }),
    at: { x: at.x, y: at.y, z: at.z },
    ...(rotation === undefined || noTurn(rotation) ? {} : { rotation }),
  };
}

/** Whether a quaternion turns nothing, either sign of it. */
function noTurn(rotation: Rotation): boolean {
  const near = (value: number) => Math.abs(value) < 1e-12;
  return near(rotation.x) && near(rotation.y) && near(rotation.z) && near(Math.abs(rotation.w) - 1);
}

/** What set_pose answers of each element it posed: its pose now, and where it is under World. */
function posedAnswer(state: ProjectSnapshot, elements: readonly Id[]) {
  const index = modelIndexOf(state);
  const space = spaceOf(state);
  return elements.slice(0, MAX_POSED_ANSWERED).map((each) => {
    const entry = space.entries.get(each);
    const place = entry === undefined ? undefined : placeOf(entry.matrix);
    return {
      id: each,
      name: index.element(each)?.name ?? each,
      ...(index.element(each)?.pose === undefined ? {} : { pose: index.element(each)?.pose }),
      inWorld:
        place === undefined
          ? 'Not in physical space under World: what it is posed in is not, or it is anchored to a part of a solid that is not.'
          : { at: place.at, degrees: place.degrees },
    };
  });
}
