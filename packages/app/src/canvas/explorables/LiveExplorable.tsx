/**
 * An explorable live in place on the canvas (ADR 0107, A10.3, as the user changed Q11 on
 * 2026-11-12): its frame laid over its shape, at the shape's size in canvas units, so that the page
 * lays out as its still was taken, and scaled with the camera. Its corner follows every camera move
 * and its scale only once the camera rests (`LiveFollower`), written to the element's style outside
 * React, so that panning renders nothing and a zoom never makes the frame paint again at each step.
 *
 * A frame that is not shown is kept, hidden, so that it shows again as it was left: off screen, it
 * comes back as it was; turned still with Escape or ×, or paused for a fifth, it first takes a still
 * of itself as it was left, which its shape shows meanwhile. When the tab lets it go past its eight
 * kept frames, it takes that still if it has none yet, and goes.
 */
import { stillBucket, type ProjectSnapshot, type StillBucket } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ExplorableView, type LiveFrameHandle } from '../../explorables/ExplorableView';
import { useT } from '../../i18n';
import { DismissIcon } from '../../shell/icons';
import type { Camera } from '../camera';
import type { Rect } from '../geometry';
import { LiveFollower, type LiveTarget } from './live';
import './live.css';

/** A still a frame took of itself, as it was left. */
export interface LeftStill {
  png: Uint8Array;
  width: number;
  height: number;
}

export interface LiveExplorableProps {
  target: LiveTarget;
  project: ProjectSnapshot;
  /** Where its spot is, in canvas units. */
  rect: Rect;
  /** Whether it is live, and whether its spot is on screen: it shows only when both are. */
  live: boolean;
  onScreen: boolean;
  camera: () => Camera | undefined;
  subscribe: (listener: () => void) => () => void;
  onSelect: (element: Id) => void;
  /** Its × button, or Escape in it. */
  onStill: () => void;
  onUse: () => void;
  /** It took a still of itself as it was left. */
  onLeft: (still: LeftStill) => void;
  /** The tab let it go: it took its still, if it could, and its owner removes it. */
  onGone: () => void;
}

/** What the box is doing: shown, taking its still unseen before it hides, hidden, or going. */
type Mode = 'shown' | 'taking' | 'hidden' | 'leaving';

const HIDDEN = 'canvas-live-explorable-hidden';

export function LiveExplorable({
  target,
  project,
  rect,
  live,
  onScreen,
  camera,
  subscribe,
  onSelect,
  onStill,
  onUse,
  onLeft,
  onGone,
}: LiveExplorableProps) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<LiveFrameHandle | undefined>(undefined);
  const shown = live && onScreen;
  const [mode, setMode] = useState<Mode>(shown ? 'shown' : 'hidden');
  // Whether its shape shows a still of how it was left, so that letting it go needs no other.
  const tookLeft = useRef(false);
  const latest = useRef({ onLeft, onGone, rect, camera });
  useLayoutEffect(() => {
    latest.current = { onLeft, onGone, rect, camera };
  });
  const follower = useRef<LiveFollower | undefined>(undefined);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const made = new LiveFollower(element, latest.current.rect);
    follower.current = made;
    const place = () => {
      const now = camera();
      // A hidden frame is not moved, so that nothing of it is drawn again while it is kept; nor one
      // going, which waits on screen for its still.
      if (now && !element.classList.contains(HIDDEN) && element.dataset.leaving === undefined) {
        made.place(now);
      }
    };
    place();
    const stop = subscribe(place);
    return () => {
      stop();
      made.dispose();
      follower.current = undefined;
    };
  }, [camera, subscribe]);

  useLayoutEffect(() => {
    follower.current?.setRect(rect);
  }, [rect]);

  // Whether it shows moves it from one mode to another, worked out as it renders.
  const [was, setWas] = useState({ shown, live });
  if (was.shown !== shown || was.live !== live) {
    setWas({ shown, live });
    if (mode !== 'leaving') {
      // Turned still or paused on screen: a still of it as it was left first, unseen, then hidden.
      setMode(shown ? 'shown' : mode === 'shown' && !live ? 'taking' : 'hidden');
    }
  }

  useEffect(() => {
    if (mode === 'shown') {
      tookLeft.current = false;
      // Back on screen: placed where the camera is now.
      const now = latest.current.camera();
      if (now) follower.current?.place(now);
      return;
    }
    if (mode !== 'taking') return;
    let current = true;
    void takeLeft(frame.current, latest.current, tookLeft).then(() => {
      if (current) setMode((now) => (now === 'taking' ? 'hidden' : now));
    });
    return () => {
      current = false;
    };
  }, [mode]);

  const letGo = () => {
    setMode('leaving');
    const element = box.current;
    const now = camera();
    // Unseen, on screen, so that its browser draws it for its still rather than throttle it.
    if (element && now) {
      element.dataset.leaving = '';
      element.style.transform = `translate(0px, 0px) scale(${now.scale})`;
    }
    void (async () => {
      if (!tookLeft.current) await takeLeft(frame.current, latest.current, tookLeft);
      latest.current.onGone();
    })();
  };

  const keyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onStill();
  };
  const unseen = mode === 'taking' || mode === 'leaving';
  return (
    <div
      ref={box}
      className={`canvas-live-explorable${mode === 'hidden' ? ` ${HIDDEN}` : ''}${
        unseen ? ' canvas-live-explorable-taking' : ''
      }`}
      style={{ width: rect.width, height: rect.height }}
      onKeyDown={keyDown}
      {...(mode === 'shown' ? {} : { 'aria-hidden': true, inert: true })}
    >
      <ExplorableView
        project={project}
        explorable={target.explorable}
        element={target.element}
        onSelect={onSelect}
        hidden={mode !== 'shown'}
        onLetGo={letGo}
        onUse={onUse}
        frameRef={(handle) => {
          frame.current = handle;
        }}
      />
      <button
        type="button"
        className="canvas-live-explorable-still"
        title={t('Show its still again (Escape)')}
        aria-label={t('Show its still again (Escape)')}
        onClick={onStill}
      >
        <DismissIcon />
      </button>
    </div>
  );
}

/** Takes a still of the frame as it is now, at the bucket its spot shows at, and hands it on. */
async function takeLeft(
  handle: LiveFrameHandle | undefined,
  latest: { onLeft: (still: LeftStill) => void; rect: Rect; camera: () => Camera | undefined },
  took: { current: boolean },
): Promise<void> {
  if (!handle) return;
  const scale = latest.camera()?.scale ?? 1;
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const bucket: StillBucket = stillBucket(latest.rect.width * scale * ratio);
  const still = await handle.takeStill(bucket);
  if (!still) return;
  took.current = true;
  latest.onLeft(still);
}
