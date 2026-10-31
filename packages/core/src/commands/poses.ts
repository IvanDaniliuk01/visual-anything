/**
 * `set-poses` (ADR 0076): the poses of several elements set as one action, as a gesture in the
 * physical-space panel ends. Each pose is checked as `update-element` checks one.
 */
import type { Element, Id, Pose } from '@visual-anything/schema';
import { checkedPose } from '../space/pose';
import { count, reject, requireList, type Draft } from './draft';
import { poseLabel } from './model';
import type { SetPosesCommand } from './types';

export function setPoses(draft: Draft, command: SetPosesCommand): string {
  const poses = requireList(command.poses, 'poses');
  if (poses.length === 0) reject('invalid-command', 'No elements were given to pose.');
  const worldId = draft.index.world.id;
  const seen = new Set<Id>();
  const changed: Element[] = [];
  for (const { element: id, pose } of poses) {
    if (id === worldId) {
      reject(
        'world-not-allowed',
        'World is where physical space is measured from; it has no pose.',
        [id],
      );
    }
    const current = draft.element(id);
    if (seen.has(id)) reject('invalid-command', `"${current.name}" is given twice.`, [id]);
    seen.add(id);
    const next: Element = { ...current };
    if (pose === null) delete next.pose;
    else next.pose = checkedPose(pose, current, draft.index);
    if (!samePose(current.pose, next.pose)) changed.push(next);
  }
  for (const next of changed) {
    draft.apply({ op: 'replace', collection: { name: 'elements' }, item: next });
  }
  const [only] = poses;
  if (poses.length === 1 && only !== undefined) {
    return poseLabel(draft.element(only.element).name, only.pose);
  }
  if (poses.every((each) => each.pose === null)) {
    return `Take ${count(poses.length, 'element')} out of physical space`;
  }
  return `Pose ${count(poses.length, 'element')}`;
}

function samePose(a: Pose | undefined, b: Pose | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const sameRotation =
    a.rotation === undefined || b.rotation === undefined
      ? a.rotation === b.rotation
      : (['x', 'y', 'z', 'w'] as const).every((key) => a.rotation?.[key] === b.rotation?.[key]);
  return (
    a.in === b.in && a.at.x === b.at.x && a.at.y === b.at.y && a.at.z === b.at.z && sameRotation
  );
}
