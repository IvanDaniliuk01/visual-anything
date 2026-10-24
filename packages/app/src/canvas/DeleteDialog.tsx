import { modelIndexOf, type DeletePreview, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useId, useMemo, useRef } from 'react';
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
  onConfirm: () => void;
  onCancel: () => void;
}

const LISTED = 8;

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
  onConfirm,
  onCancel,
}: DeleteDialogProps) {
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
        index.element(each)?.name ?? index.relation(each)?.name ?? 'a relation';
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
  }, [project, preview, action]);

  useEffect(() => {
    confirm.current?.focus();
  }, []);

  const title = action ? action.title : `Delete ${deletedParts(preview, freeShapes, shown)}?`;
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
        {action && !several && <p>This takes away the relation &quot;{shown.leaving[0]}&quot;.</p>}
        {action && several && (
          <section>
            <p>
              This takes away the {action.leaving.length} relations that place the shapes where they
              are:
            </p>
            <List items={shown.leaving} total={action.leaving.length} />
          </section>
        )}
        {action && action.withData.length > 0 && <p>{dataNote(action, shown.withData[0])}</p>}
        {cascadedCount > 0 && (
          <section>
            <p>
              {action
                ? `${cascadedCount === 1 ? 'This relation ends' : `These ${cascadedCount} relations end`} on ${several ? 'them' : 'it'}, so ${cascadedCount === 1 ? 'it goes' : 'they go'} too:`
                : `${cascadedCount === 1 ? 'This relation ends' : `These ${cascadedCount} relations end`} on what you delete, so ${cascadedCount === 1 ? 'it goes' : 'they go'} too:`}
            </p>
            <List items={shown.cascaded} total={cascadedCount} />
          </section>
        )}
        {stepCount > 0 && (
          <section>
            <p>
              {stepCount === 1
                ? 'This scenario step uses'
                : `These ${stepCount} scenario steps use`}{' '}
              a relation that goes.{' '}
              {stepCount === 1
                ? 'It becomes a broken step and is kept'
                : 'They become broken steps and are kept'}
              , so you can fix {stepCount === 1 ? 'it' : 'them'}:
            </p>
            <List items={shown.steps} total={stepCount} />
          </section>
        )}
        {!action && preview.positions.length > 0 && (
          <p>
            {count(preview.positions.length, 'stored position')} in views{' '}
            {preview.positions.length === 1 ? 'goes' : 'go'} with the shapes.
          </p>
        )}
        <p className="dialog-note">You can undo this.</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={confirm}
            type="button"
            className={action ? 'dialog-confirm' : 'danger'}
            onClick={onConfirm}
          >
            {action ? action.confirmLabel : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** What a deletion deletes, as its title names it: one element by name, or how many of each. */
function deletedParts(
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
      ? count(elements.length, 'element')
      : '',
    asked > 0 ? count(asked, 'relation') : '',
    freeShapes > 0 ? count(freeShapes, 'free shape') : '',
  ]
    .filter((part) => part !== '')
    .join(', ');
}

/** Says that relations that go have a name, a description or attributes of their own. */
function dataNote(action: DeleteDialogAction, firstName: string | undefined): string {
  if (action.withData.length > 1) {
    return `${action.withData.length} of them have a name, a description or attributes of their own, which go with them.`;
  }
  const subject = action.leaving.length === 1 ? 'It' : `"${firstName ?? ''}"`;
  return `${subject} has a name, a description or attributes of its own, which go with it.`;
}

/** The first items of a list, and how many more there are. */
function List({ items, total }: { items: readonly string[]; total: number }) {
  return (
    <ul>
      {items.slice(0, LISTED).map((item, index) => (
        <li key={index}>{item}</li>
      ))}
      {total > LISTED && <li>and {total - LISTED} more</li>}
    </ul>
  );
}

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}
