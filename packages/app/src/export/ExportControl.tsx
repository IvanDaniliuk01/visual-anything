/**
 * Export in the header (R27, M6b): a dialog that saves the open view, in the format chosen, each with
 * its size and what it leaves out:
 * - a PNG, of what is visible or the whole view, at 1× or 2×, which the canvas's renderer draws;
 * - the SVG, PDF and text files whose writers are listed in `formats.ts`;
 * - the read-only page (ADR 0041): one HTML file of the whole project, which opens at what the canvas
 *   shows now, and which says so before saving when it is past 25 MB;
 * - while a comparison shows (ADR 0070), its drawings of the view, before, after and the comparison,
 *   as SVG and PDF, and its summary in Markdown, as `versions/exports.ts` makes them.
 * The browser saves each file, so the local program writes nothing.
 */
import type { ProjectSnapshot, ThemeName } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useModalFocus } from '../canvas/focus';
import type { Rect } from '../canvas/geometry';
import type { Scene } from '../canvas/scene';
import { useT, type Translator } from '../i18n';
import { DownloadIcon } from '../shell/icons';
import { holdsConflicts } from '../viewer/data';
import {
  LARGE_PAGE,
  SolidWorkerMissing,
  type ViewerAssets,
  type WrittenPage,
} from '../viewer/page';
import { holdsPoses, solidHashesShown, withPoses } from '../viewer/solids';
import './export.css';
import { isStopped } from './exports';
import { FILE_EXPORTS, type FileExport, type FileExportContext, type MadeFile } from './formats';
import {
  ImageError,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  imageFileName,
  planImage,
  saveImage,
  type ImageArea,
  type ImageProblem,
  type ImageRequest,
  type ImageScale,
} from './image';
import {
  ViewerMissing,
  fetchViewerAssets,
  gatherPageSolids,
  makePage,
  pageFileName,
  sizeText,
  type GatheredSolids,
  type PageSolidForm,
  type PageSolidSource,
} from './page-export';
import type { ImageMaker, ImageSource } from './source';
import { solidPainterOf } from './solid-painter';
import { useSolidClient, useSolidFiles } from '../canvas/solids/useSolidClient';

/** What exporting the read-only page needs of the shell, besides the project. */
export interface PageSource {
  /** The view state the page opens at: what the canvas shows now, as a view address's fragment. */
  start: () => string | undefined;
  /** The viewer's script and stylesheet; fetched from the local program by default. */
  assets?: () => Promise<ViewerAssets>;
  /**
   * Where the page gets the solids its views show (ADR 0075): the program's files and the solid
   * worker, by default those of the live session; none outside one, where they draw placeholders.
   */
  solids?: PageSolidSource;
}

/** The read-only page's source, with the project it is made of. */
interface PageOf extends PageSource {
  project: ProjectSnapshot;
}

interface ExportControlProps {
  /** Where the canvas lends what draws images. */
  source: ImageSource;
  projectName: string;
  /** The open view's name; absent when no view is open, and nothing can be exported. */
  viewName: string | undefined;
  /** Where everything the open view draws lies, in canvas units. */
  bounds: Rect | undefined;
  /** Has the browser save a file; tests replace it. */
  save?: (blob: Blob, name: string) => void;
  /** The project as this tab holds it; without it, only the PNG is offered. */
  project?: ProjectSnapshot;
  /** What the read-only page opens at, and where its viewer comes from. */
  page?: PageSource;
  /** The open view as the canvas draws it, for the SVG, PDF and text writers. */
  drawn?: { view: ViewFile; scene: Scene; theme: ThemeName } | undefined;
  /** The formats besides the PNG and the page; the writers of `formats.ts` by default. */
  files?: readonly FileExport[];
  /** The files of the comparison the canvas shows, if one shows, under its title. */
  comparison?: { title: string; files: readonly FileExport[] } | undefined;
}

/** The header's Export button, and the dialog it opens. */
export function ExportControl({
  source,
  projectName,
  viewName,
  bounds,
  save = saveImage,
  project,
  page,
  drawn,
  files = FILE_EXPORTS,
  comparison,
}: ExportControlProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // The solid worker draws solids' pictures for the SVG and the PDF, as for the canvas (ADR 0075).
  const solidClient = useSolidClient();
  const solids = useMemo(() => solidClient && solidPainterOf(solidClient), [solidClient]);
  // A read-only page holds the solids its views show: the program's files, or the worker's pictures.
  const solidFiles = useSolidFiles();
  const pageSolids = useMemo<PageSolidSource | undefined>(
    () => solidFiles && { files: solidFiles, ...(solids ? { painter: solids } : {}) },
    [solidFiles, solids],
  );
  const drawnWith = drawn && { ...drawn, ...(solids ? { solids } : {}) };
  const opener = useRef<HTMLButtonElement>(null);
  const available = viewName !== undefined;

  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        className="export-button"
        aria-haspopup="dialog"
        aria-disabled={available ? undefined : true}
        title={available ? undefined : t('There is no view to export.')}
        onClick={available ? () => setOpen(true) : undefined}
      >
        <DownloadIcon />
        <span className="export-label">{t('Export…')}</span>
      </button>
      {open && viewName !== undefined && (
        <ExportDialog
          maker={source.maker}
          projectName={projectName}
          viewName={viewName}
          bounds={bounds}
          save={save}
          {...(project && page
            ? {
                page: {
                  ...page,
                  project,
                  ...((page.solids ?? pageSolids) ? { solids: page.solids ?? pageSolids } : {}),
                },
              }
            : {})}
          files={
            drawnWith && project
              ? files.map((format) => ({ format, context: { project, ...drawnWith } }))
              : []
          }
          {...(drawnWith && project && comparison
            ? {
                comparison: {
                  title: comparison.title,
                  files: comparison.files.map((format) => ({
                    format,
                    context: { project, ...drawnWith },
                  })),
                },
              }
            : {})}
          onClose={close}
        />
      )}
    </>
  );
}

/** What can be exported: the PNG, a file of a writer, or the read-only page. */
type Chosen = { kind: 'png' } | { kind: 'file'; id: string } | { kind: 'page' };

interface ExportDialogProps {
  maker: ImageMaker | undefined;
  projectName: string;
  viewName: string;
  bounds: Rect | undefined;
  save: (blob: Blob, name: string) => void;
  page?: PageOf;
  files: readonly OfferedFile[];
  /** The comparison's files, offered under its title. */
  comparison?: { title: string; files: readonly OfferedFile[] };
  onClose: () => void;
}

/** A writer's format, with what it writes. */
interface OfferedFile {
  format: FileExport;
  context: FileExportContext;
}

const AREAS: readonly { area: ImageArea; name: string; hint: string }[] = [
  { area: 'view', name: 'The whole view', hint: 'Everything the view draws' },
  { area: 'visible', name: 'What is visible', hint: 'As the canvas shows it now' },
];

const SCALES: readonly ImageScale[] = [1, 2];

/** How a page can hold the solids its views show (ADR 0075), worded for the person choosing. */
const SOLID_FORMS: readonly { form: PageSolidForm; name: string; hint: string }[] = [
  {
    form: 'files',
    name: 'Turn them in the page',
    hint: 'It holds their files and what draws them, so the page is larger',
  },
  {
    form: 'pictures',
    name: 'Only their pictures',
    hint: 'A smaller page: they show as drawn here, and cannot be turned',
  },
];

type Drawing =
  { state: 'idle' } | { state: 'drawing' } | { state: 'failed'; problem: ImageProblem };

/** A file made, or being made, to know its size before it is saved. */
type Made<T> =
  | { state: 'making' }
  | { state: 'made'; value: T; bytes: number }
  | { state: 'failed'; why: string };

function ExportDialog({
  maker,
  projectName,
  viewName,
  bounds,
  save,
  page,
  files: viewFiles,
  comparison,
  onClose,
}: ExportDialogProps) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  useModalFocus(dialog);
  // What the canvas shows when the dialog opens; the dialog is modal, so it stays so.
  const [seen] = useState(() =>
    maker === undefined ? undefined : { camera: maker.camera, viewport: maker.viewport, bounds },
  );
  const plans = useMemo(() => {
    const plan = (request: ImageRequest) =>
      seen === undefined
        ? ({ ok: false, problem: { reason: 'not-ready' } } as const)
        : planImage(request, seen);
    return Object.fromEntries(
      AREAS.map(({ area }) => [area, SCALES.map((scale) => plan({ area, scale }))]),
    ) as Record<ImageArea, ReturnType<typeof plan>[]>;
  }, [seen]);
  const [chosen, setChosen] = useState<Chosen>({ kind: 'png' });
  const [area, setArea] = useState<ImageArea>('view');
  const [chosenScale, setChosenScale] = useState<ImageScale | undefined>();
  // 2× unless it would be too large.
  const scale: ImageScale = chosenScale ?? (plans[area][1]?.ok === false ? 1 : 2);
  const planned = plans[area][scale - 1];
  const [drawing, setDrawing] = useState<Drawing>({ state: 'idle' });
  const busy = drawing.state === 'drawing';
  const number = useMemo(() => new Intl.NumberFormat(t.language), [t.language]);
  // The files of the writers and the page, made once each is chosen, to say their size; a slow
  // one, a PDF, once it is saved.
  const [madeFiles, setMadeFiles] = useState<Record<string, Made<MadeFile>>>({});
  const [openAtNow, setOpenAtNow] = useState(true);
  const [madePage, setMadePage] = useState<
    Made<WrittenPage> & {
      openAtNow: boolean;
      missing?: number;
      /** Whether it holds some solid's file or picture, rather than the worker for poses alone. */
      solidsHeld?: boolean;
    }
  >();
  // Every writer's file, the view's and the comparison's, found by its format's id.
  const files = useMemo(
    () => [...viewFiles, ...(comparison?.files ?? [])],
    [viewFiles, comparison?.files],
  );
  const offered = files.length > 0 || page !== undefined;

  useEffect(() => {
    saveButton.current?.focus();
  }, []);

  const chosenFile =
    chosen.kind === 'file' ? files.find((each) => each.format.id === chosen.id) : undefined;
  const fileMade = chosenFile ? madeFiles[chosenFile.format.id] : undefined;

  // Which request each writer's file answers, and what stops its writer: stopping, or closing the
  // dialog, stops one on its way and drops what it made.
  const fileRequests = useRef(new Map<string, number>());
  const stoppers = useRef(new Map<string, AbortController>());
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    const writers = stoppers.current;
    return () => {
      open.current = false;
      for (const stopper of writers.values()) stopper.abort();
      writers.clear();
    };
  }, []);

  /**
   * Makes a writer's file: when it is chosen, so that its size shows before it is saved, or for a
   * slow one when it is saved, which then saves it once it is made.
   */
  const makeFile = (id: string, saveWhenMade = false) => {
    const chosenWriter = files.find((each) => each.format.id === id);
    const already = madeFiles[id];
    if (!chosenWriter || already?.state === 'making' || already?.state === 'made') return;
    const request = (fileRequests.current.get(id) ?? 0) + 1;
    fileRequests.current.set(id, request);
    const current = () => open.current && fileRequests.current.get(id) === request;
    const { format, context } = chosenWriter;
    const stopper = new AbortController();
    stoppers.current.set(id, stopper);
    const done = () => {
      if (stoppers.current.get(id) === stopper) stoppers.current.delete(id);
    };
    setMadeFiles((all) => ({ ...all, [id]: { state: 'making' } }));
    format.make(context, stopper.signal).then(
      (made) => {
        done();
        if (!current()) return;
        setMadeFiles((all) => ({
          ...all,
          [id]: { state: 'made', value: made, bytes: made.blob.size },
        }));
        if (saveWhenMade) {
          save(made.blob, made.fileName);
          onClose();
        }
      },
      (error: unknown) => {
        done();
        if (!current()) return;
        // A writer that stopped was stopped, and nothing went wrong: the file is just not made.
        if (isStopped(error, stopper.signal)) {
          forget(id);
          return;
        }
        setMadeFiles((all) => ({
          ...all,
          [id]: { state: 'failed', why: error instanceof Error ? error.message : String(error) },
        }));
      },
    );
  };

  /** Forgets a writer's file, as if it had never been asked for. */
  const forget = (id: string) => {
    setMadeFiles((all) => {
      const left = { ...all };
      delete left[id];
      return left;
    });
  };

  /** Stops a writer's file: its writer stops, and what it made meanwhile is dropped. */
  const stopMaking = (id: string) => {
    fileRequests.current.set(id, (fileRequests.current.get(id) ?? 0) + 1);
    stoppers.current.get(id)?.abort();
    stoppers.current.delete(id);
    forget(id);
  };

  // The page is written once it is chosen, and again when where it opens changes; only the answer
  // to the latest request shows.
  const pageChosen = chosen.kind === 'page';
  const requested = useRef<string | undefined>(undefined);
  // How the page holds the solids its views show, if they show any (ADR 0075).
  const [solidForm, setSolidForm] = useState<PageSolidForm>('files');
  const showsSolids = useMemo(
    () => page !== undefined && solidHashesShown(page.project).length > 0,
    [page],
  );
  // A page whose elements have poses holds the solid worker for its physical-space panel (ADR 0076).
  const posed = useMemo(() => page !== undefined && holdsPoses(page.project), [page]);
  const writePageAt = (asked: boolean, form: PageSolidForm = solidForm) => {
    const request = `${asked} ${form}`;
    if (!page || requested.current === request) return;
    requested.current = request;
    setMadePage({ state: 'making', openAtNow: asked });
    // Without solids, there is nothing to choose: poses are drawn by the worker, from no files.
    const held: PageSolidForm = showsSolids ? form : 'files';
    const holdsWorker = (showsSolids || posed) && held === 'files';
    const assets =
      page.assets ?? (() => fetchViewerAssets(undefined, undefined, { solidWorker: holdsWorker }));
    const source = page.solids;
    Promise.all([
      assets(),
      showsSolids && source
        ? gatherPageSolids(page.project, form, source)
        : Promise.resolve({ missing: 0 }),
    ])
      .then(async ([viewer, gathered]: [ViewerAssets, GatheredSolids]) => ({
        written: await makePage(page.project, viewer, {
          start: asked ? page.start() : undefined,
          made: new Date(),
          solids: withPoses(page.project, gathered.solids, held),
        }),
        missing: showsSolids && !source ? solidHashesShown(page.project).length : gathered.missing,
        solidsHeld: gathered.solids !== undefined,
      }))
      .then(
        ({ written, missing, solidsHeld }) => {
          if (requested.current === request) {
            setMadePage({
              state: 'made',
              value: written,
              bytes: written.bytes,
              openAtNow: asked,
              missing,
              solidsHeld,
            });
          }
        },
        (error: unknown) => {
          if (requested.current !== request) return;
          setMadePage({
            state: 'failed',
            openAtNow: asked,
            why:
              error instanceof ViewerMissing || error instanceof SolidWorkerMissing
                ? t(
                    'This copy of Visual Anything has no viewer for read-only pages, as when it runs from its sources. Run pnpm build, then start it again.',
                  )
                : t('The page could not be written: {why}', {
                    why: error instanceof Error ? error.message : String(error),
                  }),
          });
        },
      );
  };

  const problem =
    chosen.kind !== 'png'
      ? undefined
      : drawing.state === 'failed'
        ? drawing.problem
        : planned?.ok === false && planned.problem.reason !== 'not-ready'
          ? planned.problem
          : undefined;
  const pageMade = pageChosen && madePage?.state === 'made' ? madePage : undefined;
  const fileUnavailable = chosenFile?.format.unavailable(chosenFile.context);
  const savable =
    !busy &&
    (chosen.kind === 'png'
      ? planned?.ok !== false
      : chosenFile
        ? fileMade?.state === 'made' ||
          (chosenFile.format.slow && fileUnavailable === undefined && fileMade === undefined)
        : pageMade !== undefined);
  const large = pageMade?.value.large === true;

  async function draw(): Promise<void> {
    if (!savable) return;
    if (chosen.kind === 'file') {
      if (!chosenFile) return;
      if (fileMade?.state === 'made') {
        save(fileMade.value.blob, fileMade.value.fileName);
        onClose();
      } else if (chosenFile.format.slow) {
        makeFile(chosenFile.format.id, true);
      }
      return;
    }
    if (chosen.kind === 'page') {
      if (pageMade) {
        save(
          new Blob([pageMade.value.html], { type: 'text/html;charset=utf-8' }),
          pageFileName(projectName),
        );
        onClose();
      }
      return;
    }
    const request = { area, scale };
    setDrawing({ state: 'drawing' });
    try {
      // The dialog says it draws before the drawing takes the main thread.
      await nextPaint();
      if (maker === undefined) throw new ImageError({ reason: 'not-ready' });
      const blob = await maker.exportImage(request);
      save(blob, imageFileName(projectName, viewName));
      onClose();
    } catch (error) {
      setDrawing({
        state: 'failed',
        problem:
          error instanceof ImageError
            ? error.problem
            : { reason: 'failed', detail: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  const choose = (next: Chosen) => {
    setChosen(next);
    setDrawing({ state: 'idle' });
    if (next.kind === 'file') {
      const writer = files.find((each) => each.format.id === next.id);
      // A slow file is made when it is saved; one the view cannot give is not made at all.
      if (writer && !writer.format.slow && !writer.format.unavailable(writer.context)) {
        makeFile(next.id);
      }
    } else if (next.kind === 'page') writePageAt(openAtNow);
  };
  const formatGroup = `${titleId}-format`;
  const fileChoice = ({ format, context }: OfferedFile) => {
    const made = madeFiles[format.id];
    const why = format.unavailable(context);
    return (
      <FormatChoice
        key={format.id}
        name={format.name(t)}
        hint={why ?? (made?.state === 'made' ? sizeText(t.language, made.bytes) : format.hint(t))}
        checked={chosen.kind === 'file' && chosen.id === format.id}
        disabled={busy || why !== undefined}
        onChoose={() => choose({ kind: 'file', id: format.id })}
        group={formatGroup}
      />
    );
  };

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2 id={titleId}>
          {offered
            ? t('Export “{view}”', { view: viewName })
            : t('Export “{view}” as PNG', { view: viewName })}
        </h2>
        {offered && (
          <fieldset className="export-choices">
            <legend>{t('Format')}</legend>
            <FormatChoice
              name={t('PNG image')}
              hint={planned === undefined ? '' : sizeOf(t, number, planned)}
              checked={chosen.kind === 'png'}
              disabled={busy}
              onChoose={() => choose({ kind: 'png' })}
              group={formatGroup}
            />
            {viewFiles.map(fileChoice)}
            {page && (
              <FormatChoice
                name={t('Read-only page')}
                hint={
                  madePage?.state === 'made'
                    ? sizeText(t.language, madePage.bytes)
                    : t('One file to share, embed and read on a phone')
                }
                checked={pageChosen}
                disabled={busy}
                onChoose={() => choose({ kind: 'page' })}
                group={formatGroup}
              />
            )}
          </fieldset>
        )}
        {comparison && comparison.files.length > 0 && (
          <fieldset className="export-choices export-comparison">
            <legend>{comparison.title}</legend>
            {comparison.files.map(fileChoice)}
          </fieldset>
        )}
        {chosen.kind === 'png' && (
          <>
            <fieldset className="export-choices">
              <legend>{t('Show')}</legend>
              {AREAS.map((each) => (
                <label key={each.area} className="export-choice">
                  <input
                    type="radio"
                    name={`${titleId}-area`}
                    checked={area === each.area}
                    disabled={busy}
                    onChange={() => {
                      setArea(each.area);
                      setChosenScale(undefined);
                      setDrawing({ state: 'idle' });
                    }}
                  />
                  <span className="export-choice-name">{t(each.name)}</span>{' '}
                  <span className="export-choice-hint">{t(each.hint)}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="export-choices">
              <legend>{t('Size')}</legend>
              {SCALES.map((each) => {
                const plan = plans[area][each - 1];
                return (
                  <label key={each} className="export-choice">
                    <input
                      type="radio"
                      name={`${titleId}-scale`}
                      checked={scale === each}
                      disabled={busy}
                      onChange={() => {
                        setChosenScale(each);
                        setDrawing({ state: 'idle' });
                      }}
                    />
                    <span className="export-choice-name">{`${each}×`}</span>{' '}
                    {plan !== undefined && (
                      <span className="export-choice-hint">{sizeOf(t, number, plan)}</span>
                    )}
                  </label>
                );
              })}
            </fieldset>
            <p className="dialog-note">
              {t(
                'Drawn in the theme the canvas shows, without the selection. The browser saves it.',
              )}
            </p>
            {offered && (
              <LeavesOut
                items={[
                  t(
                    'Its text is part of the picture, so it cannot be selected, searched or read aloud.',
                  ),
                ]}
              />
            )}
            <p className="export-status" role="status">
              {busy ? t('Drawing the image…') : ''}
            </p>
          </>
        )}
        {chosenFile && (
          <>
            <p className="export-status" role="status">
              {fileMade?.state === 'making'
                ? chosenFile.format.slow
                  ? t('Making the file… A large view can take a while.')
                  : t('Writing the file…')
                : ''}
            </p>
            {fileMade?.state === 'making' && chosenFile.format.slow && (
              <button
                type="button"
                className="export-stop"
                onClick={() => stopMaking(chosenFile.format.id)}
              >
                {t('Stop making it')}
              </button>
            )}
            {fileUnavailable !== undefined && <p className="dialog-note">{fileUnavailable}</p>}
            <LeavesOut items={chosenFile.format.leavesOut(chosenFile.context, t)} />
            {fileMade?.state === 'made' && fileMade.value.lost.length > 0 && (
              <div className="export-leaves-out">
                <p className="dialog-note">{t('It could not hold:')}</p>
                <ul className="dialog-note">
                  {fileMade.value.lost.map((lost) => (
                    <li key={lost}>{lost}</li>
                  ))}
                </ul>
              </div>
            )}
            {fileMade?.state === 'failed' && (
              <p className="export-problem" role="alert">
                {t('The file could not be written: {why}', { why: t.message(fileMade.why) })}
              </p>
            )}
          </>
        )}
        {pageChosen && page && (
          <>
            <label className="export-choice">
              <input
                type="checkbox"
                checked={openAtNow}
                onChange={(event) => {
                  setOpenAtNow(event.target.checked);
                  writePageAt(event.target.checked);
                }}
              />
              <span className="export-choice-name">{t('Open at what the canvas shows now')}</span>{' '}
              <span className="export-choice-hint">
                {t('This view, where the canvas looks, the selection, the filters and focus')}
              </span>
            </label>
            {showsSolids && (
              <fieldset className="export-choices">
                <legend>{t('Solids')}</legend>
                {SOLID_FORMS.map((each) => (
                  <label key={each.form} className="export-choice">
                    <input
                      type="radio"
                      name={`${titleId}-solids`}
                      checked={solidForm === each.form}
                      onChange={() => {
                        setSolidForm(each.form);
                        writePageAt(openAtNow, each.form);
                      }}
                    />
                    <span className="export-choice-name">{t(each.name)}</span>{' '}
                    <span className="export-choice-hint">{t(each.hint)}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <p className="export-status" role="status">
              {madePage?.state === 'making' ? t('Writing the page…') : ''}
            </p>
            {pageMade && pageMade.value.solidBytes > 0 && (
              <p className="dialog-note">
                {t(
                  pageMade.solidsHeld === true
                    ? 'Its solids take {size} of it.'
                    : 'Its physical-space panel takes {size} of it.',
                  { size: sizeText(t.language, pageMade.value.solidBytes) },
                )}
              </p>
            )}
            {pageMade && (pageMade.missing ?? 0) > 0 && (
              <p className="dialog-note">
                {t(
                  {
                    one: 'One solid could not be had, and the page draws it as its placeholder.',
                    other:
                      '{count} solids could not be had, and the page draws them as their placeholders.',
                  },
                  { count: pageMade.missing ?? 0 },
                )}
              </p>
            )}
            <p className="dialog-note">
              {t(
                'It holds the whole project, every view, scenario and tour, whatever this view shows: share it only with those who may read all of it. It connects nowhere, and the browser saves it.',
              )}
            </p>
            <LeavesOut
              items={[
                t('Editing, the history and Claude’s guidance: the page only reads.'),
                t(
                  'Layout, which does not run in the page: shapes a view keeps no position for are drawn in a row, as before a layout.',
                ),
                ...(page.project.packages.some((pkg) => pkg.code !== undefined)
                  ? [
                      t(
                        'Package code, and what it computes and draws: no code of a package runs in a page.',
                      ),
                    ]
                  : []),
                // Comments name people, and speaker notes are the presenter's (ADR 0058, ADR 0059).
                ...(page.project.comments.length > 0
                  ? [t('Threads of comments, which name the people who wrote them.')]
                  : []),
                // A page shows what each file keeps, never the other side of a merge (ADR 0041).
                ...(holdsConflicts(page.project)
                  ? [
                      t(
                        'The conflicts a git merge left in the files: the page shows what each file keeps, and neither side’s other values.',
                      ),
                    ]
                  : []),
                ...(page.project.tours.some((tour) => tour.steps.some((step) => step.notes))
                  ? [
                      t(
                        'Speaker notes: its tours play with their captions and marks, and the notes stay with whoever presents.',
                      ),
                    ]
                  : []),
              ]}
            />
            {pageMade && large && (
              <p className="export-problem" role="alert">
                {t(
                  'This page is {size}, past {limit}: it may open slowly, and some hosts and mail refuse files this large.',
                  {
                    size: sizeText(t.language, pageMade.bytes),
                    limit: sizeText(t.language, LARGE_PAGE),
                  },
                )}
              </p>
            )}
            {madePage?.state === 'failed' && (
              <p className="export-problem" role="alert">
                {madePage.why}
              </p>
            )}
          </>
        )}
        {problem !== undefined && (
          <p className="export-problem" role="alert">
            {problemText(t, number, problem)}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            ref={saveButton}
            type="button"
            className="dialog-confirm"
            aria-disabled={savable ? undefined : true}
            onClick={() => void draw()}
          >
            {chosen.kind === 'png'
              ? t('Save PNG')
              : chosenFile
                ? t('Save {format}', { format: chosenFile.format.extension.toUpperCase() })
                : large
                  ? t('Save the page anyway')
                  : t('Save the page')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One format to choose, with its size or what it is. */
function FormatChoice({
  name,
  hint,
  checked,
  disabled,
  onChoose,
  group,
}: {
  name: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChoose: () => void;
  group: string;
}) {
  return (
    <label className="export-choice">
      <input type="radio" name={group} checked={checked} disabled={disabled} onChange={onChoose} />
      <span className="export-choice-name">{name}</span>{' '}
      {hint !== '' && <span className="export-choice-hint">{hint}</span>}
    </label>
  );
}

/** What a format leaves out of the view. */
function LeavesOut({ items }: { items: readonly string[] }) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <div className="export-leaves-out">
      <p className="dialog-note">{t('It leaves out:')}</p>
      <ul className="dialog-note">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** How large a size makes the image, or that it is too large. */
function sizeOf(
  t: Translator,
  number: Intl.NumberFormat,
  plan: ReturnType<typeof planImage> | { ok: false; problem: { reason: 'not-ready' } },
): string {
  if (plan.ok) {
    return t('{width} × {height} pixels', {
      width: number.format(plan.plan.width),
      height: number.format(plan.plan.height),
    });
  }
  const { problem } = plan;
  return problem.reason === 'too-large'
    ? t('Too large: {width} × {height} pixels', {
        width: number.format(problem.width),
        height: number.format(problem.height),
      })
    : '';
}

/** Why an image cannot be drawn, in words, and what to do. */
function problemText(t: Translator, number: Intl.NumberFormat, problem: ImageProblem): string {
  switch (problem.reason) {
    case 'not-ready':
      return t('The canvas is not ready yet. Try again in a moment.');
    case 'empty':
      return t('The view draws nothing yet, so there is no image to save.');
    case 'too-large':
      return t(
        'At {width} × {height} pixels this image is too large: the most is {side} pixels a side and {megapixels} megapixels. Choose 1×, or what is visible.',
        {
          width: number.format(problem.width),
          height: number.format(problem.height),
          side: number.format(MAX_IMAGE_SIDE),
          megapixels: number.format(MAX_IMAGE_PIXELS / 1_000_000),
        },
      );
    case 'failed':
      // The browser's own reasons have entries; a thrown error's message stays as it is.
      return t('The image could not be drawn: {why}', { why: t(problem.detail) });
  }
}

/** Resolves once the browser has shown what changed, so that a long drawing comes after it. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const after = () => setTimeout(resolve, 0);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(after);
    else after();
  });
}
