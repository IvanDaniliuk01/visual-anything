/**
 * The inspector's explorable shape (ADR 0107, A10.3): a loose explorable on the canvas, drawing only.
 * Its name, which screen readers and the outline say; the explorable it shows, among those the
 * project's packages define; the element it is bound to, among those the view shows, whose data it
 * reads; and Explore, which makes it live in place on the canvas.
 */
import { explorablesIn, modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import type { ExplorableShape, Id } from '@visual-anything/schema';
import { useId, useMemo } from 'react';
import { askExplore } from '../../canvas/explorables/adding';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { TextControl } from './controls';

/** The most characters an explorable shape's name takes. */
const MOST_NAME = 200;

export function ExplorableShapeInspector({
  shape,
  viewId,
  project,
  shown,
}: {
  shape: ExplorableShape;
  viewId: Id;
  project: ProjectSnapshot;
  /** The elements the view shows, which a shape may be bound to. */
  shown: readonly Id[];
}) {
  const t = useT();
  const { send } = useEditor();
  const nameId = useId();
  const explorableId = useId();
  const elementId = useId();
  const disabled = send === undefined;
  const change = (changes: Record<string, unknown>) =>
    send?.({ type: 'update-free-shape', view: viewId, id: shape.id, changes });
  const explorables = useMemo(
    () =>
      [...explorablesIn(project).explorables.values()]
        .map((each) => ({ id: each.definition.id, name: each.definition.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- what packages define follows the packages
    [project.packages],
  );
  const elements = useMemo(() => {
    const index = modelIndexOf(project);
    const ids = new Set(shown);
    if (shape.element !== undefined) ids.add(shape.element);
    return [...ids]
      .map((id) => ({ id, name: index.element(id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [project, shown, shape.element]);
  const defined = explorables.find((each) => each.id === shape.explorable);
  return (
    <>
      <h3 className="inspector-title">{shape.name ?? defined?.name ?? shape.explorable}</h3>
      <p className="inspector-notes">
        {t(
          'An explorable shape: drawing only, not part of the model. It shows its explorable’s still, and runs live in place when explored.',
        )}
      </p>
      <div className="inspector-control">
        <label htmlFor={nameId}>{t('Name')}</label>
        <TextControl
          id={nameId}
          value={shape.name ?? ''}
          placeholder={defined?.name ?? ''}
          disabled={disabled}
          onCommit={async (text) => {
            const name = text.replace(/\s+/g, ' ').trim().slice(0, MOST_NAME);
            await change({ name: name === '' ? null : name });
          }}
        />
      </div>
      <div className="inspector-control">
        <label htmlFor={explorableId}>{t('Explorable')}</label>
        <select
          id={explorableId}
          value={shape.explorable}
          disabled={disabled}
          onChange={(event) => void change({ explorable: event.target.value })}
        >
          {!defined && <option value={shape.explorable}>{shape.explorable}</option>}
          {explorables.map((each) => (
            <option key={each.id} value={each.id}>
              {each.name}
            </option>
          ))}
        </select>
      </div>
      <div className="inspector-control">
        <label htmlFor={elementId}>{t('Bound to')}</label>
        <select
          id={elementId}
          value={shape.element ?? ''}
          disabled={disabled}
          onChange={(event) =>
            void change({ element: event.target.value === '' ? null : event.target.value })
          }
        >
          <option value="">{t('No element')}</option>
          {elements.map((each) => (
            <option key={each.id} value={each.id}>
              {each.name}
            </option>
          ))}
        </select>
      </div>
      <p className="inspector-notes">
        {t('It reads the data of the element it is bound to, as an element that shows it would.')}
      </p>
      <div className="components-actions">
        <button
          type="button"
          className="components-action"
          title={t('Make it live in place on the canvas (double-click)')}
          onClick={() =>
            askExplore({
              spot: shape.id,
              explorable: shape.explorable,
              ...(shape.element === undefined ? {} : { element: shape.element }),
            })
          }
        >
          {t('Explore')}
        </button>
      </div>
    </>
  );
}
