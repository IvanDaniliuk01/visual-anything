/**
 * The app's answer to layout guidance (M3d, "Fixes from use"; ADR 0029's clarification of 2026-10-30).
 * The program sends `lay_out_view`'s layout to the open apps with an id to answer by, and waits: the
 * tab that runs it answers `layout/done` with what each layout it asked for came to, once they are all
 * done; a tab that passes it over says why. So Claude hears what moved, and the program runs Claude's
 * layouts one after another, never one over another. Guidance with an answer is the pattern
 * `capture/request` follows too (ADR 0081). Protocol 7 carries it, since no build of 7 has shipped.
 */
import type { Id } from '@visual-anything/schema';

/**
 * How one layout ended: done, with the shapes it moved (none when nothing had to move or every
 * shape was pinned); stopped by the person, so nothing moved; replaced, when the tab showed another
 * view before it was done, so nothing moved; failed; or empty, a container the canvas draws holding
 * no shapes to lay out, such as a collapsed one or one that draws rows.
 */
export const LAYOUT_ENDINGS = ['done', 'stopped', 'replaced', 'failed', 'empty'] as const;
export type LayoutEnding = (typeof LAYOUT_ENDINGS)[number];

/** Why a tab ran none of a layout: it was for the tab the person used last, or it cannot lay out. */
export const LAYOUT_PASSES = ['other-tab', 'cannot-lay-out'] as const;
export type LayoutPass = (typeof LAYOUT_PASSES)[number];

/** What one layout came to: the whole view's, or a container's contents'. */
export interface LayoutResult {
  /** The container whose contents it arranged; absent for the whole view. */
  container?: Id;
  ended: LayoutEnding;
  /** How many shapes it moved. */
  moved: number;
  /** Why it failed, in English, as the app says it. */
  why?: string;
}

/** The longest reason a layout failed that an answer carries. */
export const MAX_LAYOUT_WHY = 500;

/**
 * The app's answer to layout guidance, by the guidance's `answer` id: what each layout it asked for
 * came to, in order, or why this tab ran none. Exactly one of `layouts` and `passed`.
 */
export interface LayoutDoneMessage {
  type: 'layout/done';
  requestId: string;
  layouts?: LayoutResult[];
  passed?: LayoutPass;
}

/**
 * What the program tells Claude about a layout it asked for: how many apps it reached, and what the
 * tab that ran it answered; or, when none did, why: every tab passed it over, the wait ran out, or
 * the apps went before answering.
 */
export interface LayoutReport {
  apps: number;
  layouts?: LayoutResult[];
  unanswered?: 'passed' | 'timed-out' | 'gone';
  /** For `passed`: why the tabs passed it over. */
  passed?: LayoutPass[];
  /** For `timed-out`: how long the program waited, in milliseconds. */
  waited?: number;
}

/** Why a message cannot be read, or what it holds. */
type Read<T> = { ok: true; value: T } | { ok: false; reason: string };

const isId = (value: unknown): value is Id =>
  typeof value === 'string' && value !== '' && value.length <= 128;

/**
 * Reads `layout/done` strictly, keeping only what it holds; `most` is the most layouts one guidance
 * asks for.
 */
export function readLayoutDone(
  message: Record<string, unknown>,
  requestId: string,
  most: number,
): Read<LayoutDoneMessage> {
  const { layouts, passed } = message;
  if ((layouts === undefined) === (passed === undefined)) {
    return {
      ok: false,
      reason: 'A layout’s answer gives what its layouts came to, or why it ran none.',
    };
  }
  if (passed !== undefined) {
    if (!LAYOUT_PASSES.some((each) => each === passed)) {
      return {
        ok: false,
        reason: `A tab passes a layout over as one of: ${LAYOUT_PASSES.join(', ')}.`,
      };
    }
    return { ok: true, value: { type: 'layout/done', requestId, passed: passed as LayoutPass } };
  }
  if (!Array.isArray(layouts) || layouts.length > most) {
    return { ok: false, reason: `A layout’s answer lists at most ${most} layouts.` };
  }
  const read: LayoutResult[] = [];
  for (const each of layouts as unknown[]) {
    if (typeof each !== 'object' || each === null) {
      return { ok: false, reason: 'Each layout of an answer is an object.' };
    }
    const { container, ended, moved, why } = each as Record<string, unknown>;
    if (container !== undefined && !isId(container)) {
      return { ok: false, reason: 'A layout names its container by id.' };
    }
    if (!LAYOUT_ENDINGS.some((ending) => ending === ended)) {
      return { ok: false, reason: `A layout ends as one of: ${LAYOUT_ENDINGS.join(', ')}.` };
    }
    if (!Number.isSafeInteger(moved) || (moved as number) < 0) {
      return { ok: false, reason: 'A layout says how many shapes it moved, as a whole number.' };
    }
    if (why !== undefined && (typeof why !== 'string' || why.length > MAX_LAYOUT_WHY)) {
      return {
        ok: false,
        reason: `Why a layout failed is a text of at most ${MAX_LAYOUT_WHY} characters.`,
      };
    }
    read.push({
      ...(container === undefined ? {} : { container }),
      ended: ended as LayoutEnding,
      moved: moved as number,
      ...(why === undefined ? {} : { why }),
    });
  }
  return { ok: true, value: { type: 'layout/done', requestId, layouts: read } };
}
