/**
 * What Claude's live guidance shows in this tab: marks on some shapes, a move of the canvas, and a
 * caption. Guidance never changes the project; each message replaces what it concerns, and the person
 * can dismiss all of it.
 */
import type { Guidance } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** Claude's marks: the targets highlighted, or focused on with everything else dimmed. */
export interface GuidanceMarks {
  kind: 'highlight' | 'focus';
  targets: readonly Id[];
  /** The view to open first, when Claude named one. */
  view?: Id;
  /** Which guidance made them, so that the same marks asked for twice open the view twice. */
  request: number;
}

/** A request to move the canvas so that a target shows. */
export interface GuidancePan {
  target: Id;
  view?: Id;
  /** Which guidance asked, so that moving to the same target twice moves twice. */
  request: number;
}

/** Everything Claude's guidance shows now. */
export interface GuidanceState {
  marks?: GuidanceMarks;
  panTo?: GuidancePan;
  /** A short text over the canvas, shown as plain text. */
  caption?: string;
}

/** No guidance at all. */
export const NO_GUIDANCE: GuidanceState = {};

/** The guidance shown after one more message, numbered `request`. */
export function applyGuidance(
  state: GuidanceState,
  guidance: Guidance,
  request: number,
): GuidanceState {
  switch (guidance.kind) {
    case 'highlight':
    case 'focus': {
      const view = guidance.view === undefined ? {} : { view: guidance.view };
      const marks: GuidanceMarks = {
        kind: guidance.kind,
        targets: guidance.targets,
        ...view,
        request,
      };
      const [first] = guidance.targets;
      if (guidance.kind === 'highlight' || first === undefined) return { ...state, marks };
      return { ...state, marks, panTo: { target: first, ...view, request } };
    }
    case 'pan-to': {
      const view = guidance.view === undefined ? {} : { view: guidance.view };
      return { ...state, panTo: { target: guidance.target, ...view, request } };
    }
    case 'caption': {
      if (guidance.text !== '') return { ...state, caption: guidance.text };
      const { caption: _gone, ...rest } = state;
      return rest;
    }
    case 'clear':
      return NO_GUIDANCE;
  }
}
