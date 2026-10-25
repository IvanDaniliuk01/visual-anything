import {
  appearanceOf,
  definitionsIn,
  detailParts,
  detailText,
  modelIndexOf,
  nestingTypesInView,
  previewDelete,
  startedTypesByElement,
  type Command,
  type DeletePreview,
} from '@visual-anything/core';
import type { Element, Id } from '@visual-anything/schema';
import { useId, useMemo, useState } from 'react';
import { DeleteDialog } from '../../canvas/DeleteDialog';
import {
  addColumnsCommand,
  addRowCommand,
  isTable,
  moveRowCommand,
  rowsInView,
} from '../../canvas/rowCommands';
import { useEditor } from '../../editor/EditorContext';
import { useT, type PluralText } from '../../i18n';
import { parseColumns } from './columns';
import './rows.css';

const LOOSE_COLUMNS: PluralText = {
  one: 'This view does not nest by “{type}”, so its column sits loose.',
  other: 'This view does not nest by “{type}”, so its {count} columns sit loose.',
};
const LOOSE_ROWS: PluralText = {
  one: 'This view does not nest by “{type}”, so its row sits loose.',
  other: 'This view does not nest by “{type}”, so its {count} rows sit loose.',
};
const ADD_COLUMNS: PluralText = { one: 'Add {count} column', other: 'Add {count} columns' };
const ADDED_COLUMNS: PluralText = {
  one: 'Added {count} column to “{name}”.',
  other: 'Added {count} columns to “{name}”.',
};

/**
 * The rows of an element whose shapes draw its contents as rows (ADR 0023), as a table's columns:
 * listed in the model's order, each with Move up, Move down and Remove, with Add a row; and for a
 * table, a box to type or paste columns into, `CREATE TABLE` included, that shows what it will add,
 * what it skips and which references it cannot relate before anything is sent. When the open view
 * does not nest by the relation type that holds the rows, it says so and offers to show them.
 */
export function RowsSection({ element }: { element: Element }) {
  const t = useT();
  const { project, definitions, viewId, send } = useEditor();
  const headingId = useId();
  const typedId = useId();
  const [typed, setTyped] = useState('');
  const [removing, setRemoving] = useState<{ row: Id; preview: DeletePreview }>();
  // Each message counts, so that the same words said again are heard again.
  const [message, setMessage] = useState({ text: '', count: 0 });
  const say = (text: string) => setMessage((last) => ({ text, count: last.count + 1 }));
  const parsed = useMemo(() => parseColumns(typed), [typed]);

  const view = project.views.find((each) => each.id === viewId);
  const appearance = appearanceOf(element, definitions);
  if (!view || !appearance.contentsAsRows) return null;

  const editable = send !== undefined;
  const table = isTable(project, element.id);
  const index = modelIndexOf(project);
  const rows = rowsInView(project, view, element.id);
  const started = startedTypesByElement(project.model.relations);
  const detailOf = (id: Id) => {
    const row = index.element(id);
    return row
      ? detailText(
          detailParts(row, definitionsIn(project), started.get(id) ?? new Set()).map((part) =>
            part.kind === 'component-name'
              ? { ...part, text: t.definition(row.component, part.text) }
              : part,
          ),
        )
      : '';
  };

  // What it holds through nesting relation types the view does not nest by.
  const inView = new Set(nestingTypesInView(project, view));
  const nesting = definitionsIn(project).nestingRelationTypes;
  const looseTypes = new Map<Id, Set<Id>>();
  for (const relation of index.relationsOn(element.id)) {
    if (relation.to !== element.id || relation.from === element.id) continue;
    if (!nesting.has(relation.relationType) || inView.has(relation.relationType)) continue;
    if (index.element(relation.from) === undefined || rows.includes(relation.from)) continue;
    const held = looseTypes.get(relation.relationType) ?? new Set<Id>();
    held.add(relation.from);
    looseTypes.set(relation.relationType, held);
  }
  const [looseType] = looseTypes.keys();
  const looseCount = looseType === undefined ? 0 : (looseTypes.get(looseType)?.size ?? 0);
  const typeName = (id: Id) =>
    t.definition(id, definitionsIn(project).relationType(id)?.name ?? id);

  const run = async (command: Command | undefined, done: string): Promise<boolean> => {
    if (!command || !send) return false;
    try {
      const result = await send(command);
      if (result.ok) say(done);
      return result.ok;
    } catch {
      return false;
    }
  };

  const showRows = () => {
    if (looseType === undefined) return;
    void run(
      {
        type: 'update-view',
        id: view.id,
        changes: { nestingRelationTypes: [...nestingTypesInView(project, view), looseType] },
      },
      t(table ? 'The columns show as rows.' : 'The rows show as rows.'),
    );
  };

  const references = addColumnsCommand(project, view.id, element.id, parsed.columns);
  const addTyped = async () => {
    if (!references.command) return;
    const added = await run(
      references.command,
      t(ADDED_COLUMNS, { count: parsed.columns.length, name: element.name }),
    );
    if (added) setTyped('');
  };

  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  const heading = table ? t('Columns') : t('Rows');

  return (
    <section className="inspector-section inspector-rows" aria-labelledby={headingId}>
      <h4 id={headingId}>{heading}</h4>
      {looseType !== undefined && (
        <>
          <p className="inspector-notes">
            {t(table ? LOOSE_COLUMNS : LOOSE_ROWS, {
              count: looseCount,
              type: t(typeName(looseType)),
            })}
          </p>
          <button
            type="button"
            className="inspector-action"
            disabled={!editable}
            onClick={showRows}
          >
            {t('Show them as rows')}
          </button>
        </>
      )}
      {rows.length === 0 ? (
        <p className="inspector-notes">{t(table ? 'No columns yet.' : 'No rows yet.')}</p>
      ) : (
        <ol className="inspector-rows-list">
          {rows.map((row, at) => {
            const detail = detailOf(row);
            return (
              <li key={row} className="inspector-row">
                <span className="inspector-row-name">
                  {nameOf(row)}
                  {detail !== '' && <span className="inspector-row-detail"> {detail}</span>}
                </span>
                <span className="inspector-row-actions">
                  <button
                    type="button"
                    className="inspector-action"
                    disabled={!editable || at === 0}
                    aria-label={t('Move “{name}” up', { name: nameOf(row) })}
                    onClick={() =>
                      void run(
                        moveRowCommand(project, view, element.id, row, 'up'),
                        t('“{name}” moved up.', { name: nameOf(row) }),
                      )
                    }
                  >
                    {t('Up')}
                  </button>
                  <button
                    type="button"
                    className="inspector-action"
                    disabled={!editable || at === rows.length - 1}
                    aria-label={t('Move “{name}” down', { name: nameOf(row) })}
                    onClick={() =>
                      void run(
                        moveRowCommand(project, view, element.id, row, 'down'),
                        t('“{name}” moved down.', { name: nameOf(row) }),
                      )
                    }
                  >
                    {t('Down')}
                  </button>
                  <button
                    type="button"
                    className="inspector-action"
                    disabled={!editable}
                    aria-label={t('Remove “{name}”', { name: nameOf(row) })}
                    onClick={() =>
                      setRemoving({
                        row,
                        preview: previewDelete(project, { elements: [row] }, view.id),
                      })
                    }
                  >
                    {t('Remove')}
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <button
        type="button"
        className="inspector-action"
        disabled={!editable}
        onClick={() =>
          void run(
            addRowCommand(project, view.id, element.id)?.command,
            t('Added a row to “{name}”.', { name: element.name }),
          )
        }
      >
        {t(table ? 'Add a column' : 'Add a row')}
      </button>
      {table && (
        <div className="inspector-control inspector-rows-typed">
          <label htmlFor={typedId}>{t('Type or paste columns')}</label>
          <textarea
            id={typedId}
            rows={4}
            value={typed}
            disabled={!editable}
            spellCheck={false}
            placeholder={t('id uuid pk, or a CREATE TABLE statement')}
            onChange={(event) => setTyped(event.target.value)}
          />
          {parsed.columns.length > 0 && (
            <ul className="inspector-notes inspector-rows-preview" aria-label={t('Columns to add')}>
              {parsed.columns.map((column, at) => (
                <li key={at}>
                  {[column.name, column.type, column.primaryKey ? 'PK' : undefined]
                    .filter((part) => part !== undefined)
                    .join(' · ')}
                </li>
              ))}
            </ul>
          )}
          {parsed.skipped.map((skipped, at) => (
            <p key={`skipped ${at}`} className="inspector-notes">
              {t('Skipped: {text}: {reason}', { text: skipped.text, reason: t(skipped.reason) })}
            </p>
          ))}
          {references.unrelated.map((each, at) => (
            <p key={`unrelated ${at}`} className="inspector-notes">
              {t('Not related: {text}: {reason}', { text: each.text, reason: each.reason })}
            </p>
          ))}
          <button
            type="button"
            className="inspector-action"
            disabled={!editable || references.command === undefined}
            onClick={() => void addTyped()}
          >
            {t(ADD_COLUMNS, { count: parsed.columns.length })}
          </button>
        </div>
      )}
      <p role="status" className="visually-hidden">
        {message.text}
        {message.count % 2 === 1 ? ' ' : ''}
      </p>
      {removing && (
        <DeleteDialog
          project={project}
          preview={removing.preview}
          freeShapes={0}
          onConfirm={() => {
            const { preview } = removing;
            setRemoving(undefined);
            const cascaded = new Set(preview.cascaded);
            void run(
              {
                type: 'delete',
                elements: preview.elements,
                relations: preview.relations.filter((id) => !cascaded.has(id)),
              },
              t('“{name}” was removed.', { name: nameOf(removing.row) }),
            );
          }}
          onCancel={() => setRemoving(undefined)}
        />
      )}
    </section>
  );
}
