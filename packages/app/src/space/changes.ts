/**
 * What the physical-space panel sends the solid worker as what it shows changes (ADR 0076): only the
 * parts that changed, so that the worker draws only when something does.
 */
import type { SpaceChange, SpaceShown } from '../solids/protocol';

/** The parts of what a space shows that changed, by identity; none when nothing did. */
export function changeOf(before: SpaceShown, after: SpaceShown): SpaceChange | undefined {
  const change: SpaceChange = {};
  if (before.size.width !== after.size.width || before.size.height !== after.size.height) {
    change.size = after.size;
  }
  if (before.entries !== after.entries) change.entries = after.entries;
  if (before.states !== after.states) change.states = after.states;
  if (before.camera !== after.camera) change.camera = after.camera ?? null;
  if (before.cut !== after.cut) change.cut = after.cut ?? null;
  if (before.explode !== after.explode) change.explode = after.explode ?? 0;
  if (before.names !== after.names) change.names = after.names ?? false;
  if (before.lines !== after.lines) change.lines = after.lines ?? [];
  return Object.keys(change).length === 0 ? undefined : change;
}
