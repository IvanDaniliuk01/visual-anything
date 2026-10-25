/**
 * What Claude's live guidance shows in this tab: marks on some shapes, a move of the canvas, and a
 * caption; and what it asks of the tab's explorer and scenario session, to apply once each: filters,
 * focus mode and playback. Guidance never changes the project; each message replaces what it
 * concerns, and the person can dismiss all of it.
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

/** The filters guidance carries: what they hide, in lists. */
export type GuidedFilters = Extract<Guidance, { kind: 'filter' }>['filters'];

/** Focus guidance without its kind and view: where it starts, and how far it reaches. */
export type GuidedFocus = Omit<Extract<Guidance, { kind: 'focus-view' }>, 'kind' | 'view'>;

/** What Claude asks of a scenario's playback. */
export type GuidedPlayback = Omit<Extract<Guidance, { kind: 'playback' }>, 'kind'>;

/** Filters Claude set, to apply once to a view's explorer, as if the person had set them. */
export interface GuidedFilterRequest {
  filters: GuidedFilters;
  /** The view to open and filter; absent, the view open when the request comes. */
  view?: Id;
  /** Which guidance asked, so that each request applies once. */
  request: number;
}

/** Focus mode Claude turned on, or off, to apply once to a view's explorer. */
export interface GuidedFocusRequest {
  /** Where focus starts and how far it reaches; absent to turn focus off. */
  focus?: GuidedFocus;
  view?: Id;
  request: number;
}

/** A request to open, play, pause or step a scenario in this tab's scenario session. */
export type GuidedPlaybackRequest = GuidedPlayback & { request: number };

/** Everything Claude's guidance shows now, and what it asks of the tab. */
export interface GuidanceState {
  marks?: GuidanceMarks;
  panTo?: GuidancePan;
  /** A short text over the canvas, shown as plain text. */
  caption?: string;
  filter?: GuidedFilterRequest;
  focusView?: GuidedFocusRequest;
  playback?: GuidedPlaybackRequest;
}

/** No guidance at all. */
export const NO_GUIDANCE: GuidanceState = {};

/** Filters that hide nothing. */
const NO_FILTERS: GuidedFilters = { components: [], relationTypes: [], conditions: [] };

/** The guidance shown after one more message, numbered `request`. */
export function applyGuidance(
  state: GuidanceState,
  guidance: Guidance,
  request: number,
): GuidanceState {
  switch (guidance.kind) {
    case 'highlight':
    case 'focus': {
      const view = viewOf(guidance);
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
    case 'pan-to':
      return { ...state, panTo: { target: guidance.target, ...viewOf(guidance), request } };
    case 'caption': {
      if (guidance.text !== '') return { ...state, caption: guidance.text };
      const next = { ...state };
      delete next.caption;
      return next;
    }
    case 'clear':
      return NO_GUIDANCE;
    case 'filter':
      return { ...state, filter: { filters: guidance.filters, ...viewOf(guidance), request } };
    case 'focus-view': {
      const { targets, degrees, direction, isolate } = guidance;
      const focus: GuidedFocus = { targets, degrees, direction, isolate };
      return { ...state, focusView: { focus, ...viewOf(guidance), request } };
    }
    case 'clear-explore':
      return {
        ...state,
        filter: { filters: NO_FILTERS, ...viewOf(guidance), request },
        focusView: { ...viewOf(guidance), request },
      };
    case 'playback': {
      const { scenario, action, step } = guidance;
      const playback: GuidedPlaybackRequest = {
        scenario,
        action,
        ...(step === undefined ? {} : { step }),
        request,
      };
      return { ...state, playback };
    }
  }
}

function viewOf(guidance: { view?: Id }): { view?: Id } {
  return guidance.view === undefined ? {} : { view: guidance.view };
}
