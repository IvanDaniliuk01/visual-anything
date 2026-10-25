/**
 * What Claude's guidance asks of this tab, done once per request: filters and focus mode go to the
 * open view's explorer as if the person had set them (ADR-0025), so the explore strip shows them and
 * the person ends them there; playback goes to the scenario session, as the scenario panel's buttons
 * do, so the person pauses or closes it there. A request that names a view, or plays a scenario over
 * one, opens that view first. Nothing here changes the project.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useRef } from 'react';
import type { Editor } from '../editor/EditorContext';
import type { PlaybackGuidance, ScenarioSession } from '../scenarios/session';
import { filtersOf, focusSettingsOf, focusTargetsOf } from './explore';
import type { GuidanceState, GuidedFilterRequest, GuidedFocusRequest } from './state';

/** Applies Claude's filters, focus and playback; mount it once, inside the shell's editor. */
export function useGuidedRequests(
  guidance: GuidanceState,
  editor: Editor | undefined,
  scenarios: ScenarioSession | undefined,
): void {
  const { filter, focusView, playback } = guidance;

  // The last request each one applied, and the requests that opened their view already.
  const applied = useRef<{ filter?: number; focus?: number; playback?: number }>({});
  const opened = useRef(new Set<number>());

  useEffect(() => {
    const explore = editor?.explore;
    if (!editor || !explore) return;
    // Whether a request can apply now; it opens its view first, once, and waits for it.
    const ready = (request: GuidedFilterRequest | GuidedFocusRequest): boolean => {
      if (request.view === undefined || request.view === editor.viewId) return true;
      if (!hasView(editor.project, request.view)) return true;
      if (!opened.current.has(request.request)) {
        opened.current.add(request.request);
        editor.openView?.(request.view);
      }
      return false;
    };
    // Whether a request names the view open now, or none: one for a view that is gone does nothing.
    const here = (request: { view?: Id }) =>
      request.view === undefined || request.view === editor.viewId;

    if (filter && applied.current.filter !== filter.request && ready(filter)) {
      applied.current.filter = filter.request;
      if (here(filter)) explore.setFilters(filtersOf(filter.filters));
    }
    if (focusView && applied.current.focus !== focusView.request && ready(focusView)) {
      applied.current.focus = focusView.request;
      if (here(focusView)) {
        const { focus } = focusView;
        if (focus === undefined) explore.setFocus({ on: false });
        else explore.focusOn(focusTargetsOf(focus.targets, editor.project), focusSettingsOf(focus));
      }
    }
  }, [filter, focusView, editor]);

  useEffect(() => {
    if (!playback || !editor || !scenarios || applied.current.playback === playback.request) {
      return;
    }
    applied.current.playback = playback.request;
    const scenario = editor.project.scenarios.find((each) => each.id === playback.scenario);
    if (!scenario) return;
    const asked: PlaybackGuidance = {
      scenario: playback.scenario,
      action: playback.action,
      ...(playback.step === undefined ? {} : { step: playback.step }),
    };
    // Both at once, so that the session's next sync brings the scenario's timeline over its view.
    scenarios.guide(asked);
    if (scenario.view !== editor.viewId && hasView(editor.project, scenario.view)) {
      editor.openView?.(scenario.view);
    }
  }, [playback, editor, scenarios]);
}

function hasView(project: ProjectSnapshot, id: Id): boolean {
  return project.views.some((view) => view.id === id);
}
