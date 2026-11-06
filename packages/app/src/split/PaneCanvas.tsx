/**
 * The canvas one pane of a split view draws (ADR 0102), at the same place in the tree whether the pane
 * is active or not, so that the canvas stays as another pane becomes active.
 *
 * The active pane draws what the shell works out for the open view: its scene, its filters and focus,
 * the emphasis every source sets, the selection, and the comparison while one shows. Each of the
 * others works out its own view's scene, filters and focus, from the filters and focus the shell keeps
 * for every view, into an emphasis of its own, and gives what is inside it an editor of its own view,
 * with the selection that is one for every pane.
 */
import type { Definitions, ProjectSnapshot, ThemeName } from '@visual-anything/core';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { CanvasArea, type SendCommand } from '../canvas/CanvasArea';
import { useExpandedInPlace } from '../canvas/layout/expand';
import {
  useExpandedByZoom,
  useFollowZoom,
  type ZoomExpansion,
} from '../canvas/overlays/useZoomExpansion';
import { useExplorer, type ExploredViews } from '../canvas/useExplorer';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import { EMPTY_SELECTION, type Selection } from '../editor/selection';
import { useT } from '../i18n';
import type { AttributeLookup } from '../live-values/lookup';
import { useLiveScene } from '../live-values/useLiveValues';
import type { CanvasCamera } from '../view-state/canvas';
import type { Pane, SplitPanes } from './panes';
import type { ViewScenes } from './scenes';
import { describeDrawing, viewOf } from './views';

/** What the active pane's canvas draws, as the shell works it out, and what shows after it. */
export interface ShownCanvas {
  /** Changes when the canvas starts again, as for a comparison, which draws in a canvas of its own. */
  key: string;
  canvas: Omit<ComponentProps<typeof CanvasArea>, 'active' | 'onCanvas'>;
  after?: ReactNode;
}

interface PaneCanvasProps {
  pane: Pane;
  active: boolean;
  store: SplitPanes;
  project: ProjectSnapshot;
  definitions: Definitions;
  /** The shell's editor, which is the active pane's. */
  editor: Editor;
  /** The shell's emphasis, which the active pane draws. */
  emphasis: EmphasisStore;
  /** The filters and focus the shell keeps for every view. */
  explored: ExploredViews;
  lookup: AttributeLookup;
  zoom: ZoomExpansion;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onCommand?: SendCommand | undefined;
  theme: ThemeName;
  /** The scene of each view, which every pane that draws it shares. */
  scenes: ViewScenes;
  /**
   * Whether the pane places the new shapes of its view and follows its zoom: the one pane of those
   * that show its view that does.
   */
  leads: boolean;
  /** Given the pane's canvas once it is made, and undefined once it goes. */
  onCanvas: (pane: string, canvas: CanvasCamera | undefined) => void;
  /** What the active pane draws; absent for the others. */
  shown?: ShownCanvas | undefined;
}

export function PaneCanvas({
  pane,
  active,
  store,
  project,
  definitions,
  editor,
  emphasis,
  explored,
  lookup,
  zoom,
  selection,
  onSelect,
  onCommand,
  theme,
  scenes,
  leads,
  onCanvas,
  shown,
}: PaneCanvasProps) {
  const t = useT();
  // The selection is one by element and relation id; a free shape belongs to one view, and is
  // selected in the active pane only, even where another pane shows the same view.
  const paneSelection = useMemo(
    () =>
      active || selection.freeShapes.size === 0
        ? selection
        : { ...selection, freeShapes: EMPTY_SELECTION.freeShapes },
    [active, selection],
  );
  // The pane's own emphasis and scene, worked out only while it is not the active one.
  const [own] = useState(() => new EmphasisStore());
  const view = active ? undefined : viewOf(project, pane.view);
  const zoomed = useExpandedByZoom(zoom, view?.id);
  const inPlace = useExpandedInPlace(project, view, zoomed, scenes);
  const expanded = inPlace.expanded;
  // The same scene the shell draws for the view as the active pane's, so that becoming active, or
  // ceasing to be, changes nothing the canvas draws.
  const scene = useMemo(
    () => (view ? scenes.scene(inPlace.project, view.id, expanded, t.language) : undefined),
    // The canvas writes built-in names and its own words in the language read in (ADR-0038).
    [scenes, inPlace.project, view, t.language, expanded],
  );
  const [canvas, setCanvas] = useState<CanvasCamera>();
  // Of two panes of one view, one follows its zoom, which the view's expansion is one for both.
  useFollowZoom(zoom, project, leads ? view : undefined, scene, canvas);
  const explore = useExplorer({
    project,
    viewId: view?.id,
    scene,
    selection,
    emphasis: own,
    lookup,
    kept: explored,
    followsSelection: false,
  });
  const liveScene = useLiveScene(scene, project, definitions, lookup, own);
  const paneEditor = useMemo<Editor>(
    () =>
      view
        ? {
            ...editor,
            viewId: view.id,
            scene,
            selection: paneSelection,
            explore,
            openView: (id) => store.setView(pane.id, id),
          }
        : editor,
    [editor, view, scene, paneSelection, explore, store, pane.id],
  );

  const reportCanvas = useCallback(
    (next: CanvasCamera | undefined) => {
      setCanvas(next);
      onCanvas(pane.id, next);
    },
    [pane.id, onCanvas],
  );
  // The tab keeps where the pane's camera is; a pane brought back inactive starts where it was.
  useEffect(() => {
    if (!canvas) return;
    let restore = store.takeCamera(pane.id);
    const keep = () => {
      const camera = canvas.camera();
      if (!camera) return;
      if (restore) {
        const to = restore;
        restore = undefined;
        canvas.setCamera(to);
        return;
      }
      store.keepCamera(pane.id, camera);
    };
    keep();
    return canvas.subscribe(keep);
  }, [canvas, store, pane.id]);

  const drawn =
    shown?.canvas ??
    (view && scene
      ? {
          project,
          view,
          scene: liveScene ?? scene,
          label: describeDrawing(t, view, scene),
          selection: paneSelection,
          onSelect,
          ...(onCommand ? { onCommand } : {}),
          theme,
        }
      : undefined);
  return (
    <EditorContext.Provider value={active ? editor : paneEditor}>
      <EmphasisContext.Provider value={active ? emphasis : own}>
        {drawn && (
          <CanvasArea
            key={shown?.key ?? 'view'}
            {...drawn}
            active={active}
            placesNew={leads}
            onCanvas={reportCanvas}
          />
        )}
        {active && shown?.after}
      </EmphasisContext.Provider>
    </EditorContext.Provider>
  );
}
