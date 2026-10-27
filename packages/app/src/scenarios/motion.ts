/**
 * Whether motion is reduced and whether tours fade (ADR 0077): the person's Motion and Fades
 * preferences (ADR 0032) where the shell gives them, and otherwise, as in the read-only page, the
 * system's setting with fades on. The system's setting is followed as it changes.
 */
import { reducedMotionOf, type MotionChoice } from '@visual-anything/core';
import { createContext, useContext, useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function query(): MediaQueryList | undefined {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : undefined;
}

function subscribe(listener: () => void): () => void {
  const list = query();
  list?.addEventListener('change', listener);
  return () => list?.removeEventListener('change', listener);
}

function reduced(): boolean {
  return query()?.matches ?? false;
}

/** True while the system asks for reduced motion, whatever the person chose. */
export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reduced, () => false);
}

/** How the person chose that tours and scenario playback move. */
export interface MotionPreference {
  motion: MotionChoice;
  fades: boolean;
}

/** The person's Motion and Fades, which the shell gives; none outside it. */
export const MotionContext = createContext<MotionPreference | undefined>(undefined);

/** How things move now: whether motion is reduced, and whether tours fade. */
export interface Motion {
  reduced: boolean;
  fades: boolean;
}

/** How things move now, as the person chose and the system says. */
export function useMotion(): Motion {
  const chosen = useContext(MotionContext);
  const system = useSystemReducedMotion();
  return {
    reduced: reducedMotionOf(chosen?.motion ?? 'system', system),
    fades: chosen?.fades ?? true,
  };
}

/** True while motion is reduced: then nothing travels during playback. */
export function useReducedMotion(): boolean {
  return useMotion().reduced;
}
