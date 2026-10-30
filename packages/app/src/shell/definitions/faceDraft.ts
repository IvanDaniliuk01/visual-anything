/**
 * What the Face section edits (ADR 0083): a draft of a face, its markup, style and variants as the
 * text areas hold them, kept apart from the face the project has until Apply sends the parts that
 * changed as one command. Keystrokes send nothing. Pure, for the section and its tests.
 */
import type { AppearanceChanges, Command, FaceProblem, ResolvedFace } from '@visual-anything/core';
import type { FaceVariant, Id } from '@visual-anything/schema';

/** The command that sets parts of a component's face, at the level the project can change. */
export function componentFaceCommand(component: Id, face: FaceChanges | 'none' | null): Command {
  return { type: 'set-component-appearance', component, appearanceTraits: { face } };
}

/** The command that sets parts of one element's own face, a particularity of it. */
export function elementFaceCommand(element: Id, face: FaceChanges | 'none' | null): Command {
  return { type: 'update-element', id: element, changes: { appearanceTraits: { face } } };
}

export interface FaceDraft {
  size: 'content' | 'shape';
  /** The markup as its text area holds it, a line each. */
  markup: string;
  style: string;
  variants: readonly { id: string; markup: string }[];
  /** The id of the variant a collapsed container shows, or `''` for none. */
  collapsed: string;
}

/** A face's changes, part by part, as `set-component-appearance` and `update-element` take them. */
export type FaceChanges = Exclude<NonNullable<AppearanceChanges['face']>, 'none'>;

/** A face that writes what the canvas writes without one: the name, the detail and the badges. */
export const STARTING_FACE: ResolvedFace = {
  size: 'shape',
  markup: ['<b>{{name}}</b>', '<p class="detail"><detail/></p>', '<p class="badges"><badges/></p>'],
  style: [
    'face { justify-content: center; gap: 2px; padding: 4px 8px; }',
    'b { font-size: 14px; text-align: center; line-clamp: 2; }',
    '.detail { color: var(--text-muted); text-align: center; line-clamp: 3; }',
    '.badges { font-size: 9px; font-weight: 700; text-align: center; }',
  ],
  variants: [],
};

/** Lines as a text area holds them. */
export function textOf(lines: readonly string[]): string {
  return lines.join('\n');
}

/** A text area's text as lines, without the empty lines it ends with. */
export function linesOf(text: string): string[] {
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && lines.at(-1)?.trim() === '') lines.pop();
  return lines;
}

/** The draft of a face, or of none: an empty markup, which the section offers to start from. */
export function draftOf(face: ResolvedFace | undefined): FaceDraft {
  return {
    size: face?.size ?? 'shape',
    markup: textOf(face?.markup ?? []),
    style: textOf(face?.style ?? []),
    variants: (face?.variants ?? []).map((variant) => ({
      id: variant.id,
      markup: textOf(variant.markup),
    })),
    collapsed: face?.collapsed ?? '',
  };
}

/** The face a draft writes, as the core lays it out. */
export function faceOfDraft(draft: FaceDraft): ResolvedFace {
  return {
    size: draft.size,
    markup: linesOf(draft.markup),
    style: linesOf(draft.style),
    variants: draftVariants(draft),
    ...(draft.collapsed === '' ? {} : { collapsed: draft.collapsed }),
  };
}

function draftVariants(draft: FaceDraft): FaceVariant[] {
  return draft.variants.map((variant) => ({ id: variant.id, markup: linesOf(variant.markup) }));
}

function same(a: readonly unknown[], b: readonly unknown[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The parts of a face a draft changes from the face shown: undefined when it changes none. A markup
 * the draft empties is taken out, so that it is inherited again.
 */
export function changesOf(
  draft: FaceDraft,
  shown: ResolvedFace | undefined,
): FaceChanges | undefined {
  const before = shown ?? { size: 'shape', markup: [], style: [], variants: [] };
  const face = faceOfDraft(draft);
  const changes: FaceChanges = {};
  if (face.size !== before.size) changes.size = face.size;
  if (!same(face.markup, before.markup)) {
    changes.markup = face.markup.length > 0 ? [...face.markup] : null;
  }
  if (!same(face.style, before.style)) changes.style = [...face.style];
  if (!same(face.variants, before.variants)) changes.variants = [...face.variants];
  if ((face.collapsed ?? '') !== (before.collapsed ?? '')) {
    changes.collapsed = face.collapsed ?? null;
  }
  return Object.keys(changes).length === 0 ? undefined : changes;
}

/** Which text a problem is in: the markup, the style, or a variant's markup, by its id. */
export type DraftPart = 'markup' | 'style' | `variant:${string}`;

export function partOfProblem(found: FaceProblem): DraftPart {
  return found.part.kind === 'variant' ? `variant:${found.part.id}` : found.part.kind;
}

/** Where a line and a column are in a text, as an offset; the line's start for column 0. */
export function offsetOf(text: string, line: number, column: number): number {
  const lines = text.split('\n');
  let offset = 0;
  for (let at = 0; at < Math.min(Math.max(line, 1) - 1, lines.length); at++) {
    offset += (lines[at]?.length ?? 0) + 1;
  }
  return Math.min(text.length, offset + Math.max(0, column - 1));
}

/** A variant's id a person may type: lowercase letters, digits and "-", a letter first. */
export const VARIANT_ID = /^[a-z][a-z0-9-]{0,31}$/;
