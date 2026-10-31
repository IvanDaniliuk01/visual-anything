/**
 * The sample `my-systems` with conflicts a merge left in its model file (ADR 0072), for the Changes
 * tab's tests: the WhatsApp channel renamed on both sides, and the reminder service removed on theirs
 * while ours changed it, so that taking the other choice deletes it with the relations on it.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { FileConflict } from '@visual-anything/schema';
import { loadSample } from './sample';

export const RENAMED: FileConflict = {
  id: 'conflict-1',
  item: 'element:whatsapp',
  path: ['name'],
  why: 'both-changed',
  kept: 'ours',
  other: 'WhatsApp Business',
  base: 'WhatsApp',
  sides: { ours: 'main', theirs: 'feature/sms' },
};

export const REMOVED: FileConflict = {
  id: 'conflict-2',
  item: 'element:reminder-service',
  path: [],
  why: 'removed-and-changed',
  kept: 'ours',
  sides: { ours: 'main', theirs: 'feature/sms' },
};

/** The sample with these conflicts in its model file. */
export function conflictedSample(
  conflicts: readonly FileConflict[] = [RENAMED, REMOVED],
): ProjectSnapshot {
  const project = loadSample();
  return { ...project, model: { ...project.model, conflicts: [...conflicts] } };
}
