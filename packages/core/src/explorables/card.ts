/**
 * An explorable's card (ADR 0107): what shows in its place when it does not run, drawn from data
 * alone, alike on the canvas, in the explorable panel, in the SVG, the PDF, the read-only page and
 * the command line's exports: its name, what it explains, the script libraries it asks for, and why
 * it is not running, or, on the canvas, how to explore it. The sentences are English; the app reads
 * each in the language it reads in. Pure: nothing here runs it.
 */
import type { Id } from '@visual-anything/schema';
import type { ProjectSnapshot } from '../snapshot';
import { approvalHashOf, isApproved } from './approvals';
import { explorableTextOf, explorablesIn } from './catalog';
import type { ExplorableApproval } from './types';

/**
 * How the app stopped a frame of it (ADR 0107): it stopped answering (`silent`), it left its page
 * (`left`), it never answered (`never-answered`), or it was running when the tab stopped answering
 * (`hung`).
 */
export type ExplorableStop = 'silent' | 'left' | 'never-answered' | 'hung';

/**
 * Why a card shows rather than the explorable or its still, or, for `explore`, that it may run:
 * - `unknown`: no package the project uses defines it;
 * - `no-text`: its file in `explorables/` is missing, or past 512 KiB;
 * - `library-missing`: its package does not define a script library it names;
 * - `not-approved`: the person has not approved what would run;
 * - an `ExplorableStop`: the app stopped it, and it waits for the person to run it again;
 * - `starting`, `not-connected`, `no-app`: in the app, whose local program it waits for, cannot
 *   reach, or does not have;
 * - `outside-app`: nothing keeps it from running, but it runs only in the app, and no still of it
 *   was had here, as in the command line's exports and the read-only page;
 * - `explore`: in the app, it may run: its card says how.
 */
export type ExplorableCardReason =
  | 'unknown'
  | 'no-text'
  | 'library-missing'
  | 'not-approved'
  | ExplorableStop
  | 'starting'
  | 'not-connected'
  | 'no-app'
  | 'outside-app'
  | 'explore';

/** What a card says, each sentence an English template whose `{id}` is the library missing. */
export const EXPLORABLE_CARD_WHY: Readonly<Record<ExplorableCardReason, string>> = {
  unknown: 'Not running: no package of the project defines it.',
  'no-text': 'Not running: its file in explorables/ is missing, or past 512 KiB.',
  'library-missing': 'Not running: its package does not define the script library “{id}”.',
  'not-approved': 'Not approved yet: Approve to run.',
  silent: 'Stopped: it stopped answering.',
  left: 'Stopped: it left its page, so it no longer gets the data.',
  'never-answered':
    'Stopped: it did not start. Its file may have changed since; run it again to try.',
  hung: 'Stopped: it was running when this tab stopped answering, so it waits for you to run it again.',
  starting: 'Starting…',
  'not-connected': 'Not running: Visual Anything is not connected.',
  'no-app': 'Not running here.',
  'outside-app': 'It runs only in the Visual Anything app, which shows it live.',
  explore: 'Double-click to explore.',
};

/** How a card says the script libraries it asks for, `{names}` joined with commas. */
export const EXPLORABLE_CARD_LIBRARIES = 'Script libraries: {names}';

/**
 * Where a card is drawn, which says what keeps an explorable from running past the project and the
 * approvals: outside the app (an export, the read-only page, the command line), or in the app, with
 * what its watchdog stopped, by approval hash, and whether its local program's listener is known
 * (`ready`), asked for (`starting`) or out of reach (`not-connected`), or the app runs none (`none`).
 */
export type ExplorableCardPlace =
  | { kind: 'outside' }
  | {
      kind: 'app';
      stopped?: (hash: string) => ExplorableStop | undefined;
      runner: 'ready' | 'starting' | 'not-connected' | 'none';
    };

/** An explorable's card, as data. */
export interface ExplorableCard {
  explorable: Id;
  /** Its name; its id when no package defines it. */
  name: string;
  /** What it explains, when it says. */
  description?: string;
  /** Each script library it asks for, as `npm version`, or its id when its package does not define it. */
  libraries: string[];
  reason: ExplorableCardReason;
  /** The script library missing, for `library-missing`. */
  library?: Id;
  /** The hash an approval of it is given for, once its package defines each of its script libraries. */
  hash?: string;
}

/**
 * The card of an explorable of the project. What keeps it from running is said in this order: the
 * project's (its definition, its text, its script libraries), then the approvals when known, then
 * the place's.
 */
export function explorableCard(
  state: ProjectSnapshot,
  id: Id,
  options: { approvals?: readonly ExplorableApproval[]; place?: ExplorableCardPlace } = {},
): ExplorableCard {
  const catalog = explorablesIn(state);
  const defined = catalog.explorable(id);
  if (!defined) return { explorable: id, name: id, libraries: [], reason: 'unknown' };
  const { definition } = defined;
  // An explorable uses only its own package's script libraries.
  const libraries = (definition.scriptLibraries ?? []).map((library) => {
    const found = catalog.scriptLibrary(library);
    return {
      id: library,
      definition: found?.package === defined.package ? found.definition : undefined,
    };
  });
  const missing = libraries.find((each) => each.definition === undefined);
  const hash = missing
    ? undefined
    : approvalHashOf(
        definition.hash,
        libraries.map((each) => each.definition?.hash ?? ''),
      );
  const card: ExplorableCard = {
    explorable: id,
    name: definition.name,
    ...(definition.description !== undefined && definition.description.trim() !== ''
      ? { description: definition.description }
      : {}),
    libraries: libraries.map((each) =>
      each.definition ? `${each.definition.npm} ${each.definition.version}` : each.id,
    ),
    reason: 'outside-app',
    ...(hash === undefined ? {} : { hash }),
  };
  if (explorableTextOf(state, id) === undefined) return { ...card, reason: 'no-text' };
  if (missing || hash === undefined) {
    return { ...card, reason: 'library-missing', library: missing?.id ?? id };
  }
  if (options.approvals !== undefined && !isApproved(options.approvals, hash)) {
    return { ...card, reason: 'not-approved' };
  }
  const place = options.place ?? { kind: 'outside' };
  if (place.kind === 'outside') return card;
  const stop = place.stopped?.(hash);
  if (stop !== undefined) return { ...card, reason: stop };
  return {
    ...card,
    reason:
      place.runner === 'ready' ? 'explore' : place.runner === 'none' ? 'no-app' : place.runner,
  };
}

/** Whether a card's explorable may run where it is drawn, so that stills of it may be taken. */
export function cardRuns(card: ExplorableCard): boolean {
  return card.reason === 'explore';
}
