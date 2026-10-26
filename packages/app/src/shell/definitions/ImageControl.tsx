import { imagesIn, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { AppearanceImage, Id } from '@visual-anything/schema';
import { useId, useRef, useState, type DragEvent } from 'react';
import { useT } from '../../i18n';
import { ColorControl } from '../inspector/controls';
import type { PictureChoice, ShowOptions } from './imageCommands';
import { IMAGE_FILE_TYPES, prepareImageFile, type PictureCodec } from './imageFiles';
import { ImagePreview } from './ImagePreview';
import { ReplacePicture } from './ReplacePicture';
import './images.css';

interface ImageControlProps {
  project: ProjectSnapshot;
  /** The image the shapes show now, from whichever appearance; none when they show none. */
  shown: AppearanceImage | undefined;
  disabled: boolean;
  /** The action that shows a picture: a new one, one of the project, or the one shown, so placed. */
  actionFor: (choice: PictureChoice, options: ShowOptions) => Command | undefined;
  /** Sends a command; resolves to whether it was done. */
  send: (command: Command) => Promise<boolean>;
  /** What describes the control, such as where the trait comes from. */
  describedBy?: string | undefined;
  /** Decodes and encodes pictures that must be shrunk; the browser's by default. */
  codec?: PictureCodec;
}

/** A placement the select gives, as an appearance stores it. */
function placementOf(value: string): NonNullable<AppearanceImage['placement']> {
  return value === 'drawing' || value === 'parts' ? value : 'icon';
}

/** The longer side of the previews, in pixels. */
const PREVIEW = 40;
const PICK_PREVIEW = 32;
/** The colour a silhouette starts in: the dark grey the canvas writes names in. */
const SILHOUETTE = '#1F2933';

/**
 * Chooses the picture an appearance shows: a file chosen or dropped, cleaned before it is sent, with
 * what cleaning removed said once it is stored; or a picture already in the project, from a grid of
 * previews, so that a picture is reused rather than added again. While a picture shows, it is placed
 * as an icon or as the shape's drawing, and drawn in its colours or as a silhouette of one colour.
 */
export function ImageControl({
  project,
  shown,
  disabled,
  actionFor,
  send,
  describedBy,
  codec,
}: ImageControlProps) {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const placementId = useId();
  const silhouetteId = useId();
  const colorId = useId();
  const reportId = useId();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const catalog = imagesIn(project);
  const current = shown ? catalog.shown(shown.image) : undefined;
  const placement = shown?.placement ?? 'icon';
  const options = (changes: ShowOptions = {}): ShowOptions => ({
    placement,
    ...(shown?.tint === undefined ? {} : { tint: shown.tint }),
    ...changes,
  });

  const run = async (command: Command | undefined): Promise<boolean> => {
    if (!command) return false;
    setBusy(true);
    try {
      return await send(command);
    } finally {
      setBusy(false);
    }
  };

  const choose = async (file: File | undefined) => {
    if (!file || disabled) return;
    setReport(undefined);
    setProblem(undefined);
    setBusy(true);
    // A file whose name gives none is named in the language read in (ADR 0038).
    const prepared = await prepareImageFile(file, codec, t('Picture')).finally(() =>
      setBusy(false),
    );
    if (!prepared.ok) {
      setProblem(t.message(prepared.message));
      return;
    }
    if (!(await run(actionFor({ kind: 'new', picture: prepared }, options())))) return;
    const parts = [
      prepared.removed.length === 0
        ? t('Cleaning removed nothing from “{name}”.', { name: prepared.name })
        : t('Cleaning removed from “{name}”: {removed}.', {
            name: prepared.name,
            // Each kind cleaning removed is a message of the core's.
            removed: prepared.removed.map((each) => t.message(each)).join(', '),
          }),
    ];
    if (prepared.shrunk) {
      parts.push(
        t('It was shrunk to {width} by {height} pixels.', {
          width: prepared.shrunk.width,
          height: prepared.shrunk.height,
        }),
      );
    }
    setReport(parts.join(' '));
  };

  const pick = async (id: Id) => {
    setReport(undefined);
    setProblem(undefined);
    if (await run(actionFor({ kind: 'existing', id }, options()))) setPicking(false);
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    void choose(event.dataTransfer.files[0]);
  };

  const images = [...catalog.images.values()].filter(
    (each) => catalog.shown(each.definition.id) !== undefined,
  );
  const off = disabled || busy;

  return (
    <div
      className="image-control"
      onDragOver={(event) => {
        if (!disabled) event.preventDefault();
      }}
      onDrop={drop}
    >
      {current && (
        <div className="image-control-current">
          <ImagePreview image={current} size={PREVIEW} />
          <span>{catalog.image(current.id)?.definition.name ?? current.id}</span>
        </div>
      )}
      <div className="image-control-actions">
        <button
          type="button"
          className="inspector-action"
          disabled={off}
          aria-describedby={describedBy}
          onClick={() => fileInput.current?.click()}
        >
          {t('Choose an image…')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_FILE_TYPES}
          hidden
          disabled={off}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const [file] = event.target.files ?? [];
            event.target.value = '';
            void choose(file);
          }}
        />
        {images.length > 0 && (
          <button
            type="button"
            className="inspector-action"
            disabled={off}
            aria-expanded={picking}
            onClick={() => setPicking((open) => !open)}
          >
            {t('Use a picture already in the project')}
          </button>
        )}
        {current && (
          <ReplacePicture
            project={project}
            image={current.id}
            disabled={off}
            send={run}
            codec={codec}
          />
        )}
      </div>
      {picking && images.length > 0 && (
        <ul className="image-control-grid" aria-label={t('Pictures in the project')}>
          {images.map(({ definition }) => {
            const cleaned = catalog.shown(definition.id);
            return (
              <li key={definition.id}>
                <button
                  type="button"
                  className="image-control-pick"
                  disabled={off}
                  aria-pressed={shown?.image === definition.id}
                  aria-label={t('Use “{name}”', { name: definition.name })}
                  onClick={() => void pick(definition.id)}
                >
                  {cleaned && <ImagePreview image={cleaned} size={PICK_PREVIEW} />}
                  <span>{definition.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {shown && (
        <div className="image-control-options">
          <label htmlFor={placementId}>{t('Placement')}</label>
          <select
            id={placementId}
            value={placement}
            disabled={off}
            onChange={(event) => {
              const next = placementOf(event.target.value);
              void run(actionFor({ kind: 'same' }, options({ placement: next })));
            }}
          >
            <option value="icon">{t('Icon, beside the name')}</option>
            <option value="drawing">{t('Drawing, in place of the shape')}</option>
            {/* Only an SVG picture has named parts (ADR 0067). */}
            {(current?.kind === 'svg' || placement === 'parts') && (
              <option value="parts">{t('With its parts, which its contents are drawn as')}</option>
            )}
          </select>
          <span className="image-control-silhouette">
            <input
              id={silhouetteId}
              type="checkbox"
              checked={shown.tint !== undefined}
              disabled={off}
              onChange={(event) => {
                const tint = event.target.checked ? { tint: SILHOUETTE } : {};
                void run(actionFor({ kind: 'same' }, { placement, ...tint }));
              }}
            />
            <label htmlFor={silhouetteId}>{t('As a silhouette')}</label>
          </span>
          {shown.tint !== undefined && (
            <>
              <label htmlFor={colorId}>{t('Silhouette color')}</label>
              <ColorControl
                id={colorId}
                label={t('Silhouette color')}
                value={shown.tint}
                disabled={off}
                onCommit={(tint) => run(actionFor({ kind: 'same' }, options({ tint })))}
              />
            </>
          )}
        </div>
      )}
      <p id={reportId} className="image-control-report" aria-live="polite">
        {report}
      </p>
      {problem !== undefined && (
        <p className="inspector-problem" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
