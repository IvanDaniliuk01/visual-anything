/**
 * What is selected in a read-only page, written out: an element's name, its component, its
 * description and its attributes; a relation's type, its ends and its attributes; a note's text; or
 * how much is selected. It is read, never edited: the page has no inspector controls (ADR 0041).
 *
 * In a page with the physical-space panel, an element's details offer Show in physical space, as the
 * app's shape menu does (ADR 0076): it only reads, so it is the page's too.
 */
import {
  componentOrEssence,
  isVideoFormat,
  modelIndexOf,
  relationTypeOrRelatesTo,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type {
  Attributes,
  AttributeDefinition,
  Id,
  JsonValue,
  ViewFile,
} from '@visual-anything/schema';
import { useState } from 'react';
import { nameOfEnd } from '../canvas/announce';
import { useEditor } from '../editor/EditorContext';
import { EMPTY_SELECTION, sizeOf } from '../editor/selection';
import { useT, type Translator } from '../i18n';
import { DismissIcon, SpaceIcon } from '../shell/icons';
import { useSpacePanel } from '../space/context';
import { showInSpace, showInSpaceOf } from '../space/show';
import type { SpacePanelStore } from '../space/store';
import { EmphasisBlocks, EmphasisRuns } from '../text/EmphasisText';
import { leavingTitleOf } from './leaving';

export function Details() {
  const t = useT();
  const { project, definitions, selection, select, viewId, scene } = useEditor();
  const spacePanel = useSpacePanel();
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
    const view = project.views.find((each) => each.id === viewId);
    return (
      <section className="viewer-sheet viewer-details" aria-label={t('Selected')}>
        <div className="viewer-sheet-head">
          <h2>{element.name}</h2>
          {close}
        </div>
        <p className="viewer-kind">{t.definition(component.id, component.name)}</p>
        {element.description !== undefined && element.description !== '' && (
          <EmphasisBlocks text={element.description} headingLevel={3} />
        )}
        <AttributeList t={t} values={element.attributes} defined={component.attributes} />
        {leaving !== undefined && leaving.length > 0 && (
          <p className="viewer-note">{leavingTitleOf(project, leaving)}</p>
        )}
        {spacePanel && view && (
          <ShowInSpace
            key={element.id}
            store={spacePanel}
            project={project}
            view={view}
            element={element.id}
            name={element.name}
          />
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
          <EmphasisBlocks text={relation.description} headingLevel={3} />
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
          <h2>
            {shape.kind === 'note'
              ? t('Note')
              : shape.kind === 'picture'
                ? (shape.name ?? (isVideoFormat(shape.media.format) ? t('Video') : t('Picture')))
                : t('Arrow')}
          </h2>
          {close}
        </div>
        {shape.kind === 'note' && (
          <EmphasisBlocks className="viewer-note-text" text={shape.text} headingLevel={3} />
        )}
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

/**
 * Show in physical space, for the element selected: opens the page's panel showing it, or frames it
 * where it is in World, as `space/show.ts` says, and says which it did.
 */
function ShowInSpace({
  store,
  project,
  view,
  element,
  name,
}: {
  store: SpacePanelStore;
  project: ProjectSnapshot;
  view: ViewFile;
  element: Id;
  name: string;
}) {
  const t = useT();
  // Each message counts, so that the same words said again are heard again.
  const [said, setSaid] = useState({ text: '', count: 0 });
  const frames = showInSpaceOf(project, view, element).kind === 'frames';
  const show = () => {
    const what = showInSpace(store, project, view, element);
    const text =
      what.kind === 'shows'
        ? t('The physical-space panel shows “{name}”.', { name })
        : t('“{name}” is framed in the physical-space panel.', { name });
    setSaid((last) => ({ text, count: last.count + 1 }));
  };
  return (
    <div className="viewer-row">
      <button
        type="button"
        className="viewer-button"
        title={
          frames
            ? t('Frames it in the physical-space panel, where it is in World.')
            : t('Opens the physical-space panel showing it, with what is posed or anchored in it.')
        }
        onClick={show}
      >
        <SpaceIcon />
        {t('Show in physical space')}
      </button>
      <p role="status" className="visually-hidden">
        {said.text}
        {said.count % 2 === 1 ? ' ' : ''}
      </p>
    </div>
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
  const formats = new Map(defined.map((attribute) => [attribute.name, attribute.format]));
  return (
    <dl className="viewer-attributes" aria-label={t('Attributes')}>
      {[...names].map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>
            {typeof value === 'string' && formats.get(name) === 'emphasis' ? (
              <EmphasisRuns text={value} />
            ) : (
              valueText(value, units.get(name))
            )}
          </dd>
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
