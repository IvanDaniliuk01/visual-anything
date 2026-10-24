import type { DeletePreview, ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useId, useRef } from 'react';

interface DeleteDialogProps {
  project: ProjectSnapshot;
  preview: DeletePreview;
  /** Free shapes deleted along with the rest. */
  freeShapes: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const LISTED = 8;

/** Shows what a deletion removes and breaks before anything is deleted. */
export function DeleteDialog({
  project,
  preview,
  freeShapes,
  onConfirm,
  onCancel,
}: DeleteDialogProps) {
  const titleId = useId();
  const confirm = useRef<HTMLButtonElement>(null);
  const elementName = (id: Id) =>
    project.model.elements.find((element) => element.id === id)?.name ?? id;
  const relationName = (id: Id) => {
    const relation = project.model.relations.find((each) => each.id === id);
    if (!relation) return id;
    const end = (each: Id) =>
      elementName(each) === each
        ? (project.model.relations.find((r) => r.id === each)?.name ?? 'a relation')
        : elementName(each);
    return relation.name ?? `${end(relation.from)} → ${end(relation.to)}`;
  };
  const asked = preview.relations.filter((id) => !preview.cascaded.includes(id));
  const parts = [
    preview.elements.length === 1 && asked.length === 0 && freeShapes === 0
      ? `"${elementName(preview.elements[0] as Id)}"`
      : '',
    preview.elements.length > 1 ||
    (preview.elements.length === 1 && (asked.length > 0 || freeShapes > 0))
      ? count(preview.elements.length, 'element')
      : '',
    asked.length > 0 ? count(asked.length, 'relation') : '',
    freeShapes > 0 ? count(freeShapes, 'free shape') : '',
  ].filter((part) => part !== '');
  const steps = preview.brokenSteps.map(({ scenario, step }) => {
    const found = project.scenarios.find((each) => each.id === scenario);
    const description = found?.steps.find((each) => each.id === step)?.description;
    return `${found?.name ?? scenario}: ${description || step}`;
  });

  useEffect(() => {
    confirm.current?.focus();
  }, []);

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h2 id={titleId}>Delete {parts.join(', ')}?</h2>
        {preview.cascaded.length > 0 && (
          <section>
            <p>
              {preview.cascaded.length === 1
                ? 'This relation ends'
                : `These ${preview.cascaded.length} relations end`}{' '}
              on what you delete, so {preview.cascaded.length === 1 ? 'it goes' : 'they go'} too:
            </p>
            <List items={preview.cascaded.map(relationName)} />
          </section>
        )}
        {steps.length > 0 && (
          <section>
            <p>
              {steps.length === 1
                ? 'This scenario step uses'
                : `These ${steps.length} scenario steps use`}{' '}
              a relation that goes.{' '}
              {steps.length === 1
                ? 'It becomes a broken step and is kept'
                : 'They become broken steps and are kept'}
              , so you can fix {steps.length === 1 ? 'it' : 'them'}:
            </p>
            <List items={steps} />
          </section>
        )}
        {preview.positions.length > 0 && (
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
          <button ref={confirm} type="button" className="danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul>
      {items.slice(0, LISTED).map((item, index) => (
        <li key={index}>{item}</li>
      ))}
      {items.length > LISTED && <li>and {items.length - LISTED} more</li>}
    </ul>
  );
}

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}
