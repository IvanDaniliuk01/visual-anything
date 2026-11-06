import type { ProjectSnapshot } from '@visual-anything/core';
import type { CaptionAt, CaptionSize, Id } from '@visual-anything/schema';
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { SendCommand } from '../canvas/CanvasArea';
import { TurningContext, type CanvasTurning } from '../canvas/solids/turningContext';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { ExportControl } from '../export/ExportControl';
import { fragmentOf } from '../export/page-export';
import { ImageSource, ImageSourceContext } from '../export/source';
import { ImportControl } from '../import/ImportControl';
import { PackagesControl } from '../packages/PackagesControl';
import { DefinitionProvider } from './definitions/DefinitionProvider';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import { GuidanceLayer } from '../guidance/GuidanceLayer';
import { useSelection } from '../editor/useSelection';
import { useExpandedInPlace } from '../canvas/layout/expand';
import {
  ZoomExpansion,
  ZoomExpansionContext,
  useExpandedByZoom,
  useFollowZoom,
} from '../canvas/overlays/useZoomExpansion';
import { useExplorer, type ViewExplore } from '../canvas/useExplorer';
import { selectionOf } from '../editor/selection';
import { showsViews } from '../guidance/tabs';
import { PaneCanvas, type ShownCanvas } from '../split/PaneCanvas';
import { SplitPanes, activeOf, tabStorage } from '../split/panes';
import { SplitView } from '../split/SplitView';
import { ViewScenes } from '../split/scenes';
import { describeDrawing, leadingPanes, viewOf } from '../split/views';
import { definitionsIn, reducedMotionOf } from '@visual-anything/core';
import { useT, type Translator } from '../i18n';
import { LiveContext } from '../live/context';
import { MotionContext, useSystemReducedMotion } from '../scenarios/motion';
import { ScenarioPanel } from '../scenarios/ScenarioPanel';
import { ScenarioSession } from '../scenarios/session';
import { usePreferences, useThemeHold } from '../theme/usePreferences';
import { FindBar } from '../search/FindBar';
import { useFollower, type GoToState, type OpenBeside } from '../destinations/follower';
import { FollowDialog } from '../destinations/FollowDialog';
import { ElementListPanel, ElementListToggle } from '../element-list/ElementListToggle';
import { ElementListStore } from '../element-list/store';
import type { CanvasCamera } from '../view-state/canvas';
import { CopyAddress } from '../view-state/CopyAddress';
import { useViewState } from '../view-state/useViewState';
import { Header, HeaderSeparator } from './Header';
import { Inspector } from './Inspector';
import { ModelPanel } from './ModelPanel';
import { OpenWhenShown } from './panels/OpenWhenShown';
import { PanelAnnouncer, PanelEdge } from './panels/PanelEdge';
import { PanelLayoutStore } from './panels/store';
import { usePanelShortcuts } from './panels/usePanelShortcuts';
import { CodeStore } from '../code/context';
import { CodeHost } from '../code/client';
import { SimulationContext } from '../simulation/context';
import { SimulationAnnouncer } from '../simulation/SimulationAnnouncer';
import { useSimulationMarks } from '../simulation/useSimulationMarks';
import { useSimulationStore } from '../simulation/useSimulationStore';
import { usePackageCode } from '../code/usePackageCode';
import { CodeApproval } from '../code/ApprovalDialog';
import { changeStep } from '../tours/commands';
import { ToursContext } from '../tours/context';
import { TourPlaybackLayer } from '../tours/TourPlaybackLayer';
import { useTourPlayback } from '../tours/useTourPlayback';
import { AttributeLookupContext } from '../live-values/context';
import { useLiveScene, useLookup } from '../live-values/useLiveValues';
import { CommentPins } from '../comments/CommentPins';
import { useCommentsStore } from '../comments/store';
import { ComparisonBar } from '../canvas/comparison/ComparisonBar';
import { ComparisonContext, ComparisonStore } from '../canvas/comparison/mode';
import { drawingName } from '../canvas/comparison/text';
import {
  useComparisonCanvas,
  type ComparisonCanvas,
} from '../canvas/comparison/useComparisonCanvas';
import { countsText } from '../versions/changes/describe';
import { showChange } from '../versions/changes/show';
import { ChangesContext, ChangesStore, type ChangesHost } from '../versions/changes/store';
import { CompareControl } from '../versions/CompareControl';
import { comparisonExports } from '../versions/exports';
import { CompareSession } from '../versions/session';
import { ProposalButton } from '../proposals/ProposalButton';
import { ProposalReviewer } from '../proposals/ProposalReviewer';
import { PackageChangesReviewer } from '../packages/PackageChangesReview';
import { ProposalReview, ProposalReviewContext } from '../proposals/review';
import { ConflictsContext, ConflictsStore } from '../versions/conflicts/store';
import { HoverContext, HoverStore } from '../editor/hover';
import { useSolidClient } from '../canvas/solids/useSolidClient';
import { SpacePanelContext } from '../space/context';
import { chosenSpace } from '../space/root';
import { SpacePanel } from '../space/SpacePanel';
import { SpacePanelStore } from '../space/store';
import { useSpacePanelShortcut } from '../space/useSpacePanelShortcut';

interface ShellProps {
  project: ProjectSnapshot;
  /** A message to show above the panels, such as the live connection having closed. */
  notice?: string;
  /** Sends commands to the local program; absent while the project cannot be changed. */
  onCommand?: SendCommand;
  /** The tab's comparison mode (ADR 0070): the shell's own unless given, as tests give one. */
  comparisons?: ComparisonStore;
}

/**
 * The app shell: the header, the model panel, the canvas area, the physical-space panel while it is
 * open (`space/`, ADR 0076) and the inspector, whose edges resize them and collapse them to strips
 * (`panels/`). The canvas draws the
 * open view: the project's first one until another is opened, and the first again when the open one
 * is deleted.
 */
export function Shell({ project, notice, onCommand, comparisons: given }: ShellProps) {
  const t = useT();
  // The panes of the split view (ADR 0102): the open view is the active pane's. Opening a view opens
  // it there, or makes active the pane that shows it already; a view state, as an address, a tour's
  // step or a jump gives one, shows its view in the active pane.
  // They are each project's: another project brings back its own, and a view gone takes its panes.
  const [panes] = useState(
    () =>
      new SplitPanes(tabStorage(), {
        name: project.project.name,
        views: project.views.map((each) => each.id),
      }),
  );
  const viewIds = useMemo(() => project.views.map((each) => each.id), [project.views]);
  useLayoutEffect(() => {
    panes.setProject({ name: project.project.name, views: viewIds });
  }, [panes, project.project.name, viewIds]);
  const layout = useSyncExternalStore(panes.subscribe, panes.snapshot);
  // The pane that places new shapes of its view and follows its zoom, one for each view shown.
  const leaders = useMemo(() => leadingPanes(project, layout), [project, layout]);
  const activePane = activeOf(layout);
  const setOpenViewId = useCallback((id: Id) => panes.open(id), [panes]);
  const showInActivePane = useCallback((id: Id) => panes.setView(panes.active.id, id), [panes]);
  const view = viewOf(project, activePane.view);
  const shownId = view?.id;
  const openBeside = useCallback((id: Id) => panes.openBeside(id, shownId), [panes, shownId]);
  // Guidance for a view another pane shows applies in this tab, which makes that pane active.
  const latestProject = useRef(project);
  useLayoutEffect(() => {
    latestProject.current = project;
  });
  useLayoutEffect(
    () =>
      showsViews(() =>
        panes.snapshot().panes.map((pane) => viewOf(latestProject.current, pane.view)?.id),
      ),
    [panes],
  );
  // Where each pane's camera was is written before the shell goes.
  useEffect(() => () => panes.flush(), [panes]);
  // What an edit removed, from here or elsewhere, drops out of the selection.
  const [editSelection, setEditSelection] = useSelection(project, view);
  const definitions = useMemo(
    () => definitionsIn(project),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the definitions follow the packages and the project appearances only
    [project.packages, project.project.appearances],
  );
  // The collapsed containers the canvas shows expanded as it zooms into them (ADR 0055).
  const [zoom] = useState(() => new ZoomExpansion());
  const zoomed = useExpandedByZoom(zoom, view?.id);
  // Expanding by zoom opens in place: the scene draws what it moved aside where it moved it, and
  // nothing is stored (ADR 0080, section 4).
  // One scene for each view, which every pane that draws the view shares (ADR 0102).
  const [scenes] = useState(() => new ViewScenes());
  const inPlace = useExpandedInPlace(project, view, zoomed, scenes);
  const expanded = inPlace.expanded;
  const scene = useMemo(
    () => (view ? scenes.scene(inPlace.project, view.id, expanded, t.language) : undefined),
    // The canvas writes built-in names and its own words in the language read in (ADR-0038).
    [scenes, inPlace.project, view, t.language, expanded],
  );
  const [revealed, setRevealed] = useState<{ key: string; request: number }>();
  const reveal = useCallback((key: string) => {
    setRevealed((last) => ({ key, request: (last?.request ?? 0) + 1 }));
  }, []);
  // What filters, focus, playback and guidance emphasize on the canvas, each as its own source.
  const [emphasis] = useState(() => new EmphasisStore());
  // The comparison the canvas shows, if any, and the Changes tab (ADR 0070). While a comparison
  // shows, the canvas draws it read-only, with a selection of its own.
  const [own] = useState(() => new ComparisonStore());
  const comparisons = given ?? own;
  const [changes] = useState(() => new ChangesStore());
  // The review of Claude's proposal, while one waits (ADR 0073).
  const [review] = useState(() => new ProposalReview());
  // The notes of the files whose conflicts were resolved here (ADR 0072).
  const [conflicts] = useState(() => new ConflictsStore());
  const comparing = useComparisonCanvas({
    store: comparisons,
    project,
    view,
    scene,
    expanded,
    emphasis,
  });
  const selection = comparing ? comparing.selection : editSelection;
  const setSelection = comparing ? comparing.select : setEditSelection;
  // Package code (ADR 0054): its store, which the editor carries, filled below, and the host of the
  // code worker, which the tab's simulation runs are worked out in too (ADR 0085).
  const [code] = useState(() => new CodeStore());
  const [codeHost] = useState(makeCodeHost);
  const simulations = useSimulationStore({ host: codeHost, project, definitions, code });
  // Following destinations (ADR 0056): it goes to a view through the view state, set below.
  const followGoTo = useRef<GoToState>(undefined);
  // A view of this project also opens beside, with the elements it names selected (ADR 0102).
  const followBeside = useRef<OpenBeside>(undefined);
  const { follower, asking } = useFollower(project, followGoTo, undefined, followBeside);
  useLayoutEffect(() => {
    followBeside.current = (id, select) => {
      openBeside(id);
      if (select.length > 0) {
        setSelection(selectionOf(select.map((element) => ({ kind: 'element', id: element }))));
      }
    };
  });
  // How attributes read: simulated, live and computed values over stored ones (ADR 0057, 0085).
  const lookup = useLookup(code, simulations);
  // The filters and focus of each view, which every pane shows of its own; they set the open view's
  // emphasis.
  const explored = useState<ReadonlyMap<Id, ViewExplore>>(() => new Map());
  const explore = useExplorer({
    project,
    viewId: view?.id,
    scene,
    selection,
    emphasis,
    lookup,
    kept: explored,
  });
  // The canvas writes live and computed values in the details of shapes.
  const canvasScene = useLiveScene(scene, project, definitions, lookup, emphasis);
  const editor = useMemo<Editor>(
    () => ({
      project,
      definitions,
      viewId: view?.id,
      scene,
      selection,
      select: setSelection,
      send: onCommand,
      reveal,
      openView: setOpenViewId,
      openBeside,
      explore,
      code,
      follow: follower,
    }),
    [
      project,
      definitions,
      view?.id,
      scene,
      selection,
      setSelection,
      onCommand,
      reveal,
      setOpenViewId,
      openBeside,
      explore,
      code,
      follower,
    ],
  );
  // A caption card dragged or resized while a tour plays keeps its place, and its size, in the step
  // (ADR 0095, ADR 0096), as one action.
  const placeCaption = useCallback(
    (tourId: Id, step: number, at: CaptionAt, size?: CaptionSize) => {
      const tour = project.tours.find((each) => each.id === tourId);
      const shown = tour?.steps[step];
      if (!onCommand || !tour || !shown) return;
      void onCommand(
        changeStep(tour, shown.id, (each) => ({
          ...each,
          caption: { ...each.caption, place: at, ...(size === undefined ? {} : { size }) },
        })),
      );
    },
    [project, onCommand],
  );
  const canvasHeading = useId();
  // The scenario open in the scenario panel, with its playback and its recording on the canvas.
  const [scenarios] = useState(() => new ScenarioSession());
  // The canvas draws in the person's theme, and the panels change with it in the frame it shows it.
  const { theme, preferences } = usePreferences();
  // How tours and scenario playback move: the person's Motion and Fades (ADR 0077).
  const systemReduces = useSystemReducedMotion();
  const motionChoice = useMemo(
    () => ({ motion: preferences.motion, fades: preferences.fades }),
    [preferences.motion, preferences.fades],
  );
  const reducedMotion = reducedMotionOf(motionChoice.motion, systemReduces);
  // The stylesheets read the person's choice from the page; as the system says, they read the system.
  useEffect(() => {
    const root = document.documentElement;
    if (motionChoice.motion === 'system') delete root.dataset.motion;
    else root.dataset.motion = motionChoice.motion;
    return () => {
      delete root.dataset.motion;
    };
  }, [motionChoice.motion]);
  const onThemeShown = useThemeHold(view !== undefined);
  // The header's Export, which draws with the renderer the canvas lends it (R27).
  const [images] = useState(() => new ImageSource());
  // The view state: what the tab's address holds and Copy address copies, and where search jumps.
  const live = useContext(LiveContext);
  // Each pane's canvas; the open view's is the active pane's.
  const [canvases, setCanvases] = useState<ReadonlyMap<string, CanvasCamera>>(() => new Map());
  const onPaneCanvas = useCallback((pane: string, next: CanvasCamera | undefined) => {
    setCanvases((last) => {
      if (last.get(pane) === next) return last;
      const changed = new Map(last);
      if (next) changed.set(pane, next);
      else changed.delete(pane);
      return changed;
    });
  }, []);
  const canvas = canvases.get(layout.active);
  // What the open view's canvas turns, for the inspector's Use this view (ADR 0075).
  const [turning, setTurning] = useState<CanvasTurning>();
  useFollowZoom(zoom, project, view, scene, canvas);
  // The physical-space panel (ADR 0076), whose state view addresses, tours and guidance carry.
  const [spacePanel] = useState(() => new SpacePanelStore());
  const viewState = useViewState({
    // While a comparison shows, what search and the Changes tab go to is what the canvas draws.
    project: comparing?.project ?? project,
    viewId: view?.id,
    scene: comparing?.drawn.scene ?? scene,
    selection,
    select: setSelection,
    explore,
    // An address, a tour's step or a jump shows its view in the active pane (ADR 0102).
    openView: showInActivePane,
    reveal,
    scenarios,
    emphasis,
    canvas,
    space: spacePanel,
    simulations,
    notify: live?.notify,
    reducedMotion,
  });
  usePackageCode({
    store: code,
    project,
    viewId: view?.id,
    scene,
    canvas,
    makeHost: () => codeHost,
  });
  // A tick's marks on the canvas and in the physical-space panel (ADR 0085), over the view's scene,
  // whose keys stay as the values in its shapes change.
  const marksContext = useMemo(
    () => (view && scene ? { project, view, scene, reduced: reducedMotion } : undefined),
    [project, view, scene, reducedMotion],
  );
  useSimulationMarks(simulations, emphasis, marksContext);
  // Tours (ADR 0058): the one the tab plays full screen, which hides the panels while it plays.
  const tours = useTourPlayback({
    project,
    scene,
    viewState,
    scenarios,
    emphasis,
    canvas,
    reducedMotion,
    fades: motionChoice.fades,
  });
  // Compare with… (ADR 0070): what it asks the program for, and the version each comparison came from.
  const [versions] = useState(() => new CompareSession());
  // While a comparison shows, Export also writes its drawings and its summary.
  const shownComparison = comparing?.shown;
  const comparedView = comparing?.view.id;
  const comparisonFiles = useMemo(
    () =>
      shownComparison && comparedView !== undefined
        ? {
            title: shownComparison.title,
            files: comparisonExports(shownComparison, comparedView, () =>
              versions.versionsOf(shownComparison, t),
            ),
          }
        : undefined,
    [shownComparison, comparedView, versions, t],
  );
  // Export also writes the read-only page, which opens at the view state shown now (M6b).
  const exportTool = (
    <ExportControl
      {...(comparisonFiles ? { comparison: comparisonFiles } : {})}
      source={images}
      projectName={project.project.name}
      viewName={view?.name}
      bounds={scene?.bounds}
      project={project}
      page={{ start: () => fragmentOf(viewState.address()?.address) }}
      drawn={view && scene ? { view, scene, theme } : undefined}
    />
  );
  useLayoutEffect(() => {
    followGoTo.current = viewState.goTo;
  });
  // The element list, below the canvas, and its toggle in the header (R42).
  const [elementList] = useState(() => new ElementListStore());
  // Threads of comments (ADR 0059): what the tab does with them, lent the view state's goTo.
  const comments = useCommentsStore(viewState.goTo);
  // Choosing a change in the Changes tab shows it as search shows what it found (ADR 0070).
  // The side panels' widths and strips, the person's preference (ADR 0032's clarification of
  // 2026-10-30); resizing one draws only its edge and the canvas, which keeps its middle in place.
  const [panels] = useState(() => new PanelLayoutStore());
  const modelCollapsed = useSyncExternalStore(
    panels.subscribe,
    () => panels.snapshot().layout.model.collapsed,
  );
  const inspectorCollapsed = useSyncExternalStore(
    panels.subscribe,
    () => panels.snapshot().layout.inspector.collapsed,
  );
  const shellElement = useRef<HTMLDivElement>(null);
  // Before the first paint, so that the panels show at their widths from the first frame.
  useLayoutEffect(() => {
    panels.attach(shellElement.current);
    return () => panels.attach(null);
  }, [panels]);
  useEffect(() => panels.watch(window), [panels]);
  useEffect(() => panels.setCanvas(canvas), [panels, canvas]);
  usePanelShortcuts(panels, tours.playback.tour !== undefined);
  // The physical-space panel (ADR 0076): kept by the tab for each view, opened from the toolbar's
  // Physical space and Alt+Shift+P; what it shows when nothing is chosen follows the selection.
  const [hovers] = useState(() => new HoverStore());
  const spaceClient = useSolidClient();
  const spacePanelId = useId();
  useLayoutEffect(() => {
    spacePanel.attach(shellElement.current);
    return () => spacePanel.attach(null);
  }, [spacePanel]);
  useLayoutEffect(() => {
    spacePanel.setOpenView(view?.id);
    spacePanel.setChooser((viewId) =>
      chosenSpace(
        project,
        project.views.find((each) => each.id === viewId),
        selection.elements,
      ),
    );
  });
  useEffect(() => spacePanel.watch(window), [spacePanel]);
  useEffect(() => spacePanel.setCanvas(canvas), [spacePanel, canvas]);
  useSpacePanelShortcut(spacePanel, view?.id, tours.playback.tour !== undefined);
  const modelPanelId = useId();
  const inspectorId = useId();
  const changesHost = useMemo<ChangesHost>(
    () => ({
      store: changes,
      show: (change, listed) => {
        const shown = comparisons.get();
        const sameComparison =
          shown !== undefined && shown.older === listed.older && shown.newer === listed.newer;
        showChange(change, listed, {
          t,
          project,
          openViewId: view?.id,
          ...(sameComparison
            ? {
                mode: {
                  drawing: shown.drawing,
                  setDrawing: (drawing) => comparisons.setDrawing(drawing),
                },
              }
            : {}),
          goTo: viewState.goTo,
          openView: setOpenViewId,
          say: (text) => changes.say(text),
        });
      },
    }),
    [changes, comparisons, t, project, view?.id, viewState.goTo, setOpenViewId],
  );
  // What the active pane draws: the open view, or the comparison while one shows, with its bar.
  const shownCanvas: ShownCanvas | undefined =
    view && scene && comparing
      ? {
          key: 'comparison',
          canvas: {
            project: comparing.project,
            view: comparing.view,
            scene: comparing.drawn.scene,
            label: describeComparison(t, comparing),
            selection,
            onSelect: setSelection,
            ...(revealed ? { revealed } : {}),
            theme,
            onThemeShown,
            comparison: comparing.drawn,
          },
          after: (
            <ComparisonBar
              store={comparisons}
              shown={comparing.shown}
              drawn={comparing.drawn}
              viewChanges={comparing.viewComparison.changes}
              canvas={canvas}
              selection={selection}
              select={setSelection}
              reducedMotion={reducedMotion}
            />
          ),
        }
      : view && scene
        ? {
            key: 'view',
            canvas: {
              project,
              view,
              scene: canvasScene ?? scene,
              label: describeDrawing(t, view, scene),
              selection,
              onSelect: setSelection,
              ...(onCommand ? { onCommand } : {}),
              ...(revealed ? { revealed } : {}),
              scenarios,
              theme,
              onThemeShown,
              onTurning: setTurning,
            },
          }
        : undefined;

  return (
    <ComparisonContext value={comparisons}>
      <ChangesContext value={changesHost}>
        <ProposalReviewContext value={review}>
          <ConflictsContext value={conflicts}>
            <EditorContext.Provider value={editor}>
              <AttributeLookupContext value={lookup}>
                <SimulationContext value={simulations}>
                  <DefinitionProvider>
                    <EmphasisContext.Provider value={emphasis}>
                      <SpacePanelContext value={spacePanel}>
                        <HoverContext value={hovers}>
                          <MotionContext value={motionChoice}>
                            <ToursContext.Provider value={tours.host}>
                              <ZoomExpansionContext value={zoom}>
                                <div
                                  ref={shellElement}
                                  className={
                                    tours.playback.tour === undefined
                                      ? 'shell'
                                      : 'shell tour-playing'
                                  }
                                >
                                  <Header
                                    projectName={project.project.name}
                                    viewName={view?.name}
                                    actions={
                                      // In groups (A5): what the window shows, versions, then what
                                      // comes in and goes out.
                                      <>
                                        <ProposalButton />
                                        <ElementListToggle store={elementList} />
                                        <HeaderSeparator />
                                        <CompareControl session={versions} />
                                        <HeaderSeparator />
                                        <ImportControl
                                          project={project}
                                          viewId={view?.id}
                                          send={live?.status === 'open' ? live.send : undefined}
                                          openView={setOpenViewId}
                                          {...(live?.status === 'open' &&
                                          live.makeDrawing !== undefined
                                            ? { makeDrawing: live.makeDrawing }
                                            : {})}
                                          {...(live?.status === 'open' &&
                                          live.prepareSolid !== undefined
                                            ? { prepareSolid: live.prepareSolid }
                                            : {})}
                                          {...(selection.elements.size === 1
                                            ? { selectedElement: [...selection.elements][0] }
                                            : {})}
                                        />
                                        {exportTool}
                                        {view && <CopyAddress link={viewState} />}
                                        <HeaderSeparator />
                                        <PackagesControl />
                                      </>
                                    }
                                  />
                                  {notice !== undefined && (
                                    <p className="shell-notice" role="alert">
                                      {notice}
                                    </p>
                                  )}
                                  <ModelPanel
                                    id={modelPanelId}
                                    hidden={modelCollapsed}
                                    project={project}
                                    definitions={definitions}
                                    openViewId={view?.id}
                                    comments={comments}
                                  />
                                  <PanelEdge store={panels} side="model" controls={modelPanelId} />
                                  <main className="canvas-area" aria-labelledby={canvasHeading}>
                                    <h2 id={canvasHeading} className="visually-hidden">
                                      {view ? view.name : t('Canvas')}
                                    </h2>
                                    <ImageSourceContext value={images}>
                                      <SplitView
                                        store={panes}
                                        layout={layout}
                                        project={project}
                                        onOpenBeside={openBeside}
                                        held={tours.playback.tour !== undefined}
                                        overlay={
                                          <>
                                            <CommentPins store={comments} canvas={canvas} />
                                            <GuidanceLayer scenarios={scenarios} />
                                            <FindBar
                                              project={project}
                                              definitions={definitions}
                                              viewId={view?.id}
                                              goTo={viewState.goTo}
                                            />
                                            <TourPlaybackLayer
                                              project={project}
                                              tours={tours}
                                              {...(onCommand ? { onPlace: placeCaption } : {})}
                                            />
                                          </>
                                        }
                                      >
                                        {(pane, active) =>
                                          view && scene ? (
                                            <PaneCanvas
                                              pane={pane}
                                              active={active}
                                              store={panes}
                                              project={project}
                                              definitions={definitions}
                                              editor={editor}
                                              emphasis={emphasis}
                                              explored={explored}
                                              lookup={lookup}
                                              zoom={zoom}
                                              selection={selection}
                                              onSelect={setSelection}
                                              onCommand={onCommand}
                                              theme={theme}
                                              scenes={scenes}
                                              leads={leaders.has(pane.id)}
                                              onCanvas={onPaneCanvas}
                                              shown={active ? shownCanvas : undefined}
                                            />
                                          ) : (
                                            <p className="canvas-message">
                                              {t(
                                                'There is no view to draw. Make one with New view…, under Views in the Model tab.',
                                              )}
                                            </p>
                                          )
                                        }
                                      </SplitView>
                                    </ImageSourceContext>
                                  </main>
                                  {view && scene && (
                                    <SpacePanel
                                      id={spacePanelId}
                                      store={spacePanel}
                                      project={project}
                                      view={view}
                                      scene={canvasScene ?? scene}
                                      selection={selection}
                                      client={spaceClient}
                                      theme={theme}
                                    />
                                  )}
                                  <PanelEdge
                                    store={panels}
                                    side="inspector"
                                    controls={inspectorId}
                                  />
                                  <TurningContext value={turning}>
                                    <Inspector
                                      id={inspectorId}
                                      hidden={inspectorCollapsed}
                                      view={view}
                                      scene={scene}
                                      definitions={definitions}
                                    />
                                  </TurningContext>
                                  <PanelAnnouncer store={panels} />
                                  <SimulationAnnouncer store={simulations} project={project} />
                                  <OpenWhenShown
                                    panels={panels}
                                    changes={changes}
                                    comparisons={comparisons}
                                    comments={comments}
                                  />
                                  <ScenarioPanel
                                    session={scenarios}
                                    canvas={canvas}
                                    held={tours.playback.tour !== undefined}
                                  />
                                  <ProposalReviewer review={review} />
                                  <PackageChangesReviewer />
                                  <CodeApproval />
                                  <ElementListPanel store={elementList} />
                                  {asking && (
                                    <FollowDialog
                                      plan={asking.plan}
                                      onConfirm={asking.confirm}
                                      onCancel={asking.cancel}
                                    />
                                  )}
                                </div>
                              </ZoomExpansionContext>
                            </ToursContext.Provider>
                          </MotionContext>
                        </HoverContext>
                      </SpacePanelContext>
                    </EmphasisContext.Provider>
                  </DefinitionProvider>
                </SimulationContext>
              </AttributeLookupContext>
            </EditorContext.Provider>
          </ConflictsContext>
        </ProposalReviewContext>
      </ChangesContext>
    </ComparisonContext>
  );
}

/** The host of the code worker; none where the browser has no workers, as in tests. */
function makeCodeHost(): CodeHost | undefined {
  return typeof Worker === 'undefined' ? undefined : new CodeHost();
}

/** The canvas's text alternative while a comparison shows: which, which drawing, and its counts. */
function describeComparison(t: Translator, comparing: ComparisonCanvas): string {
  return t('{title}: “{view}”, {drawing}. {counts}.', {
    title: comparing.shown.title,
    view: comparing.view.name,
    drawing: drawingName(t, comparing.shown.drawing),
    counts: countsText(t, comparing.drawn.counts),
  });
}
