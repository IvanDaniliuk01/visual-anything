/**
 * What components read of explorables (ADR 0107): the person's approvals and how to give or take one
 * back, kept as a preference beside package code's (ADR 0060); the program's listener, asked for
 * once a connection; and `va.data`, built by the core from the project and the attribute lookup, so
 * that computed, live and simulated values read as everywhere else.
 */
import {
  explorableData,
  withExplorableApproval,
  withoutExplorableApproval,
  type ExplorableApproval,
  type ProjectSnapshot,
  type VaData,
} from '@visual-anything/core';
import type { ExplorableParameterValue, Id } from '@visual-anything/schema';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import { LiveContext } from '../live/context';
import { useAttributeLookup } from '../live-values/context';
import { usePreferences } from '../theme/usePreferences';
import type { FrameListener } from './frame-address';

/** The person's approvals of explorables, newest first, and how to change them. */
export function useExplorableApprovals(): {
  approvals: readonly ExplorableApproval[];
  approve: (hash: string, explorable: Id) => void;
  revoke: (hash: string) => void;
} {
  const { preferences, change } = usePreferences();
  const approvals = preferences.explorableApprovals;
  const approve = useCallback(
    (hash: string, explorable: Id) =>
      change({ explorableApprovals: withExplorableApproval(approvals, hash, explorable) }),
    [approvals, change],
  );
  const revoke = useCallback(
    (hash: string) => change({ explorableApprovals: withoutExplorableApproval(approvals, hash) }),
    [approvals, change],
  );
  return { approvals, approve, revoke };
}

/** What the listener is: known, still being asked for, or none to be had. */
export type ListenerState =
  { kind: 'known'; listener: FrameListener } | { kind: 'asking' } | { kind: 'none'; why: string };

/** The answers of each connection's program, asked for once while it stays open. */
const asked = new WeakMap<object, Promise<ListenerState>>();

/**
 * The program's explorables' listener: its port and the session's nonce, asked for with
 * `explorables/listen` once a connection, and again once the connection opens again. With `wanted`
 * false, as where the project defines no explorable, it is not asked for.
 */
export function useExplorableListener(wanted = true): ListenerState {
  const live = useContext(LiveContext);
  const listen = wanted ? live?.listenExplorables : undefined;
  const open = live?.status === 'open';
  const [state, setState] = useState<{ listen: unknown; value: ListenerState }>();
  useEffect(() => {
    if (!listen) return;
    if (!open) {
      asked.delete(listen);
      return;
    }
    let answer = asked.get(listen);
    if (!answer) {
      answer = listen().then((result): ListenerState =>
        result.ok
          ? { kind: 'known', listener: { port: result.answer.port, nonce: result.answer.nonce } }
          : { kind: 'none', why: result.problems.map((each) => each.message).join(' ') },
      );
      asked.set(listen, answer);
    }
    let current = true;
    void answer.then((value) => {
      if (current) setState({ listen, value });
    });
    return () => {
      current = false;
    };
  }, [listen, open]);
  if (!listen) return { kind: 'none', why: 'Visual Anything is not connected.' };
  if (!open) return { kind: 'asking' };
  return state?.listen === listen ? state.value : { kind: 'asking' };
}

/** What a frame's `va.data` is made of besides the project. */
export interface ExplorableDataInput {
  explorable: Id;
  element?: Id | undefined;
  parameters?: Record<string, ExplorableParameterValue> | undefined;
  size: { width: number; height: number };
  step?: VaData['step'] | undefined;
}

/** `va.data` for a frame, made again only when what it is made of changes. */
export function useExplorableData(project: ProjectSnapshot, input: ExplorableDataInput): VaData {
  const lookup = useAttributeLookup();
  const { theme } = usePreferences();
  const language = useT().language;
  const { explorable, element, parameters, size, step } = input;
  const { width, height } = size;
  return useMemo(
    () =>
      explorableData(project, {
        explorable,
        ...(element === undefined ? {} : { element }),
        ...(parameters === undefined ? {} : { parameters }),
        theme,
        language,
        size: { width, height },
        ...(step === undefined ? {} : { step }),
        sources: (id) => ({
          computed: lookup.computedOf(id),
          live: lookup.liveOf(id),
          simulated: lookup.simulatedOf(id),
        }),
      }),
    [project, explorable, element, parameters, theme, language, width, height, step, lookup],
  );
}
