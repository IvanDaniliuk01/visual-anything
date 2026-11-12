import {
  checkLinkAddress,
  definitionsIn,
  explorablesIn,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { useT } from '../i18n';
import {
  ArrowIcon,
  BringForwardIcon,
  BringToFrontIcon,
  FitIcon,
  LayoutIcon,
  NoteIcon,
  LinkCardIcon,
  ExplorableShapeIcon,
  PictureIcon,
  PlusIcon,
  SendBackwardIcon,
  SendToBackIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../shell/icons';
import { SpacePanelToggle } from '../space/SpacePanelToggle';
import { ExplorablePanelToggle } from '../explorables/ExplorablePanel';
import type { AlignHow } from './align';
import type { AlignAction } from './alignActions';
import { AlignMenu } from './AlignMenu';
import './drop.css';
import './links/links.css';
import { ExploreControls, ExploreStrip, PerspectiveControl } from './ExploreBar';
import { GridToggles } from './GridToggles';
import { KeyboardHelp } from './KeyboardHelp';
import type { LayoutControl } from './layout/useLayout';
import type { GridOptions } from './renderer';
import {
  OverflowButton,
  OverflowDiv,
  OverflowToolbar,
  Overflowing,
  ToolbarMore,
} from './ToolbarMore';
import {
  STACKING_KEYS,
  STACKING_MOVES,
  STACKING_NAMES,
  type StackingAction,
  type StackingMove,
} from './stacking';

/** What a link card's address starts with, shown in its empty field: no word, so not translated. */
const ADDRESS_START = 'https://';

/** Where "Add element…" puts the new element, as its first option, its label and its tooltip say. */
export interface AddPlace {
  option: string;
  label: string;
  title: string;
}

export interface CanvasToolbarProps {
  project: ProjectSnapshot;
  /** Whether the project can be changed; adding is off while it cannot. */
  editable: boolean;
  /** The current zoom, as a scale. */
  scale: number | undefined;
  onAdd: (component: Id) => void;
  onAddNote: () => void;
  onAddArrow: () => void;
  /**
   * Adds the image files chosen with Picture… (ADR 0098); absent, the toolbar has no Picture…, as
   * where no program keeps media files.
   */
  onAddPictures?: (files: readonly File[]) => void;
  /**
   * Adds a link card for an address written in Link card… (ADR 0098, stage 3); absent, the toolbar
   * has no Link card….
   */
  onAddLinkCard?: (url: string) => void;
  /**
   * Adds an explorable shape for the explorable chosen in Explorable shape… (ADR 0107, A10.3);
   * absent, the toolbar has none.
   */
  onAddExplorable?: (explorable: Id) => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
  /** Where "Add element…" puts the new element; absent, directly in World. */
  addPlace?: AddPlace;
  /** The stacking buttons' states (`stackingActions`); absent, the toolbar has no stacking group. */
  stacking?: Record<StackingMove, StackingAction>;
  /** Called on every press of a stacking button, also of one that would change nothing, to say why. */
  onRestack?: (move: StackingMove) => void;
  /**
   * Align's items' states (`alignActions`), asked for while its menu shows, and what pressing one
   * does (ADR 0074); absent, the toolbar has no Align.
   */
  align?: () => Readonly<Record<AlignHow, AlignAction>>;
  onAlign?: (how: AlignHow) => void;
  /** Takes the "Add element…" select, so that `Add inside "X"…` can move the focus to it. */
  addSelect?: Ref<HTMLSelectElement>;
  /**
   * Called when "Add element…" loses the focus, and on Escape in it: a target set for the next
   * element added ends there.
   */
  onAddLeave?: () => void;
  /** Layout of the view or of the selected container's contents; absent, the toolbar has no Layout. */
  layout?: LayoutControl;
  /** The grid, snapping and the rulers, and how to change them (A3); absent, no toggles. */
  grid?: GridOptions;
  onGrid?: (changes: Partial<GridOptions>) => void;
}

const IN_WORLD = 'With nothing selected, elements are added directly in World.';

/**
 * The canvas toolbar, one row of quiet icon buttons in groups (A5): adding, with the component palette
 * as the one primary action and the free shapes; arranging, with the stacking order, Align and Layout;
 * viewing and reading, with the view, the filters, focus, the grid, Physical space (ADR 0076) and the
 * keyboard help; and zooming. Each icon's name shows in its tooltip, with its key where it has one,
 * and under More. The palette adds an element when one is picked from its open list; the arrow keys
 * going through it while it is closed only show an option, which Enter adds.
 */
export function CanvasToolbar({
  project,
  editable,
  scale,
  onAdd,
  onAddNote,
  onAddArrow,
  onAddPictures,
  onAddLinkCard,
  onAddExplorable,
  onZoom,
  onFit,
  addPlace,
  stacking,
  onRestack,
  align,
  onAlign,
  addSelect,
  onAddLeave,
  layout,
  grid,
  onGrid,
}: CanvasToolbarProps) {
  const t = useT();
  const named = (name: string, shortcut: string) => t('{name} ({shortcut})', { name, shortcut });
  return (
    <OverflowToolbar className="canvas-toolbar" role="toolbar" aria-label={t('Canvas')}>
      {/* Adding: the one primary action, then the free shapes. */}
      <label className="canvas-toolbar-add">
        <PlusIcon className="canvas-toolbar-add-icon" />
        <span className="visually-hidden">{addPlace?.label ?? t('Add an element')}</span>
        <ComponentSelect
          project={project}
          option={addPlace?.option ?? t('Add element…')}
          title={addPlace?.title ?? t(IN_WORLD)}
          disabled={!editable}
          onAdd={onAdd}
          {...(addSelect ? { selectRef: addSelect } : {})}
          {...(onAddLeave ? { onLeave: onAddLeave } : {})}
        />
      </label>
      <OverflowButton
        group="shapes"
        type="button"
        title={t('Note')}
        disabled={!editable}
        onClick={onAddNote}
      >
        <NoteIcon />
        <span className="canvas-toolbar-label">{t('Note')}</span>
      </OverflowButton>
      <OverflowButton
        group="shapes"
        type="button"
        title={t('Arrow')}
        disabled={!editable}
        onClick={onAddArrow}
      >
        <ArrowIcon />
        <span className="canvas-toolbar-label">{t('Arrow')}</span>
      </OverflowButton>
      {onAddPictures && <PictureButton disabled={!editable} onPictures={onAddPictures} />}
      {onAddLinkCard && <LinkCardButton disabled={!editable} onAddress={onAddLinkCard} />}
      {onAddExplorable && (
        <ExplorableShapeButton project={project} disabled={!editable} onChoose={onAddExplorable} />
      )}
      <ToolbarSeparator />
      {/* Arranging: the stacking order, Align and Layout. */}
      {stacking && (
        <OverflowDiv
          group="stacking"
          className="canvas-toolbar-stacking"
          role="group"
          aria-label={t('Stacking order')}
        >
          {STACKING_MOVES.map((move) => (
            <button
              key={move}
              type="button"
              title={stacking[move].description}
              aria-keyshortcuts={STACKING_KEYS[move].keys}
              aria-disabled={stacking[move].enabled ? undefined : true}
              onClick={() => onRestack?.(move)}
            >
              <StackingIcon move={move} />
              <span className="canvas-toolbar-label">{t(STACKING_NAMES[move])}</span>
            </button>
          ))}
        </OverflowDiv>
      )}
      {align && onAlign && (
        // Beside the stacking order, and under More with it.
        <Overflowing group="stacking">
          <AlignMenu actions={align} onAlign={onAlign} />
        </Overflowing>
      )}
      {layout && (
        <OverflowButton
          group="layout"
          type="button"
          title={layout.title}
          aria-keyshortcuts="Alt+Shift+L"
          aria-disabled={layout.enabled ? undefined : true}
          aria-busy={layout.busy ? true : undefined}
          onClick={layout.run}
        >
          <LayoutIcon />
          {/* While a layout runs, how far it has come shows in the row too. */}
          <span className={layout.busy ? undefined : 'canvas-toolbar-label'}>{layout.label}</span>
        </OverflowButton>
      )}
      <ToolbarSeparator />
      {/* Viewing and reading: the view, which always shows, the filters and focus, the grid,
          Physical space and the keyboard help. */}
      <PerspectiveControl />
      <Overflowing group="explore">
        <ExploreControls />
      </Overflowing>
      {grid && onGrid && (
        <Overflowing group="grid">
          <GridToggles grid={grid} onGrid={onGrid} />
        </Overflowing>
      )}
      <SpacePanelToggle />
      <ExplorablePanelToggle />
      <Overflowing group="keys">
        <KeyboardHelp />
      </Overflowing>
      <span className="canvas-toolbar-spacer" />
      {/* Zooming, then More. */}
      <button
        type="button"
        aria-label={t('Zoom out')}
        title={named(t('Zoom out'), '−')}
        onClick={() => onZoom(1 / 1.25)}
      >
        <ZoomOutIcon />
      </button>
      <output className="canvas-toolbar-zoom" aria-label={t('Zoom')}>
        {scale === undefined ? '' : `${Math.round(scale * 100)}%`}
      </output>
      <button
        type="button"
        aria-label={t('Zoom in')}
        title={named(t('Zoom in'), '+')}
        onClick={() => onZoom(1.25)}
      >
        <ZoomInIcon />
      </button>
      <OverflowButton
        group="fit"
        type="button"
        title={named(t('Fit'), '0')}
        aria-keyshortcuts="0"
        onClick={onFit}
      >
        <FitIcon />
        <span className="canvas-toolbar-label">{t('Fit')}</span>
      </OverflowButton>
      <ToolbarMore />
      <ExploreStrip />
    </OverflowToolbar>
  );
}

/**
 * A thin line between two groups of the toolbar. Where a group has gone under More, or is not there,
 * the line beside it hides (`styles.css`), so that two never stand side by side.
 */
function ToolbarSeparator() {
  return <span className="canvas-toolbar-separator" aria-hidden="true" />;
}

export interface ComponentSelectProps {
  project: ProjectSnapshot;
  /** The first option, which says where the element goes. */
  option: string;
  title?: string;
  disabled: boolean;
  onAdd: (component: Id) => void;
  selectRef?: Ref<HTMLSelectElement>;
  /** Called when it loses the focus, and on Escape in it. */
  onLeave?: () => void;
}

/**
 * A select of the components of the packages in use, which adds an element of the one picked from its
 * open list. The keys that go through the options of a closed list only show one, which Enter adds;
 * leaving the list adds nothing, since adding an element is not a value left behind.
 */
export function ComponentSelect({
  project,
  option,
  title,
  disabled,
  onAdd,
  selectRef,
  onLeave,
}: ComponentSelectProps) {
  const t = useT();
  const palette = useMemo(() => {
    const definitions = definitionsIn(project);
    return project.packages.map((file) => ({
      id: file.id,
      name: t.definition(file.id, file.name),
      components: file.components.map((component) => ({
        id: component.id,
        name: t.definition(
          component.id,
          definitions.component(component.id)?.name ?? component.name,
        ),
      })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the definitions follow the packages and the project appearances only
  }, [project.packages, project.project.appearances, t]);
  // An option the keys reached in the closed list, not added yet.
  const [reached, setReached] = useState<string>();
  // Set by a key that goes through the options, until the change it makes, in the same task.
  const browsing = useRef(false);

  const add = (component: string) => {
    setReached(undefined);
    if (component !== '') onAdd(component);
  };

  return (
    <select
      ref={selectRef}
      value={reached ?? ''}
      title={title}
      disabled={disabled}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && reached !== undefined) {
          event.preventDefault();
          add(reached);
        } else if (event.key === 'Escape') {
          if (reached !== undefined) event.preventDefault();
          setReached(undefined);
          onLeave?.();
        } else if (browsesOptions(event)) {
          browsing.current = true;
          setTimeout(() => {
            browsing.current = false;
          }, 0);
        }
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (browsing.current) {
          browsing.current = false;
          setReached(next === '' ? undefined : next);
        } else {
          add(next);
        }
      }}
      onBlur={() => {
        setReached(undefined);
        onLeave?.();
      }}
    >
      <option value="">{option}</option>
      {palette.map((file) => (
        <optgroup key={file.id} label={file.name}>
          {file.components.map((component) => (
            <option key={component.id} value={component.id}>
              {component.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/**
 * Whether a key goes through the options of a closed select, as the arrow keys, Home, End, the page
 * keys and typing a letter do on Windows and Linux; with Alt, an arrow opens the list instead.
 */
function browsesOptions(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  return (
    /^(Arrow(Up|Down|Left|Right)|Home|End|Page(Up|Down))$/.test(event.key) ||
    (event.key.length === 1 && event.key !== ' ')
  );
}

/** Each stacking button's icon, from the app's set: chevrons up or down, to a bar at the end. */
const STACKING_ICONS: Record<StackingMove, typeof BringToFrontIcon> = {
  front: BringToFrontIcon,
  forward: BringForwardIcon,
  backward: SendBackwardIcon,
  back: SendToBackIcon,
};

function StackingIcon({ move }: { move: StackingMove }) {
  const Icon = STACKING_ICONS[move];
  return <Icon />;
}

/**
 * Link card…: asks for a web address in a small form under the button, and adds a card for it at the
 * middle of the view (ADR 0098, stage 3). Escape or Cancel closes it.
 */
function LinkCardButton({
  disabled,
  onAddress,
}: {
  disabled: boolean;
  onAddress: (url: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string>();
  const inputId = useId();
  const close = () => {
    setOpen(false);
    setText('');
    setProblem(undefined);
  };
  return (
    <Overflowing group="shapes">
      <span className="canvas-toolbar-link">
        <button
          type="button"
          title={t('Link card…')}
          disabled={disabled}
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <LinkCardIcon />
          <span className="canvas-toolbar-label">{t('Link card…')}</span>
        </button>
        {open && (
          <form
            className="canvas-menu canvas-toolbar-link-form"
            role="dialog"
            aria-label={t('Add a link card')}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                close();
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              const checked = checkLinkAddress(text);
              if (!checked.ok) {
                setProblem(t('Write an address that starts with https://.'));
                return;
              }
              onAddress(checked.url);
              close();
            }}
          >
            <label htmlFor={inputId}>{t('Web address')}</label>
            <input
              id={inputId}
              type="url"
              value={text}
              placeholder={ADDRESS_START}
              autoFocus
              aria-invalid={problem === undefined ? undefined : true}
              onChange={(event) => {
                setText(event.target.value);
                setProblem(undefined);
              }}
            />
            {problem !== undefined && (
              <span className="inspector-problem" role="alert">
                {problem}
              </span>
            )}
            <span className="canvas-toolbar-link-actions">
              <button type="submit">{t('Add')}</button>
              <button type="button" onClick={close}>
                {t('Cancel')}
              </button>
            </span>
          </form>
        )}
      </span>
    </Overflowing>
  );
}

/**
 * Explorable shape…: chooses one of the explorables the project's packages define and adds it loose
 * on the canvas (ADR 0107, A10.3); disabled while the project defines none.
 */
function ExplorableShapeButton({
  project,
  disabled,
  onChoose,
}: {
  project: ProjectSnapshot;
  disabled: boolean;
  onChoose: (explorable: Id) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const selectId = useId();
  const explorables = useMemo(
    () =>
      [...explorablesIn(project).explorables.values()]
        .map((each) => ({ id: each.definition.id, name: each.definition.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- what packages define follows the packages
    [project.packages],
  );
  const [chosen, setChosen] = useState<Id>();
  const none = explorables.length === 0;
  return (
    <Overflowing group="shapes">
      <span className="canvas-toolbar-link">
        <button
          type="button"
          title={
            none ? t('No package of the project defines an explorable.') : t('Explorable shape…')
          }
          disabled={disabled || none}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ExplorableShapeIcon />
          <span className="canvas-toolbar-label">{t('Explorable shape…')}</span>
        </button>
        {open && (
          <form
            className="canvas-menu canvas-toolbar-link-form"
            role="dialog"
            aria-label={t('Add an explorable shape')}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              const id = chosen ?? explorables[0]?.id;
              if (id !== undefined) onChoose(id);
              setOpen(false);
            }}
          >
            <label htmlFor={selectId}>{t('Explorable')}</label>
            <select
              id={selectId}
              value={chosen ?? explorables[0]?.id ?? ''}
              autoFocus
              onChange={(event) => setChosen(event.target.value)}
            >
              {explorables.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.name}
                </option>
              ))}
            </select>
            <span className="canvas-toolbar-link-actions">
              <button type="submit">{t('Add')}</button>
              <button type="button" onClick={() => setOpen(false)}>
                {t('Cancel')}
              </button>
            </span>
          </form>
        )}
      </span>
    </Overflowing>
  );
}

/** The types Picture… offers to choose (ADR 0098). */
export const PICTURE_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg,video/mp4,video/webm,.mp4,.m4v,.webm';

/** Picture…: chooses image files to add as pictures, through a file input the button opens. */
function PictureButton({
  disabled,
  onPictures,
}: {
  disabled: boolean;
  onPictures: (files: readonly File[]) => void;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <OverflowButton
        group="shapes"
        type="button"
        title={t('Picture…')}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <PictureIcon />
        <span className="canvas-toolbar-label">{t('Picture…')}</span>
      </OverflowButton>
      <input
        ref={input}
        type="file"
        accept={PICTURE_ACCEPT}
        multiple
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          if (files.length > 0) onPictures(files);
        }}
      />
    </>
  );
}
