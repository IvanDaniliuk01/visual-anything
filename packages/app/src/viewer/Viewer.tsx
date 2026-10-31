/**
 * The read-only page's viewer (ADR 0041): every view of the project the page holds, drawn by the app's
 * renderer, to pan, zoom and select by mouse, touch or keyboard; filters, focus, collapse and search,
 * as the app explores a view; scenario playback; the outline; the details of what is selected; and an
 * About panel with the packages' attribution. The page's address follows the view state, as the app's
 * does, so that a link to `page.html#view=…&select=…` opens there. Nothing here changes the project,
 * and nothing is kept but the reader's theme and language.
 *
 * A page that holds the solid worker, for solids' files or poses, also has the physical-space panel
 * (ADR 0076): opened and closed from Physical space among the reading tools and by Alt+Shift+P, beside
 * the canvas, linked to its selection and hover, carried by the page's address and tours' steps, and
 * following scenario playback, as in the app; it offers only what reads, since nothing here is posed.
 */
import { definitionsIn, scenarioTimeline, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { collapseDone, type CollapseAction } from '../canvas/collapse';
import { pageScene } from '../canvas/routing/avoided';
import { buildScene, type Scene } from '../canvas/scene';
import { useExplorer } from '../canvas/useExplorer';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import { HoverContext, HoverStore } from '../editor/hover';
import { EMPTY_SELECTION } from '../editor/selection';
import { useSelection } from '../editor/useSelection';
import { setCurrentLanguage, adoptLanguage } from '../i18n/language';
import { useT, LanguageContext, type Translator } from '../i18n';
import type { Language } from '../i18n/translate';
import { DecisionEmphasis } from '../scenarios/DecisionEmphasis';
import { PlaybackEmphasis } from '../scenarios/PlaybackEmphasis';
import { FindBar } from '../search/FindBar';
import { OutlineTree } from '../shell/OutlineTree';
import {
  DismissIcon,
  FilterIcon,
  InfoIcon,
  ListIcon,
  PlayIcon,
  ProductMark,
  SearchIcon,
  SpaceIcon,
  TourIcon,
} from '../shell/icons';
import { SpacePanelContext, useSpacePanelState } from '../space/context';
import { SPACE_PANEL_SHORTCUT_SHOWN } from '../space/keys';
import { chosenSpace } from '../space/root';
import { SpacePanel } from '../space/SpacePanel';
import { SpacePlaybackFollow } from '../space/SpacePlaybackFollow';
import { SpacePanelStore } from '../space/store';
import { useSpacePanelShortcut } from '../space/useSpacePanelShortcut';
import { TourPlaybackLayer } from '../tours/TourPlaybackLayer';
import { useTourPlayback } from '../tours/useTourPlayback';
import type { CanvasCamera } from '../view-state/canvas';
import { useViewState } from '../view-state/useViewState';
import { TourChooser } from './TourChooser';
import { About } from './About';
import { LanguageChoiceControl, ThemeChoiceControl } from './Choices';
import type { PageRead } from './data';
import { Details } from './Details';
import { ExplorePanel } from './ExplorePanel';
import { PlaybackBar, ScenarioChooser } from './PlaybackBar';
import { PlaybackSession } from './playback';
import { usePagePreferences, type PagePreferences } from './preferences';
import { ViewerCanvas } from './ViewerCanvas';
import type { SolidClient } from '../solids/solid-client';
import { withCollapsed } from './collapse';
import '../styles.css';
import './viewer.css';

interface ViewerAppProps {
  read: PageRead;
  preferences: PagePreferences;
  /** What draws the page's solids (ADR 0075); none in a page without solids. */
  solids?: SolidClient | undefined;
  /**
   * Whether the page has the physical-space panel (ADR 0076), drawn by `solids`: when it holds the
   * solid worker for solids' files or poses (`pageHasSpace`).
   */
  space?: boolean | undefined;
}

/** The page: the viewer once its data was read, or what keeps it from opening. */
export function ViewerApp({ read, preferences, solids, space }: ViewerAppProps) {
  const shown = usePagePreferences(preferences);
  return (
    <PageLanguage language={shown.shownLanguage}>
      {read.ok ? (
        <Viewer
          project={read.project}
          {...(read.made === undefined ? {} : { made: read.made })}
          preferences={preferences}
          solids={solids}
          space={space === true && solids !== undefined}
        />
      ) : (
        <Unreadable problems={read.problems} preferences={preferences} />
      )}
    </PageLanguage>
  );
}

/** The language the page reads in, for the components inside, with `<html lang>` following it. */
function PageLanguage({ language, children }: { language: Language; children: ReactNode }) {
  adoptLanguage(language);
  useLayoutEffect(() => {
    setCurrentLanguage(language);
  }, [language]);
  return <LanguageContext value={language}>{children}</LanguageContext>;
}

/** A page whose data is no project it can open: what is wrong with it. */
function Unreadable({
  problems,
  preferences,
}: {
  problems: readonly string[];
  preferences: PagePreferences;
}) {
  const t = useT();
  return (
    <div className="viewer viewer-unreadable">
      <header className="viewer-header">
        <ProductName />
        <div className="viewer-header-end">
          <LanguageChoiceControl preferences={preferences} />
          <ThemeChoiceControl preferences={preferences} />
        </div>
      </header>
      <main className="status-main">
        <div className="status-card status-problem" role="alert">
          <h2>{t('This page cannot show its project')}</h2>
          <ul className="viewer-problems">
            {problems.slice(0, 20).map((problem, at) => (
              <li key={at}>{t.message(problem)}</li>
            ))}
          </ul>
          {problems.length > 20 && (
            <p>
              {t(
                { one: 'And {count} more problem.', other: 'And {count} more problems.' },
                { count: problems.length - 20 },
              )}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

/** What can be open beside the canvas. */
type Panel = 'explore' | 'outline' | 'scenarios' | 'tours' | 'about';

interface ViewerProps {
  project: ProjectSnapshot;
  /** When the page was made. */
  made?: string;
  preferences: PagePreferences;
  /** What draws the page's solids (ADR 0075); none in a page without solids. */
  solids?: SolidClient | undefined;
  /** Whether the page has the physical-space panel, drawn by `solids` (ADR 0076). */
  space?: boolean | undefined;
}

export function Viewer({ project: opened, made, preferences, solids, space }: ViewerProps) {
  const t = useT();
  const shown = usePagePreferences(preferences);
  // The page's own copy of the project, whose views change only as collapsing changes them here.
  const [project, setProject] = useState(opened);
  const [openViewId, setOpenViewId] = useState<Id>();
  const view = project.views.find((each) => each.id === openViewId) ?? project.views[0];
  const [selection, setSelection] = useSelection(project, view);
  const definitions = useMemo(
    () => definitionsIn(project),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the definitions follow the packages and the project appearances only
    [project.packages, project.project.appearances],
  );
  // Lines go around the shapes in their way, as on the canvas, in a view with few enough (ADR 0039).
  const scene = useMemo(
    () => (view ? pageScene(buildScene(project, view.id)) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the language is read by buildScene
    [project, view, t.language],
  );
  const [revealed, setRevealed] = useState<{ key: string; request: number }>();
  const reveal = useCallback((key: string) => {
    setRevealed((last) => ({ key, request: (last?.request ?? 0) + 1 }));
  }, []);
  const [emphasis] = useState(() => new EmphasisStore());
  const explore = useExplorer({ project, viewId: view?.id, scene, selection, emphasis });
  const [playback] = useState(() => new PlaybackSession());
  const [canvas, setCanvas] = useState<CanvasCamera>();
  // The physical-space panel (ADR 0076), kept for each view as the app's tab keeps it, and the hover
  // the canvas, the panel and the outline share by element id.
  const [spaceStore] = useState(() => new SpacePanelStore());
  const spacePanel = space === true && solids !== undefined ? spaceStore : undefined;
  const [hovers] = useState(() => new HoverStore());
  const [notice, setNotice] = useState<string>();
  const [said, setSaid] = useState({ text: '', count: 0 });
  const say = useCallback((text: string) => {
    setSaid((last) => ({ text, count: last.count + 1 }));
  }, []);
  const viewState = useViewState({
    project,
    viewId: view?.id,
    scene,
    selection,
    select: setSelection,
    explore,
    openView: setOpenViewId,
    reveal,
    scenarios: playback,
    emphasis,
    canvas,
    space: spacePanel,
    notify: (_level, message) => setNotice(message),
  });
  // Tours, played full screen as in the app (ADR 0058): the page's header and panels hide meanwhile.
  const tours = useTourPlayback({
    project,
    scene,
    viewState,
    scenarios: playback,
    emphasis,
    canvas,
  });
  const touring = tours.playback.tour !== undefined;
  const editor = useMemo<Editor>(
    () => ({
      project,
      definitions,
      viewId: view?.id,
      scene,
      selection,
      select: setSelection,
      send: undefined,
      reveal,
      openView: setOpenViewId,
      explore,
    }),
    [project, definitions, view?.id, scene, selection, setSelection, reveal, explore],
  );
  const viewId = view?.id;
  const collapse = useCallback(
    (action: CollapseAction, collapsed: boolean) => {
      if (viewId === undefined) return;
      setProject((now) => withCollapsed(now, viewId, action.elements, collapsed));
      say(collapseDone(action, collapsed));
    },
    [viewId, say],
  );
  const [panel, setPanel] = useState<Panel>();
  const togglePanel = (next: Panel) => setPanel((now) => (now === next ? undefined : next));
  const canvasRef = useRef<HTMLDivElement>(null);
  const heading = useId();

  // The panel's column takes its width from the page's element, as the app's shell's does.
  const viewerRef = useRef<HTMLDivElement>(null);
  const spacePanelId = useId();
  useLayoutEffect(() => {
    if (!spacePanel) return;
    spacePanel.attach(viewerRef.current);
    return () => spacePanel.attach(null);
  }, [spacePanel]);
  useLayoutEffect(() => {
    spacePanel?.setOpenView(viewId);
    spacePanel?.setChooser((id) =>
      chosenSpace(
        project,
        project.views.find((each) => each.id === id),
        selection.elements,
      ),
    );
  });
  useEffect(() => spacePanel?.watch(window), [spacePanel]);
  useEffect(() => spacePanel?.setCanvas(canvas), [spacePanel, canvas]);
  useSpacePanelShortcut(spaceStore, viewId, touring || !spacePanel);
  const spaceOpen = useSpacePanelState(spacePanel ?? null, viewId) !== undefined;

  // Scenario playback over the open view, as the app's scenario panel keeps it.
  const playing = useSyncExternalStore(playback.subscribe, playback.getState);
  const scenario = project.scenarios.find((each) => each.id === playing.scenario);
  const active = scenario !== undefined && scenario.view === view?.id;
  // The alternatives chosen at the scenario's decisions play, as in the app (ADR 0078).
  const { choices } = playing;
  const timeline = useMemo(
    () => (scenario ? scenarioTimeline(project, scenario, undefined, choices) : undefined),
    [project, scenario, choices],
  );
  useLayoutEffect(() => {
    playback.sync({
      project,
      viewId: view?.id,
      timeline: active ? timeline : undefined,
      choices,
      touring,
      announce: say,
    });
  }, [playback, project, view?.id, active, timeline, choices, touring, say]);
  const openScenario = (id: Id) => {
    const chosen = project.scenarios.find((each) => each.id === id);
    if (!chosen) return;
    playback.open(id);
    if (chosen.view !== view?.id) setOpenViewId(chosen.view);
    setPanel(undefined);
  };

  /** Opens the find field, as Ctrl+F does on the canvas. */
  const find = () => {
    const host = canvasRef.current?.querySelector<HTMLElement>('[role="application"]');
    (host ?? canvasRef.current)?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }),
    );
  };

  return (
    <EditorContext.Provider value={editor}>
      <EmphasisContext.Provider value={emphasis}>
        <HoverContext value={hovers}>
          <SpacePanelContext value={spacePanel ?? null}>
            <div ref={viewerRef} className={touring ? 'viewer tour-playing' : 'viewer'}>
              <header className="viewer-header">
                <ProductName />
                <h1 className="viewer-project">{project.project.name}</h1>
                <ViewPicker
                  views={project.views}
                  open={view}
                  onOpen={(id) => {
                    setOpenViewId(id);
                    setSelection(EMPTY_SELECTION);
                  }}
                />
                <div className="viewer-header-end">
                  <div className="viewer-tools" role="toolbar" aria-label={t('Reading tools')}>
                    <ToolButton label={t('Find')} title={t('Find (Ctrl+F)')} onPress={find}>
                      <SearchIcon />
                    </ToolButton>
                    <ToolButton
                      label={t('Explore')}
                      pressed={panel === 'explore'}
                      onPress={() => togglePanel('explore')}
                    >
                      <FilterIcon />
                    </ToolButton>
                    <ToolButton
                      label={t('Outline')}
                      pressed={panel === 'outline'}
                      onPress={() => togglePanel('outline')}
                    >
                      <ListIcon />
                    </ToolButton>
                    {project.scenarios.length > 0 && (
                      <ToolButton
                        label={t('Scenarios')}
                        pressed={panel === 'scenarios'}
                        onPress={() => togglePanel('scenarios')}
                      >
                        <PlayIcon />
                      </ToolButton>
                    )}
                    {project.tours.length > 0 && (
                      <ToolButton
                        label={t('Tours')}
                        pressed={panel === 'tours'}
                        onPress={() => togglePanel('tours')}
                      >
                        <TourIcon />
                      </ToolButton>
                    )}
                    {spacePanel && viewId !== undefined && (
                      <ToolButton
                        label={t('Physical space')}
                        title={t('{name} ({shortcut})', {
                          name: t(
                            spaceOpen
                              ? 'Close the physical-space panel'
                              : 'Open the physical-space panel',
                          ),
                          shortcut: SPACE_PANEL_SHORTCUT_SHOWN,
                        })}
                        pressed={spaceOpen}
                        onPress={() => spacePanel.toggle(viewId)}
                      >
                        <SpaceIcon />
                      </ToolButton>
                    )}
                    <ToolButton
                      label={t('About')}
                      pressed={panel === 'about'}
                      onPress={() => togglePanel('about')}
                    >
                      <InfoIcon />
                    </ToolButton>
                  </div>
                  <LanguageChoiceControl preferences={preferences} />
                  <ThemeChoiceControl preferences={preferences} />
                </div>
              </header>
              {notice !== undefined && (
                <p className="shell-notice viewer-notice" role="alert">
                  <span>{t.message(notice)}</span>
                  <button
                    type="button"
                    className="viewer-dismiss"
                    aria-label={t('Dismiss')}
                    onClick={() => setNotice(undefined)}
                  >
                    <DismissIcon />
                  </button>
                </p>
              )}
              <div className="viewer-body">
                {panel === 'outline' && (
                  <aside className="panel viewer-side" aria-label={t('Outline')}>
                    <OutlineTree active />
                  </aside>
                )}
                <main ref={canvasRef} className="canvas-area viewer-main" aria-labelledby={heading}>
                  <h2 id={heading} className="visually-hidden">
                    {view ? view.name : t('Canvas')}
                  </h2>
                  {view && scene ? (
                    <ViewerCanvas
                      project={project}
                      scene={scene}
                      label={describeDrawing(t, view, scene)}
                      selection={selection}
                      onSelect={setSelection}
                      onCollapse={collapse}
                      revealed={revealed}
                      theme={shown.shownTheme}
                      onCanvas={setCanvas}
                      solids={solids}
                    />
                  ) : (
                    <p className="canvas-message">
                      {t(
                        'This project has no view to show. Whoever shared it can add one in Visual Anything and export the page again.',
                      )}
                    </p>
                  )}
                  <FindBar
                    project={project}
                    definitions={definitions}
                    viewId={view?.id}
                    goTo={viewState.goTo}
                  />
                  {panel === 'explore' && <ExplorePanel onClose={() => setPanel(undefined)} />}
                  {panel === 'scenarios' && (
                    <ScenarioChooser
                      project={project}
                      open={playing.scenario}
                      onOpen={openScenario}
                      onClose={() => setPanel(undefined)}
                    />
                  )}
                  {panel === 'tours' && (
                    <TourChooser
                      project={project}
                      onPlay={(tour) => {
                        setPanel(undefined);
                        tours.host.play(tour);
                      }}
                      onClose={() => setPanel(undefined)}
                    />
                  )}
                  {/* The page holds no speaker notes (ADR 0058), so it offers no window for them. */}
                  <TourPlaybackLayer project={project} tours={tours} notes={false} />
                  <div className="viewer-bottom">
                    <Details />
                    {scenario && timeline && (
                      <PlaybackBar
                        session={playback}
                        scenario={scenario}
                        timeline={timeline}
                        active={active}
                        viewName={
                          project.views.find((each) => each.id === scenario.view)?.name ??
                          scenario.view
                        }
                        onOpenView={() => setOpenViewId(scenario.view)}
                      />
                    )}
                  </div>
                </main>
                {spacePanel && view && scene && (
                  <div className="viewer-space">
                    <SpacePanel
                      id={spacePanelId}
                      store={spacePanel}
                      project={project}
                      view={view}
                      scene={scene}
                      selection={selection}
                      client={solids}
                      theme={shown.shownTheme}
                      readOnly
                    />
                  </div>
                )}
              </div>
              {panel === 'about' && (
                <About
                  project={project}
                  {...(made === undefined ? {} : { made })}
                  onClose={() => setPanel(undefined)}
                />
              )}
              <PlaybackEmphasis
                session={playback}
                project={project}
                view={active ? view : undefined}
                scene={active ? scene : undefined}
                timeline={active ? timeline : undefined}
              />
              <DecisionEmphasis
                session={playback}
                project={project}
                scenario={active ? scenario : undefined}
                timeline={active ? timeline : undefined}
              />
              {spacePanel && (
                <SpacePlaybackFollow
                  session={playback}
                  project={project}
                  view={active ? view : undefined}
                  timeline={active ? timeline : undefined}
                />
              )}
              <div aria-live="polite" className="visually-hidden">
                {said.text}
                {said.count % 2 === 1 ? ' ' : ''}
              </div>
            </div>
          </SpacePanelContext>
        </HoverContext>
      </EmphasisContext.Provider>
    </EditorContext.Provider>
  );
}

/** The product's mark and name, small, before the project's. */
function ProductName() {
  return (
    <span className="viewer-product">
      <ProductMark />
      <span className="viewer-product-name">Visual Anything</span>
    </span>
  );
}

/** The views of the project, each by its name and perspective; choosing one opens it. */
function ViewPicker({
  views,
  open,
  onOpen,
}: {
  views: readonly ViewFile[];
  open: ViewFile | undefined;
  onOpen: (id: Id) => void;
}) {
  const t = useT();
  const id = useId();
  if (views.length === 0) return null;
  return (
    <div className="viewer-views">
      <label htmlFor={id}>{t('View')}</label>
      <select id={id} value={open?.id} onChange={(event) => onOpen(event.target.value)}>
        {views.map((each) => (
          <option key={each.id} value={each.id}>
            {t('{view} ({perspective})', { view: each.name, perspective: each.perspective.name })}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A tool of the header: an icon with its name, which shows beside it where there is room. */
function ToolButton({
  label,
  title,
  pressed,
  onPress,
  children,
}: {
  label: string;
  title?: string;
  pressed?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="viewer-tool"
      title={title ?? label}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      onClick={onPress}
    >
      {children}
      <span className="viewer-tool-label">{label}</span>
    </button>
  );
}

/** The canvas's text alternative: the view, its perspective and how much it draws. */
function describeDrawing(t: Translator, view: ViewFile, scene: Scene): string {
  const shapes = t(
    { one: '{count} element shape', other: '{count} element shapes' },
    { count: scene.shapes.length },
  );
  const relations = t(
    { one: '{count} relation', other: '{count} relations' },
    { count: scene.relations.length },
  );
  const free = t(
    { one: '{count} free shape', other: '{count} free shapes' },
    { count: scene.notes.length + scene.arrows.length },
  );
  return t('{view}, from the {perspective} perspective: {shapes}, {relations} and {free}.', {
    view: view.name,
    perspective: view.perspective.name,
    shapes,
    relations,
    free,
  });
}
