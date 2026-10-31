/**
 * The open view's overlays in the inspector (ADR 0055): what each one changes by which attribute,
 * turning one off and on, moving, removing and editing them, and adding one. Each change is one
 * command, of the one overlay it changes, so that the person and Claude never undo each other's;
 * the canvas's legend shows what they mean.
 */
import {
  OVERLAY_CHANNELS,
  attributeValue,
  legendOf,
  type Command,
  type NewOverlay,
  type OverlayChannel,
} from '@visual-anything/core';
import type { Id, JsonValue, Overlay, ViewFile } from '@visual-anything/schema';
import { useId, useMemo, useState } from 'react';
import { legendSubtitle } from '../../canvas/overlays/legendText';
import { relationAttribute } from '../../canvas/overlays/decorate';
import { useEditor } from '../../editor/EditorContext';
import { useT, type Translator } from '../../i18n';
import './overlays.css';
import { paletteColor } from './overlayPalette';

/** What an overlay maps its attribute by. */
type MappingKind = Overlay['mapping']['kind'];

/** One value, or one stop, as the form holds it: what it maps, to what, and the legend's words. */
interface Row {
  key: number;
  at: string;
  to: string;
  label: string;
}

/** An overlay as the form edits it, every field as text until it is saved. */
interface Draft {
  /** The overlay it changes; absent for a new one. */
  editing?: Id;
  name: string;
  of: Overlay['of'];
  attribute: string;
  channel: OverlayChannel;
  kind: MappingKind;
  rows: Row[];
  otherwise: { on: boolean; to: string };
}

/** The most values "Add each value it has" adds. */
const MOST_VALUES = 24;

let rowKeys = 0;
const nextKey = () => (rowKeys += 1);

/** What a new value or stop of a channel maps to at first. */
function startOf(channel: OverlayChannel, at = 0): string {
  switch (channel) {
    case 'fill':
    case 'stroke':
      return paletteColor(at);
    case 'size':
      return '1';
    case 'opacity':
      return '0.5';
    case 'badge':
      return '!';
  }
}

/** The mapping kinds a channel takes. */
function kindsOf(channel: OverlayChannel): MappingKind[] {
  if (channel === 'badge') return ['discrete', 'passthrough'];
  if (channel === 'size' || channel === 'opacity') return ['discrete', 'continuous'];
  return ['discrete', 'continuous', 'passthrough'];
}

/** The form's draft of an overlay the view has. */
function draftOf(overlay: Overlay): Draft {
  const mapping = overlay.mapping as {
    kind: MappingKind;
    cases?: Record<string, unknown>[];
    stops?: Record<string, unknown>[];
    otherwise?: string | number;
  };
  const key = valueKey(overlay.channel);
  const rows: Row[] =
    mapping.kind === 'discrete'
      ? (mapping.cases ?? []).map((each) => ({
          key: nextKey(),
          at: String(each.value),
          to: String(each[key]),
          label: typeof each.label === 'string' ? each.label : '',
        }))
      : mapping.kind === 'continuous'
        ? (mapping.stops ?? []).map((each) => ({
            key: nextKey(),
            at: String(each.at),
            to: String(each[key]),
            label: typeof each.label === 'string' ? each.label : '',
          }))
        : [];
  return {
    editing: overlay.id,
    name: overlay.name ?? '',
    of: overlay.of,
    attribute: overlay.attribute,
    channel: overlay.channel,
    kind: mapping.kind,
    rows,
    otherwise:
      mapping.otherwise === undefined
        ? { on: false, to: startOf(overlay.channel) }
        : { on: true, to: String(mapping.otherwise) },
  };
}

/** What a channel's values are held under in a case or a stop. */
function valueKey(channel: OverlayChannel): 'color' | 'size' | 'text' | 'opacity' {
  return channel === 'fill' || channel === 'stroke'
    ? 'color'
    : channel === 'badge'
      ? 'text'
      : channel;
}

/** A channel's value as the command takes it: a number for sizes and opacities, else the text. */
function valueOf(channel: OverlayChannel, text: string): string | number {
  return channel === 'size' || channel === 'opacity' ? Number(text) : text;
}

/** The overlay a draft makes, as `add-overlay` and `update-overlay` take it. */
function overlayOf(draft: Draft): NewOverlay {
  const key = valueKey(draft.channel);
  const label = (row: Row) => (row.label.trim() === '' ? {} : { label: row.label });
  const mapping =
    draft.kind === 'passthrough'
      ? { kind: 'passthrough' }
      : draft.kind === 'continuous'
        ? {
            kind: 'continuous',
            stops: draft.rows.map((row) => ({
              at: Number(row.at),
              [key]: valueOf(draft.channel, row.to),
              ...label(row),
            })),
          }
        : {
            kind: 'discrete',
            cases: draft.rows.map((row) => ({
              value: row.at,
              [key]: valueOf(draft.channel, row.to),
              ...label(row),
            })),
            ...(draft.otherwise.on
              ? { otherwise: valueOf(draft.channel, draft.otherwise.to) }
              : {}),
          };
  return {
    ...(draft.name.trim() === '' ? {} : { name: draft.name }),
    of: draft.of,
    attribute: draft.attribute.trim(),
    channel: draft.channel,
    mapping,
  } as unknown as NewOverlay;
}

/** The names of the attributes things of a kind have: those their definitions define and their own. */
function attributesOf(
  project: ReturnType<typeof useEditor>['project'],
  definitions: ReturnType<typeof useEditor>['definitions'],
  of: Overlay['of'],
): string[] {
  const names = new Set<string>();
  if (of === 'elements') {
    for (const id of definitions.components.keys()) {
      for (const attribute of definitions.component(id)?.attributes ?? [])
        names.add(attribute.name);
    }
    for (const element of project.model.elements) {
      for (const name of Object.keys(element.attributes ?? {})) names.add(name);
    }
  } else {
    for (const id of definitions.relationTypes.keys()) {
      for (const attribute of definitions.relationType(id)?.attributes ?? [])
        names.add(attribute.name);
    }
    for (const relation of project.model.relations) {
      for (const name of Object.keys(relation.attributes ?? {})) names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** The values things of a kind have for an attribute, as text, each once, at most a few dozen. */
function valuesOf(
  project: ReturnType<typeof useEditor>['project'],
  definitions: ReturnType<typeof useEditor>['definitions'],
  of: Overlay['of'],
  attribute: string,
): string[] {
  const found = new Set<string>();
  const add = (value: JsonValue | undefined) => {
    if (value === undefined || value === null || value === '') return;
    found.add(typeof value === 'string' ? value : JSON.stringify(value));
  };
  if (of === 'elements') {
    for (const element of project.model.elements) {
      add(attributeValue(element, attribute, definitions));
      if (found.size >= MOST_VALUES) break;
    }
  } else {
    for (const relation of project.model.relations) {
      add(relationAttribute(relation, attribute, definitions));
      if (found.size >= MOST_VALUES) break;
    }
  }
  return [...found];
}

/** The words of a channel, in the editor's list of them. */
function channelName(t: Translator, channel: OverlayChannel, of: Overlay['of']): string {
  switch (channel) {
    case 'fill':
      return t('Fill');
    case 'stroke':
      return of === 'relations' ? t('Line color') : t('Stroke');
    case 'size':
      return of === 'relations' ? t('Line width') : t('Size');
    case 'badge':
      return of === 'relations' ? t('Label') : t('Badge');
    case 'opacity':
      return t('Opacity');
  }
}

function kindName(t: Translator, kind: MappingKind): string {
  switch (kind) {
    case 'discrete':
      return t('Value by value');
    case 'continuous':
      return t('Along a range of numbers');
    case 'passthrough':
      return t('The value itself');
  }
}

/** The open view's overlays, with what changes them. */
export function OverlaysSection({ view }: { view: ViewFile }) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const heading = useId();
  const [draft, setDraft] = useState<Draft>();
  const editable = send !== undefined;
  const overlays = view.overlays ?? [];
  // What each overlay changes by which attribute, turned off or not.
  const legend = useMemo(
    () =>
      legendOf(
        { ...view, overlays: (view.overlays ?? []).map((each) => ({ ...each, off: false })) },
        definitions,
        'light',
      ),
    [view, definitions],
  );

  const perform = async (command: Command): Promise<boolean> => {
    if (!send) return false;
    try {
      return (await send(command)).ok;
    } catch {
      return false;
    }
  };

  const start = () =>
    setDraft({
      name: '',
      of: 'elements',
      attribute: attributesOf(project, definitions, 'elements')[0] ?? '',
      channel: 'fill',
      kind: 'discrete',
      rows: [],
      otherwise: { on: false, to: '#9CA3AF' },
    });

  const save = async (made: Draft) => {
    const overlay = overlayOf(made);
    const command: Command =
      made.editing === undefined
        ? { type: 'add-overlay', view: view.id, overlay }
        : {
            type: 'update-overlay',
            view: view.id,
            overlay: made.editing,
            changes: {
              name: made.name.trim() === '' ? null : made.name,
              of: overlay.of,
              attribute: overlay.attribute,
              channel: overlay.channel,
              mapping: overlay.mapping,
            },
          };
    if (await perform(command)) setDraft(undefined);
  };

  return (
    <section className="inspector-section inspector-overlays" aria-labelledby={heading}>
      <h4 id={heading}>{t('Overlays')}</h4>
      {overlays.length === 0 && (
        <p className="inspector-notes">
          {t(
            'No overlay changes how this view’s shapes look by their attributes. Add one with Add an overlay.',
          )}
        </p>
      )}
      <ul className="inspector-overlay-list">
        {overlays.map((overlay, at) => {
          const part = legend.overlays.find((each) => each.id === overlay.id);
          const title = overlay.name ?? overlay.attribute;
          return (
            <li key={overlay.id} className="inspector-overlay">
              <label className="inspector-overlay-head">
                <input
                  type="checkbox"
                  checked={overlay.off !== true}
                  disabled={!editable}
                  onChange={() =>
                    void perform({
                      type: 'update-overlay',
                      view: view.id,
                      overlay: overlay.id,
                      changes: { off: overlay.off !== true },
                    })
                  }
                />
                <span className="inspector-overlay-title">{title}</span>
              </label>
              {part && <p className="inspector-notes">{legendSubtitle(t, part)}</p>}
              <div className="inspector-overlay-actions" role="group" aria-label={title}>
                <button
                  type="button"
                  className="inspector-action"
                  disabled={!editable || at === 0}
                  onClick={() =>
                    void perform({
                      type: 'move-overlay',
                      view: view.id,
                      overlay: overlay.id,
                      ...(overlays[at - 1] ? { before: (overlays[at - 1] as Overlay).id } : {}),
                    })
                  }
                >
                  {t('Move up')}
                </button>
                <button
                  type="button"
                  className="inspector-action"
                  disabled={!editable || at === overlays.length - 1}
                  onClick={() => {
                    const after = overlays[at + 2];
                    void perform({
                      type: 'move-overlay',
                      view: view.id,
                      overlay: overlay.id,
                      ...(after ? { before: after.id } : {}),
                    });
                  }}
                >
                  {t('Move down')}
                </button>
                <button
                  type="button"
                  className="inspector-action"
                  disabled={!editable}
                  onClick={() => setDraft(draftOf(overlay))}
                >
                  {t('Edit')}
                </button>
                <button
                  type="button"
                  className="inspector-action"
                  disabled={!editable}
                  onClick={() =>
                    void perform({ type: 'remove-overlays', view: view.id, overlays: [overlay.id] })
                  }
                >
                  {t('Remove')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {overlays.length > 1 && (
        <p className="inspector-notes">
          {t('Where two overlays set the same thing, the one higher in the list wins.')}
        </p>
      )}
      {draft === undefined ? (
        <button type="button" className="inspector-action" disabled={!editable} onClick={start}>
          {t('Add an overlay')}
        </button>
      ) : (
        <OverlayForm
          draft={draft}
          onChange={setDraft}
          onSave={(made) => void save(made)}
          onCancel={() => setDraft(undefined)}
          attributes={attributesOf(project, definitions, draft.of)}
          values={() => valuesOf(project, definitions, draft.of, draft.attribute.trim())}
        />
      )}
    </section>
  );
}

interface FormProps {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
  attributes: readonly string[];
  /** The values things have for the draft's attribute now. */
  values: () => string[];
}

/** The form that adds an overlay or changes one. */
function OverlayForm({ draft, onChange, onSave, onCancel, attributes, values }: FormProps) {
  const t = useT();
  const id = useId();
  const list = `${id}-attributes`;
  const set = (changes: Partial<Draft>) => onChange({ ...draft, ...changes });
  const kinds = kindsOf(draft.channel);
  const ranged = draft.kind === 'continuous';
  const setRow = (key: number, changes: Partial<Row>) =>
    set({ rows: draft.rows.map((row) => (row.key === key ? { ...row, ...changes } : row)) });
  const input = (value: string, label: string, change: (value: string) => void) =>
    draft.channel === 'fill' || draft.channel === 'stroke' ? (
      <input
        type="color"
        value={value.toLowerCase()}
        aria-label={label}
        onChange={(event) => change(event.target.value)}
      />
    ) : draft.channel === 'badge' ? (
      <input
        type="text"
        value={value}
        maxLength={12}
        aria-label={label}
        onChange={(event) => change(event.target.value)}
      />
    ) : (
      <input
        type="number"
        value={value}
        step={0.1}
        min={draft.channel === 'size' ? 0.5 : 0.1}
        max={draft.channel === 'size' ? 2 : 1}
        aria-label={label}
        onChange={(event) => change(event.target.value)}
      />
    );
  const what =
    draft.channel === 'fill' || draft.channel === 'stroke'
      ? t('Color')
      : draft.channel === 'badge'
        ? t('Text')
        : draft.channel === 'size'
          ? t('Factor')
          : t('Opacity');
  return (
    <form
      className="inspector-overlay-form"
      aria-label={draft.editing === undefined ? t('New overlay') : t('Edit the overlay')}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <div className="inspector-control">
        <label htmlFor={`${id}-name`}>{t('Name in the legend')}</label>
        <input
          id={`${id}-name`}
          type="text"
          value={draft.name}
          maxLength={64}
          onChange={(event) => set({ name: event.target.value })}
        />
      </div>
      <div className="inspector-control">
        <label htmlFor={`${id}-of`}>{t('Reads the attributes of')}</label>
        <select
          id={`${id}-of`}
          value={draft.of}
          onChange={(event) => {
            const of = event.target.value as Overlay['of'];
            set({
              of,
              ...(of === 'relations' && draft.channel === 'fill' ? { channel: 'stroke' } : {}),
            });
          }}
        >
          <option value="elements">{t('Elements')}</option>
          <option value="relations">{t('Relations')}</option>
        </select>
      </div>
      <div className="inspector-control">
        <label htmlFor={`${id}-attribute`}>{t('Attribute')}</label>
        <input
          id={`${id}-attribute`}
          type="text"
          list={list}
          value={draft.attribute}
          onChange={(event) => set({ attribute: event.target.value })}
        />
        <datalist id={list}>
          {attributes.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>
      <div className="inspector-control">
        <label htmlFor={`${id}-channel`}>{t('What it changes')}</label>
        <select
          id={`${id}-channel`}
          value={draft.channel}
          onChange={(event) => {
            const channel = event.target.value as OverlayChannel;
            const kind = kindsOf(channel).includes(draft.kind) ? draft.kind : 'discrete';
            set({
              channel,
              kind,
              rows: draft.rows.map((row, at) => ({ ...row, to: startOf(channel, at) })),
              otherwise: { ...draft.otherwise, to: startOf(channel, draft.rows.length) },
            });
          }}
        >
          {OVERLAY_CHANNELS.filter(
            (channel) => !(draft.of === 'relations' && channel === 'fill'),
          ).map((channel) => (
            <option key={channel} value={channel}>
              {channelName(t, channel, draft.of)}
            </option>
          ))}
        </select>
      </div>
      <div className="inspector-control">
        <label htmlFor={`${id}-kind`}>{t('Maps')}</label>
        <select
          id={`${id}-kind`}
          value={draft.kind}
          onChange={(event) => set({ kind: event.target.value as MappingKind, rows: [] })}
        >
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {kindName(t, kind)}
            </option>
          ))}
        </select>
      </div>
      {draft.kind !== 'passthrough' && (
        <fieldset className="inspector-overlay-rows">
          <legend>{ranged ? t('Stops') : t('Values')}</legend>
          {draft.rows.map((row) => (
            <div key={row.key} className="inspector-overlay-row">
              <input
                type={ranged ? 'number' : 'text'}
                value={row.at}
                aria-label={ranged ? t('At') : t('Value')}
                onChange={(event) => setRow(row.key, { at: event.target.value })}
              />
              {input(row.to, what, (value) => setRow(row.key, { to: value }))}
              <input
                type="text"
                value={row.label}
                maxLength={64}
                placeholder={t('Label in the legend')}
                aria-label={t('Label in the legend')}
                onChange={(event) => setRow(row.key, { label: event.target.value })}
              />
              <button
                type="button"
                className="inspector-action"
                onClick={() => set({ rows: draft.rows.filter((each) => each.key !== row.key) })}
              >
                {t('Remove')}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="inspector-action"
            onClick={() =>
              set({
                rows: [
                  ...draft.rows,
                  {
                    key: nextKey(),
                    at: ranged ? String(draft.rows.length * 10) : '',
                    to: startOf(draft.channel, draft.rows.length),
                    label: '',
                  },
                ],
              })
            }
          >
            {ranged ? t('Add a stop') : t('Add a value')}
          </button>
          {!ranged && (
            <button
              type="button"
              className="inspector-action"
              onClick={() => {
                const taken = new Set(draft.rows.map((row) => row.at.trim().toLowerCase()));
                const added = values()
                  .filter((value) => !taken.has(value.trim().toLowerCase()))
                  .map((value, at) => ({
                    key: nextKey(),
                    at: value,
                    to: startOf(draft.channel, draft.rows.length + at),
                    label: '',
                  }));
                set({ rows: [...draft.rows, ...added] });
              }}
            >
              {t('Add each value it has')}
            </button>
          )}
          {!ranged && (
            <div className="inspector-overlay-row">
              <label>
                <input
                  type="checkbox"
                  checked={draft.otherwise.on}
                  onChange={(event) =>
                    set({ otherwise: { ...draft.otherwise, on: event.target.checked } })
                  }
                />{' '}
                {t('Any other value')}
              </label>
              {draft.otherwise.on &&
                input(draft.otherwise.to, what, (value) =>
                  set({ otherwise: { ...draft.otherwise, to: value } }),
                )}
            </div>
          )}
        </fieldset>
      )}
      <div className="inspector-overlay-actions">
        <button type="submit" className="inspector-action">
          {draft.editing === undefined ? t('Add the overlay') : t('Save the overlay')}
        </button>
        <button type="button" className="inspector-action" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}
