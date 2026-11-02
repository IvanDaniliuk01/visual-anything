/**
 * The read-only page's canvas: the app's renderer drawing the open view, with the page's reading
 * gestures (`controller.ts`), zoom buttons for those without a wheel, and a live region that says what
 * the keys select. It draws the emphasis that filters, focus and playback set, as the app's does, and
 * shares what it hovers by element id, marking in each of its shapes what the physical-space panel or
 * the outline hovers (ADR 0076).
 */
import type { ProjectSnapshot, ThemeName } from '@visual-anything/core';
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Camera } from '../canvas/camera';
import type { CollapseAction } from '../canvas/collapse';
import { indexScene } from '../canvas/hit';
import { drawingOfScene, type Scene } from '../canvas/scene';
import { useEmphasis, type Emphasis } from '../editor/emphasis';
import { useHover, useHoverStore } from '../editor/hover';
import type { Selection } from '../editor/selection';
import { useT } from '../i18n';
import { FitIcon, ZoomInIcon, ZoomOutIcon } from '../shell/icons';
import { THEMES } from '../theme/themes';
import { canvasCamera, type CanvasCamera } from '../view-state/canvas';
import { KEY_ZOOM, ViewerController } from './controller';
import { PlacedHoverCard } from '../canvas/HoverCard';
import type { SolidClient } from '../solids/solid-client';
import { useHoverCard } from '../canvas/useHoverCard';

interface ViewerCanvasProps {
  project: ProjectSnapshot;
  scene: Scene;
  /** The text alternative for the drawing, which screen readers cannot see. */
  label: string;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** Collapses or expands containers in this page only. */
  onCollapse: (action: CollapseAction, collapsed: boolean) => void;
  /** The shape to bring into sight; each new request moves the camera again. */
  revealed?: { key: string; request: number } | undefined;
  theme: ThemeName;
  /** Given the canvas's camera once the canvas is made, and undefined once it goes. */
  onCanvas?: (canvas: CanvasCamera | undefined) => void;
  /** What draws the page's solids (ADR 0075); none in a page without solids. */
  solids?: SolidClient | undefined;
}

/** The keys of the page's canvas, for screen readers. */
export const VIEWER_KEYS_HINT =
  'Drag or use two fingers to pan; pinch, Ctrl with the wheel, or + and − to zoom; 0 fits the view. Arrow keys go from shape to shape, Alt with ↑ and ↓ to the container and inside it; ] and [ step through relations, Enter follows one; Alt with − and + collapses and expands. Escape clears the selection.';

export function ViewerCanvas({
  project,
  scene,
  label,
  selection,
  onSelect,
  onCollapse,
  revealed,
  theme,
  onCanvas,
  solids,
}: ViewerCanvasProps) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ViewerController | null>(null);
  const [failure, setFailure] = useState<string>();
  const [cameras] = useState(() => new CameraWatch());
  const [announcement, setAnnouncement] = useState({ text: '', count: 0 });
  const hint = useId();
  const emphasis = useRef<Emphasis>({});
  const latest = useRef({ onSelect, onCollapse, theme });
  useLayoutEffect(() => {
    latest.current = { onSelect, onCollapse, theme };
  });
  const indexing = useMemo(() => {
    try {
      return { indexed: indexScene(scene) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [scene]);
  const indexed = indexing.indexed;
  // The shape whose hover card shows, as on the editor's canvas (ADR 0082).
  const [hoverCard, hoverShape] = useHoverCard(
    (key) => indexed?.byKey.get(key),
    () => drawingOfScene(indexed?.scene),
  );
  const collapse = useEffectEvent((action: CollapseAction, collapsed: boolean) =>
    latest.current.onCollapse(action, collapsed),
  );
  // What the canvas hovers is shared by element id, as the physical-space panel marks it (ADR 0076).
  const hovers = useHoverStore();
  const shareHover = useEffectEvent((key: string | undefined) => {
    const shape = key === undefined ? undefined : indexed?.byKey.get(key);
    hovers?.set('canvas', shape?.element);
  });
  useEffect(() => () => hovers?.set('canvas', undefined), [hovers]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new ViewerController(
      host,
      {
        select: (next) => latest.current.onSelect(next),
        collapse: (action, collapsed) => collapse(action, collapsed),
        camera: (camera) => cameras.set(camera),
        failure: (error) => setFailure(error instanceof Error ? error.message : String(error)),
        announce: (text) => setAnnouncement((last) => ({ text, count: last.count + 1 })),
        hoverShape: (key) => {
          hoverShape(key);
          shareHover(key);
        },
      },
      { theme: THEMES[latest.current.theme].canvas, ...(solids ? { solids } : {}) },
    );
    controllerRef.current = controller;
    controller.setEmphasis(emphasis.current);
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [cameras, hoverShape, solids]);

  useEffect(() => {
    controllerRef.current?.renderer.setTheme(THEMES[theme].canvas);
  }, [theme]);

  // What the physical-space panel or the outline hovers is marked in each of its shapes here.
  const hover = useHover();
  const linkedHover = hover && hover.from !== 'canvas' ? hover.element : undefined;
  useEffect(() => {
    controllerRef.current?.renderer.setLinkedHover(linkedHover);
  }, [linkedHover]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!onCanvas || !controller) return;
    onCanvas(canvasCamera(controller, cameras));
    return () => onCanvas(undefined);
  }, [onCanvas, cameras]);

  useEffect(() => {
    if (indexed) controllerRef.current?.update(project, indexed);
  }, [project, indexed]);

  useEffect(() => {
    controllerRef.current?.setSelection(selection);
  }, [selection]);

  useEffect(() => {
    if (revealed) controllerRef.current?.reveal(revealed.key);
  }, [revealed]);

  return (
    <div className="canvas-frame viewer-canvas">
      <DrawnEmphasis
        onEmphasis={(next) => {
          emphasis.current = next;
          controllerRef.current?.setEmphasis(next);
        }}
      />
      <div
        ref={hostRef}
        className="canvas-host viewer-canvas-host"
        role="application"
        aria-roledescription={t('canvas')}
        aria-label={label}
        aria-describedby={hint}
        tabIndex={0}
      />
      <p id={hint} className="visually-hidden">
        {t(VIEWER_KEYS_HINT)}
      </p>
      <div className="viewer-zoom" role="group" aria-label={t('Zoom')}>
        <button
          type="button"
          aria-label={t('Zoom in')}
          title={t('Zoom in (+)')}
          onClick={() => controllerRef.current?.zoomBy(KEY_ZOOM)}
        >
          <ZoomInIcon />
        </button>
        <button
          type="button"
          aria-label={t('Zoom out')}
          title={t('Zoom out (−)')}
          onClick={() => controllerRef.current?.zoomBy(1 / KEY_ZOOM)}
        >
          <ZoomOutIcon />
        </button>
        <button
          type="button"
          aria-label={t('Fit the view')}
          title={t('Fit the view (0)')}
          onClick={() => controllerRef.current?.fit()}
        >
          <FitIcon />
        </button>
      </div>
      {hoverCard !== undefined && (
        <PlacedHoverCard shape={indexed?.byKey.get(hoverCard)} cameras={cameras} />
      )}
      <div role="status" aria-label={t('Selection')} className="visually-hidden">
        {announcement.text}
        {announcement.count % 2 === 1 ? ' ' : ''}
      </div>
      {(failure ?? indexing.error) !== undefined ? (
        <p className="canvas-message canvas-failure" role="alert">
          {t('The canvas could not draw this view: {why}', {
            why: t.message(failure ?? indexing.error ?? ''),
          })}
        </p>
      ) : (
        scene.bounds === undefined && (
          <p className="canvas-message">{t('This view has no shapes. Choose another view.')}</p>
        )
      )}
    </div>
  );
}

/** The camera, kept outside React's state, for what follows it. */
class CameraWatch {
  camera: Camera | undefined;
  private readonly listeners = new Set<() => void>();

  set(camera: Camera): void {
    this.camera = camera;
    for (const listener of this.listeners) listener();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly current = (): Camera | undefined => this.camera;
}

/** Hands the canvas the emphasis to draw; it renders on its own, as markers move every frame. */
function DrawnEmphasis({ onEmphasis }: { onEmphasis: (emphasis: Emphasis) => void }) {
  const emphasis = useEmphasis();
  const draw = useEffectEvent(onEmphasis);
  useEffect(() => {
    draw(emphasis);
  }, [emphasis]);
  return null;
}
