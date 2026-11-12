/**
 * What the core says of a step's pictures (ADR 0098, stage 4): the refusals of a scenario's and a
 * tour's step whose lists are not lists, repeat an id, pass their caps, name what the view does not
 * hold or play what is no video it shows, and the warning about a scenario step that shows a picture
 * deleted since. The core-messages test reads each through the Spanish templates.
 */
import {
  checkProject,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { FreeShape, Picture } from '@visual-anything/schema';

/** One thing the core said, and the fixture that made it say so. */
export interface StepPictureSaid {
  command: string;
  message: string;
}

const ref = (hash: string, format: Picture['media']['format']) => ({
  hash: hash.repeat(64),
  format,
  width: 640,
  height: 360,
  bytes: 1000,
});
const photo: Picture = {
  kind: 'picture',
  id: 'step-photo',
  x: 0,
  y: 2000,
  width: 100,
  height: 60,
  media: ref('a', 'jpeg'),
};
const video: Picture = { ...photo, id: 'step-video', media: ref('b', 'mp4') };

/** The sample with a photo and a video in the view its scenario plays over. */
function withPictures(sample: ProjectSnapshot): { state: ProjectSnapshot; view: string } {
  const scenario = sample.scenarios[0];
  if (!scenario) throw new Error('The sample has no scenario.');
  const added: FreeShape[] = [photo, video];
  return {
    view: scenario.view,
    state: {
      ...sample,
      views: sample.views.map((view) =>
        view.id === scenario.view ? { ...view, freeShapes: [...view.freeShapes, ...added] } : view,
      ),
    },
  };
}

function said(state: ProjectSnapshot, name: string, command: unknown): StepPictureSaid[] {
  const outcome = executeCommand(state, command as Command, { newId: (base) => `${base}-made` });
  const messages = outcome.ok ? [outcome.label] : outcome.problems.map((each) => each.message);
  return messages.map((message) => ({ command: name, message }));
}

/** Everything the core says of a step's lists, on the sample. */
export function stepPictureRefusals(sample: ProjectSnapshot): StepPictureSaid[] {
  const { state, view } = withPictures(sample);
  const scenario = state.scenarios[0];
  if (!scenario) return [];
  const [first, ...rest] = scenario.steps;
  if (!first) return [];
  const lists = (shows: unknown, playing?: unknown) => ({
    type: 'update-scenario',
    id: scenario.id,
    changes: {
      steps: [{ ...first, shows, ...(playing === undefined ? {} : { playing }) }, ...rest],
    },
  });
  const tour = (shows: unknown, playing?: unknown) => ({
    type: 'create-tour',
    tour: {
      name: 'Pictures',
      steps: [
        {
          viewState: { view },
          caption: { title: 'Pictures' },
          shows,
          ...(playing === undefined ? {} : { playing }),
        },
      ],
    },
  });
  const many = Array.from({ length: 501 }, (_, at) => `picture-${at}`);
  const fixtures: [string, unknown][] = [
    ['a step shows what the view does not hold', lists(['nothing'])],
    ['a step shows something else than a list', lists('step-photo')],
    ['a step plays something else than a list', lists(['step-video'], 'step-video')],
    ['a step shows a picture twice', lists(['step-photo', 'step-photo'])],
    ['a step plays a video twice', lists(['step-video'], ['step-video', 'step-video'])],
    ['a step plays what it does not show', lists(['step-photo'], ['step-video'])],
    ['a step plays a photo', lists(['step-photo'], ['step-photo'])],
    ['a step shows too many', lists(many)],
    ['a step plays too many', lists(['step-video'], ['a', 'b', 'c', 'd', 'e'])],
    ['a tour step shows what the view does not hold', tour(['nothing'])],
    ['a tour step shows something else than a list', tour('step-photo')],
    ['a tour step plays something else than a list', tour(['step-video'], 'step-video')],
    ['a tour step shows a picture twice', tour(['step-photo', 'step-photo'])],
    ['a tour step plays a video twice', tour(['step-video'], ['step-video', 'step-video'])],
    ['a tour step plays what it does not show', tour(['step-photo'], ['step-video'])],
    ['a tour step plays a photo', tour(['step-photo'], ['step-photo'])],
  ];
  const out = fixtures.flatMap(([name, command]) => said(state, name, command));
  // A scenario step that shows a picture deleted since: kept, and warned about.
  const shown = executeCommand(state, lists(['step-photo']) as Command, {
    newId: (base) => `${base}-made`,
  });
  if (shown.ok) {
    out.push({ command: 'a step shows its pictures', message: shown.label });
    const deleted = executeCommand(
      shown.state,
      { type: 'delete-free-shapes', view, ids: ['step-photo'] },
      { newId: (base) => `${base}-made` },
    );
    if (deleted.ok) {
      for (const warning of checkProject(deleted.state).warnings) {
        out.push({ command: 'a step shows a deleted picture', message: warning.message });
      }
    }
  }
  return out;
}
