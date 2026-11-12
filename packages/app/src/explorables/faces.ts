/**
 * What the canvas draws of each explorable the project defines (ADR 0107, A10.3): its card's words,
 * from the core's one card (`explorableCard`), and whether stills of it may be taken: its text is
 * held, its script libraries are defined, the person approved it as it is, nothing stopped it, and
 * the program's listener is known. An explorable that may run says how to explore it; one that may
 * not says why, as the explorable panel's card does.
 */
import {
  cardRuns,
  explorableCard,
  explorablesIn,
  type ExplorableApproval,
  type ExplorableCardPlace,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Translator } from '../i18n';
import { explorableCardTexts, type ExplorableFace } from './card-layout';
import type { ListenerState } from './hooks';
import type { ExplorableSession } from './session';

/** Where the canvas of a tab draws cards: in the app, with its session and its listener. */
export function placeInApp(
  session: ExplorableSession | null,
  listener: ListenerState,
): ExplorableCardPlace {
  return {
    kind: 'app',
    stopped: (hash) => session?.stopped(hash),
    runner: !session
      ? 'none'
      : listener.kind === 'known'
        ? 'ready'
        : listener.kind === 'asking'
          ? 'starting'
          : 'not-connected',
  };
}

/** The faces of every explorable the project's packages define, by id. */
export function explorableFaces(
  project: ProjectSnapshot,
  approvals: readonly ExplorableApproval[],
  session: ExplorableSession | null,
  listener: ListenerState,
  t: Translator,
): ReadonlyMap<Id, ExplorableFace> {
  const faces = new Map<Id, ExplorableFace>();
  const place = placeInApp(session, listener);
  for (const id of explorablesIn(project).explorables.keys()) {
    const card = explorableCard(project, id, { approvals, place });
    const runs = cardRuns(card);
    faces.set(id, {
      ...explorableCardTexts(t, card),
      runs,
      ...(runs && card.hash !== undefined ? { hash: card.hash } : {}),
    });
  }
  return faces;
}
