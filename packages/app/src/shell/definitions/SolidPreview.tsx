/**
 * A solid's preview that turns (ADR 0075), for the component editor's Solid section and Import…'s
 * dialog: the solid worker draws it live, as turning on the canvas does, from the camera given and in
 * its lighting. Dragging over it turns it, the wheel zooms it, and the keys turn and zoom it as they do
 * on the canvas, 0 going back to the camera given; where it is seen from is announced. Turning it
 * changes nothing stored: `onUseView`, when given, keeps the camera it is seen from.
 *
 * Where no program draws solids, as in tests or a build without the solid worker, it says so in the
 * preview's place, and its description stays its text alternative.
 */
import type { SolidCamera } from '@visual-anything/schema';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  sameTurnCamera,
  turnAnnouncement,
  turnKey,
  turnedByDrag,
  zoomedByWheel,
} from '../../canvas/solids/turning';
import { useSolidClient } from '../../canvas/solids/useSolidClient';
import { useT } from '../../i18n';
import type { SolidClient, SolidTurning } from '../../solids/client';
import type { SolidFrameReply } from '../../solids/protocol';

interface SolidPreviewProps {
  /** The solid's file, by its hash. */
  hash: string;
  /** Its name, for what turning it announces. */
  name: string;
  /** Its text alternative: its description, or what it is when it has none. */
  label: string;
  camera: SolidCamera;
  lighting: 'studio' | 'flat';
  /** The preview's side, in CSS pixels. */
  size?: number;
  /** Keeps the camera it is seen from now; absent, it offers nothing to keep. */
  onUseView?: (camera: SolidCamera) => void;
  /** The solid client; the live session's by default. */
  client?: SolidClient | undefined;
}

/** The largest side a preview's frames are drawn at, in device pixels. */
const LARGEST = 2048;

export function SolidPreview({
  hash,
  name,
  label,
  camera,
  lighting,
  size = 160,
  onUseView,
  client: given,
}: SolidPreviewProps) {
  const t = useT();
  const live = useSolidClient();
  const client = given ?? live;
  const canvas = useRef<HTMLCanvasElement>(null);
  const session = useRef<SolidTurning | undefined>(undefined);
  const drag = useRef<{ x: number; y: number; camera: SolidCamera } | undefined>(undefined);
  const hintId = useId();
  // Where it is seen from, turned from the camera given; a camera given anew is where it starts.
  const [turned, setTurned] = useState({ from: camera, seen: camera });
  const seen = sameTurnCamera(turned.from, camera) ? turned.seen : camera;
  // Which drawing, of a file in a light, has shown a frame.
  const drawing = `${hash} ${lighting}`;
  const [drawnFor, setDrawnFor] = useState<string>();
  const drawn = drawnFor === drawing;
  const [announced, setAnnounced] = useState('');
  const available =
    client !== undefined && !client.unavailable && client.problem(hash) === undefined;
  const pixels = Math.min(
    LARGEST,
    Math.round(size * (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)),
  );

  // One turning while the preview shows this solid in this light; the camera given starts it.
  useEffect(() => {
    if (!client || client.unavailable) return;
    const draw = (frame: SolidFrameReply) => {
      const context = canvas.current?.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, pixels, pixels);
      context.drawImage(frame.bitmap, 0, 0, pixels, pixels);
      setDrawnFor(`${hash} ${lighting}`);
    };
    const turning = client.turn(
      {
        solid: hash,
        size: { width: pixels, height: pixels },
        camera,
        lighting,
        hidden: [],
        parts: false,
      },
      draw,
    );
    session.current = turning;
    return () => {
      turning.end();
      if (session.current === turning) session.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a camera given later moves the turning there rather than starting another
  }, [client, hash, lighting, pixels]);

  // A camera given anew, as when the person types one or keeps this view, is where it is seen from.
  useEffect(() => {
    session.current?.camera(camera);
  }, [camera]);

  const look = (next: SolidCamera, announce: boolean) => {
    if (sameTurnCamera(next, seen)) return;
    setTurned({ from: camera, seen: next });
    session.current?.camera(next);
    if (announce) setAnnounced(turnAnnouncement(name, next));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const done = turnKey(event, seen, camera);
    if (done.kind !== 'camera') return;
    event.preventDefault();
    look(done.camera, true);
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, camera: seen };
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const from = drag.current;
    if (!from) return;
    look(turnedByDrag(from.camera, event.clientX - from.x, event.clientY - from.y, size), false);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = undefined;
    setAnnounced(turnAnnouncement(name, seen));
  };

  const changed = !sameTurnCamera(seen, camera);
  return (
    <div className="solid-preview">
      {available ? (
        <canvas
          ref={canvas}
          className="solid-preview-picture"
          width={pixels}
          height={pixels}
          style={{ width: size, height: size }}
          tabIndex={0}
          role="img"
          aria-roledescription={t('solid')}
          aria-label={label}
          aria-describedby={hintId}
          data-drawn={drawn ? 'true' : undefined}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(event) => look(zoomedByWheel(seen, event.deltaY), false)}
        />
      ) : (
        <div
          className="solid-preview-none"
          role="img"
          aria-label={label}
          style={{ width: size, height: size }}
        >
          {t('No preview here: the solid is drawn where Visual Anything draws solids.')}
        </div>
      )}
      {available && (
        <p id={hintId} className="solid-preview-hint">
          {t('Drag or use the arrow keys to turn it, + and − to zoom, and 0 to go back.')}
        </p>
      )}
      {onUseView !== undefined && available && (
        <button
          type="button"
          className="inspector-action"
          disabled={!changed}
          onClick={() => onUseView(seen)}
        >
          {t('Use this view')}
        </button>
      )}
      <p className="visually-hidden" aria-live="polite">
        {announced}
      </p>
    </div>
  );
}
