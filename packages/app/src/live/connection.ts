/**
 * The live session with the local program, kept outside React: the WebSocket, the project as this tab
 * knows it, the requests waiting for an answer and the notices to show. The local program owns the
 * model (ADR-0016): this tab sends commands, undo and redo, and applies the operations that every
 * change carries to its own copy of the project, whoever made the change.
 */
import {
  OperationError,
  ProtocolError,
  applyOperations,
  decodeServerMessage,
  encodeMessage,
  type AppMessage,
  type Command,
  type CommandRejectedMessage,
  type HistorySummary,
  type Problem,
  type ProjectChangedMessage,
  type ProjectSnapshot,
  type ServerMessage,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** Where the live connection stands. */
export type LiveStatus =
  /** Waiting for the local program to send the project. */
  | 'connecting'
  /** The project is open, and commands can be sent. */
  | 'open'
  /** The connection closed after the project opened; the project is the last one received. */
  | 'closed'
  /** The project could not be opened, or this tab's copy of it can no longer be trusted. */
  | 'failed';

/** Why the live connection failed. */
export type LiveFailureReason =
  /** The tab has no session token, so it cannot connect. */
  | 'no-token'
  /** The connection closed before the project arrived: refused, or nothing is listening. */
  | 'refused'
  /** The local program sent a message this app cannot read or apply. */
  | 'unreadable';

export interface LiveFailure {
  reason: LiveFailureReason;
  /** What exactly went wrong, when there is more to say. */
  detail?: string;
}

/** How much a notice matters: info goes away by itself, warnings and errors stay until dismissed. */
export type NoticeLevel = 'info' | 'warning' | 'error';

/** Something to tell the user that needs no screen of its own. */
export interface Notice {
  /** Unique within the tab. */
  readonly id: number;
  readonly level: NoticeLevel;
  readonly message: string;
}

/** Everything the app knows about the live session at one moment; replaced whole on every change. */
export interface LiveState {
  readonly status: LiveStatus;
  /** Why the connection failed; set exactly when the status is "failed". */
  readonly failure: LiveFailure | undefined;
  /** The project as this tab knows it; absent until the local program sends it. */
  readonly project: ProjectSnapshot | undefined;
  /** What the next undo and redo would do. */
  readonly history: HistorySummary;
  /** The notices to show, oldest first. */
  readonly notices: readonly Notice[];
}

/**
 * A problem with a request: one the local program found, or the connection closing before it
 * answered, in which case the request may or may not have been done.
 */
export interface RequestProblem extends Omit<Problem, 'code'> {
  code: Problem['code'] | 'connection-closed';
}

/** How the local program answered a command, an undo or a redo. */
export type CommandResult =
  | {
      ok: true;
      /** The ids of what the action created. */
      created: Id[];
      /** Rules that only warn, such as relation type limits, that the result breaks. */
      warnings: Problem[];
    }
  | { ok: false; problems: RequestProblem[] };

/** How many notices are shown at most; the oldest make way for newer ones. */
export const MAX_NOTICES = 5;

type RequestKind = 'command' | 'undo' | 'redo';

interface Waiting {
  kind: RequestKind;
  resolve: (result: CommandResult) => void;
}

/** Answers go back to the socket that asked, so request ids only need to be unique in the tab. */
let requestCount = 0;

function nextRequestId(): string {
  requestCount += 1;
  return `request-${requestCount}`;
}

const NOT_CONNECTED = 'Visual Anything is not connected, so nothing was changed.';
const CLOSED_BEFORE_ANSWER = 'The connection to Visual Anything closed before it answered.';
const DRIFTED =
  'This tab’s copy of the project fell out of step with Visual Anything, so it is getting the project again.';

function closedResult(message: string): CommandResult {
  return { ok: false, problems: [{ code: 'connection-closed', message }] };
}

function done(change: ProjectChangedMessage): CommandResult {
  return { ok: true, created: change.created, warnings: change.warnings };
}

function sentences(problems: readonly { message: string }[]): string {
  return problems.map((each) => each.message).join(' ');
}

/**
 * One tab's live session. It connects when asked and does not reconnect by itself, except once when a
 * change does not fit this tab's copy of the project: then it reconnects to get a fresh copy. The
 * methods are bound, so they can be handed around as they are.
 */
export class LiveConnection {
  private readonly url: string | null;
  private state: LiveState;
  private socket: WebSocket | undefined;
  /** Stops listening to the current socket. */
  private release: (() => void) | undefined;
  private readonly waiting = new Map<string, Waiting>();
  private readonly listeners = new Set<() => void>();
  /** Set after reconnecting because the copy drifted, until a change fits the fresh copy. */
  private recovering = false;
  private noticeCount = 0;

  /** `url` is the live connection's, carrying the session token; null when the tab has none. */
  constructor(url: string | null) {
    this.url = url;
    this.state = {
      status: url === null ? 'failed' : 'connecting',
      failure: url === null ? { reason: 'no-token' } : undefined,
      project: undefined,
      history: {},
      notices: [],
    };
  }

  /** Calls `listener` after every change to the state; returns what stops it. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The state now: the same value until something changes. */
  readonly getState = (): LiveState => this.state;

  /**
   * Opens the live connection. Does nothing while one is open, and once the connection has closed or
   * failed: it is never reopened in a loop.
   */
  readonly connect = (): void => {
    if (this.url === null || this.socket !== undefined) return;
    if (this.state.status === 'closed' || this.state.status === 'failed') return;
    this.openSocket(this.url);
    if (this.state.status !== 'connecting') this.update({ status: 'connecting' });
  };

  /** Closes the live connection, answering the requests still waiting. `connect` opens a new one. */
  readonly disconnect = (): void => {
    this.closeSocket();
  };

  /** Sends a command; resolves once the local program has answered it. */
  readonly send = (command: Command): Promise<CommandResult> =>
    this.request('command', (requestId) => ({ type: 'command', requestId, command }));

  /** Undoes the newest action, whoever did it. A refusal is also shown as a notice. */
  readonly undo = (): Promise<CommandResult> =>
    this.request('undo', (requestId) => ({ type: 'undo', requestId }));

  /** Redoes the newest undone action. A refusal is also shown as a notice. */
  readonly redo = (): Promise<CommandResult> =>
    this.request('redo', (requestId) => ({ type: 'redo', requestId }));

  /** Shows a notice. The same message at the same level is shown once, as the newest. */
  readonly notify = (level: NoticeLevel, message: string): void => {
    this.noticeCount += 1;
    const others = this.state.notices.filter(
      (each) => each.level !== level || each.message !== message,
    );
    this.update({
      notices: [...others, { id: this.noticeCount, level, message }].slice(-MAX_NOTICES),
    });
  };

  /** Stops showing a notice. */
  readonly dismiss = (id: number): void => {
    const notices = this.state.notices.filter((each) => each.id !== id);
    if (notices.length !== this.state.notices.length) this.update({ notices });
  };

  private request(
    kind: RequestKind,
    message: (requestId: string) => AppMessage,
  ): Promise<CommandResult> {
    const socket = this.socket;
    if (socket === undefined || this.state.status !== 'open') {
      return Promise.resolve(closedResult(NOT_CONNECTED));
    }
    const requestId = nextRequestId();
    const text = encodeMessage(message(requestId));
    return new Promise((resolve) => {
      this.waiting.set(requestId, { kind, resolve });
      try {
        socket.send(text);
      } catch (error) {
        // A browser refuses to send on a socket that is not open; anything else is a bug.
        if (!(error instanceof DOMException)) throw error;
        this.waiting.delete(requestId);
        resolve(closedResult(NOT_CONNECTED));
      }
    });
  }

  private openSocket(url: string): void {
    const socket = new WebSocket(url);
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      this.receive(data);
    };
    const onClose = () => {
      this.closed();
    };
    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose);
    this.socket = socket;
    this.release = () => {
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', onClose);
    };
  }

  /** Stops listening to the socket and answers the requests waiting on it. */
  private forgetSocket(): WebSocket | undefined {
    const socket = this.socket;
    if (socket === undefined) return undefined;
    this.release?.();
    this.socket = undefined;
    this.release = undefined;
    const waiting = [...this.waiting.values()];
    this.waiting.clear();
    for (const each of waiting) each.resolve(closedResult(CLOSED_BEFORE_ANSWER));
    return socket;
  }

  private closeSocket(): void {
    this.forgetSocket()?.close();
  }

  /** The socket closed without this tab closing it. */
  private closed(): void {
    this.forgetSocket();
    this.update(
      this.state.project === undefined
        ? { status: 'failed', failure: { reason: 'refused' } }
        : { status: 'closed' },
    );
  }

  private fail(reason: LiveFailureReason, detail: string): void {
    this.closeSocket();
    this.update({ status: 'failed', failure: { reason, detail } });
  }

  private receive(data: unknown): void {
    let message: ServerMessage;
    try {
      if (typeof data !== 'string') throw new ProtocolError('The message is not text.');
      message = decodeServerMessage(data);
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      this.fail('unreadable', error.message);
      return;
    }
    switch (message.type) {
      case 'project/opened':
        this.update({ status: 'open', project: message.project, history: message.history });
        break;
      case 'project/changed':
        this.change(message);
        break;
      case 'command/rejected':
        this.rejected(message);
        break;
      case 'project/reloaded':
        this.recovering = false;
        this.update({ status: 'open', project: message.project, history: message.history });
        this.notify('info', `Reloaded the project: ${message.reason}`);
        break;
      case 'notice':
        this.notify(message.level, message.message);
        break;
    }
  }

  private change(message: ProjectChangedMessage): void {
    const project = this.state.project;
    if (project === undefined) {
      this.fail('unreadable', 'Visual Anything sent a change before the project.');
      return;
    }
    const answered = message.requestId === undefined ? undefined : this.take(message.requestId);
    let next: ProjectSnapshot;
    try {
      next = applyOperations(project, message.operations).state;
    } catch (error) {
      // The local program did the action; only this tab's copy is behind.
      answered?.resolve(done(message));
      if (error instanceof OperationError) this.drifted(error);
      else this.fail('unreadable', error instanceof Error ? error.message : String(error));
      return;
    }
    this.recovering = false;
    this.update({ project: next, history: message.history });
    if (answered === undefined) return;
    if (message.warnings.length > 0) this.notify('warning', sentences(message.warnings));
    answered.resolve(done(message));
  }

  /** A change did not fit this tab's copy of the project: get a fresh copy, once. */
  private drifted(error: OperationError): void {
    if (this.recovering || this.url === null) {
      // The fresh copy drifted too, so reconnecting again would only loop.
      this.fail(
        'unreadable',
        `This tab’s copy of the project fell out of step with Visual Anything again: ${error.message}`,
      );
      return;
    }
    this.recovering = true;
    this.closeSocket();
    this.openSocket(this.url);
    this.update({ status: 'connecting' });
    this.notify('warning', DRIFTED);
  }

  private rejected(message: CommandRejectedMessage): void {
    const answered = this.take(message.requestId);
    if (answered === undefined) return;
    if (answered.kind !== 'command') {
      const why = sentences(message.problems);
      this.notify(
        'error',
        why === '' ? `Could not ${answered.kind}.` : `Could not ${answered.kind}: ${why}`,
      );
    }
    answered.resolve({ ok: false, problems: message.problems });
  }

  /** The request with this id, which stops waiting. */
  private take(requestId: string): Waiting | undefined {
    const answered = this.waiting.get(requestId);
    this.waiting.delete(requestId);
    return answered;
  }

  private update(change: Partial<LiveState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of [...this.listeners]) listener();
  }
}
