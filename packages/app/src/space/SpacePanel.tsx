/**
 * The physical-space panel (ADR 0076), between the canvas and the inspector while the open view's
 * panel is open: a bar that says which element it shows and closes it, and the frames the solid
 * worker draws of the space, handed to a `<canvas>` through a `bitmaprenderer` context, so that the
 * page's thread does no work in three dimensions.
 *
 * It works out what is in the space from the open view (`spaceOf`), what the worker draws of it
 * (`spaceEntriesOf`) and each element's state from the canvas's emphasis, the selection, the shared
 * hover and the view's overlays (`spaceStates`), and sends the worker only what changed, so that it
 * draws only when something does. When nothing the view shows is in the space, it says how to put
 * something there.
 *
 * Its camera, picking, the handles, its tools, its list and its announcements are the panel's
 * interaction's (`SpaceControl`, `useSpaceInteraction`, `SpaceTools`, `SpaceList`); the camera is
 * the one its state gives, or the one that frames everything.
 *
 * It also draws in space the relations along which markers travel on the canvas, the scenario step
 * played among them, with their markers, and, while Relations of the selection is on, the relations
 * of the selection that the canvas draws and its emphasis does not hide (`lines.ts`); offers the ways
 * of reading under its tools (`SpaceReading`), whose exploded view eases in unless motion is
 * reduced, and Show World in its bar while it shows an element; takes up the framings it is asked for
 * (`useFramingRequests.ts`); and keeps where each frame was drawn from, which moves of its camera
 * start from (`moves.ts`).
 */
import {
  definitionsIn,
  legendOf,
  modelIndexOf,
  overlayLookOf,
  spaceOf,
  type ProjectSnapshot,
  type Space,
  type ThemeName,
  type ViewSpace,
} from '@visual-anything/core';
import type { Color, Id, ViewFile } from '@visual-anything/schema';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { emphasize, type Emphasized } from '../canvas/emphasize';
import { LegendPanel } from '../canvas/overlays/LegendPanel';
import type { Scene } from '../canvas/scene';
import { useEmphasis } from '../editor/emphasis';
import { useHover } from '../editor/hover';
import type { Selection } from '../editor/selection';
import { useT } from '../i18n';
import { DismissIcon, WorldIcon } from '../shell/icons';
import { useAttributeLookup } from '../live-values/context';
import { useMotion } from '../scenarios/motion';
import type { SolidClient, SolidProblem, SpaceDrawing } from '../solids/solid-client';
import {
  LARGEST_SOLID_PICTURE,
  SPACE_PIXEL_RATIOS,
  type PixelSize,
  type SpaceFrameReply,
  type SpaceShown,
} from '../solids/protocol';
import { useReducedMotion } from '../scenarios/motion';
import { useSpacePanelState } from './context';
import { changeOf } from './changes';
import { SpaceControl } from './control';
import { SpaceList } from './SpaceList';
import { SpaceTools } from './SpaceTools';
import { shiftsFrom } from './drag';
import { useSpaceInteraction, type HandleMode } from './useSpaceInteraction';
import { drawsNothing, spaceEntriesOf } from './entries';
import { selectionRelationsOf, spaceLinesOf, type SelectionRelation } from './lines';
import { EXPLODE_EASE, explodeBetween, showingWorld } from './reading';
import { SpaceReading } from './SpaceReading';
import { SpacePanelEdge } from './SpacePanelEdge';
import { shapeEmphasisOf, spaceStateList, spaceStates, type SpaceOverlayLook } from './states';
import type { SpacePanelStore } from './store';
import { useFramingRequests } from './useFramingRequests';
import { overlaysColoringSpace, spaceLegendOf, type SpaceAttributeValue } from './legend';
import type { SpaceShifts } from './where';
import './space.css';

interface SpacePanelProps {
  /** The panel's id, which its edge and the toolbar's Physical space control. */
  id: string;
  store: SpacePanelStore;
  project: ProjectSnapshot;
  view: ViewFile;
  /** The canvas's scene, whose shapes the emphasis names. */
  scene: Scene;
  selection: Selection;
  /** The live session's solid client; absent, the panel says it cannot draw. */
  client: SolidClient | undefined;
  /** The theme the canvas draws in, which markers are drawn in too; light when absent. */
  theme?: ThemeName | undefined;
  /**
   * Whether nothing can be changed here, as in the read-only page (ADR 0041): the panel then offers
   * only what reads, without Move, Rotate, Place in physical space, Take out of physical space or the
   * handles, and says nothing of putting something in physical space.
   */
  readOnly?: boolean | undefined;
}

/** How the panel's frames are moved through from the keyboard, as a screen reader hears it. */
const SPACE_HINT =
  'Arrow keys turn the space, Shift with them pans, + and − zoom, 0 fits everything and Enter frames the selection; M and R choose whether the handles move or rotate.';

/** How the panel's frames are moved through from the keyboard where nothing can be changed. */
const SPACE_READING_HINT =
  'Arrow keys turn the space, Shift with them pans, + and − zoom, 0 fits everything and Enter frames the selection.';

/** What the panel says when the view holds nothing in physical space. */
const NOTHING_IN_SPACE =
  'Nothing this view shows is in physical space yet. To put an element there, select it and choose Place in physical space, show a solid on it, or ask Claude to give it a pose.';

/** What the panel says when the view holds nothing in physical space, where nothing can be changed. */
const NOTHING_IN_SPACE_HERE = 'Nothing this view shows is in physical space.';

/** The panel and its edge, while the open view's panel is open. */
export function SpacePanel(props: SpacePanelProps) {
  const shown = useSpacePanelState(props.store, props.view.id);
  if (!shown) return null;
  return (
    <>
      <SpacePanelEdge store={props.store} controls={props.id} />
      <OpenSpacePanel {...props} shown={shown} />
    </>
  );
}

function OpenSpacePanel({
  id,
  store,
  project,
  view,
  scene,
  selection,
  client,
  theme,
  readOnly = false,
  shown,
}: SpacePanelProps & { shown: ViewSpace }) {
  const t = useT();
  const heading = useId();
  const space = useMemo(() => spaceOf(project, view, shown.root), [project, view, shown.root]);
  const index = modelIndexOf(project);
  const root = index.element(space.root);
  const empty = drawsNothing(space);
  const control = useSpaceControl(store, view.id);
  const [mode, setMode] = useState<HandleMode>('move');
  // Each message counts, so that the same words said again are heard again.
  const [message, setMessage] = useState({ text: '', count: 0 });
  const say = useCallback(
    (text: string) => setMessage((last) => ({ text, count: last.count + 1 })),
    [],
  );
  const drawn = !empty && client !== undefined;
  // How far the exploded view moves each entry, as the newest frame said, which the words follow.
  const [shifts, setShifts] = useState<SpaceShifts>();
  const world = index.world;
  const showsElement = shown.root !== undefined && shown.root !== world.id;
  const showWorld = () => {
    store.set(view.id, showingWorld(store.state(view.id) ?? shown));
    say(t('Shows World.'));
  };
  return (
    <section className="space-panel" id={id} aria-labelledby={heading}>
      <div className="space-panel-bar">
        <h2 id={heading} className="space-panel-title">
          {t('Physical space')}
        </h2>
        {root && (
          <span className="space-panel-shows">{t('Shows “{name}”', { name: root.name })}</span>
        )}
        {showsElement && (
          <button type="button" className="space-panel-tool space-panel-world" onClick={showWorld}>
            <WorldIcon />
            {t('Show World')}
          </button>
        )}
        <button
          type="button"
          className="space-panel-close"
          aria-label={t('Close the physical-space panel')}
          title={t('Close the physical-space panel')}
          onClick={() => store.close(view.id)}
        >
          <DismissIcon />
        </button>
      </div>
      {drawn && (
        <SpaceTools
          project={project}
          space={space}
          control={control}
          mode={mode}
          setMode={setMode}
          say={say}
          readOnly={readOnly}
        />
      )}
      {drawn && (
        <SpaceReading store={store} viewId={view.id} shown={shown} space={space} say={say} />
      )}
      {empty ? (
        <p className="space-panel-message">
          {t(readOnly ? NOTHING_IN_SPACE_HERE : NOTHING_IN_SPACE)}
        </p>
      ) : client ? (
        <SpaceFrames
          store={store}
          control={control}
          mode={mode}
          setMode={setMode}
          say={say}
          client={client}
          project={project}
          view={view}
          scene={scene}
          selection={selection}
          space={space}
          shown={shown}
          theme={theme ?? 'light'}
          readOnly={readOnly}
          shifts={shifts}
          onShifts={setShifts}
        />
      ) : (
        <p className="space-panel-message">
          {t('Physical space is drawn while Visual Anything is connected.')}
        </p>
      )}
      {drawn && (
        <SpaceList project={project} space={space} control={control} say={say} shifts={shifts} />
      )}
      <p role="status" className="visually-hidden">
        {message.text}
        {message.count % 2 === 1 ? ' ' : ''}
      </p>
    </section>
  );
}

/** The panel's camera for a view while it is open, which eases unless motion is reduced. */
function useSpaceControl(store: SpacePanelStore, viewId: Id): SpaceControl {
  const control = useMemo(() => new SpaceControl(store, viewId), [store, viewId]);
  useEffect(() => () => control.dispose(), [control]);
  const reduced = useReducedMotion();
  useEffect(() => control.setReduced(reduced), [control, reduced]);
  return control;
}

interface SpaceFramesProps {
  store: SpacePanelStore;
  control: SpaceControl;
  mode: HandleMode;
  setMode: (mode: HandleMode) => void;
  say: (text: string) => void;
  client: SolidClient;
  project: ProjectSnapshot;
  view: ViewFile;
  scene: Scene;
  selection: Selection;
  space: ReturnType<typeof spaceOf>;
  shown: ViewSpace;
  theme: ThemeName;
  readOnly: boolean;
  /** How far the exploded view moves each entry, as the newest frame said. */
  shifts: SpaceShifts | undefined;
  /** Told how far it moves them whenever a frame says so differently. */
  onShifts: (shifts: SpaceShifts | undefined) => void;
}

/** The worker's frames of the space, and what it is sent as what the panel shows changes. */
function SpaceFrames({
  store,
  control,
  mode,
  setMode,
  say,
  client,
  project,
  view,
  scene,
  selection,
  space,
  shown,
  theme,
  readOnly,
  shifts,
  onShifts,
}: SpaceFramesProps) {
  const t = useT();
  const hint = useId();
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useFrameSize(box, client.limits?.largestPicture ?? LARGEST_SOLID_PICTURE);
  const index = modelIndexOf(project);
  const entries = useMemo(() => {
    // A marker is drawn in its shape's fill, in the theme the canvas draws it in.
    const fills = new Map<Id, Color>();
    for (const shape of scene.shapes) {
      if (fills.has(shape.element)) continue;
      fills.set(shape.element, theme === 'dark' && shape.dark ? shape.dark.fill : shape.fill);
    }
    return spaceEntriesOf(
      space,
      (element) => index.element(element)?.name ?? element,
      (element) => fills.get(element),
    );
  }, [space, index, scene, theme]);
  const pixelRatio = usePixelRatio();
  const emphasis = useEmphasis();
  const { reduced } = useMotion();
  const hovered = useHover()?.element;
  const lookup = useAttributeLookup();
  const valueOf = useMemo(() => attributeValueOf(project, lookup), [project, lookup]);
  const overlay = useMemo(() => overlayOf(view, valueOf), [view, valueOf]);
  // The legend of the overlays that color something here, as the canvas's legend words them.
  const legend = useSpaceLegend(project, view, space, valueOf, theme);
  const emphasized = useMemo(() => emphasize(scene, emphasis), [scene, emphasis]);
  const states = useMemo(
    () =>
      spaceStateList(
        spaceStates({
          space,
          shapes: scene.shapes,
          emphasis: shapeEmphasisOf(emphasized),
          selected: selection.elements,
          hovered,
          overlay,
          containersOf: (element) => index.containersOf(element),
          world: index.world.id,
        }),
      ),
    [space, scene, emphasized, selection.elements, hovered, overlay, index],
  );
  // The relations markers travel along on the canvas, drawn in space with their markers, and the
  // relations of the selection while Relations of the selection is on.
  const markers = emphasis.markers;
  const ofSelection = useSelectionRelations(
    shown.relations === true,
    project,
    space,
    scene,
    emphasized,
    selection,
  );
  const lines = useMemo(
    () =>
      (markers && markers.length > 0) || ofSelection.length > 0
        ? spaceLinesOf(project, space, markers ?? [], ofSelection)
        : undefined,
    [project, space, markers, ofSelection],
  );
  const explode = useEasedExplode(store, shown.explode ?? 0, reduced);
  const interaction = useSpaceInteraction({
    control,
    canvas,
    size,
    pixelRatio,
    space,
    entries,
    mode,
    setMode,
    say,
    readOnly,
    ...(shifts ? { shifts } : {}),
  });
  const drawnEntries = interaction.entries;
  const handles = interaction.handles;
  const now = useMemo(
    (): SpaceShown => ({
      size,
      entries: drawnEntries,
      states,
      ...(shown.camera ? { camera: shown.camera } : {}),
      ...(shown.cut ? { cut: shown.cut } : {}),
      ...(explode > 0 ? { explode } : {}),
      ...(shown.names === undefined ? {} : { names: shown.names }),
      ...(lines && lines.length > 0 ? { lines } : {}),
      theme,
      pixelRatio,
      ...(handles ? { handles } : {}),
    }),
    [
      size,
      drawnEntries,
      states,
      shown.camera,
      shown.cut,
      explode,
      shown.names,
      lines,
      theme,
      pixelRatio,
      handles,
    ],
  );
  const [problem, setProblem] = useState<SolidProblem>();
  const drawing = useRef<SpaceDrawing | undefined>(undefined);
  const sent = useRef(now);
  const latest = useRef(now);
  // What the panel's state showed as a frame was asked for: where it was drawn from is in its coordinates.
  const where = useRef({ viewId: view.id, root: shown.root });
  useLayoutEffect(() => {
    latest.current = now;
    where.current = { viewId: view.id, root: shown.root };
  });

  // How far the exploded view moved each entry in the newest frame that said so, kept as frames come.
  const keptShifts = useRef(shifts);
  const tellShifts = useRef(onShifts);
  useLayoutEffect(() => {
    tellShifts.current = onShifts;
  });

  // One drawing while the panel shows frames, ended when it goes.
  useEffect(() => {
    sent.current = latest.current;
    const started = client.showSpace(latest.current, {
      onFrame: (frame) => {
        showFrame(canvas.current, frame);
        const moved = frame.shifts;
        if (moved) {
          const next = shiftsFrom(moved, keptShifts.current);
          if (next !== keptShifts.current) {
            keptShifts.current = next;
            tellShifts.current(next);
          }
        }
        const { viewId, root } = where.current;
        store.moves.setDrawn(viewId, {
          camera: frame.camera,
          aspect: frame.width / Math.max(1, frame.height),
          root,
          ...(keptShifts.current ? { shifts: keptShifts.current } : {}),
        });
      },
      onProblem: setProblem,
    });
    drawing.current = started;
    control.attach(started);
    return () => {
      started.end();
      drawing.current = undefined;
      control.attach(undefined);
    };
  }, [client, store, control]);

  // What changed, and nothing else, so that the worker draws only when something does.
  useEffect(() => {
    const change = changeOf(sent.current, now);
    sent.current = now;
    if (change) drawing.current?.update(change);
  }, [now]);

  // Framings asked of the panel, once its drawing has what it shows.
  useFramingRequests(store, view.id, drawing, reduced);

  return (
    <div ref={box} className="space-panel-frames">
      <canvas
        ref={canvas}
        className="space-panel-canvas"
        role="application"
        aria-roledescription={t('physical space')}
        aria-label={t(
          { one: 'Physical space: {count} element', other: 'Physical space: {count} elements' },
          { count: space.entries.size },
        )}
        aria-describedby={hint}
        {...interaction.props}
      />
      <p id={hint} className="visually-hidden">
        {t(readOnly ? SPACE_READING_HINT : SPACE_HINT)}
      </p>
      {problem?.code === 'unavailable' ? (
        <p className="space-panel-message">
          {t('This browser cannot draw physical space: it has no WebGL.')}
        </p>
      ) : (
        <LegendPanel legend={legend} className="space-panel-legend" />
      )}
    </div>
  );
}

/**
 * The legend the panel shows: the parts of the view's legend (ADR 0055) whose overlays give something
 * it draws its fill or its opacity, measured against the canvas of the theme it draws in.
 */
function useSpaceLegend(
  project: ProjectSnapshot,
  view: ViewFile,
  space: Space,
  valueOf: SpaceAttributeValue,
  theme: ThemeName,
) {
  const legend = useMemo(
    () => legendOf(view, definitionsIn(project), theme),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the definitions follow the packages and the project appearances only
    [view, project.packages, project.project.appearances, theme],
  );
  const coloring = useMemo(
    () => overlaysColoringSpace(space, view.overlays, valueOf),
    [space, view.overlays, valueOf],
  );
  return useMemo(() => spaceLegendOf(legend, coloring), [legend, coloring]);
}

const NO_RELATIONS: readonly SelectionRelation[] = [];

/** The relations of the selection the panel draws: none while Relations of the selection is off. */
function useSelectionRelations(
  on: boolean,
  project: ProjectSnapshot,
  space: Space,
  scene: Scene,
  emphasized: Emphasized,
  selection: Selection,
): readonly SelectionRelation[] {
  const { elements, relations } = selection;
  return useMemo(
    () =>
      on
        ? selectionRelationsOf(project, space, scene, emphasized, { elements, relations })
        : NO_RELATIONS,
    [on, project, space, scene, emphasized, elements, relations],
  );
}

/**
 * The exploded view the panel draws: the factor it is given, eased in over a moment from where it
 * was, on the store's frames, or at once while motion is reduced (ADR 0076).
 */
function useEasedExplode(store: SpacePanelStore, target: number, reduced: boolean): number {
  const [drawn, setDrawn] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (reduced || from === target) {
      current.current = target;
      setDrawn(target);
      return;
    }
    const start = store.now();
    let handle: number | undefined;
    const step = () => {
      const share = Math.min(1, (store.now() - start) / EXPLODE_EASE);
      const value = share >= 1 ? target : explodeBetween(from, target, share);
      current.current = value;
      setDrawn(value);
      handle = share < 1 ? store.frames.request(step) : undefined;
    };
    handle = store.frames.request(step);
    return () => {
      if (handle !== undefined) store.frames.cancel(handle);
    };
  }, [store, target, reduced]);
  return reduced ? target : drawn;
}

/** Hands a frame to the panel's canvas, which takes its bitmap. */
function showFrame(canvas: HTMLCanvasElement | null, frame: SpaceFrameReply): void {
  if (!canvas) return;
  const context = canvas.getContext('bitmaprenderer');
  if (!context) return;
  if (canvas.width !== frame.width) canvas.width = frame.width;
  if (canvas.height !== frame.height) canvas.height = frame.height;
  context.transferFromImageBitmap(frame.bitmap);
}

/** How an element's attribute is read through the attribute lookup, live and computed values too. */
function attributeValueOf(
  project: ProjectSnapshot,
  lookup: ReturnType<typeof useAttributeLookup>,
): SpaceAttributeValue {
  const index = modelIndexOf(project);
  const definitions = definitionsIn(project);
  return (id, name) => {
    const element = index.element(id);
    return element ? lookup.value({ kind: 'element', element }, name, definitions) : undefined;
  };
}

/** What the open view's overlays give an element, through the attribute lookup. */
function overlayOf(
  view: ViewFile,
  valueOf: SpaceAttributeValue,
): ((element: Id) => SpaceOverlayLook | undefined) | undefined {
  const overlays = view.overlays;
  if (!overlays || overlays.length === 0) return undefined;
  return (id) => {
    const look = overlayLookOf(overlays, 'elements', (name) => valueOf(id, name));
    if (!look) return undefined;
    return {
      ...(look.fill === undefined ? {} : { fill: look.fill }),
      ...(look.opacity === undefined ? {} : { opacity: look.opacity }),
    };
  };
}

/** The screen's pixel ratio, as the worker takes it, which sizes what keeps its size on the screen. */
function usePixelRatio(): number {
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.min(SPACE_PIXEL_RATIOS.most, Math.max(SPACE_PIXEL_RATIOS.least, ratio));
}

/**
 * The size of the panel's frames, in pixels: its box's, at the screen's pixel ratio, at most the
 * largest the worker draws a side, and at least one.
 */
function useFrameSize(box: RefObject<HTMLDivElement | null>, largest: number): PixelSize {
  const [size, setSize] = useState<PixelSize>({ width: 1, height: 1 });
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const side = (css: number) => Math.min(largest, Math.max(1, Math.round(css * ratio)));
      const next = { width: side(width), height: side(height) };
      setSize((last) => (last.width === next.width && last.height === next.height ? last : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [box, largest]);
  return size;
}
