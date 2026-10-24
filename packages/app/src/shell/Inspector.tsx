import type { ViewFile } from '@visual-anything/schema';
import { useId, type ReactNode } from 'react';
import type { Scene } from '../canvas/scene';
import type { Definitions } from '../model/definitions';

interface InspectorProps {
  /** The open view, if any, and what it draws. */
  view: ViewFile | undefined;
  scene: Scene | undefined;
  definitions: Definitions;
}

/** The inspector: read-only details of the open view. Selecting shapes comes with the canvas (M2). */
export function Inspector({ view, scene, definitions }: InspectorProps) {
  const heading = useId();
  const viewHeading = useId();
  const nestingNames = view?.nestingRelationTypes.map(
    (relationType) => definitions.relationType(relationType).name,
  );

  return (
    <aside className="panel inspector" aria-labelledby={heading}>
      <h2 id={heading}>Inspector</h2>
      <p className="inspector-selection">Nothing is selected.</p>
      {view && scene ? (
        <section className="panel-section" aria-labelledby={viewHeading}>
          <h3 id={viewHeading}>View</h3>
          <dl className="details">
            <Detail term="Name">{view.name}</Detail>
            {view.description !== undefined && (
              <Detail term="Description">{view.description}</Detail>
            )}
            <Detail term="Perspective">
              <span className="detail-value">{view.perspective.name}</span>
              {view.perspective.description !== undefined && (
                <>
                  {' '}
                  <span className="detail-note">{view.perspective.description}</span>
                </>
              )}
            </Detail>
            <Detail term="Nesting relation types">
              {nestingNames && nestingNames.length > 0 ? nestingNames.join(', ') : 'None'}
            </Detail>
            <Detail term="Element shapes">{scene.shapes.length}</Detail>
            <Detail term="Relations">{scene.relations.length}</Detail>
            <Detail term="Free shapes">{scene.notes.length + scene.arrows.length}</Detail>
          </dl>
        </section>
      ) : (
        <p className="panel-empty">No view is open.</p>
      )}
    </aside>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="detail">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
