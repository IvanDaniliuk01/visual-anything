/**
 * What a scenario's or a tour's step lists of its view's pictures, videos and link cards (ADR 0098,
 * stage 4), as a command gives it: checked for its shape here; whether the view holds them is
 * checked by the scenario's and the tour's commands, which keep a step's lists exactly as they were
 * even when they name what was deleted since.
 */
import type { Id } from '@visual-anything/schema';
import { isId } from '../ids';
import { MAX_STEP_PLAYING, MAX_STEP_SHOWS } from '../media/steps';
import { reject } from './draft';

/** A step's two lists, each left out when empty; throws a rejection when they are not lists of ids. */
export function checkedStepPictures(
  given: { shows?: unknown; playing?: unknown },
  where: string,
): { shows?: Id[]; playing?: Id[] } {
  const shows = idList(given.shows, where, 'shows', MAX_STEP_SHOWS);
  const playing = idList(given.playing, where, 'plays', MAX_STEP_PLAYING);
  for (const id of playing ?? []) {
    if (!(shows ?? []).includes(id)) {
      reject(
        'invalid-command',
        `${where} plays only videos it shows, and it does not show "${id}".`,
        [id],
      );
    }
  }
  return { ...(shows ? { shows } : {}), ...(playing ? { playing } : {}) };
}

function idList(value: unknown, where: string, verb: string, most: number): Id[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) reject('invalid-command', `${where} ${verb} a list of ids.`);
  if (value.length === 0) return undefined;
  if (value.length > most) reject('invalid-command', `A step ${verb} at most ${most} of them.`);
  const seen = new Set<Id>();
  for (const id of value) {
    if (!isId(id)) reject('invalid-id', `"${String(id)}" is not a valid id.`);
    if (seen.has(id)) reject('invalid-command', `${where} ${verb} "${id}" twice.`, [id]);
    seen.add(id);
  }
  return [...seen];
}
