/**
 * Commands on tours (ADR 0058): create, change and delete one, each one action. Changing a tour's
 * steps replaces the whole list, so that adding, editing, duplicating, reordering and deleting steps
 * are each one action too. A new or changed step must name only what the project holds; a step kept
 * exactly as it was may still name what was deleted since, and stays, flagged, until it is fixed.
 */
import type { Id, TourCaption, TourFile, TourPlayback, TourStep } from '@visual-anything/schema';
import { isId, slug } from '../ids';
import {
  MAX_CAPTION_TEXT,
  MAX_CAPTION_TITLE,
  MAX_SPEAKER_NOTES,
  MAX_TOUR_DESCRIPTION,
  MAX_TOUR_MARKS,
  MAX_TOUR_NAME,
  MAX_TOUR_STEPS,
  MAX_TOUR_TEXT,
  checkSavedViewState,
  tourStepProblems,
  tourTextLength,
} from '../tours/steps';
import {
  Rejection,
  compact,
  reject,
  requireList,
  requireName,
  sameJson,
  type Draft,
} from './draft';
import type { CreateTourCommand, DeleteTourCommand, NewTourStep, UpdateTourCommand } from './types';

export function createTour(draft: Draft, command: CreateTourCommand): string {
  const { tour } = command;
  if (typeof tour !== 'object' || tour === null) {
    reject('invalid-command', 'A tour is an object with a name.');
  }
  const name = checkedName(tour.name);
  const id = draft.idFor(tour.id, slug(name, 'tour'));
  const created: TourFile = compact({
    id,
    name,
    description: checkedDescription(tour.description),
    steps: checkedSteps(draft, requireList(tour.steps, 'steps'), []),
  });
  checkTextLength(created, undefined);
  draft.apply({
    op: 'insert',
    collection: { name: 'tours' },
    index: draft.state.tours.length,
    item: created,
  });
  draft.created.push(id);
  return `Create the tour "${name}"`;
}

export function updateTour(draft: Draft, command: UpdateTourCommand): string {
  const current = draft.tour(command.id);
  const { changes } = command;
  if (typeof changes !== 'object' || changes === null) {
    reject('invalid-command', 'The changes to a tour are an object.');
  }
  const next: TourFile = { ...current };
  if (changes.name !== undefined) next.name = checkedName(changes.name);
  if (changes.description === null) delete next.description;
  else if (changes.description !== undefined) {
    const description = checkedDescription(changes.description);
    if (description === undefined) delete next.description;
    else next.description = description;
  }
  if (changes.steps !== undefined) {
    next.steps = checkedSteps(draft, requireList(changes.steps, 'steps'), current.steps);
  }
  if (sameJson(next, current)) return `Edit the tour "${current.name}"`;
  checkTextLength(next, current);
  draft.apply({ op: 'replace', collection: { name: 'tours' }, item: next });
  return labelOf(current, next);
}

export function deleteTour(draft: Draft, command: DeleteTourCommand): string {
  const tour = draft.tour(command.id);
  draft.apply({ op: 'remove', collection: { name: 'tours' }, key: tour.id });
  return `Delete the tour "${tour.name}"`;
}

/**
 * Refuses a tour whose text would pass {@link MAX_TOUR_TEXT}. A tour kept longer than the commands
 * make one can still be changed, so long as it grows no longer.
 */
function checkTextLength(next: TourFile, before: TourFile | undefined): void {
  const length = tourTextLength(next);
  if (length <= MAX_TOUR_TEXT) return;
  if (before !== undefined && length <= tourTextLength(before)) return;
  reject(
    'invalid-command',
    `The tour would hold more than ${MAX_TOUR_TEXT.toLocaleString('en-US')} characters of text, in its name, description, captions and speaker notes: put the rest of its steps in another tour.`,
  );
}

/** How the history names a change to a tour: by what happened to its steps, when only that did. */
function labelOf(before: TourFile, after: TourFile): string {
  const name = after.name;
  const sameProperties = before.name === after.name && before.description === after.description;
  if (!sameProperties) return `Edit the tour "${name}"`;
  const was = before.steps.map((step) => step.id);
  const is = after.steps.map((step) => step.id);
  const kept = (ids: readonly Id[], from: readonly TourStep[]) =>
    ids.every((id) => {
      const old = before.steps.find((step) => step.id === id);
      const now = from.find((step) => step.id === id);
      return old !== undefined && now !== undefined && sameJson(old, now);
    });
  if (is.length === was.length + 1 && kept(was, after.steps) && withOneMore(was, is)) {
    return `Add a step to the tour "${name}"`;
  }
  if (is.length + 1 === was.length && kept(is, after.steps) && withOneMore(is, was)) {
    return `Delete a step of the tour "${name}"`;
  }
  if (
    is.length === was.length &&
    is.some((id, at) => id !== was[at]) &&
    new Set([...is, ...was]).size === is.length &&
    kept(is, after.steps)
  ) {
    return `Reorder the steps of the tour "${name}"`;
  }
  return `Edit the tour "${name}"`;
}

/** Whether `longer` is `shorter` with one id put in somewhere, the others in their order. */
function withOneMore(shorter: readonly Id[], longer: readonly Id[]): boolean {
  let skipped = 0;
  for (let at = 0, other = 0; at < longer.length; at++) {
    if (longer[at] === shorter[other]) other++;
    else skipped++;
  }
  return skipped === 1;
}

function checkedName(name: unknown): string {
  const checked = requireName(name, 'A tour');
  if (checked.length > MAX_TOUR_NAME) {
    reject('invalid-command', `A tour's name holds at most ${MAX_TOUR_NAME} characters.`);
  }
  return checked;
}

function checkedDescription(description: unknown): string | undefined {
  if (description === undefined) return undefined;
  if (typeof description !== 'string') reject('invalid-command', 'A description is text.');
  if (description.length > MAX_TOUR_DESCRIPTION) {
    reject(
      'invalid-command',
      `A tour's description holds at most ${MAX_TOUR_DESCRIPTION} characters.`,
    );
  }
  return description === '' ? undefined : description;
}

/**
 * Checks the steps of a tour: at most {@link MAX_TOUR_STEPS}, each id once in the tour. A step whose id
 * names a step of the tour as it was, and which is that step exactly, is kept as it was, whatever it
 * names; every other step must name only what the project holds now.
 */
function checkedSteps(
  draft: Draft,
  steps: readonly NewTourStep[],
  before: readonly TourStep[],
): TourStep[] {
  if (steps.length > MAX_TOUR_STEPS) {
    reject('invalid-command', `A tour holds at most ${MAX_TOUR_STEPS} steps.`);
  }
  const previous = new Map(before.map((step) => [step.id, step]));
  const ids = new Set<Id>();
  return steps.map((given, position) => {
    const n = position + 1;
    if (typeof given !== 'object' || given === null || Array.isArray(given)) {
      reject('invalid-command', `Step ${n} of the tour is not a step.`);
    }
    if (given.id !== undefined && !isId(given.id)) {
      reject('invalid-id', `"${String(given.id)}" is not a valid id.`);
    }
    if (given.id !== undefined && ids.has(given.id)) {
      reject(
        'id-taken',
        `Step ${n} of the tour takes the id "${given.id}", which an earlier step has.`,
        [given.id],
      );
    }
    const id = given.id ?? draft.newId('step', (each) => ids.has(each) || previous.has(each));
    ids.add(id);
    // A step given back exactly as the tour keeps it stays, whatever it names now.
    const kept = previous.get(id);
    if (kept !== undefined && sameJson(kept, { ...given, id })) return kept;
    const made: TourStep = { id, ...checkedStep(given, n) };
    if (kept !== undefined && sameJson(normalized(kept, n), made)) return kept;
    const [problem] = tourStepProblems(draft.state, made);
    if (problem !== undefined) {
      reject(problem.code, `Step ${n} of the tour: ${problem.message}`, [problem.subject]);
    }
    return made;
  });
}

/** A step as the tour keeps it, in the form a command's step is checked into; none when it is not one. */
function normalized(step: TourStep, n: number): TourStep | undefined {
  try {
    return { id: step.id, ...checkedStep(step, n) };
  } catch (error) {
    if (error instanceof Rejection) return undefined;
    throw error;
  }
}

/** A step's own parts, checked and in the form the file keeps; throws a rejection. */
function checkedStep(given: NewTourStep, n: number): Omit<TourStep, 'id'> {
  const where = `Step ${n} of the tour`;
  const viewState = checkSavedViewState(given.viewState);
  if (!viewState.ok) reject('invalid-command', `${where}: ${viewState.message}`);
  const caption = checkedCaption(given.caption, where);
  const marks = checkedMarks(given.marks, where);
  const play = checkedPlay(given.play, where);
  const notes = checkedText(given.notes, MAX_SPEAKER_NOTES, {
    notText: 'Speaker notes are text.',
    tooLong: `Speaker notes hold at most ${MAX_SPEAKER_NOTES} characters.`,
  });
  return compact({ viewState: viewState.state, caption, marks, play, notes });
}

function checkedCaption(value: unknown, where: string): TourCaption {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('invalid-command', `${where} needs a caption with a title.`);
  }
  const { title, text, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    reject('invalid-command', `A caption holds a title and a text, nothing else.`);
  }
  if (typeof title !== 'string' || title.trim() === '') {
    reject('empty-name', `${where} needs a caption with a title.`);
  }
  if (title.length > MAX_CAPTION_TITLE) {
    reject('invalid-command', `A caption's title holds at most ${MAX_CAPTION_TITLE} characters.`);
  }
  const checked = checkedText(text, MAX_CAPTION_TEXT, {
    notText: "A caption's text is text.",
    tooLong: `A caption's text holds at most ${MAX_CAPTION_TEXT} characters.`,
  });
  return checked === undefined ? { title } : { title, text: checked };
}

/** A text of at most `max` characters, left out when empty. */
function checkedText(
  value: unknown,
  max: number,
  refusals: { notText: string; tooLong: string },
): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') reject('invalid-command', refusals.notText);
  if (value.length > max) reject('invalid-command', refusals.tooLong);
  return value;
}

function checkedMarks(value: unknown, where: string): Id[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) reject('invalid-command', `${where} marks a list of ids.`);
  if (value.length === 0) return undefined;
  if (value.length > MAX_TOUR_MARKS) {
    reject('invalid-command', `A step marks at most ${MAX_TOUR_MARKS} elements and relations.`);
  }
  const seen = new Set<Id>();
  for (const id of value) {
    if (!isId(id)) reject('invalid-id', `"${String(id)}" is not a valid id.`);
    if (seen.has(id)) reject('invalid-command', `${where} marks "${id}" twice.`);
    seen.add(id);
  }
  return [...seen];
}

function checkedPlay(value: unknown, where: string): TourPlayback | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('invalid-command', `${where} plays a scenario: an object with its id.`);
  }
  const { scenario, from, to, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    reject('invalid-command', 'A step plays a scenario, from a step to a step, nothing else.');
  }
  for (const id of [scenario, from, to]) {
    if (id !== undefined && !isId(id)) {
      reject('invalid-id', `"${typeof id === 'string' ? id : typeof id}" is not a valid id.`);
    }
  }
  if (scenario === undefined)
    reject('invalid-command', `${where} plays a scenario: an object with its id.`);
  return compact({
    scenario: scenario as Id,
    from: from as Id | undefined,
    to: to as Id | undefined,
  });
}
