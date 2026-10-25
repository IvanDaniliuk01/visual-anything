/**
 * Live values (ADR 0057, ADR 0063): what one is and its checks, where the local program keeps them,
 * how fast one sender's are taken, the live protocol's messages for them, and how an attribute reads
 * once live and computed values are over the stored one.
 */
export type { GateOutcome } from './gate';
export { LiveGate } from './gate';
export type {
  LiveFetchMessage,
  LiveFetchedMessage,
  LiveKeptMessage,
  LiveSetMessage,
  LiveValuesMessage,
} from './messages';
export {
  FRESHNESS,
  LIVE_FETCH_LIMITS,
  LiveProtocolProblem,
  checkFetchAddress,
  readLiveFetchMessage,
  readLiveFetchedMessage,
  readLiveKeptMessage,
  readLiveSetMessage,
  readLiveValuesMessage,
} from './messages';
export type {
  AttributeOrigin,
  AttributeReading,
  AttributeSources,
  ComputedReading,
  LiveAge,
} from './reading';
export { liveAge, readAttribute } from './reading';
export type { LiveFilter, LiveKey, LiveSetOutcome } from './store';
export { LiveValueStore } from './store';
export type { CheckedValues, LiveSender, LiveValue, LiveValueInput, RefusedValue } from './values';
export {
  LIVE_LIMITS,
  checkLiveValue,
  checkLiveValues,
  isLiveAttributeName,
  isTime,
  liveKey,
  readFreshFor,
  readLiveSender,
  sameSender,
} from './values';
