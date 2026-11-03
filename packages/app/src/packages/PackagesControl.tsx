/**
 * "Packages…" in the header (ADR 0089): a dialog listing the project's packages, built in and its
 * own, with what each adds, what its code may reach and where its code stands; the way to review and
 * approve the code, and to turn it off on this computer; and adding a package from a file or a folder
 * on this computer, or updating one of the project's own from a newer file. The local program reads
 * the file the person chose and checks it against the schema, running nothing; the app shows what
 * adding or updating it does, and sends one action, which the core checks again.
 */
import {
  compareVersions,
  packageChanges,
  type ListChanges,
  type PackageChanges,
} from '@visual-anything/core';
import type { Capability, PackageFile } from '@visual-anything/schema';
import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useModalFocus } from '../canvas/focus';
import { useCode, type CodeContextValue } from '../code/context';
import { capabilityText, standingText } from '../code/words';
import { useEditor } from '../editor/EditorContext';
import { useT, type Translator } from '../i18n';
import { LiveContext } from '../live/context';
import { refusalOf } from '../shell/definitions/commands';
import { chosenFilesOf, type ChosenFile } from '../shell/definitions/sharedPackages';
import { useSender } from '../shell/definitions/useSender';
import { PackageIcon } from '../shell/icons';
import {
  MAX_PACKAGE_FILE_BYTES,
  PACKAGE_EXTENSION,
  packageFilesIn,
  packagePlanOf,
  type PackagePlan,
} from './packageFiles';
import { CodeChangeNote } from './CodeChangeNote';
import { packageRowsOf, type PackageRow } from './packageList';
import { menuActions, selectionIds, type OfferedAction } from './offered';
import { useRunPackageAction } from './run';
import './packages.css';

/** The header's Packages… button, and the dialog it opens. */
export function PackagesControl() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={opener}
        type="button"
        className="packages-button"
        aria-haspopup="dialog"
        title={t('Packages…')}
        onClick={() => setOpen(true)}
      >
        <PackageIcon />
        <span className="packages-label">{t('Packages…')}</span>
      </button>
      {open && (
        <PackagesDialog
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        />
      )}
    </>
  );
}

/** A package file read through the local program, or why it was not. */
type Read =
  | { state: 'reading' }
  | { state: 'read'; name: string; file: PackageFile }
  | { state: 'refused'; name: string; problems: string[] };

/** The package files of a folder chosen, each read through the local program. */
interface FolderChoice {
  name: string;
  files: ChosenFile[];
  picked: string | undefined;
}

export function PackagesDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const titleId = useId();
  const addId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog);
  const { project, send, selection, viewId } = useEditor();
  const code = useCode();
  const live = useContext(LiveContext);
  // The actions packages offer here (ADR 0089): those of approved code that runs on this computer.
  const runAction = useRunPackageAction();
  const offeredActions = useMemo(
    () => menuActions(project, code?.packages ?? new Map()),
    [project, code?.packages],
  );
  const readPackageFile = live?.status === 'open' ? live.readPackageFile : undefined;
  const connected = readPackageFile !== undefined && send !== undefined;
  const rows = useMemo(
    () => packageRowsOf(project, code?.packages ?? new Map()),
    [project, code?.packages],
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [read, setRead] = useState<Read>();
  const [folder, setFolder] = useState<FolderChoice>();
  const [done, setDone] = useState<string>();
  // While the approval dialog shows a package's code, this one hides under it, keeping its state.
  const reviewing = code?.reviewing !== undefined;
  const reviewedFrom = useRef<HTMLElement | null>(null);

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('button, input')?.focus();
  }, []);
  useEffect(() => {
    if (folderInput.current) folderInput.current.setAttribute('webkitdirectory', '');
  }, []);
  useEffect(() => {
    if (reviewing) return;
    // Back from the approval dialog: the focus returns to what opened it.
    reviewedFrom.current?.focus();
    reviewedFrom.current = null;
  }, [reviewing]);

  const readFile = async (file: ChosenFile) => {
    setDone(undefined);
    const name = file.path.split('/').at(-1) ?? file.path;
    if (file.size > MAX_PACKAGE_FILE_BYTES) {
      setRead({
        state: 'refused',
        name,
        problems: [t('The file {name} is over 2 MiB.', { name })],
      });
      return;
    }
    if (readPackageFile === undefined) return;
    setRead({ state: 'reading' });
    let text: string;
    try {
      text = await file.text();
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      setRead({
        state: 'refused',
        name,
        problems: [t('The file could not be read: {why}', { why })],
      });
      return;
    }
    const answer = await readPackageFile(name, text);
    setRead(
      answer.ok
        ? { state: 'read', name, file: answer.answer.package }
        : {
            state: 'refused',
            name,
            problems: answer.problems.map((each) => t.message(each.message)),
          },
    );
  };

  const chooseFolder = (list: FileList | null) => {
    if (list === null || list.length === 0) return;
    const files = packageFilesIn(chosenFilesOf(list));
    const name = (list[0]?.webkitRelativePath || list[0]?.name || '').split('/')[0] ?? '';
    const first = files[0];
    setFolder({ name, files, picked: first?.path });
    setRead(undefined);
    if (first !== undefined) void readFile(first);
  };

  return (
    <div className="dialog-backdrop" hidden={reviewing}>
      <div
        ref={dialog}
        className="dialog packages-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <h2 id={titleId}>{t('Packages')}</h2>
        <p className="dialog-note">
          {t(
            'What each package adds to the project, and its code. Package code runs only once you approve it, and you can turn it off on this computer.',
          )}
        </p>
        {rows.length === 0 ? (
          <p className="packages-empty">
            {t('This project uses no package yet. Add one from a package file or a folder below.')}
          </p>
        ) : (
          <ul className="packages-list" aria-label={t('Packages of the project')}>
            {rows.map((row) => (
              <li key={row.file.id}>
                <PackageItem
                  row={row}
                  code={code}
                  onReview={(from) => {
                    reviewedFrom.current = from;
                    code?.review(row.file.id);
                  }}
                  actions={offeredActions.filter((each) => each.package.id === row.file.id)}
                  {...(runAction
                    ? {
                        // The dialog closes, so that the review shows on the canvas behind it.
                        onRun: (action: OfferedAction) => {
                          onClose();
                          runAction(action, selectionIds(selection), viewId);
                        },
                      }
                    : {})}
                />
              </li>
            ))}
          </ul>
        )}

        <section className="packages-add" aria-labelledby={addId}>
          <h3 id={addId}>{t('Add or update from a file')}</h3>
          <p className="dialog-note">
            {t(
              'Choose a package file, or a folder that holds some. A package with the id of one of the project’s own updates it, after showing what changes; any other is added. Nothing it holds runs until you approve its code.',
            )}
          </p>
          <input
            ref={fileInput}
            type="file"
            accept={PACKAGE_EXTENSION}
            hidden
            aria-hidden="true"
            tabIndex={-1}
            data-testid="package-file"
            onChange={(event) => {
              const chosen = event.currentTarget.files?.[0];
              setFolder(undefined);
              if (chosen !== undefined) void readFile(chosenFilesOf([chosen])[0]!);
              event.currentTarget.value = '';
            }}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            hidden
            aria-hidden="true"
            tabIndex={-1}
            data-testid="package-folder"
            onChange={(event) => {
              chooseFolder(event.currentTarget.files);
              event.currentTarget.value = '';
            }}
          />
          <div className="packages-choose">
            <button
              type="button"
              className="packages-action"
              aria-disabled={connected ? undefined : true}
              title={connected ? undefined : t('Visual Anything is not connected')}
              onClick={connected ? () => fileInput.current?.click() : undefined}
            >
              {t('Choose a package file…')}
            </button>
            <button
              type="button"
              className="packages-action"
              aria-disabled={connected ? undefined : true}
              title={connected ? undefined : t('Visual Anything is not connected')}
              onClick={connected ? () => folderInput.current?.click() : undefined}
            >
              {t('Choose a folder…')}
            </button>
          </div>
          {folder !== undefined && (
            <FolderFiles
              folder={folder}
              onPick={(file) => {
                setFolder({ ...folder, picked: file.path });
                void readFile(file);
              }}
            />
          )}
          {read?.state === 'reading' && (
            <p className="dialog-note" role="status">
              {t('Reading the file…')}
            </p>
          )}
          {read?.state === 'refused' && (
            <div className="packages-problem" role="alert">
              <p>{t('{name} cannot be added:', { name: read.name })}</p>
              <ul>
                {read.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}
          {read?.state === 'read' && (
            <FilePreview
              key={`${read.name} ${read.file.id}`}
              file={read.file}
              code={code}
              onDone={(said) => {
                setRead(undefined);
                setFolder(undefined);
                setDone(said);
              }}
            />
          )}
          {done !== undefined && (
            <p className="dialog-note" role="status">
              {done}
            </p>
          )}
        </section>

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One package: its name, what it adds, what its code may reach, and where its code stands. */
function PackageItem({
  row,
  code,
  onReview,
  actions,
  onRun,
}: {
  row: PackageRow;
  code: CodeContextValue | null;
  onReview: (from: HTMLElement) => void;
  /** Its actions offered in this dialog, which its approved code runs (ADR 0089). */
  actions: readonly OfferedAction[];
  onRun?: (action: OfferedAction) => void;
}) {
  const t = useT();
  const nameId = useId();
  // Its changes are sent once accepted, which the project must be open to take.
  const { send } = useEditor();
  const { file, builtIn, view, standing } = row;
  const extensions = view?.code.extensions ?? file.extensions;
  const capabilities: readonly Capability[] = view?.code.capabilities ?? [];
  const granted = view?.status.state === 'approved' ? view.status.granted : undefined;
  // Built-in code is the program's own (ADR 0089's M14.6 clarification): shown, never approved.
  const builtInCode = view?.status.state === 'approved' && view.status.builtIn === true;
  return (
    <article className="packages-item" aria-labelledby={nameId}>
      <h3 id={nameId} className="packages-name">
        {t.definition(file.id, file.name)}
      </h3>
      <p className="dialog-note">
        {[
          builtIn ? t('Built-in package') : t('The project’s own'),
          file.version === undefined
            ? undefined
            : t('Version {version}', { version: file.version }),
          t('{components} and {relationTypes}', {
            components: t(
              { one: '{count} component', other: '{count} components' },
              { count: file.components.length },
            ),
            relationTypes: t(
              { one: '{count} relation type', other: '{count} relation types' },
              { count: file.relationTypes.length },
            ),
          }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {extensions !== undefined && (
        <dl className="packages-adds">
          <Adds term={t('Actions')} labels={extensions.actions?.map((each) => each.label)} />
          <Adds term={t('Importers')} labels={extensions.importers?.map((each) => each.label)} />
          <Adds term={t('Exporters')} labels={extensions.exporters?.map((each) => each.label)} />
          <Adds term={t('Panels')} labels={extensions.panels?.map((each) => each.label)} />
        </dl>
      )}
      {onRun && actions.length > 0 && (
        <div className="packages-run" role="group" aria-label={t('Run its actions')}>
          {actions.map((action) => (
            <button
              key={action.declared.id}
              type="button"
              className="packages-action"
              aria-describedby={nameId}
              title={
                action.declared.description ??
                t('Its changes wait for your review before anything changes.')
              }
              aria-disabled={send === undefined ? true : undefined}
              onClick={send === undefined ? undefined : () => onRun(action)}
            >
              {t('Run “{label}”', { label: action.declared.label })}
            </button>
          ))}
        </div>
      )}
      {capabilities.length > 0 && (
        <ul className="packages-capabilities" aria-label={t('What its code may reach')}>
          {capabilities.map((capability) => (
            <li key={capability}>
              {capabilityText(t, capability)}
              {granted !== undefined && !granted.includes(capability) && (
                <span className="packages-mark">{t('not granted')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p
        className={
          standing === 'none' || standing === 'running' ? 'dialog-note' : 'packages-standing'
        }
      >
        {standingWords(t, row)}
      </p>
      {view !== undefined && code !== null && (
        <div className="packages-controls">
          {view.status.state !== 'too-large' && (
            <button
              type="button"
              className="packages-action"
              onClick={(event) => onReview(event.currentTarget)}
              aria-describedby={nameId}
            >
              {builtInCode
                ? t('Show the code…')
                : view.status.state === 'approved'
                  ? t('Review the code…')
                  : t('Review and approve the code…')}
            </button>
          )}
          <label className="packages-check">
            <input
              type="checkbox"
              checked={view.turnedOff !== true}
              aria-describedby={nameId}
              onChange={(event) => code.turnOff(file.id, !event.currentTarget.checked)}
            />
            {t('Run its code on this computer')}
          </label>
        </div>
      )}
    </article>
  );
}

/** One kind of what a package's code adds, by the labels its file declares; nothing when none. */
function Adds({ term, labels }: { term: string; labels: string[] | undefined }) {
  if (labels === undefined || labels.length === 0) return null;
  return (
    <div>
      <dt>{term}</dt>
      <dd>{labels.join(', ')}</dd>
    </div>
  );
}

/** Where a package's code stands, in words. */
function standingWords(t: Translator, row: PackageRow): string {
  const { view, standing } = row;
  switch (standing) {
    case 'none':
      return t('No code.');
    case 'turned-off':
      return t('Turned off on this computer: its code does not run.');
    case 'waiting':
      return t('Its code waits for approval, so it does not run.');
    case 'running':
      return builtIn(view)
        ? t('Built into Visual Anything: its code runs as part of the program.')
        : t('Approved, and running.');
    case 'approved':
      return builtIn(view)
        ? t(
            'Built into Visual Anything: its code runs as part of the program once the worker starts.',
          )
        : t('Approved: it runs once the worker starts.');
    case 'too-large':
    case 'off':
    case 'failed':
      return (view && standingText(t, view)) ?? '';
  }
}

/** Whether a package's code is the program's own, built in (ADR 0089). */
function builtIn(view: PackageRow['view']): boolean {
  return view?.status.state === 'approved' && view.status.builtIn === true;
}

/** The package files a folder holds, to choose one of. */
function FolderFiles({
  folder,
  onPick,
}: {
  folder: FolderChoice;
  onPick: (file: ChosenFile) => void;
}) {
  const t = useT();
  const name = useId();
  if (folder.files.length === 0) {
    return (
      <p className="packages-empty" role="status">
        {t('The folder {name} holds no package file, at its top or in its packages folder.', {
          name: folder.name,
        })}
      </p>
    );
  }
  return (
    <fieldset className="packages-files">
      <legend>{t('Package files in {name}', { name: folder.name })}</legend>
      {folder.files.map((file) => (
        <label key={file.path} className="packages-check">
          <input
            type="radio"
            name={name}
            checked={folder.picked === file.path}
            onChange={() => onPick(file)}
          />
          {file.path.split('/').slice(1).join('/')}
        </label>
      ))}
    </fieldset>
  );
}

/** What adding or updating the package a file holds does, and the button that does it. */
function FilePreview({
  file,
  code,
  onDone,
}: {
  file: PackageFile;
  code: CodeContextValue | null;
  onDone: (said: string) => void;
}) {
  const t = useT();
  const { project, send } = useEditor();
  const sender = useSender();
  const problemId = useId();
  const plan = useMemo(() => packagePlanOf(project, file), [project, file]);
  const refusal = useMemo(
    () => (plan.ok ? refusalOf(project, plan.command) : undefined),
    [project, plan],
  );
  const updated = plan.ok && plan.kind === 'update' ? plan.current : undefined;
  const changes = useMemo(
    () => (updated === undefined ? undefined : packageChanges(updated, file)),
    [updated, file],
  );
  const name = t.definition(file.id, file.name);
  const problem = !plan.ok
    ? t.message(plan.message)
    : refusal !== undefined
      ? t.message(refusal.message)
      : sender.problem;
  const same = changes?.same === true && plan.ok && plan.kind === 'update' && plan.code === 'same';

  const apply = async () => {
    if (!plan.ok) return;
    if (await sender.send(plan.command)) {
      onDone(
        plan.kind === 'add' ? t('Added “{name}”.', { name }) : t('Updated “{name}”.', { name }),
      );
    }
  };

  return (
    <section className="packages-preview" aria-label={name}>
      <h4>
        {plan.ok && plan.kind === 'update'
          ? t('Update “{name}”', { name })
          : t('Add “{name}”', { name })}
      </h4>
      <p className="dialog-note">
        {[
          file.id,
          file.version === undefined
            ? undefined
            : t('Version {version}', { version: file.version }),
          t('{components} and {relationTypes}', {
            components: t(
              { one: '{count} component', other: '{count} components' },
              { count: file.components.length },
            ),
            relationTypes: t(
              { one: '{count} relation type', other: '{count} relation types' },
              { count: file.relationTypes.length },
            ),
          }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {file.extensions !== undefined && (
        <dl className="packages-adds">
          <Adds term={t('Actions')} labels={file.extensions.actions?.map((each) => each.label)} />
          <Adds
            term={t('Importers')}
            labels={file.extensions.importers?.map((each) => each.label)}
          />
          <Adds
            term={t('Exporters')}
            labels={file.extensions.exporters?.map((each) => each.label)}
          />
          <Adds term={t('Panels')} labels={file.extensions.panels?.map((each) => each.label)} />
        </dl>
      )}
      {plan.ok && plan.kind === 'update' && changes !== undefined && (
        <UpdateChanges current={plan.current} file={file} changes={changes} />
      )}
      {plan.ok && <CodeNote plan={plan} code={code} />}
      {problem !== undefined && (
        <p id={problemId} className="packages-problem" role="alert">
          {problem}
        </p>
      )}
      <div className="packages-choose">
        <button
          type="button"
          className="packages-action packages-confirm"
          aria-disabled={
            send === undefined || problem !== undefined || !plan.ok || same ? true : undefined
          }
          aria-describedby={problem === undefined ? undefined : problemId}
          onClick={
            send === undefined || !plan.ok || refusal !== undefined || same
              ? undefined
              : () => void apply()
          }
        >
          {plan.ok && plan.kind === 'update' ? t('Apply the update') : t('Add this package')}
        </button>
      </div>
    </section>
  );
}

/** What adding or updating does to the package's code, and so to its approval. */
function CodeNote({
  plan,
  code,
}: {
  plan: Extract<PackagePlan, { ok: true }>;
  code: CodeContextValue | null;
}) {
  const t = useT();
  if (plan.kind === 'add') {
    return plan.file.code === undefined ? null : (
      <p className="dialog-note">
        {t('It holds code, which runs only once you approve it, after reading it.')}
      </p>
    );
  }
  const approved = code?.packages.get(plan.current.id)?.status.state === 'approved';
  return (
    <CodeChangeNote
      change={plan.code}
      changed={plan.changed}
      approved={approved}
      className={{ note: 'dialog-note', warning: 'packages-standing' }}
    />
  );
}

/** What updating changes: properties, then definitions and images, and an older version said. */
function UpdateChanges({
  current,
  file,
  changes,
}: {
  current: PackageFile;
  file: PackageFile;
  changes: PackageChanges;
}) {
  const t = useT();
  const older = compareVersions(current.version, file.version) === 1;
  const none = t('none');
  return (
    <>
      {older && (
        <p className="packages-standing">
          {t('The file’s version, {there}, is older than this one, {here}.', {
            there: file.version ?? '',
            here: current.version ?? '',
          })}
        </p>
      )}
      {changes.same ? (
        <p className="dialog-note">
          {t('Its components, relation types and images stay as they are.')}
        </p>
      ) : (
        <>
          {changes.properties.length > 0 && (
            <dl className="packages-adds">
              {changes.properties.map((each) => (
                <div key={each.key}>
                  <dt>{propertyName(t, each.key)}</dt>
                  <dd>
                    {t('{before} → {after}', {
                      before: each.before ?? none,
                      after: each.after ?? none,
                    })}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <Changed heading={t('Components')} changes={changes.components} />
          <Changed heading={t('Relation types')} changes={changes.relationTypes} />
          <Changed heading={t('Images')} changes={changes.images} />
        </>
      )}
    </>
  );
}

function propertyName(t: Translator, key: PackageChanges['properties'][number]['key']): string {
  switch (key) {
    case 'name':
      return t('Name');
    case 'description':
      return t('Description');
    case 'version':
      return t('Version');
    case 'license':
      return t('License');
    case 'attribution':
      return t('Attribution');
  }
}

function Changed({ heading, changes }: { heading: string; changes: ListChanges }) {
  const t = useT();
  const headingId = useId();
  const items = [
    ...changes.added.map((each) => t('Added: “{name}”', { name: each.name })),
    ...changes.changed.map((each) => t('Changed: “{name}”', { name: each.name })),
    ...changes.removed.map((each) => t('Removed: “{name}”', { name: each.name })),
    ...(changes.reordered ? [t('In another order')] : []),
  ];
  if (items.length === 0) return null;
  return (
    <>
      <h5 id={headingId}>{heading}</h5>
      <ul className="packages-changes" aria-labelledby={headingId}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}
