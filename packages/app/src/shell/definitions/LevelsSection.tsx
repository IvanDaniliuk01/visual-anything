import {
  LEVEL_PARTS,
  MAX_LEVELS,
  MAX_LEVEL_SCALE,
  componentOrEssence,
  editableAppearanceOf,
  sortedLevels,
  type Command,
} from '@visual-anything/core';
import type { Id, LevelOfDetail, LevelPart } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { t as translateNow, useT, type Translator } from '../../i18n';
import { readNumber } from '../inspector/attributes';
import { originText, savedIn } from '../inspector/colors';
import { CheckboxControl, TextControl } from '../inspector/controls';
import { isBuiltInDefinition } from './commands';
import { TraitRow, type TraitControl } from './TraitRow';
import { nameOf } from './traits';

/** What each part a level shows is called, in the order the editor offers them. */
const PART_NAMES: Readonly<Record<LevelPart, string>> = {
  silhouette: 'A silhouette only',
  name: 'Name',
  detail: 'Detail',
  contents: 'Contents or rows',
  image: 'Image',
};

/** The command that gives a component levels, or takes them back, at the level the project changes. */
function levelsCommand(component: Id, levels: LevelOfDetail[] | null): Command {
  return {
    type: 'set-component-appearance',
    component,
    appearanceTraits: {
      levels: levels === null ? null : [...levels].sort((a, b) => a.from - b.from),
    },
  };
}

/** The command that sets, or takes back, the scale a component's collapsed containers expand from. */
function expandCommand(component: Id, expandFrom: number | null): Command {
  return { type: 'set-component-appearance', component, appearanceTraits: { expandFrom } };
}

/** A scale as a zoom, as the canvas's toolbar says it: "45%" ("45 %" in Spanish). */
function zoomText(t: Translator, scale: number): string {
  return new Intl.NumberFormat(t.language, { style: 'percent', maximumFractionDigits: 2 }).format(
    scale,
  );
}

/** A scale as the number of percent a field holds. */
function percentOf(scale: number): string {
  return String(Math.round(scale * 100 * 100) / 100);
}

/** A typed number of percent as a scale. */
function scaleOf(percent: number): number {
  return Number((percent / 100).toFixed(4));
}

/** Why a typed zoom for a level cannot be used; `undefined` when it can. */
function fromProblem(text: string): string | undefined {
  const reading = readNumber(text);
  return reading.ok && reading.value >= 0 && reading.value <= MAX_LEVEL_SCALE * 100
    ? undefined
    : translateNow('Enter a zoom from 0% to 800%.');
}

/** Why a typed zoom to expand from cannot be used; `undefined` when it can, empty included. */
function expandProblem(text: string): string | undefined {
  if (text.trim() === '') return undefined;
  const reading = readNumber(text);
  return reading.ok && reading.value > 0 && reading.value <= MAX_LEVEL_SCALE * 100
    ? undefined
    : translateNow('Enter a zoom above 0%, at most 800%.');
}

/**
 * The level a new one adds after the others: at twice the zoom of the highest, at most 800%, or
 * halfway below it when it is there already, showing what the highest shows and the detail too; the
 * first shows names from 45%, where the canvas starts writing them.
 */
function newLevel(levels: readonly LevelOfDetail[]): LevelOfDetail {
  const highest = levels.at(-1);
  if (highest === undefined) return { from: 0.45, shows: ['name'] };
  let from = Math.min(MAX_LEVEL_SCALE, Math.max(highest.from * 2, highest.from + 0.25));
  if (levels.some((level) => level.from === from)) {
    const below = levels.at(-2)?.from ?? 0;
    from = (below + highest.from) / 2;
  }
  from = Math.round(from * 10_000) / 10_000;
  const shown = new Set<LevelPart>(highest.shows.filter((part) => part !== 'silhouette'));
  shown.add('name').add('detail');
  return { from, shows: LEVEL_PARTS.filter((part) => shown.has(part)) };
}

/**
 * What a level shows once a part is checked or unchecked: a silhouette excludes every other part,
 * any other part takes a silhouette's place, and a level left showing nothing shows its silhouette.
 */
function partsWith(shows: readonly LevelPart[], part: LevelPart, on: boolean): LevelPart[] {
  if (part === 'silhouette') return on ? ['silhouette'] : ['name'];
  const next = new Set<LevelPart>(shows.filter((each) => each !== 'silhouette'));
  if (on) next.add(part);
  else next.delete(part);
  return next.size === 0 ? ['silhouette'] : LEVEL_PARTS.filter((each) => next.has(each));
}

interface LevelsSectionProps {
  id: Id;
}

/**
 * Levels of detail (ADR 0055) in the component editor: what the component's shapes show as the
 * canvas zooms, level by level from the zoom each starts at, and the zoom from which a collapsed
 * container of it expands. Both change at the level the project can change, as colors do
 * (`set-component-appearance`): a built-in component's go into the project file. Each change is one
 * command, which sends the whole list, so that an inherited list becomes the component's own with the
 * change made; each shows where it comes from.
 */
export function LevelsSection({ id }: LevelsSectionProps) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const headingId = useId();
  const readOnly = send === undefined;
  const component = componentOrEssence(definitions, id);
  const levels = sortedLevels(component.appearance.levels ?? []);
  const expandFrom = component.appearance.expandFrom;
  // Whether the appearance stored where the project can change it, its package or the project
  // file, sets a trait.
  const stored = editableAppearanceOf(project, 'component', id)?.appearance;
  const sets = (trait: 'levels' | 'expandFrom') => stored !== undefined && trait in stored;
  const source = (trait: 'levels' | 'expandFrom') =>
    originText(component.origins[trait], (each) => nameOf(definitions, 'component', each), id);
  const note = isBuiltInDefinition(definitions, 'component', id)
    ? savedIn(project.packages, component.package)
    : undefined;

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Levels of detail')}</h4>
      <p className="inspector-notes">
        {t(
          'From each level’s zoom up, its shapes show what the level lists; below the first, a silhouette. A level is left only 10% below its zoom, so nothing flickers.',
        )}
      </p>
      <ul className="definition-traits">
        <TraitRow
          label={t('What its shapes show as you zoom')}
          group
          source={source('levels')}
          own={sets('levels')}
          readOnly={readOnly}
          inherit={() => levelsCommand(id, null)}
          note={note}
        >
          {(control) => <Levels levels={levels} readOnly={readOnly} control={control} id={id} />}
        </TraitRow>
        <TraitRow
          label={t('Expand a collapsed container from a zoom of (%)')}
          source={source('expandFrom')}
          own={sets('expandFrom')}
          readOnly={readOnly}
          inherit={() => expandCommand(id, null)}
          note={t(
            'Zooming into a collapsed container of it shows it expanded from this zoom, and collapses it again below 90% of it; nothing about it is saved. Empty, it stays collapsed.',
          )}
        >
          {({ id: controlId, describedBy, send: sendCommand }) => (
            <TextControl
              id={controlId}
              value={expandFrom === undefined ? '' : percentOf(expandFrom)}
              inputType="number"
              disabled={readOnly}
              describedBy={describedBy}
              problemOf={expandProblem}
              onCommit={async (text) => {
                if (text.trim() === '') {
                  if (sets('expandFrom')) await sendCommand(expandCommand(id, null));
                  return;
                }
                const reading = readNumber(text);
                if (reading.ok) await sendCommand(expandCommand(id, scaleOf(reading.value)));
              }}
            />
          )}
        </TraitRow>
      </ul>
    </section>
  );
}

interface LevelsProps {
  id: Id;
  levels: readonly LevelOfDetail[];
  readOnly: boolean;
  control: TraitControl;
}

/** The levels, each with its zoom and what it shows, and the ways to add one or follow the canvas. */
function Levels({ id, levels, readOnly, control }: LevelsProps) {
  const t = useT();
  const write = (next: LevelOfDetail[]) => control.send(levelsCommand(id, next));
  const changed = (at: number, level: LevelOfDetail) =>
    write(levels.map((each, place) => (place === at ? level : each)));
  return (
    <>
      {levels.length === 0 ? (
        <p className="panel-empty">
          {t('None: its shapes follow the canvas’s defaults, names from 45% and details from 90%.')}
        </p>
      ) : (
        <ol className="definition-list">
          {levels.map((level, at) => (
            <LevelRow
              key={level.from}
              level={level}
              readOnly={readOnly}
              onChange={(next) => changed(at, next)}
              onRemove={() => void write(levels.filter((_, place) => place !== at))}
            />
          ))}
        </ol>
      )}
      {!readOnly && (
        <div className="definition-actions">
          <button
            type="button"
            className="inspector-action"
            disabled={levels.length >= MAX_LEVELS}
            onClick={() => void write([...levels, newLevel(levels)])}
          >
            {t('Add a level')}
          </button>
          {levels.length > 0 && (
            <button type="button" className="inspector-action" onClick={() => void write([])}>
              {t('Follow the canvas’s defaults')}
            </button>
          )}
        </div>
      )}
    </>
  );
}

interface LevelRowProps {
  level: LevelOfDetail;
  readOnly: boolean;
  onChange: (level: LevelOfDetail) => Promise<boolean>;
  onRemove: () => void;
}

/** One level: the zoom it starts at, and what it shows from there, part by part. */
function LevelRow({ level, readOnly, onChange, onRemove }: LevelRowProps) {
  const t = useT();
  const fromId = useId();
  const partsId = useId();
  const zoom = zoomText(t, level.from);
  return (
    <li className="definition-point">
      <div role="group" aria-label={t('Level from {zoom}', { zoom })}>
        <div className="inspector-control">
          <label htmlFor={fromId}>{t('From a zoom of (%)')}</label>
          <TextControl
            id={fromId}
            value={percentOf(level.from)}
            inputType="number"
            disabled={readOnly}
            problemOf={fromProblem}
            onCommit={async (text) => {
              const reading = readNumber(text);
              if (reading.ok) await onChange({ ...level, from: scaleOf(reading.value) });
            }}
          />
        </div>
        <div role="group" aria-labelledby={partsId} className="definition-level-parts">
          <span id={partsId} className="definition-level-parts-label">
            {t('What it shows')}
          </span>
          {LEVEL_PARTS.map((part) => (
            <PartBox
              key={part}
              part={part}
              checked={level.shows.includes(part)}
              readOnly={readOnly}
              onCommit={(on) => onChange({ ...level, shows: partsWith(level.shows, part, on) })}
            />
          ))}
        </div>
        {!readOnly && (
          <button
            type="button"
            className="inspector-action"
            aria-label={t('Remove the level from {zoom}', { zoom })}
            onClick={onRemove}
          >
            {t('Remove')}
          </button>
        )}
      </div>
    </li>
  );
}

/** One part a level shows, as a checkbox with its name. */
function PartBox({
  part,
  checked,
  readOnly,
  onCommit,
}: {
  part: LevelPart;
  checked: boolean;
  readOnly: boolean;
  onCommit: (on: boolean) => Promise<boolean>;
}) {
  const t = useT();
  const boxId = useId();
  return (
    <span className="definition-level-part">
      <CheckboxControl id={boxId} checked={checked} disabled={readOnly} onCommit={onCommit} />
      <label htmlFor={boxId}>{t(PART_NAMES[part])}</label>
    </span>
  );
}
