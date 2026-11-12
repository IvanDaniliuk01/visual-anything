/**
 * Steps that show pictures, videos and link cards (ADR 0098, stage 4). A scenario's step and a tour's
 * step may list the pictures, videos and link cards of their view they show (`shows`), and the videos
 * among them that play (`playing`). A scenario or tour *chooses its pictures* once any of its steps
 * lists some: while it plays, those of the view its current step does not list are hidden. One none
 * of whose steps lists any shows them all.
 *
 * A step keeps naming a free shape deleted since, as a broken step keeps a relation: it is never
 * changed by the deletion, and plays without it. Pure: the app hides and plays what this says.
 */
import type { FreeShape, Id, LinkCard, Picture, ViewFile } from '@visual-anything/schema';
import { isVideoFormat } from './clean';

/** The most free shapes one step shows. */
export const MAX_STEP_SHOWS = 500;

/** The most videos one step plays, as at most four videos play at once. */
export const MAX_STEP_PLAYING = 4;

/** What a step lists of its view's pictures, videos and link cards. */
export interface StepPictures {
  shows?: readonly Id[] | undefined;
  playing?: readonly Id[] | undefined;
}

/** A free shape a step can show: a picture, a video among them, or a link card. */
export type ShowableShape = Picture | LinkCard;

/** Whether a step can show a free shape: a picture, a video or a link card, never a note or an arrow. */
export function isShowable(shape: FreeShape): shape is ShowableShape {
  return shape.kind === 'picture' || shape.kind === 'link';
}

/** The pictures, videos and link cards of a view, in its order: what its steps can show. */
export function showableOf(view: Pick<ViewFile, 'freeShapes'>): ShowableShape[] {
  return view.freeShapes.filter(isShowable);
}

/** Whether a free shape is a video: a picture whose file is an MP4 or a WebM. */
export function isVideoShape(shape: FreeShape | undefined): shape is Picture {
  return shape?.kind === 'picture' && isVideoFormat(shape.media.format);
}

/** Whether a scenario's or a tour's steps choose their pictures: one of them at least lists some. */
export function choosesPictures(steps: readonly StepPictures[]): boolean {
  return steps.some((step) => step.shows !== undefined && step.shows.length > 0);
}

/** What the steps shown now hide of their view, and the videos they play. */
export interface ShownPictures {
  /** The pictures, videos and link cards of the view none of the steps lists, by id. */
  hidden: ReadonlySet<Id>;
  /** The videos the steps play that the view holds and that they show, each once, in order. */
  playing: Id[];
}

/**
 * What the steps shown now, one step or those an aggregated step stands for, hide of their view and
 * play, when their scenario or tour chooses its pictures; undefined when it does not, or when the view
 * is gone, so that everything shows as before. What a step names that the view no longer holds is
 * left out.
 */
export function shownPictures(
  view: Pick<ViewFile, 'freeShapes'> | undefined,
  steps: readonly StepPictures[],
  chooses: boolean,
): ShownPictures | undefined {
  if (!chooses || view === undefined) return undefined;
  const shown = new Set<Id>();
  for (const step of steps) for (const id of step.shows ?? []) shown.add(id);
  const showable = showableOf(view);
  const byId = new Map(showable.map((shape) => [shape.id, shape]));
  const hidden = new Set(showable.filter((shape) => !shown.has(shape.id)).map((shape) => shape.id));
  const playing: Id[] = [];
  for (const step of steps) {
    for (const id of step.playing ?? []) {
      if (shown.has(id) && isVideoShape(byId.get(id)) && !playing.includes(id)) playing.push(id);
    }
  }
  return { hidden, playing };
}

/** Something a step's lists name that its view does not hold, or a video it cannot play. */
export interface StepPicturesProblem {
  code: 'unknown-free-shape' | 'invalid-command';
  message: string;
  /** The id it names. */
  subject: Id;
}

/**
 * What a step's lists name that its view does not hold now: an id of `shows` that is no picture,
 * video or link card of the view, and one of `playing` that is no video it shows. Empty when it shows
 * and plays what it says. A step with such problems is kept, and plays without them.
 */
export function stepPicturesProblems(
  view: Pick<ViewFile, 'freeShapes'> | undefined,
  step: StepPictures,
): StepPicturesProblem[] {
  const problems: StepPicturesProblem[] = [];
  const byId = new Map((view ? showableOf(view) : []).map((shape) => [shape.id, shape]));
  const shows = new Set(step.shows ?? []);
  for (const id of step.shows ?? []) {
    if (!byId.has(id)) {
      problems.push({
        code: 'unknown-free-shape',
        message: `A step shows pictures, videos and link cards of its view, and "${id}" is none of them.`,
        subject: id,
      });
    }
  }
  for (const id of step.playing ?? []) {
    if (!shows.has(id)) {
      problems.push({
        code: 'invalid-command',
        message: `A step plays only videos it shows, and it does not show "${id}".`,
        subject: id,
      });
    } else if (byId.has(id) && !isVideoShape(byId.get(id))) {
      problems.push({
        code: 'invalid-command',
        message: `A step plays videos, and "${id}" is no video.`,
        subject: id,
      });
    }
  }
  return problems;
}

/** The ids a step's lists name that its view does not hold now, each once, in order. */
export function missingShown(
  view: Pick<ViewFile, 'freeShapes'> | undefined,
  step: StepPictures,
): Id[] {
  const showable = new Set((view ? showableOf(view) : []).map((shape) => shape.id));
  return [...new Set(step.shows ?? [])].filter((id) => !showable.has(id));
}

/**
 * A step's lists with what its view no longer holds taken out, and the videos that are not among
 * them: what "Take out what is gone" sends. Each list left empty is left out.
 */
export function withoutMissingShown(
  view: Pick<ViewFile, 'freeShapes'> | undefined,
  step: StepPictures,
): { shows?: Id[]; playing?: Id[] } {
  const byId = new Map((view ? showableOf(view) : []).map((shape) => [shape.id, shape]));
  const shows = (step.shows ?? []).filter((id) => byId.has(id));
  const playing = (step.playing ?? []).filter(
    (id) => shows.includes(id) && isVideoShape(byId.get(id)),
  );
  return {
    ...(shows.length > 0 ? { shows } : {}),
    ...(playing.length > 0 ? { playing } : {}),
  };
}
