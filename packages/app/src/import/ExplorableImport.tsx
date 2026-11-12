/**
 * Import…'s explorable step (ADR 0107): HTML the person chose or pasted, imported "As an explorable"
 * rather than "As a drawing" (ADR 0068). It is defined in one of the project's own packages, through
 * the core's one action, named from the page's title or the file, at most 512 KiB; nothing in it runs
 * here, and nothing approves it: like any explorable from outside, it asks before it runs, and the
 * report offers its approval dialog.
 */
import {
  MAX_EXPLORABLE_BYTES,
  builtinPackage,
  explorableImportName,
  prepareExplorableImport,
  utf8Length,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useExplorableSession } from '../explorables/session';
import { useT } from '../i18n';
import type { CommandResult } from '../live/connection';

interface ExplorableImportProps {
  titleId: string;
  project: ProjectSnapshot;
  /** The file's name and its HTML. */
  input: { name: string; text: string };
  send: (command: Command) => Promise<CommandResult>;
  /** The choice between a drawing and an explorable, shown under the heading. */
  chooser?: ReactNode;
  onBack: () => void;
  onClose: () => void;
}

type Sending =
  | { state: 'sending' }
  | { state: 'done'; explorable: Id; name: string; warnings: string[] }
  | { state: 'refused'; problems: string[] };

export function ExplorableImport({
  titleId,
  project,
  input,
  send,
  chooser,
  onBack,
  onClose,
}: ExplorableImportProps) {
  const t = useT();
  const session = useExplorableSession();
  const own = useMemo(
    () => project.packages.filter((file) => builtinPackage(file.id) === undefined),
    [project.packages],
  );
  const [name, setName] = useState(() => explorableImportName(input.name, input.text));
  const [chosen, setChosen] = useState<Id | undefined>(own[0]?.id);
  const [sending, setSending] = useState<Sending>();
  const done = useRef<HTMLButtonElement>(null);
  const bytes = useMemo(() => utf8Length(input.text), [input.text]);
  const prepared = useMemo(
    () =>
      prepareExplorableImport(project, {
        name: input.name,
        text: input.text,
        explorableName: name,
        ...(chosen === undefined || !own.some((file) => file.id === chosen)
          ? {}
          : { package: chosen }),
      }),
    [project, input, name, chosen, own],
  );
  const busy = sending?.state === 'sending';
  const importable = prepared.ok && !busy && sending?.state !== 'done';

  useEffect(() => {
    if (sending?.state === 'done') done.current?.focus();
  }, [sending]);

  async function confirm(): Promise<void> {
    if (!prepared.ok || !importable) return;
    setSending({ state: 'sending' });
    const result = await send(prepared.command);
    setSending(
      result.ok
        ? {
            state: 'done',
            explorable: prepared.explorable,
            name: prepared.name,
            warnings: result.warnings.map((each) => each.message),
          }
        : { state: 'refused', problems: result.problems.map((each) => each.message) },
    );
  }

  if (sending?.state === 'done') {
    return (
      <>
        <h2 id={titleId}>{t('Imported “{name}” as an explorable', { name: input.name })}</h2>
        <p role="status">
          {t(
            'The explorable “{name}” is defined in one of the project’s own packages, with its file in explorables/. One undo takes it back. It has not run: like any explorable from outside, it asks you before it runs.',
            { name: sending.name },
          )}
        </p>
        {sending.warnings.length > 0 && (
          <ul className="import-warnings">
            {sending.warnings.map((warning, at) => (
              <li key={at}>{t.message(warning)}</li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          {session && (
            <button
              type="button"
              onClick={() => {
                onClose();
                session.review(sending.explorable);
              }}
            >
              {t('Review and approve…')}
            </button>
          )}
          <button ref={done} type="button" className="dialog-confirm" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <h2 id={titleId}>{t('Import “{name}” as an explorable', { name: input.name })}</h2>
      {chooser}
      <p className="dialog-note">
        {t(
          'An explorable is a page of HTML, CSS and JavaScript that runs walled off in a frame of its own, beside the canvas, and only once you approve it. Nothing in it runs while it is imported.',
        )}
      </p>
      <label className="import-field">
        <span>{t('Name')}</span>
        <input
          type="text"
          value={name}
          maxLength={200}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {own.length > 1 ? (
        <label className="import-field">
          <span>{t('Package')}</span>
          <select
            value={chosen ?? ''}
            disabled={busy}
            onChange={(event) => setChosen(event.target.value)}
          >
            {own.map((file) => (
              <option key={file.id} value={file.id}>
                {file.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="dialog-note">
          {own[0] === undefined
            ? t('The project has no package of its own yet, so one named after it is made for it.')
            : t('It is defined in the package “{name}”.', { name: own[0].name })}
        </p>
      )}
      <p className="import-format">
        {t('{size} KiB of the {limit} KiB an explorable takes', {
          size: Math.max(1, Math.ceil(bytes / 1024)).toLocaleString(t.language),
          limit: MAX_EXPLORABLE_BYTES / 1024,
        })}
      </p>
      <p className="import-status" role="status">
        {busy ? t('Importing…') : ''}
      </p>
      {!prepared.ok && <Problems problems={prepared.problems} />}
      {sending?.state === 'refused' && <Problems problems={sending.problems} />}
      <div className="dialog-actions">
        <button type="button" disabled={busy} onClick={onBack}>
          {t('Back')}
        </button>
        <button type="button" disabled={busy} onClick={onClose}>
          {t('Cancel')}
        </button>
        <button
          type="button"
          className="dialog-confirm"
          aria-disabled={importable ? undefined : true}
          onClick={importable ? () => void confirm() : undefined}
        >
          {t('Import')}
        </button>
      </div>
    </>
  );
}

function Problems({ problems }: { problems: readonly string[] }) {
  const t = useT();
  if (problems.length === 0) return null;
  return (
    <ul className="import-problem" role="alert">
      {problems.map((problem, at) => (
        <li key={at}>{t.message(problem)}</li>
      ))}
    </ul>
  );
}

/** Import… asks what HTML becomes: a drawing, by default (ADR 0068), or an explorable (ADR 0107). */
export function HtmlImportChoice({
  name,
  value,
  drawing,
  disabled,
  onChange,
}: {
  /** The radio group's name, unique in the dialog. */
  name: string;
  value: 'drawing' | 'explorable';
  /** Whether a drawing can be made here: the local program makes it. */
  drawing: boolean;
  disabled?: boolean;
  onChange: (value: 'drawing' | 'explorable') => void;
}) {
  const t = useT();
  return (
    <fieldset className="import-choices">
      <legend>{t('Import it')}</legend>
      {drawing && (
        <label className="import-choice">
          <input
            type="radio"
            name={name}
            checked={value === 'drawing'}
            disabled={disabled}
            onChange={() => onChange('drawing')}
          />
          {t('As a drawing: a picture of the page, with nothing in it run')}
        </label>
      )}
      <label className="import-choice">
        <input
          type="radio"
          name={name}
          checked={value === 'explorable'}
          disabled={disabled}
          onChange={() => onChange('explorable')}
        />
        {t('As an explorable: the page runs, walled off, once you approve it')}
      </label>
    </fieldset>
  );
}
