/**
 * Tours (ADR 0058): steps that each take the canvas to a view state with a caption, played full screen.
 * All pure; playing a tour never changes a file.
 */
export type { PlayableStep, SavedViewStateCheck, TourStepProblem } from './steps';
export {
  MAX_CAPTION_TEXT,
  MAX_CAPTION_TITLE,
  MAX_SPEAKER_NOTES,
  MAX_TOUR_DESCRIPTION,
  MAX_TOUR_MARKS,
  MAX_TOUR_NAME,
  MAX_TOUR_STEPS,
  checkSavedViewState,
  idsNamedByTours,
  isBrokenTourStep,
  playableStep,
  savedViewStateOf,
  tourStepProblems,
  viewStateOfStep,
} from './steps';
export type { ScreenSize, TourMove } from './camera';
export {
  MAX_TOUR_MOVE_TIME,
  MAX_TOUR_TRAVEL,
  TOUR_MOVE_TIME,
  TOUR_MOVE_TIME_PER_WIDTH,
  easeInOut,
  tourMove,
  tourTravel,
} from './camera';
