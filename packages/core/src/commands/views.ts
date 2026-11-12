/** Commands on views: the views themselves, where their shapes sit, and their free shapes. */
import { checkedExplorableShape } from './explorables';
import type {
  FreeShape,
  Id,
  MediaFormat,
  MediaRef,
  ShapePosition,
  ViewFile,
} from '@visual-anything/schema';
import { MEDIA_CAPS, isVideoFormat } from '../media/clean';
import { VIDEO_CAPS } from '../media/video';
import { slug } from '../ids';
import { nestingTypesInView } from '../containers';
import { appearanceOf } from '../definitions';
import { shapesInView } from '../scope-placement';
import {
  BULK,
  holdsKey,
  itemsOf,
  keyOf,
  positionKey,
  type Collection,
  type Item,
  type ViewProperties,
} from '../operations';
import {
  compact,
  count,
  nameOf,
  reject,
  requireList,
  requireName,
  requireNumber,
  sameJson,
  type Draft,
} from './draft';
import { followRoutes } from './follow';
import { fileNewView, unfileView } from './view-folders';
import { checkedColor } from './traits';
import type {
  CreateFreeShapeCommand,
  CreateViewCommand,
  DeleteFreeShapesCommand,
  DeleteViewCommand,
  FreeShapeChanges,
  NewFreeShape,
  PositionChange,
  RemovePositionsCommand,
  SetPositionsCommand,
  UpdateFreeShapeCommand,
  UpdateViewCommand,
} from './types';

export function createView(draft: Draft, command: CreateViewCommand): string {
  const { view } = command;
  const name = requireName(view.name, 'A view');
  const nesting = view.nestingRelationTypes ?? [...draft.definitions.nestingRelationTypes];
  checkNestingTypes(draft, nesting);
  const id = draft.idFor(view.id, slug(name, 'view'));
  const created: ViewFile = compact({
    id,
    name,
    description: view.description,
    perspective: perspectiveOf(view.perspective),
    nestingRelationTypes: [...nesting],
    positions: [],
    freeShapes: [],
  });
  draft.apply({
    op: 'insert',
    collection: { name: 'views' },
    index: draft.state.views.length,
    item: created,
  });
  draft.created.push(id);
  if (command.folder !== undefined) fileNewView(draft, id, command.folder);
  return `Create the view "${name}"`;
}

export function updateView(draft: Draft, command: UpdateViewCommand): string {
  const current = viewProperties(draft.view(command.id));
  const { changes } = command;
  const next = { ...current };
  if (changes.name !== undefined) next.name = requireName(changes.name, 'A view');
  if (changes.description === null) delete next.description;
  else if (changes.description !== undefined) next.description = changes.description;
  if (changes.perspective !== undefined) next.perspective = perspectiveOf(changes.perspective);
  if (changes.nestingRelationTypes !== undefined) {
    checkNestingTypes(draft, changes.nestingRelationTypes);
    // A relation type the view leaves out draws no lines there; nesting by it would draw it (ADR 0064).
    const leftOut = new Set((current.relationTypesLeftOut ?? []).map((each) => each.relationType));
    for (const id of changes.nestingRelationTypes) {
      if (!leftOut.has(id)) continue;
      reject(
        'in-use',
        `The view "${current.name}" leaves out "${draft.relationType(id).name}", so it cannot nest by it: draw its relations in the view again first.`,
        [id],
      );
    }
    next.nestingRelationTypes = [...changes.nestingRelationTypes];
  }
  if (changes.routeStyle === null) delete next.routeStyle;
  else if (changes.routeStyle !== undefined) {
    if (changes.routeStyle !== 'straight' && changes.routeStyle !== 'curved') {
      reject(
        'invalid-command',
        `A view draws its automatic routes straight or curved, or orthogonal with null, not ${JSON.stringify(changes.routeStyle)}.`,
      );
    }
    next.routeStyle = changes.routeStyle;
  }
  if (changes.rows !== undefined) {
    if (changes.rows !== null && changes.rows !== 'all' && changes.rows !== 'keys') {
      reject(
        'invalid-command',
        `A view draws every row ("all", or null) or only key rows ("keys"), not ${JSON.stringify(changes.rows)}.`,
      );
    }
    if (changes.rows === 'keys') next.rows = 'keys';
    else delete next.rows;
  }
  if (changes.selectionFadesLines !== undefined) {
    const fades = changes.selectionFadesLines;
    if (fades !== null && typeof fades !== 'boolean') {
      reject(
        'invalid-command',
        `Whether selecting fades the other lines is true, false or null, not ${JSON.stringify(fades)}.`,
      );
    }
    if (fades === false) next.selectionFadesLines = false;
    else delete next.selectionFadesLines;
  }
  draft.apply({ op: 'set-view', view: current.id, properties: next });
  return `Edit the view "${next.name}"`;
}

export function deleteView(draft: Draft, command: DeleteViewCommand): string {
  const view = draft.view(command.id);
  const users = draft.state.scenarios.filter((scenario) => scenario.view === view.id);
  if (users.length > 0) {
    reject(
      'in-use',
      `The view "${view.name}" cannot be deleted: ${users.map((each) => `"${each.name}"`).join(', ')} play over it.`,
      users.map((each) => each.id),
    );
  }
  draft.apply({ op: 'remove', collection: { name: 'views' }, key: view.id });
  unfileView(draft, view.id);
  return `Delete the view "${view.name}"`;
}

export function setPositions(draft: Draft, command: SetPositionsCommand): string {
  const view = draft.view(command.view);
  const positions = requireList(command.positions, 'positions');
  if (positions.length === 0) reject('invalid-command', 'No positions were given.');
  putPositions(draft, view.id, positions);
  // A route by hand follows its ends, in the same action (ADR 0039's clarification of 2026-10-30).
  followRoutes(draft, view.id, view);
  const first = positions[0] as ShapePosition;
  return positions.length === 1
    ? `Move "${nameOf(draft.index, first.element)}" in "${view.name}"`
    : `Move ${count(positions.length, 'shape')} in "${view.name}"`;
}

/**
 * Sets positions in a view, replacing the ones with the same element and container. A position with
 * a container needs the element to sit in it under one of the view's nesting relation types.
 */
export function putPositions(draft: Draft, viewId: Id, positions: readonly PositionChange[]): void {
  const view = draft.view(viewId);
  const stored = new Map(view.positions.map((position) => [positionKey(position), position]));
  // The same rule as the canvas: the types the view lists that a package in use defines and that nest.
  const nesting = new Set(nestingTypesInView(draft.state, view));
  const keys = new Set<string>();
  const checked = positions.map((position) => {
    const element = draft.element(position.element);
    if (element.id === draft.index.world.id) {
      reject('world-not-allowed', 'World has no shape; it is the canvas itself.', [element.id]);
    }
    if (position.container !== undefined) {
      const container = draft.element(position.container);
      const inside = draft.index
        .relationsOn(element.id)
        .some(
          (relation) =>
            relation.from === element.id &&
            relation.to === container.id &&
            nesting.has(relation.relationType),
        );
      // In a view with a scope, a shape sits in its nearest container that shows (ADR-0040).
      const sits =
        inside ||
        (view.scope !== undefined &&
          (shapesInView(draft.state, view).containersOf(element.id) ?? []).includes(container.id));
      if (!sits) {
        reject(
          'unknown-position',
          `"${element.name}" does not sit inside "${container.name}" in the view "${view.name}".`,
          [element.id, container.id],
        );
      }
      if (appearanceOf(container, draft.definitions).contentsAsRows) {
        reject(
          'position-of-row',
          `"${element.name}" is a row of "${container.name}", which places its rows in the model's order; a row has no position of its own.`,
          [element.id, container.id],
        );
      }
    }
    const key = positionKey(position);
    if (keys.has(key)) reject('invalid-command', `The position of "${key}" is given twice.`);
    keys.add(key);
    return compact({
      element: element.id,
      container: position.container,
      x: requireNumber(position.x, 'x'),
      y: requireNumber(position.y, 'y'),
      width:
        position.width === undefined ? undefined : requireNumber(position.width, 'A width', true),
      height:
        position.height === undefined
          ? undefined
          : requireNumber(position.height, 'A height', true),
      pinned: position.pinned ? true : undefined,
      ...turnOf(position, stored.get(key)),
    });
  });
  upsert(draft, { name: 'positions', view: view.id }, view.positions, checked);
}

const FLIPS = ['horizontal', 'vertical', 'both'] as const;

/**
 * A shape's turn and mirroring after a position is set (ADR 0088): what the change gives, `0` or
 * `none` taking it out, and otherwise what was stored, so that layout and moves, which never name
 * them, keep them. A rotation is kept from 0 up to 360, which is 0 again.
 */
function turnOf(
  change: PositionChange,
  stored: ShapePosition | undefined,
): Pick<ShapePosition, 'rotation' | 'flip'> {
  let rotation = stored?.rotation;
  if (change.rotation !== undefined) {
    const { rotation: asked } = change;
    if (typeof asked !== 'number' || !Number.isFinite(asked) || Math.abs(asked) > 3600) {
      reject('invalid-command', 'A turn (rotation) is a number of degrees from -3,600 to 3,600.');
    }
    const turned = ((asked % 360) + 360) % 360;
    rotation = turned === 0 ? undefined : turned;
  }
  let flip = stored?.flip;
  if (change.flip !== undefined) {
    if (change.flip !== 'none' && !FLIPS.includes(change.flip)) {
      reject(
        'invalid-command',
        'A shape is mirrored (flip) "horizontal", "vertical", "both" or "none".',
      );
    }
    flip = change.flip === 'none' ? undefined : change.flip;
  }
  return {
    ...(rotation === undefined ? {} : { rotation }),
    ...(flip === undefined ? {} : { flip }),
  };
}

export function removePositions(draft: Draft, command: RemovePositionsCommand): string {
  const view = draft.view(command.view);
  const asked = requireList(command.positions, 'positions');
  if (asked.length === 0) reject('invalid-command', 'No positions were given.');
  const existing = new Set(view.positions.map(positionKey));
  const keys = new Set<string>();
  for (const position of asked) {
    const key = positionKey(position);
    if (!existing.has(key)) {
      reject('unknown-position', `The view "${view.name}" stores no position for "${key}".`, [
        position.element,
      ]);
    }
    keys.add(key);
  }
  const collection: Collection = { name: 'positions', view: view.id };
  if (keys.size > BULK) {
    const items = view.positions.filter((position) => !keys.has(positionKey(position)));
    draft.apply({ op: 'replace-all', collection, items });
  } else {
    for (const key of keys) draft.apply({ op: 'remove', collection, key });
  }
  const first = asked[0] as { element: Id };
  return keys.size === 1
    ? `Let layout place "${nameOf(draft.index, first.element)}" in "${view.name}"`
    : `Let layout place ${count(keys.size, 'shape')} in "${view.name}"`;
}

export function createFreeShape(draft: Draft, command: CreateFreeShapeCommand): string {
  const view = draft.view(command.view);
  const taken = new Set(view.freeShapes.map((shape) => shape.id));
  const id = draft.idFor(command.shape.id, idPrefixOf(command.shape), (each) => taken.has(each));
  const shape = checkedFreeShape({ ...command.shape, id }, view.name);
  draft.apply({
    op: 'insert',
    collection: { name: 'freeShapes', view: view.id },
    index: view.freeShapes.length,
    item: shape,
  });
  draft.created.push(id);
  return `Add ${nounOf(shape)} to "${view.name}"`;
}

/** What a new free shape's id starts with: its kind, or "video" for a video (ADR 0098, stage 2). */
function idPrefixOf(shape: NewFreeShape): string {
  const media = (shape as { media?: { format?: unknown } }).media;
  if (shape.kind === 'picture' && typeof media?.format === 'string') {
    if (VIDEO_FORMATS.has(media.format)) return 'video';
  }
  return shape.kind ?? 'shape';
}

/** What a history label calls a free shape: by its kind, a video as a video. */
function nounOf(shape: FreeShape): string {
  return shape.kind === 'picture' && isVideoFormat(shape.media.format)
    ? 'a video'
    : FREE_SHAPE_NOUN[shape.kind];
}

export function updateFreeShape(draft: Draft, command: UpdateFreeShapeCommand): string {
  const view = draft.view(command.view);
  const partly = command.id !== undefined || command.changes !== undefined;
  if (command.shape !== undefined && partly) {
    reject(
      'invalid-command',
      'update-free-shape takes the free shape whole in "shape", or its "id" with "changes", not both.',
    );
  }
  if (command.shape === undefined && (command.id === undefined || command.changes === undefined)) {
    reject(
      'invalid-command',
      'update-free-shape needs the free shape whole in "shape", or its "id" with "changes".',
    );
  }
  const id = command.shape === undefined ? command.id : command.shape.id;
  if (typeof id !== 'string') {
    reject(
      'invalid-command',
      'update-free-shape needs the id of the free shape it replaces in "shape.id".',
    );
  }
  const current = view.freeShapes.find((each) => each.id === id);
  const unknown = (): never =>
    reject('unknown-free-shape', `The view "${view.name}" has no free shape "${id}".`, [id]);
  if (command.shape === undefined && current === undefined) unknown();
  const next =
    command.shape ?? mergedFreeShape(current as FreeShape, command.changes as FreeShapeChanges);
  const shape = checkedFreeShape(next, view.name, current);
  if (current === undefined) return unknown();
  draft.apply({ op: 'replace', collection: { name: 'freeShapes', view: view.id }, item: shape });
  const colorsOnly =
    (shape.kind === 'note' || shape.kind === 'arrow') &&
    current.kind === shape.kind &&
    !sameJson(current, shape) &&
    sameJson(withoutColors(current), withoutColors(shape));
  if (colorsOnly) {
    // "Reset …" when the change leaves the shape no color of its own (ADR 0035).
    const colored =
      shape.stroke !== undefined || (shape.kind === 'note' && shape.fill !== undefined);
    const verb = colored ? 'Change' : 'Reset';
    return shape.kind === 'note'
      ? `${verb} the colors of a note in "${view.name}"`
      : `${verb} the color of an arrow in "${view.name}"`;
  }
  return `Edit ${nounOf(shape)} in "${view.name}"`;
}

/** The parts each kind of free shape lets `changes` set. */
const FREE_SHAPE_PARTS: Record<FreeShape['kind'], readonly (keyof FreeShapeChanges)[]> = {
  note: ['x', 'y', 'width', 'height', 'text', 'fill', 'stroke'],
  arrow: ['from', 'to', 'stroke'],
  picture: ['x', 'y', 'width', 'height', 'media', 'poster', 'name'],
  explorable: ['x', 'y', 'width', 'height', 'explorable', 'element', 'name'],
};

/** What a refusal calls each kind of free shape, at the start of a sentence. */
const FREE_SHAPE_SUBJECT: Record<FreeShape['kind'], string> = {
  note: 'A note',
  arrow: 'An arrow',
  picture: 'A picture',
  explorable: 'An explorable',
};

/**
 * A free shape with changes merged over it (ADR 0104): each part its kind has, `null` taking an
 * optional one out. A part its kind does not have is refused, naming the ones it has.
 */
function mergedFreeShape(current: FreeShape, changes: FreeShapeChanges): FreeShape {
  const parts = FREE_SHAPE_PARTS[current.kind];
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    if (!parts.includes(key as keyof FreeShapeChanges)) {
      reject(
        'invalid-command',
        `${FREE_SHAPE_SUBJECT[current.kind]} has no "${key}": it takes ${parts.join(', ')}.`,
      );
    }
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged as unknown as FreeShape;
}

/** What a history label calls each kind of free shape. */
const FREE_SHAPE_NOUN: Record<FreeShape['kind'], string> = {
  note: 'a note',
  arrow: 'an arrow',
  picture: 'a picture',
  explorable: 'an explorable',
};

/** A free shape without its colors, to tell a change of color from any other change. */
function withoutColors(shape: FreeShape): object {
  return Object.fromEntries(
    Object.entries(shape).filter(([key]) => key !== 'fill' && key !== 'stroke'),
  );
}

export function deleteFreeShapes(draft: Draft, command: DeleteFreeShapesCommand): string {
  const view = draft.view(command.view);
  const ids = new Set(requireList(command.ids, 'ids'));
  if (ids.size === 0) reject('invalid-command', 'No free shapes were given.');
  for (const id of ids) {
    if (!view.freeShapes.some((each) => each.id === id)) {
      reject('unknown-free-shape', `The view "${view.name}" has no free shape "${id}".`, [id]);
    }
    draft.apply({ op: 'remove', collection: { name: 'freeShapes', view: view.id }, key: id });
  }
  return `Delete ${count(ids.size, 'free shape')} from "${view.name}"`;
}

/** Inserts new items at the end of a list and replaces the ones with the same key, in one go. */
function upsert<T extends Item>(
  draft: Draft,
  collection: Collection,
  current: readonly T[],
  items: readonly T[],
): void {
  const keyOfItem = (item: T) => keyOf(collection, item);
  if (items.length > BULK) {
    const byKey = new Map(items.map((item) => [keyOfItem(item), item]));
    const next: T[] = current.map((item) => byKey.get(keyOfItem(item)) ?? item);
    const existing = new Set(current.map(keyOfItem));
    for (const item of items) if (!existing.has(keyOfItem(item))) next.push(item);
    draft.apply({ op: 'replace-all', collection, items: next });
    return;
  }
  // Each item is looked up in the list as it is now, through the places the list keeps, so that
  // putting one item in a long list costs no pass over it.
  for (const item of items) {
    const list = itemsOf(draft.state, collection);
    if (holdsKey(collection, list, keyOfItem(item))) {
      draft.apply({ op: 'replace', collection, item });
    } else {
      draft.apply({ op: 'insert', collection, index: list.length, item });
    }
  }
}

/** A view without its shapes and their stacking order: what `set-view` replaces. */
export function viewProperties(view: ViewFile): ViewProperties {
  const properties: Partial<ViewFile> = { ...view };
  delete properties.positions;
  delete properties.freeShapes;
  delete properties.stackingOrder;
  delete properties.routes;
  return properties as ViewProperties;
}

function checkNestingTypes(draft: Draft, ids: readonly Id[]): void {
  const seen = new Set<Id>();
  for (const id of requireList(ids, 'nesting relation types')) {
    const type = draft.relationType(id);
    if (!type.nests) {
      reject('not-nesting', `The relation type "${type.name}" does not nest.`, [id]);
    }
    if (seen.has(id)) {
      reject('invalid-command', `The nesting relation type "${type.name}" is given twice.`, [id]);
    }
    seen.add(id);
  }
}

function perspectiveOf(perspective: { name: string; description?: string } | undefined) {
  return compact({
    name: requireName(perspective?.name, 'A perspective'),
    description: perspective?.description,
  });
}

/**
 * A free shape a command sets, checked, with the colors of its own: a note's fill and stroke and an
 * arrow's stroke, kept in the spelling `stored`, the shape as it is, gives the same color (ADR-0035).
 */
function checkedFreeShape(
  shape: FreeShape | NewFreeShape,
  viewName: string,
  stored?: FreeShape,
): FreeShape {
  const color = (value: unknown, trait: string, of: string, kept: unknown) =>
    value === undefined ? undefined : checkedColor(value, trait, of, kept);
  if (shape.kind === 'note') {
    if (typeof shape.text !== 'string') reject('invalid-command', 'A note needs text.');
    const of = `a note in "${viewName}"`;
    const before = stored?.kind === 'note' ? stored : undefined;
    return compact({
      kind: 'note',
      id: (shape as FreeShape).id,
      x: requireNumber(shape.x, 'x'),
      y: requireNumber(shape.y, 'y'),
      width: requireNumber(shape.width, 'A width', true),
      height: requireNumber(shape.height, 'A height', true),
      text: shape.text,
      fill: color(shape.fill, 'fill', of, before?.fill),
      stroke: color(shape.stroke, 'stroke', of, before?.stroke),
    });
  }
  if (shape.kind === 'arrow') {
    const of = `an arrow in "${viewName}"`;
    if ((shape as { fill?: unknown }).fill !== undefined) {
      reject('invalid-appearance', `An arrow has no fill; give ${of} a stroke instead.`);
    }
    const before = stored?.kind === 'arrow' ? stored : undefined;
    return compact({
      kind: 'arrow',
      id: (shape as FreeShape).id,
      from: { x: requireNumber(shape.from?.x, 'x'), y: requireNumber(shape.from?.y, 'y') },
      to: { x: requireNumber(shape.to?.x, 'x'), y: requireNumber(shape.to?.y, 'y') },
      stroke: color(shape.stroke, 'stroke', of, before?.stroke),
    });
  }
  if (shape.kind === 'picture') {
    const of = `a picture in "${viewName}"`;
    const loose = shape as { fill?: unknown; stroke?: unknown };
    if (loose.fill !== undefined || loose.stroke !== undefined) {
      reject('invalid-appearance', `A picture has no colors of its own; ${of} shows its file.`);
    }
    const name = shape.name === undefined || shape.name === '' ? undefined : shape.name;
    if (name !== undefined && (typeof name !== 'string' || name.length > 200)) {
      reject('invalid-command', "A picture's name is text of at most 200 characters.");
    }
    const media = checkedMediaRef(shape.media, IMAGE_FORMATS_OR_VIDEOS);
    // A video's poster is an image of `media/` (ADR 0098, stage 2); only a video has one.
    const given = (shape as { poster?: unknown }).poster;
    if (given !== undefined && !isVideoFormat(media.format)) {
      reject('invalid-command', `Only a video has a poster; ${of} is not one.`);
    }
    return compact({
      kind: 'picture',
      id: (shape as FreeShape).id,
      x: requireNumber(shape.x, 'x'),
      y: requireNumber(shape.y, 'y'),
      width: requireNumber(shape.width, 'A width', true),
      height: requireNumber(shape.height, 'A height', true),
      media,
      poster: given === undefined ? undefined : checkedMediaRef(given, POSTER_FORMATS),
      name,
    });
  }
  if (shape.kind === 'explorable') {
    // Explorables (ADR 0107): whether its explorable and element exist is checked once the command is done.
    return checkedExplorableShape(shape, (shape as FreeShape).id, viewName, requireNumber);
  }
  reject('invalid-command', 'A free shape is a note, an arrow, a picture or an explorable.');
}

/** The formats a video's file may have (ADR 0098, stage 2). */
const VIDEO_FORMATS: ReadonlySet<string> = new Set(['mp4', 'webm']);

/** The formats a picture's file may have, and what a refusal says of them. */
const IMAGE_FORMATS_OR_VIDEOS = {
  formats: new Set(['png', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'webm']),
  said: 'A media file is a PNG, JPEG, WebP, GIF or SVG picture, or an MP4 or WebM video.',
};

/** The formats a video's poster may have: a still image, as the app makes it. */
const POSTER_FORMATS = {
  formats: new Set(['png', 'jpeg', 'webp']),
  said: "A video's poster is a PNG, JPEG or WebP picture.",
};

/**
 * A picture's media file as a command names it, checked and with nothing else (ADR 0098). Only its
 * reference travels in a command, never its bytes, so a picture weighs no more in the history than a
 * note. An image's file is at most 32 MiB, a video's at most 50 MiB.
 */
function checkedMediaRef(
  media: unknown,
  taken: { formats: ReadonlySet<string>; said: string },
): MediaRef {
  const ref = media as Partial<Record<keyof MediaRef, unknown>> | undefined;
  if (typeof ref !== 'object' || ref === null) {
    reject('invalid-command', 'A picture needs the media file it shows.');
  }
  if (typeof ref.hash !== 'string' || !/^[0-9a-f]{64}$/.test(ref.hash)) {
    reject('invalid-command', "A media file's hash is its SHA-256, in 64 lowercase hex digits.");
  }
  if (typeof ref.format !== 'string' || !taken.formats.has(ref.format)) {
    reject('invalid-command', taken.said);
  }
  const whole = (value: unknown, what: string, max: number): number => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
      reject(
        'invalid-command',
        `${what} must be a whole number from 1 to ${max.toLocaleString('en-US')}.`,
      );
    }
    return value;
  };
  return {
    hash: ref.hash,
    format: ref.format as MediaFormat,
    width: whole(ref.width, "A media file's width", MEDIA_CAPS.side),
    height: whole(ref.height, "A media file's height", MEDIA_CAPS.side),
    bytes: whole(
      ref.bytes,
      "A media file's size",
      VIDEO_FORMATS.has(ref.format) ? VIDEO_CAPS.bytes : MEDIA_CAPS.bytes,
    ),
  };
}
