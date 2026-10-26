/**
 * The commands that store colors: a definition's appearance at the level the project can change it
 * (ADR-0034), a relation's own appearance and the colors of notes and free arrows (ADR-0035), and
 * every older command that stores a color. Each writes new colors in capitals, keeps the stored
 * spelling of the same color, and records nothing when the color is unchanged.
 */
import type { Appearance, ProjectAppearances, ProjectFile } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import { applyOperations } from './operations';
import type { ProblemCode } from './problems';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn } from './state';
import { colorProject, sequentialIds } from './test/fixtures';

function run(command: Command, state: ProjectSnapshot = colorProject()) {
  return executeCommand(state, command, { newId: sequentialIds() });
}

function ok(command: Command, state: ProjectSnapshot = colorProject()) {
  const outcome = run(command, state);
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function refused(command: Command, state?: ProjectSnapshot): ProblemCode[] {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

function messages(command: Command, state?: ProjectSnapshot): string[] {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.message);
}

function withAppearances(appearances: ProjectAppearances): ProjectSnapshot {
  const state = colorProject();
  return { ...state, project: { ...state.project, appearances } };
}

const setService = (appearance: Appearance | null): Command => ({
  type: 'set-component-appearance',
  component: 'systems.service',
  appearance,
});

function component(state: ProjectSnapshot, id: string) {
  return state.packages.flatMap((file) => file.components).find((each) => each.id === id);
}

function relationType(state: ProjectSnapshot, id: string) {
  return state.packages.flatMap((file) => file.relationTypes).find((each) => each.id === id);
}

/** The lines of the project file that differ between two states. */
function changedLines(before: ProjectFile, after: ProjectFile): string[] {
  const old = new Set(formatFile('project', before).split('\n'));
  return formatFile('project', after)
    .split('\n')
    .filter((line) => !old.has(line));
}

describe('set-component-appearance', () => {
  it('gives a built-in component a project appearance, in one change to the project file', () => {
    const outcome = ok(setService({ fill: '#ffe8d6', stroke: '#B4531A' }));
    expect(outcome.operations.map((each) => each.op)).toEqual(['set-project']);
    expect(outcome.state.project.appearances).toEqual({
      components: { 'systems.service': { fill: '#FFE8D6', stroke: '#B4531A' } },
    });
    expect(outcome.label).toBe('Change the appearance of the component "Service"');
    expect(definitionsIn(outcome.state).component('systems.mcp-server')?.appearance.stroke).toBe(
      '#0E6B61',
    );
    expect(definitionsIn(outcome.state).component('systems.service')?.appearance.fill).toBe(
      '#FFE8D6',
    );
    // The built-in package itself is not touched.
    expect(outcome.state.packages[0]).toBe(colorProject().packages[0]);
  });

  it('changes only the keys it sets, so that the file’s diff shows them alone', () => {
    const before = withAppearances({
      components: { 'systems.database': { fill: '#FFF3C9' } },
      relationTypes: { 'relates-to': { width: 1 } },
    });
    const outcome = ok(setService({ fill: '#FFE8D6' }), before);
    expect(changedLines(before.project, outcome.state.project)).toEqual([
      '      },',
      '      "systems.service": {',
      '        "fill": "#FFE8D6"',
    ]);
  });

  it('changes a project appearance trait by trait', () => {
    const before = withAppearances({ components: { 'systems.service': { fill: '#FFE8D6' } } });
    const outcome = ok(
      {
        type: 'set-component-appearance',
        component: 'systems.service',
        appearanceTraits: { stroke: '#b4531a', fill: null },
      },
      before,
    );
    expect(outcome.state.project.appearances).toEqual({
      components: { 'systems.service': { stroke: '#B4531A' } },
    });
  });

  it('removes it with null, and the maps it leaves empty with it', () => {
    const before = withAppearances({ components: { 'systems.service': { fill: '#FFE8D6' } } });
    const outcome = ok(setService(null), before);
    expect(outcome.state.project).toEqual(colorProject().project);
    expect('appearances' in outcome.state.project).toBe(false);
    expect(outcome.label).toBe('Reset the appearance of the component "Service"');
    const kept = withAppearances({
      components: { 'systems.service': { fill: '#FFE8D6' } },
      relationTypes: { 'relates-to': { width: 1 } },
    });
    expect(ok(setService(null), kept).state.project.appearances).toEqual({
      relationTypes: { 'relates-to': { width: 1 } },
    });
    // An empty appearance is none.
    expect(ok(setService({}), before).state.project).toEqual(colorProject().project);
  });

  it('gives Essence a project appearance', () => {
    const outcome = ok({
      type: 'set-component-appearance',
      component: 'essence',
      appearance: { stroke: '#222222' },
    });
    expect(outcome.state.project.appearances).toEqual({
      components: { essence: { stroke: '#222222' } },
    });
    expect(outcome.label).toBe('Change the appearance of the component "Essence"');
  });

  it('changes one of the project’s own components in its package, and forgets an entry the project kept for it', () => {
    const before = withAppearances({ components: { 'clinic.desk': { fill: '#000000' } } });
    const outcome = ok(
      {
        type: 'set-component-appearance',
        component: 'clinic.desk',
        appearance: { fill: '#dcebff' },
      },
      before,
    );
    expect(outcome.operations.map((each) => each.op)).toEqual(['replace', 'set-project']);
    expect(component(outcome.state, 'clinic.desk')?.appearance).toEqual({ fill: '#DCEBFF' });
    expect('appearances' in outcome.state.project).toBe(false);
    expect(outcome.label).toBe('Change the appearance of the component "Desk"');
    const traits = ok({
      type: 'set-component-appearance',
      component: 'clinic.desk',
      appearanceTraits: { stroke: null },
    });
    expect(component(traits.state, 'clinic.desk')?.appearance).toEqual({ fill: '#FFE8D6' });
    const reset = ok({
      type: 'set-component-appearance',
      component: 'clinic.desk',
      appearance: null,
    });
    expect(component(reset.state, 'clinic.desk')).not.toHaveProperty('appearance');
    expect(reset.label).toBe('Reset the appearance of the component "Desk"');
  });

  it('forgets an entry for a component no package defines, and refuses anything else for one', () => {
    const before = withAppearances({
      components: { 'nowhere.thing': { fill: '#000000' }, 'systems.service': { fill: '#FFE8D6' } },
    });
    const outcome = ok(
      { type: 'set-component-appearance', component: 'nowhere.thing', appearance: null },
      before,
    );
    expect(outcome.state.project.appearances).toEqual({
      components: { 'systems.service': { fill: '#FFE8D6' } },
    });
    expect(outcome.label).toBe('Forget the appearance given to "nowhere.thing"');
    expect(
      refused(
        {
          type: 'set-component-appearance',
          component: 'nowhere.thing',
          appearance: { fill: '#000000' },
        },
        before,
      ),
    ).toEqual(['unknown-component']);
    expect(
      refused({ type: 'set-component-appearance', component: 'nowhere.thing', appearance: null }),
    ).toEqual(['unknown-component']);
  });

  it('records nothing when the appearance is already the one stored, whatever the case', () => {
    const before = withAppearances({ components: { 'systems.service': { fill: '#ffe8d6' } } });
    const same = ok(setService({ fill: '#FFE8D6' }), before);
    expect(same.operations).toEqual([]);
    expect(same.state).toStrictEqual(before);
    const traits = ok(
      {
        type: 'set-component-appearance',
        component: 'systems.service',
        appearanceTraits: { fill: '#FfE8d6' },
      },
      before,
    );
    expect(traits.operations).toEqual([]);
    expect(ok(setService(null)).operations).toEqual([]);
    const own = ok({
      type: 'set-component-appearance',
      component: 'clinic.desk',
      appearance: { fill: '#ffe8d6', stroke: '#b4531a' },
    });
    expect(own.operations).toEqual([]);
  });

  it('refuses a whole appearance and changes together, or neither', () => {
    expect(
      refused({
        type: 'set-component-appearance',
        component: 'systems.service',
        appearance: { fill: '#FFFFFF' },
        appearanceTraits: { stroke: '#000000' },
      }),
    ).toEqual(['invalid-command']);
    expect(refused({ type: 'set-component-appearance', component: 'systems.service' })).toEqual([
      'invalid-command',
    ]);
  });

  it('refuses a detail that names an attribute the component does not have', () => {
    expect(refused(setService({ detail: { attributes: ['technology', 'nonsense'] } }))).toEqual([
      'unknown-attribute',
    ]);
    expect(ok(setService({ detail: { attributes: ['technology'] } })).ok).toBe(true);
  });
});

describe('set-relation-type-appearance', () => {
  it('gives a built-in relation type, or "relates to", a project appearance', () => {
    const outcome = ok({
      type: 'set-relation-type-appearance',
      relationType: 'systems.writes-to',
      appearance: { stroke: '#b42318', width: 3 },
    });
    expect(outcome.operations.map((each) => each.op)).toEqual(['set-project']);
    expect(outcome.state.project.appearances).toEqual({
      relationTypes: { 'systems.writes-to': { stroke: '#B42318', width: 3 } },
    });
    expect(outcome.label).toBe('Change the appearance of the relation type "writes to"');
    const relatesTo = ok({
      type: 'set-relation-type-appearance',
      relationType: 'relates-to',
      appearanceTraits: { dash: 'dotted' },
    });
    expect(relatesTo.state.project.appearances).toEqual({
      relationTypes: { 'relates-to': { dash: 'dotted' } },
    });
    expect(definitionsIn(relatesTo.state).relationType('systems.is-part-of')?.appearance.dash).toBe(
      'dotted',
    );
  });

  it('changes one of the project’s own in its package', () => {
    const outcome = ok({
      type: 'set-relation-type-appearance',
      relationType: 'clinic.escalates',
      appearanceTraits: { width: null, dash: 'dashed' },
    });
    expect(outcome.operations.map((each) => each.op)).toEqual(['replace']);
    expect(relationType(outcome.state, 'clinic.escalates')?.appearance).toEqual({
      stroke: '#B42318',
      dash: 'dashed',
    });
    const reset = ok({
      type: 'set-relation-type-appearance',
      relationType: 'clinic.escalates',
      appearance: null,
    });
    expect(reset.label).toBe('Reset the appearance of the relation type "escalates"');
    expect(relationType(reset.state, 'clinic.escalates')).not.toHaveProperty('appearance');
  });

  it('refuses an id no package defines, and traits a relation is not drawn with', () => {
    expect(
      refused({
        type: 'set-relation-type-appearance',
        relationType: 'nowhere.type',
        appearance: { stroke: '#000000' },
      }),
    ).toEqual(['unknown-relation-type']);
    expect(
      refused({
        type: 'set-relation-type-appearance',
        relationType: 'relates-to',
        appearance: { fill: '#000000' } as never,
      }),
    ).toEqual(['invalid-appearance']);
  });
});

describe('a relation’s own appearance', () => {
  it('is taken by create-relation, in capitals', () => {
    const outcome = ok({
      type: 'create-relation',
      relation: {
        relationType: 'systems.communicates-with',
        from: 'patient',
        to: 'whatsapp',
        appearance: { stroke: '#d6336c', dash: 'dashed' },
      },
    });
    const created = outcome.state.model.relations.at(-1);
    expect(created?.appearance).toEqual({ stroke: '#D6336C', dash: 'dashed' });
    expect(
      ok({
        type: 'create-relation',
        relation: { relationType: 'relates-to', from: 'patient', to: 'whatsapp', appearance: {} },
      }).state.model.relations.at(-1),
    ).not.toHaveProperty('appearance');
  });

  it('is replaced whole, changed trait by trait or removed by update-relation', () => {
    const whole = ok({
      type: 'update-relation',
      id: 'asks',
      changes: { appearance: { stroke: '#d6336c', width: 3 } },
    });
    const asks = (state: ProjectSnapshot) =>
      state.model.relations.find((relation) => relation.id === 'asks');
    expect(asks(whole.state)?.appearance).toEqual({ stroke: '#D6336C', width: 3 });
    expect(whole.label).toBe('Change the appearance of the relation "WhatsApp → Booking agent"');
    const traits = ok(
      { type: 'update-relation', id: 'asks', changes: { appearanceTraits: { width: null } } },
      whole.state,
    );
    expect(asks(traits.state)?.appearance).toEqual({ stroke: '#D6336C' });
    const reset = ok(
      { type: 'update-relation', id: 'asks', changes: { appearance: null } },
      traits.state,
    );
    expect(asks(reset.state)).not.toHaveProperty('appearance');
    expect(reset.label).toBe('Reset the appearance of the relation "WhatsApp → Booking agent"');
    const named = ok({
      type: 'update-relation',
      id: 'asks',
      changes: { name: 'asks for a slot', appearance: { dash: 'dotted' } },
    });
    expect(named.label).toBe('Edit the relation "asks for a slot"');
  });

  it('keeps the stored spelling of the same color', () => {
    const state = colorProject();
    const stored: ProjectSnapshot = {
      ...state,
      model: {
        ...state.model,
        relations: state.model.relations.map((relation) =>
          relation.id === 'asks' ? { ...relation, appearance: { stroke: '#d6336c' } } : relation,
        ),
      },
    };
    const outcome = ok(
      { type: 'update-relation', id: 'asks', changes: { appearance: { stroke: '#D6336C' } } },
      stored,
    );
    expect(outcome.state).toStrictEqual(stored);
  });

  it('refuses what is not a relation’s appearance', () => {
    expect(
      refused({ type: 'update-relation', id: 'asks', changes: { appearance: { stroke: 'red' } } }),
    ).toEqual(['invalid-appearance']);
    expect(
      refused({
        type: 'update-relation',
        id: 'asks',
        changes: { appearance: { stroke: '#000000' }, appearanceTraits: { width: 2 } },
      }),
    ).toEqual(['invalid-command']);
    expect(
      refused({
        type: 'create-relation',
        relation: {
          relationType: 'relates-to',
          from: 'patient',
          to: 'whatsapp',
          appearance: { width: 0 },
        },
      }),
    ).toEqual(['invalid-appearance']);
  });
});

describe('an element’s colors', () => {
  const agent = (state: ProjectSnapshot) =>
    state.model.elements.find((element) => element.id === 'agent');

  it('are stored in capitals by create-element and update-element', () => {
    const created = ok({
      type: 'create-element',
      element: { component: 'systems.service', name: 'Queue', appearance: { fill: '#abcdef' } },
    });
    expect(created.state.model.elements.at(-1)?.appearance).toEqual({ fill: '#ABCDEF' });
    const updated = ok({
      type: 'update-element',
      id: 'api',
      changes: { appearanceTraits: { stroke: '#b4531a' } },
    });
    expect(updated.state.model.elements.find((each) => each.id === 'api')?.appearance).toEqual({
      stroke: '#B4531A',
    });
    expect(updated.label).toBe('Change the appearance of "Appointments API"');
  });

  it('record nothing when picked again in another case', () => {
    const same = ok({
      type: 'update-element',
      id: 'agent',
      changes: { appearance: { stroke: '#d6336c' } },
    });
    expect(same.state).toStrictEqual(colorProject());
    const traits = ok({
      type: 'update-element',
      id: 'agent',
      changes: { appearanceTraits: { stroke: '#d6336C' } },
    });
    expect(agent(traits.state)).toStrictEqual(agent(colorProject()));
  });

  it('are reset with the whole appearance, and an empty appearance is none', () => {
    const reset = ok({ type: 'update-element', id: 'agent', changes: { appearance: null } });
    expect(agent(reset.state)).not.toHaveProperty('appearance');
    expect(reset.label).toBe('Reset the appearance of "Booking agent"');
    const empty = ok({ type: 'update-element', id: 'agent', changes: { appearance: {} } });
    expect(agent(empty.state)).not.toHaveProperty('appearance');
    const last = ok({
      type: 'update-element',
      id: 'agent',
      changes: { appearanceTraits: { stroke: null } },
    });
    expect(last.label).toBe('Reset the appearance of "Booking agent"');
  });

  it.each([
    ['the short form', '#fff'],
    ['an alpha', '#12345678'],
    ['a name', 'red'],
    ['rgb()', 'rgb(1, 2, 3)'],
    ['a number', 0],
    ['null', null],
  ])('are refused when written as %s', (_, value) => {
    expect(
      refused({
        type: 'update-element',
        id: 'api',
        changes: { appearance: { fill: value } as unknown as Appearance },
      }),
    ).toEqual(['invalid-appearance']);
    expect(
      refused({
        type: 'set-component-appearance',
        component: 'systems.service',
        appearance: { stroke: value } as unknown as Appearance,
      }),
    ).toEqual(['invalid-appearance']);
  });

  it('say what is wrong with a color', () => {
    expect(
      messages({ type: 'update-element', id: 'api', changes: { appearance: { fill: 'red' } } }),
    ).toEqual(['The fill of "Appointments API" must be a color written as #RRGGBB, not "red".']);
    expect(messages(setService({ opacity: 0.5 } as Appearance))).toEqual([
      'The appearance of the component "Service" has no trait "opacity".',
    ]);
  });

  it.each([
    ['a width of 0', { width: 0 }],
    ['a width that is not a number', { width: Number.NaN }],
    ['a height that is not finite', { height: Number.POSITIVE_INFINITY }],
    ['an unknown shape', { shape: 'hexagon' }],
  ])('are not all an appearance refuses: %s', (_, appearance) => {
    expect(refused(setService(appearance as Appearance))).toEqual(['invalid-appearance']);
  });
});

describe('the colors of definitions the project defines', () => {
  it('are stored in capitals by define-component and define-relation-type', () => {
    const outcome = ok({
      type: 'define-component',
      package: 'clinic',
      component: {
        id: 'clinic.queue',
        name: 'Queue',
        derivesFrom: 'systems.service',
        appearance: { fill: '#fff4e5', stroke: '#B4531a' },
      },
    });
    expect(component(outcome.state, 'clinic.queue')?.appearance).toEqual({
      fill: '#FFF4E5',
      stroke: '#B4531A',
    });
    const type = ok({
      type: 'define-relation-type',
      package: 'clinic',
      relationType: {
        id: 'clinic.pages',
        name: 'pages',
        derivesFrom: 'relates-to',
        appearance: { stroke: '#b42318' },
      },
    });
    expect(relationType(type.state, 'clinic.pages')?.appearance).toEqual({ stroke: '#B42318' });
    const plain = ok({
      type: 'define-relation-type',
      package: 'clinic',
      relationType: {
        id: 'clinic.plain',
        name: 'plain',
        derivesFrom: 'relates-to',
        appearance: {},
      },
    });
    expect(relationType(plain.state, 'clinic.plain')).not.toHaveProperty('appearance');
  });

  it('keep the stored spelling when a definition is redefined with the same colors', () => {
    const state = colorProject();
    const lower: ProjectSnapshot = {
      ...state,
      packages: state.packages.map((file) =>
        file.id === 'clinic'
          ? {
              ...file,
              components: file.components.map((each) =>
                each.id === 'clinic.desk'
                  ? { ...each, appearance: { fill: '#ffe8d6', stroke: '#b4531a' } }
                  : each,
              ),
            }
          : file,
      ),
    };
    const desk = component(lower, 'clinic.desk');
    if (!desk) throw new Error('No desk.');
    const outcome = ok(
      {
        type: 'define-component',
        package: 'clinic',
        component: { ...desk, appearance: { fill: '#FFE8D6', stroke: '#B4531A' } },
      },
      lower,
    );
    expect(component(outcome.state, 'clinic.desk')).toStrictEqual(desk);
    const updated = ok(
      {
        type: 'update-component',
        id: 'clinic.desk',
        changes: { appearance: { fill: '#FFE8D6' } },
      },
      lower,
    );
    expect(updated.operations).toEqual([]);
  });
});

describe('the colors of notes and free arrows', () => {
  const shapes = (state: ProjectSnapshot) => state.views[0]?.freeShapes ?? [];

  it('are taken when a note or an arrow is added, in capitals', () => {
    const note = ok({
      type: 'create-free-shape',
      view: 'overview',
      shape: {
        kind: 'note',
        x: 0,
        y: 100,
        width: 200,
        height: 60,
        text: 'Mind the calendar',
        fill: '#dcebff',
        stroke: '#1d4f91',
      },
    });
    expect(shapes(note.state).at(-1)).toMatchObject({ fill: '#DCEBFF', stroke: '#1D4F91' });
    const arrow = ok({
      type: 'create-free-shape',
      view: 'overview',
      shape: { kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 5, y: 5 }, stroke: '#b42318' },
    });
    expect(shapes(arrow.state).at(-1)).toMatchObject({ stroke: '#B42318' });
  });

  it('are changed by update-free-shape, which keeps them through other changes', () => {
    const [note, arrow] = shapes(colorProject());
    if (note?.kind !== 'note' || arrow?.kind !== 'arrow') throw new Error('No note or arrow.');
    const colored = ok({
      type: 'update-free-shape',
      view: 'overview',
      shape: { ...note, fill: '#fff4e5', stroke: '#B4531A' },
    });
    expect(colored.label).toBe('Change the colors of a note in "Overview"');
    expect(shapes(colored.state)[0]).toEqual({ ...note, fill: '#FFF4E5', stroke: '#B4531A' });
    const moved = ok(
      {
        type: 'update-free-shape',
        view: 'overview',
        shape: { ...note, x: 40, fill: '#fff4e5', stroke: '#B4531A' },
      },
      colored.state,
    );
    expect(moved.label).toBe('Edit a note in "Overview"');
    expect(shapes(moved.state)[0]).toEqual({ ...note, x: 40, fill: '#FFF4E5', stroke: '#B4531A' });
    // Picked again in another case: nothing changes.
    const same = ok(
      {
        type: 'update-free-shape',
        view: 'overview',
        shape: { ...note, x: 40, fill: '#FFF4E5', stroke: '#b4531a' },
      },
      moved.state,
    );
    expect(same.state).toStrictEqual(moved.state);
    const stroked = ok({
      type: 'update-free-shape',
      view: 'overview',
      shape: { ...arrow, stroke: '#b42318' },
    });
    expect(stroked.label).toBe('Change the color of an arrow in "Overview"');
    expect(shapes(stroked.state)[1]).toEqual({ ...arrow, stroke: '#B42318' });
    const theme = ok(
      { type: 'update-free-shape', view: 'overview', shape: { ...note, x: 40 } },
      moved.state,
    );
    expect(shapes(theme.state)[0]).toEqual({ ...note, x: 40 });
  });

  it('are reset when no color is left, and named so (ADR 0035)', () => {
    const [note, arrow] = shapes(colorProject());
    if (note?.kind !== 'note' || arrow?.kind !== 'arrow') throw new Error('No note or arrow.');
    const colored = ok({
      type: 'update-free-shape',
      view: 'overview',
      shape: { ...note, fill: '#FFF4E5', stroke: '#B4531A' },
    });
    // Taking one color out leaves the other: the colors change.
    const unfilled = ok(
      { type: 'update-free-shape', view: 'overview', shape: { ...note, stroke: '#B4531A' } },
      colored.state,
    );
    expect(unfilled.label).toBe('Change the colors of a note in "Overview"');
    const reset = ok({ type: 'update-free-shape', view: 'overview', shape: note }, unfilled.state);
    expect(reset.label).toBe('Reset the colors of a note in "Overview"');
    expect(shapes(reset.state)[0]).toEqual(note);
    const stroked = ok({
      type: 'update-free-shape',
      view: 'overview',
      shape: { ...arrow, stroke: '#B42318' },
    });
    const plain = ok({ type: 'update-free-shape', view: 'overview', shape: arrow }, stroked.state);
    expect(plain.label).toBe('Reset the color of an arrow in "Overview"');
  });

  it('are refused when they are not colors, and an arrow has no fill', () => {
    const [note, arrow] = shapes(colorProject());
    if (note?.kind !== 'note' || arrow?.kind !== 'arrow') throw new Error('No note or arrow.');
    expect(
      refused({ type: 'update-free-shape', view: 'overview', shape: { ...note, fill: 'yellow' } }),
    ).toEqual(['invalid-appearance']);
    expect(
      refused({
        type: 'update-free-shape',
        view: 'overview',
        shape: { ...arrow, fill: '#FFFFFF' } as never,
      }),
    ).toEqual(['invalid-appearance']);
    expect(
      refused({
        type: 'create-free-shape',
        view: 'overview',
        shape: { kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 5, y: 5 }, stroke: '#12345' },
      }),
    ).toEqual(['invalid-appearance']);
  });
});

describe('update-project', () => {
  it('forgets the project appearances of a package it stops using, and undo brings them back', () => {
    const withModeling = ok({
      type: 'update-project',
      changes: { packages: ['systems', 'clinic', 'data-modeling'] },
    }).state;
    const before: ProjectSnapshot = {
      ...withModeling,
      project: {
        ...withModeling.project,
        appearances: {
          components: {
            'data-modeling.table': { fill: '#FFFFFF' },
            'systems.service': { fill: '#FFE8D6' },
          },
          relationTypes: { 'data-modeling.references': { width: 1 } },
        },
      },
    };
    // `ok` checks that undoing it gives back exactly what was there.
    const outcome = ok(
      { type: 'update-project', changes: { packages: ['systems', 'clinic'] } },
      before,
    );
    expect(outcome.state.project.appearances).toEqual({
      components: { 'systems.service': { fill: '#FFE8D6' } },
    });
    expect(outcome.operations.filter((each) => each.op === 'set-project')).toHaveLength(1);
    const renamed = ok({ type: 'update-project', changes: { name: 'Renamed' } }, before);
    expect(renamed.state.project.appearances).toBe(before.project.appearances);
  });
});
