/**
 * Travelers (ADR 0110): the package picture a relation's appearance sends along its line. The core
 * checks their images as it checks a component's, keeps an image a traveler still sends, resolves
 * them replaced whole with `none` taking one away, and lets a view keep them still or hide them.
 */
import fc from 'fast-check';
import type { RelationAppearance, Traveler } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { SYSTEMS } from './builtin';
import { executeCommand, type Command, type CommandOutcome } from './commands';
import { definitionsIn } from './state';
import { relationAppearanceOf, relationAppearanceOriginsOf } from './definitions';
import { checkImages, imageUsers } from './images';
import { DESK, LOGO, imageProject } from './images/test/project';
import { applyOperations } from './operations';
import type { ProjectSnapshot } from './snapshot';
import { colorProject, sequentialIds } from './test/fixtures';

const ENVELOPE: Traveler = { image: LOGO.id, size: 24, speed: 'fast', spacing: 300 };

/** The image project with a relation type of its own that sends a traveler, and a relation of it. */
function travelerProject(): ProjectSnapshot {
  const state = imageProject();
  const [clinic, ...others] = state.packages;
  return {
    ...state,
    project: { ...state.project, packages: ['systems', ...state.project.packages] },
    packages: [
      {
        ...clinic!,
        relationTypes: [
          {
            id: 'clinic.sends',
            name: 'sends',
            derivesFrom: 'relates-to',
            appearance: { traveler: { image: LOGO.id } },
          },
          { id: 'clinic.notes', name: 'notes', derivesFrom: 'relates-to' },
        ],
      },
      ...others,
      SYSTEMS,
    ],
    model: {
      ...state.model,
      relations: [
        { id: 'booking-sends-desk', relationType: 'clinic.sends', from: 'booking', to: 'desk' },
        { id: 'desk-notes-plain', relationType: 'clinic.notes', from: 'desk', to: 'plain' },
      ],
    },
  };
}

function run(state: ProjectSnapshot, command: Command): Extract<CommandOutcome, { ok: true }> {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function refusal(state: ProjectSnapshot, command: Command): string[] {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

function drawn(state: ProjectSnapshot, relation: string) {
  const found = state.model.relations.find((each) => each.id === relation);
  if (!found) throw new Error(`No relation ${relation}`);
  return relationAppearanceOf(found, definitionsIn(state));
}

describe('a traveler names a package image', () => {
  it('is refused with unknown-image wherever it is set', () => {
    const state = travelerProject();
    const nowhere = { traveler: { image: 'clinic.nowhere' } };
    expect(
      refusal(state, {
        type: 'update-relation-type',
        id: 'clinic.notes',
        changes: { appearance: nowhere },
      }),
    ).toEqual(['unknown-image']);
    expect(
      refusal(state, {
        type: 'set-relation-type-appearance',
        relationType: 'systems.communicates-with',
        appearanceTraits: nowhere,
      }),
    ).toEqual(['unknown-image']);
    expect(
      refusal(state, {
        type: 'update-relation',
        id: 'desk-notes-plain',
        changes: { appearanceTraits: nowhere },
      }),
    ).toEqual(['unknown-image']);
    expect(
      refusal(state, {
        type: 'create-relation',
        relation: {
          relationType: 'clinic.notes',
          from: 'plain',
          to: 'booking',
          appearance: nowhere,
        },
      }),
    ).toEqual(['unknown-image']);
    expect(
      refusal(state, {
        type: 'define-relation-type',
        package: 'clinic',
        relationType: {
          id: 'clinic.carries',
          name: 'carries',
          derivesFrom: 'relates-to',
          appearance: nowhere,
        },
      }),
    ).toEqual(['unknown-image']);
  });

  it('takes an image of a package in use, SVG or bitmap, and undoes exactly', () => {
    const state = travelerProject();
    run(state, {
      type: 'update-relation',
      id: 'desk-notes-plain',
      changes: { appearanceTraits: { traveler: { image: DESK.id } } },
    });
    run(state, {
      type: 'set-relation-type-appearance',
      relationType: 'systems.communicates-with',
      appearanceTraits: { traveler: ENVELOPE },
    });
  });

  it('leaves a stored traveler whose image went missing as it is when other traits change', () => {
    const state = travelerProject();
    const broken: ProjectSnapshot = {
      ...state,
      model: {
        ...state.model,
        relations: state.model.relations.map((each) =>
          each.id === 'desk-notes-plain'
            ? { ...each, appearance: { traveler: { image: 'clinic.gone' } } }
            : each,
        ),
      },
    };
    run(broken, {
      type: 'update-relation',
      id: 'desk-notes-plain',
      changes: { appearanceTraits: { stroke: '#112233' } },
    });
  });
});

describe('an image a traveler sends', () => {
  it('counts relation types, project relation-type appearances and relations among its users', () => {
    const state = travelerProject();
    state.project = {
      ...state.project,
      appearances: { relationTypes: { 'systems.communicates-with': { traveler: ENVELOPE } } },
    };
    state.model = {
      ...state.model,
      relations: state.model.relations.map((each) =>
        each.id === 'desk-notes-plain' ? { ...each, appearance: { traveler: ENVELOPE } } : each,
      ),
    };
    expect(imageUsers(state, LOGO.id)).toEqual([
      'clinic.calendar',
      'clinic.sends',
      'systems.communicates-with',
      'desk-notes-plain',
    ]);
  });

  it('cannot be removed while one is sent, and a traveler of none sends nothing', () => {
    const state = travelerProject();
    state.packages = state.packages.map((file) => ({
      ...file,
      components: file.components.map((each) =>
        each.id === 'clinic.calendar' ? { ...each, appearance: { image: 'none' } } : each,
      ),
    }));
    const outcome = executeCommand(state, { type: 'remove-image', id: LOGO.id });
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.problems[0]).toMatchObject({
      code: 'in-use',
      subjects: ['clinic.sends'],
    });
    const none = run(state, {
      type: 'update-relation-type',
      id: 'clinic.sends',
      changes: { appearance: { traveler: 'none' } },
    }).state;
    expect(imageUsers(none, LOGO.id)).toEqual([]);
    run(none, { type: 'remove-image', id: LOGO.id });
  });

  it('refuses a package update that drops an image a traveler still sends', () => {
    const state = travelerProject();
    const clinic = state.packages[0]!;
    expect(
      refusal(state, {
        type: 'replace-package',
        package: {
          ...clinic,
          components: clinic.components.map((each) => ({ ...each, appearance: undefined })),
          images: [DESK],
        },
      }),
    ).toContain('unknown-image');
  });
});

describe('opening a project', () => {
  it('warns about a traveler whose image no package defines', () => {
    const state = travelerProject();
    state.project = {
      ...state.project,
      appearances: {
        relationTypes: { 'systems.communicates-with': { traveler: { image: 'x.nowhere' } } },
      },
    };
    const warnings = checkImages(state).warnings.filter((each) => each.code === 'unknown-image');
    expect(warnings.map((each) => each.message)).toEqual([
      'The project appearance of "systems.communicates-with" sends the image "x.nowhere" as its traveler, which no package in use defines; no traveler is drawn.',
    ]);
  });
});

describe('a traveler in a relation appearance', () => {
  it('is replaced whole, never merged, and none takes an inherited one away', () => {
    const state = travelerProject();
    expect(drawn(state, 'booking-sends-desk').traveler).toEqual({ image: LOGO.id });
    const own = run(state, {
      type: 'update-relation',
      id: 'booking-sends-desk',
      changes: { appearanceTraits: { traveler: { image: DESK.id, size: 40 } } },
    }).state;
    expect(drawn(own, 'booking-sends-desk').traveler).toEqual({ image: DESK.id, size: 40 });
    const smaller = run(own, {
      type: 'update-relation',
      id: 'booking-sends-desk',
      changes: { appearanceTraits: { traveler: { image: DESK.id, speed: 'slow' } } },
    }).state;
    expect(drawn(smaller, 'booking-sends-desk').traveler).toEqual({
      image: DESK.id,
      speed: 'slow',
    });
    const none = run(smaller, {
      type: 'update-relation',
      id: 'booking-sends-desk',
      changes: { appearanceTraits: { traveler: 'none' } },
    }).state;
    expect(drawn(none, 'booking-sends-desk')).not.toHaveProperty('traveler');
    expect(
      relationAppearanceOriginsOf(none.model.relations[0]!, definitionsIn(none)),
    ).toMatchObject({ traveler: { kind: 'own' } });
    const inherited = run(none, {
      type: 'update-relation',
      id: 'booking-sends-desk',
      changes: { appearanceTraits: { traveler: null } },
    }).state;
    expect(drawn(inherited, 'booking-sends-desk').traveler).toEqual({ image: LOGO.id });
  });

  it('is set and cleared on a relation type of the project by set-relation-type-appearance', () => {
    const state = travelerProject();
    const whole = run(state, {
      type: 'set-relation-type-appearance',
      relationType: 'clinic.notes',
      appearance: { stroke: '#123456', opacity: 0.5, traveler: ENVELOPE },
    }).state;
    const notes = whole.packages[0]!.relationTypes.find((each) => each.id === 'clinic.notes');
    expect(notes?.appearance).toEqual({ stroke: '#123456', opacity: 0.5, traveler: ENVELOPE });
    const cleared = run(whole, {
      type: 'set-relation-type-appearance',
      relationType: 'clinic.notes',
      appearanceTraits: { traveler: null },
    }).state;
    expect(
      cleared.packages[0]!.relationTypes.find((each) => each.id === 'clinic.notes')?.appearance,
    ).toEqual({ stroke: '#123456', opacity: 0.5 });
  });

  it('is kept in the project appearances for a built-in relation type, none included', () => {
    const state = travelerProject();
    const none = run(state, {
      type: 'set-relation-type-appearance',
      relationType: 'systems.communicates-with',
      appearanceTraits: { traveler: 'none' },
    }).state;
    expect(none.project.appearances?.relationTypes).toEqual({
      'systems.communicates-with': { traveler: 'none' },
    });
  });

  it('refuses what a traveler is not', () => {
    const state = travelerProject();
    const set = (traveler: unknown): Command =>
      ({
        type: 'update-relation',
        id: 'desk-notes-plain',
        changes: { appearanceTraits: { traveler } },
      }) as unknown as Command;
    for (const bad of [
      'envelope',
      {},
      { image: '' },
      { image: LOGO.id, size: 4 },
      { image: LOGO.id, size: 65 },
      { image: LOGO.id, speed: 'warp' },
      { image: LOGO.id, spacing: 39 },
      { image: LOGO.id, spacing: 2001 },
      { image: LOGO.id, tint: '#000000' },
    ]) {
      expect(refusal(state, set(bad))).toEqual(['invalid-appearance']);
    }
  });

  it('resolves to a traveler or to none at all, never to "none", whatever the levels set', () => {
    const level = fc.option(
      fc.oneof(
        fc.constant<'none'>('none'),
        fc.record(
          {
            image: fc.constantFrom(LOGO.id, DESK.id),
            size: fc.integer({ min: 8, max: 64 }),
            speed: fc.constantFrom<'slow' | 'normal' | 'fast'>('slow', 'normal', 'fast'),
            spacing: fc.integer({ min: 40, max: 2000 }),
          },
          { requiredKeys: ['image'] },
        ),
      ),
      { nil: undefined },
    );
    fc.assert(
      fc.property(level, level, level, (type, project, own) => {
        const state = travelerProject();
        const appearance = (traveler: RelationAppearance['traveler']) =>
          traveler === undefined ? undefined : { traveler };
        state.packages[0]!.relationTypes[1] = {
          id: 'clinic.notes',
          name: 'notes',
          derivesFrom: 'systems.communicates-with',
          ...(type === undefined ? {} : { appearance: { traveler: type } }),
        };
        if (project !== undefined) {
          state.project = {
            ...state.project,
            appearances: { relationTypes: { 'systems.communicates-with': { traveler: project } } },
          };
        }
        const relation = {
          id: 'desk-notes-plain',
          relationType: 'clinic.notes',
          from: 'desk',
          to: 'plain',
          ...(own === undefined ? {} : { appearance: appearance(own) }),
        };
        const resolved = relationAppearanceOf(relation, definitionsIn(state)).traveler;
        const expected = [own, type, project].find((each) => each !== undefined);
        if (expected === undefined || expected === 'none') expect(resolved).toBeUndefined();
        else expect(resolved).toEqual(expected);
      }),
    );
  });
});

describe('update-view travelers', () => {
  const view = (state: ProjectSnapshot) => state.views[0] as ProjectSnapshot['views'][number];
  const update = (travelers: unknown): Command =>
    ({ type: 'update-view', id: 'overview', changes: { travelers } }) as unknown as Command;

  it('keeps them still or hides them, and lets them move again with moving or null', () => {
    const still = run(colorProject(), update('still'));
    expect(view(still.state).travelers).toBe('still');
    expect(still.label).toBe('Edit the view "Overview"');
    const hidden = run(still.state, update('hidden')).state;
    expect(view(hidden).travelers).toBe('hidden');
    expect(view(run(hidden, update('moving')).state)).not.toHaveProperty('travelers');
    expect(view(run(hidden, update(null)).state)).not.toHaveProperty('travelers');
  });

  it('refuses anything else', () => {
    expect(refusal(colorProject(), update('paused'))).toEqual(['invalid-command']);
    expect(refusal(colorProject(), update(true))).toEqual(['invalid-command']);
  });
});
