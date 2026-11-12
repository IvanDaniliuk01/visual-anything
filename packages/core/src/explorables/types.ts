/**
 * Explorables (ADR 0107): what the core builds and checks for them, pure and without I/O, so that the
 * local program, the app and Claude's tools share one frame builder, one set of message checks, one
 * shape of the data an explorable reads, and one reading of approvals.
 */
import type { ExplorableParameterValue, Id } from '@visual-anything/schema';

/** The version of the `va` API this build serves. */
export const VA_API = 1;

/** The most bytes an explorable's text takes; past it, the file is kept, warned about and never run. */
export const MAX_EXPLORABLE_BYTES = 512 * 1024;
/** The most explorables a package defines. */
export const MAX_EXPLORABLES_PER_PACKAGE = 64;
/** The most bytes one script library's file takes. */
export const MAX_SCRIPT_LIBRARY_BYTES = 16 * 1024 * 1024;
/** The most bytes a project's script libraries take together. */
export const MAX_SCRIPT_LIBRARIES_BYTES = 128 * 1024 * 1024;
/** The most bytes a message between the app and a frame takes, either way. */
export const MAX_FRAME_MESSAGE_BYTES = 1024 * 1024;
/** The most elements `va.data` holds; the rest are counted. */
export const MAX_DATA_ELEMENTS = 500;
/** The most console errors kept from a frame. */
export const MAX_CONSOLE_ERRORS = 50;
/** How often the app pings a frame, and how long a silent frame lives, in milliseconds. */
export const WATCHDOG_PING_MS = 1_000;
export const WATCHDOG_SILENT_MS = 3_000;
/** The widths, in pixels, a still picture is taken at. */
export const STILL_BUCKETS = [256, 512, 1024] as const;
/** The most approvals the preference keeps, newest first. */
export const MAX_EXPLORABLE_APPROVALS = 1_024;

/** Who an explorable's text came from, as the approval dialog says it. */
export type ExplorableAuthor = 'claude' | 'outside';

/**
 * An approval of the person's (ADR 0107): the hash of a frame's inputs, the explorable it was given
 * for, and whether the person approved it or Claude's write continued an approval of theirs.
 */
export interface ExplorableApproval {
  /** {@link explorableApprovalHash} of the text and its script libraries. */
  hash: string;
  explorable: Id;
  by: 'person' | 'claude';
}

/** A script library as the frame builder inlines it. */
export interface FrameScriptLibrary {
  /** The global its file sets. */
  global: string;
  /** The file's text. */
  text: string;
}

/** What one frame document is built from. */
export interface FrameInput {
  /** The explorable's text, as read from its file. */
  text: string;
  /** Its script libraries, in the order its definition lists them. */
  scriptLibraries: readonly FrameScriptLibrary[];
  /** The `va` runtime's script, the app's own. */
  runtime: string;
  /** The app's origin, which `frame-ancestors` names, such as `http://127.0.0.1:47700`. */
  appOrigin: string;
}

/** A frame document and the policy it is served with. */
export interface FrameDocument {
  /** The document, with CR and CRLF made LF and NUL escaped. */
  html: string;
  /** The `Content-Security-Policy` header's value. */
  policy: string;
  /** The `sha256-…` of every inline script the builder put in, in order. */
  scriptHashes: string[];
  /** The `sha256-…` of every inline style. */
  styleHashes: string[];
}

/** One attribute of an element as `va.data` gives it. */
export interface VaAttribute {
  name: string;
  value: unknown;
  /** Set when the value is computed (ADR 0086) or live. */
  source?: 'computed' | 'live' | 'simulated';
  kind?: string;
  unit?: string;
  label?: string;
  min?: number;
  max?: number;
}

/** An element as `va.data` gives it. */
export interface VaElement {
  id: Id;
  name: string;
  component: Id;
  description?: string;
  attributes: VaAttribute[];
}

/** A relation of the element an explorable shows, with the element at its other end. */
export interface VaRelation {
  id: Id;
  type: Id;
  direction: 'out' | 'in';
  other: VaElement;
}

/** What `va.data` holds, in version 1 of the API (ADR 0107). */
export interface VaData {
  api: 1;
  /** The element that shows it, or the one a loose explorable is bound to. */
  element?: VaElement;
  /** What it contains, one level down. */
  contents?: VaElement[];
  relations?: VaRelation[];
  /** How many elements were left out past {@link MAX_DATA_ELEMENTS}. */
  omitted?: number;
  /** The values set: a tour step's, else the defaults. */
  parameters: Record<string, ExplorableParameterValue>;
  theme: 'light' | 'dark';
  language: 'en' | 'es';
  size: { width: number; height: number };
  /** The scenario or tour step under way, if any. */
  step?: { kind: 'scenario' | 'tour'; id: Id; step: Id; title?: string };
}

/** What the app posts to a frame, on its port. */
export type HostMessage =
  | { kind: 'va/hello'; api: 1; data: VaData }
  | { kind: 'va/data'; data: VaData }
  | { kind: 'va/ping'; at: number }
  | { kind: 'va/still'; width: number };

/** What a frame posts to the app, on its port. */
export type FrameMessage =
  | { kind: 'va/ready' }
  | { kind: 'va/pong'; at: number }
  | { kind: 'va/select'; id: Id }
  | { kind: 'va/error'; message: string }
  /** A PNG the frame drew of itself, as bytes, which the app cleans before it keeps it. */
  | { kind: 'va/still'; width: number; png: Uint8Array };
