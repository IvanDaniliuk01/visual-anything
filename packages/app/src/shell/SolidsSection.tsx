/**
 * The Components tab's solids (ADR 0075):
 *
 * - **The packages' solids**, each with its name, description, source, license, size and counts. A
 *   solid of the project's own packages can be changed (name, description, source and license, each
 *   one undoable action), replaced by another file, which says first which anchored parts it would
 *   lose, and removed, which is refused while an appearance shows it.
 * - **The files no package names** in `solids/`, which nothing removes on its own: opening the tab
 *   says how many there are, and Remove deletes one, or all of them, saying first that it cannot be
 *   undone.
 */
import {
  SHIPPABLE_LICENSES,
  builtinPackage,
  isLicenseId,
  modelIndexOf,
  solidPartsLostByReplacing,
  solidUsers,
  solidsIn,
  type Command,
  type SolidPreparedMessage,
  type UnnamedSolidFile,
} from '@visual-anything/core';
import type { Id, SolidDefinition } from '@visual-anything/schema';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { useModalFocus } from '../canvas/focus';
import { useEditor } from '../editor/EditorContext';
import { useT, type PluralText } from '../i18n';
import { FIRST_CHOICES, usePreparing, type PrepareSolid } from '../import/preparing';
import { CleaningReport, PreparingFields, PreparingProblems } from '../import/PreparingParts';
import { countsText, sizeText } from '../import/solidText';
import { LiveContext } from '../live/context';
import { replaceSolidAction, SOLID_FILE_TYPES } from './definitions/solidCommands';
import { useSender } from './definitions/useSender';
import { InlineProblem, TextControl } from './inspector/controls';

const USED_BY: PluralText = {
  one: 'It cannot be removed while {count} thing shows it: {names}.',
  other: 'It cannot be removed while {count} things show it: {names}.',
};
const UNNAMED: PluralText = {
  one: 'The project’s solids/ folder holds {count} file that no package names. It stays until you remove it.',
  other:
    'The project’s solids/ folder holds {count} files that no package names. They stay until you remove them.',
};
const LOSES: PluralText = {
  one: 'The new file lacks {count} part that an element is drawn as. Until a solid has it again, its element is drawn as an ordinary shape; undoing brings it back:',
  other:
    'The new file lacks {count} parts that elements are drawn as. Until a solid has them again, their elements are drawn as ordinary shapes; undoing brings them back:',
};
const MORE: PluralText = { one: '…and {count} more.', other: '…and {count} more.' };

/** How many names and lost parts are listed before saying how many more there are. */
const LISTED = 8;

/** A solid file's path in the project, which is the same in every language. */
function filePath(hash: string): string {
  return `solids/${hash}.glb`;
}

/** The path, its hash cut short, for the list. */
function shortPath(hash: string): string {
  return `solids/${hash.slice(0, 12)}….glb`;
}

/** A size in bytes, in KiB or MiB. */
function bytesText(bytes: number, language: string): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toLocaleString(language, { maximumFractionDigits: 1 })} KiB`;
  }
  return `${(bytes / 1024 / 1024).toLocaleString(language, { maximumFractionDigits: 1 })} MiB`;
}

/** The solids the project's packages define, each with what it says and what can be done to it. */
export function SolidsSection() {
  const t = useT();
  const { project } = useEditor();
  const headingId = useId();
  const solids = [...solidsIn(project).solids.values()];
  return (
    <section className="panel-section components-solids">
      <h3 id={headingId}>{t('Solids')}</h3>
      {solids.length === 0 ? (
        <p className="panel-empty">
          {t(
            'The project has no solid yet: import a .glb or .gltf file with Import… in the header.',
          )}
        </p>
      ) : (
        <ul className="item-list components-solid-list" aria-labelledby={headingId}>
          {solids.map(({ definition, package: packageId }) => (
            <SolidItem key={definition.id} solid={definition} packageId={packageId} />
          ))}
        </ul>
      )}
      <UnnamedSolidFiles />
    </section>
  );
}

function SolidItem({ solid, packageId }: { solid: SolidDefinition; packageId: Id }) {
  const t = useT();
  const { project, send } = useEditor();
  const prepareSolid = useContext(LiveContext)?.prepareSolid;
  const sender = useSender();
  const problemId = useId();
  const usedId = useId();
  const [editing, setEditing] = useState(false);
  const [replacing, setReplacing] = useState<File>();
  const fileInput = useRef<HTMLInputElement>(null);
  const own = !builtinPackage(packageId);
  const editable = own && send !== undefined;
  const users = solidUsers(project, solid.id);
  const index = modelIndexOf(project);
  const definitions = project.packages.flatMap((file) => file.components);
  const nameOf = (id: Id) =>
    index.element(id)?.name ?? definitions.find((each) => each.id === id)?.name ?? id;
  const userNames = users.slice(0, LISTED).map((id) => `“${nameOf(id)}”`);
  const description = solid.description?.trim() ?? '';

  return (
    <li className="components-solid">
      <span className="item-name">{solid.name}</span>
      <p className="item-notes">
        {description === ''
          ? t('No description, so its shapes have no text alternative.')
          : description}
      </p>
      <p className="item-notes">
        {[
          sizeText(t, solid.bounds, 'm'),
          bytesText(solid.bytes, t.language),
          countsText(t, solid),
        ].join(' · ')}
      </p>
      <p className="item-notes">
        {t('Source: {source}', { source: solid.source ?? t('not said') })} ·{' '}
        {t('License: {license}', { license: solid.license ?? t('not said') })}
      </p>
      {editable && (
        <div className="components-actions">
          <button
            type="button"
            className="components-action"
            aria-expanded={editing}
            onClick={() => setEditing((open) => !open)}
          >
            {t('Change…')}
          </button>
          {prepareSolid !== undefined && (
            <>
              <button
                type="button"
                className="components-action"
                aria-haspopup="dialog"
                onClick={() => fileInput.current?.click()}
              >
                {t('Replace…')}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept={SOLID_FILE_TYPES}
                hidden
                tabIndex={-1}
                aria-hidden="true"
                aria-label={t('Replace the file of “{name}”', { name: solid.name })}
                onChange={(event) => {
                  const [file] = event.target.files ?? [];
                  event.target.value = '';
                  if (file) setReplacing(file);
                }}
              />
            </>
          )}
          <button
            type="button"
            className="components-action"
            aria-disabled={users.length > 0 ? true : undefined}
            aria-describedby={
              [
                users.length > 0 ? usedId : undefined,
                sender.problem === undefined ? undefined : problemId,
              ]
                .filter((each) => each !== undefined)
                .join(' ') || undefined
            }
            onClick={
              users.length > 0
                ? undefined
                : () => void sender.send({ type: 'remove-solid', id: solid.id })
            }
          >
            {t('Remove')}
          </button>
        </div>
      )}
      {users.length > 0 && (
        <p id={usedId} className="item-notes">
          {t(USED_BY, {
            count: users.length,
            names:
              userNames.join(', ') +
              (users.length > LISTED ? ` ${t(MORE, { count: users.length - LISTED })}` : ''),
          })}
        </p>
      )}
      {editing && editable && <SolidFields solid={solid} />}
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
      {replacing && prepareSolid !== undefined && (
        <ReplaceSolidDialog
          solid={solid}
          file={replacing}
          prepareSolid={prepareSolid}
          onClose={() => setReplacing(undefined)}
        />
      )}
    </li>
  );
}

/** A solid's name, description, source and license, each committed as one action. */
function SolidFields({ solid }: { solid: SolidDefinition }) {
  const t = useT();
  const sender = useSender();
  const nameId = useId();
  const descriptionId = useId();
  const sourceId = useId();
  const licenseId = useId();
  const problemId = useId();
  const update = (changes: Extract<Command, { type: 'update-solid' }>['changes']) =>
    sender.send({ type: 'update-solid', id: solid.id, changes });
  const optional = (text: string) => (text.trim() === '' ? null : text.trim());
  return (
    <div className="components-solid-fields">
      <label htmlFor={nameId}>{t('Name')}</label>
      <TextControl
        disabled={false}
        id={nameId}
        value={solid.name}
        problemOf={(text) => (text.trim() === '' ? t('A solid needs a name.') : undefined)}
        onCommit={(text) => update({ name: text.trim() })}
      />
      <label htmlFor={descriptionId}>{t('Description, its text alternative')}</label>
      <TextControl
        disabled={false}
        id={descriptionId}
        value={solid.description ?? ''}
        multiline
        onCommit={(text) => update({ description: optional(text) })}
      />
      <label htmlFor={sourceId}>{t('Source')}</label>
      <TextControl
        disabled={false}
        id={sourceId}
        value={solid.source ?? ''}
        onCommit={(text) => update({ source: optional(text) })}
      />
      <label htmlFor={licenseId}>{t('License')}</label>
      <TextControl
        disabled={false}
        id={licenseId}
        value={solid.license ?? ''}
        problemOf={(text) =>
          text.trim() === '' || isLicenseId(text.trim())
            ? undefined
            : t('A license is written by its SPDX identifier, such as CC0-1.0 or CC-BY-4.0.')
        }
        onCommit={(text) => update({ license: optional(text) })}
      />
      <p className="item-notes">
        {t('Licenses that ship with Visual Anything: {licenses}.', {
          licenses: SHIPPABLE_LICENSES.join(', '),
        })}
      </p>
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
    </div>
  );
}

/**
 * Replace… (ADR 0075): the file chosen is prepared as Import… prepares one; the dialog shows what came
 * of it and the anchored parts the new file would lose, with the elements drawn as them, and Replace
 * then defines the solid's id again with the new file, one undoable action.
 */
function ReplaceSolidDialog({
  solid,
  file,
  prepareSolid,
  onClose,
}: {
  solid: SolidDefinition;
  file: File;
  prepareSolid: PrepareSolid;
  onClose: () => void;
}) {
  const t = useT();
  const { project } = useEditor();
  const sender = useSender();
  const titleId = useId();
  const problemId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog);
  const [choices, setChoices] = useState(FIRST_CHOICES);
  const preparing = usePreparing(file, prepareSolid, choices);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('select, button')?.focus();
  }, []);
  const prepared: SolidPreparedMessage | undefined =
    preparing.state === 'prepared' ? preparing.prepared : undefined;
  const lost = prepared ? solidPartsLostByReplacing(project, solid.id, prepared.parts) : [];
  const index = modelIndexOf(project);
  const names = (elements: readonly Id[]) =>
    elements.map((id) => `“${index.element(id)?.name ?? id}”`).join(', ');
  const command = prepared && replaceSolidAction(project, solid.id, prepared, file.name);

  const replace = async () => {
    if (!command) return;
    setBusy(true);
    try {
      if (await sender.send(command)) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onClose();
        }}
      >
        <h2 id={titleId}>
          {t('Replace the solid “{name}” with “{file}”?', { name: solid.name, file: file.name })}
        </h2>
        <PreparingFields choices={choices} disabled={busy} onChoose={setChoices} />
        <p className="import-status" role="status">
          {preparing.state === 'preparing' ? t('Cleaning the file…') : ''}
        </p>
        <PreparingProblems
          preparing={preparing}
          onSimplify={() => setChoices({ ...choices, simplify: true })}
        />
        {prepared && (
          <>
            <p className="import-format">
              {sizeText(t, prepared.bounds, choices.units)} · {countsText(t, prepared)}
            </p>
            {lost.length > 0 ? (
              <>
                <p>{t(LOSES, { count: lost.length })}</p>
                <ul>
                  {lost.slice(0, LISTED).map((part) => (
                    <li key={part.part}>
                      {t('“{part}”, drawn as {elements}', {
                        part: part.part,
                        elements: names(part.elements),
                      })}
                    </li>
                  ))}
                  {lost.length > LISTED && <li>{t(MORE, { count: lost.length - LISTED })}</li>}
                </ul>
              </>
            ) : (
              <p>{t('Every part an element is drawn as is in the new file too.')}</p>
            )}
            <CleaningReport report={prepared.report} />
          </>
        )}
        {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
        <p className="dialog-note">{t('You can undo this.')}</p>
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="dialog-confirm"
            aria-disabled={command === undefined || busy ? true : undefined}
            onClick={command === undefined || busy ? undefined : () => void replace()}
          >
            {t('Replace')}
          </button>
        </div>
      </div>
    </div>
  );
}

type Listing =
  | { state: 'listing' }
  | { state: 'listed'; files: UnnamedSolidFile[] }
  | { state: 'refused'; problem: string };

/**
 * The files in `solids/` that no package names (ADR 0075): opening the tab says how many there are,
 * and Remove deletes one or all of them, after saying that it cannot be undone. Only such files are
 * removed, and only by the person.
 */
function UnnamedSolidFiles() {
  const t = useT();
  const { project } = useEditor();
  const live = useContext(LiveContext);
  const list = live?.listSolidFiles;
  const remove = live?.removeSolidFiles;
  const headingId = useId();
  const [listing, setListing] = useState<Listing>({ state: 'listing' });
  const [asking, setAsking] = useState<readonly string[]>();
  const [said, setSaid] = useState<string[]>([]);
  const packages = project.packages;

  // Listed when the tab opens, and again whenever what the packages name may have changed.
  useEffect(() => {
    if (!list) return;
    let gone = false;
    void list().then((result) => {
      if (gone) return;
      setListing(
        result.ok
          ? { state: 'listed', files: result.answer.files }
          : { state: 'refused', problem: result.problems.map((each) => each.message).join(' ') },
      );
    });
    return () => {
      gone = true;
    };
  }, [list, packages]);

  if (!list || !remove) return null;

  const removeFiles = async (hashes: readonly string[]) => {
    setAsking(undefined);
    const result = await remove(hashes);
    if (!result.ok) {
      setSaid(result.problems.map((each) => each.message));
      return;
    }
    setListing({ state: 'listed', files: result.answer.files });
    setSaid((result.answer.kept ?? []).map((each) => each.message));
  };

  const files = listing.state === 'listed' ? listing.files : [];
  return (
    <div className="components-unnamed">
      <h4 id={headingId}>{t('Files no package names')}</h4>
      <p className="item-notes" role="status">
        {listing.state === 'listing'
          ? t('Looking in the project’s solids/ folder…')
          : listing.state === 'refused'
            ? t.message(listing.problem)
            : files.length === 0
              ? t('Every file in the project’s solids/ folder is named by a package.')
              : t(UNNAMED, { count: files.length })}
      </p>
      {files.length > 0 && (
        <>
          <ul className="item-list" aria-labelledby={headingId}>
            {files.map((file) => (
              <li key={file.hash} className="components-unnamed-file">
                <code title={filePath(file.hash)}>{shortPath(file.hash)}</code>
                <span className="item-notes">{bytesText(file.bytes, t.language)}</span>
                <button
                  type="button"
                  className="components-action"
                  aria-label={t('Remove “solids/{hash}.glb”', { hash: file.hash })}
                  aria-haspopup="dialog"
                  onClick={() => setAsking([file.hash])}
                >
                  {t('Remove')}
                </button>
              </li>
            ))}
          </ul>
          {files.length > 1 && (
            <button
              type="button"
              className="components-action"
              aria-haspopup="dialog"
              onClick={() => setAsking(files.map((each) => each.hash))}
            >
              {t('Remove all {count} files', { count: files.length })}
            </button>
          )}
        </>
      )}
      {said.length > 0 && (
        <ul className="inspector-problem" role="alert">
          {said.map((each, at) => (
            <li key={at}>{t.message(each)}</li>
          ))}
        </ul>
      )}
      {asking && (
        <RemoveFilesDialog
          hashes={asking}
          onConfirm={() => void removeFiles(asking)}
          onCancel={() => setAsking(undefined)}
        />
      )}
    </div>
  );
}

/** Asks before removing files, which cannot be undone. */
function RemoveFilesDialog({
  hashes,
  onConfirm,
  onCancel,
}: {
  hashes: readonly string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useModalFocus(dialog);
  useEffect(() => cancel.current?.focus(), []);
  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h2 id={titleId}>
          {hashes.length === 1
            ? t('Remove the file “solids/{hash}.glb”?', { hash: hashes[0] ?? '' })
            : t('Remove {count} files from the project’s solids/ folder?', {
                count: hashes.length,
              })}
        </h2>
        <p>
          {t(
            'No package names it now, but a version of the project, a branch, or an action you undid may. This cannot be undone: once removed, the file is gone from the folder.',
          )}
        </p>
        <div className="dialog-actions">
          <button ref={cancel} type="button" onClick={onCancel}>
            {t('Cancel')}
          </button>
          <button type="button" className="dialog-confirm dialog-danger" onClick={onConfirm}>
            {t('Remove')}
          </button>
        </div>
      </div>
    </div>
  );
}
