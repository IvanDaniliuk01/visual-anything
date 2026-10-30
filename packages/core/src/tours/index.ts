/**
 * Tours (ADR 0058, ADR 0077, ADR 0084): steps that each take the canvas to a view state with a
 * caption, played full screen, moving in stages along a bounded camera path, gliding the shapes they
 * share, revealing their marks, pointing at one and pulsing along chains. All pure; playing a tour
 * never changes a file.
 */
export type { PlayableStep, SavedViewStateCheck, TourStepProblem } from './steps';
export {
  MAX_CAPTION_TEXT,
  MAX_CAPTION_TITLE,
  MAX_SPEAKER_NOTES,
  MAX_TOUR_DESCRIPTION,
  MAX_TOUR_MARKS,
  MAX_TOUR_NAME,
  MAX_TOUR_REVEALS,
  MAX_TOUR_STEPS,
  MAX_TOUR_TEXT,
  TOUR_ADVANCE,
  checkSavedViewState,
  idsNamedByTours,
  isBrokenTourStep,
  marksOf,
  playableStep,
  savedViewStateOf,
  tourStepProblems,
  tourTextLength,
  viewStateOfStep,
} from './steps';
export type { ScreenSize, TourCameraPath, TourMove } from './camera';
export {
  MAX_TOUR_MOVE_TIME,
  MAX_TOUR_ZOOM_OUT,
  TOUR_MOVE_TIME,
  TOUR_MOVE_TIME_PER_UNIT,
  easeInOut,
  tourCameraPath,
  tourEase,
  tourMove,
} from './camera';
export type { TourRect, TourStepCheck, TourWarning, TourWarningKind } from './check';
export { LONG_TOUR_RANGE, TOUR_CHECK_SCREEN, checkTour } from './check';
export type { TourStage, TourTransition } from './timing';
export {
  MAX_TOUR_TRANSITION,
  TOUR_CROSS_FADE,
  TOUR_FADE_IN,
  TOUR_FADE_OUT,
  TOUR_READING_WORDS_PER_MINUTE,
  advanceAfter,
  readingTime,
  stepReadingTime,
  tourTransition,
} from './timing';
export type { GlideCutReason, GlidePair, GlidePlan, GlideRect, GlideShape } from './glide';
export { MAX_GLIDE_SHAPES, MIN_GLIDE_SHARED, glideRectAt, matchShapes, planGlide } from './glide';
export type { ChainLink, PulseLeg, PulseProblem } from './pulse';
export {
  MAX_PULSE_RELATIONS,
  PULSE_REDUCED_STEP,
  PULSE_REPEAT,
  PULSE_TIME_PER_RELATION,
  chainBreak,
  chainOrder,
  pulseLegs,
  pulseProblems,
  pulseTimes,
} from './pulse';
