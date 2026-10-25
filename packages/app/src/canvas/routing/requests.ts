/**
 * Edit the route… from outside the canvas, as the inspector offers it: the canvas listens, gives the
 * relation the keys and takes the focus.
 */
import type { Id } from '@visual-anything/schema';

type Listener = (relation: Id) => void;

const listeners = new Set<Listener>();

/** Asks the canvas to let the keys edit a relation's route. */
export function requestRouteEditing(relation: Id): void {
  for (const listener of listeners) listener(relation);
}

/** Listens for requests to edit a route from the keys; returns what stops it. */
export function onRouteEditingRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
