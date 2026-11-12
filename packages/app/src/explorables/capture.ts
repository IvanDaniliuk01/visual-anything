/**
 * The app's side of Claude's `capture_explorable` (ADR 0107, A10.3): while the shell shows a project,
 * it lends the live session what takes a still of one of its explorables in the tab's hidden frame,
 * with the element, the parameters, the theme and the width asked for, and answers with the PNG,
 * cleaned, its console errors and whether it said `va.ready()`; or why it took none: not approved,
 * stopped by its watchdog, or failed. The still is taken before any the canvas waits for, sized as
 * the width asked for, three quarters as tall, and kept with the canvas's stills.
 */
import {
  explorableData,
  isStillBucket,
  stillKey,
  type ExplorableCaptureAsk,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { useContext, useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { LiveContext, type ExplorableCaptureOutcome } from '../live/context';
import { useAttributeLookup } from '../live-values/context';
import { usePreferences } from '../theme/usePreferences';
import { blockOf, explorableOf } from './explorable';
import { useExplorableApprovals } from './hooks';
import type { ExplorableSession } from './session';
import { stillBase64, type ExplorableStills } from './stills';

/** What answering a still needs, read when it is asked for. */
export interface CaptureInputs {
  project: ProjectSnapshot;
  approvals: Parameters<typeof blockOf>[1];
  session: ExplorableSession;
  stills: ExplorableStills;
  theme: 'light' | 'dark';
  language: 'en' | 'es';
  sources: Parameters<typeof explorableData>[1]['sources'];
}

/** Takes a still of an explorable for Claude, or says why it took none. */
export async function captureExplorable(
  ask: ExplorableCaptureAsk,
  inputs: CaptureInputs,
): Promise<ExplorableCaptureOutcome> {
  const { project, approvals, session, stills } = inputs;
  const shown = explorableOf(project, ask.explorable);
  if (!shown) return { failed: 'failed', why: 'No package of the project defines it.' };
  const block = blockOf(shown, approvals);
  if (block?.kind === 'not-approved') return { failed: 'not-approved' };
  if (block?.kind === 'no-text') {
    return { failed: 'failed', why: 'Its file in explorables/ is missing, or past 512 KiB.' };
  }
  const hash = shown.hash;
  if (block || hash === undefined) {
    return { failed: 'failed', why: 'Its package does not define every script library it uses.' };
  }
  if (session.stopped(hash) !== undefined) return { failed: 'stopped' };
  if (!isStillBucket(ask.width))
    return { failed: 'failed', why: 'A still is 256, 512 or 1,024 pixels wide.' };
  const data = explorableData(project, {
    explorable: ask.explorable,
    ...(ask.element === undefined ? {} : { element: ask.element }),
    ...(ask.parameters === undefined ? {} : { parameters: ask.parameters }),
    theme: ask.theme ?? inputs.theme,
    language: inputs.language,
    size: { width: ask.width, height: Math.round((ask.width * 3) / 4) },
    ...(inputs.sources === undefined ? {} : { sources: inputs.sources }),
  });
  const job = stills.job({
    key: stillKey(hash, data, ask.width),
    explorable: ask.explorable,
    hash,
    data,
    width: ask.width,
    distance: 0,
  });
  if (!job)
    return { failed: 'failed', why: 'The program’s explorables’ listener is not known yet.' };
  const kept = await stills.queue.ask(job);
  if (!kept.ok) {
    return kept.why === 'stopped'
      ? { failed: 'stopped', errors: kept.errors }
      : { failed: 'failed', why: kept.message.slice(0, 500), errors: kept.errors };
  }
  return {
    still: { png: stillBase64(kept), width: kept.width, height: kept.height },
    errors: kept.errors,
    ready: kept.ready,
  };
}

/** Lends the live session what answers Claude's stills, with the project and the tab as they are. */
export function useExplorableCaptureAnswers(
  project: ProjectSnapshot,
  session: ExplorableSession,
  stills: ExplorableStills,
): void {
  const live = useContext(LiveContext);
  const lend = live?.lendExplorableCapture;
  const { approvals } = useExplorableApprovals();
  const { theme } = usePreferences();
  const language = useT().language;
  const lookup = useAttributeLookup();
  const latest = useRef<CaptureInputs | undefined>(undefined);
  useEffect(() => {
    latest.current = {
      project,
      approvals,
      session,
      stills,
      theme,
      language,
      sources: (id) => ({
        computed: lookup.computedOf(id),
        live: lookup.liveOf(id),
        simulated: lookup.simulatedOf(id),
      }),
    };
  });
  useEffect(() => {
    if (!lend) return;
    return lend((ask) => {
      const inputs = latest.current;
      return inputs
        ? captureExplorable(ask, inputs)
        : Promise.resolve({ failed: 'failed', why: 'The tab shows no project yet.' });
    });
  }, [lend]);
}
