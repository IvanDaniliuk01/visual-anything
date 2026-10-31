/**
 * Claude's guidance `space` (ADR 0076), done once per request, as the canvas does other guidance: it
 * opens the view it names first, in the tab the person used last only (`tabs.ts`), and then opens
 * the physical-space panel there, or keeps it open, showing the element `root` names, or what it
 * showed, or what the panel picks when it opens with nothing chosen; then it moves the panel's
 * camera as a tour's moves (`space/moves.ts`), or asks the panel to frame the elements named
 * (`SpacePanelStore.frame`). `close` closes the panel. Nothing is recorded, and the person can close
 * the panel or move its camera at any time.
 */
import { modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useRef } from 'react';
import type { Editor } from '../editor/EditorContext';
import type { SpacePanelStore } from '../space/store';
import type { GuidedSpaceRequest } from './state';
import { forThisTab } from './tabs';

/** Does what a guidance `space` asks of a view's panel, now that the view is open. */
export function applyGuidedSpace(
  store: SpacePanelStore,
  project: ProjectSnapshot,
  viewId: Id,
  request: GuidedSpaceRequest,
  reducedMotion: boolean,
): void {
  if (request.close) {
    store.close(viewId);
    return;
  }
  const world = project.model.world.id;
  const was = store.state(viewId);
  // A root that is not an element is passed over, as the panel's own choice is kept.
  const root =
    request.root !== undefined && modelIndexOf(project).element(request.root) !== undefined
      ? request.root
      : undefined;
  if (root !== undefined) {
    const shows = was !== undefined && (was.root ?? world) === root;
    if (!shows) store.set(viewId, root === world ? {} : { root });
  } else if (!was) {
    store.open(viewId);
  }
  if (request.camera) store.moves.move(viewId, request.camera, { reducedMotion });
  else if (request.frame) store.frame(viewId, request.frame);
}

/** Applies Claude's newest guidance `space` to the tab's panel, once, when its view is open. */
export function useGuidedSpace(
  request: GuidedSpaceRequest | undefined,
  editor: Editor | undefined,
  store: SpacePanelStore | null,
  reducedMotion: boolean,
): void {
  const applied = useRef<number>(undefined);
  const opened = useRef<number>(undefined);
  useEffect(() => {
    if (!request || !editor || !store || applied.current === request.request) return;
    if (!forThisTab(request, editor.viewId)) {
      applied.current = request.request;
      return;
    }
    const named = request.view;
    if (named !== undefined && named !== editor.viewId) {
      // The view opens first; a view the project lacks never will.
      if (!editor.project.views.some((view) => view.id === named)) {
        applied.current = request.request;
      } else if (opened.current !== request.request) {
        opened.current = request.request;
        editor.openView?.(named);
      }
      return;
    }
    const viewId = editor.viewId;
    if (viewId === undefined) return;
    applied.current = request.request;
    applyGuidedSpace(store, editor.project, viewId, request, reducedMotion);
  }, [request, editor, store, reducedMotion]);
}
