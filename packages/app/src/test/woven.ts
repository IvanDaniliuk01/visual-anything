import type { ProjectSnapshot } from '@visual-anything/core';
import { RELATES_TO_ID } from '@visual-anything/schema';

/**
 * The sample with relations between relations woven `depth` levels high, three at each level: at the
 * bottom, a triangle of relations between the Patient, the Booking agent and the Reminder service;
 * above, a, b and c of each level from a, b and c of the level below to b, c and a of it.
 */
export function withWovenRelations(project: ProjectSnapshot, depth: number): ProjectSnapshot {
  const bottom = {
    a: ['patient', 'booking-agent'],
    b: ['booking-agent', 'reminder-service'],
    c: ['reminder-service', 'patient'],
  } as const;
  const next = { a: 'b', b: 'c', c: 'a' } as const;
  const woven = [];
  for (let level = 0; level <= depth; level++) {
    for (const side of ['a', 'b', 'c'] as const) {
      woven.push({
        id: `weave-${side}-${level}`,
        relationType: RELATES_TO_ID,
        from: level === 0 ? bottom[side][0] : `weave-${side}-${level - 1}`,
        to: level === 0 ? bottom[side][1] : `weave-${next[side]}-${level - 1}`,
      });
    }
  }
  return {
    ...project,
    model: { ...project.model, relations: [...project.model.relations, ...woven] },
  };
}
