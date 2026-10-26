/**
 * The commands the tours panel sends (ADR 0058): each edit is one `update-tour` with the whole list of
 * steps, so that adding, editing, duplicating, reordering and deleting a step are each one action.
 * The live connection carries at most 4 MiB from the app, so a change that would not fit is not
 * sent: it would close the connection instead of being refused.
 */
import {
  MAX_CAPTION_TITLE,
  savedViewStateOf,
  type Command,
  type NewTourStep,
  type ViewState,
} from '@visual-anything/core';
import type { Id, TourFile, TourStep } from '@visual-anything/schema';
import { t } from '../i18n';
import { LIVE_MESSAGE_LIMIT } from '../import/importing';

/** What the message around a command takes beyond it, at most: its type and request id. */
const ENVELOPE = 1024;

/** Whether a command would take more than the live connection carries from the app. */
export function tooLargeToSend(command: Command): boolean {
  const json = JSON.stringify(command);
  // No character takes more than three bytes in UTF-8 for each of its UTF-16 code units.
  if (json.length * 3 + ENVELOPE <= LIVE_MESSAGE_LIMIT) return false;
  return new TextEncoder().encode(json).length + ENVELOPE > LIVE_MESSAGE_LIMIT;
}

/** A name for a new tour that no tour of the project has yet, in the language read in. */
export function newTourName(tours: readonly TourFile[]): string {
  const taken = new Set(tours.map((tour) => tour.name));
  const first = t('New tour');
  if (!taken.has(first)) return first;
  for (let count = 2; ; count++) {
    const name = t('New tour {count}', { count });
    if (!taken.has(name)) return name;
  }
}

/** A step that shows a view state, with a caption titled after what it shows. */
export function stepOf(state: ViewState, title: string): NewTourStep {
  return {
    viewState: savedViewStateOf(state),
    caption: { title: title.trim().slice(0, MAX_CAPTION_TITLE) || t('Step') },
  };
}

/** Creates a tour, with a first step when one is given. */
export function createTourCommand(name: string, first?: NewTourStep): Command {
  return { type: 'create-tour', tour: { name, steps: first ? [first] : [] } };
}

/** Gives a tour these steps, in this order. */
export function stepsCommand(tour: TourFile, steps: readonly (TourStep | NewTourStep)[]): Command {
  return { type: 'update-tour', id: tour.id, changes: { steps: [...steps] } };
}

/** The tour with a step changed in place. */
export function changeStep(tour: TourFile, id: Id, change: (step: TourStep) => TourStep): Command {
  return stepsCommand(
    tour,
    tour.steps.map((step) => (step.id === id ? change(step) : step)),
  );
}

/** The tour with one more step, after the one at `after`, or last. */
export function addStep(tour: TourFile, step: NewTourStep, after?: number): Command {
  const at = after === undefined ? tour.steps.length : after + 1;
  const steps: (TourStep | NewTourStep)[] = [...tour.steps];
  steps.splice(at, 0, step);
  return stepsCommand(tour, steps);
}

/** The tour with a step moved by `by` places, kept within the tour. */
export function moveStep(tour: TourFile, id: Id, by: number): Command | undefined {
  const from = tour.steps.findIndex((step) => step.id === id);
  const to = Math.min(tour.steps.length - 1, Math.max(0, from + by));
  if (from < 0 || from === to) return undefined;
  const steps = [...tour.steps];
  const [moved] = steps.splice(from, 1);
  if (moved) steps.splice(to, 0, moved);
  return stepsCommand(tour, steps);
}

/** The tour with a copy of a step right after it: the copy gets an id of its own. */
export function duplicateStep(tour: TourFile, id: Id): Command | undefined {
  const at = tour.steps.findIndex((step) => step.id === id);
  const step = tour.steps[at];
  if (!step) return undefined;
  const copy: NewTourStep = structuredClone(step);
  delete copy.id;
  return addStep(tour, copy, at);
}

/** The tour without a step. */
export function deleteStep(tour: TourFile, id: Id): Command {
  return stepsCommand(
    tour,
    tour.steps.filter((step) => step.id !== id),
  );
}

/** Renames a tour. */
export function renameTourCommand(tour: TourFile, name: string): Command {
  return { type: 'update-tour', id: tour.id, changes: { name } };
}

/** Deletes a tour. */
export function deleteTourCommand(tour: TourFile): Command {
  return { type: 'delete-tour', id: tour.id };
}
