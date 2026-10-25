import type { AttributeChanges, Command } from '@visual-anything/core';
import type { AttributeDefinition, Id } from '@visual-anything/schema';
import { useId, useState, type FormEvent } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { ATTRIBUTE_TYPES, typeName, type AttributeType } from '../inspector/attributes';
import { InlineProblem, SelectControl, TextControl } from '../inspector/controls';
import { sameOptionalText } from '../inspector/text';
import {
  choicesText,
  defaultText,
  movedOrder,
  readChoices,
  readDefault,
  retyped,
  withTrait,
} from './attributes';
import type { DefinitionKind } from './commands';
import { Field } from './Field';
import { attributeSources, inheritedAttributes, sourceText } from './traits';
import { useSender } from './useSender';

interface AttributeDefinitionsSectionProps {
  kind: DefinitionKind;
  id: Id;
  readOnly: boolean;
  /** The command that makes changes to the attributes the definition defines itself. */
  update: (changes: AttributeChanges) => Command;
}

function isAttributeType(value: string): value is AttributeType {
  return (ATTRIBUTE_TYPES as readonly string[]).includes(value);
}

/**
 * The attributes a component or relation type has: the inherited ones read-only, each with where it
 * comes from and "Redefine here"; its own ones with their name (renaming moves the values), type,
 * default, choices or unit, and description; and a form that adds one.
 */
export function AttributeDefinitionsSection({
  kind,
  id,
  readOnly,
  update,
}: AttributeDefinitionsSectionProps) {
  const { definitions } = useEditor();
  const headingId = useId();
  const resolved = kind === 'component' ? definitions.component(id) : definitions.relationType(id);
  const attributes = resolved?.attributes ?? [];
  const sources = attributeSources(definitions, kind, id);
  const own =
    (kind === 'component'
      ? definitions.components.get(id)?.definition.attributes
      : definitions.relationTypes.get(id)?.definition.attributes) ?? [];
  const inherited = new Set(inheritedAttributes(definitions, kind, id).map((each) => each.name));
  // Only its own new attributes move: a redefinition keeps the place of what it redefines.
  const movable = own.filter((each) => !inherited.has(each.name)).map((each) => each.name);

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>Attributes</h4>
      {attributes.length === 0 && <p className="panel-empty">It has no attributes yet.</p>}
      <ul className="definition-attributes" aria-labelledby={headingId}>
        {attributes.map((attribute) => {
          const source = sources.get(attribute.name) ?? id;
          return source === id ? (
            <OwnAttribute
              key={attribute.name}
              attribute={attribute}
              redefines={inherited.has(attribute.name)}
              movable={movable}
              readOnly={readOnly}
              update={update}
            />
          ) : (
            <InheritedAttribute
              key={attribute.name}
              attribute={attribute}
              source={sourceText(definitions, kind, id, source)}
              readOnly={readOnly}
              update={update}
            />
          );
        })}
      </ul>
      {inherited.size > 0 && !readOnly && (
        <p className="inspector-notes">
          An inherited attribute cannot be removed or moved here: redefine it to change it, or
          derive from a definition nearer the one that defines it.
        </p>
      )}
      {!readOnly && <NewAttribute names={attributes.map((each) => each.name)} update={update} />}
    </section>
  );
}

interface OwnAttributeProps {
  attribute: AttributeDefinition;
  /** Whether it redefines an attribute the chain defines. */
  redefines: boolean;
  /** The definition's own new attributes, in its order, which can move among themselves. */
  movable: readonly string[];
  readOnly: boolean;
  update: (changes: AttributeChanges) => Command;
}

/** An attribute the definition defines itself: every trait edited, each change one command. */
function OwnAttribute({ attribute, redefines, movable, readOnly, update }: OwnAttributeProps) {
  const sender = useSender();
  const problemId = useId();
  const { name, type } = attribute;
  const set = (next: AttributeDefinition) => update({ set: [next] });
  const move = (by: -1 | 1) => {
    const order = movedOrder(movable, name, by);
    if (order) void sender.send(update({ order }));
  };

  return (
    <li className="definition-attribute">
      <div className="definition-attribute-head">
        <span className="definition-attribute-name">{name}</span>
        <span className="inspector-type">{typeName(type)}</span>
        <span className="definition-source is-own">{redefines ? 'redefined here' : 'its own'}</span>
      </div>
      <Field label="Name" note={redefines ? 'A redefinition keeps its name.' : undefined}>
        {({ id, describedBy, send }) => (
          <TextControl
            id={id}
            value={name}
            disabled={readOnly || redefines}
            describedBy={describedBy}
            onCommit={async (text) => {
              const to = text.trim();
              if (to !== '' && to !== name) await send(update({ rename: [{ from: name, to }] }));
            }}
          />
        )}
      </Field>
      <Field label="Type">
        {({ id, describedBy, send }) => (
          <SelectControl
            id={id}
            value={type}
            disabled={readOnly}
            describedBy={describedBy}
            onCommit={async (next) => {
              if (isAttributeType(next)) await send(set(retyped(attribute, next)));
            }}
          >
            {ATTRIBUTE_TYPES.map((each) => (
              <option key={each} value={each}>
                {typeName(each)}
              </option>
            ))}
          </SelectControl>
        )}
      </Field>
      <DefaultField attribute={attribute} readOnly={readOnly} set={set} />
      {type === 'string' && (
        <Field label="Choices, one per line">
          {({ id, describedBy, send }) => (
            <TextControl
              id={id}
              value={choicesText(attribute.choices)}
              multiline
              disabled={readOnly}
              describedBy={describedBy}
              same={(a, b) => choicesText(readChoices(a)) === choicesText(readChoices(b))}
              onCommit={(text) => send(set(withTrait(attribute, 'choices', readChoices(text))))}
            />
          )}
        </Field>
      )}
      {type === 'number' && (
        <Field label="Unit">
          {({ id, describedBy, send }) => (
            <TextControl
              id={id}
              value={attribute.unit ?? ''}
              disabled={readOnly}
              describedBy={describedBy}
              same={sameOptionalText}
              onCommit={(text) =>
                send(
                  set(withTrait(attribute, 'unit', text.trim() === '' ? undefined : text.trim())),
                )
              }
            />
          )}
        </Field>
      )}
      <Field label="Description">
        {({ id, describedBy, send }) => (
          <TextControl
            id={id}
            value={attribute.description ?? ''}
            multiline
            disabled={readOnly}
            describedBy={describedBy}
            same={sameOptionalText}
            onCommit={(text) =>
              send(set(withTrait(attribute, 'description', text.trim() === '' ? undefined : text)))
            }
          />
        )}
      </Field>
      {!readOnly && (
        <div
          className="definition-actions"
          aria-describedby={sender.problem ? problemId : undefined}
        >
          {!redefines && (
            <>
              <button
                type="button"
                className="inspector-action"
                aria-label={`Move “${name}” up`}
                disabled={movable.indexOf(name) <= 0}
                onClick={() => move(-1)}
              >
                Up
              </button>
              <button
                type="button"
                className="inspector-action"
                aria-label={`Move “${name}” down`}
                disabled={movable.indexOf(name) >= movable.length - 1}
                onClick={() => move(1)}
              >
                Down
              </button>
            </>
          )}
          <button
            type="button"
            className="inspector-action"
            aria-label={
              redefines ? `Use the inherited definition of “${name}”` : `Remove “${name}”`
            }
            onClick={() => void sender.send(update({ remove: [name] }))}
          >
            {redefines ? 'Use the inherited definition' : 'Remove'}
          </button>
        </div>
      )}
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
    </li>
  );
}

interface DefaultFieldProps {
  attribute: AttributeDefinition;
  readOnly: boolean;
  set: (next: AttributeDefinition) => Command;
}

/**
 * The value an element or relation has when it sets none: chosen among the choices or true and
 * false, or typed, and checked against the attribute's type before anything is sent.
 */
function DefaultField({ attribute, readOnly, set }: DefaultFieldProps) {
  const { type } = attribute;
  const choices =
    type === 'boolean' ? ['true', 'false'] : type === 'string' ? attribute.choices : undefined;
  return (
    <Field label="Default">
      {({ id, describedBy, send }) =>
        choices !== undefined ? (
          <SelectControl
            id={id}
            value={defaultText(attribute.default)}
            disabled={readOnly}
            describedBy={describedBy}
            onCommit={async (text) => {
              const reading = readDefault(text, type);
              if (reading.ok) await send(set(withTrait(attribute, 'default', reading.value)));
            }}
          >
            <option value="">No default</option>
            {choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </SelectControl>
        ) : (
          <TextControl
            id={id}
            value={defaultText(attribute.default)}
            inputType={type === 'number' ? 'number' : 'text'}
            disabled={readOnly}
            describedBy={describedBy}
            problemOf={(text) => {
              const reading = readDefault(text, type);
              return reading.ok ? undefined : reading.message;
            }}
            onCommit={async (text) => {
              const reading = readDefault(text, type);
              if (reading.ok) await send(set(withTrait(attribute, 'default', reading.value)));
            }}
          />
        )
      }
    </Field>
  );
}

interface InheritedAttributeProps {
  attribute: AttributeDefinition;
  /** Where it comes from, in words: "from Box". */
  source: string;
  readOnly: boolean;
  update: (changes: AttributeChanges) => Command;
}

/** An attribute the definition inherits: read-only, with "Redefine here". */
function InheritedAttribute({ attribute, source, readOnly, update }: InheritedAttributeProps) {
  const sender = useSender();
  const problemId = useId();
  const { name, type } = attribute;
  return (
    <li className="definition-attribute">
      <div className="definition-attribute-head">
        <span className="definition-attribute-name">{name}</span>
        <span className="inspector-type">{typeName(type)}</span>
        <span className="definition-source">{source}</span>
      </div>
      {attribute.description !== undefined && (
        <p className="inspector-notes">{attribute.description}</p>
      )}
      {attribute.default !== undefined && (
        <p className="inspector-notes">Default: {defaultText(attribute.default)}</p>
      )}
      {attribute.choices !== undefined && (
        <p className="inspector-notes">Choices: {attribute.choices.join(', ')}</p>
      )}
      {attribute.unit !== undefined && <p className="inspector-notes">Unit: {attribute.unit}</p>}
      {!readOnly && (
        <button
          type="button"
          className="inspector-action"
          aria-label={`Redefine “${name}” here`}
          aria-describedby={sender.problem ? problemId : undefined}
          onClick={() => void sender.send(update({ set: [{ ...attribute }] }))}
        >
          Redefine here
        </button>
      )}
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
    </li>
  );
}

/** Adds an attribute the definition defines itself: a name and a type. */
function NewAttribute({
  names,
  update,
}: {
  names: readonly string[];
  update: (changes: AttributeChanges) => Command;
}) {
  const sender = useSender();
  const nameId = useId();
  const typeId = useId();
  const problemId = useId();
  const [name, setName] = useState('');
  const [type, setType] = useState<AttributeType>('string');

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      sender.refuse('Give the attribute a name.');
      return;
    }
    if (names.includes(trimmed)) {
      sender.refuse(`It already has the attribute “${trimmed}”.`);
      return;
    }
    if (await sender.send(update({ set: [{ name: trimmed, type }] }))) setName('');
  };

  return (
    <form
      className="inspector-new-attribute"
      aria-label="New attribute"
      onSubmit={(event) => void add(event)}
    >
      <p className="inspector-new-attribute-title">New attribute</p>
      <div className="inspector-new-attribute-controls">
        <div className="inspector-control">
          <label htmlFor={nameId}>Name</label>
          <input
            id={nameId}
            type="text"
            value={name}
            aria-describedby={sender.problem ? problemId : undefined}
            aria-invalid={sender.problem ? true : undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="inspector-control">
          <label htmlFor={typeId}>Type</label>
          <select
            id={typeId}
            value={type}
            onChange={(event) => {
              if (isAttributeType(event.target.value)) setType(event.target.value);
            }}
          >
            {ATTRIBUTE_TYPES.map((each) => (
              <option key={each} value={each}>
                {typeName(each)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="inspector-action">
          Add the attribute
        </button>
      </div>
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
    </form>
  );
}
