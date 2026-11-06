/**
 * Which of a browser's tabs of the app the person used last (ADR 0029's clarification of
 * 2026-10-26). Guidance goes to every open app, but guidance that would show the tab another view,
 * or play a tour full screen, applies only in the tab the person used last, which a tab Claude has
 * just opened is; the other tabs stay where the person left them.
 *
 * A tab counts as used when it opens while it shows, when it comes to the front, and at each press,
 * key or turn of the wheel in it. The tabs of one origin, which is one program and so one project,
 * say so to each other over a `BroadcastChannel` of their own, which carries nothing but a random id
 * for each tab and a time; each tab repeats it every few seconds, and one not heard from for a while
 * is taken to be gone. Without the channel, as in a browser that has none, a tab is taken to be the
 * only one.
 */
import type { Id } from '@visual-anything/schema';
import type { SessionChannel } from '../live/share';

/** The channel's name; one origin is one program, so the name needs nothing of the project's. */
export const TABS_CHANNEL = 'visual-anything.tabs';

/** How often a tab says again when it was used, and after how long a tab not heard from is gone. */
export const TAB_HEARTBEAT = 10_000;
export const TAB_GONE_AFTER = 3 * TAB_HEARTBEAT;

/** What the tabs say on the channel. */
type TabMessage =
  | { type: 'tab/hello'; tab: string; at: number }
  | { type: 'tab/used'; tab: string; at: number }
  | { type: 'tab/gone'; tab: string };

/** Which tab the person used last, as this tab knows it. */
export interface TabUse {
  /** Says the person used this tab now. */
  used(): void;
  /** Whether no other open tab of the app was used after this one. */
  isLastUsed(): boolean;
  /** Says the other tabs this one is gone, and stops. */
  dispose(): void;
}

interface Options {
  /** This origin's channel for the tabs, or none. */
  channel: SessionChannel | undefined;
  /** Whether the tab shows now, so that one opened behind another does not count as used. */
  shown: boolean;
  now?: () => number;
  /** Starts and stops the repeat; tests give their own. */
  every?: (call: () => void, ms: number) => () => void;
}

/** Keeps track of which tab the person used last, through `channel`. */
export function trackTabUse({ channel, shown, now = Date.now, every = repeat }: Options): TabUse {
  const tab = randomId();
  let at = shown ? now() : 0;
  const others = new Map<string, { at: number; heard: number }>();
  const post = (message: TabMessage) => channel?.postMessage(message);
  const listener = (event: MessageEvent) => {
    const message = readMessage(event.data);
    if (!message || message.tab === tab) return;
    if (message.type === 'tab/gone') {
      others.delete(message.tab);
      return;
    }
    others.set(message.tab, { at: message.at, heard: now() });
    // A tab that has just opened learns when each of the others was used.
    if (message.type === 'tab/hello') post({ type: 'tab/used', tab, at });
  };
  channel?.addEventListener('message', listener);
  post({ type: 'tab/hello', tab, at });
  const stop = channel ? every(() => post({ type: 'tab/used', tab, at }), TAB_HEARTBEAT) : () => {};
  return {
    used() {
      at = Math.max(at, now());
      post({ type: 'tab/used', tab, at });
    },
    isLastUsed() {
      const time = now();
      for (const [other, seen] of others) {
        if (time - seen.heard > TAB_GONE_AFTER) {
          others.delete(other);
          continue;
        }
        if (seen.at > at || (seen.at === at && other < tab)) return false;
      }
      return true;
    },
    dispose() {
      stop();
      post({ type: 'tab/gone', tab });
      channel?.removeEventListener('message', listener);
      channel?.close();
    },
  };
}

let shared: TabUse | undefined;

/**
 * This window's tracker, started the first time it is asked for: it counts presses, keys, the wheel
 * and coming to the front as using the tab, and says it is gone when the page goes.
 */
export function tabUse(): TabUse {
  if (shared) return shared;
  const target = typeof window === 'undefined' ? undefined : window;
  const tracker = trackTabUse({
    channel:
      typeof BroadcastChannel === 'function' ? new BroadcastChannel(TABS_CHANNEL) : undefined,
    shown: target?.document.visibilityState !== 'hidden',
  });
  shared = tracker;
  if (target) {
    // Gathered for a moment, so that a drag or a held key says it once.
    let quiet = 0;
    const used = () => {
      const time = Date.now();
      if (time - quiet < 500) return;
      quiet = time;
      tracker.used();
    };
    for (const type of ['pointerdown', 'keydown', 'wheel'] as const) {
      target.addEventListener(type, used, { capture: true, passive: true });
    }
    target.addEventListener('focus', used);
    target.document.addEventListener('visibilitychange', () => {
      if (target.document.visibilityState === 'visible') used();
    });
    target.addEventListener('pagehide', () => tracker.dispose());
  }
  return tracker;
}

/** Replaces this window's tracker, for tests; undefined starts a new one when next asked for. */
export function setTabUseForTests(tracker: TabUse | undefined): void {
  shared = tracker;
}

const decided = new WeakMap<object, boolean>();

/** What says which views this tab's panes show (ADR 0102), each shell's while it is mounted. */
const shownViews = new Set<() => readonly (Id | undefined)[]>();

/**
 * Says which views this tab shows besides the open one, as the panes of a split view do (ADR 0102):
 * guidance for one of them applies here, where a pane shows it already. Returns what stops it.
 */
export function showsViews(views: () => readonly (Id | undefined)[]): () => void {
  shownViews.add(views);
  return () => {
    shownViews.delete(views);
  };
}

/** Whether a pane of this tab shows the view. */
function shownHere(view: Id): boolean {
  for (const views of shownViews) if (views().includes(view)) return true;
  return false;
}

/**
 * Whether a guidance request applies in this tab, decided the first time it is asked and kept: one
 * whose view, `view` or else the one it names, is none or the view open then applies where it is;
 * one for a view another of the tab's panes shows applies here too, and makes that pane active (ADR
 * 0102); one for another view applies only in the tab the person used last, which opens that view
 * for it. The other tabs pass it over, then and later, so that it never applies once the person
 * opens that view by hand.
 */
export function forThisTab(
  request: { request: number; view?: Id | undefined },
  openView: Id | undefined,
  view: Id | undefined = request.view,
): boolean {
  let applies = decided.get(request);
  if (applies === undefined) {
    applies = view === undefined || view === openView || shownHere(view) || tabUse().isLastUsed();
    decided.set(request, applies);
  }
  return applies;
}

/**
 * Whether guidance that takes the tab full screen, as a tour does, applies in this tab: only in the
 * tab the person used last, decided the first time it is asked and kept.
 */
export function inTheTabUsedLast(request: object): boolean {
  let applies = decided.get(request);
  if (applies === undefined) {
    applies = tabUse().isLastUsed();
    decided.set(request, applies);
  }
  return applies;
}

/** A message on the channel, read strictly; anything else is passed over. */
function readMessage(data: unknown): TabMessage | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const { type, tab, at } = data as Record<string, unknown>;
  if (typeof tab !== 'string' || tab === '' || tab.length > 64) return undefined;
  if (type === 'tab/gone') return { type, tab };
  if ((type === 'tab/hello' || type === 'tab/used') && typeof at === 'number' && at >= 0) {
    return { type, tab, at };
  }
  return undefined;
}

function repeat(call: () => void, ms: number): () => void {
  const timer = setInterval(call, ms);
  return () => clearInterval(timer);
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
