/**
 * Scenarios as they play: the timeline over a view with its collapsed containers, playback, and the
 * rules for recording and editing steps. All pure; playing never changes a file.
 */
export type { ViewContainment } from './containment';
export { collapsedIn, containmentInView, endsOf } from './containment';

export type {
  BrokenStep,
  Timeline,
  TimelineAggregate,
  TimelineEntry,
  TimelineStep,
} from './timeline';
export { brokenStepsOf, entryOfStep, isBroken, isOutside, scenarioTimeline } from './timeline';

export type { Playback, PlaybackMode, Speed } from './playback';
export {
  PLAYBACK_START,
  SPEEDS,
  STEP_TIME,
  TRAVEL_TIME,
  advance,
  currentEntry,
  goTo,
  isFinished,
  markerProgress,
  next,
  pause,
  play,
  previous,
} from './playback';

export type { RecordClick, Recorded } from './recording';
export {
  deleteStep,
  describeStep,
  moveStep,
  recordRelation,
  repairStep,
  setStepData,
  takeOutOfStep,
} from './recording';
