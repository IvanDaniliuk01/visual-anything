/**
 * When things happen as a tour moves from one step to the next (ADR 0077): the three stages of a
 * transition, out, camera and in, which never last past 1.1 s; how long a step's text takes to read;
 * and when a step that advances by itself moves on.
 */
import type { TourStep } from '@visual-anything/schema';
import type { TourMove } from './camera';

/** How long what a step hides or dims, and the old caption, take to fade out, in milliseconds. */
export const TOUR_FADE_OUT = 150;
/** How long a step's marks and its caption take to fade in. */
export const TOUR_FADE_IN = 200;
/** How long the frame before fades into the frame after where the camera cuts. */
export const TOUR_CROSS_FADE = 200;
/** The longest a whole transition takes. */
export const MAX_TOUR_TRANSITION = 1100;

/** When one stage of a transition starts and how long it lasts, in milliseconds. */
export interface TourStage {
  start: number;
  duration: number;
}

/** A transition from one step to the next, stage by stage. */
export interface TourTransition {
  /** What the new step hides or dims fades out, and so does the old caption. */
  out: TourStage;
  /**
   * The camera: it stays, for two steps that share their view state and play as one scene; it moves
   * along its path; or it cuts, the frame before cross-fading into the frame after.
   */
  camera: TourStage & { kind: 'stay' | 'ease' | 'cut' };
  /** The step's marks and its caption fade in. */
  in: TourStage;
  /** When the last stage ends. */
  total: number;
}

/**
 * The stages of a step's transition, for how its camera gets there: `stay` when two steps in a row
 * share their view state. With `fades` off, as the person's Fades preference asks, the fades are
 * instant and a cut is a plain cut; the camera still moves as `move` says, which is a cut whenever
 * motion is reduced. When the three would last past {@link MAX_TOUR_TRANSITION}, the marks start to
 * fade in that much before the camera stops.
 */
export function tourTransition(
  move: TourMove | 'stay',
  options: { fades: boolean },
): TourTransition {
  const out = options.fades ? TOUR_FADE_OUT : 0;
  const fadeIn = options.fades ? TOUR_FADE_IN : 0;
  const camera =
    move === 'stay'
      ? { kind: 'stay' as const, duration: 0 }
      : move.kind === 'ease'
        ? { kind: 'ease' as const, duration: move.duration }
        : { kind: 'cut' as const, duration: options.fades ? TOUR_CROSS_FADE : 0 };
  const overlap = Math.max(0, out + camera.duration + fadeIn - MAX_TOUR_TRANSITION);
  const cameraStart = out;
  const inStart = Math.max(cameraStart, cameraStart + camera.duration - overlap);
  return {
    out: { start: 0, duration: out },
    camera: { ...camera, start: cameraStart },
    in: { start: inStart, duration: fadeIn },
    total: Math.max(cameraStart + camera.duration, inStart + fadeIn),
  };
}

/** How fast a step's text is read when it advances by itself: 200 words a minute. */
export const TOUR_READING_WORDS_PER_MINUTE = 200;

/** How long a text takes to read, in milliseconds, at {@link TOUR_READING_WORDS_PER_MINUTE}. */
export function readingTime(text: string): number {
  const words = text.split(/\s+/).filter((word) => word !== '').length;
  return Math.ceil((words * 60_000) / TOUR_READING_WORDS_PER_MINUTE);
}

/** How long a step's whole text takes to read: its caption's title and text, and its reveals' texts. */
export function stepReadingTime(step: Pick<TourStep, 'caption' | 'reveal'>): number {
  const texts = [
    step.caption.title,
    step.caption.text ?? '',
    ...(step.reveal ?? []).map((reveal) => reveal.text ?? ''),
  ];
  return readingTime(texts.join(' '));
}

/**
 * When a step that advances by itself moves on: after its milliseconds, but never before its text
 * can be read; or once the scenario it plays ends. `undefined` for a step that waits for the person.
 */
export function advanceAfter(
  step: Pick<TourStep, 'caption' | 'reveal' | 'advance'>,
): number | 'after-scenario' | undefined {
  const { advance } = step;
  if (advance === undefined || advance === 'after-scenario') return advance;
  return Math.max(advance, stepReadingTime(step));
}
