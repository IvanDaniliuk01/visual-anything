import type { ProjectSnapshot } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { useCallback, useId, useMemo, useState } from 'react';
import { CanvasArea, type SendCommand } from '../canvas/CanvasArea';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION, prune, type Selection } from '../editor/selection';
import { buildScene, type Scene } from '../canvas/scene';
import { definitionsOf } from '@visual-anything/core';
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
 * project's first view; choosing another view comes with views and perspectives (M3).
 */
export function Shell({ project, notice, onCommand }: ShellProps) {
  const view = project.views[0];
  const [chosen, setSelection] = useState<Selection>(EMPTY_SELECTION);
  // What an edit removed, from here or elsewhere, drops out of the selection. The ids are gathered
  // when the project changes, not on every selection, which at 10,000 elements would show.
  const present = useMemo(
    () => ({
      elements: new Set(project.model.elements.map((element) => element.id)),
      relations: new Set(project.model.relations.map((relation) => relation.id)),
      freeShapes: new Set(view?.freeShapes.map((shape) => shape.id)),
    }),
    [project.model, view],
  );
  const selection = useMemo(
    () =>
      prune(chosen, {
        element: (id) => present.elements.has(id),
        relation: (id) => present.relations.has(id),
        freeShape: (id) => present.freeShapes.has(id),
      }),
    [chosen, present],
  );
  const definitions = useMemo(() => definitionsOf(project.packages), [project.packages]);
  const scene = useMemo(() => (view ? buildScene(project, view.id) : undefined), [project, view]);
  const [revealed, setRevealed] = useState<{ key: string; request: number }>();
  const reveal = useCallback((key: string) => {
    setRevealed((last) => ({ key, request: (last?.request ?? 0) + 1 }));
  }, []);
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
    }),
    [project, definitions, view?.id, scene, selection, onCommand, reveal],
  );
  const canvasHeading = useId();

  return (
    <EditorContext.Provider value={editor}>
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
            />
          ) : (
            <p className="canvas-message">There is no view to draw.</p>
          )}
        </main>
        <Inspector view={view} scene={scene} definitions={definitions} />
      </div>
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
