/**
 * What is selected in a read-only page, written out: an element's name, its component, its
 * description and its attributes; a relation's type, its ends and its attributes; a note's text; or
 * how much is selected. It is read, never edited: the page has no inspector controls (ADR 0041).
 */
import { componentOrEssence, modelIndexOf, relationTypeOrRelatesTo } from '@visual-anything/core';
import type { Attributes, AttributeDefinition, JsonValue } from '@visual-anything/schema';
import { nameOfEnd } from '../canvas/announce';
import { useEditor } from '../editor/EditorContext';
import { EMPTY_SELECTION, sizeOf } from '../editor/selection';
import { useT, type Translator } from '../i18n';
import { DismissIcon } from '../shell/icons';
import { leavingTitleOf } from './leaving';

export function Details() {
  const t = useT();
  const { project, definitions, selection, select, viewId, scene } = useEditor();
  const size = sizeOf(selection);
  if (size === 0) return null;
  const close = (
    <button
      type="button"
      className="viewer-dismiss"
      aria-label={t('Clear the selection')}
      title={t('Clear the selection (Escape)')}
      onClick={() => select(EMPTY_SELECTION)}
    >
      <DismissIcon />
    </button>
  );
  const index = modelIndexOf(project);
  const [elementId] = selection.elements;
  const [relationId] = selection.relations;
  const [freeId] = selection.freeShapes;

  if (size === 1 && elementId !== undefined) {
    const element = index.element(elementId);
    if (!element) return null;
    const component = componentOrEssence(definitions, element.component);
    // The relations that leave the view through its scope, from the element's first shape (ADR-0040).
    const leaving = scene?.shapes.find((shape) => shape.element === element.id)?.leaving;
    return (
      <section className="viewer-sheet viewer-details" aria-label={t('Selected')}>
        <div className="viewer-sheet-head">
          <h2>{element.name}</h2>
          {close}
        </div>
        <p className="viewer-kind">{t.definition(component.id, component.name)}</p>
        {element.description !== undefined && element.description !== '' && (
          <p>{element.description}</p>
        )}
        <AttributeList t={t} values={element.attributes} defined={component.attributes} />
        {leaving !== undefined && leaving.length > 0 && (
          <p className="viewer-note">{leavingTitleOf(project, leaving)}</p>
        )}
      </section>
    );
  }
  if (size === 1 && relationId !== undefined) {
    const relation = index.relation(relationId);
    if (!relation) return null;
    const type = relationTypeOrRelatesTo(definitions, relation.relationType);
    return (
      <section className="viewer-sheet viewer-details" aria-label={t('Selected')}>
        <div className="viewer-sheet-head">
          <h2>{relation.name ?? t.definition(type.id, type.name)}</h2>
          {close}
        </div>
        <p className="viewer-kind">
          {t('{from} {relationType} {to}', {
            from: nameOfEnd(project, relation.from),
            relationType: t.definition(type.id, type.name),
            to: nameOfEnd(project, relation.to),
          })}
        </p>
        {relation.description !== undefined && relation.description !== '' && (
          <p>{relation.description}</p>
        )}
        <AttributeList t={t} values={relation.attributes} defined={type.attributes} />
      </section>
    );
  }
  if (size === 1 && freeId !== undefined) {
    const view = project.views.find((each) => each.id === viewId);
    const shape = view?.freeShapes.find((each) => each.id === freeId);
    if (!shape) return null;
    return (
      <section className="viewer-sheet viewer-details" aria-label={t('Selected')}>
        <div className="viewer-sheet-head">
          <h2>{shape.kind === 'note' ? t('Note') : t('Arrow')}</h2>
          {close}
        </div>
        {shape.kind === 'note' && <p className="viewer-note-text">{shape.text}</p>}
      </section>
    );
  }
  return (
    <section className="viewer-sheet viewer-details" aria-label={t('Selected')}>
      <div className="viewer-sheet-head">
        <h2>
          {selectedText(
            t,
            selection.elements.size,
            selection.relations.size,
            selection.freeShapes.size,
          )}
        </h2>
        {close}
      </div>
    </section>
  );
}

/** The attributes an element or relation has: its own values, and the defaults its definition gives. */
function AttributeList({
  t,
  values,
  defined,
}: {
  t: Translator;
  values: Attributes | undefined;
  defined: readonly AttributeDefinition[];
}) {
  const names = new Map<string, JsonValue>();
  for (const attribute of defined) {
    const value =
      values && Object.hasOwn(values, attribute.name) ? values[attribute.name] : attribute.default;
    if (value !== undefined) names.set(attribute.name, value);
  }
  for (const [name, value] of Object.entries(values ?? {}))
    if (!names.has(name)) names.set(name, value);
  if (names.size === 0) return null;
  const units = new Map(defined.map((attribute) => [attribute.name, attribute.unit]));
  return (
    <dl className="viewer-attributes" aria-label={t('Attributes')}>
      {[...names].map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{valueText(value, units.get(name))}</dd>
        </div>
      ))}
    </dl>
  );
}

function valueText(value: JsonValue, unit: string | undefined): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return unit === undefined || typeof value !== 'number' ? text : `${text} ${unit}`;
}

function selectedText(t: Translator, elements: number, relations: number, free: number): string {
  const parts = [
    ...(elements > 0
      ? [t({ one: '{count} element', other: '{count} elements' }, { count: elements })]
      : []),
    ...(relations > 0
      ? [t({ one: '{count} relation', other: '{count} relations' }, { count: relations })]
      : []),
    ...(free > 0
      ? [t({ one: '{count} free shape', other: '{count} free shapes' }, { count: free })]
      : []),
  ];
  return t('Selected: {things}', { things: parts.join(', ') });
}
