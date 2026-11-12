/**
 * Which videos play (ADR 0098, stage 2), shared between the canvases that draw them and the
 * inspector's Play and Stop: each canvas says which of its videos play, and takes the inspector's
 * asking to play or stop one it shows. The step a scenario or a tour shows asks for its videos here
 * too (stage 4), and every canvas plays those it draws.
 */
import type { Id } from '@visual-anything/schema';
import { useSyncExternalStore } from 'react';

const playingBy = new Map<object, ReadonlySet<Id>>();
const listeners = new Set<() => void>();
const togglers = new Set<(id: Id) => void>();
const NONE: ReadonlySet<Id> = new Set();
let stepVideos: ReadonlySet<Id> = NONE;
const stepTakers = new Set<(ids: ReadonlySet<Id>) => void>();

/** Says which videos a canvas plays now; an empty set when it plays none or goes. */
export function reportPlaying(canvas: object, ids: ReadonlySet<Id>): void {
  if (ids.size === 0) playingBy.delete(canvas);
  else playingBy.set(canvas, new Set(ids));
  for (const listener of listeners) listener();
}

/** Whether any canvas plays a video. */
export function isVideoPlaying(id: Id): boolean {
  for (const ids of playingBy.values()) if (ids.has(id)) return true;
  return false;
}

/** Takes the asking to play or stop a video; answers how to stop taking it. */
export function onToggleVideo(toggle: (id: Id) => void): () => void {
  togglers.add(toggle);
  return () => togglers.delete(toggle);
}

/** Asks the canvases that show a video to play it, or to stop it if it plays. */
export function toggleVideo(id: Id): void {
  for (const toggle of togglers) toggle(id);
}

/**
 * Asks every canvas to play these videos, those of the step shown now, and to stop those the step
 * before asked for (ADR 0098, stage 4); an empty set when no step asks for any.
 */
export function playStepVideos(ids: ReadonlySet<Id>): void {
  if (ids.size === stepVideos.size && [...ids].every((id) => stepVideos.has(id))) return;
  stepVideos = ids.size === 0 ? NONE : new Set(ids);
  for (const take of stepTakers) take(stepVideos);
}

/** Takes the step's videos, those asked for now first; answers how to stop taking them. */
export function onStepVideos(take: (ids: ReadonlySet<Id>) => void): () => void {
  stepTakers.add(take);
  if (stepVideos.size > 0) take(stepVideos);
  return () => stepTakers.delete(take);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether a video plays, kept current. */
export function useVideoPlaying(id: Id): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isVideoPlaying(id),
    () => false,
  );
}
