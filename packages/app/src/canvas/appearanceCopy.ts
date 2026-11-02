/**
 * Copy appearance and paste appearance (ADR 0088, A6.4): every Style and Text trait one element or
 * relation is drawn with, kept by the app, and set on the selection as its own in one action.
 *
 * - Copying reads what the item draws with, wherever each trait comes from: its own appearance, its
 *   component's or relation type's, the project's, Essence's. A trait the drawing defaults give is
 *   copied as nothing set, so that pasting takes the target's own value of it away.
 * - Pasting onto elements sets an element's shape, fill, stroke, border, corner radius, opacity,
 *   shadow, gradient, every part of its text and where its text sits; onto relations a line's stroke,
 *   width, dash, opacity and route. From an element onto a relation, or back, the traits both have go
 *   across: the stroke, the dash and the opacity.
 * - What is copied is kept for the tab's session, in memory, as the copied item's values: deleting or
 *   changing the item after copying changes nothing pasted later.
 *
 * Pure but for the store of what was copied, which the canvas, its menus and the format panel share.
 */
import {
  appearanceOf,
  definitionsIn,
  modelIndexOf,
  relationAppearanceOf,
  type AppearanceChanges,
  type Command,
  type ProjectSnapshot,
  type RelationAppearanceChanges,
} from '@visual-anything/core';
import type { Id, TextStyle } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import { IS_APPLE } from '../live/platform';

/** The keys of copying and pasting appearance, as shown and as `aria-keyshortcuts` names them. */
export const APPEARANCE_KEYS = {
  copy: { shown: IS_APPLE ? '⌥⌘C' : 'Ctrl+Alt+C', keys: 'Control+Alt+C Meta+Alt+C' },
  paste: { shown: IS_APPLE ? '⌥⌘V' : 'Ctrl+Alt+V', keys: 'Control+Alt+V Meta+Alt+V' },
} as const;

/**
 * Whether a key press copies or pastes appearance: Ctrl+Alt+C or Ctrl+Alt+V, ⌥⌘C or ⌥⌘V on Apple's
 * keyboards, read by the key's place so that any layout takes it; undefined for any other.
 */
export function appearanceShortcut(event: {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): 'copy' | 'paste' | undefined {
  if (!event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return undefined;
  if (event.code === 'KeyC') return 'copy';
  if (event.code === 'KeyV') return 'paste';
  return undefined;
}

/** The parts of a text, each pasted on its own. */
const TEXT_PARTS = [
  'font',
  'size',
  'bold',
  'italic',
  'underline',
  'align',
  'position',
  'color',
  'background',
  'border',
  'wrap',
  'padding',
] as const satisfies readonly (keyof TextStyle)[];

/** What was copied: from what, and the traits pasted onto elements and onto relations. */
export interface CopiedAppearance {
  kind: 'element' | 'relation';
  /** The copied item's name, as the panel says it. */
  name: string;
  id: Id;
  /** What an element takes of it. */
  shape: AppearanceChanges;
  /** What a relation takes of it. */
  line: RelationAppearanceChanges;
}

let copied: CopiedAppearance | undefined;
const listeners = new Set<() => void>();

/** What was copied last, if anything. */
export function copiedAppearance(): CopiedAppearance | undefined {
  return copied;
}

/** Calls `listener` whenever something else is copied; gives back what stops it. */
export function onCopiedAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Keeps what was copied, or forgets it with `undefined`. */
export function keepCopiedAppearance(appearance: CopiedAppearance | undefined): void {
  copied = appearance;
  for (const listener of listeners) listener();
}

/**
 * The appearance of the one element or relation selected, as copying takes it; a reason, in English
 * for the catalog, when the selection is not one element or one relation.
 */
export function appearanceToCopy(
  project: ProjectSnapshot,
  selection: Pick<Selection, 'elements' | 'relations' | 'freeShapes'>,
): { copied: CopiedAppearance } | { reason: string } {
  const count = selection.elements.size + selection.relations.size + selection.freeShapes.size;
  if (count !== 1 || selection.freeShapes.size > 0) {
    return { reason: 'Select one element or one relation to copy its appearance.' };
  }
  const definitions = definitionsIn(project);
  const index = modelIndexOf(project);
  const [elementId] = selection.elements;
  if (elementId !== undefined) {
    const element = index.element(elementId);
    if (!element) return { reason: 'Select one element or one relation to copy its appearance.' };
    const look = appearanceOf(element, definitions);
    const text: NonNullable<AppearanceChanges['text']> = {};
    for (const part of TEXT_PARTS) {
      (text as Record<string, unknown>)[part] = look.text[part] ?? null;
    }
    const shape: AppearanceChanges = {
      shape: look.shape,
      fill: look.fill,
      stroke: look.stroke,
      borderWidth: look.borderWidth ?? null,
      dash: look.dash,
      cornerRadius: look.cornerRadius ?? null,
      opacity: look.opacity,
      shadow: look.shadow ?? null,
      gradient: look.gradient ?? 'none',
      text,
      textPlacement: look.textPlacement,
    };
    return {
      copied: {
        kind: 'element',
        id: element.id,
        name: element.name,
        shape,
        line: { stroke: look.stroke, dash: look.dash, opacity: look.opacity },
      },
    };
  }
  const [relationId] = selection.relations;
  const relation = relationId === undefined ? undefined : index.relation(relationId);
  if (!relation) return { reason: 'Select one element or one relation to copy its appearance.' };
  const look = relationAppearanceOf(relation, definitions);
  return {
    copied: {
      kind: 'relation',
      id: relation.id,
      name: relation.name ?? '',
      shape: { stroke: look.stroke, dash: look.dash, opacity: look.opacity },
      line: {
        stroke: look.stroke,
        width: look.width,
        dash: look.dash,
        opacity: look.opacity,
        route: look.route ?? null,
      },
    },
  };
}

/**
 * The one action that pastes what was copied onto the selected elements and relations, the copied
 * item itself left out: a batch named for how many it changes. A reason, in English for the catalog,
 * when nothing was copied or nothing selected takes it.
 */
export function pasteAppearanceCommand(
  project: ProjectSnapshot,
  selection: Pick<Selection, 'elements' | 'relations'>,
  from: CopiedAppearance | undefined,
): { command: Command; label: string } | { reason: string } {
  if (!from) return { reason: 'Copy the appearance of an element or a relation first.' };
  const index = modelIndexOf(project);
  const commands: Command[] = [];
  const names: string[] = [];
  for (const id of selection.elements) {
    if (from.kind === 'element' && id === from.id) continue;
    const element = index.element(id);
    if (!element) continue;
    commands.push({ type: 'update-element', id, changes: { appearanceTraits: from.shape } });
    names.push(element.name);
  }
  for (const id of selection.relations) {
    if (from.kind === 'relation' && id === from.id) continue;
    const relation = index.relation(id);
    if (!relation) continue;
    commands.push({ type: 'update-relation', id, changes: { appearanceTraits: from.line } });
    names.push(relation.name ?? '');
  }
  if (commands.length === 0) {
    return { reason: 'Select the elements or relations to paste the appearance onto.' };
  }
  const [only] = names;
  const label =
    commands.length === 1 && only !== undefined && only !== ''
      ? `Paste the appearance onto "${only}"`
      : `Paste the appearance onto ${commands.length} items`;
  return { command: { type: 'batch', label, commands }, label };
}
