import { modelIndexOf, relationTypeOrRelatesTo, type Definitions } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { useEffect, useId, useRef } from 'react';
import type { Scene } from '../canvas/scene';
import { useEditor } from '../editor/EditorContext';
import { selectionOf, sizeOf, type Selectable } from '../editor/selection';
import { useT } from '../i18n';
import { DefinitionInspector } from './definitions/DefinitionInspector';
import { countsOf } from './inspector/describe';
import { ElementInspector } from './inspector/ElementInspector';
import { FreeShapeAppearance } from './inspector/FreeShapeAppearance';
import { inspectedKey, inspectedOf } from './inspector/inspected';
import { LinesControl } from './inspector/LinesControl';
import { OverlaysSection } from './inspector/OverlaysSection';
import { Detail } from './inspector/parts';
import { RelationInspector } from './inspector/RelationInspector';
import { ScopeEditor } from './inspector/ScopeEditor';
import { SelectionAppearance } from './inspector/SelectionAppearance';
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
  const t = useT();
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
      <h2 id={heading}>{t('Inspector')}</h2>
      {/* A component, relation type or package opened for editing shows in place of the selection. */}
      <DefinitionInspector>
        {inspected.kind === 'nothing' && (
          <>
            <p className="inspector-selection">{t('Nothing is selected.')}</p>
            <ViewDetails view={view} scene={scene} definitions={definitions} />
            {view && <OverlaysSection view={view} />}
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
            <h3 className="inspector-title">{t('Note')}</h3>
            <p className="inspector-note-text">{inspected.note.text}</p>
            <p className="inspector-notes">{t('Edit its text on the canvas.')}</p>
            <FreeShapeAppearance key={inspected.note.id} shape={inspected.note} />
          </>
        )}
        {inspected.kind === 'arrow' && (
          <>
            <h3 className="inspector-title">{t('Arrow')}</h3>
            <p className="inspector-notes">
              {t('A free shape: drawing only, not part of the model.')}
            </p>
            <FreeShapeAppearance key={inspected.arrow.id} shape={inspected.arrow} />
          </>
        )}
        {inspected.kind === 'several' && (
          <>
            <p className="inspector-selection">
              {t(
                { one: '{things} is selected.', other: '{things} are selected.' },
                { things: countsOf(selection), count: sizeOf(selection) },
              )}
            </p>
            <SelectionAppearance />
            <p className="inspector-notes">
              {t('Select only one to see and edit the rest of it.')}
            </p>
          </>
        )}
      </DefinitionInspector>
    </aside>
  );
}

/** The open view's details, read-only. */
function ViewDetails({ view, scene, definitions }: InspectorProps) {
  const t = useT();
  const viewHeading = useId();
  if (!view || !scene) return <p className="panel-empty">{t('No view is open.')}</p>;
  const nestingNames = view.nestingRelationTypes.map((relationType) =>
    t.definition(relationType, relationTypeOrRelatesTo(definitions, relationType).name),
  );
  return (
    <section className="panel-section" aria-labelledby={viewHeading}>
      <h3 id={viewHeading}>{t('View')}</h3>
      <dl className="details">
        <Detail term={t('Name')}>{view.name}</Detail>
        {view.description !== undefined && (
          <Detail term={t('Description')}>{view.description}</Detail>
        )}
        <Detail term={t('Perspective')}>
          <span className="detail-value">{view.perspective.name}</span>
          {view.perspective.description !== undefined && (
            <>
              {' '}
              <span className="detail-note">{view.perspective.description}</span>
            </>
          )}
        </Detail>
        <Detail term={t('Nesting relation types')}>
          {nestingNames.length > 0 ? nestingNames.join(', ') : t('None')}
        </Detail>
        <Detail term={t('Element shapes')}>{scene.shapes.length}</Detail>
        <Detail term={t('Relations')}>{scene.relations.length}</Detail>
        <Detail term={t('Free shapes')}>{scene.notes.length + scene.arrows.length}</Detail>
      </dl>
      {/* How it draws the automatic routes its relations leave to it (ADR 0069). */}
      <LinesControl view={view} />
      {/* What the view shows of the model, and its scope's editor (ADR-0040). */}
      <ScopeEditor view={view} />
    </section>
  );
}
