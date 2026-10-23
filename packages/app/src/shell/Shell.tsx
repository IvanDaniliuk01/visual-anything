import type { ProjectSnapshot } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { useId, useMemo } from 'react';
import { CanvasArea } from '../canvas/CanvasArea';
import { buildScene, type Scene } from '../canvas/scene';
import { resolveDefinitions } from '../model/definitions';
import { Header } from './Header';
import { Inspector } from './Inspector';
import { ModelPanel } from './ModelPanel';

interface ShellProps {
  project: ProjectSnapshot;
  /** A message to show above the panels, such as the live connection having closed. */
  notice?: string;
}

/**
 * The app shell: the header, the model panel, the canvas area and the inspector. The canvas draws the
 * project's first view; choosing another view comes with views and perspectives (M3).
 */
export function Shell({ project, notice }: ShellProps) {
  const view = project.views[0];
  const definitions = useMemo(() => resolveDefinitions(project.packages), [project.packages]);
  const scene = useMemo(() => (view ? buildScene(project, view.id) : undefined), [project, view]);
  const canvasHeading = useId();

  return (
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
          <CanvasArea scene={scene} label={describeDrawing(view, scene)} />
        ) : (
          <p className="canvas-message">There is no view to draw.</p>
        )}
      </main>
      <Inspector view={view} scene={scene} definitions={definitions} />
    </div>
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
