import { definitionsIn, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import './drop.css';
import { ExploreControls, ExploreStrip } from './ExploreBar';
import { GridToggles } from './GridToggles';
import type { LayoutControl } from './layout/useLayout';
import type { GridOptions } from './renderer';
import {
  STACKING_KEYS,
  STACKING_MOVES,
  STACKING_NAMES,
  type StackingAction,
  type StackingMove,
} from './stacking';

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
  onZoom: (factor: number) => void;
  onFit: () => void;
  /** Where "Add element…" puts the new element; absent, directly in World. */
  addPlace?: AddPlace;
  /** The stacking buttons' states (`stackingActions`); absent, the toolbar has no stacking group. */
  stacking?: Record<StackingMove, StackingAction>;
  /** Called on every press of a stacking button, also of one that would change nothing, to say why. */
  onRestack?: (move: StackingMove) => void;
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
 * The canvas toolbar: the component palette, free shapes, the stacking order and zoom. The palette
 * adds an element when one is picked from its open list; the arrow keys going through it while it is
 * closed only show an option, which Enter adds.
 */
export function CanvasToolbar({
  project,
  editable,
  scale,
  onAdd,
  onAddNote,
  onAddArrow,
  onZoom,
  onFit,
  addPlace,
  stacking,
  onRestack,
  addSelect,
  onAddLeave,
  layout,
  grid,
  onGrid,
}: CanvasToolbarProps) {
  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Canvas">
      <label className="canvas-toolbar-add">
        <span className="visually-hidden">{addPlace?.label ?? 'Add an element'}</span>
        <ComponentSelect
          project={project}
          option={addPlace?.option ?? 'Add element…'}
          title={addPlace?.title ?? IN_WORLD}
          disabled={!editable}
          onAdd={onAdd}
          {...(addSelect ? { selectRef: addSelect } : {})}
          {...(onAddLeave ? { onLeave: onAddLeave } : {})}
        />
      </label>
      <button type="button" disabled={!editable} onClick={onAddNote}>
        Note
      </button>
      <button type="button" disabled={!editable} onClick={onAddArrow}>
        Arrow
      </button>
      {stacking && (
        <div className="canvas-toolbar-stacking" role="group" aria-label="Stacking order">
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
              <span className="visually-hidden">{STACKING_NAMES[move]}</span>
            </button>
          ))}
        </div>
      )}
      <ExploreControls />
      {layout && (
        <button
          type="button"
          title={layout.title}
          aria-disabled={layout.enabled ? undefined : true}
          aria-busy={layout.busy ? true : undefined}
          onClick={layout.run}
        >
          {layout.label}
        </button>
      )}
      {grid && onGrid && <GridToggles grid={grid} onGrid={onGrid} />}
      <span className="canvas-toolbar-spacer" />
      <button type="button" aria-label="Zoom out" onClick={() => onZoom(1 / 1.25)}>
        −
      </button>
      <output className="canvas-toolbar-zoom" aria-label="Zoom">
        {scale === undefined ? '' : `${Math.round(scale * 100)}%`}
      </output>
      <button type="button" aria-label="Zoom in" onClick={() => onZoom(1.25)}>
        +
      </button>
      <button type="button" onClick={onFit}>
        Fit
      </button>
      <ExploreStrip />
    </div>
  );
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
  const palette = useMemo(() => {
    const definitions = definitionsIn(project);
    return project.packages.map((file) => ({
      id: file.id,
      name: file.name,
      components: file.components.map((component) => ({
        id: component.id,
        name: definitions.component(component.id)?.name ?? component.name,
      })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the definitions follow the packages and the project appearances only
  }, [project.packages, project.project.appearances]);
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

/** The paths of each stacking button's icon, in a 16 by 16 box: chevrons up or down, to a bar at the end. */
const ICONS: Record<StackingMove, string[]> = {
  front: ['M3 2.5h10', 'M4 9l4-4 4 4', 'M4 13l4-4 4 4'],
  forward: ['M4 10l4-4 4 4'],
  backward: ['M4 6l4 4 4-4'],
  back: ['M4 3l4 4 4-4', 'M4 7l4 4 4-4', 'M3 13.5h10'],
};

function StackingIcon({ move }: { move: StackingMove }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[move].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
