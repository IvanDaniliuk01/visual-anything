import {
  compileFace,
  faceDrawingText,
  faceInputOf,
  faceMessage,
  facePalette,
  faceProblems,
  layOutFace,
  modelIndexOf,
  type Command,
  type Definitions,
  type FaceDrawing,
  type FaceProblem,
  type ProjectSnapshot,
  type ResolvedAppearance,
  type ResolvedFace,
  type ShapeColors,
  type ThemeName,
} from '@visual-anything/core';
import type { Element, Face, Id } from '@visual-anything/schema';
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { indexScene } from '../../canvas/hit';
import { faceRect } from '../../canvas/faces';
import { loadRobotoFonts } from '../../canvas/robotoFonts';
import { ROWS_FOOT, ROW_HEIGHT } from '../../canvas/rows';
import type { Scene } from '../../canvas/scene';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { useShownTheme } from '../inspector/useShownTheme';
import {
  STARTING_FACE,
  VARIANT_ID,
  changesOf,
  draftOf,
  faceOfDraft,
  offsetOf,
  partOfProblem,
  type DraftPart,
  type FaceChanges,
  type FaceDraft,
} from './faceDraft';
import { paintFacePreview, previewPlacementOf } from './facePainter';
import type { TraitControl } from './TraitRow';
import './face.css';

/** The ADR's caps on the elements a preview offers to fill a face from. */
const MAX_PREVIEW_ELEMENTS = 50;

interface FaceEditorProps {
  /** The face its shapes show, wherever it comes from; none while they show none. */
  shown: ResolvedFace | undefined;
  /** What the level edited stores: a face of its own, `none`, or nothing, so that it is inherited. */
  stored: Face | 'none' | undefined;
  /** The attributes a face can name: its component's, and an element's own. */
  attributes: ReadonlySet<string>;
  /** The colors its shapes are drawn in, in each theme. */
  colors: (theme: ThemeName) => ShapeColors;
  /** The appearance its shapes are drawn by, for the preview's size. */
  appearance: ResolvedAppearance;
  /** The elements the preview can be filled from, the one to start with first. */
  elements: readonly Element[];
  /** A stand-in's name, for a component nothing is made from yet. */
  standIn: string;
  readOnly: boolean;
  control: TraitControl;
  /** The one command that sets these parts of the face, or `none`. */
  commandFor: (changes: FaceChanges | 'none') => Command;
}

/**
 * The Face section's editor (ADR 0083): the markup of the face and of each variant, its style, its
 * size and the variant a collapsed container shows, each in a text area or a choice, with the
 * problems listed at their lines and columns, and a live preview drawn as the canvas draws it on an
 * element of the model, in either theme. Nothing is sent while typing: Apply sends the parts that
 * changed as one command, one undoable action.
 */
export function FaceEditor(props: FaceEditorProps) {
  // A new draft for each face shown, so that an Apply, an undo or Claude's change starts it again.
  const key = JSON.stringify(props.shown ?? null) + JSON.stringify(props.stored ?? null);
  return <FaceDraftEditor key={key} {...props} />;
}

function FaceDraftEditor({
  shown,
  stored,
  attributes,
  colors,
  appearance,
  elements,
  standIn,
  readOnly,
  control,
  commandFor,
}: FaceEditorProps) {
  const t = useT();
  const { project, definitions, scene } = useEditor();
  const shownTheme = useShownTheme();
  const [draft, setDraft] = useState<FaceDraft>(() => draftOf(shown));
  const [editing, setEditing] = useState<DraftPart>('markup');
  const [newVariant, setNewVariant] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewChoice>({
    element: elements[0]?.id ?? '',
    variant: '',
    collapsed: false,
    theme: shownTheme,
  });
  const markupRef = useRef<HTMLTextAreaElement>(null);
  const styleRef = useRef<HTMLTextAreaElement>(null);
  const ids = {
    which: useId(),
    markup: useId(),
    style: useId(),
    size: useId(),
    collapsed: useId(),
    variant: useId(),
    problems: useId(),
  };

  const face = useMemo(() => faceOfDraft(draft), [draft]);
  const problems = useMemo(
    () =>
      face.markup.length === 0
        ? []
        : faceProblems(face, {
            attributes,
            palettes: {
              light: palette('light', colors),
              dark: palette('dark', colors),
            },
          }),
    [face, attributes, colors],
  );
  const errors = problems.some((each) => each.severity === 'error');
  const changes = changesOf(draft, shown);
  const off = readOnly || busy;
  const variantIds = draft.variants.map((variant) => variant.id);
  const editingVariant = editing.startsWith('variant:') ? editing.slice('variant:'.length) : '';
  const markupText =
    editingVariant === ''
      ? draft.markup
      : (draft.variants.find((variant) => variant.id === editingVariant)?.markup ?? '');

  const setMarkup = (text: string) =>
    setDraft((before) =>
      editingVariant === ''
        ? { ...before, markup: text }
        : {
            ...before,
            variants: before.variants.map((variant) =>
              variant.id === editingVariant ? { ...variant, markup: text } : variant,
            ),
          },
    );

  const send = async (next: FaceChanges | 'none') => {
    setBusy(true);
    try {
      return await control.send(commandFor(next));
    } finally {
      setBusy(false);
    }
  };

  /** Moves the caret to where a problem is, in the text it is in. */
  const goTo = (found: FaceProblem) => {
    const part = partOfProblem(found);
    const isStyle = part === 'style';
    if (!isStyle) setEditing(part);
    const text =
      part === 'style'
        ? draft.style
        : part === 'markup'
          ? draft.markup
          : (draft.variants.find((variant) => `variant:${variant.id}` === part)?.markup ?? '');
    const offset = offsetOf(text, found.line, found.column);
    // After the markup's text area shows the part.
    setTimeout(() => {
      const area = isStyle ? styleRef.current : markupRef.current;
      area?.focus();
      area?.setSelectionRange(offset, offset);
    }, 0);
  };

  const addVariant = () => {
    const id = newVariant.trim();
    if (!VARIANT_ID.test(id) || variantIds.includes(id)) return;
    setDraft((before) => ({
      ...before,
      variants: [...before.variants, { id, markup: before.markup }],
    }));
    setEditing(`variant:${id}`);
    setNewVariant('');
  };

  const removeVariant = () => {
    setDraft((before) => ({
      ...before,
      variants: before.variants.filter((variant) => variant.id !== editingVariant),
      collapsed: before.collapsed === editingVariant ? '' : before.collapsed,
    }));
    setEditing('markup');
  };

  const variantProblem =
    newVariant.trim() === ''
      ? undefined
      : !VARIANT_ID.test(newVariant.trim())
        ? t('An id is lowercase letters, digits and "-", a letter first.')
        : variantIds.includes(newVariant.trim())
          ? t('The face has a variant with this id already.')
          : undefined;

  return (
    <div className="face-editor">
      <p className="definition-value">
        {shown === undefined
          ? stored === 'none'
            ? t('None: its shapes show no face, whatever is inherited.')
            : t('None: its shapes show their name and detail.')
          : shown.variants.length === 0
            ? t('A face, with no variants.')
            : t(
                { one: 'A face, with {count} variant.', other: 'A face, with {count} variants.' },
                { count: shown.variants.length },
              )}
      </p>
      <div className="face-field">
        <label htmlFor={ids.which}>{t('Markup of')}</label>
        <select
          id={ids.which}
          data-changes-nothing
          value={editing === 'style' ? 'markup' : editing}
          onChange={(event) => setEditing(event.target.value as DraftPart)}
        >
          <option value="markup">{t('The face itself')}</option>
          {variantIds.map((id) => (
            <option key={id} value={`variant:${id}`}>
              {t('The variant "{id}"', { id })}
            </option>
          ))}
        </select>
      </div>
      <FaceText
        id={ids.markup}
        label={
          editingVariant === ''
            ? t('Markup, in a subset of HTML')
            : t('Markup of the variant "{id}"', { id: editingVariant })
        }
        value={markupText}
        disabled={off}
        describedBy={[control.describedBy, problems.length > 0 ? ids.problems : '']}
        areaRef={markupRef}
        onChange={setMarkup}
      />
      {!readOnly && (
        <div className="face-variant-actions">
          <label htmlFor={ids.variant}>{t('New variant’s id')}</label>
          <input
            id={ids.variant}
            value={newVariant}
            disabled={off || variantIds.length >= 8}
            onChange={(event) => setNewVariant(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addVariant();
            }}
          />
          <button
            type="button"
            className="inspector-action"
            disabled={off || newVariant.trim() === '' || variantProblem !== undefined}
            onClick={addVariant}
          >
            {t('Add a variant')}
          </button>
          {editingVariant !== '' && (
            <button
              type="button"
              className="inspector-action"
              disabled={off}
              onClick={removeVariant}
            >
              {t('Remove the variant "{id}"', { id: editingVariant })}
            </button>
          )}
          {variantProblem !== undefined && <p className="inspector-problem">{variantProblem}</p>}
        </div>
      )}
      <FaceText
        id={ids.style}
        label={t('Style, in a subset of CSS')}
        value={draft.style}
        disabled={off}
        describedBy={[control.describedBy]}
        areaRef={styleRef}
        onChange={(style) => setDraft((before) => ({ ...before, style }))}
      />
      <div className="face-field">
        <label htmlFor={ids.size}>{t('Its height')}</label>
        <select
          id={ids.size}
          value={draft.size}
          disabled={off}
          onChange={(event) =>
            setDraft((before) => ({
              ...before,
              size: event.target.value === 'content' ? 'content' : 'shape',
            }))
          }
        >
          <option value="shape">{t('The shape’s, cut where the face overflows')}</option>
          <option value="content">{t('As tall as the face')}</option>
        </select>
      </div>
      <div className="face-field">
        <label htmlFor={ids.collapsed}>{t('Collapsed, it shows')}</label>
        <select
          id={ids.collapsed}
          value={draft.collapsed}
          disabled={off}
          onChange={(event) => {
            const collapsed = event.target.value;
            setDraft((before) => ({ ...before, collapsed }));
          }}
        >
          <option value="">{t('The face without its contents')}</option>
          {variantIds.map((id) => (
            <option key={id} value={id}>
              {t('The variant "{id}"', { id })}
            </option>
          ))}
        </select>
      </div>
      <FaceProblems id={ids.problems} problems={problems} onGo={goTo} />
      <FacePreview
        face={face}
        errors={errors}
        choice={preview}
        onChoose={setPreview}
        elements={elements}
        variants={variantIds}
        standIn={standIn}
        colors={colors}
        appearance={appearance}
        project={project}
        definitions={definitions}
        scene={scene}
      />
      {!readOnly && (
        <div className="definition-actions">
          <button
            type="button"
            className="inspector-action"
            disabled={off || changes === undefined || errors}
            onClick={() => {
              if (changes !== undefined) void send(changes);
            }}
          >
            {t('Apply')}
          </button>
          {changes !== undefined && (
            <button
              type="button"
              className="inspector-action"
              disabled={off}
              onClick={() => setDraft(draftOf(shown))}
            >
              {t('Discard the changes')}
            </button>
          )}
          {draft.markup.trim() === '' && (
            <button
              type="button"
              className="inspector-action"
              disabled={off}
              onClick={() => setDraft(draftOf(STARTING_FACE))}
            >
              {t('Start from a face that writes its name and detail')}
            </button>
          )}
          {shown !== undefined && (
            <button
              type="button"
              className="inspector-action"
              disabled={off}
              onClick={() => void send('none')}
            >
              {t('Show no face')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The colors a face's tokens take on its shapes in a theme. */
function palette(theme: ThemeName, colors: (theme: ThemeName) => ShapeColors) {
  const { fill, stroke } = colors(theme);
  return facePalette(theme, fill, stroke);
}

interface FaceTextProps {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  describedBy: readonly string[];
  areaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (text: string) => void;
}

/** A text area of a face, with its line numbers beside it, which scroll with it. */
function FaceText({ id, label, value, disabled, describedBy, areaRef, onChange }: FaceTextProps) {
  const gutter = useRef<HTMLDivElement>(null);
  const count = Math.max(1, value.split('\n').length);
  return (
    <div className="face-text">
      <label htmlFor={id} className="face-text-label">
        {label}
      </label>
      <div className="face-text-body">
        <div ref={gutter} className="face-text-lines" aria-hidden="true">
          {Array.from({ length: count }, (_, at) => (
            <span key={at}>{at + 1}</span>
          ))}
        </div>
        <textarea
          id={id}
          ref={areaRef}
          className="face-text-area"
          rows={Math.min(12, Math.max(3, count))}
          spellCheck={false}
          wrap="off"
          value={value}
          disabled={disabled}
          aria-describedby={describedBy.filter((each) => each !== '').join(' ') || undefined}
          onScroll={(event) => {
            if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
          }}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}

/** The problems of a face, errors first, each a button that moves to where it is. */
function FaceProblems({
  id,
  problems,
  onGo,
}: {
  id: string;
  problems: readonly FaceProblem[];
  onGo: (found: FaceProblem) => void;
}) {
  const t = useT();
  if (problems.length === 0) return null;
  return (
    <div id={id} className="face-problems" aria-live="polite">
      <p className="face-problems-head">
        {problems.some((each) => each.severity === 'error')
          ? t('Fix these before it can be applied:')
          : t('It can be applied; it warns about:')}
      </p>
      <ul>
        {problems.map((found, at) => (
          <li key={at} className={found.severity === 'error' ? 'is-error' : 'is-warning'}>
            <button type="button" className="face-problem" onClick={() => onGo(found)}>
              {t.message(faceMessage(found))}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PreviewChoice {
  /** The element it is filled from; `''` for a stand-in. */
  element: Id;
  variant: string;
  collapsed: boolean;
  theme: ThemeName;
}

interface FacePreviewProps {
  face: ResolvedFace;
  errors: boolean;
  choice: PreviewChoice;
  onChoose: (choice: PreviewChoice) => void;
  elements: readonly Element[];
  variants: readonly string[];
  standIn: string;
  colors: (theme: ThemeName) => ShapeColors;
  appearance: ResolvedAppearance;
  project: ProjectSnapshot;
  definitions: Definitions;
  scene: Scene | undefined;
}

/**
 * The live preview: the draft laid out by the core on the element chosen, at the size its shape has
 * in the open view, or its appearance's size, and painted as the canvas paints it.
 */
function FacePreview({
  face,
  errors,
  choice,
  onChoose,
  elements,
  variants,
  standIn,
  colors,
  appearance,
  project,
  definitions,
  scene,
}: FacePreviewProps) {
  const t = useT();
  const ids = { element: useId(), variant: useId(), collapsed: useId(), theme: useId() };
  const element = elements.find((each) => each.id === choice.element);
  const variant = variants.includes(choice.variant) ? choice.variant : '';
  const laidOut = useMemo(() => {
    if (errors || face.markup.length === 0) return undefined;
    const size = previewSize(element, appearance, face, scene);
    const input = previewInput(element, standIn, project, definitions, appearance);
    const drawing = layOutFace(compileFace(face), input, {
      width: size.width,
      ...(size.height === undefined ? {} : { height: size.height }),
      ...(variant === '' ? {} : { variant }),
      ...(choice.collapsed ? { collapsed: true } : {}),
    });
    return {
      drawing,
      shape: { width: size.width, height: Math.max(drawing.height, size.height ?? 0) },
    };
  }, [
    errors,
    face,
    element,
    appearance,
    scene,
    standIn,
    project,
    definitions,
    variant,
    choice.collapsed,
  ]);

  return (
    <div className="face-preview" role="group" aria-label={t('Preview')}>
      <div className="face-preview-controls">
        <label htmlFor={ids.element}>{t('Preview with')}</label>
        <select
          id={ids.element}
          data-changes-nothing
          value={element?.id ?? ''}
          onChange={(event) => onChoose({ ...choice, element: event.target.value })}
        >
          {elements.length === 0 && (
            <option value="">{t('A stand-in named “{name}”', { name: standIn })}</option>
          )}
          {elements.slice(0, MAX_PREVIEW_ELEMENTS).map((each) => (
            <option key={each.id} value={each.id}>
              {each.name}
            </option>
          ))}
        </select>
        <label htmlFor={ids.variant}>{t('Showing')}</label>
        <select
          id={ids.variant}
          data-changes-nothing
          value={variant}
          onChange={(event) => onChoose({ ...choice, variant: event.target.value })}
        >
          <option value="">{t('The face itself')}</option>
          {variants.map((id) => (
            <option key={id} value={id}>
              {t('The variant "{id}"', { id })}
            </option>
          ))}
        </select>
        <label htmlFor={ids.theme}>{t('Theme')}</label>
        <select
          id={ids.theme}
          data-changes-nothing
          value={choice.theme}
          onChange={(event) =>
            onChoose({ ...choice, theme: event.target.value === 'dark' ? 'dark' : 'light' })
          }
        >
          <option value="light">{t('Light')}</option>
          <option value="dark">{t('Dark')}</option>
        </select>
        <span className="face-preview-collapsed">
          <input
            id={ids.collapsed}
            data-changes-nothing
            type="checkbox"
            checked={choice.collapsed}
            onChange={(event) => onChoose({ ...choice, collapsed: event.target.checked })}
          />
          <label htmlFor={ids.collapsed}>{t('As a collapsed container')}</label>
        </span>
      </div>
      {laidOut === undefined ? (
        <p className="panel-empty">
          {errors
            ? t('The preview shows once the face has no errors.')
            : t('No markup to preview.')}
        </p>
      ) : (
        <FaceCanvas
          drawing={laidOut.drawing}
          shape={laidOut.shape}
          colors={colors(choice.theme)}
          theme={choice.theme}
        />
      )}
    </div>
  );
}

/** The preview painted, with what the face says as its text alternative. */
function FaceCanvas({
  drawing,
  shape,
  colors,
  theme,
}: {
  drawing: FaceDrawing;
  shape: { width: number; height: number };
  colors: ShapeColors;
  theme: ThemeName;
}) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const [fonts, setFonts] = useState(0);
  const density = Math.min(3, Math.max(1, Math.ceil(globalThis.devicePixelRatio || 1)));
  const placement = previewPlacementOf(shape.width, shape.height);
  useEffect(() => {
    let live = true;
    void loadRobotoFonts().then((loaded) => {
      if (live && loaded) setFonts((count) => count + 1);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context) return;
    paintFacePreview(
      context,
      drawing,
      shape,
      facePalette(theme, colors.fill, colors.stroke),
      density,
    );
  }, [drawing, shape, colors, theme, density, fonts]);
  const text = faceDrawingText(drawing);
  return (
    <>
      <canvas
        ref={ref}
        className="face-preview-canvas"
        width={placement.width * density}
        height={placement.height * density}
        style={{ width: placement.width, height: placement.height }}
        role="img"
        aria-label={t('Preview of its face: {text}', { text: text.split('\n').join(', ') })}
      />
      <p className="inspector-notes">
        {t('{width} by {height}', {
          width: Math.round(shape.width),
          height: Math.round(shape.height),
        })}
        {drawing.cut ? ` · ${t('Cut where it overflows')}` : ''}
      </p>
    </>
  );
}

/**
 * The size a face is laid out at for an element: as its shape is drawn in the open view (a row's
 * band, the header of a shape that holds rows or contents, or its label area), or else by its
 * appearance. A face as tall as its content, or over rows or contents, takes no height.
 */
function previewSize(
  element: Element | undefined,
  appearance: ResolvedAppearance,
  face: ResolvedFace,
  scene: Scene | undefined,
): { width: number; height?: number } {
  const regions = face.markup.some((line) => /<(rows|contents)\s*\/>/.test(line));
  const shape = element && scene ? shapeIn(scene, element.id) : undefined;
  if (shape) {
    const rect = faceRect(shape);
    if (shape.row !== undefined) return { width: rect.width, height: rect.height };
    if (face.size === 'content' || regions || appearance.contentsAsRows)
      return { width: rect.width };
    return { width: rect.width, height: rect.height };
  }
  const width = appearance.shape === 'ellipse' ? appearance.width * 0.7 : appearance.width;
  if (face.size === 'content' || regions || appearance.contentsAsRows) return { width };
  return { width, height: appearance.height };
}

function shapeIn(scene: Scene, element: Id) {
  try {
    return indexScene(scene).byElement.get(element)?.[0];
  } catch {
    return undefined;
  }
}

/** What fills the preview: the element's name and stored values, or a stand-in's name. */
function previewInput(
  element: Element | undefined,
  standIn: string,
  project: ProjectSnapshot,
  definitions: Definitions,
  appearance: ResolvedAppearance,
) {
  if (!element) return { name: standIn, component: standIn, attributes: [] };
  const index = modelIndexOf(project);
  const held = index.contentsOf(element.id).length;
  const input = faceInputOf(element, definitions, {
    startedTypes: new Set(
      index
        .relationsOn(element.id)
        .filter((each) => each.from === element.id)
        .map((each) => each.relationType),
    ),
    count: held,
  });
  return appearance.contentsAsRows
    ? { ...input, rowsHeight: Math.max(1, held) * ROW_HEIGHT + ROWS_FOOT }
    : input;
}
