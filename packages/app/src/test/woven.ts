import type { ProjectSnapshot } from '@visual-anything/core';
import { RELATES_TO_ID } from '@visual-anything/schema';

/**
 * The sample with relations between relations woven in `rounds` rounds after the first, three in
 * each: in round 0, a triangle of relations between the Patient, the Booking agent and the Reminder
 * service; in each round after it, a, b and c from a, b and c of the round before to b, c and a of it.
 */
export function withWovenRelations(project: ProjectSnapshot, rounds: number): ProjectSnapshot {
  const first = {
    a: ['patient', 'booking-agent'],
    b: ['booking-agent', 'reminder-service'],
    c: ['reminder-service', 'patient'],
  } as const;
  const next = { a: 'b', b: 'c', c: 'a' } as const;
  const woven = [];
  for (let round = 0; round <= rounds; round++) {
    for (const side of ['a', 'b', 'c'] as const) {
      woven.push({
        id: `weave-${side}-${round}`,
        relationType: RELATES_TO_ID,
        from: round === 0 ? first[side][0] : `weave-${side}-${round - 1}`,
        to: round === 0 ? first[side][1] : `weave-${next[side]}-${round - 1}`,
      });
    }
  }
  return {
    ...project,
    model: { ...project.model, relations: [...project.model.relations, ...woven] },
  };
}
