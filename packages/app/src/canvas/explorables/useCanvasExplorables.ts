/**
 * Gives a canvas what it draws of explorables (ADR 0107, A10.3): each explorable's face, from the
 * project, the person's approvals, what the watchdog stopped and the program's listener, and the
 * stills the tab keeps, keyed by the data each spot gives in the theme and language shown.
 */
import type { Id } from '@visual-anything/schema';
import { useEffect, useMemo, useState } from 'react';
import { explorablesIn, type ProjectSnapshot } from '@visual-anything/core';
import { explorableFaces } from '../../explorables/faces';
import { useExplorableApprovals, useExplorableListener } from '../../explorables/hooks';
import { useExplorableSession } from '../../explorables/session';
import { useExplorableStills } from '../../explorables/stills';
import { useT } from '../../i18n';
import { useAttributeLookup } from '../../live-values/context';
import type { CanvasRenderer } from '../renderer';
import { CanvasExplorables } from './provider';

export function useCanvasExplorables(
  renderer: () => CanvasRenderer | undefined,
  project: ProjectSnapshot,
  theme: 'light' | 'dark',
): CanvasExplorables {
  const t = useT();
  const stills = useExplorableStills();
  const session = useExplorableSession();
  const { approvals } = useExplorableApprovals();
  const listener = useExplorableListener(explorablesIn(project).explorables.size > 0);
  const lookup = useAttributeLookup();
  const [provider] = useState(() => new CanvasExplorables(stills ?? undefined));
  const version = session?.snapshot().version ?? 0;
  const faces = useMemo(
    () => explorableFaces(project, approvals, session, listener, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the session changes in place; its version says when
    [project, approvals, session, version, listener, t],
  );
  useEffect(() => {
    provider.update({
      project,
      faces,
      theme,
      language: t.language,
      sources: (id: Id) => ({
        computed: lookup.computedOf(id),
        live: lookup.liveOf(id),
        simulated: lookup.simulatedOf(id),
      }),
    });
    renderer()?.explorablesChanged();
  }, [provider, project, faces, theme, t, lookup, renderer]);
  useEffect(() => {
    const drawn = renderer();
    drawn?.setExplorables(provider);
    return () => drawn?.setExplorables(undefined);
  }, [provider, renderer]);
  // A still that arrives is drawn at the next frame.
  useEffect(() => stills?.subscribe(() => renderer()?.explorablesChanged()), [stills, renderer]);
  return provider;
}
