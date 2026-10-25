/**
 * What a project's threads may not be, as read from its files (ADR 0059): two threads with one id,
 * or two comments of a thread with one id. A thread whose anchor is gone is no problem: it is kept,
 * detached, and listed apart.
 */
import type { Id } from '@visual-anything/schema';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';

export function threadErrors(state: ProjectSnapshot): Problem[] {
  const errors = repeated(
    state.comments.map((thread) => thread.id),
    (id) => `More than one thread has the id "${id}".`,
  );
  for (const thread of state.comments) {
    errors.push(
      ...repeated(
        thread.comments.map((comment) => comment.id),
        (id) => `More than one comment in the thread "${thread.id}" has the id "${id}".`,
        [thread.id],
      ),
    );
  }
  return errors;
}

function repeated(
  ids: readonly Id[],
  message: (id: Id) => string,
  subjects?: readonly Id[],
): Problem[] {
  const seen = new Set<Id>();
  const reported = new Set<Id>();
  const problems: Problem[] = [];
  for (const id of ids) {
    if (seen.has(id) && !reported.has(id)) {
      reported.add(id);
      problems.push(problem('id-taken', message(id), subjects ?? [id]));
    }
    seen.add(id);
  }
  return problems;
}
