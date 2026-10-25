import { builtinPackage, modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import { ESSENCE_ID, RELATES_TO_ID, type Id } from '@visual-anything/schema';
import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { byPackage, relationLabel } from '../inspector/describe';
import { InlineProblem } from '../inspector/controls';
import { Title } from '../inspector/parts';
import { perform } from '../inspector/send';
import {
  deriveCommand,
  packageIdProblem,
  proposedPackageId,
  refusalOf,
  type DefinitionKind,
  type DeriveRequest,
} from './commands';
import { useOpenDefinition } from './opened';
import { nameOf } from './traits';

/** The package choice that creates a new package in the same action. */
const NEW_PACKAGE = '';
/** How many new ids a derive tries when the ones it made are taken meanwhile. */
const TRIES = 3;

interface DeriveFormProps {
  of: DefinitionKind;
  base: Id;
  /** An element or relation the new definition can be used for at once. */
  useFor?: Id | undefined;
  titleRef: Ref<HTMLHeadingElement>;
}

/**
 * Derives a component or a relation type of the project's own: its name, what it derives from and
 * the package it goes in, a new one when the project has none of its own, with an id the form shows
 * and that can be changed. Opened from an element or a relation, it offers to use the new one for it.
 * It sends one action, create-only, with an id the app makes; when that id was taken meanwhile, it
 * makes another and sends once more. Then the component editor shows what it made.
 */
export function DeriveForm({ of, base, useFor, titleRef }: DeriveFormProps) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const { open } = useOpenDefinition();
  const root = of === 'component' ? ESSENCE_ID : RELATES_TO_ID;
  const own = project.packages.filter((file) => builtinPackage(file.id) === undefined);
  const ids = {
    name: useId(),
    base: useId(),
    into: useId(),
    packageName: useId(),
    packageId: useId(),
    useFor: useId(),
    problem: useId(),
  };
  const [name, setName] = useState(base === root ? '' : nameOf(definitions, of, base));
  const [derivesFrom, setDerivesFrom] = useState(base);
  const [into, setInto] = useState(own[0]?.id ?? NEW_PACKAGE);
  const [packageName, setPackageName] = useState(project.project.name);
  // Undefined while the id follows the package's name.
  const [packageId, setPackageId] = useState<string>();
  const [using, setUsing] = useState(useFor !== undefined);
  const [problem, setProblem] = useState<string>();
  const [sending, setSending] = useState(false);
  // The project as it is now, for the second try once the first answer came.
  const latest = useRef<ProjectSnapshot>(project);
  useEffect(() => {
    latest.current = project;
  }, [project]);

  const index = modelIndexOf(project);
  const component = of === 'component';
  const heading =
    base === root
      ? component
        ? t('New component')
        : t('New relation type')
      : component
        ? t('Derive a component')
        : t('Derive a relation type');
  const relation = useFor === undefined ? undefined : index.relation(useFor);
  const target =
    useFor === undefined
      ? undefined
      : of === 'component'
        ? index.element(useFor)?.name
        : relation && relationLabel(index, relation);
  const shownPackageId = packageId ?? proposedPackageId(project, packageName);
  const defined = of === 'component' ? definitions.components : definitions.relationTypes;
  const offered = byPackage(defined, project.packages);
  const verb = derivesFrom === root ? 'Define' : 'Derive';

  const request = (): DeriveRequest | string => {
    const trimmed = name.trim();
    if (trimmed === '') {
      return component ? t('Give the component a name.') : t('Give the relation type a name.');
    }
    if (into === NEW_PACKAGE) {
      if (packageName.trim() === '') return t('Give the new package a name.');
      const idProblem = packageIdProblem(project, shownPackageId);
      if (idProblem !== undefined) return idProblem;
    }
    return {
      of,
      base: derivesFrom,
      name: trimmed,
      into:
        into === NEW_PACKAGE
          ? { newPackage: { id: shownPackageId, name: packageName.trim() } }
          : { package: into },
      ...(using && useFor !== undefined ? { useFor } : {}),
    };
  };

  /** The action with an id nothing in `state` holds, or why it cannot be done. */
  const made = (state: ProjectSnapshot, asked: DeriveRequest) => {
    for (let tried = 0; ; tried++) {
      const attempt = deriveCommand(state, asked);
      const refusal = refusalOf(state, attempt.command);
      if (refusal === undefined) return attempt;
      if (refusal.code !== 'id-taken' || tried + 1 >= TRIES) return t.message(refusal.message);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const asked = request();
    if (typeof asked === 'string') {
      setProblem(asked);
      return;
    }
    const first = made(project, asked);
    if (typeof first === 'string') {
      setProblem(first);
      return;
    }
    setProblem(undefined);
    setSending(true);
    let done = await perform(send, first.command);
    let id = first.id;
    if (!done && refusalOf(latest.current, first.command)?.code === 'id-taken') {
      // Claude or another tab took the id meanwhile: once more, with another one.
      const second = made(latest.current, asked);
      if (typeof second !== 'string') {
        done = await perform(send, second.command);
        id = second.id;
      }
    }
    setSending(false);
    if (done) open?.({ kind: of, id }, { focus: true });
  };

  return (
    <form className="definition-form" aria-label={heading} onSubmit={(event) => void submit(event)}>
      <Title
        titleRef={titleRef}
        name={heading}
        detail={
          base === root ? undefined : t('from {name}', { name: nameOf(definitions, of, base) })
        }
      />
      <div className="inspector-control">
        <label htmlFor={ids.name}>{t('Name')}</label>
        <input
          id={ids.name}
          type="text"
          value={name}
          aria-describedby={problem === undefined ? undefined : ids.problem}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="inspector-control">
        <label htmlFor={ids.base}>{t('Derives from')}</label>
        <select
          id={ids.base}
          value={derivesFrom}
          onChange={(event) => setDerivesFrom(event.target.value)}
        >
          <option value={root}>{nameOf(definitions, of, root)}</option>
          {offered.map((from) => (
            <optgroup key={from.id} label={t.definition(from.id, from.name)}>
              {from.members.map((each) => (
                <option key={each} value={each}>
                  {nameOf(definitions, of, each)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="inspector-control">
        <label htmlFor={ids.into}>{t('Package')}</label>
        <select id={ids.into} value={into} onChange={(event) => setInto(event.target.value)}>
          {own.map((file) => (
            <option key={file.id} value={file.id}>
              {file.name}
            </option>
          ))}
          <option value={NEW_PACKAGE}>{t('A new package')}</option>
        </select>
      </div>
      {into === NEW_PACKAGE && (
        <div className="definition-new-package">
          <div className="inspector-control">
            <label htmlFor={ids.packageName}>{t('Name of the new package')}</label>
            <input
              id={ids.packageName}
              type="text"
              value={packageName}
              onChange={(event) => setPackageName(event.target.value)}
            />
          </div>
          <div className="inspector-control">
            <label htmlFor={ids.packageId}>{t('Its id')}</label>
            <input
              id={ids.packageId}
              type="text"
              value={shownPackageId}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setPackageId(event.target.value)}
            />
          </div>
        </div>
      )}
      {useFor !== undefined && target !== undefined && (
        <div className="definition-checklist-item">
          <input
            id={ids.useFor}
            type="checkbox"
            checked={using}
            onChange={(event) => setUsing(event.target.checked)}
          />
          <label htmlFor={ids.useFor}>{t('Use it for “{name}”', { name: target })}</label>
        </div>
      )}
      {problem !== undefined && <InlineProblem id={ids.problem} text={problem} />}
      <div className="definition-actions">
        <button type="submit" className="inspector-action" disabled={send === undefined || sending}>
          {verb === 'Define'
            ? component
              ? t('Define the component')
              : t('Define the relation type')
            : component
              ? t('Derive the component')
              : t('Derive the relation type')}
        </button>
      </div>
    </form>
  );
}
