/**
 * Commands on tours (ADR 0058, ADR 0077): create, change and delete one, each one action. Changing a tour's
 * steps replaces the whole list, so that adding, editing, duplicating, reordering and deleting steps
 * are each one action too. A new or changed step must name only what the project holds; a step kept
 * exactly as it was may still name what was deleted since, and stays, flagged, until it is fixed.
 */
import type {
  CaptionFace,
  CaptionLeader,
  CaptionSize,
  DecisionChoices,
  Id,
  TourAdvance,
  TourCaption,
  TourFile,
  TourPlayback,
  TourPulse,
  TourReveal,
  TourStep,
} from '@visual-anything/schema';
import { isId, slug } from '../ids';
import {
  MAX_CAPTION_TEXT,
  MAX_CAPTION_TITLE,
  MAX_SPEAKER_NOTES,
  MAX_TOUR_DESCRIPTION,
  MAX_TOUR_MARKS,
  MAX_TOUR_NAME,
  MAX_TOUR_REVEALS,
  MAX_TOUR_STEPS,
  MAX_TOUR_TEXT,
  TOUR_ADVANCE,
  checkSavedViewState,
  tourStepProblems,
  tourTextLength,
} from '../tours/steps';
import { MAX_PULSE_RELATIONS, PULSE_REPEAT } from '../tours/pulse';
import { MAX_VIEW_STATE_CHOICES } from '../view-state';
import {
  Rejection,
  compact,
  reject,
  requireList,
  requireName,
  sameJson,
  type Draft,
} from './draft';
import { checkedFace } from './traits';
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
    captionFace: checkedCaptionFace(tour.captionFace),
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
  if (changes.captionFace === null) delete next.captionFace;
  else if (changes.captionFace !== undefined) {
    next.captionFace = checkedCaptionFace(changes.captionFace);
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
  const reveal = checkedReveals(given.reveal, where, marks ?? []);
  const dimRest = checkedDimRest(given.dimRest);
  const advance = checkedAdvance(given.advance, where, play !== undefined);
  const transition = checkedTransition(given.transition);
  const pulse = checkedPulse(given.pulse, where);
  const notes = checkedText(given.notes, MAX_SPEAKER_NOTES, {
    notText: 'Speaker notes are text.',
    tooLong: `Speaker notes hold at most ${MAX_SPEAKER_NOTES} characters.`,
  });
  return compact({
    viewState: viewState.state,
    caption,
    marks,
    play,
    reveal,
    dimRest,
    advance,
    transition,
    pulse,
    notes,
  });
}

function checkedCaption(value: unknown, where: string): TourCaption {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('invalid-command', `${where} needs a caption with a title.`);
  }
  const { title, text, place, pointTo, size, face, leader, ...rest } = value as Record<
    string,
    unknown
  >;
  if (Object.keys(rest).length > 0) {
    reject(
      'invalid-command',
      'A caption holds a title, a text, a place, the mark it points at, a size, a look and how its line is drawn, nothing else.',
    );
  }
  if (pointTo !== undefined && !isId(pointTo)) {
    reject(
      'invalid-id',
      `A caption points at one of its step's marks by its id, and "${typeof pointTo === 'string' ? pointTo : typeof pointTo}" is not one.`,
    );
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
  const corner = checkedPlace(place);
  return compact({
    title,
    text: checked,
    place: corner,
    pointTo: pointTo,
    size: checkedSize(size),
    face: checkedCaptionFace(face),
    leader: checkedLeader(leader),
  });
}

/** The corners a caption may be fixed in; `auto`, the side farthest from the marks, is never written. */
const CAPTION_PLACES: readonly string[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/**
 * A caption's place: a corner, or a place it was dragged to (ADR 0095), each fraction from 0 to 1
 * kept to three decimals.
 */
function checkedPlace(value: unknown): TourCaption['place'] {
  if (value === undefined || value === 'auto') return undefined;
  if (typeof value === 'string' && CAPTION_PLACES.includes(value)) {
    return value as TourCaption['place'];
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const { x, y, ...rest } = value as Record<string, unknown>;
    const fraction = (each: unknown): each is number =>
      typeof each === 'number' && Number.isFinite(each) && each >= 0 && each <= 1;
    if (Object.keys(rest).length === 0 && fraction(x) && fraction(y)) {
      return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
    }
  }
  reject(
    'invalid-command',
    'A caption sits in a corner, top-left, top-right, bottom-left or bottom-right, at a place given as { x, y }, each from 0 to 1 across the room the card leaves on screen, or where it reads best, auto.',
  );
}

/** A caption card's size (ADR 0096): fractions of the screen from 0.1 to 1, kept to three decimals. */
function checkedSize(value: unknown): CaptionSize | undefined {
  if (value === undefined) return undefined;
  const fraction = (each: unknown): each is number =>
    typeof each === 'number' && Number.isFinite(each) && each >= 0.1 && each <= 1;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const { width, height, ...rest } = value as Record<string, unknown>;
    if (
      Object.keys(rest).length === 0 &&
      fraction(width) &&
      (height === undefined || fraction(height))
    ) {
      const round = (each: number) => Math.round(each * 1000) / 1000;
      return compact({
        width: round(width),
        height: height === undefined ? undefined : round(height),
      });
    }
  }
  reject(
    'invalid-command',
    "A caption card's size is { width, height }, each from 0.1 to 1 of the screen, the height left out for as tall as its content.",
  );
}

/** How a caption's leader line is drawn (ADR 0097): only the parts it names, each from its choices. */
function checkedLeader(value: unknown): CaptionLeader | undefined {
  if (value === undefined) return undefined;
  const choices = {
    shape: ['straight', 'elbow', 'curved'],
    end: ['dot', 'arrow', 'none'],
    from: ['top', 'right', 'bottom', 'left'],
  } as const;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const given = value as Record<string, unknown>;
    const fits = Object.entries(given).every(
      ([key, each]) =>
        Object.hasOwn(choices, key) &&
        (choices[key as keyof typeof choices] as readonly unknown[]).includes(each),
    );
    if (fits) {
      const leader = compact({
        shape: given.shape as CaptionLeader['shape'],
        end: given.end as CaptionLeader['end'],
        from: given.from as CaptionLeader['from'],
      });
      return Object.keys(leader).length === 0 ? undefined : leader;
    }
  }
  reject(
    'invalid-command',
    "A caption's line is { shape, end, from }: its shape straight, elbow or curved, its end dot, arrow or none, and the side of the card it leaves from, top, right, bottom or left.",
  );
}

/**
 * The look of a tour's caption cards (ADR 0096): a face's markup and style, checked and compiled as a
 * component's face is, and nothing else of a face.
 */
function checkedCaptionFace(value: unknown): CaptionFace | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('invalid-face', "A tour's caption look is an object with its markup and style.");
  }
  const { markup, style, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    reject('invalid-face', "A tour's caption look holds its markup and style, nothing else.");
  }
  if (!Array.isArray(markup) || markup.length === 0) {
    reject('invalid-face', "A tour's caption look needs its markup, a line at least.");
  }
  const face = checkedFace({ markup, ...(style === undefined ? {} : { style }) }, 'the captions');
  if (face === 'none' || face.markup === undefined) {
    reject('invalid-face', "A tour's caption look needs its markup, a line at least.");
  }
  return compact({ markup: face.markup, style: face.style });
}

/**
 * A step's reveals (ADR 0077): at most {@link MAX_TOUR_REVEALS}, each marking one element or
 * relation at least, each id once in the whole step, its own marks included, with an optional text; the step's marks and its reveals' together at
 * most {@link MAX_TOUR_MARKS}.
 */
function checkedReveals(
  value: unknown,
  where: string,
  marked: readonly Id[],
): TourReveal[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) reject('invalid-command', `${where} reveals a list of marks.`);
  if (value.length === 0) return undefined;
  if (value.length > MAX_TOUR_REVEALS) {
    reject('invalid-command', `A step brings in at most ${MAX_TOUR_REVEALS} reveals.`);
  }
  let total = marked.length;
  const seen = new Set<Id>(marked);
  const reveals = value.map((given: unknown, at: number): TourReveal => {
    const which = `Reveal ${at + 1} of ${where.charAt(0).toLowerCase()}${where.slice(1)}`;
    if (typeof given !== 'object' || given === null || Array.isArray(given)) {
      reject('invalid-command', `${which} is an object with its marks.`);
    }
    const { marks, text, ...rest } = given as Record<string, unknown>;
    if (Object.keys(rest).length > 0) {
      reject('invalid-command', 'A reveal holds its marks and a text, nothing else.');
    }
    const checked = checkedMarks(marks, which);
    if (checked === undefined) {
      reject(
        'invalid-command',
        `${which} marks nothing: a reveal marks one element or relation at least.`,
      );
    }
    for (const id of checked) {
      if (seen.has(id)) {
        reject('invalid-command', `${which} marks "${id}", which the step marks already.`);
      }
      seen.add(id);
    }
    total += checked.length;
    const said = checkedText(text, MAX_CAPTION_TEXT, {
      notText: "A reveal's text is text.",
      tooLong: `A reveal's text holds at most ${MAX_CAPTION_TEXT} characters.`,
    });
    return compact({ marks: checked, text: said });
  });
  if (total > MAX_TOUR_MARKS) {
    reject(
      'invalid-command',
      `A step marks at most ${MAX_TOUR_MARKS} elements and relations, its reveals' included.`,
    );
  }
  return reveals;
}

/** Dimming the rest: `true`, or left out as `false` is. */
function checkedDimRest(value: unknown): true | undefined {
  if (value === undefined || value === false) return undefined;
  if (value !== true) reject('invalid-command', 'Dimming the rest is true or false.');
  return true;
}

/** When a step moves on by itself: a whole number of milliseconds, or once the scenario it plays ends. */
function checkedAdvance(value: unknown, where: string, plays: boolean): TourAdvance | undefined {
  if (value === undefined) return undefined;
  if (value === 'after-scenario') {
    if (!plays) reject('invalid-command', `${where} moves on after its scenario, but plays none.`);
    return value;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < TOUR_ADVANCE.least ||
    value > TOUR_ADVANCE.most
  ) {
    reject(
      'invalid-command',
      'A step moves on by itself after 500 to 600,000 milliseconds, or after the scenario it plays.',
    );
  }
  return value;
}

/** How a step moves in: `cut` always cuts; `glide`, the default, is never written (ADR 0084). */
function checkedTransition(value: unknown): 'cut' | undefined {
  if (value === undefined || value === 'glide') return undefined;
  if (value !== 'cut') {
    reject(
      'invalid-command',
      `A step's transition is "cut", to always cut, or "glide", to glide when it can.`,
    );
  }
  return 'cut';
}

/**
 * A step's pulse (ADR 0084): a chain of 1 to {@link MAX_PULSE_RELATIONS} relations, each once, and
 * how many times it runs, from 1 to 3, left out when once. Whether the chain joins is a step problem.
 */
function checkedPulse(value: unknown, where: string): TourPulse | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('invalid-command', `${where} sends a pulse: an object with its relations.`);
  }
  const { relations, repeat, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    reject(
      'invalid-command',
      'A pulse holds its relations and how many times it runs, nothing else.',
    );
  }
  if (!Array.isArray(relations) || relations.length === 0) {
    reject('invalid-command', `${where} sends a pulse along one relation at least.`);
  }
  if (relations.length > MAX_PULSE_RELATIONS) {
    reject('invalid-command', `A pulse runs along at most ${MAX_PULSE_RELATIONS} relations.`);
  }
  const seen = new Set<Id>();
  for (const id of relations) {
    if (!isId(id)) reject('invalid-id', `"${String(id)}" is not a valid id.`);
    if (seen.has(id))
      reject(
        'invalid-command',
        `The pulse of ${where.charAt(0).toLowerCase()}${where.slice(1)} runs along "${id}" twice.`,
      );
    seen.add(id);
  }
  if (
    repeat !== undefined &&
    (typeof repeat !== 'number' ||
      !Number.isInteger(repeat) ||
      repeat < PULSE_REPEAT.least ||
      repeat > PULSE_REPEAT.most)
  ) {
    reject('invalid-command', 'A pulse runs 1 to 3 times.');
  }
  return compact({
    relations: [...seen],
    repeat: repeat === undefined || repeat === 1 ? undefined : repeat,
  });
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
  const { scenario, from, to, choices, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    reject(
      'invalid-command',
      'A step plays a scenario, from a step to a step, with the alternatives it chooses, nothing else.',
    );
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
    choices: checkedChoices(choices, where),
  });
}

/**
 * The alternatives a step plays at its scenario's decisions (ADR 0078): a map from the id of each
 * decision to the id of an alternative, at most {@link MAX_VIEW_STATE_CHOICES}, kept in the order of
 * the decisions' ids, as its file writes them; left out when it chooses none.
 */
function checkedChoices(value: unknown, where: string): DecisionChoices | undefined {
  if (value === undefined) return undefined;
  const entries =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.entries(value)
      : undefined;
  if (
    !entries ||
    !entries.every(([decision, alternative]) => isId(decision) && isId(alternative))
  ) {
    reject(
      'invalid-command',
      `${where} chooses alternatives as a map from the id of each decision to the id of an alternative.`,
    );
  }
  if (entries.length === 0) return undefined;
  if (entries.length > MAX_VIEW_STATE_CHOICES) {
    reject('invalid-command', `A step chooses at most ${MAX_VIEW_STATE_CHOICES} alternatives.`);
  }
  return Object.fromEntries(
    (entries as [Id, Id][]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}
