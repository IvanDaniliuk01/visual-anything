import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { useCallback, useContext, useId, useMemo, useState } from 'react';
import { CanvasArea, type SendCommand } from '../canvas/CanvasArea';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { ExportControl } from '../export/ExportControl';
import { ImageSource, ImageSourceContext } from '../export/source';
import { DefinitionProvider } from './definitions/DefinitionProvider';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import { GuidanceLayer } from '../guidance/GuidanceLayer';
import { useSelection } from '../editor/useSelection';
import { buildScene, type Scene } from '../canvas/scene';
import { useExplorer } from '../canvas/useExplorer';
import { definitionsIn } from '@visual-anything/core';
import { useT, type Translator } from '../i18n';
import { LiveContext } from '../live/context';
import { ScenarioPanel } from '../scenarios/ScenarioPanel';
import { ScenarioSession } from '../scenarios/session';
import { usePreferences, useThemeHold } from '../theme/usePreferences';
import { FindBar } from '../search/FindBar';
import type { CanvasCamera } from '../view-state/canvas';
import { CopyAddress } from '../view-state/CopyAddress';
import { useViewState } from '../view-state/useViewState';
import { Header } from './Header';
import { Inspector } from './Inspector';
import { ModelPanel } from './ModelPanel';

interface ShellProps {
  project: ProjectSnapshot;
  /** A message to show above the panels, such as the live connection having closed. */
  notice?: string;
  /** Sends commands to the local program; absent while the project cannot be changed. */
  onCommand?: SendCommand;
}

/**
 * The app shell: the header, the model panel, the canvas area and the inspector. The canvas draws the
 * open view: the project's first one until another is opened, and the first again when the open one
 * is deleted.
 */
export function Shell({ project, notice, onCommand }: ShellProps) {
  const t = useT();
  const [openViewId, setOpenViewId] = useState<Id>();
  const view = project.views.find((each) => each.id === openViewId) ?? project.views[0];
  // What an edit removed, from here or elsewhere, drops out of the selection.
  const [selection, setSelection] = useSelection(project, view);
  const definitions = useMemo(
    () => definitionsIn(project),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the definitions follow the packages and the project appearances only
    [project.packages, project.project.appearances],
  );
  const scene = useMemo(
    () => (view ? buildScene(project, view.id) : undefined),
    // The canvas writes built-in names and its own words in the language read in (ADR-0038).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the language is read by buildScene
    [project, view, t.language],
  );
  const [revealed, setRevealed] = useState<{ key: string; request: number }>();
  const reveal = useCallback((key: string) => {
    setRevealed((last) => ({ key, request: (last?.request ?? 0) + 1 }));
  }, []);
  // What filters, focus, playback and guidance emphasize on the canvas, each as its own source.
  const [emphasis] = useState(() => new EmphasisStore());
  // The filters and focus of each view; they set the open view's emphasis.
  const explore = useExplorer({ project, viewId: view?.id, scene, selection, emphasis });
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
      explore,
    }),
    [project, definitions, view?.id, scene, selection, setSelection, onCommand, reveal, explore],
  );
  const canvasHeading = useId();
  // The scenario open in the scenario panel, with its playback and its recording on the canvas.
  const [scenarios] = useState(() => new ScenarioSession());
  // The canvas draws in the person's theme, and the panels change with it in the frame it shows it.
  const { theme } = usePreferences();
  const onThemeShown = useThemeHold(view !== undefined);
  // The header's Export, which draws with the renderer the canvas lends it (R27).
  const [images] = useState(() => new ImageSource());
  const exportTool = (
    <ExportControl
      source={images}
      projectName={project.project.name}
      viewName={view?.name}
      bounds={scene?.bounds}
    />
  );
  // The view state: what the tab's address holds and Copy address copies, and where search jumps.
  const live = useContext(LiveContext);
  const [canvas, setCanvas] = useState<CanvasCamera>();
  const viewState = useViewState({
    project,
    viewId: view?.id,
    scene,
    selection,
    select: setSelection,
    explore,
    openView: setOpenViewId,
    reveal,
    scenarios,
    emphasis,
    canvas,
    notify: live?.notify,
  });

  return (
    <EditorContext.Provider value={editor}>
      <DefinitionProvider>
        <EmphasisContext.Provider value={emphasis}>
          <div className="shell">
            <Header
              projectName={project.project.name}
              viewName={view?.name}
              actions={
                <>
                  {view && <CopyAddress link={viewState} />}
                  {exportTool}
                </>
              }
            />
            {notice !== undefined && (
              <p className="shell-notice" role="alert">
                {notice}
              </p>
            )}
            <ModelPanel project={project} definitions={definitions} openViewId={view?.id} />
            <main className="canvas-area" aria-labelledby={canvasHeading}>
              <h2 id={canvasHeading} className="visually-hidden">
                {view ? view.name : t('Canvas')}
              </h2>
              {view && scene ? (
                <ImageSourceContext value={images}>
                  <CanvasArea
                    project={project}
                    view={view}
                    scene={scene}
                    label={describeDrawing(t, view, scene)}
                    selection={selection}
                    onSelect={setSelection}
                    {...(onCommand ? { onCommand } : {})}
                    {...(revealed ? { revealed } : {})}
                    scenarios={scenarios}
                    theme={theme}
                    onThemeShown={onThemeShown}
                    onCanvas={setCanvas}
                  />
                </ImageSourceContext>
              ) : (
                <p className="canvas-message">{t('There is no view to draw.')}</p>
              )}
              <GuidanceLayer scenarios={scenarios} />
              <FindBar
                project={project}
                definitions={definitions}
                viewId={view?.id}
                goTo={viewState.goTo}
              />
            </main>
            <Inspector view={view} scene={scene} definitions={definitions} />
            <ScenarioPanel session={scenarios} />
          </div>
        </EmphasisContext.Provider>
      </DefinitionProvider>
    </EditorContext.Provider>
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
