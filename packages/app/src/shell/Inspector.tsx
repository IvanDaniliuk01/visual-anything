import { modelIndexOf, relationTypeOrRelatesTo, type Definitions } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { useEffect, useId, useRef } from 'react';
import type { Scene } from '../canvas/scene';
import { useEditor } from '../editor/EditorContext';
import { selectionOf, sizeOf, type Selectable } from '../editor/selection';
import { DefinitionInspector } from './definitions/DefinitionInspector';
import { countsOf } from './inspector/describe';
import { ElementInspector } from './inspector/ElementInspector';
import { inspectedKey, inspectedOf } from './inspector/inspected';
import { Detail } from './inspector/parts';
import { RelationInspector } from './inspector/RelationInspector';
import './inspector.css';

interface InspectorProps {
  /** The open view, if any, and what it draws. */
  view: ViewFile | undefined;
  scene: Scene | undefined;
  definitions: Definitions;
}

/**
 * The inspector: the details of what is selected, where an element's or a relation's name,
 * description, attributes and particularities are edited, each edit as one command. With nothing
 * selected it details the open view; with several things selected it counts them. While the project
 * cannot be changed, every control is read-only.
 */
export function Inspector({ view, scene, definitions }: InspectorProps) {
  const editor = useEditor();
  const { project, selection } = editor;
  const heading = useId();
  const title = useRef<HTMLHeadingElement>(null);
  // What was chosen in the inspector itself, whose title takes the focus once it shows.
  const chosen = useRef<string | undefined>(undefined);
  const inspected = inspectedOf(selection, modelIndexOf(project), view);
  const key = inspectedKey(inspected);

  useEffect(() => {
    const wanted = chosen.current;
    if (wanted === undefined) return;
    chosen.current = undefined;
    if (wanted === key) title.current?.focus();
  });

  const choose = (item: Selectable) => {
    chosen.current = `${item.kind}:${item.id}`;
    editor.select(selectionOf([item]));
  };

  return (
    <aside className="panel inspector" aria-labelledby={heading}>
      <h2 id={heading}>Inspector</h2>
      {/* A component, relation type or package opened for editing shows in place of the selection. */}
      <DefinitionInspector>
        {inspected.kind === 'nothing' && (
          <>
            <p className="inspector-selection">Nothing is selected.</p>
            <ViewDetails view={view} scene={scene} definitions={definitions} />
          </>
        )}
        {inspected.kind === 'element' && (
          <ElementInspector
            key={inspected.element.id}
            element={inspected.element}
            definitions={definitions}
            titleRef={title}
            onSelect={choose}
          />
        )}
        {inspected.kind === 'relation' && (
          <RelationInspector
            key={inspected.relation.id}
            relation={inspected.relation}
            definitions={definitions}
            titleRef={title}
            onSelect={choose}
          />
        )}
        {inspected.kind === 'note' && (
          <>
            <h3 className="inspector-title">Note</h3>
            <p className="inspector-note-text">{inspected.note.text}</p>
            <p className="inspector-notes">Edit its text on the canvas.</p>
          </>
        )}
        {inspected.kind === 'arrow' && (
          <>
            <h3 className="inspector-title">Arrow</h3>
            <p className="inspector-notes">A free shape: drawing only, not part of the model.</p>
          </>
        )}
        {inspected.kind === 'several' && (
          <>
            <p className="inspector-selection">
              {countsOf(selection)} {sizeOf(selection) === 1 ? 'is' : 'are'} selected.
            </p>
            <p className="inspector-notes">Select only one to see and edit it.</p>
          </>
        )}
      </DefinitionInspector>
    </aside>
  );
}

/** The open view's details, read-only. */
function ViewDetails({ view, scene, definitions }: InspectorProps) {
  const viewHeading = useId();
  if (!view || !scene) return <p className="panel-empty">No view is open.</p>;
  const nestingNames = view.nestingRelationTypes.map(
    (relationType) => relationTypeOrRelatesTo(definitions, relationType).name,
  );
  return (
    <section className="panel-section" aria-labelledby={viewHeading}>
      <h3 id={viewHeading}>View</h3>
      <dl className="details">
        <Detail term="Name">{view.name}</Detail>
        {view.description !== undefined && <Detail term="Description">{view.description}</Detail>}
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
          {nestingNames.length > 0 ? nestingNames.join(', ') : 'None'}
        </Detail>
        <Detail term="Element shapes">{scene.shapes.length}</Detail>
        <Detail term="Relations">{scene.relations.length}</Detail>
        <Detail term="Free shapes">{scene.notes.length + scene.arrows.length}</Detail>
      </dl>
    </section>
  );
}
