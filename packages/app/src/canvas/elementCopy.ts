/**
 * Copy, Paste, Paste as duplicates and Duplicate (ADR 0103).
 *
 * - Copying takes the selection, from the canvas or the Outline, which share it: its elements and its
 *   free shapes, with where each sat relative to the others; the relations among the elements come
 *   with them, as the view shows them or the core duplicates them. It goes on the system's clipboard as
 *   text, with the project's name and the packages it uses, so that another tab of the same project can
 *   paste it and another project refuses it.
 * - Pasting shows the same elements in the open view: one `add-to-view` for those its scope leaves
 *   out, and positions for those that land directly in World, anchored where the pointer is. It never
 *   changes containment: an element shows inside the containers of its the view draws. Free shapes
 *   are always pasted as copies, since each belongs to one view.
 * - Pasting as duplicates sends `duplicate-elements` into the container under the pointer, or World;
 *   Duplicate sends it beside the selection, without touching the clipboard.
 *
 * What is pasted is read strictly, as anything that enters the app is (ADR 0042): nothing in it runs,
 * and the core checks every command made from it.
 */
import {
  executeCommand,
  isId,
  modelIndexOf,
  shapesInView,
  shownByScope,
  type Command,
  type NewFreeShape,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { FreeShape, Id } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import { t } from '../i18n';
import { IS_APPLE } from '../live/platform';
import { letterOf } from '../live/shortcuts';
import type { Point } from './geometry';
import { BESIDE_GAP, movedFreeShape } from './gestures';
import type { IndexedScene } from './hit';
import type { ElementShape } from './scene';

/** What marks a copy of elements on the clipboard as this app's. */
export const COPIED_ELEMENTS = 'visual-anything/elements';
/** The most text of the clipboard read as copied elements, so that a huge paste is not parsed. */
export const MOST_READ = 8 * 1024 * 1024;
/** The most elements and free shapes one copy carries. */
export const MOST_COPIED = 10_000;
/** What reading the clipboard answers for a copy of elements past the limits, which is not pasted. */
export const TOO_LARGE = 'too-large';
/** What the clipboard holds: a copy of elements, one too large to paste, or nothing of the kind. */
export type ReadCopy = CopiedElements | typeof TOO_LARGE | undefined;

/** The keys of Duplicate and Paste as duplicates, as shown and as `aria-keyshortcuts` names them. */
export const ELEMENT_COPY_KEYS = {
  copy: { shown: IS_APPLE ? '⌘C' : 'Ctrl+C', keys: 'Control+C Meta+C' },
  paste: { shown: IS_APPLE ? '⌘V' : 'Ctrl+V', keys: 'Control+V Meta+V' },
  duplicate: { shown: IS_APPLE ? '⌘D' : 'Ctrl+D', keys: 'Control+D Meta+D' },
  pasteAsDuplicates: {
    shown: IS_APPLE ? '⇧⌘V' : 'Ctrl+Shift+V',
    keys: 'Control+Shift+V Meta+Shift+V',
  },
} as const;

/**
 * Whether a key press duplicates the selection or pastes as duplicates: Ctrl+D or Ctrl+Shift+V, ⌘D
 * or ⇧⌘V on Apple's keyboards, read by the letter typed, as the browser's own Copy and Paste are, and
 * by the key's place on layouts that type no Latin letters; undefined for any other. Copy and Paste
 * come as the browser's own `copy` and `paste` events.
 */
export function elementCopyShortcut(event: {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): 'duplicate' | 'paste-as-duplicates' | undefined {
  if (event.altKey || !(event.ctrlKey || event.metaKey)) return undefined;
  const letter = letterOf(event);
  if (letter === 'd' && !event.shiftKey) return 'duplicate';
  if (letter === 'v' && event.shiftKey) return 'paste-as-duplicates';
  return undefined;
}

/** What a copy holds: the same elements, by id, and copies of free shapes. */
export interface CopiedElements {
  kind: typeof COPIED_ELEMENTS;
  /** The name of the project it was copied from. */
  project: string;
  /**
   * The ids of the packages that project uses, sorted: with its name, what tells it from another
   * project of the same name, whose ids, made from names, may be the same.
   */
  packages: Id[];
  /** The view it was copied in. */
  view: Id;
  elements: Id[];
  /**
   * Where each element's shape sat, its top left corner relative to the copy's, in canvas units;
   * absent for an element no shape showed.
   */
  arrangement: { element: Id; x: number; y: number }[];
  /** The free shapes, placed relative to the copy's top left corner. */
  freeShapes: FreeShape[];
}

/** The rectangle around shapes, in canvas units. */
interface Bounds {
  x: number;
  y: number;
  right: number;
  bottom: number;
}

function boundsOfFreeShape(shape: FreeShape): Bounds {
  if (shape.kind === 'arrow') {
    return {
      x: Math.min(shape.from.x, shape.to.x),
      y: Math.min(shape.from.y, shape.to.y),
      right: Math.max(shape.from.x, shape.to.x),
      bottom: Math.max(shape.from.y, shape.to.y),
    };
  }
  return { x: shape.x, y: shape.y, right: shape.x + shape.width, bottom: shape.y + shape.height };
}

function around(list: readonly Bounds[]): Bounds | undefined {
  if (list.length === 0) return undefined;
  return {
    x: Math.min(...list.map((each) => each.x)),
    y: Math.min(...list.map((each) => each.y)),
    right: Math.max(...list.map((each) => each.right)),
    bottom: Math.max(...list.map((each) => each.bottom)),
  };
}

/** The first shape of each selected element the canvas draws, and the selected free shapes. */
function selectedShapes(
  project: ProjectSnapshot,
  viewId: Id,
  indexed: IndexedScene | undefined,
  selection: Pick<Selection, 'elements' | 'freeShapes'>,
): { elements: { id: Id; shape: ElementShape | undefined }[]; freeShapes: FreeShape[] } {
  const index = modelIndexOf(project);
  const world = project.model.world.id;
  const view = project.views.find((each) => each.id === viewId);
  const elements = [...selection.elements]
    .filter((id) => id !== world && index.element(id) !== undefined)
    .map((id) => ({ id, shape: indexed?.byElement.get(id)?.[0] }));
  const freeShapes = (view?.freeShapes ?? []).filter((shape) => selection.freeShapes.has(shape.id));
  return { elements, freeShapes };
}

/** The packages a project uses, sorted, as a copy names them. */
function packagesOf(project: ProjectSnapshot): Id[] {
  return [...project.project.packages].sort();
}

/** Why a copy too large is not taken or not pasted: it holds more than a paste reads. */
export function tooLargeReason(): string {
  return t(
    'A copy holds at most {n} elements and free shapes, in at most 8 MiB: copy fewer at once.',
    { n: MOST_COPIED },
  );
}

/**
 * What Copy takes of the selection: its elements, its free shapes and where each sat. A reason,
 * translated, when it holds no element and no free shape, or, marked `tooLarge`, more than a paste
 * reads.
 */
export function copyOf(
  project: ProjectSnapshot,
  viewId: Id,
  indexed: IndexedScene | undefined,
  selection: Pick<Selection, 'elements' | 'freeShapes'>,
): { copied: CopiedElements } | { reason: string; tooLarge?: true } {
  const { elements, freeShapes } = selectedShapes(project, viewId, indexed, selection);
  if (elements.length === 0 && freeShapes.length === 0) {
    return { reason: t('Select elements or free shapes to copy them.') };
  }
  if (elements.length + freeShapes.length > MOST_COPIED) {
    return { reason: tooLargeReason(), tooLarge: true };
  }
  const origin = around([
    ...elements.flatMap(({ shape }) =>
      shape
        ? [{ x: shape.rect.x, y: shape.rect.y, right: shape.rect.x, bottom: shape.rect.y }]
        : [],
    ),
    ...freeShapes.map(boundsOfFreeShape),
  ]) ?? { x: 0, y: 0, right: 0, bottom: 0 };
  const copied: CopiedElements = {
    kind: COPIED_ELEMENTS,
    project: project.project.name,
    packages: packagesOf(project),
    view: viewId,
    elements: elements.map((each) => each.id),
    arrangement: elements.flatMap(({ id, shape }) =>
      shape ? [{ element: id, x: shape.rect.x - origin.x, y: shape.rect.y - origin.y }] : [],
    ),
    freeShapes: freeShapes.map((shape) => movedFreeShape(shape, -origin.x, -origin.y)),
  };
  // A paste reads no more text than this, so a copy never holds more.
  if (copiedText(copied).length > MOST_READ) return { reason: tooLargeReason(), tooLarge: true };
  return { copied };
}

/** A copy as the clipboard holds it. */
export function copiedText(copied: CopiedElements): string {
  return JSON.stringify(copied);
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isIdList = (value: unknown): value is Id[] =>
  Array.isArray(value) && value.every((each) => typeof each === 'string' && isId(each));
const isPoint = (value: unknown): boolean =>
  isObject(value) && isNumber(value.x) && isNumber(value.y);

/** How far into the text a copy says what it is: its kind comes first. */
const HEAD = 64;

/**
 * A copy of elements read from the clipboard's text, strictly: `TOO_LARGE` for one past the limits
 * a copy keeps to, which is not read further, and undefined for any text that is not one, as anything
 * else pasted is. The free shapes it carries are checked again by the core.
 */
export function readCopied(text: string): ReadCopy {
  if (!text.slice(0, HEAD).includes(COPIED_ELEMENTS)) return undefined;
  if (text.length > MOST_READ) return TOO_LARGE;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isObject(value) || value.kind !== COPIED_ELEMENTS) return undefined;
  const { project, packages, view, elements, arrangement, freeShapes } = value;
  if (typeof project !== 'string' || typeof view !== 'string' || !isId(view)) return undefined;
  if (!isIdList(packages) || !isIdList(elements)) return undefined;
  if (!Array.isArray(arrangement) || !Array.isArray(freeShapes)) return undefined;
  if (elements.length + freeShapes.length > MOST_COPIED || arrangement.length > elements.length) {
    return TOO_LARGE;
  }
  const isPlace = (each: unknown): each is CopiedElements['arrangement'][number] =>
    isObject(each) &&
    typeof each.element === 'string' &&
    isId(each.element) &&
    isNumber(each.x) &&
    isNumber(each.y);
  if (!(arrangement as unknown[]).every(isPlace)) return undefined;
  if (
    !freeShapes.every(
      (each) =>
        isObject(each) &&
        (each.kind === 'arrow'
          ? isPoint(each.from) && isPoint(each.to)
          : (each.kind === 'note' || each.kind === 'picture' || each.kind === 'link') &&
            isNumber(each.x) &&
            isNumber(each.y) &&
            isNumber(each.width) &&
            isNumber(each.height)),
    )
  ) {
    return undefined;
  }
  return {
    kind: COPIED_ELEMENTS,
    project,
    packages: [...new Set(packages)].sort(),
    view,
    elements: [...new Set(elements)],
    arrangement: (arrangement as CopiedElements['arrangement']).map((each) => ({
      element: each.element,
      x: each.x,
      y: each.y,
    })),
    freeShapes: freeShapes as FreeShape[],
  };
}

/**
 * Why a copy from another project is not pasted, translated; undefined for one of this project: the
 * same name, and the same packages, since another project of the same name may have the same ids.
 */
function fromElsewhere(project: ProjectSnapshot, copied: CopiedElements): string | undefined {
  const packages = packagesOf(project);
  const same =
    copied.project === project.project.name &&
    copied.packages.length === packages.length &&
    copied.packages.every((id, at) => id === packages[at]);
  return same
    ? undefined
    : t(
        'These were copied from another project, “{name}”, so they are not pasted: its components may not exist in this one.',
        { name: copied.project },
      );
}

/** The copies of free shapes, their top left corner at `at`, as commands that add them. */
function freeShapeCommands(viewId: Id, shapes: readonly FreeShape[], at: Point): Command[] {
  return shapes.map((shape) => ({
    type: 'create-free-shape',
    view: viewId,
    shape: withoutId(movedFreeShape(shape, at.x, at.y)),
  }));
}

/** What "2 elements and 1 free shape" says, in English for the history. */
function things(elements: number, freeShapes: number): string {
  const parts: string[] = [];
  if (elements > 0) parts.push(elements === 1 ? '1 element' : `${elements} elements`);
  if (freeShapes > 0) parts.push(freeShapes === 1 ? '1 free shape' : `${freeShapes} free shapes`);
  return parts.join(' and ');
}

/** What Paste does: the action to send, if any, and what to select and say once it is done. */
export interface Pasted {
  /** The one action; absent when the view shows every element already and there is no free shape. */
  command?: Command;
  /** The action's label, in English, as the history keeps it. */
  label?: string;
  /** The elements pasted that the project still has, to select. */
  elements: Id[];
  /** How many of them the view showed already. */
  shown: number;
  /** How many free shapes it adds; their ids come last in what the action created. */
  freeShapes: number;
}

/**
 * The one action that shows the same elements in a view, the copy's top left corner at `at`: they go
 * into its scope when it leaves them out, and those that then sit directly in World get positions,
 * keeping their arrangement; layout places the others in the containers the view draws. Free shapes
 * come as copies. A reason, translated, for a copy from another project or of nothing left.
 */
export function pasteCommand(
  project: ProjectSnapshot,
  viewId: Id,
  copied: CopiedElements,
  at: Point,
): Pasted | { reason: string } {
  const elsewhere = fromElsewhere(project, copied);
  if (elsewhere !== undefined) return { reason: elsewhere };
  const view = project.views.find((each) => each.id === viewId);
  if (!view) return { reason: t('There is no view open to paste into.') };
  const index = modelIndexOf(project);
  const world = project.model.world.id;
  const elements = copied.elements.filter((id) => id !== world && index.element(id) !== undefined);
  if (elements.length === 0 && copied.freeShapes.length === 0) {
    return { reason: t('What was copied is no longer in the project.') };
  }
  const shownNow = shownByScope(project, view);
  const missing = elements.filter((id) => !shownNow.element(id));
  const commands: Command[] = [];
  if (missing.length > 0) {
    const add: Command = { type: 'add-to-view', view: viewId, elements: missing };
    commands.push(add);
    // Where they sit once shown: those directly in World take their places in the copy.
    const after = executeCommand(project, add);
    const shownView = after.ok ? after.state.views.find((each) => each.id === viewId) : undefined;
    if (after.ok && shownView) {
      const sits = shapesInView(after.state, shownView);
      const placeOf = new Map(copied.arrangement.map((each) => [each.element, each]));
      const positions = missing.flatMap((id) => {
        const place = placeOf.get(id);
        if (!place || (sits.containersOf(id) ?? []).length > 0) return [];
        return [{ element: id, x: Math.round(at.x + place.x), y: Math.round(at.y + place.y) }];
      });
      if (positions.length > 0) commands.push({ type: 'set-positions', view: viewId, positions });
    }
  }
  commands.push(...freeShapeCommands(viewId, copied.freeShapes, at));
  const result: Pasted = {
    elements,
    shown: elements.length - missing.length,
    freeShapes: copied.freeShapes.length,
  };
  if (commands.length === 0) return result;
  const [only] = missing;
  const label =
    missing.length === 1 && copied.freeShapes.length === 0 && only !== undefined
      ? `Paste "${index.element(only)?.name ?? only}" into "${view.name}"`
      : `Paste ${things(missing.length, copied.freeShapes.length)} into "${view.name}"`;
  return { ...result, command: { type: 'batch', label, commands }, label };
}

/** What Paste as duplicates and Duplicate send, and how many of each they make. */
export interface Duplicated {
  command: Command;
  /** The action's label, in English, as the history keeps it. */
  label: string;
  /** How many elements are duplicated; the duplicates' ids come first in what the action created. */
  elements: number;
  /** How many free shapes it adds; their ids come last in what the action created. */
  freeShapes: number;
}

/** The duplicate action, with the free shapes' copies after it as one action when there are some. */
function duplicatedAs(
  duplicate: Command | undefined,
  elements: number,
  shapes: Command[],
): Duplicated | undefined {
  const commands = [...(duplicate ? [duplicate] : []), ...shapes];
  const [first] = commands;
  if (first === undefined) return undefined;
  const label = `Duplicate ${things(elements, shapes.length)}`;
  return {
    command: commands.length === 1 ? first : { type: 'batch', label, commands },
    label,
    elements,
    freeShapes: shapes.length,
  };
}

/**
 * The one action that pastes a copy as duplicates in a view, its top left corner at `at`: inside
 * `inside`, the container under the pointer, when one holds contents, or in World. The free shapes
 * come as copies. A reason, translated, for a copy from another project or of nothing left.
 */
export function pasteAsDuplicatesCommand(
  project: ProjectSnapshot,
  viewId: Id,
  copied: CopiedElements,
  at: Point,
  inside: ElementShape | undefined,
): Duplicated | { reason: string } {
  const elsewhere = fromElsewhere(project, copied);
  if (elsewhere !== undefined) return { reason: elsewhere };
  const index = modelIndexOf(project);
  const world = project.model.world.id;
  const elements = copied.elements.filter((id) => id !== world && index.element(id) !== undefined);
  const container = inside?.holdsContents ? inside : undefined;
  const origin = container ? { x: container.rect.x, y: container.rect.y } : { x: 0, y: 0 };
  const placeOf = new Map(copied.arrangement.map((each) => [each.element, each]));
  const duplicate: Command | undefined =
    elements.length === 0
      ? undefined
      : {
          type: 'duplicate-elements',
          view: viewId,
          elements,
          ...(container ? { container: container.element } : {}),
          positions: elements.flatMap((id) => {
            const place = placeOf.get(id);
            return place
              ? [
                  {
                    element: id,
                    x: Math.round(at.x - origin.x + place.x),
                    y: Math.round(at.y - origin.y + place.y),
                  },
                ]
              : [];
          }),
          suffix: t(' (copy)'),
        };
  const made = duplicatedAs(
    duplicate,
    elements.length,
    freeShapeCommands(viewId, copied.freeShapes, at),
  );
  return made ?? { reason: t('What was copied is no longer in the project.') };
}

/**
 * The one action that duplicates the selection beside itself, in the same view: each element's
 * duplicate in the containers it sits in, the whole selection's width and `BESIDE_GAP` to the right of
 * its original's shape in each, and its free shapes' copies as far. A reason, translated, for a selection of nothing
 * that can be duplicated.
 */
export function duplicateCommand(
  project: ProjectSnapshot,
  viewId: Id,
  indexed: IndexedScene | undefined,
  selection: Pick<Selection, 'elements' | 'freeShapes'>,
): Duplicated | { reason: string } {
  const { elements, freeShapes } = selectedShapes(project, viewId, indexed, selection);
  const bounds = around([
    ...elements.flatMap(({ shape }) =>
      shape
        ? [
            {
              x: shape.rect.x,
              y: shape.rect.y,
              right: shape.rect.x + shape.rect.width,
              bottom: shape.rect.y + shape.rect.height,
            },
          ]
        : [],
    ),
    ...freeShapes.map(boundsOfFreeShape),
  ]);
  const step = bounds ? Math.round(bounds.right - bounds.x + BESIDE_GAP) : BESIDE_GAP;
  const duplicate: Command | undefined =
    elements.length === 0
      ? undefined
      : {
          type: 'duplicate-elements',
          view: viewId,
          elements: elements.map((each) => each.id),
          beside: true,
          // A place beside each of its shapes, named by the container it sits in, so that an
          // element in several containers is duplicated beside itself in each.
          positions: elements.flatMap(({ id }) =>
            (indexed?.byElement.get(id) ?? [])
              .filter((shape) => shape.row === undefined)
              .map((shape) => ({
                element: id,
                ...(shape.container === undefined ? {} : { container: shape.container }),
                x: Math.round(shape.offset.x + step),
                y: Math.round(shape.offset.y),
              })),
          ),
          suffix: t(' (copy)'),
        };
  const shapes = freeShapes.map((shape): Command => ({
    type: 'create-free-shape',
    view: viewId,
    shape: withoutId(movedFreeShape(shape, step, 0)),
  }));
  return (
    duplicatedAs(duplicate, elements.length, shapes) ?? {
      reason: t('Select elements or free shapes to duplicate them.'),
    }
  );
}

/** A free shape as a new one, its id left for the core to make. */
function withoutId(shape: FreeShape): NewFreeShape {
  const rest: Partial<FreeShape> = { ...shape };
  delete rest.id;
  return rest as NewFreeShape;
}

let kept: CopiedElements | undefined;

/** Keeps what this tab copied last, for when the system's clipboard cannot be read. */
export function keepCopied(copied: CopiedElements): void {
  kept = copied;
}

/**
 * What the system's clipboard holds as copied elements, read when a menu or Ctrl+Shift+V pastes,
 * which no `paste` event brings: `TOO_LARGE` for a copy past the limits, undefined when it holds
 * anything else. Where the browser does not let it be read, what this tab copied last.
 */
export async function readClipboardCopy(): Promise<ReadCopy> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (clipboard?.readText === undefined) return kept;
  try {
    return readCopied(await clipboard.readText());
  } catch {
    return kept;
  }
}

/** Puts a copy on the system's clipboard, through a `copy` event's data when there is one. */
export async function writeClipboardCopy(
  copied: CopiedElements,
  data?: DataTransfer | null,
): Promise<void> {
  keepCopied(copied);
  const text = copiedText(copied);
  if (data) {
    data.setData('text/plain', text);
    return;
  }
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  await clipboard?.writeText(text);
}
