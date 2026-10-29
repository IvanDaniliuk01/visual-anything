/**
 * What Claude's live guidance shows in this tab: marks on some shapes, a move of the canvas, and a
 * caption; and what it asks of the tab's explorer, scenario session, layout and tours, to apply once
 * each: filters, focus mode, playback, a layout and a tour played full screen. Guidance never changes
 * the project itself: a layout it asks for is run and recorded by the tab as any layout is. Each
 * message replaces what it concerns, and the person can dismiss all of it.
 */
import type { Guidance, VersionRef } from '@visual-anything/core';
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

/**
 * A request to open, play, pause or step a scenario in this tab's scenario session, or to choose an
 * alternative at one of its decisions (ADR 0078).
 */
export type GuidedPlaybackRequest = GuidedPlayback & { request: number };

/**
 * A request to lay out a view as the toolbar's Layout does, once: every shape that is not pinned, or
 * the contents of the containers it names. The layout is recorded as any layout is (ADR-0015).
 */
export interface GuidedLayoutRequest {
  /** The view to open and lay out; absent, the view open when the request comes. */
  view?: Id;
  /** The containers whose contents to lay out, each on its own; absent, the whole view. */
  containers?: readonly Id[];
  request: number;
}

/**
 * A request to play a tour full screen once, as the tours panel's Play does (ADR 0058): from the step
 * at `step`, or from the first. From then on the tour is the person's, who ends it with Escape.
 */
export interface GuidedTourRequest {
  tour: Id;
  /** The index of the step it plays from, among the tour's steps. */
  step?: number;
  request: number;
}

/**
 * A request to compare a version with the project now, as if the person had chosen it in Compare
 * with… (ADR 0070): the version as the program listed it, the view to draw, and how.
 */
export interface GuidedComparisonRequest {
  version: VersionRef;
  view?: Id;
  show?: 'before' | 'after' | 'comparison';
  request: number;
}

/** Everything Claude's guidance shows now, and what it asks of the tab. */
export interface GuidanceState {
  marks?: GuidanceMarks;
  panTo?: GuidancePan;
  /** A short text over the canvas, shown as plain text. */
  caption?: string;
  filter?: GuidedFilterRequest;
  focusView?: GuidedFocusRequest;
  playback?: GuidedPlaybackRequest;
  layout?: GuidedLayoutRequest;
  tour?: GuidedTourRequest;
  comparison?: GuidedComparisonRequest;
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
      const { scenario, action, step, choices, decision, alternative } = guidance;
      const playback: GuidedPlaybackRequest = {
        scenario,
        action,
        ...(step === undefined ? {} : { step }),
        ...(choices === undefined ? {} : { choices }),
        ...(decision === undefined ? {} : { decision }),
        ...(alternative === undefined ? {} : { alternative }),
        request,
      };
      return { ...state, playback };
    }
    case 'layout': {
      const layout: GuidedLayoutRequest = {
        ...viewOf(guidance),
        ...(guidance.containers === undefined ? {} : { containers: guidance.containers }),
        request,
      };
      return { ...state, layout };
    }
    case 'tour': {
      const tour: GuidedTourRequest = {
        tour: guidance.tour,
        ...(guidance.step === undefined ? {} : { step: guidance.step }),
        request,
      };
      // The tour shows its own caption card and marks, full screen: Claude's go.
      const next: GuidanceState = { ...state, tour };
      delete next.marks;
      delete next.panTo;
      delete next.caption;
      return next;
    }
    case 'comparison': {
      const comparison: GuidedComparisonRequest = {
        version: guidance.version,
        ...viewOf(guidance),
        ...(guidance.show === undefined ? {} : { show: guidance.show }),
        request,
      };
      return { ...state, comparison };
    }
  }
}

function viewOf(guidance: { view?: Id }): { view?: Id } {
  return guidance.view === undefined ? {} : { view: guidance.view };
}
