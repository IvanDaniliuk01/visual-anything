/**
 * Export in the header (R27): a dialog that saves the open view as a PNG, what is visible or the whole
 * view, at 1× or 2×, saying how large each makes the image and when one is too large. The canvas's
 * renderer draws it and the browser saves it, so the local program writes nothing.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useModalFocus } from '../canvas/focus';
import type { Rect } from '../canvas/geometry';
import { useT, type Translator } from '../i18n';
import { DownloadIcon } from '../shell/icons';
import './export.css';
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
import type { ImageMaker, ImageSource } from './source';

interface ExportControlProps {
  /** Where the canvas lends what draws images. */
  source: ImageSource;
  projectName: string;
  /** The open view's name; absent when no view is open, and nothing can be exported. */
  viewName: string | undefined;
  /** Where everything the open view draws lies, in canvas units. */
  bounds: Rect | undefined;
  /** Has the browser save an image; tests replace it. */
  save?: (blob: Blob, name: string) => void;
}

/** The header's Export button, and the dialog it opens. */
export function ExportControl({
  source,
  projectName,
  viewName,
  bounds,
  save = saveImage,
}: ExportControlProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
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
          onClose={close}
        />
      )}
    </>
  );
}

interface ExportDialogProps {
  maker: ImageMaker | undefined;
  projectName: string;
  viewName: string;
  bounds: Rect | undefined;
  save: (blob: Blob, name: string) => void;
  onClose: () => void;
}

const AREAS: readonly { area: ImageArea; name: string; hint: string }[] = [
  { area: 'view', name: 'The whole view', hint: 'Everything the view draws' },
  { area: 'visible', name: 'What is visible', hint: 'As the canvas shows it now' },
];

const SCALES: readonly ImageScale[] = [1, 2];

type Drawing =
  { state: 'idle' } | { state: 'drawing' } | { state: 'failed'; problem: ImageProblem };

function ExportDialog({ maker, projectName, viewName, bounds, save, onClose }: ExportDialogProps) {
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
  const [area, setArea] = useState<ImageArea>('view');
  const [chosen, setChosen] = useState<ImageScale | undefined>();
  // 2× unless it would be too large.
  const scale: ImageScale = chosen ?? (plans[area][1]?.ok === false ? 1 : 2);
  const planned = plans[area][scale - 1];
  const [drawing, setDrawing] = useState<Drawing>({ state: 'idle' });
  const busy = drawing.state === 'drawing';
  const problem =
    drawing.state === 'failed'
      ? drawing.problem
      : planned?.ok === false && planned.problem.reason !== 'not-ready'
        ? planned.problem
        : undefined;
  const savable = !busy && planned?.ok !== false;
  const number = useMemo(() => new Intl.NumberFormat(t.language), [t.language]);

  useEffect(() => {
    saveButton.current?.focus();
  }, []);

  async function draw(): Promise<void> {
    if (!savable) return;
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
        <h2 id={titleId}>{t('Export “{view}” as PNG', { view: viewName })}</h2>
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
                  setChosen(undefined);
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
                    setChosen(each);
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
          {t('Drawn in the theme the canvas shows, without the selection. The browser saves it.')}
        </p>
        <p className="export-status" role="status">
          {busy ? t('Drawing the image…') : ''}
        </p>
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
            {t('Save PNG')}
          </button>
        </div>
      </div>
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
      return t('The image could not be drawn: {why}', { why: problem.detail });
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
