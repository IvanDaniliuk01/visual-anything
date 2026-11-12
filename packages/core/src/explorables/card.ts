/**
 * An explorable's card (ADR 0107): what shows in its place when it does not run, drawn from data
 * alone, alike on the canvas, in the SVG, the PDF, the read-only page and the command line's exports:
 * its name, what it explains, the script libraries it asks for, and why it is not running. The
 * sentences are English; the app reads each in the language it reads in. Pure: nothing here runs it.
 */
import type { Id } from '@visual-anything/schema';
import type { ProjectSnapshot } from '../snapshot';
import { approvalHashOf, isApproved } from './approvals';
import { explorableTextOf, explorablesIn } from './catalog';
import type { ExplorableApproval } from './types';

/**
 * Why a card shows rather than the explorable or its still, from the project, and the approvals
 * when known:
 * - `unknown`: no package the project uses defines it;
 * - `no-text`: its file in `explorables/` is missing, or past 512 KiB;
 * - `library-missing`: its package does not define a script library it names;
 * - `not-approved`: the person has not approved what would run;
 * - `outside-app`: nothing keeps it from running, but it runs only in the app, and no still of it
 *   was had here, as in the command line's exports.
 */
export type ExplorableCardReason =
  'unknown' | 'no-text' | 'library-missing' | 'not-approved' | 'outside-app';

/** What a card says, each sentence an English template whose `{id}` is the library missing. */
export const EXPLORABLE_CARD_WHY: Readonly<Record<ExplorableCardReason, string>> = {
  unknown: 'Not running: no package of the project defines it.',
  'no-text': 'Not running: its file in explorables/ is missing, or past 512 KiB.',
  'library-missing': 'Not running: its package does not define the script library “{id}”.',
  'not-approved': 'Not approved yet: Approve to run.',
  'outside-app': 'It runs only in the Visual Anything app, which shows it live.',
};

/** How a card says the script libraries it asks for, `{names}` joined with commas. */
export const EXPLORABLE_CARD_LIBRARIES = 'Script libraries: {names}';

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
}

/** The card of an explorable of the project. */
export function explorableCard(
  state: ProjectSnapshot,
  id: Id,
  options: { approvals?: readonly ExplorableApproval[] } = {},
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
  };
  if (explorableTextOf(state, id) === undefined) return { ...card, reason: 'no-text' };
  const missing = libraries.find((each) => each.definition === undefined);
  if (missing) return { ...card, reason: 'library-missing', library: missing.id };
  if (options.approvals !== undefined) {
    const hash = approvalHashOf(
      definition.hash,
      libraries.map((each) => each.definition?.hash ?? ''),
    );
    if (!isApproved(options.approvals, hash)) return { ...card, reason: 'not-approved' };
  }
  return card;
}
