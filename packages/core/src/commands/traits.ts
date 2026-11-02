/**
 * Checking every value a command sets on an appearance, an attribute definition or a relation type's
 * limits, so that a refusal names what is wrong with a stable problem code before anything is saved.
 * Values are checked as they arrive, from the app or from Claude, so nothing about their type is
 * taken for granted.
 */
import type {
  Appearance,
  AttributeDefinition,
  Attributes,
  FreeGeometry,
  Badge,
  Color,
  ConnectionPoint,
  DetailRules,
  Face,
  FaceVariant,
  Id,
  JsonValue,
  LevelOfDetail,
  LevelPart,
  RelationAppearance,
  RelationTypeLimits,
  SolidCamera,
  TextStyle,
} from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID } from '@visual-anything/schema';
import { FACE_PARTS, TEXT_PARTS, valueFitsType } from '../appearance';
import { compileFace } from '../faces/compile';
import { FACE_CAPS } from '../faces/limits';
import { faceMessage } from '../faces/problems';
import { isColor, storedColor } from '../colors';
import type { Definitions } from '../definitions';
import { isId } from '../ids';
import { readGeometry } from '../geometry';
import { LEVEL_PARTS, MAX_LEVELS, MAX_LEVEL_SCALE } from '../levels';
import { readSolidCamera } from '../solids/camera';
import { reject } from './draft';

/** The largest width or height an appearance may give. */
export const MAX_APPEARANCE_SIZE = 100_000;

const SHAPES = ['rectangle', 'rounded-rectangle', 'ellipse', 'cylinder', 'person'] as const;
/** The shapes that cannot draw rows. */
const NOT_FOR_ROWS: ReadonlySet<string> = new Set(['ellipse', 'cylinder', 'person']);
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const DASHES = ['solid', 'dashed', 'dotted'] as const;
const ATTRIBUTE_TYPES = ['string', 'number', 'boolean', 'json', 'destination'] as const;

/** Whether a value is a plain object, as JSON objects are. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The length of a text in characters, as the published schema counts them. */
function characters(text: string): number {
  return [...text].length;
}

/** Refuses the keys of an object that its kind does not have. */
function onlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  refuse: (key: string) => never,
): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) refuse(key);
}

// Appearances --------------------------------------------------------------------------------------

function invalid(message: string): never {
  reject('invalid-appearance', message);
}

/**
 * A color a command stores, checked and written as the core writes colors: in capitals, or in the
 * spelling of `stored`, the color already stored in that place, when it is the same color, so that
 * picking the color shown changes nothing (ADR-0033).
 */
export function checkedColor(value: unknown, trait: string, of: string, stored?: unknown): Color {
  if (!isColor(value)) {
    invalid(
      `The ${trait} of ${of} must be a color written as #RRGGBB, not ${JSON.stringify(value) ?? String(value)}.`,
    );
  }
  return storedColor(value, isColor(stored) ? stored : undefined);
}

function checkedSize(value: unknown, trait: string, of: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > MAX_APPEARANCE_SIZE
  ) {
    invalid(`The ${trait} of ${of} must be a number above 0 and at most 100,000.`);
  }
  return value;
}

function checkedBoolean(value: unknown, trait: string, of: string): boolean {
  if (typeof value !== 'boolean') invalid(`Whether ${of} ${trait} is true or false.`);
  return value;
}

function checkedShape(value: unknown, of: string): NonNullable<Appearance['shape']> {
  if (!SHAPES.includes(value as (typeof SHAPES)[number])) {
    invalid(`The shape of ${of} must be one of ${SHAPES.map((each) => `"${each}"`).join(', ')}.`);
  }
  return value as NonNullable<Appearance['shape']>;
}

function checkedDetailAttributes(value: unknown, of: string): string[] {
  if (!Array.isArray(value)) invalid(`The attributes the detail of ${of} writes must be a list.`);
  if (value.length > 8) invalid(`The detail of ${of} writes at most 8 attributes.`);
  const seen = new Set<string>();
  for (const name of value) {
    if (typeof name !== 'string') invalid(`The detail of ${of} names attributes by their names.`);
    if (seen.has(name)) invalid(`The detail of ${of} writes "${name}" twice.`);
    seen.add(name);
  }
  return [...(value as string[])];
}

function checkedBadge(value: unknown, of: string): Badge {
  if (!isRecord(value)) invalid(`A badge of ${of} must be an object.`);
  const text = value.text;
  if (typeof text !== 'string' || characters(text) < 1 || characters(text) > 4) {
    invalid(`A badge of ${of} writes 1 to 4 characters.`);
  }
  if (value.when === 'attribute') {
    onlyKeys(value, ['when', 'text', 'attribute'], (key) =>
      invalid(`A badge of ${of} has no "${key}".`),
    );
    if (typeof value.attribute !== 'string') {
      invalid(`The badge "${text}" of ${of} names the attribute it is written for.`);
    }
    return { when: 'attribute', text, attribute: value.attribute };
  }
  if (value.when === 'from-end') {
    onlyKeys(value, ['when', 'text', 'relationType'], (key) =>
      invalid(`A badge of ${of} has no "${key}".`),
    );
    if (!isId(value.relationType)) {
      invalid(`The badge "${text}" of ${of} names a relation type by its id.`);
    }
    return { when: 'from-end', text, relationType: value.relationType };
  }
  invalid(`A badge of ${of} is written "when" an "attribute" is true or at a "from-end".`);
}

function checkedBadges(value: unknown, of: string): Badge[] {
  if (!Array.isArray(value)) invalid(`The badges of ${of} must be a list.`);
  if (value.length > 8) invalid(`The detail of ${of} writes at most 8 badges.`);
  return value.map((badge) => checkedBadge(badge, of));
}

/** The parts of a detail, each inherited on its own. */
const DETAIL_PARTS = ['componentName', 'attributes', 'badges', 'lines'] as const;

function checkedDetail(value: unknown, of: string): DetailRules {
  if (!isRecord(value)) invalid(`The detail of ${of} must be an object.`);
  onlyKeys(value, DETAIL_PARTS, (key) => invalid(`The detail of ${of} has no "${key}".`));
  const detail: DetailRules = {};
  if (value.componentName !== undefined) {
    detail.componentName = checkedBoolean(value.componentName, 'writes its component’s name', of);
  }
  if (value.attributes !== undefined) {
    detail.attributes = checkedDetailAttributes(value.attributes, of);
  }
  if (value.badges !== undefined) detail.badges = checkedBadges(value.badges, of);
  if (value.lines !== undefined) {
    const { lines } = value;
    if (typeof lines !== 'number' || !Number.isInteger(lines) || lines < 1 || lines > 6) {
      invalid(`The detail of ${of} takes 1 to 6 lines.`);
    }
    detail.lines = lines;
  }
  return detail;
}

const TEXT_PLACEMENTS = ['top', 'middle', 'bottom'] as const;

function checkedTextPlacement(
  value: unknown,
  of: string,
): NonNullable<Appearance['textPlacement']> {
  if (!TEXT_PLACEMENTS.includes(value as (typeof TEXT_PLACEMENTS)[number])) {
    invalid(`The text of ${of} is placed at the "top", in the "middle" or at the "bottom".`);
  }
  return value as NonNullable<Appearance['textPlacement']>;
}

function checkedConnectionPoints(value: unknown, of: string): ConnectionPoint[] {
  if (!Array.isArray(value)) invalid(`The connection points of ${of} must be a list.`);
  if (value.length > 32) invalid(`${capitalized(of)} has at most 32 connection points.`);
  const names = new Set<string>();
  return value.map((point: unknown) => {
    if (!isRecord(point)) invalid(`A connection point of ${of} must be an object.`);
    onlyKeys(point, ['name', 'side', 'at'], (key) =>
      invalid(`A connection point of ${of} has no "${key}".`),
    );
    const { name, side, at } = point;
    if (typeof name !== 'string' || characters(name) < 1 || characters(name) > 32) {
      invalid(`A connection point of ${of} has a name of 1 to 32 characters.`);
    }
    if (names.has(name)) invalid(`${capitalized(of)} has two connection points named "${name}".`);
    names.add(name);
    if (!SIDES.includes(side as (typeof SIDES)[number])) {
      invalid(
        `The connection point "${name}" of ${of} sits on the top, right, bottom or left side.`,
      );
    }
    if (typeof at !== 'number' || !Number.isFinite(at) || at < 0 || at > 1) {
      invalid(
        `The connection point "${name}" of ${of} sits at a place from 0 to 1 along its side.`,
      );
    }
    return { name, side: side as ConnectionPoint['side'], at };
  });
}

/**
 * The image an appearance shows: `none`, or an image by its id with its placement and tint. Whether a
 * package in use defines that image is checked after every command (`images/check.ts`). The tint
 * keeps the spelling of the tint stored in that place when it is the same color, as every color does.
 */
function checkedImage(
  value: unknown,
  of: string,
  stored?: Appearance['image'],
): NonNullable<Appearance['image']> {
  if (value === 'none') return 'none';
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(`The image of ${of} must be "none" or an image named by its id.`);
  }
  const { image, placement, tint, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    invalid(`The image of ${of} holds only its image, its placement and its tint.`);
  }
  if (!isId(image)) invalid(`The image of ${of} must name an image by its id.`);
  if (
    placement !== undefined &&
    placement !== 'icon' &&
    placement !== 'drawing' &&
    placement !== 'parts'
  ) {
    invalid(`The image of ${of} is placed as an icon, as a drawing, or with its parts.`);
  }
  return {
    image,
    ...(placement === undefined ? {} : { placement }),
    ...(tint === undefined
      ? {}
      : {
          tint: checkedColor(
            tint,
            'tint',
            of,
            typeof stored === 'object' ? stored.tint : undefined,
          ),
        }),
  };
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The levels of detail an appearance declares (ADR 0055), stored in increasing order of the scale
 * each starts at: at most 8, each at a scale of its own from 0 to 8, showing a silhouette only or
 * some of the other parts, each once, and, when it shows the face, the variant of it, by id
 * (ADR 0083).
 */
/** The id of a face's variant, as the schema says it (`FaceVariantId`). */
const FACE_VARIANT_ID = /^[a-z][a-z0-9-]{0,31}$/;

function checkedLevels(value: unknown, of: string): LevelOfDetail[] {
  if (!Array.isArray(value)) invalid(`The levels of ${of} must be a list.`);
  if (value.length > MAX_LEVELS) {
    invalid(`${capitalized(of)} declares at most ${MAX_LEVELS} levels.`);
  }
  const starts = new Set<number>();
  const levels = value.map((level: unknown): LevelOfDetail => {
    if (!isRecord(level)) invalid(`A level of ${of} must be an object.`);
    onlyKeys(level, ['from', 'shows', 'face'], (key) =>
      invalid(`A level of ${of} has no "${key}".`),
    );
    const { from, shows, face } = level;
    if (typeof from !== 'number' || !Number.isFinite(from) || from < 0 || from > MAX_LEVEL_SCALE) {
      invalid(`A level of ${of} starts at a scale from 0 to ${MAX_LEVEL_SCALE}.`);
    }
    if (starts.has(from)) invalid(`Two levels of ${of} start at ${from}.`);
    starts.add(from);
    const parts = LEVEL_PARTS as readonly unknown[];
    if (
      !Array.isArray(shows) ||
      shows.length === 0 ||
      !shows.every((part) => parts.includes(part))
    ) {
      invalid(
        `The level at ${from} of ${of} shows a silhouette, or some of the name, the detail, the contents, the image and the face.`,
      );
    }
    const seen = new Set<unknown>();
    for (const part of shows) {
      if (seen.has(part)) invalid(`The level at ${from} of ${of} shows "${String(part)}" twice.`);
      seen.add(part);
    }
    if (seen.has('silhouette') && seen.size > 1) {
      invalid(`The level at ${from} of ${of} shows a silhouette only, with nothing else.`);
    }
    if (face !== undefined) {
      if (typeof face !== 'string' || !FACE_VARIANT_ID.test(face)) {
        invalid(`The level at ${from} of ${of} names a face's variant by its id.`);
      }
      if (!seen.has('face')) {
        invalid(`The level at ${from} of ${of} names a face's variant but does not show the face.`);
      }
    }
    return {
      from,
      shows: [...(shows as LevelPart[])],
      ...(face === undefined ? {} : { face }),
    };
  });
  return levels.sort((a, b) => a.from - b.from);
}

/** The scale from which an appearance's collapsed shapes expand as the canvas zooms into them. */
function checkedExpandFrom(value: unknown, of: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > MAX_LEVEL_SCALE
  ) {
    invalid(`${capitalized(of)} expands from a scale above 0 and at most ${MAX_LEVEL_SCALE}.`);
  }
  return value;
}

/**
 * How each trait of an appearance is checked, given the value stored for it, if any. It names every
 * trait: adding one to `Appearance` without a check here does not compile.
 */
const TRAIT_CHECKS: {
  [K in keyof Appearance]-?: (
    value: unknown,
    of: string,
    stored: Appearance[K] | undefined,
  ) => NonNullable<Appearance[K]>;
} = {
  shape: checkedShape,
  fill: (value, of, stored) => checkedColor(value, 'fill', of, stored),
  stroke: (value, of, stored) => checkedColor(value, 'stroke', of, stored),
  width: (value, of) => checkedSize(value, 'width', of),
  height: (value, of) => checkedSize(value, 'height', of),
  detail: checkedDetail,
  textPlacement: checkedTextPlacement,
  contentsAsRows: (value, of) => checkedBoolean(value, 'draws its contents as rows', of),
  connectionPoints: checkedConnectionPoints,
  image: checkedImage,
  solid: checkedSolid,
  geometry: checkedGeometry,
  part: checkedPart,
  levels: checkedLevels,
  expandFrom: checkedExpandFrom,
  face: checkedFace,
  borderWidth: (value, of) => checkedRange(value, 0, 16, 'border width', of),
  dash: (value, of) => {
    if (!DASHES.includes(value as (typeof DASHES)[number])) {
      invalid(`The border of ${of} is "solid", "dashed" or "dotted".`);
    }
    return value as NonNullable<Appearance['dash']>;
  },
  cornerRadius: (value, of) => checkedRange(value, 0, 64, 'corner radius', of),
  opacity: (value, of) => checkedRange(value, 0.2, 1, 'opacity', of),
  shadow: (value, of) => {
    if (value !== 'none' && value !== 'soft') invalid(`The shadow of ${of} is "none" or "soft".`);
    return value;
  },
  gradient: checkedGradient,
  text: checkedText,
};

/** A number from `min` to `max`, both included (ADR 0088). */
function checkedRange(value: unknown, min: number, max: number, what: string, of: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    invalid(`The ${what} of ${of} is a number from ${min} to ${max}.`);
  }
  return value;
}

/** A gradient (ADR 0088), or `none`; its color keeps the spelling stored in that place. */
function checkedGradient(
  value: unknown,
  of: string,
  stored?: Appearance['gradient'],
): NonNullable<Appearance['gradient']> {
  if (value === 'none') return 'none';
  if (!isRecord(value)) invalid(`The gradient of ${of} must be "none" or a color and a direction.`);
  onlyKeys(value, ['to', 'direction'], (key) => invalid(`The gradient of ${of} has no "${key}".`));
  if (value.direction !== 'down' && value.direction !== 'right') {
    invalid(`The gradient of ${of} runs "down" or to the "right".`);
  }
  return {
    to: checkedColor(value.to, 'gradient', of, typeof stored === 'object' ? stored.to : undefined),
    direction: value.direction,
  };
}

const FONTS = ['roboto', 'system', 'mono'] as const;
const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
const LABEL_POSITIONS = ['inside', 'above', 'below', 'left', 'right'] as const;

/** How a shape writes the name (ADR 0088), each part checked; colors keep their stored spelling. */
function checkedText(value: unknown, of: string, stored?: TextStyle): TextStyle {
  if (!isRecord(value)) invalid(`The text of ${of} must be an object.`);
  onlyKeys(value, TEXT_PARTS, (key) => invalid(`The text of ${of} has no "${key}".`));
  const text: TextStyle = {};
  const choice = <T extends string>(
    key: keyof TextStyle,
    choices: readonly T[],
    message: string,
  ): T | undefined => {
    const part = value[key];
    if (part === undefined) return undefined;
    if (!choices.includes(part as T)) invalid(`The text of ${of} ${message}.`);
    return part as T;
  };
  const font = choice('font', FONTS, 'is written in "roboto", "system" or "mono"');
  if (font !== undefined) text.font = font;
  if (value.size !== undefined) text.size = checkedRange(value.size, 8, 48, 'text size', of);
  for (const key of ['bold', 'italic', 'underline', 'wrap'] as const) {
    if (value[key] !== undefined) text[key] = checkedBoolean(value[key], `is ${key}`, of);
  }
  const align = choice('align', TEXT_ALIGNS, 'is aligned "left", "center" or "right"');
  if (align !== undefined) text.align = align;
  const position = choice(
    'position',
    LABEL_POSITIONS,
    'is written "inside", "above", "below", to the "left" or to the "right"',
  );
  if (position !== undefined) text.position = position;
  for (const key of ['color', 'background', 'border'] as const) {
    if (value[key] !== undefined) {
      text[key] = checkedColor(value[key], `text ${key}`, of, stored?.[key]);
    }
  }
  if (value.padding !== undefined) {
    text.padding = checkedRange(value.padding, 0, 48, 'text padding', of);
  }
  return text;
}

/** How a shape writes the name after changes, part by part; `undefined` when no part is left. */
function changedText(
  own: TextStyle | undefined,
  changes: unknown,
  of: string,
): TextStyle | undefined {
  if (!isRecord(changes)) invalid(`The changes to the text of ${of} must be an object.`);
  const next: Record<string, unknown> = { ...own };
  for (const [part, value] of Object.entries(changes)) {
    if (!(TEXT_PARTS as readonly string[]).includes(part)) {
      invalid(`The text of ${of} has no "${part}".`);
    }
    if (value === undefined) continue;
    if (value === null) delete next[part];
    else next[part] = value;
  }
  const checked = checkedText(next, of, own);
  return Object.keys(checked).length === 0 ? undefined : checked;
}

const VARIANT_ID = /^[a-z][a-z0-9-]{0,31}$/;

/** Lines of a face's markup or style, each a text without a line break, of at most 2,000 characters. */
function checkedFaceLines(value: unknown, what: string, of: string): string[] {
  if (!Array.isArray(value) || !value.every((line) => typeof line === 'string')) {
    reject('invalid-face', `The ${what} of the face of ${of} is a list of lines of text.`);
  }
  const at = value.findIndex(
    (line) => line.length > FACE_CAPS.lineCharacters || /[\r\n]/.test(line),
  );
  if (at !== -1) {
    reject(
      'invalid-face',
      `Line ${at + 1} of the ${what} of the face of ${of} holds a line break or more than 2,000 characters.`,
    );
  }
  return [...value];
}

/**
 * A face (ADR 0083), or `none`: its parts checked, and what it sets compiled, so that markup or style
 * the subset refuses, or a face past its caps, is refused at its line and column. Kept as written, so
 * that its lines diff one by one.
 */
function checkedFace(value: unknown, of: string): NonNullable<Appearance['face']> {
  if (value === 'none') return 'none';
  if (!isRecord(value))
    reject('invalid-face', `The face of ${of} must be "none" or an object of its parts.`);
  onlyKeys(value, FACE_PARTS, (key) =>
    reject('invalid-face', `The face of ${of} has no "${key}".`),
  );
  const face: Face = {};
  if (value.size !== undefined) {
    if (value.size !== 'content' && value.size !== 'shape') {
      reject('invalid-face', `The face of ${of} is sized by its "content" or by its "shape".`);
    }
    face.size = value.size;
  }
  if (value.markup !== undefined) face.markup = checkedFaceLines(value.markup, 'markup', of);
  if (value.style !== undefined) face.style = checkedFaceLines(value.style, 'style', of);
  if (value.variants !== undefined) {
    if (!Array.isArray(value.variants))
      reject('invalid-face', `The variants of the face of ${of} are a list.`);
    face.variants = value.variants.map((variant: unknown): FaceVariant => {
      if (!isRecord(variant))
        reject('invalid-face', `A variant of the face of ${of} is an object.`);
      onlyKeys(variant, ['id', 'markup'], (key) =>
        reject('invalid-face', `A variant of the face of ${of} has no "${key}".`),
      );
      if (typeof variant.id !== 'string' || !VARIANT_ID.test(variant.id)) {
        reject(
          'invalid-face',
          `A variant of the face of ${of} has an id of lowercase letters, digits and "-", a letter first.`,
        );
      }
      return { id: variant.id, markup: checkedFaceLines(variant.markup, 'markup', of) };
    });
  }
  if (value.collapsed !== undefined) {
    if (typeof value.collapsed !== 'string' || !VARIANT_ID.test(value.collapsed)) {
      reject('invalid-face', `The face of ${of} names its collapsed variant by its id.`);
    }
    face.collapsed = value.collapsed;
  }
  const compiled = compileFace({
    size: face.size ?? 'shape',
    markup: face.markup ?? [],
    style: face.style ?? [],
    variants: face.variants ?? [],
    // A collapsed variant is checked against the variants set beside it; inherited ones are checked
    // once the face is worked out, by the project's check.
    ...(face.collapsed !== undefined && face.variants !== undefined
      ? { collapsed: face.collapsed }
      : {}),
  });
  const error = compiled.problems.find((each) => each.severity === 'error');
  if (error !== undefined) reject(error.code, `The face of ${of}: ${faceMessage(error)}`);
  return face;
}

/** A face after changes, part by part; `none` takes the whole face away. `undefined` when no part is left. */
function changedFace(own: Appearance['face'], changes: unknown, of: string): Appearance['face'] {
  if (changes === 'none') return 'none';
  if (!isRecord(changes))
    reject('invalid-face', `The changes to the face of ${of} must be "none" or an object.`);
  const next: Record<string, unknown> = own === 'none' || own === undefined ? {} : { ...own };
  for (const [part, value] of Object.entries(changes)) {
    if (!(FACE_PARTS as readonly string[]).includes(part)) {
      reject('invalid-face', `The face of ${of} has no "${part}".`);
    }
    if (value === undefined) continue;
    if (value === null) delete next[part];
    else next[part] = value;
  }
  const checked = checkedFace(next, of);
  return typeof checked === 'object' && Object.keys(checked).length === 0 ? undefined : checked;
}

/** Free geometry, read by the core's strict reader within its caps (ADR 0066), or `none`. */
function checkedGeometry(value: unknown, of: string): NonNullable<Appearance['geometry']> {
  if (value === 'none') return 'none';
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('invalid-geometry', `The free geometry of ${of} must be "none" or an outline in a box.`);
  }
  const { width, height, outline, keepProportions, label, ...rest } = value as Record<
    string,
    unknown
  >;
  if (Object.keys(rest).length > 0) {
    reject(
      'invalid-geometry',
      `The free geometry of ${of} holds only a width, a height, an outline, keep proportions and a label.`,
    );
  }
  const geometry = {
    width,
    height,
    outline,
    ...(keepProportions === undefined ? {} : { keepProportions }),
    ...(label === undefined ? {} : { label }),
  } as FreeGeometry;
  const read = readGeometry(geometry);
  if (!read.ok) reject(read.code, `The free geometry of ${of}: ${read.message}`);
  // Kept as written, so that its path data diffs line by line; only checked.
  return {
    width: geometry.width,
    height: geometry.height,
    outline: geometry.outline.map((contour) =>
      contour.kind === 'path'
        ? { kind: 'path', d: contour.d }
        : contour.kind === 'polygon'
          ? { kind: 'polygon', points: contour.points }
          : { kind: 'ellipse', cx: contour.cx, cy: contour.cy, rx: contour.rx, ry: contour.ry },
    ),
    ...(geometry.keepProportions === true ? { keepProportions: true } : {}),
    ...(geometry.label === undefined
      ? {}
      : {
          label: {
            x: geometry.label.x,
            y: geometry.label.y,
            width: geometry.label.width,
            height: geometry.label.height,
          },
        }),
  };
}

const PART_ID = /^[A-Za-z_][\w.-]{0,63}$/;

/**
 * The solid an appearance shows (ADR 0075): `none`, or a solid by its id with its placement, its
 * camera and its lighting. Whether a package in use defines it is checked on open (`unknown-solid`).
 */
function checkedSolid(value: unknown, of: string): NonNullable<Appearance['solid']> {
  if (value === 'none') return 'none';
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(`The solid of ${of} must be "none" or a solid named by its id.`);
  }
  const { solid, placement, camera, lighting, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    invalid(`The solid of ${of} holds only its solid, its placement, its camera and its lighting.`);
  }
  if (!isId(solid)) invalid(`The solid of ${of} must name a solid by its id.`);
  if (
    placement !== undefined &&
    placement !== 'icon' &&
    placement !== 'drawing' &&
    placement !== 'parts'
  ) {
    invalid(`The solid of ${of} is placed as an icon, as a drawing, or with its parts.`);
  }
  if (lighting !== undefined && lighting !== 'studio' && lighting !== 'flat') {
    invalid(`The lighting of ${of}'s solid is "studio" or "flat".`);
  }
  return {
    solid,
    ...(placement === undefined ? {} : { placement }),
    ...(camera === undefined ? {} : { camera: checkedSolidCamera(camera, of) }),
    ...(lighting === undefined ? {} : { lighting }),
  };
}

/** A solid's camera (ADR 0075): a direction, a zoom, a target and a projection, within their ranges. */
export function checkedSolidCamera(
  value: unknown,
  of: string,
  refuse: (message: string) => never = invalid,
): SolidCamera {
  return readSolidCamera(value, of, refuse);
}

/**
 * A named part of an SVG image (ADR 0067) or of a solid (ADR 0075), by its id and the image's or the
 * solid's, never both; or `none`.
 */
function checkedPart(value: unknown, of: string): NonNullable<Appearance['part']> {
  if (value === 'none') return 'none';
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(`The part ${of} is drawn as must be "none" or a part named by its id.`);
  }
  const { part, image, solid, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    invalid(`The part ${of} is drawn as holds only its id, and its image or its solid.`);
  }
  if (typeof part !== 'string' || !PART_ID.test(part)) {
    invalid(`The part ${of} is drawn as must be named by the id it has in its picture.`);
  }
  if (image !== undefined && !isId(image))
    invalid(`The part ${of} is drawn as must name its image by its id.`);
  if (solid !== undefined && !isId(solid))
    invalid(`The part ${of} is drawn as must name its solid by its id.`);
  if (image !== undefined && solid !== undefined) {
    invalid(`The part ${of} is drawn as names its image or its solid, not both.`);
  }
  return {
    part,
    ...(image === undefined ? {} : { image }),
    ...(solid === undefined ? {} : { solid }),
  };
}

/** Refuses an appearance that draws rows on a shape that cannot, both set in it. */
function checkRowsShape(appearance: Appearance, of: string): void {
  if (appearance.contentsAsRows === true && NOT_FOR_ROWS.has(appearance.shape ?? '')) {
    invalid(
      `${capitalized(of)} cannot draw its contents as rows as a ${appearance.shape}: only a rectangle or a rounded rectangle draws rows.`,
    );
  }
}

/** Checks a trait's value against its kind, given the value stored for it. */
function checkedTrait(trait: keyof Appearance, value: unknown, of: string, stored: unknown) {
  const check = TRAIT_CHECKS[trait] as (value: unknown, of: string, stored: unknown) => unknown;
  return check(value, of, stored);
}

/**
 * A whole appearance a command sets, checked trait by trait. `of` names whose it is in messages, as
 * in `the component "Queue"`; `stored` is the appearance stored in that place, whose spelling of a
 * color is kept when the same color is set again. A trait set to `null` is refused.
 */
export function checkedAppearance(value: unknown, of: string, stored?: Appearance): Appearance {
  if (!isRecord(value)) invalid(`The appearance of ${of} must be an object.`);
  const appearance: Record<string, unknown> = {};
  for (const [trait, traitValue] of Object.entries(value)) {
    if (!Object.hasOwn(TRAIT_CHECKS, trait)) {
      invalid(`The appearance of ${of} has no trait "${trait}".`);
    }
    if (traitValue === undefined) continue;
    appearance[trait] = checkedTrait(
      trait as keyof Appearance,
      traitValue,
      of,
      stored?.[trait as keyof Appearance],
    );
  }
  checkRowsShape(appearance, of);
  return appearance;
}

/** A whole appearance a command sets, checked; `undefined` when it sets no trait, as `{}` does. */
export function checkedAppearanceOrNone(
  value: unknown,
  of: string,
  stored?: Appearance,
): Appearance | undefined {
  const appearance = checkedAppearance(value, of, stored);
  return Object.keys(appearance).length === 0 ? undefined : appearance;
}

/**
 * An appearance after changes, trait by trait: a value sets a trait, `null` takes it out, and a trait
 * left out stays. `undefined` when nothing is left. Rows on a shape that cannot draw them are refused
 * when the changes set either of the two.
 */
export function changedAppearance(
  own: Appearance | undefined,
  changes: unknown,
  of: string,
): Appearance | undefined {
  if (!isRecord(changes)) invalid(`The changes to the appearance of ${of} must be an object.`);
  const next: Record<string, unknown> = { ...own };
  for (const [trait, value] of Object.entries(changes)) {
    if (!Object.hasOwn(TRAIT_CHECKS, trait)) {
      invalid(`The appearance of ${of} has no trait "${trait}".`);
    }
    if (value === undefined) continue;
    if (value === null) {
      delete next[trait];
    } else if (trait === 'detail') {
      const detail = changedDetail(own?.detail, value, of);
      if (detail === undefined) delete next.detail;
      else next.detail = detail;
    } else if (trait === 'face') {
      const face = changedFace(own?.face, value, of);
      if (face === undefined) delete next.face;
      else next.face = face;
    } else if (trait === 'text') {
      const text = changedText(own?.text, value, of);
      if (text === undefined) delete next.text;
      else next.text = text;
    } else {
      next[trait] = checkedTrait(
        trait as keyof Appearance,
        value,
        of,
        own?.[trait as keyof Appearance],
      );
    }
  }
  if (Object.hasOwn(changes, 'shape') || Object.hasOwn(changes, 'contentsAsRows')) {
    checkRowsShape(next, of);
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

/** A detail after changes, part by part; `undefined` when no part is left. */
function changedDetail(
  own: DetailRules | undefined,
  changes: unknown,
  of: string,
): DetailRules | undefined {
  if (!isRecord(changes)) invalid(`The changes to the detail of ${of} must be an object.`);
  const next: Record<string, unknown> = { ...own };
  for (const [part, value] of Object.entries(changes)) {
    if (!(DETAIL_PARTS as readonly string[]).includes(part)) {
      invalid(`The detail of ${of} has no "${part}".`);
    }
    if (value === undefined) continue;
    if (value === null) delete next[part];
    else next[part] = value;
  }
  const checked = checkedDetail(next, of);
  return Object.keys(checked).length === 0 ? undefined : checked;
}

// Relation appearances -----------------------------------------------------------------------------

const RELATION_TRAIT_CHECKS: {
  [K in keyof RelationAppearance]-?: (
    value: unknown,
    of: string,
    stored: RelationAppearance[K] | undefined,
  ) => NonNullable<RelationAppearance[K]>;
} = {
  stroke: (value, of, stored) => checkedColor(value, 'stroke', of, stored),
  width: (value, of) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      invalid(`The line width of ${of} must be a number above 0.`);
    }
    return value;
  },
  route: (value, of) => {
    if (value !== 'orthogonal' && value !== 'straight' && value !== 'curved') {
      invalid(`The route of ${of} is orthogonal, straight or curved.`);
    }
    return value;
  },
  dash: (value, of) => {
    if (!DASHES.includes(value as (typeof DASHES)[number])) {
      invalid(`The dash of ${of} must be "solid", "dashed" or "dotted".`);
    }
    return value as NonNullable<RelationAppearance['dash']>;
  },
  opacity: (value, of) => checkedRange(value, 0.2, 1, 'opacity', of),
};

/** Checks a relation appearance trait's value against its kind, given the value stored for it. */
function checkedRelationTrait(
  trait: keyof RelationAppearance,
  value: unknown,
  of: string,
  stored: unknown,
) {
  const check = RELATION_TRAIT_CHECKS[trait] as (
    value: unknown,
    of: string,
    stored: unknown,
  ) => unknown;
  return check(value, of, stored);
}

/**
 * How a relation, or a relation type's relations, are drawn, as a command sets it whole, checked
 * trait by trait; `stored` is the appearance stored in that place, whose spelling of a color is kept
 * when the same color is set again. A trait set to `null` is refused; `undefined` when it sets no
 * trait, as `{}` does.
 */
export function checkedRelationAppearance(
  value: unknown,
  of: string,
  stored?: RelationAppearance,
): RelationAppearance | undefined {
  if (!isRecord(value)) invalid(`The appearance of ${of} must be an object.`);
  const appearance: Record<string, unknown> = {};
  for (const [trait, traitValue] of Object.entries(value)) {
    if (!Object.hasOwn(RELATION_TRAIT_CHECKS, trait)) {
      invalid(`How ${of} is drawn has no trait "${trait}".`);
    }
    if (traitValue === undefined) continue;
    appearance[trait] = checkedRelationTrait(
      trait as keyof RelationAppearance,
      traitValue,
      of,
      stored?.[trait as keyof RelationAppearance],
    );
  }
  return Object.keys(appearance).length === 0 ? undefined : appearance;
}

/** How a relation type's relations are drawn after changes, trait by trait; `undefined` when empty. */
export function changedRelationAppearance(
  own: RelationAppearance | undefined,
  changes: unknown,
  of: string,
): RelationAppearance | undefined {
  if (!isRecord(changes)) invalid(`The appearance of ${of} must be an object.`);
  const next: Record<string, unknown> = { ...own };
  for (const [trait, value] of Object.entries(changes)) {
    if (!Object.hasOwn(RELATION_TRAIT_CHECKS, trait)) {
      invalid(`How ${of} is drawn has no trait "${trait}".`);
    }
    if (value === undefined) continue;
    if (value === null) delete next[trait];
    else {
      next[trait] = checkedRelationTrait(
        trait as keyof RelationAppearance,
        value,
        of,
        own?.[trait as keyof RelationAppearance],
      );
    }
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

// Attribute definitions ----------------------------------------------------------------------------

function invalidAttribute(message: string): never {
  reject('invalid-attribute', message);
}

/** One attribute definition a command sets, checked. */
export function checkedAttributeDefinition(value: unknown, of: string): AttributeDefinition {
  if (!isRecord(value)) invalidAttribute(`An attribute of ${of} must be an object.`);
  onlyKeys(value, ['name', 'type', 'default', 'description', 'choices', 'unit', 'format'], (key) =>
    invalidAttribute(`An attribute definition has no "${key}".`),
  );
  const { name, type, description, choices, unit, format } = value;
  if (typeof name !== 'string' || name.trim() === '') {
    reject('empty-name', `An attribute of ${of} needs a name.`);
  }
  if (!ATTRIBUTE_TYPES.includes(type as (typeof ATTRIBUTE_TYPES)[number])) {
    invalidAttribute(
      `The attribute "${name}" of ${of} is of type "string", "number", "boolean", "json" or "destination".`,
    );
  }
  const attributeType = type as AttributeDefinition['type'];
  const checked: AttributeDefinition = { name, type: attributeType };
  if (Object.hasOwn(value, 'default') && value.default !== undefined) {
    const fallback = value.default as JsonValue;
    if (!isJson(fallback) || !valueFitsType(fallback, attributeType)) {
      invalidAttribute(
        attributeType === 'destination'
          ? `The default of "${name}" of ${of} must be a destination: a view, another project or an https: address.`
          : `The default of "${name}" of ${of} must be a ${attributeType} value.`,
      );
    }
    checked.default = fallback;
  }
  if (description !== undefined) {
    if (typeof description !== 'string') {
      invalidAttribute(`The description of "${name}" of ${of} must be text.`);
    }
    checked.description = description;
  }
  if (choices !== undefined) {
    if (attributeType !== 'string') {
      invalidAttribute(
        `Only a string attribute has choices; "${name}" of ${of} is a ${attributeType}.`,
      );
    }
    if (
      !Array.isArray(choices) ||
      choices.length < 1 ||
      choices.length > 64 ||
      !choices.every((each) => typeof each === 'string') ||
      new Set(choices).size !== choices.length
    ) {
      invalidAttribute(`The choices of "${name}" of ${of} are 1 to 64 different texts.`);
    }
    checked.choices = [...choices];
    if (checked.default !== undefined && !checked.choices.includes(checked.default as string)) {
      invalidAttribute(`The default of "${name}" of ${of} must be one of its choices.`);
    }
  }
  if (unit !== undefined) {
    if (attributeType !== 'number') {
      invalidAttribute(
        `Only a number attribute has a unit; "${name}" of ${of} is a ${attributeType}.`,
      );
    }
    if (typeof unit !== 'string' || characters(unit) < 1 || characters(unit) > 16) {
      invalidAttribute(`The unit of "${name}" of ${of} has 1 to 16 characters.`);
    }
    checked.unit = unit;
  }
  if (format !== undefined) {
    if (format !== 'plain' && format !== 'emphasis') {
      invalidAttribute(`The values of "${name}" of ${of} are written "plain" or with "emphasis".`);
    }
    if (attributeType !== 'string' && format === 'emphasis') {
      invalidAttribute(
        `Only a string attribute takes text emphasis; "${name}" of ${of} is a ${attributeType}.`,
      );
    }
    checked.format = format;
  }
  return checked;
}

/** The attribute definitions a command sets, checked, each name once. */
export function checkedAttributeDefinitions(value: unknown, of: string): AttributeDefinition[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalidAttribute(`The attributes of ${of} must be a list.`);
  const names = new Set<string>();
  return value.map((each: unknown) => {
    const attribute = checkedAttributeDefinition(each, of);
    if (names.has(attribute.name)) {
      invalidAttribute(`${capitalized(of)} defines the attribute "${attribute.name}" twice.`);
    }
    names.add(attribute.name);
    return attribute;
  });
}

/** Whether a value is JSON: what a project file can hold. */
function isJson(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return isRecord(value) && Object.values(value).every(isJson);
}

/** What a definition's own attributes become after changes, and the renames made. */
export interface ChangedAttributes {
  attributes: AttributeDefinition[];
  renamed: { from: string; to: string }[];
}

/**
 * A definition's own attributes after changes, applied in order: rename, set, remove, order. `chain`
 * is every attribute the definition has, its own and those it inherits. Whether a rename or a removal
 * is allowed by the rest of the project is checked by the command.
 */
export function changedAttributes(
  own: readonly AttributeDefinition[],
  chain: readonly AttributeDefinition[],
  changes: unknown,
  of: string,
): ChangedAttributes {
  if (!isRecord(changes))
    reject('invalid-command', `The attribute changes of ${of} must be an object.`);
  onlyKeys(changes, ['rename', 'set', 'remove', 'order'], (key) =>
    reject('invalid-command', `Attribute changes have no "${key}".`),
  );
  let attributes = [...own];
  const ownNames = () => new Set(attributes.map((attribute) => attribute.name));
  const renamed: { from: string; to: string }[] = [];
  const chainNames = new Set(chain.map((attribute) => attribute.name));

  for (const rename of listOf(changes.rename, 'rename')) {
    if (!isRecord(rename) || typeof rename.from !== 'string' || typeof rename.to !== 'string') {
      reject('invalid-command', 'A rename gives the attribute "from" and its new name "to".');
    }
    const { from, to } = rename;
    if (!ownNames().has(from)) {
      reject(
        'unknown-attribute',
        `${capitalized(of)} does not define "${from}" itself, so it cannot rename it.`,
      );
    }
    if (to.trim() === '') reject('empty-name', 'An attribute needs a name.');
    if (chainNames.has(to) || ownNames().has(to)) {
      reject('name-taken', `${capitalized(of)} already has an attribute "${to}".`);
    }
    attributes = attributes.map((attribute) =>
      attribute.name === from ? { ...attribute, name: to } : attribute,
    );
    chainNames.delete(from);
    chainNames.add(to);
    renamed.push({ from, to });
  }

  for (const value of listOf(changes.set, 'set')) {
    const attribute = checkedAttributeDefinition(value, of);
    const at = attributes.findIndex((each) => each.name === attribute.name);
    if (at === -1) attributes.push(attribute);
    else attributes[at] = attribute;
  }

  for (const name of listOf(changes.remove, 'remove')) {
    if (typeof name !== 'string' || !ownNames().has(name)) {
      reject(
        'unknown-attribute',
        `${capitalized(of)} does not define "${String(name)}" itself, so it cannot stop defining it.`,
      );
    }
    attributes = attributes.filter((attribute) => attribute.name !== name);
  }

  const order = listOf(changes.order, 'order');
  if (order.length > 0) {
    const seen = new Set<string>();
    for (const name of order) {
      if (typeof name !== 'string' || !ownNames().has(name)) {
        reject(
          'unknown-attribute',
          `${capitalized(of)} does not define "${String(name)}" itself, so it cannot order it.`,
        );
      }
      if (seen.has(name)) reject('invalid-command', `"${name}" is ordered twice.`);
      seen.add(name);
    }
    const byName = new Map(attributes.map((attribute) => [attribute.name, attribute]));
    attributes = [
      ...(order as string[]).map((name) => byName.get(name) as AttributeDefinition),
      ...attributes.filter((attribute) => !seen.has(attribute.name)),
    ];
  }
  return { attributes: checkedAttributeDefinitions(attributes, of), renamed };
}

function listOf(value: unknown, what: string): readonly unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) reject('invalid-command', `"${what}" must be a list.`);
  return value;
}

// Limits ------------------------------------------------------------------------------------------

/** One end's limit a command sets: a list of at least one known id, or `any`. */
export function checkedLimit(
  value: unknown,
  end: 'from' | 'to',
  definitions: Definitions,
  of: string,
): readonly Id[] | 'any' {
  if (value === 'any') return 'any';
  if (!Array.isArray(value)) {
    reject('invalid-command', `The ${end} limit of ${of} is a list of ids, or "any".`);
  }
  if (value.length === 0) {
    reject(
      'invalid-command',
      `The ${end} limit of ${of} names nothing: leave it out to inherit it, or write "any".`,
    );
  }
  const seen = new Set<Id>();
  for (const id of value) {
    if (!isId(id)) reject('invalid-id', `"${String(id)}" is not a valid id.`);
    if (seen.has(id)) reject('invalid-command', `The ${end} limit of ${of} names "${id}" twice.`);
    seen.add(id);
    const known =
      id === ESSENCE_ID ||
      id === RELATES_TO_ID ||
      definitions.components.has(id) ||
      definitions.relationTypes.has(id);
    if (!known) {
      reject(
        'unknown-component',
        `The ${end} limit of ${of} names "${id}", which is no component or relation type of a package in use.`,
        [id],
      );
    }
  }
  return [...(value as Id[])];
}

/** A relation type's limits as a command sets them whole, checked; `undefined` when empty. */
export function checkedLimits(
  value: unknown,
  definitions: Definitions,
  of: string,
): RelationTypeLimits | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) reject('invalid-command', `The limits of ${of} must be an object.`);
  onlyKeys(value, ['from', 'to'], (key) =>
    reject('invalid-command', `Limits are set for the "from" and "to" ends, not "${key}".`),
  );
  const limits: Record<string, readonly Id[] | 'any'> = {};
  for (const end of ['from', 'to'] as const) {
    if (value[end] !== undefined) limits[end] = checkedLimit(value[end], end, definitions, of);
  }
  return Object.keys(limits).length === 0 ? undefined : limits;
}

// Details against the attributes they name ---------------------------------------------------------

/**
 * Refuses an appearance whose own detail writes attributes, or whose attribute badges name
 * attributes, that the thing it belongs to does not have: `attributes` its definition gives, and
 * `values` it holds itself, for an element. An attribute badge must name a boolean attribute, and a
 * from-end badge a relation type of a package in use.
 */
export function checkDetailResolves(
  appearance: Appearance | undefined,
  attributes: readonly AttributeDefinition[],
  values: Attributes | undefined,
  definitions: Definitions,
  of: string,
): void {
  const detail = appearance?.detail;
  if (detail === undefined) return;
  const byName = new Map(attributes.map((attribute) => [attribute.name, attribute]));
  const holds = (name: string) => values !== undefined && Object.hasOwn(values, name);
  for (const name of detail.attributes ?? []) {
    if (!byName.has(name) && !holds(name)) {
      reject(
        'unknown-attribute',
        `The detail of ${of} writes "${name}", which ${of} does not have.`,
      );
    }
  }
  for (const badge of detail.badges ?? []) {
    if (badge.when === 'attribute') {
      const definition = byName.get(badge.attribute);
      if (definition === undefined && !holds(badge.attribute)) {
        reject(
          'unknown-attribute',
          `The badge "${badge.text}" of ${of} is written while "${badge.attribute}" is true, but ${of} has no such attribute.`,
        );
      }
      const boolean =
        definition !== undefined
          ? definition.type === 'boolean'
          : typeof values?.[badge.attribute] === 'boolean';
      if (!boolean) {
        invalid(
          `The badge "${badge.text}" of ${of} is written while "${badge.attribute}" is true, but it is not a boolean attribute.`,
        );
      }
    } else if (
      badge.relationType !== RELATES_TO_ID &&
      definitions.relationType(badge.relationType) === undefined
    ) {
      reject(
        'unknown-relation-type',
        `The badge "${badge.text}" of ${of} names the relation type "${badge.relationType}", which no package in use defines.`,
        [badge.relationType],
      );
    }
  }
}
