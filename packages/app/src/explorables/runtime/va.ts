/**
 * The `va` runtime, version 1 (ADR 0107): the script the frame builder puts first in every
 * explorable's frame, before its script libraries and its own text. It is bundled into one plain
 * script with no imports (`bundle.ts`), kept as `va-runtime.generated.ts`, and served by the local
 * program's listener; it runs under the frame's policy, so it never compiles a string into code.
 *
 * It waits for the app's `va/hello`, posted by the frame's parent on `load` with one
 * `MessageChannel` port, and from then on hears only that port. Every message it hears is checked by
 * the core's `readHostMessage`, and one that fails the check is dropped whole. It gives the page:
 *
 * - `va.data`, the data of what shows the explorable, and `va.on('change', data => …)`, which gives
 *   the whole data again when any of it changes, at most once a frame;
 * - `va.ready()`, which says the page has drawn; `va.select(id)`, which selects one of the elements
 *   it received on the canvas; and `va.onStill(fn)`, which lets a page draw again just before its
 *   still picture is taken;
 * - the theme's colors, as CSS variables `--va-text`, `--va-surface`, `--va-accent` and the rest of
 *   the app's own, set on the root element, so that a page that uses them changes theme by itself.
 *
 * It answers the watchdog's pings, takes still pictures when asked (`still.ts`), and sends the page's
 * errors: those thrown, those of promises nobody caught, what the frame's policy blocked, and what
 * the page writes with `console.error`; at most 50, each cut to 2,000 characters.
 */
import {
  MAX_CONSOLE_ERRORS,
  MAX_FRAME_ERROR,
  MAX_STILL_BYTES,
  VA_API,
  readHostMessage,
  type FrameMessage,
  type VaData,
} from '@visual-anything/core';
import { THEMES } from '../../theme/themes';
import { takeStill } from './still';

/** What a page calls to hear of changes. */
export type VaListener = (data: VaData) => void;

/** The `va` object a page reads, as `window.va`. */
export interface Va {
  readonly api: 1;
  /** The data of what shows the explorable; undefined until the app sends it. */
  readonly data: VaData | undefined;
  /** Hears every change of the data, at most once a frame; returns what stops hearing it. */
  on(kind: 'change', listener: VaListener): () => void;
  /** Says the page has drawn. */
  ready(): void;
  /** Selects on the canvas one of the elements the page received. */
  select(id: string): void;
  /** Runs before each still picture is taken, so that a page can draw again; it may return a promise. */
  onStill(hook: () => unknown): void;
}

/** What the runtime uses of the frame's window: the window itself, or a stand-in in tests. */
export interface VaWindow {
  readonly parent: unknown;
  readonly document: Document;
  readonly console: Pick<Console, 'error'>;
  addEventListener(type: string, listener: (event: never) => void): void;
  setTimeout(callback: () => void, delay: number): unknown;
  requestAnimationFrame?: (callback: () => void) => unknown;
}

/** The theme's colors as the CSS variables a page reads: `--va-` and each color's name in kebab case. */
export function themeVariables(theme: 'light' | 'dark'): [string, string][] {
  return Object.entries(THEMES[theme].shell.colors).map(([name, color]) => [
    `--va-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
    color.toLowerCase(),
  ]);
}

/** How long one still hook may take before the picture is taken anyway. */
const HOOK_WAIT_MS = 1_000;
/** How long the picture waits for the page's fonts: Firefox may never settle them (ADR 0107). */
const FONTS_WAIT_MS = 2_000;
/** How long a change waits for a frame before it is given anyway, as in a frame not drawn. */
const FRAME_FALLBACK_MS = 100;

function describe(value: unknown): string {
  // Its name and message only: a stack names the frame's address.
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function waitAtMost(promise: unknown, ms: number, win: VaWindow): Promise<void> {
  return new Promise((resolve) => {
    win.setTimeout(resolve, ms);
    Promise.resolve(promise).then(
      () => resolve(),
      () => resolve(),
    );
  });
}

/**
 * Starts the runtime in a window: defines `window.va`, sets the theme's variables, and waits for the
 * app's hello. Returns the `va` it defined.
 */
export function startVa(win: VaWindow & object): Va {
  let port: MessagePort | undefined;
  let data: VaData | undefined;
  let theme: 'light' | 'dark' | undefined;
  let readyAsked = false;
  let readySent = false;
  let errors = 0;
  let taking = false;
  let scheduled = false;
  const early: string[] = [];
  const listeners = new Set<VaListener>();
  const hooks: (() => unknown)[] = [];
  const ids = new Set<string>();

  const post = (message: FrameMessage, transfer: Transferable[] = []): void => {
    try {
      port?.postMessage(message, transfer);
    } catch {
      // A message the port cannot carry is dropped, as the app would drop it.
    }
  };

  const report = (text: string): void => {
    if (errors >= MAX_CONSOLE_ERRORS) return;
    errors += 1;
    const message = (text.trim() || 'An error without a message.').slice(0, MAX_FRAME_ERROR);
    if (port) post({ kind: 'va/error', message });
    else early.push(message);
  };

  const applyTheme = (next: 'light' | 'dark'): void => {
    if (next === theme) return;
    theme = next;
    const style = win.document.documentElement.style;
    for (const [name, value] of themeVariables(next)) style.setProperty(name, value);
    style.setProperty('color-scheme', next);
  };

  const give = (listener: VaListener): void => {
    if (data === undefined) return;
    try {
      listener(data);
    } catch (error) {
      report(describe(error));
    }
  };

  const giveAll = (): void => {
    for (const listener of [...listeners]) give(listener);
  };

  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      if (!scheduled) return;
      scheduled = false;
      giveAll();
    };
    win.requestAnimationFrame?.(run);
    win.setTimeout(run, FRAME_FALLBACK_MS);
  };

  const take = (next: VaData): void => {
    data = next;
    ids.clear();
    if (next.element) ids.add(next.element.id);
    for (const each of next.contents ?? []) ids.add(each.id);
    for (const each of next.relations ?? []) ids.add(each.other.id);
    applyTheme(next.theme);
  };

  const still = async (width: number): Promise<void> => {
    if (taking) return;
    taking = true;
    try {
      const fonts = (win.document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
      await waitAtMost(fonts?.ready, FONTS_WAIT_MS, win);
      for (const hook of hooks) {
        try {
          await waitAtMost(hook(), HOOK_WAIT_MS, win);
        } catch (error) {
          report(describe(error));
        }
      }
      const png = await takeStill(win.document, width);
      if (png.byteLength > MAX_STILL_BYTES) {
        report('The still picture came to more than 1 MiB, so it was not sent.');
        return;
      }
      post({ kind: 'va/still', width, png }, [png.buffer]);
    } catch (error) {
      report(`The still picture could not be taken: ${describe(error)}`);
    } finally {
      taking = false;
    }
  };

  const hear = (event: MessageEvent): void => {
    const message = readHostMessage(event.data);
    if (!message) return;
    switch (message.kind) {
      case 'va/ping':
        post({ kind: 'va/pong', at: message.at });
        return;
      case 'va/data':
        take(message.data);
        schedule();
        return;
      case 'va/still':
        void still(message.width);
        return;
      case 'va/hello':
        return;
    }
  };

  const va: Va = Object.freeze({
    api: VA_API,
    get data() {
      return data;
    },
    on(kind: 'change', listener: VaListener) {
      if (kind !== 'change' || typeof listener !== 'function') {
        report('va.on takes "change" and a function.');
        return () => {};
      }
      listeners.add(listener);
      // A page that listens once the data came hears it at once, and only that listener does.
      if (data !== undefined) win.setTimeout(() => listeners.has(listener) && give(listener), 0);
      return () => {
        listeners.delete(listener);
      };
    },
    ready() {
      readyAsked = true;
      if (port && !readySent) {
        readySent = true;
        post({ kind: 'va/ready' });
      }
    },
    select(id: string) {
      if (typeof id !== 'string' || !ids.has(id)) {
        report('va.select takes the id of an element the page received in va.data.');
        return;
      }
      post({ kind: 'va/select', id });
    },
    onStill(hook: () => unknown) {
      if (typeof hook === 'function') hooks.push(hook);
    },
  });

  applyTheme('light');
  win.addEventListener('message', (event: MessageEvent) => {
    if (port !== undefined || event.source !== win.parent || event.ports.length !== 1) return;
    const hello = readHostMessage(event.data);
    if (hello?.kind !== 'va/hello') return;
    port = event.ports[0];
    if (!port) return;
    port.onmessage = hear;
    for (const message of early.splice(0)) post({ kind: 'va/error', message });
    take(hello.data);
    giveAll();
    if (readyAsked && !readySent) {
      readySent = true;
      post({ kind: 'va/ready' });
    }
  });
  win.addEventListener('error', (event: ErrorEvent) => {
    report(event.error === undefined ? event.message : describe(event.error));
  });
  win.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    report(`A promise was rejected and nothing caught it: ${describe(event.reason)}`);
  });
  win.addEventListener('securitypolicyviolation', (event: SecurityPolicyViolationEvent) => {
    const what = event.sample
      ? `: ${event.sample}`
      : event.blockedURI
        ? `: ${event.blockedURI}`
        : '';
    report(
      `The frame's policy blocked ${event.effectiveDirective || event.violatedDirective}${what}`,
    );
  });
  const original = win.console.error.bind(win.console);
  win.console.error = (...args: unknown[]) => {
    report(args.map(describe).join(' '));
    original(...args);
  };
  return va;
}
