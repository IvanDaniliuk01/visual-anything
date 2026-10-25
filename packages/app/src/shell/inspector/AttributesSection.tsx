import type { AttributeDefinition, Attributes, Id, JsonValue } from '@visual-anything/schema';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
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
import { CheckboxControl, InlineProblem, TextControl } from './controls';
import { useFocusKeeper, type FocusKeeper } from './focus';
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
  /** That chain, nearest first, which says where a built-in attribute's description comes from. */
  lineage?: readonly Id[];
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
  lineage = [],
  values,
  disabled,
  change,
}: AttributesSectionProps) {
  const t = useT();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  // The row whose value takes the focus, until it has: a row that comes back later, after an undo, a
  // redo or an edit elsewhere, does not take it again.
  const [focus, setFocus] = useState<{ name: string | undefined; request: number }>({
    name: undefined,
    request: 0,
  });
  const rows = attributeRows(definitions, values);
  const focusOn = (name: string) => setFocus((last) => ({ name, request: last.request + 1 }));
  const focused = () =>
    setFocus((last) =>
      last.name === undefined ? last : { name: undefined, request: last.request },
    );

  const reset = async (row: AttributeRow) => {
    if (!(await change({ removeAttributes: [row.name] }))) return;
    // The button goes once the value does: the focus moves to what stays.
    if (row.reset === 'remove') heading.current?.focus();
    else focusOn(row.name);
  };

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId} ref={heading} tabIndex={-1}>
        {t('Attributes')}
      </h4>
      {rows.length > 0 ? (
        <ul className="inspector-attributes" aria-labelledby={headingId}>
          {rows.map((row) => (
            <AttributeItem
              key={row.name}
              row={row}
              of={of}
              lineage={lineage}
              disabled={disabled}
              focusRequest={focus.name === row.name ? focus.request : 0}
              onFocused={focused}
              onSet={(value) => change({ attributes: { [row.name]: value } })}
              onReset={() => void reset(row)}
            />
          ))}
        </ul>
      ) : (
        <p className="panel-empty">
          {t('Its {definer} defines no attributes.', { definer: t(DEFINER[of]) })}
        </p>
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
  lineage: readonly Id[];
  disabled: boolean;
  focusRequest: number;
  onFocused: () => void;
  onSet: (value: JsonValue) => Promise<boolean>;
  onReset: () => void;
}

function AttributeItem({
  row,
  of,
  lineage,
  disabled,
  focusRequest,
  onFocused,
  onSet,
  onReset,
}: AttributeItemProps) {
  const t = useT();
  const controlId = useId();
  const typeId = useId();
  const notesId = useId();
  const markId = useId();
  const focusKeeper = useFocusKeeper();
  const particularity = of === 'element' && (row.differs || row.definition === undefined);
  const describedBy = [typeId, notesId, ...(particularity ? [markId] : [])].join(' ');
  const definer = t(DEFINER[of]);
  const { definition } = row;
  const notes = [
    definition?.description === undefined
      ? undefined
      : t.attribute(lineage, row.name, definition.description),
    definition === undefined
      ? t('Not defined by its {definer}.', { definer })
      : definition.default === undefined
        ? t('No default.')
        : t('Default: {value}.', { value: JSON.stringify(definition.default) }),
    row.mismatched
      ? row.type === 'json'
        ? t('Its value is not JSON.')
        : t('Its value is not a {type}.', { type: row.type })
      : '',
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
            reason={
              row.differs ? t('its value differs from its {definer}’s', { definer }) : undefined
            }
          />
        )}
      </div>
      <ValueControl
        id={controlId}
        row={row}
        disabled={disabled}
        describedBy={describedBy}
        focusRequest={focusRequest}
        onFocused={onFocused}
        focusKeeper={focusKeeper}
        onSet={onSet}
      />
      <p id={notesId} className="inspector-notes">
        {notes}
      </p>
      {row.reset !== undefined && (
        <button type="button" className="inspector-action" disabled={disabled} onClick={onReset}>
          {row.reset === 'default'
            ? t('Use the {definer}’s value', { definer })
            : row.reset === 'clear'
              ? t('Clear')
              : t('Remove')}{' '}
          <span className="visually-hidden">
            {row.reset === 'default' ? t('for {name}', { name: row.name }) : row.name}
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
  onFocused: () => void;
  focusKeeper: FocusKeeper;
  onSet: (value: JsonValue) => Promise<boolean>;
}

/**
 * The control for an attribute's value, by its type; a value that does not fit its type is edited as
 * JSON. Each kind of control has its own key, so that a value that changes kind gets a new control,
 * and the focus keeper moves the focus to it.
 */
function ValueControl({
  id,
  row,
  disabled,
  describedBy,
  focusRequest,
  onFocused,
  focusKeeper,
  onSet,
}: ValueControlProps) {
  const common = { id, disabled, describedBy, focusRequest, onFocused, focusKeeper };
  const { value } = row;
  const kind = row.mismatched ? 'json' : row.type;
  switch (kind) {
    case 'boolean':
      return <CheckboxControl key={kind} {...common} checked={value === true} onCommit={onSet} />;
    case 'number':
      return (
        <TextControl
          key={kind}
          {...common}
          inputType="number"
          value={typeof value === 'number' ? String(value) : ''}
          problemOf={(text) => problemIn(readNumber(text))}
          same={sameNumber}
          onCommit={async (text) => {
            const read = readNumber(text);
            if (read.ok) await onSet(read.value);
          }}
        />
      );
    case 'json':
      return (
        <TextControl
          key={kind}
          {...common}
          multiline
          value={jsonText(value)}
          problemOf={(text) => problemIn(readJson(text))}
          same={sameJsonText}
          onCommit={async (text) => {
            const read = readJson(text);
            if (read.ok) await onSet(read.value);
          }}
        />
      );
    case 'string':
      return (
        <TextControl
          key={kind}
          {...common}
          value={typeof value === 'string' ? value : ''}
          onCommit={(text) => onSet(text)}
        />
      );
  }
}

/** Whether two texts are the same number. */
function sameNumber(a: string, b: string): boolean {
  const first = readNumber(a);
  const second = readNumber(b);
  return first.ok && second.ok && first.value === second.value;
}

/** Whether two texts are the same JSON value, however they are spaced or their keys ordered. */
function sameJsonText(a: string, b: string): boolean {
  const first = readJson(a);
  const second = readJson(b);
  return first.ok && second.ok && sameJson(first.value, second.value);
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
  const t = useT();
  const titleId = useId();
  const nameId = useId();
  const typeId = useId();
  const problemId = useId();
  const [name, setName] = useState('');
  const [type, setType] = useState<AttributeType>('string');
  const [problem, setProblem] = useState<string>();
  const nameInput = useRef<HTMLInputElement>(null);
  // One attribute is added at a time, so that a second submit sends nothing while the first is answered.
  const adding = useRef(false);

  /** Says what is wrong with the name, and moves the focus to it so that it can be put right. */
  const refuse = (reason: string) => {
    setProblem(reason);
    nameInput.current?.focus();
  };

  const add = async () => {
    if (adding.current) return;
    const trimmed = name.trim();
    if (trimmed === '') {
      refuse(t('Give the attribute a name.'));
      return;
    }
    if (names.includes(trimmed)) {
      refuse(t('It already has an attribute named “{name}”.', { name: trimmed }));
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
        {t('Add an attribute of its own')}
      </p>
      <div className="inspector-new-attribute-controls">
        <div className="inspector-control">
          <label htmlFor={nameId}>{t('Attribute name')}</label>
          <input
            ref={nameInput}
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
          <label htmlFor={typeId}>{t('Attribute type')}</label>
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
          {t('Add attribute')}
        </button>
      </div>
      {problem !== undefined && <InlineProblem id={problemId} text={problem} />}
    </form>
  );
}
