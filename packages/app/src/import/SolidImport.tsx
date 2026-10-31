/**
 * Import…'s solid step (ADR 0075): a `.glb` or `.gltf` file is sent to the local program in pieces of
 * 1 MiB, which cleans it and holds what it made; the dialog shows what came of it before anything
 * changes: a preview that turns, its size in the unit chosen, meters by default, the up axis, Y by
 * default, its counts and parts, and the report of what cleaning dropped or changed. Another unit or
 * up axis, or simplifying a file past the cap on triangles, prepares it again. The person names it,
 * describes it, which its text alternative needs, says its source, offered from the file's copyright,
 * and its license; Import sends `define-solid`, one action: `Import "arm.glb" as a solid`.
 */
import {
  SHIPPABLE_LICENSES,
  isLicenseId,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { useEffect, useId, useRef, useState } from 'react';
import { useT, type PluralText } from '../i18n';
import type { CommandResult } from '../live/connection';
import { SolidPreview } from '../shell/definitions/SolidPreview';
import { importSolidAction, solidBaseName } from '../shell/definitions/solidCommands';
import { FIRST_CHOICES, usePreparing, type PrepareSolid } from './preparing';
import { CleaningReport, PreparingFields, PreparingProblems } from './PreparingParts';
import { countsText, sizeText } from './solidText';

export type { PrepareSolid } from './preparing';

interface SolidImportProps {
  titleId: string;
  project: ProjectSnapshot;
  file: File;
  prepareSolid: PrepareSolid;
  send: (command: Command) => Promise<CommandResult>;
  onBack: () => void;
  onClose: () => void;
}

type Sending =
  | { state: 'sending' }
  | { state: 'done'; warnings: string[] }
  | { state: 'refused'; problems: string[] };

const MORE: PluralText = { one: '…and {count} more.', other: '…and {count} more.' };

/** How many parts the dialog lists before it says how many more there are. */
const LISTED = 12;

/** The side of the preview, in CSS pixels. */
const PREVIEW = 200;

export function SolidImport({
  titleId,
  project,
  file,
  prepareSolid,
  send,
  onBack,
  onClose,
}: SolidImportProps) {
  const t = useT();
  const nameId = useId();
  const descriptionId = useId();
  const descriptionNote = useId();
  const sourceId = useId();
  const licenseId = useId();
  const [choices, setChoices] = useState(FIRST_CHOICES);
  const preparing = usePreparing(file, prepareSolid, choices);
  const [name, setName] = useState(() => solidBaseName(file.name));
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<string>();
  const [license, setLicense] = useState('');
  const [sending, setSending] = useState<Sending>();
  const done = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (sending?.state === 'done') done.current?.focus();
  }, [sending]);

  const prepared = preparing.state === 'prepared' ? preparing.prepared : undefined;
  // The source starts as the copyright the file held, which goes nowhere else (ADR 0075).
  const sourceShown = source ?? prepared?.source ?? '';
  const licenseProblem =
    license.trim() !== '' && !isLicenseId(license.trim())
      ? t('A license is written by its SPDX identifier, such as CC0-1.0 or CC-BY-4.0.')
      : undefined;
  const busy = preparing.state === 'preparing' || sending?.state === 'sending';
  const importable =
    prepared !== undefined &&
    !busy &&
    sending?.state !== 'done' &&
    name.trim() !== '' &&
    licenseProblem === undefined;

  async function confirm(): Promise<void> {
    if (!importable || prepared === undefined) return;
    setSending({ state: 'sending' });
    const { command } = importSolidAction(project, prepared, file.name, {
      name,
      description,
      source: sourceShown,
      license,
    });
    const result = await send(command);
    setSending(
      result.ok
        ? { state: 'done', warnings: result.warnings.map((each) => each.message) }
        : { state: 'refused', problems: result.problems.map((each) => each.message) },
    );
  }

  if (sending?.state === 'done') {
    return (
      <>
        <h2 id={titleId}>{t('Imported “{name}” as a solid', { name: file.name })}</h2>
        <p role="status">
          {t(
            'The solid is stored in one of the project’s own packages, and its file in the project’s solids/ folder. A component’s Solid section shows it. One undo takes it back.',
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
          <button ref={done} type="button" className="dialog-confirm" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <h2 id={titleId}>{t('Import “{name}” as a solid', { name: file.name })}</h2>
      <div className="import-solid">
        <div className="import-solid-preview">
          {prepared ? (
            <SolidPreview
              hash={prepared.hash}
              name={name}
              label={
                description.trim() === ''
                  ? t('The solid “{name}”, which has no description yet', { name })
                  : description.trim()
              }
              camera={{ azimuth: 30, elevation: 20 }}
              lighting="studio"
              size={PREVIEW}
            />
          ) : (
            <div className="import-drawing-empty" style={{ width: PREVIEW, height: PREVIEW }} />
          )}
          {prepared && (
            <p className="import-format">{sizeText(t, prepared.bounds, choices.units)}</p>
          )}
        </div>
        <div className="import-solid-choices">
          <PreparingFields
            choices={choices}
            disabled={sending?.state === 'sending'}
            onChoose={setChoices}
          />
          <label className="import-field" htmlFor={nameId}>
            <span>{t('Name')}</span>
            <input
              id={nameId}
              type="text"
              value={name}
              maxLength={200}
              disabled={sending?.state === 'sending'}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="import-field" htmlFor={descriptionId}>
            <span>{t('Description')}</span>
            <textarea
              id={descriptionId}
              rows={3}
              maxLength={1000}
              value={description}
              aria-describedby={descriptionNote}
              disabled={sending?.state === 'sending'}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <p id={descriptionNote} className="dialog-note">
            {t(
              'Its description is its text alternative, which the outline, the inspector and screen readers give with its shapes: say what it shows, such as “a six-axis arm on a round base”.',
            )}
          </p>
          <label className="import-field" htmlFor={sourceId}>
            <span>{t('Source')}</span>
            <input
              id={sourceId}
              type="text"
              value={sourceShown}
              maxLength={500}
              disabled={sending?.state === 'sending'}
              onChange={(event) => setSource(event.target.value)}
            />
          </label>
          {prepared?.source !== undefined && (
            <p className="dialog-note">
              {t('The file says: {copyright}', { copyright: prepared.source })}
            </p>
          )}
          <label className="import-field" htmlFor={licenseId}>
            <span>{t('License')}</span>
            <input
              id={licenseId}
              type="text"
              list={`${licenseId}-known`}
              value={license}
              spellCheck={false}
              aria-invalid={licenseProblem === undefined ? undefined : true}
              disabled={sending?.state === 'sending'}
              onChange={(event) => setLicense(event.target.value)}
            />
            <datalist id={`${licenseId}-known`}>
              {SHIPPABLE_LICENSES.map((each) => (
                <option key={each} value={each} />
              ))}
            </datalist>
          </label>
          {licenseProblem !== undefined && (
            <p className="import-problem" role="alert">
              {licenseProblem}
            </p>
          )}
        </div>
      </div>
      <p className="import-status" role="status">
        {preparing.state === 'preparing'
          ? t('Cleaning the file…')
          : sending?.state === 'sending'
            ? t('Importing…')
            : ''}
      </p>
      <PreparingProblems
        preparing={preparing}
        onSimplify={() => setChoices({ ...choices, simplify: true })}
      />
      {prepared && (
        <>
          <p className="import-format">{countsText(t, prepared)}</p>
          {prepared.parts.length > 0 && (
            <details className="import-unmatched">
              <summary>{t('Its named parts')}</summary>
              <ul>
                {prepared.parts.slice(0, LISTED).map((part) => (
                  <li key={part.name}>
                    <code>{part.name}</code>
                  </li>
                ))}
                {prepared.parts.length > LISTED && (
                  <li>{t(MORE, { count: prepared.parts.length - LISTED })}</li>
                )}
              </ul>
            </details>
          )}
          <CleaningReport report={prepared.report} />
        </>
      )}
      {sending?.state === 'refused' && (
        <ul className="import-problem" role="alert">
          {sending.problems.map((problem, at) => (
            <li key={at}>{t.message(problem)}</li>
          ))}
        </ul>
      )}
      <div className="dialog-actions">
        <button type="button" disabled={sending?.state === 'sending'} onClick={onBack}>
          {t('Back')}
        </button>
        <button type="button" disabled={sending?.state === 'sending'} onClick={onClose}>
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
