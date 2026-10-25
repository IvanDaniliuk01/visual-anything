/**
 * The inspector's external identifiers (ADR 0056): what an element, a component or a relation type is
 * in other catalogs, by scheme. Each identifier is edited in place and can be removed, and a new one
 * is added by its scheme; each change is one command, so one undoable action. They are data: nothing
 * here follows them.
 */
import {
  MAX_EXTERNAL_ID_LENGTH,
  isExternalId,
  isScheme,
  type ExternalIdChanges,
} from '@visual-anything/core';
import type { ExternalIds } from '@visual-anything/schema';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import { InlineProblem, TextControl } from '../shell/inspector/controls';
import './destinations.css';

interface ExternalIdsSectionProps {
  ids: ExternalIds | undefined;
  disabled: boolean;
  /** Sends the changes as one command; resolves to whether they were made. */
  change: (changes: ExternalIdChanges) => Promise<boolean>;
}

export function ExternalIdsSection({ ids, disabled, change }: ExternalIdsSectionProps) {
  const t = useT();
  const headingId = useId();
  const entries = Object.entries(ids ?? {});
  const identifierProblem = (text: string) =>
    isExternalId(text)
      ? undefined
      : t('An identifier has 1 to {n} characters, without line breaks.', {
          n: MAX_EXTERNAL_ID_LENGTH,
        });
  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('External identifiers')}</h4>
      {entries.length > 0 ? (
        <ul className="inspector-ids" aria-labelledby={headingId}>
          {entries.map(([scheme, identifier]) => (
            <ExternalIdItem
              key={scheme}
              scheme={scheme}
              identifier={identifier}
              disabled={disabled}
              problemOf={identifierProblem}
              onSet={(text) => change({ [scheme]: text })}
              onRemove={() => change({ [scheme]: null })}
            />
          ))}
        </ul>
      ) : (
        <p className="panel-empty">
          {t('None yet. Add what it is in another catalog, such as uberon: UBERON:0002135.')}
        </p>
      )}
      <NewExternalId
        schemes={entries.map(([scheme]) => scheme)}
        disabled={disabled}
        problemOf={identifierProblem}
        onAdd={(scheme, identifier) => change({ [scheme]: identifier })}
      />
    </section>
  );
}

interface ExternalIdItemProps {
  scheme: string;
  identifier: string;
  disabled: boolean;
  problemOf: (text: string) => string | undefined;
  onSet: (text: string) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}

function ExternalIdItem({
  scheme,
  identifier,
  disabled,
  problemOf,
  onSet,
  onRemove,
}: ExternalIdItemProps) {
  const t = useT();
  const controlId = useId();
  return (
    <li className="inspector-id">
      <label htmlFor={controlId} className="inspector-id-scheme">
        {scheme}
      </label>
      <TextControl
        id={controlId}
        value={identifier}
        disabled={disabled}
        problemOf={problemOf}
        onCommit={onSet}
      />
      <button
        type="button"
        className="inspector-action"
        disabled={disabled}
        onClick={() => void onRemove()}
      >
        {t('Remove')} <span className="visually-hidden">{scheme}</span>
      </button>
    </li>
  );
}

interface NewExternalIdProps {
  schemes: readonly string[];
  disabled: boolean;
  problemOf: (text: string) => string | undefined;
  onAdd: (scheme: string, identifier: string) => Promise<boolean>;
}

/** Adds an identifier in a scheme it has none in. */
function NewExternalId({ schemes, disabled, problemOf, onAdd }: NewExternalIdProps) {
  const t = useT();
  const titleId = useId();
  const schemeId = useId();
  const identifierId = useId();
  const problemId = useId();
  const [scheme, setScheme] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [problem, setProblem] = useState<{ at: 'scheme' | 'identifier'; text: string }>();
  const schemeInput = useRef<HTMLInputElement>(null);
  const identifierInput = useRef<HTMLInputElement>(null);
  const adding = useRef(false);

  const refuse = (at: 'scheme' | 'identifier', text: string) => {
    setProblem({ at, text });
    (at === 'scheme' ? schemeInput : identifierInput).current?.focus();
  };

  const add = async () => {
    if (adding.current) return;
    const name = scheme.trim();
    if (!isScheme(name)) {
      refuse('scheme', t('A scheme is a short lowercase name, such as uberon, fma or wikidata.'));
      return;
    }
    if (schemes.includes(name)) {
      refuse(
        'scheme',
        t('It has a {scheme} identifier already; change that one.', { scheme: name }),
      );
      return;
    }
    const why = problemOf(identifier);
    if (why !== undefined) {
      refuse('identifier', why);
      return;
    }
    setProblem(undefined);
    adding.current = true;
    try {
      if (await onAdd(name, identifier)) {
        setScheme('');
        setIdentifier('');
        schemeInput.current?.focus();
      }
    } finally {
      adding.current = false;
    }
  };

  const invalid = (at: 'scheme' | 'identifier') =>
    problem?.at === at ? { 'aria-invalid': true, 'aria-describedby': problemId } : {};

  return (
    <form
      className="inspector-new-id"
      aria-labelledby={titleId}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void add();
      }}
    >
      <p id={titleId} className="visually-hidden">
        {t('Add an external identifier')}
      </p>
      <div className="inspector-control">
        <label htmlFor={schemeId}>{t('Scheme')}</label>
        <input
          ref={schemeInput}
          id={schemeId}
          type="text"
          value={scheme}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="none"
          {...invalid('scheme')}
          onChange={(event) => {
            setScheme(event.target.value);
            setProblem(undefined);
          }}
        />
      </div>
      <div className="inspector-control">
        <label htmlFor={identifierId}>{t('Identifier')}</label>
        <input
          ref={identifierInput}
          id={identifierId}
          type="text"
          value={identifier}
          disabled={disabled}
          spellCheck={false}
          {...invalid('identifier')}
          onChange={(event) => {
            setIdentifier(event.target.value);
            setProblem(undefined);
          }}
        />
      </div>
      <button type="submit" className="inspector-action" disabled={disabled}>
        {t('Add')}
      </button>
      {problem !== undefined && <InlineProblem id={problemId} text={problem.text} />}
    </form>
  );
}
