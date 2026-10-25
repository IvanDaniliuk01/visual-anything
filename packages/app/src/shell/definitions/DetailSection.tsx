import {
  componentOrEssence,
  relationTypeOrRelatesTo,
  traitSources,
  type AppearanceChanges,
  type Command,
} from '@visual-anything/core';
import type { Badge, Id } from '@visual-anything/schema';
import { useId, useState, type FormEvent } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { CheckboxControl, InlineProblem } from '../inspector/controls';
import { TraitRow, type TraitControl } from './TraitRow';
import { sourceText } from './traits';
import { useSender } from './useSender';

/** How many attributes a detail writes, and how many badges it has, at most. */
const MOST_WRITTEN = 8;
const MOST_BADGES = 8;
/** How long a badge's text is at most. */
const BADGE_LENGTH = 4;

interface DetailSectionProps {
  id: Id;
  readOnly: boolean;
  /** The command that changes the component's appearance, trait by trait. */
  update: (changes: AppearanceChanges) => Command;
}

/**
 * What the shapes of a component's elements write under their name, each part inherited on its own:
 * whether the component's name, which attributes' values in which order, and which badges.
 */
export function DetailSection({ id, readOnly, update }: DetailSectionProps) {
  const { definitions } = useEditor();
  const headingId = useId();
  const component = componentOrEssence(definitions, id);
  const { detail } = component.appearance;
  const sources = traitSources(definitions, id).traits;
  const row = (path: 'detail.componentName' | 'detail.attributes' | 'detail.badges') => ({
    source: sourceText(definitions, 'component', id, sources[path]),
    own: sources[path] === id,
    readOnly,
  });

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>Detail</h4>
      <ul className="definition-traits">
        <TraitRow
          label="Write the component’s name"
          {...row('detail.componentName')}
          inherit={() => update({ detail: { componentName: null } })}
        >
          {({ id: controlId, describedBy, send }) => (
            <CheckboxControl
              id={controlId}
              checked={detail.componentName}
              disabled={readOnly}
              describedBy={describedBy}
              onCommit={(checked) => send(update({ detail: { componentName: checked } }))}
            />
          )}
        </TraitRow>
        <TraitRow
          label="Attributes written"
          group
          {...row('detail.attributes')}
          inherit={() => update({ detail: { attributes: null } })}
        >
          {(control) => (
            <WrittenAttributes
              written={detail.attributes}
              names={component.attributes.map((attribute) => attribute.name)}
              readOnly={readOnly}
              control={control}
              update={update}
            />
          )}
        </TraitRow>
        <TraitRow
          label="Badges"
          group
          {...row('detail.badges')}
          inherit={() => update({ detail: { badges: null } })}
        >
          {(control) => (
            <Badges
              id={id}
              badges={detail.badges}
              readOnly={readOnly}
              control={control}
              update={update}
            />
          )}
        </TraitRow>
      </ul>
    </section>
  );
}

interface WrittenAttributesProps {
  /** The attributes written, in order. */
  written: readonly string[];
  /** Every attribute the component has. */
  names: readonly string[];
  readOnly: boolean;
  control: TraitControl;
  update: (changes: AppearanceChanges) => Command;
}

/** An ordered checklist of the component's attributes: those written first, in their order. */
function WrittenAttributes({ written, names, readOnly, control, update }: WrittenAttributesProps) {
  const listed = [...written, ...names.filter((name) => !written.includes(name))];
  const write = (attributes: string[]) => control.send(update({ detail: { attributes } }));
  const move = (name: string, by: -1 | 1) => {
    const at = written.indexOf(name);
    const next = [...written];
    next.splice(at, 1);
    next.splice(at + by, 0, name);
    void write(next);
  };
  if (listed.length === 0) return <p className="panel-empty">It has no attributes to write.</p>;
  return (
    <ul className="definition-checklist">
      {listed.map((name) => (
        <WrittenAttribute
          key={name}
          name={name}
          at={written.indexOf(name)}
          count={written.length}
          known={names.includes(name)}
          readOnly={readOnly}
          onToggle={(checked) =>
            write(checked ? [...written, name] : written.filter((each) => each !== name))
          }
          onMove={(by) => move(name, by)}
        />
      ))}
    </ul>
  );
}

interface WrittenAttributeProps {
  name: string;
  /** Where it is among those written; -1 when it is not written. */
  at: number;
  count: number;
  /** Whether the component has it; one it does not have writes nothing. */
  known: boolean;
  readOnly: boolean;
  onToggle: (checked: boolean) => Promise<unknown>;
  onMove: (by: -1 | 1) => void;
}

function WrittenAttribute({
  name,
  at,
  count,
  known,
  readOnly,
  onToggle,
  onMove,
}: WrittenAttributeProps) {
  const id = useId();
  const checked = at !== -1;
  return (
    <li className="definition-checklist-item">
      <CheckboxControl
        id={id}
        checked={checked}
        disabled={readOnly || (!checked && count >= MOST_WRITTEN)}
        onCommit={onToggle}
      />
      <label htmlFor={id}>
        {name}
        {!known && <span className="definition-unknown"> (it has no such attribute)</span>}
      </label>
      {checked && !readOnly && (
        <span className="definition-actions">
          <button
            type="button"
            className="inspector-action"
            aria-label={`Write “${name}” earlier`}
            disabled={at === 0}
            onClick={() => onMove(-1)}
          >
            Up
          </button>
          <button
            type="button"
            className="inspector-action"
            aria-label={`Write “${name}” later`}
            disabled={at === count - 1}
            onClick={() => onMove(1)}
          >
            Down
          </button>
        </span>
      )}
    </li>
  );
}

/** A badge's condition, in words. */
function conditionText(badge: Badge, relationTypeName: (id: Id) => string): string {
  return badge.when === 'attribute'
    ? `while “${badge.attribute}” is true`
    : `while it is the from end of “${relationTypeName(badge.relationType)}”`;
}

interface BadgesProps {
  id: Id;
  badges: readonly Badge[];
  readOnly: boolean;
  control: TraitControl;
  update: (changes: AppearanceChanges) => Command;
}

/** The badges a component's shapes write, each with its condition, and a form that adds one. */
function Badges({ id, badges, readOnly, control, update }: BadgesProps) {
  const { definitions } = useEditor();
  const relationTypeName = (type: Id) => relationTypeOrRelatesTo(definitions, type).name;
  const write = (next: Badge[]) => control.send(update({ detail: { badges: next } }));
  return (
    <>
      {badges.length === 0 ? (
        <p className="panel-empty">No badges.</p>
      ) : (
        <ul className="definition-list">
          {badges.map((badge, at) => (
            <li key={`${at}-${badge.text}`} className="definition-list-item">
              <span>
                <span className="definition-badge">{badge.text}</span>{' '}
                {conditionText(badge, relationTypeName)}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  className="inspector-action"
                  aria-label={`Remove the badge “${badge.text}”`}
                  onClick={() => void write(badges.filter((_, each) => each !== at))}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && badges.length < MOST_BADGES && (
        <NewBadge id={id} onAdd={(badge) => write([...badges, badge])} />
      )}
    </>
  );
}

/** Adds a badge: its text, and its condition among the component's boolean attributes and the relation types in use. */
function NewBadge({ id, onAdd }: { id: Id; onAdd: (badge: Badge) => Promise<boolean> }) {
  const { definitions } = useEditor();
  const textId = useId();
  const conditionId = useId();
  const problemId = useId();
  const sender = useSender();
  const booleans = componentOrEssence(definitions, id)
    .attributes.filter((attribute) => attribute.type === 'boolean')
    .map((attribute) => attribute.name);
  const relationTypes = [...definitions.relationTypes.keys()];
  const conditions = [
    ...booleans.map((name) => ({ value: `attribute:${name}`, text: `while “${name}” is true` })),
    ...relationTypes.map((type) => ({
      value: `from-end:${type}`,
      text: `while it is the from end of “${relationTypeOrRelatesTo(definitions, type).name}”`,
    })),
  ];
  const [text, setText] = useState('');
  const [condition, setCondition] = useState(conditions[0]?.value ?? '');
  const shownCondition = conditions.some((each) => each.value === condition)
    ? condition
    : (conditions[0]?.value ?? '');

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const written = text.trim();
    if (written === '') {
      sender.refuse('Give the badge a text, such as PK.');
      return;
    }
    const [when, ...rest] = shownCondition.split(':');
    const named = rest.join(':');
    const badge: Badge =
      when === 'attribute'
        ? { when: 'attribute', text: written, attribute: named }
        : { when: 'from-end', text: written, relationType: named };
    sender.refuse(undefined);
    if (await onAdd(badge)) setText('');
  };

  return (
    <form className="definition-new" aria-label="New badge" onSubmit={(event) => void add(event)}>
      <div className="inspector-control">
        <label htmlFor={textId}>Badge text</label>
        <input
          id={textId}
          type="text"
          value={text}
          maxLength={BADGE_LENGTH}
          aria-describedby={sender.problem ? problemId : undefined}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="inspector-control">
        <label htmlFor={conditionId}>Written</label>
        <select
          id={conditionId}
          value={shownCondition}
          onChange={(event) => setCondition(event.target.value)}
        >
          {conditions.map((each) => (
            <option key={each.value} value={each.value}>
              {each.text}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="inspector-action" disabled={conditions.length === 0}>
        Add the badge
      </button>
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
    </form>
  );
}
