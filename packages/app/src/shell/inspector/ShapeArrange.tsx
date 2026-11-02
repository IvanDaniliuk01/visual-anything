import type { Command } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId, useMemo, useState } from 'react';
import {
  arrangeCommand,
  arrangedShapes,
  arrangeValues,
  turnRefusalOf,
  type ArrangeChange,
  type Shared,
} from '../../canvas/arrange';
import { indexScene } from '../../canvas/hit';
import { keepsProportions } from '../../canvas/resize';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { Field } from '../definitions/Field';
import { useSender } from '../definitions/useSender';
import { InlineProblem, TextControl } from './controls';
import { numberProblem } from './styleTraits';

/** The ranges the Arrange tab's numbers take, as positions store them (ADR 0088). */
const SIZE = { least: 1, most: 10_000_000 };
const PLACE = { least: -10_000_000, most: 10_000_000 };
const DEGREES = { least: -3600, most: 3600 };

/**
 * The selected shapes' size, place, turn, mirroring and pinning in the open view (ADR 0088, A6.3): a
 * width and a height, with "Keep proportions", a left and a top, from the container or the canvas,
 * a turn in degrees and "Turn 90°", mirroring along either axis, and whether layout leaves them where
 * they are. Each change is one action on every selected shape, pinning what it sets; a value they do
 * not share shows as mixed. Turning and mirroring are off, saying why, for shapes never turned.
 */
export function ShapeArrange({ elements }: { elements: readonly Id[] }) {
  const t = useT();
  const { viewId, scene, send } = useEditor();
  const refusalId = useId();
  const problemId = useId();
  const sender = useSender();
  const [keep, setKeep] = useState<boolean>();
  // The same index the canvas draws from, since `indexScene` keeps one for each scene.
  const indexed = useMemo(() => {
    try {
      return scene ? indexScene(scene) : undefined;
    } catch {
      return undefined;
    }
  }, [scene]);
  if (!indexed || viewId === undefined) return null;
  const shapes = arrangedShapes(indexed.byElement, elements);
  if (shapes.length === 0) return null;
  const values = arrangeValues(shapes);
  const disabled = send === undefined;
  const refusal = turnRefusalOf(shapes);
  const keepProportions = keep ?? shapes.every(keepsProportions);
  const apply = (sendCommand: (command: Command) => Promise<boolean>, change: ArrangeChange) => {
    const command = arrangeCommand(viewId, shapes, change);
    return command ? sendCommand(command) : Promise.resolve(true);
  };
  const numberField = (
    label: string,
    value: Shared<number>,
    range: { least: number; most: number },
    change: (value: number) => ArrangeChange,
    unturnable = false,
  ) => (
    <Field label={label}>
      {({ id, describedBy, send: sendCommand }) => (
        <TextControl
          id={id}
          inputType="number"
          value={value.mixed ? '' : String(value.value)}
          placeholder={value.mixed ? t('Mixed') : undefined}
          disabled={disabled || (unturnable && refusal !== undefined)}
          describedBy={
            unturnable && refusal !== undefined
              ? [describedBy, refusalId].filter(Boolean).join(' ')
              : describedBy
          }
          problemOf={(text) => numberProblem(text, range)}
          same={(a, b) => a.trim() !== '' && b.trim() !== '' && Number(a) === Number(b)}
          onCommit={(text) => apply(sendCommand, change(Number(text)))}
        />
      )}
    </Field>
  );

  return (
    <>
      <div role="group" aria-label={t('Size and place')} className="format-arrange-group">
        {numberField(t('Width'), values.width, SIZE, (value) => ({
          kind: 'width',
          value,
          keepProportions,
        }))}
        {numberField(t('Height'), values.height, SIZE, (value) => ({
          kind: 'height',
          value,
          keepProportions,
        }))}
        <div className="inspector-control inspector-check">
          <label>
            <input
              type="checkbox"
              checked={keepProportions}
              disabled={disabled}
              onChange={(event) => setKeep(event.target.checked)}
            />{' '}
            {t('Keep proportions')}
          </label>
        </div>
        {numberField(t('From the left'), values.x, PLACE, (value) => ({ kind: 'x', value }))}
        {numberField(t('From the top'), values.y, PLACE, (value) => ({ kind: 'y', value }))}
      </div>
      <div role="group" aria-label={t('Turn and mirror')} className="format-arrange-group">
        {numberField(
          t('Turn (degrees)'),
          values.rotation,
          DEGREES,
          (value) => ({ kind: 'rotation', value }),
          true,
        )}
        <div className="inspector-buttons">
          <button
            type="button"
            className="inspector-action"
            disabled={disabled || refusal !== undefined}
            aria-describedby={refusal === undefined ? undefined : refusalId}
            onClick={() => void apply(sender.send, { kind: 'turn' })}
          >
            {t('Turn 90°')}
          </button>
          {(['horizontal', 'vertical'] as const).map((axis) => {
            const on = values[axis];
            return (
              <button
                key={axis}
                type="button"
                className="inspector-action"
                aria-pressed={on.mixed ? 'mixed' : on.value}
                disabled={disabled || refusal !== undefined}
                aria-describedby={refusal === undefined ? undefined : refusalId}
                onClick={() =>
                  void apply(sender.send, { kind: 'flip', axis, on: on.mixed ? true : !on.value })
                }
              >
                {axis === 'horizontal' ? t('Mirror horizontally') : t('Mirror vertically')}
              </button>
            );
          })}
        </div>
        {refusal !== undefined && (
          <p id={refusalId} className="inspector-notes">
            {t(refusal)}
          </p>
        )}
      </div>
      <div role="group" aria-label={t('Pinned')} className="format-arrange-group">
        <div className="inspector-buttons">
          <button
            type="button"
            className="inspector-action"
            aria-pressed={values.pinned.mixed ? 'mixed' : values.pinned.value}
            disabled={disabled}
            onClick={() =>
              void apply(sender.send, {
                kind: 'pinned',
                value: values.pinned.mixed ? true : !values.pinned.value,
              })
            }
          >
            {t('Pinned')}
          </button>
        </div>
        <p className="inspector-notes">
          {values.pinned.mixed
            ? t('Some are pinned: layout leaves those where they are.')
            : values.pinned.value
              ? t('Pinned: layout leaves it where it is.')
              : t('Not pinned: layout may move it.')}
        </p>
      </div>
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
    </>
  );
}
