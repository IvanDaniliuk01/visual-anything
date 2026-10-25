/**
 * Claude's live guidance on the open view. Its marks go to the canvas through the emphasis store, as
 * the "guidance" source; a move goes through the editor's `reveal`; and its caption, or what its marks
 * say when there is no caption, shows over the canvas with a way to dismiss it. Guidance names a view
 * when Claude wants it seen there: that view opens first. Filters, focus mode and playback go to the
 * explorer and the scenario session, as the person's would. Nothing here changes the project.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { useContext, useEffect, useMemo, useRef } from 'react';
import { EditorContext } from '../editor/EditorContext';
import { useEmphasisSource } from '../editor/emphasis';
import { LiveContext } from '../live/context';
import type { ScenarioSession } from '../scenarios/session';
import { NO_GUIDANCE } from './state';
import { describeMarks, guidanceEmphasis, revealKeyFor } from './targets';
import { useGuidedRequests } from './useGuidedRequests';
import './guidance.css';

interface GuidanceLayerProps {
  /** The tab's scenario session, which Claude's playback guidance plays; absent, it is ignored. */
  scenarios?: ScenarioSession;
}

/** Shows Claude's guidance; mount it inside the canvas area, within the shell's editor. */
export function GuidanceLayer({ scenarios }: GuidanceLayerProps = {}) {
  const live = useContext(LiveContext);
  const editor = useContext(EditorContext);
  const guidance = live?.guidance ?? NO_GUIDANCE;
  const { marks, panTo, caption } = guidance;
  useGuidedRequests(guidance, editor, scenarios);
  const project = editor?.project;
  const scene = editor?.scene;
  const viewId = editor?.viewId;
  const openView = editor?.openView;
  const reveal = editor?.reveal;

  // Marks Claude made for a view show in that view only; marks for no view show in the open one.
  const shown = marks !== undefined && (marks.view === undefined || marks.view === viewId);
  const emphasis = useMemo(
    () =>
      shown && marks && scene && project ? guidanceEmphasis(marks, scene, project) : undefined,
    [shown, marks, scene, project],
  );
  useEmphasisSource('guidance', emphasis);

  // Each request opens its view once; the person may go elsewhere afterwards.
  const opened = useRef(new Set<number>());
  useEffect(() => {
    for (const request of [marks, panTo]) {
      if (request?.view === undefined || opened.current.has(request.request)) continue;
      opened.current.add(request.request);
      if (request.view !== viewId && hasView(project, request.view)) openView?.(request.view);
    }
  }, [marks, panTo, viewId, openView, project]);

  // A move waits until its view is open and drawn, then happens once.
  const moved = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (panTo === undefined || moved.current === panTo.request || scene === undefined) return;
    if (panTo.view !== undefined && panTo.view !== viewId && hasView(project, panTo.view)) return;
    moved.current = panTo.request;
    const key = revealKeyFor(panTo.target, scene);
    if (key !== undefined) reveal?.(key);
  }, [panTo, scene, viewId, reveal, project]);

  const said = caption ?? (marks && project ? describeMarks(marks, project) : undefined);
  return (
    <>
      <p className="visually-hidden" aria-live="polite">
        {said === undefined ? '' : caption !== undefined ? `Claude: ${caption}` : said}
      </p>
      {said !== undefined && (
        <aside className="guidance-caption" aria-label="Claude’s guidance">
          <span className="guidance-caption-author" aria-hidden="true">
            Claude
          </span>
          <p className="guidance-caption-text">{said}</p>
          {live?.clearGuidance !== undefined && (
            <button
              type="button"
              className="guidance-dismiss"
              aria-label="Dismiss Claude’s guidance"
              title="Dismiss Claude’s guidance"
              onClick={live.clearGuidance}
            >
              ×
            </button>
          )}
        </aside>
      )}
    </>
  );
}

/** Whether the project has a view with this id. */
function hasView(project: ProjectSnapshot | undefined, id: string): boolean {
  return project?.views.some((view) => view.id === id) ?? false;
}
