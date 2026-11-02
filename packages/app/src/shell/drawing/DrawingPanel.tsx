/**
 * The Drawing panel (A5.4, ADR 0086): a section of the inspector, shown with the open view's when
 * nothing is selected, that edits the drawing defaults of the project or of the open view alone. It
 * offers the preset, then each group's values, each saying whether it comes from the preset, the
 * project or the view, with a reset for a value, for a group and for every value. Each change is one
 * `set-drawing-defaults` command, so one action the person can undo, that writes the layer's whole
 * drawing; the canvas draws the result as the project changes.
 */
import {
  DRAWING_GROUPS,
  DRAWING_PRESET_IDS,
  DRAWING_VALUES,
  type DrawingGroup,
  type DrawingValueRule,
  type ResolvedDrawing,
} from '@visual-anything/core';
import type { DrawingDefaults, DrawingPreset } from '@visual-anything/schema';
import { useId, useRef, useState } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { ChevronRightIcon, ResetIcon } from '../icons';
import { CheckboxControl, SelectControl, TextControl } from '../inspector/controls';
import { perform } from '../inspector/send';
import {
  countSetIn,
  drawingCommand,
  layerOf,
  layersOf,
  presetSourceOf,
  projectPresetOf,
  shownDrawing,
  sourceOf,
  viewChanges,
  viewHasOwnPreset,
  withPreset,
  withValue,
  withoutGroup,
  withoutValue,
  type DrawingLayers,
  type DrawingScope,
  type DrawingSource,
  type DrawingValue,
} from './drawingEdits';
import { CHOICE_NAMES, GROUP_NAMES, PRESET_NAMES, PRESET_NOTES, VALUE_NAMES } from './drawingNames';
import './drawing.css';

/** The value of the view's preset select that leaves the preset to the project. */
const AS_THE_PROJECT = '';

/** What the panel's parts share: what is shown, where it comes from, and how a change is written. */
interface Editing {
  layers: DrawingLayers;
  scope: DrawingScope;
  shown: ResolvedDrawing;
  editable: boolean;
  /** The id the panel's controls start theirs with. */
  idPrefix: string;
  viewName: string | undefined;
  /** Writes the scope's layer whole, from the layer as it is, or as last sent. */
  write: (change: (layer: DrawingDefaults | undefined) => DrawingDefaults | null) => Promise<void>;
}

export function DrawingPanel() {
  const t = useT();
  const { project, viewId, send } = useEditor();
  const headingId = useId();
  const idPrefix = useId();
  const [chosenScope, setChosenScope] = useState<DrawingScope>('project');
  // The layer last sent, until the project shows it, so that a change made meanwhile builds on it.
  const sent = useRef<{
    scope: DrawingScope;
    from: DrawingDefaults | undefined;
    next: DrawingDefaults | null;
  }>(undefined);

  const layers = layersOf(project, viewId);
  const view = project.views.find((each) => each.id === layers.viewId);
  const scope: DrawingScope = view === undefined ? 'project' : chosenScope;
  const layer = layerOf(layers, scope);
  const shown = shownDrawing(layers, scope);
  const editable = send !== undefined;

  const write: Editing['write'] = async (change) => {
    const current = layerOf(layers, scope);
    const last = sent.current;
    const base =
      last?.scope === scope && last.from === current ? (last.next ?? undefined) : current;
    const next = change(base);
    const command = drawingCommand(
      scope === 'project' ? { ...layers, project: base } : { ...layers, view: base },
      scope,
      next,
    );
    if (!command) return;
    sent.current = { scope, from: current, next };
    try {
      await perform(send, command);
    } finally {
      if (sent.current?.next === next) sent.current = undefined;
    }
  };

  const editing: Editing = {
    layers,
    scope,
    shown,
    editable,
    idPrefix,
    viewName: view?.name,
    write,
  };

  return (
    <section className="panel-section drawing-panel" aria-labelledby={headingId}>
      <h3 id={headingId}>{t('Drawing')}</h3>
      <p className="inspector-notes">
        {t(
          'How the canvas, the read-only page and the exports draw what no appearance sets. Each change is one action you can undo.',
        )}
      </p>
      <fieldset className="drawing-scope">
        <legend>{t('Change for')}</legend>
        <label className="drawing-scope-choice">
          <input
            type="radio"
            name={`${idPrefix}-scope`}
            checked={scope === 'project'}
            onChange={() => setChosenScope('project')}
          />
          {t('This project')}
        </label>
        <label className="drawing-scope-choice">
          <input
            type="radio"
            name={`${idPrefix}-scope`}
            checked={scope === 'view'}
            disabled={view === undefined}
            onChange={() => setChosenScope('view')}
          />
          {t('This view only')}
        </label>
      </fieldset>
      {view === undefined && (
        <p className="inspector-notes">{t('Open a view to change it for that view alone.')}</p>
      )}
      <PresetControl editing={editing} />
      <p className="inspector-notes drawing-state">
        {stateNote(t, scope, layers, view?.name, layer)}
      </p>
      {DRAWING_GROUPS.map((group) => (
        <GroupSection key={group} editing={editing} group={group} />
      ))}
      <button
        type="button"
        className="inspector-action drawing-reset-all"
        disabled={!editable || layer === undefined}
        onClick={() => void write(() => null)}
      >
        {scope === 'project'
          ? t('Reset every value of the project')
          : t('Reset every value of this view')}
      </button>
    </section>
  );
}

type T = ReturnType<typeof useT>;

/** What the layer edited sets, in a sentence: what to do when it sets nothing. */
function stateNote(
  t: T,
  scope: DrawingScope,
  layers: DrawingLayers,
  viewName: string | undefined,
  layer: DrawingDefaults | undefined,
): string {
  const preset = t(PRESET_NAMES[projectPresetOf(layers)]);
  if (scope === 'project') {
    if (viewHasOwnPreset(layers) && viewName !== undefined) {
      return t('“{view}” has a preset of its own, so the project’s values do not reach it.', {
        view: viewName,
      });
    }
    return layer === undefined
      ? t(
          'The project sets nothing of its own: it draws with {preset} as built in. Change any value below.',
          { preset },
        )
      : t(
          'A value the project sets shows “From the project”; reset it to go back to the preset’s.',
        );
  }
  return layer === undefined
    ? t(
        'This view sets nothing of its own: it draws as the project does. A value changed here applies to this view alone.',
      )
    : t('A value this view sets shows “This view’s”; reset it to go back to the project’s.');
}

/** What a source tag says. */
function sourceText(t: T, source: DrawingSource, preset: DrawingPreset): string {
  if (source === 'view') return t('This view’s');
  if (source === 'project') return t('From the project');
  return t('From {preset}', { preset: t(PRESET_NAMES[preset]) });
}

/** The preset the scope's values change, with where it comes from and what it is. */
function PresetControl({ editing }: { editing: Editing }) {
  const t = useT();
  const { layers, scope, shown, editable, idPrefix, write } = editing;
  const id = `${idPrefix}-preset`;
  const noteId = `${id}-note`;
  const source = presetSourceOf(layers, scope);
  const projectPreset = projectPresetOf(layers);
  const value = scope === 'project' ? projectPreset : (layers.view?.preset ?? AS_THE_PROJECT);

  return (
    <div className="inspector-control drawing-value">
      <div className="drawing-value-head">
        <label htmlFor={id}>{t('Preset')}</label>
        <SourceTag text={sourceText(t, source, shown.preset)} source={source} />
      </div>
      <SelectControl
        id={id}
        value={value}
        disabled={!editable}
        describedBy={noteId}
        onCommit={(chosen) => {
          const preset = (DRAWING_PRESET_IDS as readonly string[]).includes(chosen)
            ? (chosen as DrawingPreset)
            : undefined;
          if (preset === undefined && scope === 'project') return Promise.resolve();
          return write((layer) => withPreset(layer, preset));
        }}
      >
        {scope === 'view' && (
          <option value={AS_THE_PROJECT}>
            {t('As the project ({preset})', { preset: t(PRESET_NAMES[projectPreset]) })}
          </option>
        )}
        {DRAWING_PRESET_IDS.map((preset) => (
          <option key={preset} value={preset}>
            {t(PRESET_NAMES[preset])}
          </option>
        ))}
      </SelectControl>
      <p id={noteId} className="inspector-notes">
        {t(PRESET_NOTES[shown.preset])}
        {scope === 'view' && ' '}
        {scope === 'view' &&
          t('A view with a preset of its own starts from it, without the project’s values.')}
      </p>
    </div>
  );
}

function SourceTag({ text, source }: { text: string; source: DrawingSource }) {
  return (
    <span className="drawing-source" data-source={source}>
      {text}
    </span>
  );
}

/** A group of values, as a disclosure that says how many of them the layer sets. */
function GroupSection({ editing, group }: { editing: Editing; group: DrawingGroup }) {
  const t = useT();
  const { layers, scope, editable, write } = editing;
  const count = countSetIn(layerOf(layers, scope), group);
  const name = t(GROUP_NAMES[group]);

  return (
    <details className="drawing-group">
      <summary>
        <ChevronRightIcon className="drawing-group-mark" size={14} />
        <span>{name}</span>
        {count > 0 && (
          <span className="drawing-group-count">
            {t({ one: '{count} changed', other: '{count} changed' }, { count })}
          </span>
        )}
      </summary>
      {Object.entries(DRAWING_VALUES[group]).map(([value, rule]) => (
        <ValueControl key={value} editing={editing} group={group} name={value} rule={rule} />
      ))}
      <button
        type="button"
        className="inspector-action"
        disabled={!editable || count === 0}
        onClick={() => void write((layer) => withoutGroup(layer, group))}
      >
        {t('Reset every value of {group}', { group: name })}
      </button>
    </details>
  );
}

interface ValueControlProps {
  editing: Editing;
  group: DrawingGroup;
  name: string;
  rule: DrawingValueRule;
}

/** One value: its control, where it comes from, and its reset when the layer edited sets it. */
function ValueControl({ editing, group, name, rule }: ValueControlProps) {
  const t = useT();
  const { layers, scope, shown, editable, idPrefix, viewName, write } = editing;
  const id = `${idPrefix}-${group}-${name}`;
  const noteId = `${id}-note`;
  const named = VALUE_NAMES[group][name] ?? { name };
  const label = t(named.name);
  const current = (shown[group] as unknown as Record<string, DrawingValue>)[name] as DrawingValue;
  const source = sourceOf(layers, scope, group, name);
  const resettable = source === scope;
  const set = (value: DrawingValue) => write((layer) => withValue(layer, group, name, value));
  const reset = () => write((layer) => withoutValue(layer, group, name));
  const notes = [
    ...(named.note === undefined ? [] : [t(named.note)]),
    ...(rule.kind === 'number'
      ? [t('From {least} to {most}.', { least: rule.least, most: rule.most })]
      : []),
    ...(scope === 'project' && viewName !== undefined && viewChanges(layers, group, name)
      ? [t('“{view}” sets its own.', { view: viewName })]
      : []),
  ];
  const boolean = rule.kind === 'choice' && typeof rule.choices[0] === 'boolean';

  let control;
  if (boolean) {
    control = (
      <span className="drawing-check">
        <CheckboxControl
          id={id}
          checked={current === true}
          disabled={!editable}
          describedBy={notes.length > 0 ? noteId : undefined}
          onCommit={(checked) => set(checked)}
        />
        <label htmlFor={id}>{label}</label>
      </span>
    );
  } else if (rule.kind === 'choice') {
    control = (
      <SelectControl
        id={id}
        value={String(current)}
        disabled={!editable}
        describedBy={notes.length > 0 ? noteId : undefined}
        onCommit={(text) => {
          const chosen = rule.choices.find((each) => String(each) === text);
          return chosen === undefined ? Promise.resolve() : set(chosen);
        }}
      >
        {rule.choices.map((choice) => (
          <option key={String(choice)} value={String(choice)}>
            {t(CHOICE_NAMES[group]?.[name]?.[String(choice)] ?? String(choice))}
          </option>
        ))}
      </SelectControl>
    );
  } else {
    control = (
      <TextControl
        id={id}
        inputType="number"
        value={String(current)}
        disabled={!editable}
        describedBy={noteId}
        same={(a, b) => Number(a) === Number(b) && a.trim() !== ''}
        problemOf={(text) => {
          if (text.trim() === '') return undefined;
          const number = Number(text);
          return Number.isFinite(number) && number >= rule.least && number <= rule.most
            ? undefined
            : t('A number from {least} to {most}.', { least: rule.least, most: rule.most });
        }}
        onCommit={(text) => (text.trim() === '' ? reset() : set(Number(text)))}
      />
    );
  }

  return (
    <div className="inspector-control drawing-value">
      <div className="drawing-value-head">
        {!boolean && <label htmlFor={id}>{label}</label>}
        {boolean && control}
        <SourceTag text={sourceText(t, source, shown.preset)} source={source} />
        {resettable && (
          <button
            type="button"
            className="drawing-reset"
            disabled={!editable}
            aria-label={t('Reset “{value}”', { value: label })}
            title={t('Reset “{value}”', { value: label })}
            onClick={() => void reset()}
          >
            <ResetIcon size={14} />
          </button>
        )}
      </div>
      {!boolean && control}
      {notes.length > 0 && (
        <p id={noteId} className="inspector-notes">
          {notes.join(' ')}
        </p>
      )}
    </div>
  );
}
