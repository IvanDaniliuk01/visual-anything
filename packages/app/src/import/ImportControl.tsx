/**
 * Import… in the header (ADR-0042): a dialog that reads a chosen file or pasted text in this tab, shows
 * what the import will create with counts, maps each kind of thing the file holds to a component or
 * relation type with the built-in suggestions chosen at first, chooses the relation type that nests,
 * lists what matched nothing, and sends the one batch the core makes of it, then reports what was done.
 * It works on any plan any of the core's readers makes. HTML goes to the drawing step instead
 * (`DrawingImport.tsx`, ADR 0068), which the local program makes the drawing for.
 */
import {
  IMPORT_READERS,
  builtinPackage,
  isDrawingFile,
  mappingChoices,
  type Command,
  type ImportPlan,
  type MappingChoice,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useModalFocus } from '../canvas/focus';
import { useT, type Translator } from '../i18n';
import type { CommandResult } from '../live/connection';
import './import.css';
import { diagramFormatsHelp } from './diagram-formats';
import { DrawingImport, type MakeDrawing } from './DrawingImport';
import { SolidImport, type PrepareSolid } from './SolidImport';
import { SOLID_FILE_TYPES, isSolidFileName } from '../shell/definitions/solidCommands';
import { ImportIcon } from '../shell/icons';
import { useCode, usePackageCalls, usePackageChanges } from '../code/context';
import {
  offeredImporters,
  offeredKey,
  packageImporterFor,
  type OfferedImporter,
} from '../packages/offered';
import { importRequest, outcomeText } from '../packages/run';
import {
  ACCEPTED,
  LIVE_MESSAGE_LIMIT,
  keysOf,
  prepare,
  readChosenFile,
  readInput,
  suggestedChoices,
  type Choices,
  type ReadFile,
  type Reading,
} from './importing';

interface ImportControlProps {
  project: ProjectSnapshot;
  /** The open view, whose nesting relation types the import's nesting suggestion follows. */
  viewId: Id | undefined;
  /** Sends a command to the local program; absent while the project cannot be changed. */
  send: ((command: Command) => Promise<CommandResult>) | undefined;
  /** Opens a view on the canvas, as the report's Open the view does. */
  openView?: (id: Id) => void;
  /** Asks the local program to make a drawing of HTML (ADR 0068); absent, HTML is not imported. */
  makeDrawing?: MakeDrawing;
  /** Asks the local program to clean a glTF file as a solid (ADR 0075); absent, none is imported. */
  prepareSolid?: PrepareSolid;
  /** The element selected on the canvas, which can show an imported drawing. */
  selectedElement?: Id;
}

/** The format the dialog offers for HTML, imported as a drawing. */
const DRAWING_FORMAT = 'html';
/** The header's Import button, and the dialog it opens. */
export function ImportControl({
  project,
  viewId,
  send,
  openView,
  makeDrawing,
  prepareSolid,
  selectedElement,
}: ImportControlProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const available = send !== undefined;
  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };
  return (
    <>
      <button
        ref={opener}
        type="button"
        className="import-button"
        aria-haspopup="dialog"
        aria-disabled={available ? undefined : true}
        title={available ? undefined : t('Visual Anything is not connected')}
        onClick={available ? () => setOpen(true) : undefined}
      >
        <ImportIcon />
        <span className="import-label">{t('Import…')}</span>
      </button>
      {open && send !== undefined && (
        <ImportDialog
          project={project}
          viewId={viewId}
          send={send}
          {...(openView === undefined ? {} : { openView })}
          {...(makeDrawing === undefined ? {} : { makeDrawing })}
          {...(prepareSolid === undefined ? {} : { prepareSolid })}
          {...(selectedElement === undefined ? {} : { selectedElement })}
          onClose={close}
        />
      )}
    </>
  );
}

interface ImportDialogProps {
  project: ProjectSnapshot;
  viewId: Id | undefined;
  send: (command: Command) => Promise<CommandResult>;
  openView?: (id: Id) => void;
  makeDrawing?: MakeDrawing;
  prepareSolid?: PrepareSolid;
  selectedElement?: Id;
  onClose: () => void;
}

type Source = 'file' | 'paste';

type Outcome =
  | { state: 'sending' }
  | { state: 'done'; warnings: string[]; view: Id | undefined }
  | { state: 'refused'; problems: string[] };

function ImportDialog({
  project,
  viewId,
  send,
  openView,
  makeDrawing,
  prepareSolid,
  selectedElement,
  onClose,
}: ImportDialogProps) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog);
  const [source, setSource] = useState<Source>('file');
  const [file, setFile] = useState<ReadFile>();
  const [pasted, setPasted] = useState('');
  const [pastedName, setPastedName] = useState('');
  const [format, setFormat] = useState('');
  const [key, setKey] = useState<string>();
  const [reading, setReading] = useState<Reading>();
  const [problems, setProblems] = useState<string[]>([]);
  const [choices, setChoices] = useState<Choices>();
  const [outcome, setOutcome] = useState<Outcome>();
  const [drawing, setDrawing] = useState<{ name: string; text: string }>();
  // A glTF file chosen, which imports as a solid (ADR 0075), and whether its step is open.
  const [solidFile, setSolidFile] = useState<File>();
  const [solidOpen, setSolidOpen] = useState(false);
  // The importers packages add (ADR 0089): their code reads the file, and its changes are reviewed.
  const code = useCode();
  const calls = usePackageCalls();
  const packageChanges = usePackageChanges();
  const importers = useMemo(
    () => (code && calls && packageChanges ? offeredImporters(project, code.packages) : []),
    [code, calls, packageChanges, project],
  );
  const [packageReading, setPackageReading] = useState<OfferedImporter>();
  const step = solidOpen
    ? 'solid'
    : drawing !== undefined
      ? 'drawing'
      : reading === undefined
        ? 'choose'
        : 'map';

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
  }, [step]);

  const input =
    source === 'file'
      ? file?.ok === true
        ? file.input
        : undefined
      : pasted.trim() === ''
        ? undefined
        : { name: pastedName.trim() === '' ? t('pasted text') : pastedName.trim(), text: pasted };

  function read(keyed: string | undefined = key): void {
    if (source === 'file' && solidFile !== undefined && prepareSolid !== undefined) {
      setProblems([]);
      setSolidOpen(true);
      return;
    }
    if (input === undefined) return;
    // A package's importer, chosen or the one for a name no built-in format reads (ADR 0089).
    const importer = packageImporterFor(importers, format, input.name);
    if (importer !== undefined) {
      void readWithPackage(importer, input);
      return;
    }
    // HTML becomes a drawing, which the local program makes (ADR 0068).
    if (format === DRAWING_FORMAT || (format === '' && isDrawingFile(input.name))) {
      setProblems([]);
      setDrawing({ name: input.name, text: input.text });
      return;
    }
    const result = readInput(project, input, {
      ...(format === '' ? {} : { format }),
      ...(keyed === undefined ? {} : { key: keyed }),
    });
    if (!result.ok) {
      setProblems(result.problems);
      return;
    }
    setProblems([]);
    const suggested = suggestedChoices(project, result.reading.plan, viewId);
    // What the person already chose for a kind stays chosen when the file is read again.
    setChoices((last) =>
      last === undefined || reading === undefined
        ? suggested
        : {
            elements: new Map(
              [...suggested.elements].map(([kind, id]) => [kind, last.elements.get(kind) ?? id]),
            ),
            relations: new Map(
              [...suggested.relations].map(([kind, id]) => [kind, last.relations.get(kind) ?? id]),
            ),
            nesting: last.nesting ?? suggested.nesting,
            views: last.views,
          },
    );
    setReading(result.reading);
  }

  /**
   * Reads the file with a package's importer: its code runs, up to 2 s, and its changes open for
   * review on the canvas once the dialog closes; what leaves nothing to review is said here.
   */
  async function readWithPackage(
    importer: OfferedImporter,
    file: { name: string; text: string },
  ): Promise<void> {
    if (!calls || !packageChanges || packageReading !== undefined) return;
    setProblems([]);
    setPackageReading(importer);
    const request = importRequest(calls, importer, file);
    const outcome = await packageChanges.run(request);
    setPackageReading(undefined);
    if (outcome.kind === 'review') {
      onClose();
      return;
    }
    const said = outcomeText(t, request, outcome);
    if (said !== undefined) setProblems([said]);
  }

  const prepared = useMemo(
    () =>
      reading === undefined || choices === undefined
        ? undefined
        : prepare(project, reading.plan, choices),
    [project, reading, choices],
  );
  const tooLarge = prepared?.ok === true && prepared.size > LIVE_MESSAGE_LIMIT;
  const importable = prepared?.ok === true && !tooLarge && outcome === undefined;

  async function confirm(): Promise<void> {
    if (prepared?.ok !== true || !importable || reading === undefined) return;
    setOutcome({ state: 'sending' });
    const { command, ids, plan } = prepared.prepared;
    const result = await send(command);
    if (!result.ok) {
      setOutcome({ state: 'refused', problems: result.problems.map((each) => each.message) });
      return;
    }
    const firstView = plan.views[0];
    setOutcome({
      state: 'done',
      warnings: result.warnings.map((each) => each.message),
      view: firstView === undefined ? undefined : ids.get(firstView.key),
    });
  }

  const name = reading?.plan.source ?? input?.name ?? '';
  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && outcome?.state !== 'sending') onClose();
        }}
      >
        {solidOpen && solidFile !== undefined && prepareSolid !== undefined ? (
          <SolidImport
            titleId={titleId}
            project={project}
            file={solidFile}
            prepareSolid={prepareSolid}
            send={send}
            onBack={() => setSolidOpen(false)}
            onClose={onClose}
          />
        ) : drawing !== undefined && makeDrawing !== undefined ? (
          <DrawingImport
            titleId={titleId}
            project={project}
            viewId={viewId}
            selectedElement={selectedElement}
            input={drawing}
            makeDrawing={makeDrawing}
            send={send}
            onBack={() => setDrawing(undefined)}
            onClose={onClose}
          />
        ) : outcome?.state === 'done' && prepared?.ok === true ? (
          <Report
            titleId={titleId}
            name={name}
            prepared={prepared.prepared}
            warnings={outcome.warnings}
            onClose={onClose}
            {...(outcome.view !== undefined && openView !== undefined
              ? {
                  onOpenView: () => {
                    openView(outcome.view as Id);
                    onClose();
                  },
                }
              : {})}
          />
        ) : reading === undefined || choices === undefined ? (
          <>
            <h2 id={titleId}>{t('Import')}</h2>
            <p className="dialog-note">
              {t(
                'Mermaid diagrams (flowcharts, C4, ER and class diagrams), spreadsheets (CSV or TSV), JSON, Structurizr workspaces, LikeC4 models and draw.io files. The file is read here, in this tab, and nothing in it runs.',
              )}
            </p>
            {makeDrawing !== undefined && (
              <p className="dialog-note">
                {t(
                  'An HTML file or fragment becomes a drawing: a picture of the page that Visual Anything makes without running anything in it or fetching anything it names.',
                )}
              </p>
            )}
            {prepareSolid !== undefined && (
              <p className="dialog-note">
                {t(
                  'A glTF file, .glb or .gltf, becomes a solid: Visual Anything cleans it of anything that runs or names anything outside it, and keeps it in the project’s solids/ folder.',
                )}
              </p>
            )}
            <details className="import-help">
              <summary>{t('Which files it reads')}</summary>
              <dl>
                {diagramFormatsHelp(t).map((format) => (
                  <div key={format.format}>
                    <dt>
                      {format.name} <span className="import-format">{format.files.join(', ')}</span>
                    </dt>
                    <dd>{format.help}</dd>
                  </div>
                ))}
              </dl>
            </details>
            <fieldset className="import-choices">
              <legend>{t('Read from')}</legend>
              {(['file', 'paste'] as const).map((each) => (
                <label key={each} className="import-choice">
                  <input
                    type="radio"
                    name={`${titleId}-source`}
                    checked={source === each}
                    onChange={() => {
                      setSource(each);
                      setProblems([]);
                    }}
                  />
                  {each === 'file' ? t('A file') : t('Pasted text')}
                </label>
              ))}
            </fieldset>
            {source === 'file' ? (
              <label className="import-field">
                <span>{t('File')}</span>
                <input
                  type="file"
                  accept={[
                    ACCEPTED,
                    ...(prepareSolid === undefined ? [] : [SOLID_FILE_TYPES]),
                    ...new Set(importers.flatMap((each) => each.declared.extensions)),
                  ].join(',')}
                  onChange={(event) => {
                    const chosen = event.target.files?.[0];
                    setProblems([]);
                    setSolidFile(undefined);
                    if (chosen === undefined) {
                      setFile(undefined);
                      return;
                    }
                    // A glTF file is binary, and the local program reads it (ADR 0075).
                    if (prepareSolid !== undefined && isSolidFileName(chosen.name)) {
                      setFile(undefined);
                      setSolidFile(chosen);
                      return;
                    }
                    void readChosenFile(chosen).then(setFile);
                  }}
                />
              </label>
            ) : (
              <>
                <label className="import-field">
                  <span>{t('Name')}</span>
                  <input
                    type="text"
                    value={pastedName}
                    placeholder={t('pasted text')}
                    onChange={(event) => setPastedName(event.target.value)}
                  />
                </label>
                <label className="import-field">
                  <span>{t('Text')}</span>
                  <textarea
                    rows={8}
                    spellCheck={false}
                    value={pasted}
                    onChange={(event) => setPasted(event.target.value)}
                  />
                </label>
              </>
            )}
            <label className="import-field">
              <span>{t('Format')}</span>
              <select value={format} onChange={(event) => setFormat(event.target.value)}>
                <option value="">{t('As the file says')}</option>
                {IMPORT_READERS.map((reader) => (
                  <option key={reader.format} value={reader.format}>
                    {t(reader.name)}
                  </option>
                ))}
                {makeDrawing !== undefined && (
                  <option value={DRAWING_FORMAT}>{t('HTML, as a drawing')}</option>
                )}
                {importers.map((importer) => (
                  <option key={offeredKey(importer)} value={offeredKey(importer)}>
                    {t('{label} ({extensions}), from the package “{name}”', {
                      label: importer.declared.label,
                      extensions: importer.declared.extensions.join(', '),
                      name: importer.package.name,
                    })}
                  </option>
                ))}
              </select>
            </label>
            {importers.length > 0 && (
              <p className="dialog-note">
                {t(
                  'Packages read files too: their code reads the file, and what it would change opens for you to accept or decline.',
                )}
              </p>
            )}
            {packageReading !== undefined && (
              <p className="dialog-note" role="status">
                {t('Reading with “{label}”, of the package “{name}”…', {
                  label: packageReading.declared.label,
                  name: packageReading.package.name,
                })}
              </p>
            )}
            {file?.ok === false && source === 'file' && (
              <p className="import-problem" role="alert">
                {file.problem === 'too-large'
                  ? t.message('The file is larger than 32 MiB; an import reads at most 32 MiB.')
                  : t('The file could not be read: {why}', { why: file.detail ?? '' })}
              </p>
            )}
            <Problems problems={problems} />
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="dialog-confirm"
                aria-disabled={
                  packageReading !== undefined ||
                  (input === undefined && !(source === 'file' && solidFile !== undefined))
                    ? true
                    : undefined
                }
                onClick={packageReading === undefined ? () => read() : undefined}
              >
                {t('Read')}
              </button>
            </div>
          </>
        ) : (
          <Mapping
            titleId={titleId}
            project={project}
            reading={reading}
            choices={choices}
            onChoose={setChoices}
            keys={project.model.elements.length > 0 ? keysOf(reading) : []}
            chosenKey={key}
            onKey={(next) => {
              setKey(next);
              read(next);
            }}
            prepared={prepared}
            tooLarge={tooLarge}
            importable={importable}
            outcome={outcome}
            onBack={() => {
              setReading(undefined);
              setChoices(undefined);
              setOutcome(undefined);
            }}
            onCancel={onClose}
            onImport={() => void confirm()}
          />
        )}
      </div>
    </div>
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

interface MappingProps {
  titleId: string;
  project: ProjectSnapshot;
  reading: Reading;
  choices: Choices;
  onChoose: (choices: Choices) => void;
  /** The columns rows may be matched by, when importing again. */
  keys: readonly string[];
  chosenKey: string | undefined;
  onKey: (key: string | undefined) => void;
  prepared: ReturnType<typeof prepare> | undefined;
  tooLarge: boolean;
  importable: boolean;
  outcome: Outcome | undefined;
  onBack: () => void;
  onCancel: () => void;
  onImport: () => void;
}

/** The mapping step: what the import creates, each kind's choice, nesting, and what matched nothing. */
function Mapping({
  titleId,
  project,
  reading,
  choices,
  onChoose,
  keys,
  chosenKey,
  onKey,
  prepared,
  tooLarge,
  importable,
  outcome,
  onBack,
  onCancel,
  onImport,
}: MappingProps) {
  const t = useT();
  const { plan } = reading;
  const available = useMemo(() => mappingChoices(project), [project]);
  const nesting = available.relationTypes.filter((each) => each.nests);
  const busy = outcome?.state === 'sending';
  const unmatched = prepared?.ok === true ? prepared.prepared.plan.unmatched : plan.unmatched;
  return (
    <>
      <h2 id={titleId}>{t('Import “{name}”', { name: plan.source })}</h2>
      {prepared?.ok === true && <Summary t={t} plan={plan} prepared={prepared.prepared} />}
      {prepared?.ok === true && prepared.prepared.packages.length > 0 && (
        <p className="dialog-note">
          {t('It starts using the built-in packages it maps to: {packages}.', {
            packages: prepared.prepared.packages
              .map((id) => t.definition(id, builtinPackage(id)?.name ?? id))
              .join(', '),
          })}
        </p>
      )}
      <KindTable
        caption={t('Elements')}
        heading={t('Component')}
        empty={t('(no component given)')}
        kinds={plan.kinds.elements}
        choices={available.components}
        chosen={choices.elements}
        disabled={busy}
        onChoose={(kind, id) =>
          onChoose({ ...choices, elements: new Map(choices.elements).set(kind, id) })
        }
      />
      <KindTable
        caption={t('Relations')}
        heading={t('Relation type')}
        empty={t('(no relation type given)')}
        kinds={plan.kinds.relations}
        choices={available.relationTypes}
        chosen={choices.relations}
        disabled={busy}
        onChoose={(kind, id) =>
          onChoose({ ...choices, relations: new Map(choices.relations).set(kind, id) })
        }
      />
      {plan.containment.length > 0 && (
        <label className="import-field">
          <span>{t('What sits inside what goes inside through')}</span>
          <select
            value={choices.nesting ?? ''}
            disabled={busy}
            onChange={(event) =>
              onChoose({
                ...choices,
                nesting: event.target.value === '' ? undefined : event.target.value,
              })
            }
          >
            <option value="">{t('Choose a relation type that nests')}</option>
            <DefinitionOptions choices={nesting} />
          </select>
        </label>
      )}
      {keys.length > 0 && (
        <label className="import-field">
          <span>{t('Match rows to the project’s elements by')}</span>
          <select
            value={chosenKey ?? ''}
            disabled={busy}
            onChange={(event) => onKey(event.target.value === '' ? undefined : event.target.value)}
          >
            <option value="">{t('Their id, when the file has one')}</option>
            {keys.map((each) => (
              <option key={each} value={each}>
                {each}
              </option>
            ))}
          </select>
        </label>
      )}
      {plan.views.length > 0 && (
        <label className="import-check">
          <input
            type="checkbox"
            checked={choices.views}
            disabled={busy}
            onChange={(event) => onChoose({ ...choices, views: event.target.checked })}
          />
          {plan.views.length === 1
            ? t('Create its view “{name}”', { name: plan.views[0]?.name ?? '' })
            : t('Create its {count} views', { count: plan.views.length })}
        </label>
      )}
      <Unmatched unmatched={unmatched} />
      {prepared?.ok === false && <Problems problems={prepared.problems} />}
      {tooLarge && prepared?.ok === true && (
        <p className="import-problem" role="alert">
          {t(
            'This import is too large to send from the app: {size} MiB, where the most is {limit} MiB. Import it with visual-anything import instead.',
            {
              size: (prepared.size / 1024 / 1024).toLocaleString(t.language, {
                maximumFractionDigits: 1,
              }),
              limit: LIVE_MESSAGE_LIMIT / 1024 / 1024,
            },
          )}
        </p>
      )}
      {outcome?.state === 'refused' && <Problems problems={outcome.problems} />}
      <p className="import-status" role="status">
        {busy ? t('Importing…') : ''}
      </p>
      <div className="dialog-actions">
        <button type="button" disabled={busy} onClick={onBack}>
          {t('Back')}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          {t('Cancel')}
        </button>
        <button
          type="button"
          className="dialog-confirm"
          aria-disabled={importable ? undefined : true}
          onClick={importable ? onImport : undefined}
        >
          {t('Import')}
        </button>
      </div>
    </>
  );
}

/** What the import creates and updates, in counts. */
function Summary({
  t,
  plan,
  prepared,
}: {
  t: Translator;
  plan: ImportPlan;
  prepared: {
    creates: { elements: number; relations: number; views: number };
    updates: { elements: number; relations: number };
  };
}) {
  const { creates, updates } = prepared;
  return (
    <p>
      {t('It creates {elements}, {relations} and {views}.', {
        elements: t(
          { one: '{count} element', other: '{count} elements' },
          { count: creates.elements },
        ),
        relations: t(
          { one: '{count} relation', other: '{count} relations' },
          { count: creates.relations },
        ),
        views: t({ one: '{count} view', other: '{count} views' }, { count: creates.views }),
      })}{' '}
      {updates.elements > 0 &&
        t(
          {
            one: 'It updates {count} element of the project.',
            other: 'It updates {count} elements of the project.',
          },
          { count: updates.elements },
        )}{' '}
      {updates.relations > 0 &&
        t(
          {
            one: 'It updates {count} relation of the project.',
            other: 'It updates {count} relations of the project.',
          },
          { count: updates.relations },
        )}{' '}
      <span className="import-format">{t('Read as {format}.', { format: plan.format })}</span>
    </p>
  );
}

interface KindTableProps {
  caption: string;
  heading: string;
  empty: string;
  kinds: ImportPlan['kinds']['elements'];
  choices: readonly MappingChoice[];
  chosen: ReadonlyMap<string, Id>;
  disabled: boolean;
  onChoose: (kind: string, id: Id) => void;
}

/** Each kind the file holds, how often, and the definition it maps to. */
function KindTable({
  caption,
  heading,
  empty,
  kinds,
  choices,
  chosen,
  disabled,
  onChoose,
}: KindTableProps) {
  const t = useT();
  if (kinds.length === 0) return null;
  return (
    <table className="import-kinds">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{t('In the file')}</th>
          <th scope="col">{t('How many')}</th>
          <th scope="col">{heading}</th>
        </tr>
      </thead>
      <tbody>
        {kinds.map((kind) => (
          <tr key={kind.kind}>
            <th scope="row">{kind.label === '' ? <em>{empty}</em> : <code>{kind.label}</code>}</th>
            <td>{kind.count.toLocaleString(t.language)}</td>
            <td>
              <select
                aria-label={t('{heading} for {kind}', {
                  heading,
                  kind: kind.label === '' ? empty : kind.label,
                })}
                value={chosen.get(kind.kind) ?? ''}
                disabled={disabled}
                onChange={(event) => onChoose(kind.kind, event.target.value)}
              >
                <DefinitionOptions choices={choices} />
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The definitions to choose from: those in use, then each built-in package not used yet. */
function DefinitionOptions({ choices }: { choices: readonly MappingChoice[] }) {
  const t = useT();
  const inUse = choices.filter((each) => each.inUse);
  const others = new Map<Id, MappingChoice[]>();
  for (const each of choices) {
    if (each.inUse || each.package === undefined) continue;
    others.set(each.package, [...(others.get(each.package) ?? []), each]);
  }
  const option = (each: MappingChoice) => (
    <option key={each.id} value={each.id}>
      {t.definition(each.id, each.name)}
    </option>
  );
  return (
    <>
      <optgroup label={t('In this project')}>{inUse.map(option)}</optgroup>
      {[...others].map(([pack, list]) => (
        <optgroup
          key={pack}
          label={t('{package}, not used yet', {
            package: t.definition(pack, builtinPackage(pack)?.name ?? pack),
          })}
        >
          {list.map(option)}
        </optgroup>
      ))}
    </>
  );
}

/** What matched nothing, quoted as the file writes it, with why. */
function Unmatched({
  unmatched,
  open = false,
}: {
  unmatched: ImportPlan['unmatched'];
  open?: boolean;
}) {
  const t = useT();
  if (unmatched.length === 0) return null;
  return (
    <details className="import-unmatched" open={open}>
      <summary>
        {t(
          { one: '{count} thing matched nothing', other: '{count} things matched nothing' },
          { count: unmatched.length },
        )}
      </summary>
      <ul>
        {unmatched.map(({ text, why }, at) => (
          <li key={at}>
            <q>{text}</q> {t.message(why)}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The report after an import: what it did, its warnings, what matched nothing, and its view. */
function Report({
  titleId,
  name,
  prepared,
  warnings,
  onOpenView,
  onClose,
}: {
  titleId: string;
  name: string;
  prepared: {
    creates: { elements: number; relations: number; views: number };
    updates: { elements: number; relations: number };
    plan: ImportPlan;
    notes: readonly string[];
  };
  warnings: readonly string[];
  onOpenView?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    done.current?.focus();
  }, []);
  return (
    <>
      <h2 id={titleId}>{t('Imported “{name}”', { name })}</h2>
      <p role="status">
        {t('It created {elements}, {relations} and {views}.', {
          elements: t(
            { one: '{count} element', other: '{count} elements' },
            { count: prepared.creates.elements },
          ),
          relations: t(
            { one: '{count} relation', other: '{count} relations' },
            { count: prepared.creates.relations },
          ),
          views: t(
            { one: '{count} view', other: '{count} views' },
            { count: prepared.creates.views },
          ),
        })}{' '}
        {prepared.updates.elements > 0 &&
          t(
            { one: 'It updated {count} element.', other: 'It updated {count} elements.' },
            { count: prepared.updates.elements },
          )}{' '}
        {prepared.updates.relations > 0 &&
          t(
            { one: 'It updated {count} relation.', other: 'It updated {count} relations.' },
            { count: prepared.updates.relations },
          )}{' '}
        {t('One undo takes it all back.')}
      </p>
      {warnings.length > 0 && (
        <ul className="import-warnings">
          {warnings.map((warning, at) => (
            <li key={at}>{t.message(warning)}</li>
          ))}
        </ul>
      )}
      {prepared.notes.length > 0 && (
        <ul className="import-warnings">
          {prepared.notes.map((note, at) => (
            <li key={at}>{t.message(note)}</li>
          ))}
        </ul>
      )}
      <Unmatched unmatched={prepared.plan.unmatched} open />
      <div className="dialog-actions">
        {onOpenView !== undefined && (
          <button type="button" onClick={onOpenView}>
            {t('Open its view')}
          </button>
        )}
        <button ref={done} type="button" className="dialog-confirm" onClick={onClose}>
          {t('Close')}
        </button>
      </div>
    </>
  );
}
