/**
 * A step's pulse on the canvas (ADR 0084): once the step's transition is over, the travelling marker
 * of scenario playback runs along each relation of its chain in turn, 600 ms each, with its fading
 * trail, as many times as the pulse repeats; then it goes. Under reduced motion no marker moves: the
 * chain's relations are marked in order, 400 ms apart, and stay marked while the step shows.
 */
import { pulseTimes, type PulseLeg } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Marker } from '../editor/emphasis';
import { MARKER_TRAIL_TIME } from '../scenarios/emphasis';

/** The emphasis source a pulse shows through. */
export const PULSE_EMPHASIS = 'tour-pulse';

/** What a pulse shows at a moment: its marker, the relations it has marked, and whether it is over. */
export interface PulseFrame {
  markers: Marker[];
  marked: Id[];
  done: boolean;
}

/** Where a pulse is `elapsed` milliseconds after it started. */
export function pulseFrame(
  legs: readonly PulseLeg[],
  repeat: number,
  elapsed: number,
  reduced: boolean,
): PulseFrame {
  const { perRelation, total } = pulseTimes(legs.length, reduced ? 1 : repeat, reduced);
  if (legs.length === 0) return { markers: [], marked: [], done: true };
  if (reduced) {
    const count = Math.min(legs.length, Math.floor(Math.max(0, elapsed) / perRelation) + 1);
    return {
      markers: [],
      marked: legs.slice(0, count).map((leg) => leg.relation),
      done: count === legs.length,
    };
  }
  if (!(elapsed < total)) return { markers: [], marked: [], done: true };
  const at = Math.max(0, elapsed);
  const round = perRelation * legs.length;
  const within = at % round;
  const index = Math.min(legs.length - 1, Math.floor(within / perRelation));
  const leg = legs[index] as PulseLeg;
  const legStart = at - (within - index * perRelation);
  const part = (at - legStart) / perRelation;
  const trailPart = Math.max(0, at - MARKER_TRAIL_TIME - legStart) / perRelation;
  const along = (value: number) => (leg.forward ? value : 1 - value);
  return {
    markers: [
      {
        relation: leg.relation,
        progress: along(part),
        ...(trailPart < part ? { trail: along(trailPart) } : {}),
      },
    ],
    marked: [],
    done: false,
  };
}
