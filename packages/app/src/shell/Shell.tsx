import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { useCallback, useId, useMemo, useState } from 'react';
import { CanvasArea, type SendCommand } from '../canvas/CanvasArea';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { DefinitionProvider } from './definitions/DefinitionProvider';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import { GuidanceLayer } from '../guidance/GuidanceLayer';
import { useSelection } from '../editor/useSelection';
import { buildScene, type Scene } from '../canvas/scene';
import { useExplorer } from '../canvas/useExplorer';
import { definitionsIn } from '@visual-anything/core';
import { ScenarioPanel } from '../scenarios/ScenarioPanel';
import { ScenarioSession } from '../scenarios/session';
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
  const [openViewId, setOpenViewId] = useState<Id>();
  const view = project.views.find((each) => each.id === openViewId) ?? project.views[0];
  // What an edit removed, from here or elsewhere, drops out of the selection.
  const [selection, setSelection] = useSelection(project, view);
  const definitions = useMemo(
    () => definitionsIn(project),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the definitions follow the packages and the project appearances only
    [project.packages, project.project.appearances],
  );
  const scene = useMemo(() => (view ? buildScene(project, view.id) : undefined), [project, view]);
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

  return (
    <EditorContext.Provider value={editor}>
      <DefinitionProvider>
        <EmphasisContext.Provider value={emphasis}>
          <div className="shell">
            <Header projectName={project.project.name} viewName={view?.name} />
            {notice !== undefined && (
              <p className="shell-notice" role="alert">
                {notice}
              </p>
            )}
            <ModelPanel project={project} definitions={definitions} openViewId={view?.id} />
            <main className="canvas-area" aria-labelledby={canvasHeading}>
              <h2 id={canvasHeading} className="visually-hidden">
                {view ? view.name : 'Canvas'}
              </h2>
              {view && scene ? (
                <CanvasArea
                  project={project}
                  view={view}
                  scene={scene}
                  label={describeDrawing(view, scene)}
                  selection={selection}
                  onSelect={setSelection}
                  {...(onCommand ? { onCommand } : {})}
                  {...(revealed ? { revealed } : {})}
                  scenarios={scenarios}
                />
              ) : (
                <p className="canvas-message">There is no view to draw.</p>
              )}
              <GuidanceLayer />
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
function describeDrawing(view: ViewFile, scene: Scene): string {
  const count = (amount: number, one: string, many: string) =>
    `${amount} ${amount === 1 ? one : many}`;
  const shapes = count(scene.shapes.length, 'element shape', 'element shapes');
  const relations = count(scene.relations.length, 'relation', 'relations');
  const free = count(scene.notes.length + scene.arrows.length, 'free shape', 'free shapes');
  return `${view.name}, from the ${view.perspective.name} perspective: ${shapes}, ${relations} and ${free}.`;
}
