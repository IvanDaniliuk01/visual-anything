/**
 * Keeps the tab's stills of explorables told of the program's listener, and answers Claude's stills
 * (ADR 0107, A10.3): rendered inside the shell's providers, whose attribute lookup the data reads.
 */
import { explorablesIn, type ProjectSnapshot } from '@visual-anything/core';
import { useEffect } from 'react';
import { useExplorableCaptureAnswers } from './capture';
import { useExplorableListener } from './hooks';
import { useExplorableSession, type ExplorableSession } from './session';
import { stillsOf } from './stills';

export function ExplorableStillsBridge({ project }: { project: ProjectSnapshot }) {
  const session = useExplorableSession();
  return session ? <Bridge project={project} session={session} /> : null;
}

function Bridge({
  project,
  session,
}: {
  project: ProjectSnapshot;
  session: ExplorableSession;
}): null {
  const stills = stillsOf(session);
  // Asked for only where the project defines an explorable to take stills of.
  const listener = useExplorableListener(explorablesIn(project).explorables.size > 0);
  const known = listener.kind === 'known' ? listener.listener : undefined;
  useEffect(() => stills.setListener(known), [stills, known]);
  useExplorableCaptureAnswers(project, session, stills);
  return null;
}
