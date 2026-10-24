import type { AttributeDefinition, Attributes, JsonValue } from '@visual-anything/schema';
import { useId, useRef, useState, type FormEvent } from 'react';
import {
  ATTRIBUTE_TYPES,
  attributeRows,
  initialValue,
  jsonText,
  readJson,
  readNumber,
  sameJson,
  typeName,
  type AttributeRow,
  type AttributeType,
} from './attributes';
import { CheckboxControl, TextControl } from './controls';
import { Mark } from './parts';

/** A change to attributes, sent as one command. */
export interface AttributeChange {
  attributes?: Attributes;
  removeAttributes?: string[];
}

interface AttributesSectionProps {
  /**
   * Whose attributes they are. An element's particularities are marked, and it can have attributes of
   * its own; a relation's attributes come from its relation type.
   */
  of: 'element' | 'relation';
  /** The attributes its component's or relation type's chain defines. */
  definitions: readonly AttributeDefinition[];
  values: Attributes | undefined;
  disabled: boolean;
  /** Makes a change with one command; resolves to whether it was done. */
  change: (change: AttributeChange) => Promise<boolean>;
}

/** What defines the attributes, in words. */
const DEFINER = { element: 'component', relation: 'relation type' } as const;

/**
 * The attributes of an element or a relation, each edited by its type. Each value of its own can be
 * taken back: to the default, by clearing it, or by removing an attribute the chain does not define.
 */
export function AttributesSection({
  of,
  definitions,
  values,
  disabled,
  change,
}: AttributesSectionProps) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [focus, setFocus] = useState<{ name: string; request: number }>();
  const rows = attributeRows(definitions, values);
  const focusOn = (name: string) =>
    setFocus((last) => ({ name, request: (last?.request ?? 0) + 1 }));

  const reset = async (row: AttributeRow) => {
    if (!(await change({ removeAttributes: [row.name] }))) return;
    // The button goes once the value does: the focus moves to what stays.
    if (row.reset === 'remove') heading.current?.focus();
    else focusOn(row.name);
  };

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId} ref={heading} tabIndex={-1}>
        Attributes
      </h4>
      {rows.length > 0 ? (
        <ul className="inspector-attributes" aria-labelledby={headingId}>
          {rows.map((row) => (
            <AttributeItem
              key={row.name}
              row={row}
              of={of}
              disabled={disabled}
              focusRequest={focus?.name === row.name ? focus.request : 0}
              onSet={(value) => change({ attributes: { [row.name]: value } })}
              onReset={() => void reset(row)}
            />
          ))}
        </ul>
      ) : (
        <p className="panel-empty">Its {DEFINER[of]} defines no attributes.</p>
      )}
      {of === 'element' && (
        <NewAttribute
          names={rows.map((row) => row.name)}
          disabled={disabled}
          onAdd={async (name, type) => {
            const done = await change({ attributes: { [name]: initialValue(type) } });
            if (done) focusOn(name);
            return done;
          }}
        />
      )}
    </section>
  );
}

interface AttributeItemProps {
  row: AttributeRow;
  of: 'element' | 'relation';
  disabled: boolean;
  focusRequest: number;
  onSet: (value: JsonValue) => Promise<boolean>;
  onReset: () => void;
}

function AttributeItem({ row, of, disabled, focusRequest, onSet, onReset }: AttributeItemProps) {
  const controlId = useId();
  const typeId = useId();
  const notesId = useId();
  const markId = useId();
  const particularity = of === 'element' && (row.differs || row.definition === undefined);
  const describedBy = [typeId, notesId, ...(particularity ? [markId] : [])].join(' ');
  const definer = DEFINER[of];
  const { definition } = row;
  const notes = [
    definition?.description,
    definition === undefined
      ? `Not defined by its ${definer}.`
      : definition.default === undefined
        ? 'No default.'
        : `Default: ${JSON.stringify(definition.default)}.`,
    row.mismatched ? `Its value is not ${row.type === 'json' ? 'JSON' : `a ${row.type}`}.` : '',
  ]
    .filter((note) => note !== undefined && note !== '')
    .join(' ');

  return (
    <li className="inspector-attribute">
      <div className="inspector-attribute-head">
        <label htmlFor={controlId}>{row.name}</label>
        <span id={typeId} className="inspector-type">
          {typeName(row.type)}
        </span>
        {particularity && (
          <Mark
            id={markId}
            reason={row.differs ? `its value differs from its ${definer}’s` : undefined}
          />
        )}
      </div>
      <ValueControl
        id={controlId}
        row={row}
        disabled={disabled}
        describedBy={describedBy}
        focusRequest={focusRequest}
        onSet={onSet}
      />
      <p id={notesId} className="inspector-notes">
        {notes}
      </p>
      {row.reset !== undefined && (
        <button type="button" className="inspector-action" disabled={disabled} onClick={onReset}>
          {row.reset === 'default'
            ? `Use the ${definer}’s value`
            : row.reset === 'clear'
              ? 'Clear'
              : 'Remove'}{' '}
          <span className="visually-hidden">
            {row.reset === 'default' ? `for ${row.name}` : row.name}
          </span>
        </button>
      )}
    </li>
  );
}

interface ValueControlProps {
  id: string;
  row: AttributeRow;
  disabled: boolean;
  describedBy: string;
  focusRequest: number;
  onSet: (value: JsonValue) => Promise<boolean>;
}

/** The control for an attribute's value, by its type; a value that does not fit its type is edited as JSON. */
function ValueControl({ id, row, disabled, describedBy, focusRequest, onSet }: ValueControlProps) {
  const common = { id, disabled, describedBy, focusRequest };
  const { value } = row;
  switch (row.mismatched ? 'json' : row.type) {
    case 'boolean':
      return <CheckboxControl {...common} checked={value === true} onCommit={onSet} />;
    case 'number':
      return (
        <TextControl
          {...common}
          inputType="number"
          value={typeof value === 'number' ? String(value) : ''}
          problemOf={(text) => problemIn(readNumber(text))}
          onCommit={async (text) => {
            const read = readNumber(text);
            if (read.ok && read.value !== value) await onSet(read.value);
          }}
        />
      );
    case 'json':
      return (
        <TextControl
          {...common}
          multiline
          value={jsonText(value)}
          problemOf={(text) => problemIn(readJson(text))}
          onCommit={async (text) => {
            const read = readJson(text);
            if (read.ok && !(value !== undefined && sameJson(read.value, value))) {
              await onSet(read.value);
            }
          }}
        />
      );
    case 'string':
      return (
        <TextControl
          {...common}
          value={typeof value === 'string' ? value : ''}
          onCommit={(text) => onSet(text)}
        />
      );
  }
}

/** Why something typed cannot be read, if it cannot. */
function problemIn(reading: { ok: true } | { ok: false; message: string }): string | undefined {
  return reading.ok ? undefined : reading.message;
}

interface NewAttributeProps {
  /** The attributes it has already. */
  names: readonly string[];
  disabled: boolean;
  /** Adds the attribute; resolves to whether it was added. */
  onAdd: (name: string, type: AttributeType) => Promise<boolean>;
}

/** Adds an attribute of the element's own, which its component does not define. */
function NewAttribute({ names, disabled, onAdd }: NewAttributeProps) {
  const titleId = useId();
  const nameId = useId();
  const typeId = useId();
  const problemId = useId();
  const [name, setName] = useState('');
  const [type, setType] = useState<AttributeType>('string');
  const [problem, setProblem] = useState<string>();
  // One attribute is added at a time, so that a second submit sends nothing while the first is answered.
  const adding = useRef(false);

  const add = async () => {
    if (adding.current) return;
    const trimmed = name.trim();
    if (trimmed === '') {
      setProblem('Give the attribute a name.');
      return;
    }
    if (names.includes(trimmed)) {
      setProblem(`It already has an attribute named “${trimmed}”.`);
      return;
    }
    setProblem(undefined);
    adding.current = true;
    try {
      if (await onAdd(trimmed, type)) setName('');
    } finally {
      adding.current = false;
    }
  };

  return (
    <form
      className="inspector-new-attribute"
      aria-labelledby={titleId}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void add();
      }}
    >
      <p id={titleId} className="inspector-new-attribute-title">
        Add an attribute of its own
      </p>
      <div className="inspector-new-attribute-controls">
        <div className="inspector-control">
          <label htmlFor={nameId}>Attribute name</label>
          <input
            id={nameId}
            type="text"
            value={name}
            disabled={disabled}
            aria-invalid={problem === undefined ? undefined : true}
            aria-describedby={problem === undefined ? undefined : problemId}
            onChange={(event) => {
              setName(event.target.value);
              setProblem(undefined);
            }}
          />
        </div>
        <div className="inspector-control">
          <label htmlFor={typeId}>Attribute type</label>
          <select
            id={typeId}
            value={type}
            disabled={disabled}
            onChange={(event) => setType(event.target.value as AttributeType)}
          >
            {ATTRIBUTE_TYPES.map((each) => (
              <option key={each} value={each}>
                {typeName(each)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="inspector-action" disabled={disabled}>
          Add attribute
        </button>
      </div>
      {problem !== undefined && (
        <p id={problemId} className="inspector-problem">
          {problem}
        </p>
      )}
    </form>
  );
}
