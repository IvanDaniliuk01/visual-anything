import {
  SVG_CAPS,
  partPicture,
  readGeometry,
  type Command,
  type Outline,
  type ShapeColors,
} from '@visual-anything/core';
import type { FreeGeometry } from '@visual-anything/schema';
import { useId, useRef, useState } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { readNumber } from '../inspector/attributes';
import { CheckboxControl, TextControl } from '../inspector/controls';
import { GeometryPreview } from './GeometryPreview';
import { ImagePreview } from './ImagePreview';
import {
  geometryFromPart,
  geometryFromPathData,
  geometryFromSvg,
  labelAreaOf,
  nameFitsInside,
  namedPartsOf,
  pathDataOf,
  svgPicturesIn,
  withKeepProportions,
  withLabel,
  type GeometryReading,
  type PartPicture,
} from './shape';
import type { TraitControl } from './TraitRow';
import './shape.css';

interface GeometryEditorProps {
  /** The free geometry its shapes are drawn by, wherever it comes from; none while their kind is. */
  geometry: FreeGeometry | undefined;
  /** What the level edited stores: its own geometry, `none`, or nothing, so that it is inherited. */
  stored: FreeGeometry | 'none' | undefined;
  /** The size its shapes are drawn at, which the preview keeps. */
  width: number;
  height: number;
  /** The colors its shapes are drawn in, in the theme shown. */
  colors: ShapeColors;
  readOnly: boolean;
  control: TraitControl;
  /** The one command that gives its shapes this geometry, or none, so that their kind is drawn. */
  commandFor: (geometry: FreeGeometry | 'none') => Command;
}

/** The outline of free geometry, read by the core; none for geometry it cannot read. */
function outlineOf(geometry: FreeGeometry | undefined): Outline | undefined {
  if (geometry === undefined) return undefined;
  const reading = readGeometry(geometry);
  return reading.ok ? reading.outline : undefined;
}

/** A number as the label area's fields show it: to a tenth of a unit. */
function shown(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/**
 * Free geometry in the Shape section (ADR 0066): what its shapes are drawn by now, with a live
 * preview drawn as the canvas draws it; path data typed in, with the box it is written in; the
 * outline of an SVG file or a copy of a named part's; Keep proportions; the label area; and None,
 * which draws their kind again. Each change sends one command, so it is one undoable action.
 */
export function GeometryEditor({
  geometry,
  stored,
  width,
  height,
  colors,
  readOnly,
  control,
  commandFor,
}: GeometryEditorProps) {
  const t = useT();
  const { project } = useEditor();
  const fileInput = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string>();
  const [copying, setCopying] = useState(false);
  const [busy, setBusy] = useState(false);
  // What was typed in the path data form, for the form of the geometry shown when it was typed.
  const [draft, setDraft] = useState<{ key: string; reading: GeometryReading }>();
  const outline = outlineOf(geometry);
  const pictures = svgPicturesIn(project);
  const formKey = `${pathDataOf(geometry)} ${geometry?.width ?? ''} ${geometry?.height ?? ''}`;
  const typed = draft?.key === formKey ? draft.reading : undefined;
  const previewed = typed?.ok ? typed.outline : outline;
  const off = readOnly || busy;

  const apply = async (next: FreeGeometry | 'none'): Promise<boolean> => {
    setBusy(true);
    try {
      return await control.send(commandFor(next));
    } finally {
      setBusy(false);
    }
  };

  const applyReading = async (reading: GeometryReading) => {
    if (!reading.ok) {
      setProblem(t.message(reading.message));
      return;
    }
    setProblem(undefined);
    await apply(reading.geometry);
  };

  const choose = async (file: File | undefined) => {
    if (!file || readOnly) return;
    setProblem(undefined);
    if (file.size > SVG_CAPS.input) {
      setProblem(t.message('An SVG picture holds at most 512 KiB of text.'));
      return;
    }
    setBusy(true);
    const text = await file.text().finally(() => setBusy(false));
    await applyReading(geometryFromSvg(text));
  };

  return (
    <div className="geometry-editor">
      <p className="definition-value">
        {outline === undefined || geometry === undefined
          ? stored === 'none'
            ? t('None: its shapes are drawn as their kind, whatever is inherited.')
            : t('None: its shapes are drawn as their kind.')
          : t(
              {
                one: '{count} contour in a box of {width} by {height}',
                other: '{count} contours in a box of {width} by {height}',
              },
              { count: outline.contours.length, width: geometry.width, height: geometry.height },
            )}
      </p>
      {previewed && (
        <>
          <GeometryPreview outline={previewed} width={width} height={height} colors={colors} />
          {!nameFitsInside(previewed, width, height) && (
            <p className="inspector-notes">
              {t(
                'At {width} by {height}, its name does not fit inside its outline: the hover and selection marks write it beside the shape.',
                { width, height },
              )}
            </p>
          )}
        </>
      )}
      <PathDataForm
        // A new form for each geometry shown, so that what was typed for another is not kept.
        key={formKey}
        geometry={geometry}
        readOnly={off}
        describedBy={control.describedBy}
        onDraft={(reading) => setDraft(reading && { key: formKey, reading })}
        onUse={async (reading) => {
          if (!reading.ok) return false;
          const done = await apply(reading.geometry);
          if (done) setDraft(undefined);
          return done;
        }}
      />
      {!readOnly && (
        <div className="definition-actions">
          <button
            type="button"
            className="inspector-action"
            disabled={off}
            onClick={() => fileInput.current?.click()}
          >
            {t('Take the outline of an SVG file…')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".svg,image/svg+xml"
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
          {pictures.length > 0 && (
            <button
              type="button"
              className="inspector-action"
              disabled={off}
              aria-expanded={copying}
              onClick={() => setCopying((open) => !open)}
            >
              {t('Copy the outline of a named part…')}
            </button>
          )}
          {geometry !== undefined && (
            <button
              type="button"
              className="inspector-action"
              disabled={off}
              onClick={() => void apply('none')}
            >
              {t('Draw its kind instead')}
            </button>
          )}
        </div>
      )}
      {copying && !readOnly && (
        <PartOutlinePicker
          pictures={pictures}
          disabled={off}
          onCopy={async (picture, part) => {
            const reading = geometryFromPart(picture.picture, part);
            await applyReading(reading);
            if (reading.ok) setCopying(false);
          }}
        />
      )}
      {problem !== undefined && (
        <p className="inspector-problem" role="alert">
          {problem}
        </p>
      )}
      {geometry !== undefined && outline !== undefined && (
        <GeometryOptions geometry={geometry} outline={outline} readOnly={off} apply={apply} />
      )}
    </div>
  );
}

interface PathDataFormProps {
  geometry: FreeGeometry | undefined;
  readOnly: boolean;
  describedBy: string;
  /** What was typed, read by the core, for the preview; `undefined` while nothing was. */
  onDraft: (reading: GeometryReading | undefined) => void;
  onUse: (reading: GeometryReading) => Promise<boolean>;
}

/** Why a typed size of the box cannot be used, which the inspector says through `t()`. */
const BOX_PROBLEM = 'Enter a size above 0, at most 100,000.';

/** A typed size of the box, or `undefined` when left empty to fit the path. */
function boxSide(text: string): number | undefined | 'invalid' {
  if (text.trim() === '') return undefined;
  const reading = readNumber(text);
  return reading.ok ? reading.value : 'invalid';
}

/**
 * Path data typed in, with the box it is written in, each side left empty to end where the path
 * does: read by the core as it is typed, so that the preview shows it and a problem says why it
 * cannot be used; Use this path data sends it.
 */
function PathDataForm({ geometry, readOnly, describedBy, onDraft, onUse }: PathDataFormProps) {
  const t = useT();
  const pathId = useId();
  const widthId = useId();
  const heightId = useId();
  const problemId = useId();
  const initial = {
    d: pathDataOf(geometry),
    width: geometry === undefined ? '' : String(geometry.width),
    height: geometry === undefined ? '' : String(geometry.height),
  };
  const [typed, setTyped] = useState(initial);
  const changed =
    typed.d !== initial.d || typed.width !== initial.width || typed.height !== initial.height;

  const readingOf = (next: typeof typed): GeometryReading => {
    const sides = [boxSide(next.width), boxSide(next.height)];
    if (sides.includes('invalid')) {
      return { ok: false, message: BOX_PROBLEM };
    }
    const [boxWidth, boxHeight] = sides as (number | undefined)[];
    return geometryFromPathData(
      next.d,
      {
        ...(boxWidth === undefined ? {} : { width: boxWidth }),
        ...(boxHeight === undefined ? {} : { height: boxHeight }),
      },
      {
        ...(geometry?.keepProportions === true ? { keepProportions: true } : {}),
        ...(geometry?.label === undefined ? {} : { label: geometry.label }),
      },
    );
  };
  const reading = changed ? readingOf(typed) : undefined;

  const type = (changes: Partial<typeof typed>) => {
    const next = { ...typed, ...changes };
    setTyped(next);
    const same =
      next.d === initial.d && next.width === initial.width && next.height === initial.height;
    onDraft(same ? undefined : readingOf(next));
  };

  return (
    <div className="geometry-path" role="group" aria-label={t('Path data')}>
      <label htmlFor={pathId} className="geometry-path-label">
        {t('SVG path data')}
      </label>
      <textarea
        id={pathId}
        className="geometry-path-data"
        rows={3}
        spellCheck={false}
        value={typed.d}
        disabled={readOnly}
        aria-describedby={[describedBy, reading && !reading.ok ? problemId : '']
          .filter((each) => each !== '')
          .join(' ')}
        onChange={(event) => type({ d: event.target.value })}
      />
      <div className="geometry-box">
        <label htmlFor={widthId}>{t('Box width')}</label>
        <input
          id={widthId}
          type="number"
          value={typed.width}
          placeholder={t('Fits the path')}
          disabled={readOnly}
          onChange={(event) => type({ width: event.target.value })}
        />
        <label htmlFor={heightId}>{t('Box height')}</label>
        <input
          id={heightId}
          type="number"
          value={typed.height}
          placeholder={t('Fits the path')}
          disabled={readOnly}
          onChange={(event) => type({ height: event.target.value })}
        />
      </div>
      <p id={problemId} className="inspector-problem" aria-live="polite">
        {reading && !reading.ok
          ? reading.message === BOX_PROBLEM
            ? t(BOX_PROBLEM)
            : t.message(reading.message)
          : ''}
      </p>
      {!readOnly && (
        <div className="definition-actions">
          <button
            type="button"
            className="inspector-action"
            disabled={!reading?.ok}
            onClick={() => {
              if (reading?.ok) void onUse(reading);
            }}
          >
            {t('Use this path data')}
          </button>
          {changed && (
            <button
              type="button"
              className="inspector-action"
              onClick={() => {
                setTyped(initial);
                onDraft(undefined);
              }}
            >
              {t('Cancel')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface PartOutlinePickerProps {
  pictures: readonly PartPicture[];
  disabled: boolean;
  onCopy: (picture: PartPicture, part: string) => Promise<void>;
}

/**
 * Chooses a named part of a picture of the project whose outline is copied as free geometry: the
 * picture, then one of its parts, with the part's own picture as a preview. A copy is not the part:
 * it stays as it is when the picture changes.
 */
function PartOutlinePicker({ pictures, disabled, onCopy }: PartOutlinePickerProps) {
  const t = useT();
  const pictureId = useId();
  const partId = useId();
  const [chosen, setChosen] = useState(pictures[0]?.id);
  const [part, setPart] = useState('');
  const picture = pictures.find((each) => each.id === chosen) ?? pictures[0];
  const parts = namedPartsOf(picture?.picture);
  const own = picture && part !== '' ? partPicture(picture.picture, part) : undefined;

  return (
    <div className="geometry-copy" role="group" aria-label={t('Copy the outline of a named part')}>
      <label htmlFor={pictureId}>{t('Picture')}</label>
      <select
        id={pictureId}
        value={picture?.id ?? ''}
        disabled={disabled}
        onChange={(event) => {
          setChosen(event.target.value);
          setPart('');
        }}
      >
        {pictures.map((each) => (
          <option key={each.id} value={each.id}>
            {each.name}
          </option>
        ))}
      </select>
      {parts.length === 0 ? (
        <p className="inspector-notes">{t('This picture has no named parts.')}</p>
      ) : (
        <>
          <label htmlFor={partId}>{t('Named part')}</label>
          <select
            id={partId}
            value={part}
            disabled={disabled}
            onChange={(event) => setPart(event.target.value)}
          >
            <option value="">{t('Choose a part…')}</option>
            {parts.map((each) => (
              <option key={each.id} value={each.id}>
                {each.id}
              </option>
            ))}
          </select>
        </>
      )}
      {own && <ImagePreview image={own} size={40} />}
      <p className="inspector-notes">
        {t(
          'A copy of its outline stays as it is when the picture changes; to draw the shapes as the part itself, choose it under Drawn as a part.',
        )}
      </p>
      <button
        type="button"
        className="inspector-action"
        disabled={disabled || picture === undefined || part === ''}
        onClick={() => {
          if (picture && part !== '') void onCopy(picture, part);
        }}
      >
        {t('Copy its outline')}
      </button>
    </div>
  );
}

interface GeometryOptionsProps {
  geometry: FreeGeometry;
  outline: Outline;
  readOnly: boolean;
  apply: (geometry: FreeGeometry) => Promise<boolean>;
}

type LabelField = 'x' | 'y' | 'width' | 'height';

const LABEL_FIELDS: readonly { field: LabelField; name: string }[] = [
  { field: 'x', name: 'Label area’s x' },
  { field: 'y', name: 'Label area’s y' },
  { field: 'width', name: 'Label area’s width' },
  { field: 'height', name: 'Label area’s height' },
];

/** Why a typed number of the label area cannot be used; `undefined` when it can. */
function labelProblem(field: LabelField, text: string): string | undefined {
  const reading = readNumber(text);
  if (!reading.ok) return 'Enter a number.';
  if ((field === 'width' || field === 'height') && !(reading.value > 0)) {
    return 'Enter a size above 0, at most 100,000.';
  }
  return undefined;
}

/**
 * Keep proportions, and the label area the shapes write their name and detail in, in the box's
 * coordinates: their own, or worked out as the canvas works it out. Each committed field sends the
 * whole geometry with that change, as one command.
 */
function GeometryOptions({ geometry, outline, readOnly, apply }: GeometryOptionsProps) {
  const t = useT();
  const keepId = useId();
  const labelId = useId();
  const fieldIds = [useId(), useId(), useId(), useId()];
  const area = geometry.label ?? labelAreaOf(outline);
  const current = {
    x: Math.round(area.x * 10) / 10,
    y: Math.round(area.y * 10) / 10,
    width: Math.round(area.width * 10) / 10,
    height: Math.round(area.height * 10) / 10,
  };

  return (
    <>
      <div className="definition-check">
        <CheckboxControl
          id={keepId}
          checked={geometry.keepProportions === true}
          disabled={readOnly}
          onCommit={(on) => apply(withKeepProportions(geometry, on))}
        />
        <label htmlFor={keepId}>{t('Keep proportions')}</label>
      </div>
      <div className="geometry-label" role="group" aria-labelledby={labelId}>
        <span id={labelId} className="definition-trait-label">
          {t('Label area')}
        </span>
        <p className="inspector-notes">
          {geometry.label === undefined
            ? t(
                'Worked out: the largest rectangle around a point well inside the outline, in the box’s units.',
              )
            : t('Its own, in the box’s units.')}
        </p>
        <div className="geometry-label-fields">
          {LABEL_FIELDS.map(({ field, name }, at) => (
            <div key={field} className="inspector-control">
              <label htmlFor={fieldIds[at]}>{t(name)}</label>
              <TextControl
                id={fieldIds[at] as string}
                value={shown(area[field])}
                inputType="number"
                disabled={readOnly}
                problemOf={(text) => {
                  const problem = labelProblem(field, text);
                  return problem === undefined ? undefined : t(problem);
                }}
                onCommit={async (text) => {
                  const reading = readNumber(text);
                  if (!reading.ok) return;
                  await apply(withLabel(geometry, { ...current, [field]: reading.value }));
                }}
              />
            </div>
          ))}
        </div>
        {geometry.label !== undefined && !readOnly && (
          <button
            type="button"
            className="inspector-action"
            onClick={() => void apply(withLabel(geometry, undefined))}
          >
            {t('Work the label area out')}
          </button>
        )}
      </div>
    </>
  );
}
