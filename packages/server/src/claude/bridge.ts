/**
 * The MCP entry point's side of the Claude endpoint. It finds the running local program of the
 * project from its record in the runtime folder, starting the program when none runs, and attaches
 * to it through the Claude endpoint with the credential the record holds. It keeps a copy of the
 * project in step with every change, as an app does, so that reads need no round trip; and it sends
 * Claude's commands, guidance and requests to open the app, each answered by the program. While
 * Claude's proposal waits (ADR 0073), it keeps the proposed copy too, the project now with the
 * proposal's operations, and Claude's reads see that copy.
 */
import { spawn } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OperationError,
  PROTOCOL_VERSION,
  ProtocolError,
  applyOperations,
  type CodeApproval,
  type Command,
  type Guidance,
  type LayoutReport,
  type Problem,
  type ProjectSnapshot,
  type ProposalShownMessage,
  type ViewState,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { WebSocket, type RawData } from 'ws';
import type { ImportRequest } from '../import';
import { toForwardSlashes } from '../paths';
import {
  RUNTIME_ENV,
  currentContext,
  ensureRuntimeFolder,
  isAlive,
  listProgramRecords,
  readProgramRecord,
  recordName,
  type ProgramRecord,
  type RuntimeContext,
} from './discovery';
import { LAYOUT_WAIT_MARGIN, LAYOUT_WAIT_PER_LAYOUT, layoutWait } from '../layout-waits';
import type { LiveKept, LiveListing } from '../live';
import type { ProposalEnding } from '../proposals';
import {
  CLAUDE_PATH,
  decodeProgramMessage,
  encodeClaudeMessage,
  importMessageRequest,
  type ClaudeMessage,
  type LiveSenderKind,
  type ProgramMessage,
} from './messages';

/** How the program answered a command of Claude's. */
export type CommandAnswer =
  | {
      ok: true;
      /** How the history names the action; nothing was recorded when `changed` is false. */
      label: string;
      changed: boolean;
      created: Id[];
      warnings: Problem[];
      /**
       * Present when the change joined Claude's proposal rather than applying (ADR 0073): the
       * proposal, the keys of its changes so far, and how many apps are open to review it.
       */
      proposed?: { proposal: Id; changes: string[]; apps: number };
    }
  | { ok: false; problems: Problem[] };

/** The proposal shown: its id, labels, operations and changes. */
export type ShownProposal = ProposalShownMessage['proposal'];

/** Claude's proposal as the entry point knows it: the one that waits, and how the last one ended. */
export interface ProposalState {
  /** The proposal that waits, as the program last showed it; absent when none waits. */
  open?: ShownProposal;
  /** How the last proposal ended since this entry point attached; absent before one has. */
  ended?: ProposalEnding;
}

/** How a withdrawal went: the proposal withdrawn, or why none was. */
export type WithdrawAnswer = { ok: true; proposal: Id } | { ok: false; problems: Problem[] };

/** How a command of Claude's runs: `propose` makes it join Claude's proposal (ADR 0073). */
export interface ExecuteOptions {
  propose?: boolean;
}

/** What Claude's tools need from the running local program. */
export interface Program {
  /**
   * The project as Claude reads it, attaching first if needed: the project now, or, while Claude's
   * proposal waits, the proposed project, with every change of the proposal (ADR 0073).
   */
  project(): Promise<ProjectSnapshot>;
  /**
   * Runs a command as one action of Claude's, or, while the person reviews Claude's changes or with
   * `propose`, as a change that joins Claude's proposal.
   */
  execute(command: Command, options?: ExecuteOptions): Promise<CommandAnswer>;
  /** Claude's proposal: the one that waits, and how the last one ended. Absent where it cannot. */
  proposal?(): Promise<ProposalState>;
  /** Withdraws Claude's proposal that waits. Absent where it cannot. */
  withdrawProposal?(): Promise<WithdrawAnswer>;
  /** Shows guidance in the open apps; resolves with how many it reached. */
  guide(guidance: Guidance): Promise<number>;
  /**
   * Lays a view out in the open app, after the layouts asked for before it, and resolves once it is
   * done, with what it moved, or why it was not (M3d). Absent where it cannot wait: `guide` sends it.
   */
  layOut?(guidance: Extract<Guidance, { kind: 'layout' }>): Promise<LayoutReport>;
  /**
   * Opens the app in the browser, at an address that works once; with a view state, the tab opens the
   * project there (ADR-0044).
   */
  openApp(state?: ViewState): Promise<void>;
  /**
   * The address the program serves the app at, `http://127.0.0.1:<port>/`, attaching first if needed;
   * absent, or undefined, where it is not known.
   */
  address?(): Promise<string | undefined>;
  /**
   * The person's approvals of the code the project's packages hold now (ADR 0054); absent where it
   * cannot ask, and then no code runs for Claude.
   */
  codeApprovals?(): Promise<CodeApproval[]>;
  /**
   * Sends live values (ADR 0057), as Claude's or the command line's: the program keeps them while the
   * project is open, never in a file or the history. Absent where it cannot.
   */
  setLive?(values: readonly unknown[], options?: LiveSetOptions): Promise<LiveKept>;
  /** Clears live values that match; resolves with how many went. Absent where it cannot. */
  clearLive?(filter: LiveClearFilter): Promise<number>;
  /**
   * The live values the program keeps now (ADR 0057), everyone's, of some targets or attributes or
   * all of them, the latest first. Reading them changes nothing. Absent where it cannot.
   */
  listLive?(filter: LiveListFilter): Promise<LiveListing>;
}

/** Which live values to read: of some targets or attributes, or all of them, and at most how many. */
export interface LiveListFilter {
  targets?: Id[];
  attributes?: string[];
  /** A thousand at most, and when left out. */
  limit?: number;
}

/** How live values are sent: how long they stay fresh, and who sends them. */
export interface LiveSetOptions {
  /** In milliseconds; a minute when left out. */
  freshFor?: number;
  /** Claude, unless said otherwise. */
  from?: LiveSenderKind;
}

/** Which live values to clear: those of a sender, or everyone's, of some targets or attributes. */
export interface LiveClearFilter {
  targets?: Id[];
  attributes?: string[];
  /** Claude's own, unless said otherwise. */
  from?: LiveSenderKind | 'everyone';
}

/** Raised when the program cannot be reached; its message is written for Claude to pass on. */
export class ProgramUnavailableError extends Error {
  override name = 'ProgramUnavailableError';
}

/** Raised when the program that runs on the project comes from another build of Visual Anything. */
export class OtherBuildError extends ProgramUnavailableError {
  override name = 'OtherBuildError';
}

/** Raised by a bridge that only attaches when no program runs on the project. */
export class NoProgramRunningError extends ProgramUnavailableError {
  override name = 'NoProgramRunningError';
}

/** Starts the local program for a project folder, its output going to `log`. */
export type StartProgram = (folder: string, log: string) => { exited: Promise<number | null> };

export interface BridgeOptions {
  /** The project folder to attach to, or to start the program for; absent, the one running. */
  folder?: string;
  /** The runtime folder where running programs leave their records. */
  runtime: string;
  context?: RuntimeContext;
  /** How to start the program; by default a background process of this command's own program. */
  start?: StartProgram;
  /** Whether a program started here serves the app from its sources, as `pnpm dev` does. */
  dev?: boolean;
  /**
   * Attaches only to a program that runs, and never starts one, as `visual-anything open` does to
   * open a tab in the program already running on its folder (ADR-0044).
   */
  attachOnly?: boolean;
  /** How long to wait for a started program to listen, in milliseconds. */
  startTimeout?: number;
  /** How long to wait for an answer, in milliseconds. */
  requestTimeout?: number;
}

/** The program this bridge is attached to. */
interface Attached {
  socket: WebSocket;
  /** The port the program listens on, on 127.0.0.1. */
  port: number;
  snapshot: ProjectSnapshot;
  waiting: Map<string, (message: ProgramMessage | Error) => void>;
  /**
   * Claude's proposal that waits, as last shown, with the proposed copy; the copy is absent from a
   * change of the project now until the program shows the proposal rebased on it.
   */
  proposal?: { shown: ShownProposal; proposed?: ProjectSnapshot };
  /** How the last proposal ended. */
  ended?: ProposalEnding;
  /** The reads waiting for the proposal to be shown again, or to close. */
  settled: (() => void)[];
}

const START_TIMEOUT = 60_000;
const REQUEST_TIMEOUT = 60_000;
const POLL = 100;
/** How long a read waits for the proposal rebased on a change, which follows the change at once. */
const PROPOSAL_SETTLE = 10_000;

/** How long the program waits for one layout guidance: per layout it asks for, and a margin. */
function layoutBound(guidance: Extract<Guidance, { kind: 'layout' }>): number {
  return layoutWait(guidance.containers?.length ?? 1, LAYOUT_WAIT_PER_LAYOUT, LAYOUT_WAIT_MARGIN);
}

/** The program's command line, run with the same Node.js and loaders as this process. */
const CLI = fileURLToPath(new URL('../cli.ts', import.meta.url));

let requestCount = 0;

export class ProgramBridge implements Program {
  readonly #options: BridgeOptions;
  readonly #context: RuntimeContext;
  #attaching: Promise<Attached> | undefined;
  #current: Attached | undefined;
  /** How long the layouts this bridge waits for may take in all, as the program bounds each. */
  #layoutsWaiting = 0;

  constructor(options: BridgeOptions) {
    this.#options = options;
    this.#context = options.context ?? currentContext();
  }

  async project(): Promise<ProjectSnapshot> {
    const attached = await this.#settled(await this.#attached());
    return attached.proposal?.proposed ?? attached.snapshot;
  }

  async proposal(): Promise<ProposalState> {
    const attached = await this.#settled(await this.#attached());
    return {
      ...(attached.proposal === undefined ? {} : { open: attached.proposal.shown }),
      ...(attached.ended === undefined ? {} : { ended: attached.ended }),
    };
  }

  async withdrawProposal(): Promise<WithdrawAnswer> {
    const answer = await this.#request((requestId) => ({ type: 'proposal/withdraw', requestId }));
    if (answer.type === 'proposal/closed') return { ok: true, proposal: answer.proposal };
    if (answer.type === 'command/rejected') return { ok: false, problems: answer.problems };
    throw new ProgramUnavailableError(`Visual Anything answered with ${answer.type}.`);
  }

  async execute(command: Command, options: ExecuteOptions = {}): Promise<CommandAnswer> {
    const answer = await this.#request((requestId) => ({
      type: 'command',
      requestId,
      command,
      ...(options.propose === true ? { propose: true } : {}),
    }));
    if (answer.type === 'proposal/made') {
      return {
        ok: true,
        label: answer.label,
        changed: true,
        created: answer.created,
        warnings: answer.warnings,
        proposed: { proposal: answer.proposal, changes: answer.changes, apps: answer.apps },
      };
    }
    if (answer.type === 'project/changed') {
      return {
        ok: true,
        label: answer.label,
        changed: answer.operations.length > 0,
        created: answer.created,
        warnings: answer.warnings,
      };
    }
    if (answer.type === 'command/rejected') return { ok: false, problems: answer.problems };
    throw new ProgramUnavailableError(`Visual Anything answered with ${answer.type}.`);
  }

  /**
   * Runs an import the person ran on the command line as one action of the person's (ADR-0049): the
   * program reads and maps the file itself. Only `visual-anything import` calls it, never Claude's
   * tools.
   */
  async importAsPerson(request: ImportRequest): Promise<CommandAnswer> {
    const message = importMessageRequest(request);
    const answer = await this.#request((requestId) => ({
      type: 'import',
      requestId,
      request: message,
    }));
    if (answer.type === 'project/changed') {
      return {
        ok: true,
        label: answer.label,
        changed: answer.operations.length > 0,
        created: answer.created,
        warnings: answer.warnings,
      };
    }
    if (answer.type === 'command/rejected') return { ok: false, problems: answer.problems };
    throw new ProgramUnavailableError(`Visual Anything answered with ${answer.type}.`);
  }

  async guide(guidance: Guidance): Promise<number> {
    const answer = await this.#request((requestId) => ({ type: 'guidance', requestId, guidance }));
    if (answer.type === 'guidance/shown') return answer.apps;
    if (answer.type === 'command/rejected') {
      throw new ProgramUnavailableError(answer.problems.map((each) => each.message).join(' '));
    }
    throw new ProgramUnavailableError(`Visual Anything answered with ${answer.type}.`);
  }

  async layOut(guidance: Extract<Guidance, { kind: 'layout' }>): Promise<LayoutReport> {
    // The program bounds each layout's wait; this one waits for those this bridge asked for before.
    const bound = layoutBound(guidance);
    const ahead = this.#layoutsWaiting;
    this.#layoutsWaiting += bound;
    let answer: ProgramMessage;
    try {
      answer = await this.#request(
        (requestId) => ({ type: 'guidance', requestId, guidance }),
        ahead + bound + (this.#options.requestTimeout ?? REQUEST_TIMEOUT),
      );
    } finally {
      this.#layoutsWaiting -= bound;
    }
    if (answer.type === 'guidance/shown') return { apps: answer.apps, ...answer.layout };
    if (answer.type === 'command/rejected') {
      throw new ProgramUnavailableError(answer.problems.map((each) => each.message).join(' '));
    }
    throw new ProgramUnavailableError(`Visual Anything answered with ${answer.type}.`);
  }

  async openApp(state?: ViewState): Promise<void> {
    const answer = await this.#request((requestId) =>
      state === undefined
        ? { type: 'open-app', requestId }
        : { type: 'open-app', requestId, state },
    );
    if (answer.type === 'app/opened') return;
    if (answer.type === 'command/rejected') {
      throw new ProgramUnavailableError(answer.problems.map((each) => each.message).join(' '));
    }
    throw new ProgramUnavailableError(`Visual Anything answered with ${answer.type}.`);
  }

  async codeApprovals(): Promise<CodeApproval[]> {
    const answer = await this.#request((requestId) => ({ type: 'code-approvals', requestId }));
    if (answer.type === 'code/approvals') return answer.approvals;
    if (answer.type === 'command/rejected') {
      throw new ProgramUnavailableError(answer.problems.map((each) => each.message).join(' '));
    }
    throw new ProgramUnavailableError(`Visual Anything answered with ${answer.type}.`);
  }

  async setLive(values: readonly unknown[], options: LiveSetOptions = {}): Promise<LiveKept> {
    const answer = await this.#request((requestId) => ({
      type: 'live/set',
      requestId,
      values: [...values],
      ...(options.freshFor === undefined ? {} : { freshFor: options.freshFor }),
      from: options.from ?? 'claude',
    }));
    if (answer.type === 'live/kept') {
      const { kept, waiting, dropped, unknown, refused } = answer;
      return { kept, waiting, dropped, unknown, refused };
    }
    if (answer.type === 'command/rejected') {
      throw new ProgramUnavailableError(answer.problems.map((each) => each.message).join(' '));
    }
    throw new ProgramUnavailableError(`Visual Anything answered with ${answer.type}.`);
  }

  async clearLive(filter: LiveClearFilter): Promise<number> {
    const answer = await this.#request((requestId) => ({
      type: 'live/clear',
      requestId,
      ...(filter.targets === undefined ? {} : { targets: filter.targets }),
      ...(filter.attributes === undefined ? {} : { attributes: filter.attributes }),
      from: filter.from ?? 'claude',
    }));
    if (answer.type === 'live/cleared') return answer.cleared;
    if (answer.type === 'command/rejected') {
      throw new ProgramUnavailableError(answer.problems.map((each) => each.message).join(' '));
    }
    throw new ProgramUnavailableError(`Visual Anything answered with ${answer.type}.`);
  }

  async listLive(filter: LiveListFilter = {}): Promise<LiveListing> {
    const answer = await this.#request((requestId) => ({
      type: 'live/list',
      requestId,
      ...(filter.targets === undefined ? {} : { targets: filter.targets }),
      ...(filter.attributes === undefined ? {} : { attributes: filter.attributes }),
      ...(filter.limit === undefined ? {} : { limit: filter.limit }),
    }));
    if (answer.type === 'live/listed') {
      const { values, total, at, summary } = answer;
      return { values, total, at, ...(summary === undefined ? {} : { summary }) };
    }
    if (answer.type === 'command/rejected') {
      throw new ProgramUnavailableError(answer.problems.map((each) => each.message).join(' '));
    }
    throw new ProgramUnavailableError(`Visual Anything answered with ${answer.type}.`);
  }

  async address(): Promise<string> {
    return `http://127.0.0.1:${(await this.#attached()).port}/`;
  }

  /** Lets go of the program. */
  close(): void {
    const attaching = this.#attaching;
    this.#attaching = undefined;
    void attaching?.then((attached) => attached.socket.close()).catch(() => {});
  }

  /**
   * The attached program once its proposed copy is in step: after a change of the project now while a
   * proposal waits, the program shows the proposal rebased on it at once, and a read waits for that.
   */
  async #settled(attached: Attached): Promise<Attached> {
    if (attached.proposal === undefined || attached.proposal.proposed !== undefined)
      return attached;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, PROPOSAL_SETTLE);
      attached.settled.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (attached.proposal === undefined || attached.proposal.proposed !== undefined)
      return attached;
    throw new ProgramUnavailableError(
      'Visual Anything did not show your proposal on the latest change in time. Read the project again before going on.',
    );
  }

  /** Sends a request and waits for the program's answer to it, `timeout` at most. */
  async #request(
    message: (requestId: string) => ClaudeMessage,
    timeout = this.#options.requestTimeout ?? REQUEST_TIMEOUT,
  ): Promise<ProgramMessage> {
    const attached = await this.#attached();
    requestCount += 1;
    const requestId = `claude-${process.pid}-${requestCount}`;
    const answer = await new Promise<ProgramMessage | Error>((resolve) => {
      const timer = setTimeout(() => {
        attached.waiting.delete(requestId);
        resolve(
          new ProgramUnavailableError(
            'Visual Anything did not answer in time; the change may or may not have been made. Read the project again before going on.',
          ),
        );
      }, timeout);
      attached.waiting.set(requestId, (answer) => {
        clearTimeout(timer);
        resolve(answer);
      });
      attached.socket.send(encodeClaudeMessage(message(requestId)));
    });
    if (answer instanceof Error) throw answer;
    return answer;
  }

  /** The attached program, attaching first if needed. */
  #attached(): Promise<Attached> {
    this.#attaching ??= this.#attach().then(
      (attached) => {
        this.#current = attached;
        return attached;
      },
      (error: unknown) => {
        this.#attaching = undefined;
        throw error;
      },
    );
    return this.#attaching;
  }

  async #attach(): Promise<Attached> {
    const found = await this.#findRecord();
    if (found !== undefined) {
      const attached = await this.#connect(found).catch(() => undefined);
      if (attached !== undefined) return attached;
    }
    if (this.#options.attachOnly) {
      throw new NoProgramRunningError('Visual Anything is not running on this project.');
    }
    const folder = this.#options.folder;
    if (folder === undefined) {
      throw new ProgramUnavailableError(
        'Visual Anything is not running, and this MCP server was given no project folder to start it with. Ask the person to start Visual Anything on their project, or to add the project folder to this MCP server’s arguments.',
      );
    }
    return this.#startAndConnect(folder);
  }

  /** The record of a live program for the project, or of the only one running without a folder. */
  async #findRecord(): Promise<ProgramRecord | undefined> {
    const { runtime, folder } = this.#options;
    const live = (record: ProgramRecord | undefined) =>
      record !== undefined && isAlive(record.pid) ? record : undefined;
    let record: ProgramRecord | undefined;
    try {
      if (folder !== undefined) {
        record = live(await readProgramRecord(runtime, await realFolder(folder), this.#context));
      } else {
        const running = (await listProgramRecords(runtime, this.#context)).filter((each) =>
          isAlive(each.pid),
        );
        if (running.length > 1) {
          throw new ProgramUnavailableError(
            `Visual Anything runs on ${running.length} projects (${running.map((each) => each.folder).join(', ')}), and this MCP server was given no project folder to choose one. Add the project folder to its arguments.`,
          );
        }
        record = running[0];
      }
    } catch (error) {
      if (error instanceof ProgramUnavailableError) throw error;
      throw new ProgramUnavailableError(error instanceof Error ? error.message : String(error));
    }
    if (record !== undefined && record.protocolVersion !== PROTOCOL_VERSION) {
      throw new OtherBuildError(
        `The Visual Anything running on ${record.folder} comes from another build (live protocol ${record.protocolVersion}, while this MCP server speaks ${PROTOCOL_VERSION}). Ask the person to restart it.`,
      );
    }
    return record;
  }

  async #startAndConnect(folder: string): Promise<Attached> {
    const real = await realFolder(folder);
    let runtime: string;
    try {
      runtime = await ensureRuntimeFolder(this.#options.runtime, this.#context);
    } catch (error) {
      throw new ProgramUnavailableError(error instanceof Error ? error.message : String(error));
    }
    const log = join(runtime, recordName(real, this.#context.platform).replace(/\.json$/, '.log'));
    const start = this.#options.start ?? defaultStart(this.#options);
    const { exited } = start(real, log);
    let exitCode: number | null | undefined;
    void exited.then((code) => {
      exitCode = code;
    });
    const deadline = Date.now() + (this.#options.startTimeout ?? START_TIMEOUT);
    while (Date.now() < deadline) {
      // A program found first: the one started leaves at once when another runs there (ADR-0044).
      const record = await this.#findRecord().catch(() => undefined);
      if (record !== undefined) {
        const attached = await this.#connect(record).catch(() => undefined);
        if (attached !== undefined) return attached;
      }
      if (exitCode !== undefined) {
        throw new ProgramUnavailableError(
          `Visual Anything could not start on ${toForwardSlashes(real)}:\n${tailOf(log)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, POLL));
    }
    throw new ProgramUnavailableError(
      `Visual Anything did not start on ${toForwardSlashes(real)} in time.${tailOf(log) === '' ? '' : `\n${tailOf(log)}`}`,
    );
  }

  /** Opens the Claude endpoint of a program and waits for the project it sends first. */
  #connect(record: ProgramRecord): Promise<Attached> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${record.port}${CLAUDE_PATH}`, {
        headers: { Authorization: `Bearer ${record.credential}` },
        handshakeTimeout: 5_000,
      });
      let attached: Attached | undefined;
      socket.on('error', (error) => {
        if (attached === undefined) reject(error);
      });
      socket.on('unexpected-response', (_request, response) => {
        reject(new Error(`The Claude endpoint answered ${response.statusCode ?? 'nothing'}.`));
        socket.terminate();
      });
      socket.on('close', () => {
        if (attached === undefined) {
          reject(new Error('The Claude endpoint closed before it sent the project.'));
          return;
        }
        if (this.#current === attached) {
          this.#current = undefined;
          this.#attaching = undefined;
        }
        for (const read of attached.settled.splice(0)) read();
        const waiting = [...attached.waiting.values()];
        attached.waiting.clear();
        for (const answer of waiting) {
          answer(
            new ProgramUnavailableError(
              'The connection to Visual Anything closed before it answered; the change may or may not have been made. Read the project again before going on.',
            ),
          );
        }
      });
      socket.on('message', (data) => {
        let message: ProgramMessage;
        try {
          message = decodeProgramMessage(textOf(data));
        } catch (error) {
          if (!(error instanceof ProtocolError)) throw error;
          socket.close();
          if (attached === undefined) reject(error);
          return;
        }
        if (attached === undefined) {
          if (message.type !== 'project/opened') {
            reject(new Error('The Claude endpoint did not start with the project.'));
            socket.close();
            return;
          }
          attached = {
            socket,
            port: record.port,
            snapshot: message.project,
            waiting: new Map(),
            settled: [],
          };
          resolve(attached);
          return;
        }
        this.#receive(attached, message);
      });
    });
  }

  /**
   * Keeps the copies of the project, and of the proposed project, in step, and answers the request a
   * message answers.
   */
  #receive(attached: Attached, message: ProgramMessage): void {
    switch (message.type) {
      case 'project/changed':
        try {
          attached.snapshot = applyOperations(attached.snapshot, message.operations).state;
        } catch (error) {
          if (!(error instanceof OperationError)) throw error;
          // The copy drifted: the next request attaches again and gets the project anew.
          attached.socket.close();
        }
        // The proposal is shown again, rebased on the change, right after it.
        if (message.operations.length > 0 && attached.proposal !== undefined) {
          delete attached.proposal.proposed;
        }
        break;
      case 'project/reloaded':
        attached.snapshot = message.project;
        if (attached.proposal !== undefined) delete attached.proposal.proposed;
        break;
      case 'proposal/shown':
        try {
          attached.proposal = {
            shown: message.proposal,
            proposed: applyOperations(attached.snapshot, message.proposal.operations).state,
          };
        } catch (error) {
          if (!(error instanceof OperationError)) throw error;
          // The copy drifted: the next request attaches again and gets the proposal anew.
          attached.proposal = { shown: message.proposal };
          attached.socket.close();
        }
        for (const read of attached.settled.splice(0)) read();
        break;
      case 'proposal/closed': {
        delete attached.proposal;
        const { proposal, how, accepted } = message;
        attached.ended = { proposal, how, ...(accepted === undefined ? {} : { accepted }) };
        for (const read of attached.settled.splice(0)) read();
        break;
      }
      default:
        break;
    }

    const requestId = 'requestId' in message ? message.requestId : undefined;
    if (requestId === undefined) return;
    const waiting = attached.waiting.get(requestId);
    attached.waiting.delete(requestId);
    waiting?.(message);
  }
}

/** Starts the program as a background process of the same Node.js, with the loaders this one has. */
function defaultStart(options: BridgeOptions): StartProgram {
  return (folder, log) => {
    const out = openSync(log, 'a', 0o600);
    try {
      const child = spawn(
        process.execPath,
        [
          ...process.execArgv,
          CLI,
          folder,
          '--no-open',
          '--stop-when-idle',
          ...(options.dev ? ['--dev'] : []),
        ],
        {
          detached: true,
          stdio: ['ignore', out, out],
          windowsHide: true,
          env: { ...process.env, [RUNTIME_ENV]: options.runtime },
        },
      );
      const exited = new Promise<number | null>((resolve) => {
        child.once('exit', (code) => resolve(code));
        child.once('error', () => resolve(-1));
      });
      child.unref();
      return { exited };
    } finally {
      closeSync(out);
    }
  };
}

/** The last lines of a log, for saying why a program did not start. */
function tailOf(log: string): string {
  try {
    return readFileSync(log, 'utf8').trimEnd().split('\n').slice(-15).join('\n');
  } catch {
    return '';
  }
}

async function realFolder(folder: string): Promise<string> {
  return toForwardSlashes(await realpath(folder).catch(() => folder));
}

function textOf(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
