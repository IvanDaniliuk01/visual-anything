/**
 * The live connection between the local program and the app: a WebSocket that carries the open project
 * and every change to it. Only a page holding the session token, or a launch code that works once, can
 * open it. The app sends commands; the local program, which owns the model, applies them and sends the
 * resulting operations to every open app. It also sends Claude's guidance, which marks and moves the
 * open view without changing the model.
 */
import type {
  DecisionChoices,
  Id,
  SavedSimulation,
  SolidCamera,
  SpaceCamera,
} from '@visual-anything/schema';
import type { Command } from './commands';
import {
  readDrawingMade,
  readDrawingMake,
  type DrawingMadeMessage,
  type DrawingMakeMessage,
  type DrawingMessageRead,
} from './import/drawing-messages';
import type { Author, HistorySummary } from './history';
import { isId } from './ids';
import {
  LiveProtocolProblem,
  readLiveFetchMessage,
  readLiveFetchedMessage,
  readLiveKeptMessage,
  readLiveSetMessage,
  readLiveValuesMessage,
  type LiveFetchMessage,
  type LiveFetchedMessage,
  type LiveKeptMessage,
  type LiveSetMessage,
  type LiveValuesMessage,
} from './live/messages';
import type { Operation } from './operations';
import type { PreferenceChanges, Preferences } from './preferences';
import type { Problem } from './problems';
import { SIMULATION_LIMITS, type SimulationSpeed } from './simulation/limits';
import { readSavedSimulation } from './simulation/saved';
import type { ProjectSnapshot } from './snapshot';
import { checkTimeRange, type ViewTimeRange } from './time-range';
import {
  isRevision,
  readListedVersions,
  readProposalAccept,
  readProposalRefuse,
  readVersionCompare,
  readVersionRef,
  type ProposalAcceptMessage,
  type ProposalClosedMessage,
  type ProposalRefuseMessage,
  type ProposalShownMessage,
  type VersionCompareMessage,
  type VersionComparedMessage,
  type VersionMessageRead,
  type VersionRef,
  type VersionRefusedMessage,
  type VersionsListMessage,
  type VersionsListedMessage,
} from './versions/messages';
import { readLayoutDone, type LayoutDoneMessage } from './layout-answer';
import {
  readCaptureAnswer,
  readCaptureRequest,
  type CaptureAnswerMessage,
  type CaptureRequestMessage,
} from './capture';
import {
  readSolidFilesList,
  readSolidFilesListed,
  readSolidFilesRemove,
  readSolidGet,
  readSolidPieceMessage,
  readSolidPrepare,
  readSolidPrepared,
  readSolidRefused,
  type SolidFilesListMessage,
  type SolidFilesListedMessage,
  type SolidFilesRemoveMessage,
  type SolidGetMessage,
  type SolidPieceMessage,
  type SolidPrepareMessage,
  type SolidPreparedMessage,
  type SolidRefusedMessage,
} from './solids/messages';
import {
  readMediaFilesList,
  readMediaFilesListed,
  readMediaFilesRemove,
  readMediaGet,
  readMediaPieceMessage,
  readMediaPut,
  readMediaRefused,
  readMediaStored,
  type MediaFilesListMessage,
  type MediaFilesListedMessage,
  type MediaFilesRemoveMessage,
  type MediaGetMessage,
  type MediaPieceMessage,
  type MediaPutMessage,
  type MediaRefusedMessage,
  type MediaStoredMessage,
} from './media/messages';
import {
  readLinkFetch,
  readLinkFetched,
  readLinkRefused,
  type LinkFetchMessage,
  type LinkFetchedMessage,
  type LinkRefusedMessage,
} from './links/messages';
import {
  readPackageRead,
  readPackageReadAnswer,
  type PackageMessageRead,
  type PackageReadAnswerMessage,
  type PackageReadMessage,
} from './package-file-messages';
import {
  readClaudeSetup,
  readClaudeSetupAnswer,
  type ClaudeSetupAnswerMessage,
  type ClaudeSetupMessage,
  type ClaudeSetupRead,
} from './claude-setup-messages';
import { readSolidCamera } from './solids/camera';
// Explorables (ADR 0107), protocol version 13.
import {
  readExplorablesListen,
  readExplorablesListening,
  readScriptLibraryConsent,
  readScriptLibraryConsented,
  readScriptLibraryFetch,
  readScriptLibraryKept,
  readScriptLibraryRefused,
  readScriptLibraryFilesList,
  readScriptLibraryFilesListed,
  readScriptLibraryFilesRemove,
  type ExplorablesListenMessage,
  type ExplorablesListeningMessage,
  type ScriptLibraryConsentMessage,
  type ScriptLibraryConsentedMessage,
  type ScriptLibraryFetchMessage,
  type ScriptLibraryKeptMessage,
  type ScriptLibraryRefusedMessage,
  type ScriptLibraryFilesListMessage,
  type ScriptLibraryFilesListedMessage,
  type ScriptLibraryFilesRemoveMessage,
} from './explorables/protocol-messages';
import { readSpaceCamera } from './space/camera';
// A type only: view-state.ts imports this module, and the app checks the view state it is shown.
import type { ViewState } from './view-state';

/**
 * The version of the live protocol; the app and the local program must agree on it, so that one from
 * an older build says so on its first message instead of failing later on what it cannot read.
 *
 * 2: operations can change a view's stacking order.
 * 3: guidance; and a page opens the connection with a launch code that works once, for which
 * `project/opened` hands it the session token.
 * 4: guidance that filters and focuses the open view, and plays a scenario in it.
 * 5: the history listed action by action, with each one's author and time, and undo or redo up to
 * one of them.
 * 6: following a destination to another project, which that project's own program opens (ADR 0056);
 *    and live values (ADR 0057, ADR 0063): the program sends the live values it keeps, and an app
 *    fetches for approved package code granted an origin, and sends the live values it made. Guidance
 *    that lays out a view, or plays a tour full screen, came in 6 too, since no build shipped.
 * 7: free geometry, named parts and automatic route styles in the project's files (M8b, ADR 0066,
 *    ADR 0067, ADR 0069), which an app of version 6 would draw without; and making a drawing of
 *    HTML (ADR 0068), `drawing/make` and its answer `drawing/made`, in 7 too, since no build of 7
 *    shipped. Playback guidance that chooses an alternative at a decision, and that opens, plays or
 *    goes to a step with choices (ADR 0078), came in 7 as well, for the same reason. So did versions
 *    and proposals (M11b, ADR 0071, ADR 0073): `versions/list` and `version/compare` with their
 *    answers, the proposal shown, accepted, refused and closed, and the guidance `comparison`. And
 *    layout guidance with an `answer`, which the app answers with `layout/done` (M3d). And a
 *    picture of a view for Claude (ADR 0081), `capture/request` and its answer `capture/answer`.
 *    And a view's `rows` and `selectionFadesLines` (ADR 0080, section 5), which an older app of 7
 *    would refuse when it opens the view file. And solids (M9, ADR 0075): `solid/prepare` and
 *    `solid/get` from an app, answered with `solid/prepared`, `solid/piece` or `solid/refused`;
 *    `solid-files/list` and `solid-files/remove`, for the files in `solids/` that no package
 *    names, answered with `solid-files/listed` or `solid/refused`; and the guidance `turn`, which
 *    turns a shape's solid to a camera. And the guidance `space` (M10, ADR 0076), which opens,
 *    roots, moves and closes the physical-space panel.
 *    And simulations (M12, ADR 0085), in 7 too, since no build of 7 shipped: a package's components
 *    may declare `simulation`, view states may carry one, and the guidance `simulation` opens an
 *    element's simulation at a tick with parameters and a seed, plays or pauses it, or closes it.
 *    And drawing defaults (A5, ADR 0086), in 7 too: `drawing` in the project file and view files,
 *    which an older app of 7 would refuse when it opens them.
 *    And reading a package file the person chose (M14.2, ADR 0089), `package/read` and its answer
 *    `package/read-answer`, in 7 too, since no build of 7 shipped.
 * 8: connecting Claude Desktop from the app (ADR 0093, section 3), `claude/setup` and its answer
 *    `claude/setup-answer`.
 *    And home (R0, ADR 0093), in 8 too: the program may run with no project open, and greets each app with
 *    `home/offered`, what the Projects screen offers; an app answers with `home/open`, `home/create`
 *    or `home/forget`, and goes back home from a project with `home/close`. Claude, attached to the
 *    project that closed, is told with `project/closed`.
 * 9: a caption card dragged to a place of its own (ADR 0095): a tour step's `caption.place` may be
 *    `{ x, y }`, which an app of 8 would refuse when it opens the tour file. And, in 9 too, since no
 *    build of 9 shipped, a tour's `captionFace` and a caption's `face` and `size` (ADR 0096), and
 *    its `leader` (ADR 0097).
 * 10: pictures (ADR 0098): a view's free shapes may be pictures, `{ kind: 'picture', … }`, which an
 *    app of 9 would refuse when it opens the view file; and their media files travel as `media/put`
 *    and `media/get` from an app, answered with `media/stored`, `media/piece` or `media/refused`, and
 *    `media-files/list` and `media-files/remove`, for the files of `media/` no picture names,
 *    answered with `media-files/listed` or `media/refused`. And, in 10 too, since no build of 10
 *    shipped, a tab comes forward when Claude, or the command line, asks to open the app while one is
 *    connected (ADR 0099): `app/shown`, with the view state to show, if any, which only the tab the
 *    person used last applies. And, in 10 too, a tour's and a tour step's `emphasis` (ADR 0100),
 *    `halo` or `style`, which an app of 9 would refuse when it opens the tour file.
 * 11: a tour step can show a view beside it (ADR 0102): `beside`, a view state for the pane right of
 *    the tour's, which an app of 10 would refuse when it opens the tour file. And, in 11 too, since no
 *    build of 11 shipped, a component's `openAttributes` (ADR 0105), which an app of 10 would refuse
 *    when it opens the package file.
 * 12: videos (ADR 0098, stage 2): a picture's media file may be a video, `mp4` or `webm` of up to
 *    50 MiB, in 50 pieces, with a `poster`, which an app of 11 would refuse when it opens the view file
 *    or reads `media/stored`.
 * 13: explorables (ADR 0107): a package's `explorables` and `scriptLibraries`, an appearance's
 *    `explorable`, the free shape `{ kind: 'explorable', … }` and a tour step's `explorable`, which an
 *    app of 12 would refuse when it opens the files; the project's `explorableTexts`; and the
 *    messages of `explorables/protocol-messages.ts`: `explorables/listen` and `explorables/listening`,
 *    `script-library/fetch`, `script-library/consent` and `script-library/consented`, and
 *    `script-library/kept` or `script-library/refused`.
 * 14: link cards (ADR 0098, stage 3): a view's free shapes may be link cards, `{ kind: 'link', … }`,
 *    which an app of 13 would refuse when it opens the view file; and an app asks for a card's
 *    preview with `link/fetch`, answered with `link/fetched` or `link/refused`.
 * 15: the files of `script-libraries/` that no package names (ADR 0107, A10.2):
 *    `script-library-files/list` and `script-library-files/remove` from an app, answered with
 *    `script-library-files/listed` or `script-library/refused`, as solid and media files are.
 */
export const PROTOCOL_VERSION = 15;

/** The path of the live connection. */
export const LIVE_PATH = '/live';

/**
 * The name the session token travels under in the query of the live connection. The local program
 * never puts the token in an address it prints or opens: a page gets it in `project/opened`, after
 * redeeming a launch code, and keeps it for reloads and reconnections.
 */
export const TOKEN_PARAM = 'token';

/**
 * The name the theme a person chose travels under, `light` or `dark`, in the fragment of the URL the
 * local program opens, so that the tab draws its first frame in it. It is left out when the person
 * matches the system.
 */
export const THEME_PARAM = 'theme';

/**
 * The name a launch code travels under: in the fragment of the address the local program opens or
 * prints, `/#launch=<code>`, and in the query of the live connection the page then opens. A launch
 * code works once, within two minutes.
 */
export const LAUNCH_PARAM = 'launch';

/**
 * Where a tab asks the local program to prove that it holds the tab's session token before the tab
 * sends it (ADR 0099): `GET /session/proof?challenge=<challenge>`, answered with
 * `{ "proof": <HMAC-SHA256 of SESSION_PROOF_CONTEXT and the challenge, keyed by the token, in
 * base64url> }`. A tab that reconnects by itself sends its token only to a program that proves it.
 */
export const SESSION_PROOF_PATH = '/session/proof';

/** The name the challenge travels under in the query of {@link SESSION_PROOF_PATH}. */
export const SESSION_CHALLENGE_PARAM = 'challenge';

/** What the proof's HMAC covers before the challenge, so that it proves nothing else. */
export const SESSION_PROOF_CONTEXT = 'visual-anything session proof\n';

/** A challenge as a tab makes it: 16 to 64 random bytes, in hex. */
export const SESSION_CHALLENGE_FORM = /^[0-9a-f]{32,128}$/;

/** A message the local program sends to the app. */
export type ServerMessage =
  | ProjectOpenedMessage
  | ProjectChangedMessage
  | CommandRejectedMessage
  | ProjectReloadedMessage
  | NoticeMessage
  | PreferencesChangedMessage
  | GuidanceMessage
  | HistoryListedMessage
  | StartOfferedMessage
  | HomeOfferedMessage
  | ProjectClosedMessage
  | OtherProjectOpenedMessage
  | LiveValuesMessage
  | LiveKeptMessage
  | LiveFetchedMessage
  | DrawingMadeMessage
  | VersionsListedMessage
  | VersionComparedMessage
  | VersionRefusedMessage
  | ProposalShownMessage
  | ProposalClosedMessage
  | CaptureRequestMessage
  | SolidPreparedMessage
  | SolidPieceMessage
  | SolidRefusedMessage
  | SolidFilesListedMessage
  | MediaStoredMessage
  | MediaPieceMessage
  | MediaRefusedMessage
  | MediaFilesListedMessage
  | LinkFetchedMessage
  | LinkRefusedMessage
  | PackageReadAnswerMessage
  | ClaudeSetupAnswerMessage
  | AppShownMessage
  // Explorables (ADR 0107).
  | ExplorablesListeningMessage
  | ScriptLibraryConsentMessage
  | ScriptLibraryKeptMessage
  | ScriptLibraryRefusedMessage
  | ScriptLibraryFilesListedMessage;

/**
 * Sent to every app when Claude, or the command line, asks to open the app while a tab is connected
 * (ADR 0099): no new tab opens. The tab the person used last comes forward as far as the browser lets
 * it, says that it was asked to, and applies the view state, if one is given, as an address brought to
 * the tab applies; the other tabs pass it over.
 */
export interface AppShownMessage {
  type: 'app/shown';
  state?: ViewState;
}

/**
 * Sent in place of `project/opened` while the local program runs on a folder that holds no project yet
 * (ADR 0051): the sample projects a new project there can start from. The app shows its start screen
 * and answers with `start/create`; once the project is written, every app gets `project/opened`.
 */
export interface StartOfferedMessage {
  type: 'start/offered';
  protocolVersion: typeof PROTOCOL_VERSION;
  /** The name of the folder the project goes in. */
  folder: string;
  samples: OfferedSample[];
  /** The session token, as `project/opened` hands it to a page that opened with a launch code. */
  token?: string;
}

/** A sample project a new project can start from, as the start screen offers it. */
export interface OfferedSample {
  id: Id;
  /** Its name, as its project file gives it. */
  name: string;
  /** The packages it uses. */
  packages: Id[];
}

/**
 * Sent in place of `project/opened` while the local program is at home, with no project open (ADR
 * 0093): what the Projects screen offers. It is sent again to every app at home whenever what it
 * offers changes, and to every app once a project closes.
 */
export interface HomeOfferedMessage {
  type: 'home/offered';
  protocolVersion: typeof PROTOCOL_VERSION;
  /** The projects folder, as an absolute path: where new projects are written. */
  folder: string;
  /** The projects in the projects folder, by name. */
  projects: HomeProject[];
  /** The projects opened last, the latest first. */
  recent: RecentProject[];
  /** The samples a new project can start from. */
  samples: OfferedSample[];
  /** The session token, as `project/opened` hands it to a page that opened with a launch code. */
  token?: string;
  /** The request this answers, `home/close` or `home/forget`; only the app that sent it gets it. */
  requestId?: string;
}

/**
 * Sent to Claude, attached through its own endpoint, when the open project closes and the program goes
 * home (ADR 0093): no project is open until the person opens one, and then Claude gets
 * `project/opened` with it. Apps get `home/offered` instead.
 */
export interface ProjectClosedMessage {
  type: 'project/closed';
  /** What to tell Claude, in English. */
  message: string;
}

/** A project the Projects screen offers to open. */
export interface HomeProject {
  /** Its folder, as an absolute path. */
  path: string;
  /** Its name, as its project file gives it. */
  name: string;
  /** Its world: the first built-in package it uses besides Systems; absent when it uses none. */
  world?: Id;
  /** When its files last changed, in milliseconds since 1970. */
  changed: number;
}

/** A project opened lately; one whose folder is gone, or holds no project now, is missing. */
export interface RecentProject {
  path: string;
  /** Absent for a missing project. */
  name?: string;
  world?: Id;
  changed?: number;
  missing: boolean;
}

/** The longest path a home message carries. */
export const MAX_HOME_PATH = 4096;

/** The most projects `home/offered` lists. */
export const MAX_HOME_PROJECTS = 500;

/** Sent when the live connection opens: the project as it is now. */
export interface ProjectOpenedMessage {
  type: 'project/opened';
  protocolVersion: typeof PROTOCOL_VERSION;
  project: ProjectSnapshot;
  history: HistorySummary;
  /**
   * The session token, sent only to a page that opened the connection with a launch code: the code
   * is spent, and the page reconnects with the token from then on.
   */
  token?: string;
}

/** Sent to every open app after an action, an undo or a redo. */
export interface ProjectChangedMessage {
  type: 'project/changed';
  /** The operations to apply to the project, in order. */
  operations: Operation[];
  /** Whether a new action was done, or one was undone or redone. */
  kind: 'do' | 'undo' | 'redo';
  /** The action, as the history names it, and who did it. */
  label: string;
  author: Author;
  history: HistorySummary;
  /** The request this answers; only the app that sent it gets it. */
  requestId?: string;
  /** Rules that only warn, broken by the result. */
  warnings: Problem[];
  /** The ids of what the action created. */
  created: Id[];
  /**
   * Present when the change joined the newest action, the one the history lists with this id, as the
   * placement of what it added (ADR 0065), instead of being an action of its own: `label` and
   * `author` are that action's.
   */
  joins?: number;
}

/** Sent to the app whose command or undo was refused, and why. Nothing changed. */
export interface CommandRejectedMessage {
  type: 'command/rejected';
  requestId: string;
  problems: Problem[];
}

/** Sent when the project's files changed outside the app, such as after a git pull. */
export interface ProjectReloadedMessage {
  type: 'project/reloaded';
  project: ProjectSnapshot;
  history: HistorySummary;
  /** What happened, in words. */
  reason: string;
}

/** Something to tell the user that changes nothing, such as a file on disk that is not valid. */
export interface NoticeMessage {
  type: 'notice';
  level: 'info' | 'warning' | 'error';
  message: string;
}

/**
 * Sent to every open app when it connects and after every change of preferences, which are each
 * person's own and never part of the project (ADR-0032). The app that asked for the change gets its
 * request id.
 */
export interface PreferencesChangedMessage {
  type: 'preferences/changed';
  preferences: Preferences;
  requestId?: string;
}

/**
 * Claude's live guidance on the open view: marks and moves that never change the model, a view's
 * positions or the history. Targets are the ids of elements, relations or free shapes; an element is
 * marked in every shape it has in the view. With `view`, the app first opens that view.
 */
export type Guidance =
  /** Marks the targets, and takes away the marks Claude made before. */
  | { kind: 'highlight'; targets: Id[]; view?: Id }
  /**
   * Marks the targets and dims everything not connected to them, taking away the marks Claude made
   * before, and moves the canvas to the first target.
   */
  | { kind: 'focus'; targets: Id[]; view?: Id }
  /** Moves the canvas so that the target shows. */
  | { kind: 'pan-to'; target: Id; view?: Id }
  /** Shows a short text over the canvas, as plain text; an empty one takes the caption away. */
  | { kind: 'caption'; text: string }
  /** Takes away every mark and the caption Claude made. */
  | { kind: 'clear' }
  /**
   * Sets the filters of the open view, replacing the ones it has, as if the person had set them
   * (ADR-0025): the app shows them as the person's, and the person can end them. Nothing is written
   * to the view.
   */
  | { kind: 'filter'; filters: GuidedFilters; view?: Id }
  /**
   * Turns focus mode on in the open view, as if the person had, starting from the targets, which
   * are elements and relations, and reaching some degrees in a direction. It follows the person's
   * selection from then on, as focus does.
   */
  | ({ kind: 'focus-view'; targets: Id[]; view?: Id } & GuidedFocus)
  /** Ends the filters and the focus of the open view, whoever set them. */
  | { kind: 'clear-explore'; view?: Id }
  /**
   * Opens a scenario in the app's scenario panel, and its view, and plays, pauses or steps it there,
   * or chooses an alternative at one of its decisions, as the person would; playing and choosing
   * change nothing (ADR 0078).
   */
  | {
      kind: 'playback';
      scenario: Id;
      action: PlaybackAction;
      /** For `go-to-step` only: the index of a step among the scenario's steps, from 0. */
      step?: number;
      /**
       * For `open`, `play` and `go-to-step` only: the alternatives to play at the scenario's
       * decisions, which replace the tab's choices; a decision not named plays its default, so an
       * empty map plays every default. Left out, the tab's choices stay.
       */
      choices?: DecisionChoices;
      /** For `choose` only: the decision, by id. */
      decision?: Id;
      /** For `choose` only: the alternative of that decision to play, by id. */
      alternative?: Id;
    }
  /**
   * Lays out the open view as the toolbar's Layout does, in the app's layout worker: every shape that
   * is not pinned, or, with `containers`, every shape inside each of them that is not pinned. The
   * guidance itself changes nothing: the app records the layout it runs as it records any layout
   * (ADR-0015, ADR-0029).
   */
  | { kind: 'layout'; view?: Id; containers?: Id[] }
  /**
   * Plays a tour full screen in the open app, as the tours panel's Play does (ADR 0058), from the
   * step at `step`, an index among the tour's steps from 0, or from its first. The person moves
   * through it and ends it with Escape, as always; playing it changes nothing.
   */
  | { kind: 'tour'; tour: Id; step?: number }
  /**
   * Compares a version with the project now, as if the person had chosen it in Compare with… (ADR
   * 0070): the app asks the program for it, then draws the open view, or `view`, as `show` says,
   * the comparison by default. The version is named only as the program listed it (ADR 0071).
   */
  | {
      kind: 'comparison';
      version: VersionRef;
      view?: Id;
      show?: (typeof COMPARISON_DRAWINGS)[number];
    }
  /**
   * Turns the solid a shape shows to a camera, as Turn does (ADR 0075): the app selects the target's
   * shape in the open view, or in `view`, and draws its solid live from that camera, turning on from
   * there as the person drags, until the person ends it with Escape or by selecting something else.
   * Turning records nothing; only Use this view stores a camera.
   */
  | { kind: 'turn'; target: Id; camera: SolidCamera; view?: Id }
  /**
   * Opens the physical-space panel beside the canvas (ADR 0076), in the open view or in `view`, or
   * keeps it open, as the person's Physical space does: on `root`, the element it shows (World by
   * its id), or on what it shows already, or chooses as opening does; then moves its camera to
   * `camera`, in that element's coordinates, or frames the elements of `frame`, never both. With
   * `close`, it closes the panel, and carries nothing else. Nothing is recorded: the person moves,
   * roots and closes the panel at will.
   */
  | {
      kind: 'space';
      root?: Id;
      camera?: SpaceCamera;
      frame?: Id[];
      view?: Id;
      close?: true;
    }
  /**
   * Opens an element's simulation in the inspector (ADR 0085), in the open view or in `view`, with
   * the parameters chosen, the seed and the tick, as a view state's simulation does, then plays it
   * at `speed` or pauses it. With `close`, it closes the simulation shown, and carries nothing else.
   * Nothing is recorded: the person changes the parameters, plays, pauses and closes it at will.
   */
  | ({
      kind: 'simulation';
      view?: Id;
      play?: boolean;
      speed?: SimulationSpeed;
    } & SavedSimulation)
  | { kind: 'simulation'; close: true };

/** Why the camera of guidance for the physical-space panel cannot be read. */
const SPACE_GUIDANCE_CAMERA =
  'The camera of the physical-space panel is a target, a point in meters, with an azimuth, an elevation and a distance.';

/** Why turning guidance's camera cannot be read. */
const TURN_CAMERA =
  'Turning gives a camera: an azimuth from -180 to 180, an elevation from -89 to 89, and if it likes a zoom from 0.25 to 16, a target and a projection.';

/** How a comparison is drawn: the older version, the newer one, or the two with what changed. */
export const COMPARISON_DRAWINGS = ['before', 'after', 'comparison'] as const;

/** What filters hide in a view, as the app's explorer holds them (ADR-0025), in lists. */
export interface GuidedFilters {
  /** The components whose elements are hidden: exactly the component each one is created from. */
  components: Id[];
  /** The relation types whose relations are hidden. */
  relationTypes: Id[];
  /** Conditions every element, or every relation, must meet to stay shown. */
  conditions: GuidedCondition[];
  /**
   * The time range what stays shown must meet; absent, none (ADR 0057). It is checked as a view
   * state's is, so Claude's `filter_view` sets one as a view address carries it.
   */
  range?: ViewTimeRange;
}

/** How a filter tests an attribute's value, as the app's filters do. */
export const FILTER_TESTS = ['is', 'is-not', 'contains', 'below', 'above', 'set', 'unset'] as const;

/** A condition on an attribute that elements, or relations, must meet to stay shown. */
export interface GuidedCondition {
  of: 'elements' | 'relations';
  attribute: string;
  test: (typeof FILTER_TESTS)[number];
  /** What the value is compared with; empty for `set` and `unset`, which do not use it. */
  value: string;
}

/** How far focus reaches, and what it does with the rest, as the app's focus mode does. */
export interface GuidedFocus {
  /** How many relations away it reaches, from 1 to {@link MAX_FOCUS_DEGREES}, or every degree. */
  degrees: number | 'all';
  direction: (typeof FOCUS_DIRECTIONS)[number];
  /** Hides what it does not reach, instead of dimming it. */
  isolate: boolean;
}

/** Which way focus follows relations: both ways, along them, or back. */
export const FOCUS_DIRECTIONS = ['both', 'outgoing', 'incoming'] as const;

/** The most degrees focus reaches short of every degree, as the app's focus mode offers. */
export const MAX_FOCUS_DEGREES = 5;

/** What Claude can ask of a scenario's playback in the open app. */
export const PLAYBACK_ACTIONS = [
  'open',
  'play',
  'pause',
  'go-to-step',
  'next-step',
  'previous-step',
  'choose',
] as const;
export type PlaybackAction = (typeof PLAYBACK_ACTIONS)[number];

/** The playback actions that may carry choices: those that open, play or go to a step. */
const ACTIONS_WITH_CHOICES: readonly PlaybackAction[] = ['open', 'play', 'go-to-step'];

/** The most choices one playback guidance carries: as many as a scenario has decisions. */
export const MAX_GUIDED_CHOICES = 64;

/** The longest caption, in UTF-16 code units. */
export const MAX_CAPTION_LENGTH = 280;

/** The most targets one guidance names. */
export const MAX_GUIDANCE_TARGETS = 500;

/** The most conditions one guidance's filters hold. */
export const MAX_FILTER_CONDITIONS = 32;

/** The longest attribute name, or value, in a condition of guidance's filters. */
export const MAX_FILTER_TEXT = 200;

/**
 * Sent to every open app when Claude guides; nothing else changes. Layout guidance from
 * `lay_out_view` carries `answer`, the id each app answers by with `layout/done` once it has laid the
 * view out or passed it over, so that the program waits for it (M3d, ADR 0029's clarification of
 * 2026-10-30).
 */
export interface GuidanceMessage {
  type: 'guidance';
  guidance: Guidance;
  answer?: string;
}

/**
 * Reads guidance strictly, keeping only what its kind holds. Throws a {@link ProtocolError} for
 * anything else, so that neither side ever acts on guidance it does not understand.
 */
export function readGuidance(value: unknown): Guidance {
  if (!isRecord(value)) throw new ProtocolError('Guidance is an object.');
  const view = (): { view?: Id } => {
    if (value.view === undefined) return {};
    if (!isId(value.view)) throw new ProtocolError('The view of guidance must be an id.');
    return { view: value.view };
  };
  const targets = (): Id[] => {
    const list = value.targets;
    if (!Array.isArray(list) || list.length === 0) {
      throw new ProtocolError('Guidance needs a list of one or more targets.');
    }
    if (list.length > MAX_GUIDANCE_TARGETS) {
      throw new ProtocolError(`Guidance names at most ${MAX_GUIDANCE_TARGETS} targets.`);
    }
    if (!list.every(isId)) throw new ProtocolError('Every target of guidance must be an id.');
    return [...list];
  };
  switch (value.kind) {
    case 'highlight':
    case 'focus':
      return { kind: value.kind, targets: targets(), ...view() };
    case 'pan-to':
      if (!isId(value.target)) throw new ProtocolError('Pan to needs a target id.');
      return { kind: 'pan-to', target: value.target, ...view() };
    case 'caption':
      if (typeof value.text !== 'string') throw new ProtocolError('A caption needs its text.');
      if (value.text.length > MAX_CAPTION_LENGTH) {
        throw new ProtocolError(`A caption holds at most ${MAX_CAPTION_LENGTH} characters.`);
      }
      return { kind: 'caption', text: value.text };
    case 'clear':
      return { kind: 'clear' };
    case 'filter':
      return { kind: 'filter', filters: readFilters(value.filters), ...view() };
    case 'focus-view':
      return { kind: 'focus-view', targets: targets(), ...readFocus(value), ...view() };
    case 'clear-explore':
      return { kind: 'clear-explore', ...view() };
    case 'playback':
      return readPlayback(value);
    case 'layout': {
      if (value.containers === undefined) return { kind: 'layout', ...view() };
      const containers = value.containers;
      if (
        !Array.isArray(containers) ||
        containers.length === 0 ||
        containers.length > MAX_GUIDANCE_TARGETS ||
        !containers.every(isId)
      ) {
        throw new ProtocolError(
          `A layout names one to ${MAX_GUIDANCE_TARGETS} containers, by id, or none for the whole view.`,
        );
      }
      return { kind: 'layout', ...view(), containers: [...containers] };
    }
    case 'tour': {
      if (!isId(value.tour)) throw new ProtocolError('Playing a tour names the tour by id.');
      const { step } = value;
      if (step === undefined) return { kind: 'tour', tour: value.tour };
      if (!Number.isSafeInteger(step) || (step as number) < 0) {
        throw new ProtocolError('A tour plays from the index of one of its steps, from 0.');
      }
      return { kind: 'tour', tour: value.tour, step: step as number };
    }
    case 'comparison': {
      const version = readVersionRef(value.version);
      if (!version.ok) throw new ProtocolError(version.reason);
      const { show } = value;
      if (show !== undefined && !COMPARISON_DRAWINGS.some((each) => each === show)) {
        throw new ProtocolError(`A comparison shows one of: ${COMPARISON_DRAWINGS.join(', ')}.`);
      }
      return {
        kind: 'comparison',
        version: version.message,
        ...view(),
        ...(show === undefined ? {} : { show: show as (typeof COMPARISON_DRAWINGS)[number] }),
      };
    }
    case 'turn': {
      if (!isId(value.target)) throw new ProtocolError('Turning names the shape to turn by id.');
      const camera = readSolidCamera(value.camera, 'the shape to turn', () => {
        throw new ProtocolError(TURN_CAMERA);
      });
      return { kind: 'turn', target: value.target, camera, ...view() };
    }
    case 'space': {
      if (value.close !== undefined) {
        if (value.close !== true) {
          throw new ProtocolError('Guidance closes the physical-space panel with close: true.');
        }
        const more = ['root', 'camera', 'frame', 'view'].filter((key) => value[key] !== undefined);
        if (more.length > 0) {
          throw new ProtocolError(
            'Guidance that closes the physical-space panel carries nothing else.',
          );
        }
        return { kind: 'space', close: true };
      }
      const { root, frame } = value;
      if (root !== undefined && !isId(root)) {
        throw new ProtocolError('The physical-space panel shows an element named by its id.');
      }
      let camera: SpaceCamera | undefined;
      if (value.camera !== undefined) {
        const read = readSpaceCamera(value.camera, SPACE_GUIDANCE_CAMERA);
        if (!read.ok) throw new ProtocolError(read.message);
        camera = read.camera;
      }
      if (
        frame !== undefined &&
        (!Array.isArray(frame) ||
          frame.length === 0 ||
          frame.length > MAX_GUIDANCE_TARGETS ||
          !frame.every(isId))
      ) {
        throw new ProtocolError(
          `The physical-space panel frames one to ${MAX_GUIDANCE_TARGETS} elements, by id.`,
        );
      }
      if (camera !== undefined && frame !== undefined) {
        throw new ProtocolError(
          'The physical-space panel moves to a camera or frames elements, not both.',
        );
      }
      return {
        kind: 'space',
        ...(root === undefined ? {} : { root }),
        ...(camera === undefined ? {} : { camera }),
        ...(frame === undefined ? {} : { frame: [...frame] }),
        ...view(),
      };
    }
    case 'simulation': {
      if (value.close !== undefined) {
        if (value.close !== true) {
          throw new ProtocolError('Guidance closes the simulation shown with close: true.');
        }
        const more = ['element', 'parameters', 'seed', 'tick', 'play', 'speed', 'view'].filter(
          (key) => value[key] !== undefined,
        );
        if (more.length > 0) {
          throw new ProtocolError(
            'Guidance that closes the simulation shown carries nothing else.',
          );
        }
        return { kind: 'simulation', close: true };
      }
      const { element, parameters, seed, tick, play, speed } = value;
      const read = readSavedSimulation({ element, parameters, seed, tick });
      if (!read.ok) throw new ProtocolError(read.message);
      if (play !== undefined && typeof play !== 'boolean') {
        throw new ProtocolError(
          'Guidance plays a simulation with play: true, or pauses it with false.',
        );
      }
      if (
        speed !== undefined &&
        !(SIMULATION_LIMITS.speeds as readonly unknown[]).includes(speed)
      ) {
        throw new ProtocolError(
          `A simulation plays at ${SIMULATION_LIMITS.speeds.join(', ')} ticks a second.`,
        );
      }
      return {
        kind: 'simulation',
        ...read.simulation,
        ...(play === undefined ? {} : { play }),
        ...(speed === undefined ? {} : { speed: speed as SimulationSpeed }),
        ...view(),
      };
    }
    default:
      throw new ProtocolError(`Unknown kind of guidance: ${JSON.stringify(value.kind)}.`);
  }
}

/** Reads the filters of guidance, filling in the lists left out. */
function readFilters(value: unknown): GuidedFilters {
  if (!isRecord(value)) throw new ProtocolError('Filters are an object.');
  const ids = (list: unknown, what: string): Id[] => {
    if (list === undefined) return [];
    if (!Array.isArray(list) || !list.every(isId)) {
      throw new ProtocolError(`The ${what} of filters are a list of ids.`);
    }
    if (list.length > MAX_GUIDANCE_TARGETS) {
      throw new ProtocolError(`Filters name at most ${MAX_GUIDANCE_TARGETS} ${what}.`);
    }
    return [...list];
  };
  const conditions = value.conditions ?? [];
  if (!Array.isArray(conditions)) throw new ProtocolError('The conditions of filters are a list.');
  if (conditions.length > MAX_FILTER_CONDITIONS) {
    throw new ProtocolError(`Filters hold at most ${MAX_FILTER_CONDITIONS} conditions.`);
  }
  let range: ViewTimeRange | undefined;
  if (value.range !== undefined) {
    const checked = checkTimeRange(value.range, MAX_FILTER_TEXT);
    if (!checked.ok) throw new ProtocolError(checked.message);
    range = checked.range;
  }
  return {
    components: ids(value.components, 'components'),
    relationTypes: ids(value.relationTypes, 'relation types'),
    conditions: conditions.map(readCondition),
    ...(range === undefined ? {} : { range }),
  };
}

function readCondition(value: unknown): GuidedCondition {
  if (!isRecord(value)) throw new ProtocolError('A condition of filters is an object.');
  const { of, attribute, test } = value;
  if (of !== 'elements' && of !== 'relations') {
    throw new ProtocolError('A condition is on elements or on relations.');
  }
  if (typeof attribute !== 'string' || attribute.trim() === '') {
    throw new ProtocolError('A condition names an attribute.');
  }
  if (!FILTER_TESTS.some((each) => each === test)) {
    throw new ProtocolError(`A condition tests with one of: ${FILTER_TESTS.join(', ')}.`);
  }
  const tested = test as GuidedCondition['test'];
  const needsValue = tested !== 'set' && tested !== 'unset';
  const given = value.value ?? (needsValue ? undefined : '');
  if (typeof given !== 'string' || (needsValue && given.trim() === '')) {
    throw new ProtocolError(`A condition that tests with "${tested}" needs a value, as text.`);
  }
  if (attribute.length > MAX_FILTER_TEXT || given.length > MAX_FILTER_TEXT) {
    throw new ProtocolError(
      `A condition's attribute and value hold at most ${MAX_FILTER_TEXT} characters.`,
    );
  }
  return { of, attribute, test: tested, value: needsValue ? given : '' };
}

/** Reads how far focus guidance reaches: one degree, both ways, dimming, unless it says. */
function readFocus(value: Record<string, unknown>): GuidedFocus {
  const degrees = value.degrees ?? 1;
  if (
    degrees !== 'all' &&
    !(
      Number.isInteger(degrees) &&
      (degrees as number) >= 1 &&
      (degrees as number) <= MAX_FOCUS_DEGREES
    )
  ) {
    throw new ProtocolError(`Focus reaches 1 to ${MAX_FOCUS_DEGREES} degrees, or "all".`);
  }
  const direction = value.direction ?? 'both';
  if (!FOCUS_DIRECTIONS.some((each) => each === direction)) {
    throw new ProtocolError(`Focus goes one of these ways: ${FOCUS_DIRECTIONS.join(', ')}.`);
  }
  const isolate = value.isolate ?? false;
  if (typeof isolate !== 'boolean') throw new ProtocolError('Whether focus isolates is a boolean.');
  return {
    degrees: degrees as GuidedFocus['degrees'],
    direction: direction as GuidedFocus['direction'],
    isolate,
  };
}

function readPlayback(value: Record<string, unknown>): Guidance {
  if (!isId(value.scenario)) throw new ProtocolError('Playback names its scenario by id.');
  const { action, step } = value;
  if (!PLAYBACK_ACTIONS.some((each) => each === action)) {
    throw new ProtocolError(`Playback does one of: ${PLAYBACK_ACTIONS.join(', ')}.`);
  }
  const scenario = value.scenario;
  if (action === 'choose') {
    const { decision, alternative } = value;
    if (!isId(decision) || !isId(alternative)) {
      throw new ProtocolError('Choosing names a decision and one of its alternatives, by id.');
    }
    return { kind: 'playback', scenario, action, decision, alternative };
  }
  const played = action as PlaybackAction;
  const choices = ACTIONS_WITH_CHOICES.includes(played) ? readChoices(value.choices) : undefined;
  const chosen = choices === undefined ? {} : { choices };
  if (played !== 'go-to-step') return { kind: 'playback', scenario, action: played, ...chosen };
  if (!Number.isSafeInteger(step) || (step as number) < 0) {
    throw new ProtocolError('Going to a step needs the index of the step, from 0.');
  }
  return { kind: 'playback', scenario, action: played, step: step as number, ...chosen };
}

/** Reads the alternatives chosen at a scenario's decisions, by the decisions' ids, copied. */
function readChoices(value: unknown): DecisionChoices | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new ProtocolError('Choices map the id of each decision to the id of an alternative.');
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_GUIDED_CHOICES) {
    throw new ProtocolError(`Playback carries at most ${MAX_GUIDED_CHOICES} choices.`);
  }
  if (!entries.every(([decision, alternative]) => isId(decision) && isId(alternative))) {
    throw new ProtocolError('Choices map the id of each decision to the id of an alternative.');
  }
  return Object.fromEntries(entries) as DecisionChoices;
}

/**
 * One action the history keeps (ADR-0028), as the app's history panel lists it: what the history calls
 * it, who did it and when, and whether it is undone.
 */
export interface ListedAction {
  /**
   * Names the action while the local program runs, from 1: no two actions share one, even across a
   * reload of the project, which starts the history over.
   */
  id: number;
  /** How the history names it, in English, as the core writes it. */
  label: string;
  author: Author;
  /** When it was done, in milliseconds since 1970 began, in UTC. */
  time: number;
  /** Whether it is undone, so that it can be redone. */
  undone: boolean;
}

/**
 * The history the local program keeps, action by action, oldest first: the actions done, then those
 * undone, the next one to redo first. Sent to every open app when it connects, after every action,
 * undo or redo, and after a reload, which empties it. Claude does not get it.
 */
export interface HistoryListedMessage {
  type: 'history/listed';
  actions: ListedAction[];
}

/**
 * Reads the actions of a history list strictly, keeping only what each one holds. Throws a
 * {@link ProtocolError} for anything else.
 */
export function readListedActions(value: unknown): ListedAction[] {
  if (!Array.isArray(value)) throw new ProtocolError('The actions of the history are a list.');
  const seen = new Set<number>();
  return value.map((item: unknown): ListedAction => {
    if (!isRecord(item)) throw new ProtocolError('An action of the history is an object.');
    const { id, label, author, time, undone } = item;
    if (!isActionId(id)) throw new ProtocolError('An action of the history has a whole id from 1.');
    if (seen.has(id)) throw new ProtocolError(`Two actions of the history have the id ${id}.`);
    seen.add(id);
    if (typeof label !== 'string') throw new ProtocolError('An action of the history has a label.');
    if (author !== 'user' && author !== 'claude') {
      throw new ProtocolError('An action of the history is the person’s or Claude’s.');
    }
    if (typeof time !== 'number' || !Number.isFinite(time)) {
      throw new ProtocolError('An action of the history has the time it was done.');
    }
    if (typeof undone !== 'boolean') {
      throw new ProtocolError('An action of the history says whether it is undone.');
    }
    return { id, label, author, time, undone };
  });
}

/** Whether a value can name an action of the history: a whole number from 1. */
function isActionId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

/**
 * A message the app sends to the local program. An undo or a redo with `to` goes on until the action
 * with that id is undone, or redone: the history panel's "Undo to here" and "Redo to here". A
 * command with `joins`, the id of the newest action as the history lists it, is the app's placement
 * of the shapes that action added, which the program joins to it when ADR 0065's conditions hold,
 * and records as an action of its own otherwise.
 */
export type AppMessage =
  | { type: 'command'; requestId: string; command: Command; joins?: number }
  | { type: 'undo'; requestId: string; to?: number }
  | { type: 'redo'; requestId: string; to?: number }
  | PreferencesSetMessage
  | StartCreateMessage
  | HomeOpenMessage
  | HomeCreateMessage
  | HomeForgetMessage
  | HomeCloseMessage
  | OpenOtherProjectMessage
  | LiveFetchMessage
  | LiveSetMessage
  | DrawingMakeMessage
  | VersionsListMessage
  | VersionCompareMessage
  | ProposalAcceptMessage
  | ProposalRefuseMessage
  | LayoutDoneMessage
  | CaptureAnswerMessage
  | SolidPrepareMessage
  | SolidGetMessage
  | SolidFilesListMessage
  | SolidFilesRemoveMessage
  | MediaPutMessage
  | MediaGetMessage
  | MediaFilesListMessage
  | MediaFilesRemoveMessage
  // Explorables (ADR 0107).
  | ExplorablesListenMessage
  | ScriptLibraryFetchMessage
  | ScriptLibraryConsentedMessage
  | ScriptLibraryFilesListMessage
  | ScriptLibraryFilesRemoveMessage
  | LinkFetchMessage
  | PackageReadMessage
  | ClaudeSetupMessage;

/** The longest name the start screen may give a new project or its first view. */
export const MAX_START_NAME = 200;

/**
 * Asks the local program, while it runs on a folder that holds no project yet, to start one there:
 * from the sample with this id, or empty when `sample` is left out, named as `names` says. It is
 * answered with `project/opened`, to every app, or with `command/rejected`.
 */
export interface StartCreateMessage {
  type: 'start/create';
  requestId: string;
  sample?: Id;
  /** For an empty project: its name, the folder's by default, and its first view's. */
  names?: { project?: string; view?: string };
}

/**
 * Asks the local program at home to open the project in a folder (ADR 0093): one the Projects screen
 * listed, or one the person typed. It is answered with `project/opened` to every app, or with
 * `start/offered` for a folder that holds nothing yet, or with `command/rejected` and why.
 */
export interface HomeOpenMessage {
  type: 'home/open';
  requestId: string;
  /** The folder, as an absolute path; the program checks it and only ever reads a folder from it. */
  path: string;
}

/**
 * Asks the local program at home to start a new project in the projects folder, in a subfolder named
 * from its name (ADR 0093): from the sample with this id, or empty when `sample` is left out. It is
 * answered as `home/open` is.
 */
export interface HomeCreateMessage {
  type: 'home/create';
  requestId: string;
  /** The project's name. */
  name: string;
  sample?: Id;
  /** For an empty project, its first view's name. */
  view?: string;
}

/**
 * Asks the local program at home to take a project off the recent list. It is answered with
 * `home/offered`, or with `command/rejected`.
 */
export interface HomeForgetMessage {
  type: 'home/forget';
  requestId: string;
  path: string;
}

/**
 * Asks the local program to close the open project, once every write has landed, and go home (ADR
 * 0093). It is answered with `home/offered`, to every app, or with `command/rejected`.
 */
export interface HomeCloseMessage {
  type: 'home/close';
  requestId: string;
}

/**
 * Asks the local program to open another project, as a destination names it, in a tab of the program
 * that runs on that project or of one it starts there (ADR 0044, ADR 0056); the tab asked the person
 * first. It is answered with `other-project/opened`, or with `command/rejected` and why: a path that
 * leads out of the folder holding this project's folder, a folder that holds no project, a view that
 * project does not have. It changes nothing in this project.
 */
export interface OpenOtherProjectMessage {
  type: 'project/open-other';
  requestId: string;
  /** The project's folder, relative to this project's folder, as the destination writes it. */
  project: string;
  /** The view to open there; absent, it opens where that project opens. */
  view?: Id;
}

/** Sent to the app that asked, once the other project's program opened a tab on it. */
export interface OtherProjectOpenedMessage {
  type: 'other-project/opened';
  requestId: string;
  /** The other project's name, for the app to say where the tab opened. */
  name: string;
}

/** The longest path to another project a message carries, as a destination holds it. */
const MAX_OTHER_PROJECT_PATH = 1024;

/**
 * Asks the local program to change some preferences. It is answered with `preferences/changed`, or
 * with `command/rejected` when the changes cannot be used. It is never a command: it is not undone,
 * has no author and changes no project file.
 */
export interface PreferencesSetMessage {
  type: 'preferences/set';
  requestId: string;
  changes: PreferenceChanges;
}

/** Thrown for a message the live protocol does not define. */
export class ProtocolError extends Error {
  override name = 'ProtocolError';
}

/** Writes a message for the live connection. */
export function encodeMessage(message: ServerMessage | AppMessage): string {
  return JSON.stringify(message);
}

/** Writes a message for the live connection. */
export const encodeServerMessage: (message: ServerMessage) => string = encodeMessage;

const SERVER_TYPES = new Set<string>([
  'project/opened',
  'project/changed',
  'command/rejected',
  'project/reloaded',
  'notice',
  'preferences/changed',
  'guidance',
  'history/listed',
  'start/offered',
  'home/offered',
  'project/closed',
  'other-project/opened',
  'live/values',
  'live/kept',
  'live/fetched',
  'drawing/made',
  'versions/listed',
  'version/compared',
  'version/refused',
  'proposal/shown',
  'proposal/closed',
  'capture/request',
  'solid/prepared',
  'solid/piece',
  'solid/refused',
  'solid-files/listed',
  'media/stored',
  'media/piece',
  'media/refused',
  'media-files/listed',
  'link/fetched',
  'link/refused',
  'package/read-answer',
  'claude/setup-answer',
  'app/shown',
  // Explorables (ADR 0107).
  'explorables/listening',
  'script-library/consent',
  'script-library/kept',
  'script-library/refused',
  'script-library-files/listed',
]);

/**
 * Reads a message the local program sent. Only the envelope is checked: the local program validated
 * the project and the operations it sends.
 */
export function decodeServerMessage(text: string): ServerMessage {
  const message = parseObject(text);
  if (typeof message.type !== 'string' || !SERVER_TYPES.has(message.type)) {
    throw new ProtocolError(`Unknown message type: ${JSON.stringify(message.type)}.`);
  }
  switch (message.type) {
    case 'project/opened':
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        throw new ProtocolError(
          `Protocol version ${JSON.stringify(message.protocolVersion)} is not ${PROTOCOL_VERSION}.`,
        );
      }
      if (!isRecord(message.project)) throw new ProtocolError('The message has no project.');
      if (message.token !== undefined && typeof message.token !== 'string') {
        throw new ProtocolError('The session token is text.');
      }
      break;
    case 'guidance': {
      const guidance = readGuidance(message.guidance);
      const { answer } = message;
      if (answer === undefined) return { type: 'guidance', guidance };
      if (typeof answer !== 'string' || answer === '' || answer.length > MAX_REQUEST_ID) {
        throw new ProtocolError('Guidance is answered by an id of 1 to 100 characters.');
      }
      return { type: 'guidance', guidance, answer };
    }
    case 'history/listed':
      return { type: 'history/listed', actions: readListedActions(message.actions) };
    case 'project/reloaded':
      if (!isRecord(message.project)) throw new ProtocolError('The message has no project.');
      break;
    case 'project/changed':
      if (!Array.isArray(message.operations)) {
        throw new ProtocolError('The message has no operations.');
      }
      break;
    case 'preferences/changed':
      if (!isRecord(message.preferences))
        throw new ProtocolError('The message has no preferences.');
      break;
    case 'start/offered':
      return readStartOffered(message);
    case 'home/offered':
      return readHomeOffered(message);
    case 'app/shown': {
      // Only the envelope: the app checks the view state with checkViewState before applying it.
      if (message.state === undefined) return { type: 'app/shown' };
      if (!isRecord(message.state)) throw new ProtocolError('The view state shown is an object.');
      return { type: 'app/shown', state: message.state as unknown as ViewState };
    }
    case 'project/closed':
      if (typeof message.message !== 'string') {
        throw new ProtocolError('The message says why no project is open.');
      }
      return { type: 'project/closed', message: message.message };
    case 'other-project/opened':
      if (typeof message.requestId !== 'string' || typeof message.name !== 'string') {
        throw new ProtocolError('The message names the request and the project that opened.');
      }
      return { type: 'other-project/opened', requestId: message.requestId, name: message.name };
    case 'live/values':
    case 'live/kept':
    case 'live/fetched':
      return readLive(message, message.type);
    case 'drawing/made': {
      const { requestId } = message;
      if (typeof requestId !== 'string' || requestId === '' || requestId.length > MAX_REQUEST_ID) {
        throw new ProtocolError('The answer has no valid request id.');
      }
      return readDrawing(readDrawingMade(message, requestId));
    }
    case 'versions/listed':
    case 'version/compared':
    case 'version/refused':
    case 'proposal/shown':
    case 'proposal/closed':
      return readVersionsAnswer(message, message.type);
    case 'capture/request': {
      const { requestId } = message;
      if (typeof requestId !== 'string' || requestId === '' || requestId.length > MAX_REQUEST_ID) {
        throw new ProtocolError('The request has no valid id.');
      }
      const read = readCaptureRequest(message, requestId);
      if (!read.ok) throw new ProtocolError(read.reason);
      return read.value;
    }
    case 'solid/prepared':
      return readSolidMessage(readSolidPrepared(message));
    case 'solid/piece':
      return readSolidMessage(readSolidPieceMessage(message));
    case 'solid/refused':
      return readSolidMessage(readSolidRefused(message));
    case 'solid-files/listed':
      return readSolidMessage(readSolidFilesListed(message));
    case 'media/stored':
      return readSolidMessage(readMediaStored(message));
    case 'media/piece':
      return readSolidMessage(readMediaPieceMessage(message));
    case 'media/refused':
      return readSolidMessage(readMediaRefused(message));
    case 'media-files/listed':
      return readSolidMessage(readMediaFilesListed(message));
    // Explorables (ADR 0107).
    case 'explorables/listening':
      return readSolidMessage(readExplorablesListening(message));
    case 'script-library/consent':
      return readSolidMessage(readScriptLibraryConsent(message));
    case 'script-library/kept':
      return readSolidMessage(readScriptLibraryKept(message));
    case 'script-library/refused':
      return readSolidMessage(readScriptLibraryRefused(message));
    case 'script-library-files/listed':
      return readSolidMessage(readScriptLibraryFilesListed(message));
    case 'link/fetched':
      return readSolidMessage(readLinkFetched(message));
    case 'link/refused':
      return readSolidMessage(readLinkRefused(message));
    case 'package/read-answer': {
      const { requestId } = message;
      if (typeof requestId !== 'string' || requestId === '' || requestId.length > MAX_REQUEST_ID) {
        throw new ProtocolError('The answer has no valid request id.');
      }
      return readPackageMessage(readPackageReadAnswer(message, requestId));
    }
    case 'claude/setup-answer': {
      const { requestId } = message;
      if (typeof requestId !== 'string' || requestId === '' || requestId.length > MAX_REQUEST_ID) {
        throw new ProtocolError('The answer has no valid request id.');
      }
      return readClaudeSetupMessage(readClaudeSetupAnswer(message, requestId));
    }
  }
  return message as unknown as ServerMessage;
}

/** The longest request id the local program accepts. */
const MAX_REQUEST_ID = 100;

/**
 * Reads a message an app sent. The envelope is checked here; the command itself is checked by the core
 * when it runs, like every command.
 */
export function decodeAppMessage(text: string): AppMessage {
  const message = parseObject(text);
  if (
    typeof message.requestId !== 'string' ||
    message.requestId === '' ||
    message.requestId.length > MAX_REQUEST_ID
  ) {
    throw new ProtocolError('The message has no valid request id.');
  }
  switch (message.type) {
    case 'command':
      if (!isRecord(message.command) || typeof message.command.type !== 'string') {
        throw new ProtocolError('The message has no command.');
      }
      if (message.joins !== undefined && !isActionId(message.joins)) {
        throw new ProtocolError('The action a command joins is named by its id.');
      }
      return message as unknown as AppMessage;
    case 'undo':
    case 'redo':
      if (message.to !== undefined && !isActionId(message.to)) {
        throw new ProtocolError(`The action to ${message.type} up to is named by its id.`);
      }
      return message as unknown as AppMessage;
    case 'preferences/set':
      // The changes themselves are checked by checkPreferenceChanges, where they are used.
      if (!isRecord(message.changes)) {
        throw new ProtocolError('The message has no preferences to change.');
      }
      return message as unknown as AppMessage;
    case 'start/create':
      return readStartCreate(message, message.requestId);
    case 'home/open':
    case 'home/forget':
      return { type: message.type, requestId: message.requestId, path: homePathOf(message.path) };
    case 'home/create':
      return readHomeCreate(message, message.requestId);
    case 'home/close':
      return { type: 'home/close', requestId: message.requestId };
    case 'project/open-other': {
      // The path itself is checked by the local program, against the real folders, where it is used.
      const { project, view } = message;
      if (
        typeof project !== 'string' ||
        project === '' ||
        project.length > MAX_OTHER_PROJECT_PATH
      ) {
        throw new ProtocolError(
          `The project to open is a path of 1 to ${MAX_OTHER_PROJECT_PATH} characters.`,
        );
      }
      if (view !== undefined && !isId(view)) {
        throw new ProtocolError('The view to open there is named by its id.');
      }
      return {
        type: 'project/open-other',
        requestId: message.requestId,
        project,
        ...(view === undefined ? {} : { view }),
      };
    }
    case 'live/fetch':
      return asProtocolError(() => readLiveFetchMessage(message, message.requestId as string));
    case 'live/set':
      return asProtocolError(() => readLiveSetMessage(message, message.requestId as string));
    case 'drawing/make':
      return readDrawing(readDrawingMake(message, message.requestId));
    case 'versions/list':
      return { type: 'versions/list', requestId: message.requestId };
    case 'version/compare':
      return readVersion(readVersionCompare(message, message.requestId));
    case 'proposal/accept':
      return readVersion(readProposalAccept(message, message.requestId));
    case 'proposal/refuse':
      return readVersion(readProposalRefuse(message, message.requestId));
    case 'layout/done': {
      const read = readLayoutDone(message, message.requestId, MAX_GUIDANCE_TARGETS);
      if (!read.ok) throw new ProtocolError(read.reason);
      return read.value;
    }
    case 'capture/answer': {
      const read = readCaptureAnswer(message, message.requestId);
      if (!read.ok) throw new ProtocolError(read.reason);
      return read.value;
    }
    case 'solid/prepare':
      return readSolidMessage(readSolidPrepare(message));
    case 'solid/get':
      return readSolidMessage(readSolidGet(message));
    case 'solid-files/list':
      return readSolidMessage(readSolidFilesList(message));
    case 'solid-files/remove':
      return readSolidMessage(readSolidFilesRemove(message));
    case 'media/put':
      return readSolidMessage(readMediaPut(message));
    case 'media/get':
      return readSolidMessage(readMediaGet(message));
    case 'media-files/list':
      return readSolidMessage(readMediaFilesList(message));
    case 'media-files/remove':
      return readSolidMessage(readMediaFilesRemove(message));
    // Explorables (ADR 0107).
    case 'explorables/listen':
      return readSolidMessage(readExplorablesListen(message));
    case 'script-library/fetch':
      return readSolidMessage(readScriptLibraryFetch(message));
    case 'script-library/consented':
      return readSolidMessage(readScriptLibraryConsented(message));
    case 'script-library-files/list':
      return readSolidMessage(readScriptLibraryFilesList(message));
    case 'script-library-files/remove':
      return readSolidMessage(readScriptLibraryFilesRemove(message));
    case 'link/fetch':
      return readSolidMessage(readLinkFetch(message));
    case 'package/read':
      return readPackageMessage(readPackageRead(message, message.requestId));
    case 'claude/setup':
      return readClaudeSetupMessage(readClaudeSetup(message.requestId));
    default:
      throw new ProtocolError(`Unknown message type: ${JSON.stringify(message.type)}.`);
  }
}

/** A message about a package file (ADR 0089), or the {@link ProtocolError} of why it cannot be read. */
function readPackageMessage<T>(read: PackageMessageRead<T>): T {
  if (!read.ok) throw new ProtocolError(read.reason);
  return read.message;
}

/** A message about connecting Claude (ADR 0093), or the {@link ProtocolError} of why it cannot be read. */
function readClaudeSetupMessage<T>(read: ClaudeSetupRead<T>): T {
  if (!read.ok) throw new ProtocolError(read.reason);
  return read.message;
}

/** A message about solids (ADR 0075) or media files (ADR 0098), or the {@link ProtocolError} of why it cannot be read. */
function readSolidMessage<T>(read: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!read.ok) throw new ProtocolError(read.reason);
  return read.value;
}

/** A message about versions or proposals, or the {@link ProtocolError} of why it cannot be read. */
function readVersion<T>(read: VersionMessageRead<T>): T {
  if (!read.ok) throw new ProtocolError(read.reason);
  return read.message;
}

/**
 * Reads what the program sends about versions and proposals by its envelope: the program worked out
 * the projects, comparisons and operations it carries. The versions listed, shown as text, are read
 * strictly.
 */
function readVersionsAnswer(
  message: Record<string, unknown>,
  type:
    | 'versions/listed'
    | 'version/compared'
    | 'version/refused'
    | 'proposal/shown'
    | 'proposal/closed',
): ServerMessage {
  const { requestId } = message;
  const answers =
    typeof requestId === 'string' && requestId !== '' && requestId.length <= MAX_REQUEST_ID;
  switch (type) {
    case 'versions/listed': {
      if (!answers) throw new ProtocolError('The answer has no valid request id.');
      const versions = readVersion(readListedVersions(message.versions));
      if (message.why !== undefined && typeof message.why !== 'string') {
        throw new ProtocolError('Why no version was listed is said in words.');
      }
      return {
        type,
        requestId,
        versions,
        ...(message.why === undefined ? {} : { why: message.why }),
      };
    }
    case 'version/compared': {
      if (!answers) throw new ProtocolError('The answer has no valid request id.');
      const version = readVersion(readVersionRef(message.version));
      if (
        !isRecord(message.comparison) ||
        !Array.isArray(message.comparison.changes) ||
        (message.project !== undefined && !isRecord(message.project))
      ) {
        throw new ProtocolError('The comparison has no changes, or a project that is not one.');
      }
      return { ...(message as unknown as VersionComparedMessage), version };
    }
    case 'version/refused':
      if (!answers || !Array.isArray(message.problems)) {
        throw new ProtocolError('The refusal names its request and its problems.');
      }
      break;
    case 'proposal/shown': {
      const proposal = message.proposal;
      if (
        !isRecord(proposal) ||
        !isId(proposal.id) ||
        !isRevision(proposal.revision) ||
        !Array.isArray(proposal.operations) ||
        !Array.isArray(proposal.changes) ||
        !Array.isArray(proposal.labels)
      ) {
        throw new ProtocolError(
          'The proposal shown has its id, revision, labels, operations and changes.',
        );
      }
      break;
    }
    case 'proposal/closed': {
      const { how } = message;
      if (
        !isId(message.proposal) ||
        (how !== 'accepted' && how !== 'refused' && how !== 'withdrawn' && how !== 'dropped')
      ) {
        throw new ProtocolError('The proposal closed is named, with how it closed.');
      }
      break;
    }
  }
  return message as unknown as ServerMessage;
}

/** Reads a message about live values (version 6) strictly. */
function readLive(
  message: Record<string, unknown>,
  type: 'live/values' | 'live/kept' | 'live/fetched',
): ServerMessage {
  return asProtocolError(() => {
    if (type === 'live/values') return readLiveValuesMessage(message);
    const { requestId } = message;
    if (typeof requestId !== 'string' || requestId === '' || requestId.length > MAX_REQUEST_ID) {
      throw new ProtocolError('The answer has no valid request id.');
    }
    return type === 'live/kept'
      ? readLiveKeptMessage(message, requestId)
      : readLiveFetchedMessage(message, requestId);
  });
}

/** A message about a drawing (ADR 0068), or the {@link ProtocolError} of why it cannot be read. */
function readDrawing<T>(read: DrawingMessageRead<T>): T {
  if (!read.ok) throw new ProtocolError(read.reason);
  return read.message;
}

/** Runs a reader of live values' messages, turning what it refuses into a {@link ProtocolError}. */
function asProtocolError<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof LiveProtocolProblem) throw new ProtocolError(error.message);
    throw error;
  }
}

/** Reads the samples a start screen offers: each with an id, a name and the packages it uses. */
function readStartOffered(message: Record<string, unknown>): StartOfferedMessage {
  if (message.protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolError(
      `Protocol version ${JSON.stringify(message.protocolVersion)} is not ${PROTOCOL_VERSION}.`,
    );
  }
  if (typeof message.folder !== 'string') throw new ProtocolError('The folder is named by text.');
  if (message.token !== undefined && typeof message.token !== 'string') {
    throw new ProtocolError('The session token is text.');
  }
  if (!Array.isArray(message.samples)) throw new ProtocolError('The message has no samples.');
  const samples = message.samples.map((each: unknown): OfferedSample => {
    if (!isRecord(each) || !isId(each.id) || typeof each.name !== 'string') {
      throw new ProtocolError('A sample has an id and a name.');
    }
    const packages = Array.isArray(each.packages) ? each.packages.filter(isId) : [];
    return { id: each.id, name: each.name, packages };
  });
  return {
    type: 'start/offered',
    protocolVersion: PROTOCOL_VERSION,
    folder: message.folder,
    samples,
    ...(message.token === undefined ? {} : { token: message.token }),
  };
}

/** Reads a path a home message carries: text, not empty, of at most {@link MAX_HOME_PATH}. */
function homePathOf(value: unknown): string {
  if (typeof value !== 'string' || value === '' || value.length > MAX_HOME_PATH) {
    throw new ProtocolError(
      `A folder is named by its path, as text of at most ${MAX_HOME_PATH} characters.`,
    );
  }
  if (value.includes('\0')) throw new ProtocolError('A path holds no NUL character.');
  return value;
}

/** Reads a new project's name and how it starts, as the Projects screen asks for it. */
function readHomeCreate(message: Record<string, unknown>, requestId: string): HomeCreateMessage {
  const { name, sample, view } = message;
  if (typeof name !== 'string' || name.trim() === '' || name.length > MAX_START_NAME) {
    throw new ProtocolError(`A new project's name is text of 1 to ${MAX_START_NAME} characters.`);
  }
  if (sample !== undefined && !isId(sample))
    throw new ProtocolError('A sample is named by its id.');
  if (view !== undefined && (typeof view !== 'string' || view.length > MAX_START_NAME)) {
    throw new ProtocolError(
      `A new project's first view's name is text of at most ${MAX_START_NAME} characters.`,
    );
  }
  return {
    type: 'home/create',
    requestId,
    name,
    ...(sample === undefined ? {} : { sample }),
    ...(view === undefined ? {} : { view }),
  };
}

/** Reads what the Projects screen offers: the projects folder, its projects, the recent ones, samples. */
function readHomeOffered(message: Record<string, unknown>): HomeOfferedMessage {
  const { folder, projects, recent, token, requestId } = message;
  // The version, the folder, the token and the samples are read as the start screen's are.
  const offered = readStartOffered(message);
  if (requestId !== undefined && typeof requestId !== 'string') {
    throw new ProtocolError('The request is named by text.');
  }
  if (
    !Array.isArray(projects) ||
    !Array.isArray(recent) ||
    projects.length > MAX_HOME_PROJECTS ||
    recent.length > MAX_HOME_PROJECTS
  ) {
    throw new ProtocolError('The message has no list of projects.');
  }
  return {
    type: 'home/offered',
    protocolVersion: PROTOCOL_VERSION,
    folder: folder as string,
    projects: projects.map((each: unknown): HomeProject => {
      if (
        !isRecord(each) ||
        typeof each.path !== 'string' ||
        typeof each.name !== 'string' ||
        typeof each.changed !== 'number' ||
        !Number.isFinite(each.changed)
      ) {
        throw new ProtocolError('A project has a path, a name and when it last changed.');
      }
      return {
        path: each.path,
        name: each.name,
        ...(isId(each.world) ? { world: each.world } : {}),
        changed: each.changed,
      };
    }),
    recent: recent.map((each: unknown): RecentProject => {
      if (!isRecord(each) || typeof each.path !== 'string' || typeof each.missing !== 'boolean') {
        throw new ProtocolError('A recent project has a path, and says whether it is missing.');
      }
      return {
        path: each.path,
        ...(typeof each.name === 'string' ? { name: each.name } : {}),
        ...(isId(each.world) ? { world: each.world } : {}),
        ...(typeof each.changed === 'number' && Number.isFinite(each.changed)
          ? { changed: each.changed }
          : {}),
        missing: each.missing,
      };
    }),
    samples: offered.samples,
    ...(token === undefined ? {} : { token: token as string }),
    ...(requestId === undefined ? {} : { requestId }),
  };
}

/** Reads an app's choice of how to start a project: a sample by its id, and the names it gives. */
function readStartCreate(message: Record<string, unknown>, requestId: string): StartCreateMessage {
  const { sample, names } = message;
  if (sample !== undefined && !isId(sample)) {
    throw new ProtocolError('A sample is named by its id.');
  }
  const read: { project?: string; view?: string } = {};
  if (names !== undefined) {
    if (!isRecord(names)) throw new ProtocolError('The names of a new project are an object.');
    for (const [key, value] of Object.entries(names)) {
      if (
        (key !== 'project' && key !== 'view') ||
        typeof value !== 'string' ||
        value.length > MAX_START_NAME
      ) {
        throw new ProtocolError(
          `A new project's names are its "project" and its first "view", each text of at most ${MAX_START_NAME} characters.`,
        );
      }
      read[key] = value;
    }
  }
  return {
    type: 'start/create',
    requestId,
    ...(sample === undefined ? {} : { sample }),
    ...(names === undefined ? {} : { names: read }),
  };
}

function parseObject(text: string): Record<string, unknown> {
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    throw new ProtocolError('The message is not JSON.');
  }
  if (!isRecord(message)) throw new ProtocolError('The message is not a JSON object.');
  return message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
