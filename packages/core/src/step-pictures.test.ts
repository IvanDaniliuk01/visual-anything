/**
 * Steps that show pictures, videos and link cards (ADR 0098, stage 4): the commands check what a new
 * or changed step lists, and a free shape deleted since stays named, the step kept exactly, in any
 * alternative of a decision too.
 */
import fc from 'fast-check';
import type {
  DecisionBlock,
  FreeShape,
  Id,
  LinkCard,
  Picture,
  ScenarioFile,
  Step,
} from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import { executeCommand, type Command, type CommandOutcome } from './commands';
import type { NewStep, NewTourStep } from './commands/types';
import { applyOperations } from './operations';
import { previewDelete } from './rules';
import type { ProjectSnapshot } from './snapshot';
import { testProject } from './test/fixtures';
import { checkTour, isBrokenTourStep, tourStepProblems } from './tours';

function run(state: ProjectSnapshot, command: Command): CommandOutcome {
  let n = 0;
  return executeCommand(state, command, { newId: (base) => `${base}-${(n += 1)}` });
}

function done(state: ProjectSnapshot, command: Command) {
  const outcome = run(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome;
}

function refusal(state: ProjectSnapshot, command: Command): string {
  const outcome = run(state, command);
  if (outcome.ok) throw new Error(`The command was not refused: ${outcome.label}`);
  return outcome.problems[0]?.code ?? '';
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
  id: 'photo',
  x: 0,
  y: 400,
  width: 100,
  height: 60,
  media: ref('a', 'jpeg'),
};
const video: Picture = { ...photo, id: 'video', media: ref('b', 'mp4') };
const card: LinkCard = {
  kind: 'link',
  id: 'card',
  x: 200,
  y: 400,
  width: 320,
  height: 112,
  url: 'https://example.com/',
  title: 'Example',
};
const PICTURES: FreeShape[] = [photo, video, card];

/** The test project with a photo, a video and a link card in its view. */
function withPictures(): ProjectSnapshot {
  const state = testProject();
  const [view] = state.views;
  if (!view) throw new Error('No view.');
  return { ...state, views: [{ ...view, freeShapes: [...view.freeShapes, ...PICTURES] }] };
}

function scenarioOf(state: ProjectSnapshot): ScenarioFile {
  const scenario = state.scenarios[0];
  if (!scenario) throw new Error('No scenario.');
  return scenario;
}

/** Sets the steps of the test scenario. */
function setSteps(steps: NewStep[], blocks?: DecisionBlock[]): Command {
  return {
    type: 'update-scenario',
    id: 'request',
    changes: { steps, ...(blocks ? { blocks } : {}) },
  };
}

const CALL: Step = {
  id: 'call',
  description: 'The client calls the API.',
  relations: ['client-calls-api'],
};
const READ: Step = {
  id: 'read',
  description: 'The API reads the DB.',
  relations: ['api-reads-db'],
};

describe('a scenario step that shows pictures', () => {
  it('keeps what it shows and plays, as one action that undoes exactly', () => {
    const state = withPictures();
    const outcome = done(
      state,
      setSteps([{ ...CALL, shows: ['photo', 'video'], playing: ['video'] }, READ]),
    );
    expect(scenarioOf(outcome.state).steps[0]).toEqual({
      ...CALL,
      shows: ['photo', 'video'],
      playing: ['video'],
    });
    expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(state);
  });

  it('takes an empty list as none', () => {
    const outcome = done(withPictures(), setSteps([{ ...CALL, shows: [], playing: [] }, READ]));
    expect(scenarioOf(outcome.state).steps[0]).toEqual(CALL);
  });

  it('refuses what the view does not hold, a note, and what it cannot play', () => {
    const state = withPictures();
    expect(refusal(state, setSteps([{ ...CALL, shows: ['nothing'] }]))).toBe('unknown-free-shape');
    expect(refusal(state, setSteps([{ ...CALL, shows: ['note'] }]))).toBe('unknown-free-shape');
    expect(refusal(state, setSteps([{ ...CALL, shows: ['photo'], playing: ['photo'] }]))).toBe(
      'invalid-command',
    );
    expect(refusal(state, setSteps([{ ...CALL, playing: ['video'] }]))).toBe('invalid-command');
    expect(refusal(state, setSteps([{ ...CALL, shows: ['photo', 'photo'] }]))).toBe(
      'invalid-command',
    );
    expect(
      refusal(
        state,
        setSteps([
          { ...CALL, shows: ['video'], playing: ['video', 'video', 'video', 'video', 'x'] },
        ]),
      ),
    ).toBe('invalid-command');
    expect(refusal(state, setSteps([{ ...CALL, shows: 'photo' as unknown as Id[] }]))).toBe(
      'invalid-command',
    );
  });

  it('keeps naming a deleted picture, kept until its lists change, and the check warns', () => {
    const shown = done(withPictures(), setSteps([{ ...CALL, shows: ['photo', 'card'] }, READ]));
    const preview = previewDelete(shown.state, { freeShapes: ['photo'] }, 'overview');
    expect(preview.brokenSteps).toEqual([{ scenario: 'request', step: 'call' }]);
    const deleted = done(shown.state, {
      type: 'delete-free-shapes',
      view: 'overview',
      ids: ['photo'],
    });
    const step = scenarioOf(deleted.state).steps[0];
    expect(step).toEqual({ ...CALL, shows: ['photo', 'card'] });
    expect(checkProject(deleted.state).warnings.map((each) => each.code)).toContain(
      'unknown-free-shape',
    );
    // Its description changes; its lists, kept as they were, still name what is gone.
    const described = done(
      deleted.state,
      setSteps([{ ...CALL, shows: ['photo', 'card'], description: 'Now.' }, READ]),
    );
    expect(scenarioOf(described.state).steps[0]?.shows).toEqual(['photo', 'card']);
    // A changed list must name only what the view holds.
    expect(refusal(deleted.state, setSteps([{ ...CALL, shows: ['photo'] }, READ]))).toBe(
      'unknown-free-shape',
    );
    const fixed = done(deleted.state, setSteps([{ ...CALL, shows: ['card'] }, READ]));
    expect(checkProject(fixed.state).warnings.map((each) => each.code)).not.toContain(
      'unknown-free-shape',
    );
  });

  it('never gives a deleted picture’s id to something new', () => {
    const shown = done(withPictures(), setSteps([{ ...CALL, shows: ['photo'] }, READ]));
    const deleted = done(shown.state, {
      type: 'delete-free-shapes',
      view: 'overview',
      ids: ['photo'],
    });
    expect(
      refusal(deleted.state, {
        type: 'create-free-shape',
        view: 'overview',
        shape: { ...photo },
      }),
    ).toBe('id-taken');
  });

  it('keeps every step exactly when pictures are deleted, in any alternative too (property)', () => {
    const ids = PICTURES.map((shape) => shape.id);
    const decision = (steps: Step[]): DecisionBlock => ({
      id: 'decision',
      kind: 'decision',
      question: 'Does it read?',
      alternatives: [
        { id: 'yes', label: 'Yes', steps: [steps[1]?.id ?? 'read'] },
        { id: 'no', label: 'No', steps: [steps[2]?.id ?? 'again'] },
      ],
    });
    fc.assert(
      fc.property(
        fc.array(fc.subarray(ids), { minLength: 3, maxLength: 3 }),
        fc.subarray(ids, { minLength: 1 }),
        fc.boolean(),
        (lists, deleting, withDecision) => {
          const steps: Step[] = [
            { ...CALL },
            { ...READ },
            { id: 'again', description: 'Again.', relations: ['client-calls-api'] },
          ].map((step, at) => {
            const shows = lists[at] ?? [];
            const playing = shows.filter((id) => id === 'video');
            return {
              ...step,
              ...(shows.length > 0 ? { shows } : {}),
              ...(playing.length > 0 ? { playing } : {}),
            };
          });
          const given = done(
            withPictures(),
            setSteps(steps, withDecision ? [decision(steps)] : undefined),
          ).state;
          const before = scenarioOf(given);
          const preview = previewDelete(given, { freeShapes: deleting }, 'overview');
          const outcome = done(given, {
            type: 'delete-free-shapes',
            view: 'overview',
            ids: deleting,
          });
          // Every step stays, exactly, and the decision with them.
          expect(scenarioOf(outcome.state)).toEqual(before);
          // The preview names each step that shows what is deleted, and the alternative it is in.
          const breaking = before.steps
            .filter((step) => (step.shows ?? []).some((id) => deleting.includes(id)))
            .map((step) => step.id);
          expect(preview.brokenSteps.map((each) => each.step)).toEqual(breaking);
          for (const each of preview.brokenSteps) {
            if (withDecision && each.step !== 'call')
              expect(each.within?.decision).toBe('decision');
          }
          expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(given);
        },
      ),
      { numRuns: 60 },
    );
  });
});

const STEP: NewTourStep = {
  viewState: { view: 'overview' },
  caption: { title: 'The pictures' },
  shows: ['video', 'card'],
  playing: ['video'],
};

describe('a tour step that shows pictures', () => {
  function withTour() {
    return done(withPictures(), {
      type: 'create-tour',
      tour: { id: 'walk', name: 'A walk', steps: [{ ...STEP, id: 'first' }] },
    }).state;
  }

  it('keeps what it shows and plays', () => {
    const state = withTour();
    expect(state.tours[0]?.steps[0]).toMatchObject({
      shows: ['video', 'card'],
      playing: ['video'],
    });
    expect(tourStepProblems(state, state.tours[0]?.steps[0] as never)).toEqual([]);
  });

  it('refuses what the view does not hold, and what it cannot play', () => {
    const state = withPictures();
    const create = (step: NewTourStep): Command => ({
      type: 'create-tour',
      tour: { name: 'A walk', steps: [step] },
    });
    expect(refusal(state, create({ ...STEP, shows: ['nothing'], playing: [] }))).toBe(
      'unknown-free-shape',
    );
    expect(refusal(state, create({ ...STEP, shows: ['card'] }))).toBe('invalid-command');
    expect(refusal(state, create({ ...STEP, shows: ['photo'], playing: ['photo'] }))).toBe(
      'invalid-command',
    );
  });

  it('is a broken step once what it shows is deleted, kept as it was', () => {
    const state = withTour();
    const preview = previewDelete(state, { freeShapes: ['card'] }, 'overview');
    expect(preview.brokenTourSteps).toEqual([{ tour: 'walk', step: 'first' }]);
    const deleted = done(state, { type: 'delete-free-shapes', view: 'overview', ids: ['card'] });
    const step = deleted.state.tours[0]?.steps[0];
    if (!step) throw new Error('The step went.');
    expect(step).toEqual(state.tours[0]?.steps[0]);
    expect(isBrokenTourStep(deleted.state, step)).toBe(true);
    const [check] = checkTour(deleted.state, deleted.state.tours[0] as never);
    expect(check?.warnings.map((each) => each.kind)).toContain('broken');
  });
});
