/**
 * Import…'s drawing step (ADR 0068): HTML the person chose or pasted is sent to the local program,
 * which makes the drawing and answers with the cleaned SVG and what it dropped. The dialog shows the
 * drawing as a picture drawn into a canvas, with the report, before anything changes, and lets the
 * person pick its width and who shows it: the selected element, or a new element of a component,
 * Box by default. Importing sends the core's one action, which one undo takes back.
 */
import {
  DRAWING_COMPONENT,
  DRAWING_LIMITS,
  cleanedImage,
  mappingChoices,
  modelIndexOf,
  prepareDrawingImport,
  type Command,
  type DrawingMadeMessage,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { CommandResult, LiveResult } from '../live/connection';
import { ImagePreview } from '../shell/definitions/ImagePreview';
import { LIVE_MESSAGE_LIMIT } from './importing';

/** Asks the local program to make a drawing, as the live connection does. */
export type MakeDrawing = (
  name: string,
  html: string,
  width: number,
) => Promise<LiveResult<DrawingMadeMessage>>;

interface DrawingImportProps {
  titleId: string;
  project: ProjectSnapshot;
  /** The open view, where a new element is made. */
  viewId: Id | undefined;
  /** The element selected on the canvas, which can show the drawing instead of a new one. */
  selectedElement: Id | undefined;
  /** The file's name and its HTML. */
  input: { name: string; text: string };
  makeDrawing: MakeDrawing;
  send: (command: Command) => Promise<CommandResult>;
  onBack: () => void;
  onClose: () => void;
}

type Making =
  | { state: 'making' }
  | { state: 'made'; drawing: DrawingMadeMessage }
  | { state: 'refused'; problems: string[] };

type Sending =
  | { state: 'sending' }
  | { state: 'done'; warnings: string[] }
  | { state: 'refused'; problems: string[] };

/** The longer side of the preview, in pixels. */
const PREVIEW_SIZE = 320;

export function DrawingImport({
  titleId,
  project,
  viewId,
  selectedElement,
  input,
  makeDrawing,
  send,
  onBack,
  onClose,
}: DrawingImportProps) {
  const t = useT();
  const [width, setWidth] = useState<number>(DRAWING_LIMITS.width.initial);
  const [widthText, setWidthText] = useState(String(DRAWING_LIMITS.width.initial));
  const [making, setMaking] = useState<Making>({ state: 'making' });
  const [sending, setSending] = useState<Sending>();
  const selected =
    selectedElement === undefined ? undefined : modelIndexOf(project).element(selectedElement);
  const [onSelected, setOnSelected] = useState(selected !== undefined);
  const components = useMemo(() => mappingChoices(project).components, [project]);
  const [component, setComponent] = useState<Id>(
    components.some((each) => each.id === DRAWING_COMPONENT)
      ? DRAWING_COMPONENT
      : (components[0]?.id ?? 'essence'),
  );
  const done = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let gone = false;
    setMaking({ state: 'making' });
    void makeDrawing(input.name, input.text, width).then((answer) => {
      if (gone) return;
      setMaking(
        answer.ok
          ? { state: 'made', drawing: answer.answer }
          : { state: 'refused', problems: answer.problems.map((each) => each.message) },
      );
    });
    return () => {
      gone = true;
    };
  }, [input, width, makeDrawing]);

  useEffect(() => {
    if (sending?.state === 'done') done.current?.focus();
  }, [sending]);

  const drawing = making.state === 'made' ? making.drawing : undefined;
  const preview = useMemo(
    () =>
      drawing &&
      cleanedImage({
        kind: 'svg',
        id: 'drawing.preview',
        name: input.name,
        width: drawing.width,
        height: drawing.height,
        svg: drawing.svg,
      }),
    [drawing, input.name],
  );
  const prepared = useMemo(() => {
    if (drawing === undefined) return undefined;
    const target =
      onSelected && selected !== undefined
        ? { element: selected.id }
        : { component, ...(viewId === undefined ? {} : { view: viewId }) };
    const result = prepareDrawingImport(project, { name: input.name, svg: drawing.svg, target });
    if (!result.ok) return result;
    const size = new TextEncoder().encode(
      JSON.stringify({ type: 'command', requestId: 'request-0000000000', command: result.command }),
    ).length;
    return { ...result, size };
  }, [drawing, onSelected, selected, component, viewId, project, input.name]);
  const tooLarge = prepared?.ok === true && prepared.size > LIVE_MESSAGE_LIMIT;
  const busy = making.state === 'making' || sending?.state === 'sending';
  const importable = prepared?.ok === true && !tooLarge && !busy && sending?.state !== 'done';

  async function confirm(): Promise<void> {
    if (prepared?.ok !== true || !importable) return;
    setSending({ state: 'sending' });
    const result = await send(prepared.command);
    setSending(
      result.ok
        ? { state: 'done', warnings: result.warnings.map((each) => each.message) }
        : { state: 'refused', problems: result.problems.map((each) => each.message) },
    );
  }

  function applyWidth(): void {
    const asked = Number(widthText);
    if (
      Number.isInteger(asked) &&
      asked >= DRAWING_LIMITS.width.least &&
      asked <= DRAWING_LIMITS.width.most
    ) {
      setWidth(asked);
    } else setWidthText(String(width));
  }

  if (sending?.state === 'done') {
    return (
      <>
        <h2 id={titleId}>{t('Imported “{name}” as a drawing', { name: input.name })}</h2>
        <p role="status">
          {t(
            'The drawing is stored in one of the project’s own packages, and its element shows it. One undo takes it all back.',
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
      <h2 id={titleId}>{t('Import “{name}” as a drawing', { name: input.name })}</h2>
      <div className="import-drawing">
        <div className="import-drawing-preview">
          {preview ? (
            <ImagePreview image={preview} size={PREVIEW_SIZE} />
          ) : (
            <div className="import-drawing-empty" style={{ width: PREVIEW_SIZE, height: 120 }} />
          )}
          {drawing && (
            <p className="import-format">
              {t('{width} × {height} pixels', {
                width: Math.round(drawing.width).toLocaleString(t.language),
                height: Math.round(drawing.height).toLocaleString(t.language),
              })}
            </p>
          )}
        </div>
        <div className="import-drawing-choices">
          <label className="import-field">
            <span>{t('Width in pixels')}</span>
            <input
              type="number"
              min={DRAWING_LIMITS.width.least}
              max={DRAWING_LIMITS.width.most}
              step={1}
              value={widthText}
              disabled={busy}
              onChange={(event) => setWidthText(event.target.value)}
              onBlur={applyWidth}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyWidth();
              }}
            />
          </label>
          <fieldset className="import-choices">
            <legend>{t('Shown by')}</legend>
            {selected !== undefined && (
              <label className="import-choice">
                <input
                  type="radio"
                  name={`${titleId}-target`}
                  checked={onSelected}
                  disabled={busy}
                  onChange={() => setOnSelected(true)}
                />
                {t('The selected element “{name}”', { name: selected.name })}
              </label>
            )}
            <label className="import-choice">
              <input
                type="radio"
                name={`${titleId}-target`}
                checked={!onSelected || selected === undefined}
                disabled={busy}
                onChange={() => setOnSelected(false)}
              />
              {t('A new element of')}
            </label>
            <select
              aria-label={t('Component')}
              value={component}
              disabled={busy || (onSelected && selected !== undefined)}
              onChange={(event) => setComponent(event.target.value)}
            >
              {components.map((each) => (
                <option key={each.id} value={each.id}>
                  {t.definition(each.id, each.name)}
                </option>
              ))}
            </select>
          </fieldset>
        </div>
      </div>
      <p className="import-status" role="status">
        {making.state === 'making'
          ? t('Making the drawing…')
          : sending?.state === 'sending'
            ? t('Importing…')
            : ''}
      </p>
      {making.state === 'refused' && <Problems problems={making.problems} />}
      {drawing && (
        <details className="import-unmatched" open={drawing.report.length > 0}>
          <summary>{t('What making it dropped')}</summary>
          {drawing.report.length === 0 ? (
            <p>{t('Nothing: the HTML held only what a drawing keeps.')}</p>
          ) : (
            <ul>
              {drawing.report.map((line, at) => (
                <li key={at}>{t.message(line)}</li>
              ))}
            </ul>
          )}
        </details>
      )}
      {prepared?.ok === false && <Problems problems={prepared.problems} />}
      {tooLarge && (
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
      {sending?.state === 'refused' && <Problems problems={sending.problems} />}
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
