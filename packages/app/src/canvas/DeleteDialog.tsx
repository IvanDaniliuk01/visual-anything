import { modelIndexOf, type DeletePreview, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useId, useMemo, useRef } from 'react';
import { useT, type PluralText, type Translator } from '../i18n';
import './drop.css';
import { useModalFocus } from './focus';

/**
 * A change that deletes relations as it goes, such as putting a shape inside another container or
 * taking it out of its own: what the dialog asks, its confirm button, and the relations it takes away.
 */
export interface DeleteDialogAction {
  title: string;
  confirmLabel: string;
  /** The nesting relations the change deletes. */
  leaving: readonly Id[];
  /** Those of them that have a name, a description or attributes of their own. */
  withData: readonly Id[];
}

interface DeleteDialogProps {
  project: ProjectSnapshot;
  preview: DeletePreview;
  /** Free shapes deleted along with the rest. */
  freeShapes: number;
  /** Present for a change other than a deletion, which the dialog then names and confirms instead. */
  action?: DeleteDialogAction;
  /**
   * What the deleted elements hold, which goes only when its box is checked (ADR 0023): the rows the
   * open view draws, checked at first, and the rest, unchecked, each named with a container that
   * keeps holding it.
   */
  held?: HeldChoice;
  onConfirm: () => void;
  onCancel: () => void;
}

/** What a deletion's elements hold, and which of it goes with them. */
export interface HeldChoice {
  contents: DeletePreview['contents'];
  rows: boolean;
  others: boolean;
  onChange: (group: 'rows' | 'other', checked: boolean) => void;
}

const HELD_ROWS_OF_ONE: PluralText = { one: 'Also delete its row', other: 'Also delete its {count} rows' };
const HELD_ROWS_OF_SEVERAL: PluralText = {
  one: 'Also delete their row',
  other: 'Also delete their {count} rows',
};
const HELD_OTHERS_OF_ONE: PluralText = {
  one: 'Also delete {count} more element it holds:',
  other: 'Also delete {count} more elements it holds:',
};
const HELD_OTHERS_OF_SEVERAL: PluralText = {
  one: 'Also delete {count} more element they hold:',
  other: 'Also delete {count} more elements they hold:',
};

const LISTED = 8;

const ELEMENTS: PluralText = { one: '{count} element', other: '{count} elements' };
const RELATIONS: PluralText = { one: '{count} relation', other: '{count} relations' };
const FREE_SHAPES: PluralText = { one: '{count} free shape', other: '{count} free shapes' };
const CASCADED_ON_IT: PluralText = {
  one: 'This relation ends on it, so it goes too:',
  other: 'These {count} relations end on it, so they go too:',
};
const CASCADED_ON_THEM: PluralText = {
  one: 'This relation ends on them, so it goes too:',
  other: 'These {count} relations end on them, so they go too:',
};
const CASCADED_ON_DELETED: PluralText = {
  one: 'This relation ends on what you delete, so it goes too:',
  other: 'These {count} relations end on what you delete, so they go too:',
};
const BROKEN_STEPS: PluralText = {
  one: 'This scenario step uses a relation that goes. It becomes a broken step and is kept, so you can fix it:',
  other:
    'These {count} scenario steps use a relation that goes. They become broken steps and are kept, so you can fix them:',
};
const POSITIONS: PluralText = {
  one: '{count} stored position in views goes with the shapes.',
  other: '{count} stored positions in views go with the shapes.',
};

/**
 * Shows what a deletion removes and breaks before anything is deleted, or what a change that deletes
 * relations as it goes takes away. It is modal: the focus stays inside it until it closes. Only the
 * relations it lists are named, so that a deletion of thousands opens at once.
 */
export function DeleteDialog({
  project,
  preview,
  freeShapes,
  action,
  held,
  onConfirm,
  onCancel,
}: DeleteDialogProps) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useModalFocus(dialog);

  const shown = useMemo(() => {
    const index = modelIndexOf(project);
    const elementName = (id: Id) => index.element(id)?.name ?? id;
    const relationName = (id: Id) => {
      const relation = index.relation(id);
      if (!relation) return id;
      const end = (each: Id) =>
        index.element(each)?.name ?? index.relation(each)?.name ?? t('a relation');
      return relation.name ?? `${end(relation.from)} → ${end(relation.to)}`;
    };
    const cascaded = new Set(preview.cascaded);
    const asked = preview.relations.filter((id) => !cascaded.has(id));
    const steps = preview.brokenSteps.slice(0, LISTED).map(({ scenario, step }) => {
      const found = project.scenarios.find((each) => each.id === scenario);
      const description = found?.steps.find((each) => each.id === step)?.description;
      return `${found?.name ?? scenario}: ${description || step}`;
    });
    return {
      elementName,
      relationName,
      asked: asked.length,
      cascaded: preview.cascaded.slice(0, LISTED).map(relationName),
      steps,
      leaving: action?.leaving.slice(0, LISTED).map(relationName) ?? [],
      withData: action?.withData.slice(0, 1).map(relationName) ?? [],
    };
  }, [project, preview, action, t]);

  useEffect(() => {
    confirm.current?.focus();
  }, []);

  const title = action
    ? question(t, action.title)
    : t('Delete {things}?', { things: deletedParts(t, preview, freeShapes, shown) });
  const several = action !== undefined && action.leaving.length > 1;
  const cascadedCount = preview.cascaded.length;
  const stepCount = preview.brokenSteps.length;

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h2 id={titleId}>{title}</h2>
        {action && !several && (
          <p>{t('This takes away the relation "{name}".', { name: shown.leaving[0] ?? '' })}</p>
        )}
        {action && several && (
          <section>
            <p>
              {t('This takes away the {count} relations that place the shapes where they are:', {
                count: action.leaving.length,
              })}
            </p>
            <List items={shown.leaving} total={action.leaving.length} />
          </section>
        )}
        {action && action.withData.length > 0 && <p>{dataNote(t, action, shown.withData[0])}</p>}
        {cascadedCount > 0 && (
          <section>
            <p>
              {t(action ? (several ? CASCADED_ON_THEM : CASCADED_ON_IT) : CASCADED_ON_DELETED, {
                count: cascadedCount,
              })}
            </p>
            <List items={shown.cascaded} total={cascadedCount} />
          </section>
        )}
        {stepCount > 0 && (
          <section>
            <p>{t(BROKEN_STEPS, { count: stepCount })}</p>
            <List items={shown.steps} total={stepCount} />
          </section>
        )}
        {!action && preview.positions.length > 0 && (
          <p>{t(POSITIONS, { count: preview.positions.length })}</p>
        )}
        {!action && held && (
          <HeldContents project={project} held={held} several={shownElements(held, preview)} />
        )}
        <p className="dialog-note">{t('You can undo this.')}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            {t('Cancel')}
          </button>
          <button
            ref={confirm}
            type="button"
            className={action ? 'dialog-confirm' : 'danger'}
            onClick={onConfirm}
          >
            {action ? t(action.confirmLabel) : t('Delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A question the canvas asks in English, such as `Put "API" inside "Billing"?`: the label of the
 * change it asks about, as the core and the history write it, then a question mark.
 */
function question(t: Translator, english: string): string {
  return english.endsWith('?')
    ? t('{question}?', { question: t.message(english.slice(0, -1)) })
    : t.message(english);
}

/** What a deletion deletes, as its title names it: one element by name, or how many of each. */
function deletedParts(
  t: Translator,
  preview: DeletePreview,
  freeShapes: number,
  shown: { elementName: (id: Id) => string; asked: number },
): string {
  const { elements } = preview;
  const { asked } = shown;
  return [
    elements.length === 1 && asked === 0 && freeShapes === 0
      ? `"${shown.elementName(elements[0] as Id)}"`
      : '',
    elements.length > 1 || (elements.length === 1 && (asked > 0 || freeShapes > 0))
      ? t(ELEMENTS, { count: elements.length })
      : '',
    asked > 0 ? t(RELATIONS, { count: asked }) : '',
    freeShapes > 0 ? t(FREE_SHAPES, { count: freeShapes }) : '',
  ]
    .filter((part) => part !== '')
    .join(', ');
}

/** Says that relations that go have a name, a description or attributes of their own. */
function dataNote(
  t: Translator,
  action: DeleteDialogAction,
  firstName: string | undefined,
): string {
  if (action.withData.length > 1) {
    return t(
      '{count} of them have a name, a description or attributes of their own, which go with them.',
      { count: action.withData.length },
    );
  }
  return action.leaving.length === 1
    ? t('It has a name, a description or attributes of its own, which go with it.')
    : t('"{name}" has a name, a description or attributes of its own, which go with it.', {
        name: firstName ?? '',
      });
}

/** Whether the elements asked to be deleted, the held ones they take aside, are more than one. */
function shownElements(held: HeldChoice, preview: DeletePreview): boolean {
  const taken = new Set(
    held.contents
      .filter((each) => (each.group === 'rows' ? held.rows : held.others))
      .map((each) => each.element),
  );
  return preview.elements.filter((id) => !taken.has(id)).length > 1;
}

/** The boxes that add what the deleted elements hold to the deletion, with what each takes. */
function HeldContents({
  project,
  held,
  several,
}: {
  project: ProjectSnapshot;
  held: HeldChoice;
  several: boolean;
}) {
  const t = useT();
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  const rows = held.contents.filter((each) => each.group === 'rows');
  const others = held.contents.filter((each) => each.group === 'other');
  const rowsId = useId();
  const othersId = useId();
  return (
    <>
      {rows.length > 0 && (
        <p className="dialog-choice">
          <input
            id={rowsId}
            type="checkbox"
            checked={held.rows}
            onChange={(event) => held.onChange('rows', event.target.checked)}
          />
          <label htmlFor={rowsId}>
            {t(several ? HELD_ROWS_OF_SEVERAL : HELD_ROWS_OF_ONE, { count: rows.length })}
          </label>
        </p>
      )}
      {others.length > 0 && (
        <section>
          <p className="dialog-choice">
            <input
              id={othersId}
              type="checkbox"
              checked={held.others}
              onChange={(event) => held.onChange('other', event.target.checked)}
            />
            <label htmlFor={othersId}>
              {t(several ? HELD_OTHERS_OF_SEVERAL : HELD_OTHERS_OF_ONE, { count: others.length })}
            </label>
          </p>
          <List
            items={others
              .slice(0, LISTED)
              .map((each) =>
                each.elsewhere === undefined
                  ? nameOf(each.element)
                  : t('{name} is also in {container}', {
                      name: nameOf(each.element),
                      container: nameOf(each.elsewhere),
                    }),
              )}
            total={others.length}
          />
        </section>
      )}
    </>
  );
}

/** The first items of a list, and how many more there are. */
function List({ items, total }: { items: readonly string[]; total: number }) {
  const t = useT();
  return (
    <ul>
      {items.slice(0, LISTED).map((item, index) => (
        <li key={index}>{item}</li>
      ))}
      {total > LISTED && <li>{t('and {count} more', { count: total - LISTED })}</li>}
    </ul>
  );
}
