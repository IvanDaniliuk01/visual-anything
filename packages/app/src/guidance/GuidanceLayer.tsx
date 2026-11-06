/**
 * Claude's live guidance on the open view. Its marks go to the canvas through the emphasis store, as
 * the "guidance" source; a move goes through the editor's `reveal`; and its caption, or what its marks
 * say when there is no caption, shows over the canvas with a way to dismiss it. Guidance names a view
 * when Claude wants it seen there: that view opens first, in the tab the person used last
 * (`tabs.ts`). Filters, focus mode and playback go to the
 * explorer and the scenario session, and a tour to the tab's full-screen playback, as the person's
 * would. The physical-space panel opens, shows, moves and frames as `useGuidedSpace.ts` says, and
 * a simulation opens, plays, pauses and closes as `useGuidedSimulation.ts` says.
 * Nothing here changes the project.
 *
 * Claude's pictures wait for the guidance sent before them (#16): the layer says when it applied the
 * guidance it shows, once every view it opened for it shows and its move has been drawn.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useContext, useEffect, useMemo, useRef } from 'react';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { useEmphasisSource } from '../editor/emphasis';
import { useT } from '../i18n';
import { LiveContext } from '../live/context';
import { useMotion } from '../scenarios/motion';
import { DismissIcon } from '../shell/icons';
import type { ScenarioSession } from '../scenarios/session';
import { useSimulations } from '../simulation/context';
import { useSpacePanel } from '../space/context';
import { NO_GUIDANCE } from './state';
import { forThisTab } from './tabs';
import { describeMarks, guidanceEmphasis, revealKeyFor } from './targets';
import { useGuidedRequests } from './useGuidedRequests';
import { useGuidedSimulation } from './useGuidedSimulation';
import { useGuidedSpace } from './useGuidedSpace';
import './guidance.css';

/**
 * How long a view guidance opened is waited for before Claude's pictures no longer wait for it, in
 * milliseconds, as when the shell does not open it (#16).
 */
const OPENING_WAIT = 10_000;

interface GuidanceLayerProps {
  /** The tab's scenario session, which Claude's playback guidance plays; absent, it is ignored. */
  scenarios?: ScenarioSession;
}

/** Shows Claude's guidance; mount it inside the canvas area, within the shell's editor. */
export function GuidanceLayer({ scenarios }: GuidanceLayerProps) {
  const t = useT();
  const live = useContext(LiveContext);
  const editor = useContext(EditorContext);
  const guidance = live?.guidance ?? NO_GUIDANCE;
  const { marks, panTo, caption } = guidance;
  // The view shown when guidance last opened another, and when: Claude's pictures wait until the
  // view shown changes (#16).
  const openingRef = useRef<{ from: Id | undefined; at: number } | undefined>(undefined);
  const guided = useOpeningNoted(editor, openingRef);
  useGuidedRequests(guidance, guided, scenarios);
  const spacePanel = useSpacePanel();
  const { reduced } = useMotion();
  useGuidedSpace(guidance.space, guided, spacePanel, reduced);
  const simulations = useSimulations();
  useGuidedSimulation(guidance.simulation, guided, simulations);
  const project = editor?.project;
  const scene = editor?.scene;
  const viewId = editor?.viewId;
  const openView = guided?.openView;
  const reveal = editor?.reveal;

  // Marks Claude made for a view show in that view only; marks for no view show in the open one.
  const shown = marks !== undefined && (marks.view === undefined || marks.view === viewId);
  const emphasis = useMemo(
    () =>
      shown && marks && scene && project ? guidanceEmphasis(marks, scene, project) : undefined,
    [shown, marks, scene, project],
  );
  useEmphasisSource('guidance', emphasis);

  // Each request opens its view once, in the tab the person used last only; the person may go
  // elsewhere afterwards.
  const opened = useRef(new Set<number>());
  useEffect(() => {
    for (const request of [marks, panTo]) {
      if (request?.view === undefined || opened.current.has(request.request)) continue;
      opened.current.add(request.request);
      if (
        request.view !== viewId &&
        hasView(project, request.view) &&
        forThisTab(request, viewId)
      ) {
        openView?.(request.view);
      }
    }
  }, [marks, panTo, viewId, openView, project]);

  // A move waits until its view is open and drawn, then happens once; a tab that does not open its
  // view passes it over.
  const moved = useRef<number | undefined>(undefined);
  // Whether a move was just asked of the shell, which the canvas has not drawn yet (#16).
  const revealing = useRef(false);
  useEffect(() => {
    if (panTo === undefined || moved.current === panTo.request || scene === undefined) return;
    if (!forThisTab(panTo, viewId)) {
      moved.current = panTo.request;
      return;
    }
    if (panTo.view !== undefined && panTo.view !== viewId && hasView(project, panTo.view)) return;
    if (project === undefined) return;
    moved.current = panTo.request;
    const key = revealKeyFor(panTo.target, scene, project);
    if (key === undefined || reveal === undefined) return;
    reveal(key);
    // The canvas moves when the shell has drawn again, which draws this layer again too.
    revealing.current = true;
  }, [panTo, scene, viewId, reveal, project]);

  // Says when the guidance shown is applied, which Claude's pictures wait for (#16): every view it
  // opened shows, or the person went elsewhere, and its move, if any, has been drawn.
  const applied = live?.guidanceApplied;
  useEffect(() => {
    if (applied === undefined) return;
    const asked = openingRef.current;
    if (asked !== undefined && (asked.from !== viewId || Date.now() - asked.at > OPENING_WAIT)) {
      openingRef.current = undefined;
    }
    if (openingRef.current !== undefined) return;
    if (revealing.current) {
      revealing.current = false;
      return;
    }
    // A move for this tab waits for its view and its scene.
    if (panTo !== undefined && moved.current !== panTo.request) return;
    applied(guidance);
  });

  // A caption is Claude's own text, shown as Claude wrote it. Marks are said by what the open view
  // shows of them, once their view is the one open.
  const said =
    caption ??
    (marks && project ? describeMarks(marks, project, t, shown ? scene : undefined) : undefined);
  return (
    <>
      <p className="visually-hidden" aria-live="polite">
        {said === undefined
          ? ''
          : caption !== undefined
            ? t('Claude: {caption}', { caption })
            : said}
      </p>
      {said !== undefined && (
        <aside className="guidance-caption" aria-label={t('Claude’s guidance')}>
          <span className="guidance-caption-author" aria-hidden="true">
            Claude
          </span>
          <p className="guidance-caption-text">{said}</p>
          {live?.clearGuidance !== undefined && (
            <button
              type="button"
              className="guidance-dismiss"
              aria-label={t('Dismiss Claude’s guidance')}
              title={t('Dismiss Claude’s guidance')}
              onClick={live.clearGuidance}
            >
              <DismissIcon />
            </button>
          )}
        </aside>
      )}
    </>
  );
}

/**
 * The editor as guidance uses it: opening a view through it notes the view shown then, which Claude's
 * pictures wait to change (#16).
 */
function useOpeningNoted(
  editor: Editor | undefined,
  openingRef: { current: { from: Id | undefined; at: number } | undefined },
): Editor | undefined {
  return useMemo(() => {
    const openView = editor?.openView;
    if (editor === undefined || openView === undefined) return editor;
    return {
      ...editor,
      openView: (view: Id) => {
        if (view !== editor.viewId) openingRef.current = { from: editor.viewId, at: Date.now() };
        openView(view);
      },
    };
  }, [editor, openingRef]);
}

/** Whether the project has a view with this id. */
function hasView(project: ProjectSnapshot | undefined, id: string): boolean {
  return project?.views.some((view) => view.id === id) ?? false;
}
