import type { Command, PreferenceChanges, Preferences } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { createContext, useContext } from 'react';
import type {
  ClaudeSetupAnswerMessage,
  DrawingMadeMessage,
  PackageReadAnswerMessage,
  LiveFetchedMessage,
  LiveKeptMessage,
  SolidFilesListedMessage,
  MediaFilesListedMessage,
  MediaStoredMessage,
  LinkFetchedMessage,
  SolidImportOptions,
  SolidPreparedMessage,
  VersionRef,
  VersionsListedMessage,
  ExplorablesListeningMessage,
  ScriptLibraryAsk,
  ScriptLibraryFilesListedMessage,
  ScriptLibraryKeptMessage,
} from '@visual-anything/core';
import type { GuidanceState, GuidedLayoutAnswer } from '../guidance/state';
import type { LiveValueBook } from '../live-values/book';
import type {
  CommandResult,
  ComparedResult,
  LiveResult,
  LiveState,
  NewProjectChoice,
  NoticeLevel,
  OtherProjectResult,
  SendOptions,
  StartChoice,
  TakeCapture,
  CaptureWaitsFor,
} from './connection';

/** How the local program answered a change of preferences: what it holds now, or why it refused. */
export type PreferencesAnswer =
  | { ok: true; preferences: Preferences }
  | { ok: false; problems: readonly { code?: string; message: string }[] };

/** The live session as components see it: its state, and what they can ask of the local program. */
export interface Live extends LiveState {
  /**
   * Sends a command to the local program, which owns the model. Resolves once it has answered: with
   * what the action created and the rules it broke that only warn, or with the problems that stopped
   * it. The project already shows the change when the promise resolves. With `joins`, the id of the
   * newest action, a layout of the shapes that action added asks to join it (ADR 0065).
   */
  send: (command: Command, options?: SendOptions) => Promise<CommandResult>;
  /** Undoes the newest action, whoever did it. A refusal is also shown as a notice. */
  undo: () => Promise<CommandResult>;
  /** Redoes the newest undone action. A refusal is also shown as a notice. */
  redo: () => Promise<CommandResult>;
  /**
   * Undoes every action after the one with this id, and that one too, one at a time: the history
   * panel's "Undo to here". Absent where there is no live session to ask.
   */
  undoTo?: (action: number) => Promise<CommandResult>;
  /** Redoes every undone action up to the one with this id, and that one: "Redo to here". */
  redoTo?: (action: number) => Promise<CommandResult>;
  /** Shows a notice, such as the problems of a command that was refused. */
  notify: (level: NoticeLevel, message: string) => void;
  /** Stops showing a notice. */
  dismiss: (id: number) => void;
  /** Stops showing Claude's guidance in this tab; absent where there is no live session to clear. */
  clearGuidance?: () => void;
  /**
   * Tells the local program what Claude's layout came to in this tab, by the id it came with, or why
   * this tab ran none (M3d); absent where there is no live session to tell.
   */
  answerLayout?: (answer: string, outcome: GuidedLayoutAnswer) => void;
  /**
   * Lends the live session what takes Claude's pictures with this tab's canvas (ADR 0081); returns
   * what takes it back. Absent where there is no live session to answer. `waitsFor` says what the
   * canvas still waits for before it shows what a picture needs, which a picture waits for (#16).
   */
  lendCapture?: (capture: TakeCapture, waitsFor?: CaptureWaitsFor) => () => void;
  /**
   * Says the tab's guidance layer applied this guidance: the views it named opened and its move
   * happened, which a picture asked for after it waits for (#16).
   */
  guidanceApplied?: (guidance: GuidanceState) => void;
  /** Says what a picture waits for may have changed, as when the canvas drew another scene (#16). */
  captureChanged?: () => void;
  /**
   * Asks the local program to change some of the person's preferences; absent where there is no live
   * session to carry them, as in tests that give components a session of their own.
   */
  setPreferences?: (changes: PreferenceChanges) => Promise<PreferencesAnswer>;
  /**
   * Starts the project the start screen offers, while the local program runs on a folder that holds
   * no project yet (ADR 0051); absent where there is no live session to ask.
   */
  startProject?: (choice: StartChoice) => Promise<CommandResult>;
  /**
   * Opens the project in a folder from the Projects screen, while the program is at home (ADR 0093);
   * absent where there is no live session to ask.
   */
  openProject?: (path: string) => Promise<CommandResult>;
  /** Starts a new project in the projects folder and opens it (ADR 0093). */
  createProject?: (choice: NewProjectChoice) => Promise<CommandResult>;
  /** Takes a project off the recent list (ADR 0093). */
  forgetRecent?: (path: string) => Promise<CommandResult>;
  /**
   * Closes the open project once its writes have landed and takes every tab to the Projects screen:
   * the header menu's "Projects…" (ADR 0093).
   */
  goHome?: () => Promise<CommandResult>;
  /**
   * Asks the local program to open another project in a tab of its own program, as a destination
   * names it (ADR 0056); absent where there is no live session to ask.
   */
  openOtherProject?: (project: string, view?: Id) => Promise<OtherProjectResult>;
  /**
   * The live values the local program keeps for the open project (ADR 0057); absent where there is
   * no live session, and then nothing reads as live.
   */
  liveValues?: LiveValueBook;
  /**
   * Asks the local program to make a drawing of HTML (ADR 0068), which changes nothing; absent where
   * there is no live session to ask.
   */
  makeDrawing?: (
    name: string,
    html: string,
    width: number,
  ) => Promise<LiveResult<DrawingMadeMessage>>;
  /**
   * Asks the local program to read a package file the person chose (ADR 0089), which changes
   * nothing; absent where there is no live session to ask.
   */
  readPackageFile?: (name: string, text: string) => Promise<LiveResult<PackageReadAnswerMessage>>;
  /** Fetches for approved package code granted an origin, through the local program (ADR 0063). */
  fetchForPackage?: (pkg: Id, url: string) => Promise<LiveResult<LiveFetchedMessage>>;
  /** Sends the live values approved package code made of what it fetched. */
  sendLiveValues?: (
    pkg: Id,
    values: unknown[],
    freshFor?: number,
  ) => Promise<LiveResult<LiveKeptMessage>>;
  /**
   * Asks the local program for the versions it can list (ADR 0071); absent where there is no live
   * session to ask.
   */
  listVersions?: () => Promise<LiveResult<VersionsListedMessage>>;
  /**
   * Asks the local program to compare a version it listed, or the project as opened, with the project
   * now (ADR 0070); absent where there is no live session to ask.
   */
  compareVersion?: (version: VersionRef, view?: Id) => Promise<ComparedResult>;
  /**
   * Accepts some of the changes of Claude's proposal, by their keys, or all of them, as the revision
   * shown holds them (ADR 0073); absent where there is no live session to ask.
   */
  acceptProposal?: (
    proposal: Id,
    revision: number,
    changes: readonly string[] | 'all',
  ) => Promise<CommandResult>;
  /** Refuses Claude's proposal whole; absent where there is no live session to ask. */
  refuseProposal?: (proposal: Id) => Promise<CommandResult>;
  /**
   * A solid's file from the local program, by its hash (ADR 0075), which the canvas's solid client
   * hands to the solid worker; absent where no program serves solids.
   */
  getSolidFile?: (hash: string) => Promise<LiveResult<Uint8Array>>;
  /**
   * Sends a file to the local program to be cleaned as a solid (ADR 0075), which changes nothing;
   * absent where no program cleans solids.
   */
  prepareSolid?: (
    fileName: string,
    bytes: Uint8Array,
    options?: SolidImportOptions,
  ) => Promise<LiveResult<SolidPreparedMessage>>;
  /** The files in `solids/` that no package names; absent where no program keeps solids. */
  listSolidFiles?: () => Promise<LiveResult<SolidFilesListedMessage>>;
  /** Removes files in `solids/` that no package names, which cannot be undone. */
  removeSolidFiles?: (hashes: readonly string[]) => Promise<LiveResult<SolidFilesListedMessage>>;
  /** A picture's media file by its hash (ADR 0098); absent where no program keeps media files. */
  getMediaFile?: (hash: string) => Promise<LiveResult<Uint8Array>>;
  /**
   * Sends an image file to the local program to be cleaned and kept in `media/` (ADR 0098), which
   * changes no project file; absent where no program keeps media files.
   */
  putMedia?: (fileName: string, bytes: Uint8Array) => Promise<LiveResult<MediaStoredMessage>>;
  /** The files of `media/` no picture names (ADR 0098). */
  listMediaFiles?: () => Promise<LiveResult<MediaFilesListedMessage>>;
  /** Removes files of `media/` no picture names, which cannot be undone. */
  removeMediaFiles?: (hashes: readonly string[]) => Promise<LiveResult<MediaFilesListedMessage>>;
  /**
   * Asks the local program to fetch a link card's preview (ADR 0098, stage 3), only when the person
   * presses Fetch the preview; absent where no program fetches.
   */
  fetchLinkPreview?: (url: string) => Promise<LiveResult<LinkFetchedMessage>>;
  /**
   * Asks the local program to add itself to Claude Desktop's configuration (ADR 0093); absent where
   * there is no live session to ask.
   */
  setUpClaude?: () => Promise<LiveResult<ClaudeSetupAnswerMessage>>;
  /**
   * Asks the local program for its explorables' listener, its port and the session's nonce (ADR
   * 0107); absent where no program serves explorables.
   */
  listenExplorables?: () => Promise<LiveResult<ExplorablesListeningMessage>>;
  /** Asks the local program to fetch a script library the person chose in the app (ADR 0107). */
  fetchScriptLibrary?: (ask: ScriptLibraryAsk) => Promise<LiveResult<ScriptLibraryKeptMessage>>;
  /** Answers Claude's request for a script library with the person's consent, or without it. */
  answerScriptLibraryConsent?: (requestId: string, approved: boolean) => void;
  /** The files of `script-libraries/` no package names (ADR 0107). */
  listScriptLibraryFiles?: () => Promise<LiveResult<ScriptLibraryFilesListedMessage>>;
  /** Removes files of `script-libraries/` no package names, which cannot be undone. */
  removeScriptLibraryFiles?: (
    hashes: readonly string[],
  ) => Promise<LiveResult<ScriptLibraryFilesListedMessage>>;
}

/**
 * The live session; null outside a `LiveProvider`. Tests can give components a session of their own
 * through it.
 */
export const LiveContext = createContext<Live | null>(null);

/** The live session, for components inside a `LiveProvider`. */
export function useLive(): Live {
  const live = useContext(LiveContext);
  if (live === null) throw new Error('useLive() is only available inside a LiveProvider.');
  return live;
}
