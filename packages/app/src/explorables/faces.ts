/**
 * What the canvas draws of each explorable the project defines (ADR 0107, A10.3): its card's words,
 * from the project alone, and whether stills of it may be taken: its text is held, its script
 * libraries are defined, the person approved it as it is, nothing stopped it, and the program's
 * listener is known. An explorable that may run says how to explore it; one that may not says why,
 * as the explorable panel's card does.
 */
import {
  explorablesIn,
  type ExplorableApproval,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { ExplorableFace } from '../canvas/explorables/card';
import type { useT } from '../i18n';
import { blockOf, explorableOf } from './explorable';
import type { CardReason } from './ExplorableView';
import { reasonText } from './reasons';
import type { ListenerState } from './hooks';
import type { ExplorableSession } from './session';

/** A face, with the approval hash stills of it are taken under while it may run. */
export interface CanvasFace extends ExplorableFace {
  hash?: string;
}

/** The faces of every explorable the project's packages define, by id. */
export function explorableFaces(
  project: ProjectSnapshot,
  approvals: readonly ExplorableApproval[],
  session: ExplorableSession | null,
  listener: ListenerState,
  t: ReturnType<typeof useT>,
): ReadonlyMap<Id, CanvasFace> {
  const faces = new Map<Id, CanvasFace>();
  for (const id of explorablesIn(project).explorables.keys()) {
    const shown = explorableOf(project, id);
    if (!shown) continue;
    const block = blockOf(shown, approvals);
    const hash = shown.hash;
    const stop = hash === undefined ? undefined : session?.stopped(hash);
    const why: CardReason | undefined =
      block?.kind ??
      stop ??
      (!session
        ? 'no-app'
        : listener.kind === 'known'
          ? undefined
          : listener.kind === 'asking'
            ? 'starting'
            : 'not-connected');
    const libraries = shown.libraries.map((each) =>
      each.definition ? `${each.definition.npm} ${each.definition.version}` : each.id,
    );
    const { definition } = shown;
    faces.set(id, {
      name: definition.name,
      ...(definition.description === undefined ? {} : { description: definition.description }),
      libraries,
      why:
        why === undefined
          ? t('Double-click to explore.')
          : reasonText(t, why, block?.kind === 'library-missing' ? block.library : undefined),
      runs: why === undefined,
      ...(why === undefined && hash !== undefined ? { hash } : {}),
    });
  }
  return faces;
}
