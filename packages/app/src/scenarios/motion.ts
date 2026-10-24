/** Whether the system asks for reduced motion, followed as it changes. */
import { useSyncExternalStore } from 'react';

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

/** True while the system asks for reduced motion: then nothing travels during playback. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reduced, () => false);
}
