/**
 * Explorables (ADR 0107): the frame builder and its policy, the messages between the app and a
 * frame, `va.data`, approvals, the catalog of what packages define and what shows it, and the
 * project's checks of them. Pure, without I/O: the local program, the app and Claude's tools share
 * them.
 */
export * from './types';
export {
  buildFrame,
  cspHash,
  CSP_HASH,
  explorablePage,
  FRAME_STYLE_SOURCE,
  framePolicy,
  FrameRefusal,
  NEUTRAL_HTTP_EQUIV,
  scriptBody,
  utf8Length,
  type ExplorablePage,
} from './frame';
export * from './messages';
export * from './data';
export * from './approvals';
export * from './catalog';
export * from './check';
export * from './protocol-messages';
export * from './stills';
export * from './capture-messages';
