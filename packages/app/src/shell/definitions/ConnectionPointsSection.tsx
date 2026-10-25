import {
  componentOrEssence,
  traitSources,
  type AppearanceChanges,
  type Command,
} from '@visual-anything/core';
import type { ConnectionPoint, Id } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { t as translateNow, useT } from '../../i18n';
import { readNumber } from '../inspector/attributes';
import { SelectControl, TextControl } from '../inspector/controls';
import { TraitRow, type TraitControl } from './TraitRow';
import { sourceText } from './traits';

type Side = ConnectionPoint['side'];

const SIDES: readonly { side: Side; name: string }[] = [
  { side: 'top', name: 'Top' },
  { side: 'right', name: 'Right' },
  { side: 'bottom', name: 'Bottom' },
  { side: 'left', name: 'Left' },
];

/** How many connection points an appearance has at most. */
const MOST_POINTS = 32;

function isSide(value: string): value is Side {
  return SIDES.some((each) => each.side === value);
}

/** A name no connection point in the list has yet: "point 1", "point 2"…, in the language read in. */
function freeName(points: readonly ConnectionPoint[]): string {
  for (let count = points.length + 1; ; count++) {
    const name = translateNow('point {count}', { count });
    if (!points.some((point) => point.name === name)) return name;
  }
}

/** Why a typed position along a side cannot be used; `undefined` when it can. */
function atProblem(text: string): string | undefined {
  const reading = readNumber(text);
  if (!reading.ok) return translateNow('Enter a number from 0 to 1.');
  return reading.value < 0 || reading.value > 1
    ? translateNow('Enter a number from 0 to 1.')
    : undefined;
}

interface ConnectionPointsSectionProps {
  id: Id;
  readOnly: boolean;
  update: (changes: AppearanceChanges) => Command;
}

/**
 * Where relations attach to a component's shapes: named places, each on one side, from 0 at its left
 * or top end to 1 at its right or bottom end, with a small sketch of the four sides. Each change sends
 * the whole list, so an inherited list becomes the component's own with the change made.
 */
export function ConnectionPointsSection({ id, readOnly, update }: ConnectionPointsSectionProps) {
  const t = useT();
  const { definitions } = useEditor();
  const headingId = useId();
  const points = componentOrEssence(definitions, id).appearance.connectionPoints;
  const source = traitSources(definitions, id).traits.connectionPoints;
  const own = source === id;

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Connection points')}</h4>
      <ul className="definition-traits">
        <TraitRow
          label={t('Where relations attach')}
          group
          source={sourceText(definitions, 'component', id, source)}
          own={own}
          readOnly={readOnly}
          inherit={() => update({ connectionPoints: null })}
        >
          {(control) => (
            <Points points={points} readOnly={readOnly} control={control} update={update} />
          )}
        </TraitRow>
      </ul>
    </section>
  );
}

interface PointsProps {
  points: readonly ConnectionPoint[];
  readOnly: boolean;
  control: TraitControl;
  update: (changes: AppearanceChanges) => Command;
}

function Points({ points, readOnly, control, update }: PointsProps) {
  const t = useT();
  const write = (next: ConnectionPoint[]) => control.send(update({ connectionPoints: next }));
  const changed = (at: number, point: ConnectionPoint) =>
    write(points.map((each, place) => (place === at ? point : each)));
  return (
    <>
      <Sketch points={points} />
      {points.length === 0 ? (
        <p className="panel-empty">{t('None: relations attach anywhere on the border.')}</p>
      ) : (
        <ul className="definition-list">
          {points.map((point, at) => (
            <PointRow
              key={`${at}-${point.name}`}
              point={point}
              readOnly={readOnly}
              onChange={(next) => changed(at, next)}
              onRemove={() => void write(points.filter((_, place) => place !== at))}
            />
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="definition-actions">
          <button
            type="button"
            className="inspector-action"
            disabled={points.length >= MOST_POINTS}
            onClick={() =>
              void write([...points, { name: freeName(points), side: 'right', at: 0.5 }])
            }
          >
            {t('Add a connection point')}
          </button>
          {points.length > 0 && (
            <button type="button" className="inspector-action" onClick={() => void write([])}>
              {t('Attach anywhere on the border')}
            </button>
          )}
        </div>
      )}
    </>
  );
}

interface PointRowProps {
  point: ConnectionPoint;
  readOnly: boolean;
  onChange: (point: ConnectionPoint) => Promise<boolean>;
  onRemove: () => void;
}

/** One connection point: its name, side and place along it. */
function PointRow({ point, readOnly, onChange, onRemove }: PointRowProps) {
  const t = useT();
  const nameId = useId();
  const sideId = useId();
  const atId = useId();
  return (
    <li className="definition-point">
      <div className="inspector-control">
        <label htmlFor={nameId}>{t('Name')}</label>
        <TextControl
          id={nameId}
          value={point.name}
          disabled={readOnly}
          onCommit={async (text) => {
            if (text.trim() !== '') await onChange({ ...point, name: text.trim() });
          }}
        />
      </div>
      <div className="inspector-control">
        <label htmlFor={sideId}>{t('Side')}</label>
        <SelectControl
          id={sideId}
          value={point.side}
          disabled={readOnly}
          onCommit={async (side) => {
            if (isSide(side)) await onChange({ ...point, side });
          }}
        >
          {SIDES.map(({ side, name }) => (
            <option key={side} value={side}>
              {t(name)}
            </option>
          ))}
        </SelectControl>
      </div>
      <div className="inspector-control">
        <label htmlFor={atId}>{t('Along the side, from 0 to 1')}</label>
        <TextControl
          id={atId}
          value={String(point.at)}
          inputType="number"
          disabled={readOnly}
          problemOf={atProblem}
          onCommit={async (text) => {
            const reading = readNumber(text);
            if (reading.ok) await onChange({ ...point, at: reading.value });
          }}
        />
      </div>
      {!readOnly && (
        <button
          type="button"
          className="inspector-action"
          aria-label={t('Remove the connection point “{name}”', { name: point.name })}
          onClick={onRemove}
        >
          {t('Remove')}
        </button>
      )}
    </li>
  );
}

/** Where a point sits on a square sketch of the shape, in percent of its sides. */
function placeOf(point: ConnectionPoint): { left: string; top: string } {
  const along = `${Math.min(1, Math.max(0, point.at)) * 100}%`;
  switch (point.side) {
    case 'top':
      return { left: along, top: '0%' };
    case 'bottom':
      return { left: along, top: '100%' };
    case 'left':
      return { left: '0%', top: along };
    case 'right':
      return { left: '100%', top: along };
  }
}

/** The four sides of a shape with its connection points marked on them; the list says the same in words. */
function Sketch({ points }: { points: readonly ConnectionPoint[] }) {
  return (
    <div className="definition-sketch" aria-hidden="true">
      {points.map((point, at) => (
        <span
          key={`${at}-${point.name}`}
          className="definition-sketch-point"
          style={placeOf(point)}
          title={point.name}
        />
      ))}
    </div>
  );
}
