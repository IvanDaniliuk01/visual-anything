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
 * Moving its camera, picking, the handles, its list and its announcements are the panel's
 * interaction's; the camera here is the one its state gives, or the one that frames everything.
 */
import {
  definitionsIn,
  modelIndexOf,
  overlayLookOf,
  spaceOf,
  type ProjectSnapshot,
  type ViewSpace,
} from '@visual-anything/core';
import type { Color, Id, ViewFile } from '@visual-anything/schema';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { emphasize } from '../canvas/emphasize';
import type { Scene } from '../canvas/scene';
import { useEmphasis } from '../editor/emphasis';
import { useHover } from '../editor/hover';
import type { Selection } from '../editor/selection';
import { useT } from '../i18n';
import { useAttributeLookup } from '../live-values/context';
import type { SolidClient, SolidProblem, SpaceDrawing } from '../solids/solid-client';
import {
  LARGEST_SOLID_PICTURE,
  SPACE_PIXEL_RATIOS,
  type PixelSize,
  type SpaceFrameReply,
  type SpaceShown,
} from '../solids/protocol';
import { usePreferences } from '../theme/usePreferences';
import { useSpacePanelState } from './context';
import { changeOf } from './changes';
import { drawsNothing, spaceEntriesOf } from './entries';
import { SpacePanelEdge } from './SpacePanelEdge';
import { shapeEmphasisOf, spaceStateList, spaceStates, type SpaceOverlayLook } from './states';
import type { SpacePanelStore } from './store';
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
}

/** What the panel says when the view holds nothing in physical space. */
const NOTHING_IN_SPACE =
  'Nothing this view shows is in physical space yet. To put an element there, select it and choose Place in physical space, show a solid on it, or ask Claude to give it a pose.';

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
  shown,
}: SpacePanelProps & { shown: ViewSpace }) {
  const t = useT();
  const heading = useId();
  const space = useMemo(() => spaceOf(project, view, shown.root), [project, view, shown.root]);
  const index = modelIndexOf(project);
  const root = index.element(space.root);
  const empty = drawsNothing(space);
  return (
    <section className="space-panel" id={id} aria-labelledby={heading}>
      <div className="space-panel-bar">
        <h2 id={heading} className="space-panel-title">
          {t('Physical space')}
        </h2>
        {root && (
          <span className="space-panel-shows">{t('Shows “{name}”', { name: root.name })}</span>
        )}
        <button
          type="button"
          className="space-panel-close"
          aria-label={t('Close the physical-space panel')}
          title={t('Close the physical-space panel')}
          onClick={() => store.close(view.id)}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {empty ? (
        <p className="space-panel-message">{t(NOTHING_IN_SPACE)}</p>
      ) : client ? (
        <SpaceFrames
          client={client}
          project={project}
          view={view}
          scene={scene}
          selection={selection}
          space={space}
          shown={shown}
        />
      ) : (
        <p className="space-panel-message">
          {t('Physical space is drawn while Visual Anything is connected.')}
        </p>
      )}
    </section>
  );
}

interface SpaceFramesProps {
  client: SolidClient;
  project: ProjectSnapshot;
  view: ViewFile;
  scene: Scene;
  selection: Selection;
  space: ReturnType<typeof spaceOf>;
  shown: ViewSpace;
}

/** The worker's frames of the space, and what it is sent as what the panel shows changes. */
function SpaceFrames({ client, project, view, scene, selection, space, shown }: SpaceFramesProps) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useFrameSize(box, client.limits?.largestPicture ?? LARGEST_SOLID_PICTURE);
  const index = modelIndexOf(project);
  const theme = usePreferences().theme;
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
  const hovered = useHover()?.element;
  const lookup = useAttributeLookup();
  const overlay = useMemo(() => overlayOf(project, view, lookup), [project, view, lookup]);
  const states = useMemo(
    () =>
      spaceStateList(
        spaceStates({
          space,
          shapes: scene.shapes,
          emphasis: shapeEmphasisOf(emphasize(scene, emphasis)),
          selected: selection.elements,
          hovered,
          overlay,
        }),
      ),
    [space, scene, emphasis, selection.elements, hovered, overlay],
  );
  const now = useMemo(
    (): SpaceShown => ({
      size,
      entries,
      states,
      ...(shown.camera ? { camera: shown.camera } : {}),
      ...(shown.cut ? { cut: shown.cut } : {}),
      ...(shown.explode === undefined ? {} : { explode: shown.explode }),
      ...(shown.names === undefined ? {} : { names: shown.names }),
      theme,
      pixelRatio,
    }),
    [size, entries, states, shown.camera, shown.cut, shown.explode, shown.names, theme, pixelRatio],
  );
  const [problem, setProblem] = useState<SolidProblem>();
  const drawing = useRef<SpaceDrawing | undefined>(undefined);
  const sent = useRef(now);
  const latest = useRef(now);
  useLayoutEffect(() => {
    latest.current = now;
  });

  // One drawing while the panel shows frames, ended when it goes.
  useEffect(() => {
    sent.current = latest.current;
    const started = client.showSpace(latest.current, {
      onFrame: (frame) => showFrame(canvas.current, frame),
      onProblem: setProblem,
    });
    drawing.current = started;
    return () => {
      started.end();
      drawing.current = undefined;
    };
  }, [client]);

  // What changed, and nothing else, so that the worker draws only when something does.
  useEffect(() => {
    const change = changeOf(sent.current, now);
    sent.current = now;
    if (change) drawing.current?.update(change);
  }, [now]);

  return (
    <div ref={box} className="space-panel-frames">
      <canvas
        ref={canvas}
        className="space-panel-canvas"
        role="img"
        aria-label={t(
          { one: 'Physical space: {count} element', other: 'Physical space: {count} elements' },
          { count: space.entries.size },
        )}
      />
      {problem?.code === 'unavailable' && (
        <p className="space-panel-message">
          {t('This browser cannot draw physical space: it has no WebGL.')}
        </p>
      )}
    </div>
  );
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

/** What the open view's overlays give an element, through the attribute lookup. */
function overlayOf(
  project: ProjectSnapshot,
  view: ViewFile,
  lookup: ReturnType<typeof useAttributeLookup>,
): ((element: Id) => SpaceOverlayLook | undefined) | undefined {
  const overlays = view.overlays;
  if (!overlays || overlays.length === 0) return undefined;
  const index = modelIndexOf(project);
  const definitions = definitionsIn(project);
  return (id) => {
    const element = index.element(id);
    if (!element) return undefined;
    const look = overlayLookOf(overlays, 'elements', (name) =>
      lookup.value({ kind: 'element', element }, name, definitions),
    );
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
