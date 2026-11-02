import {
  DATA_MODELING,
  SYSTEMS,
  definitionsOf,
  executeCommand,
  type Command,
  type IdGenerator,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createAtCommand } from '../../canvas/gestures';
import { loadSample } from '../../test/sample';
import {
  deriveCommand,
  isBuiltInDefinition,
  newDefinitionId,
  packageIdProblem,
  proposedPackageId,
  refusalOf,
  stopUsingPackageCommand,
  takenIn,
  unusedBuiltInPackages,
  startUsingPackageCommand,
  usersOf,
  withPackageInUse,
} from './commands';

const project = loadSample();
const VIEW = 'system-overview';

/** Ids that end in a fixed suffix, so that the commands can be compared whole. */
const fixed: IdGenerator = (base) => `${base}-abc123`;

/** The project after a command, which must be accepted. */
function after(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  return outcome.state;
}

/** The sample with no package of its own: what it defines and uses from Clinic is gone. */
function withoutOwnPackage(): ProjectSnapshot {
  const elements = project.model.elements.map((element) =>
    element.component === 'clinic.calendar'
      ? { ...element, component: 'systems.database' }
      : element,
  );
  return {
    ...project,
    project: { ...project.project, packages: ['systems'] },
    packages: project.packages.filter((file) => file.id !== 'clinic'),
    model: { ...project.model, elements },
  };
}

describe('startUsingPackageCommand', () => {
  it('starts using a built-in package and nests the open view by its nesting relation types, as one action', () => {
    const command = startUsingPackageCommand(project, 'data-modeling', VIEW);
    expect(command).toEqual({
      type: 'batch',
      label: 'Use the package "Data modeling"',
      commands: [
        { type: 'update-project', changes: { packages: ['systems', 'clinic', 'data-modeling'] } },
        {
          type: 'update-view',
          id: VIEW,
          changes: {
            nestingRelationTypes: ['systems.is-part-of', 'data-modeling.is-column-of'],
          },
        },
      ],
    });
    const outcome = executeCommand(project, command!);
    expect(outcome.ok && outcome.label).toBe('Use the package "Data modeling"');
  });

  it('leaves out of the view a nesting relation type that no package in use defines any more', () => {
    const stale: ProjectSnapshot = {
      ...project,
      views: project.views.map((view) => ({
        ...view,
        nestingRelationTypes: ['gone.holds', ...view.nestingRelationTypes],
      })),
    };
    const command = startUsingPackageCommand(stale, 'data-modeling', VIEW);
    expect(command?.commands[1]).toEqual({
      type: 'update-view',
      id: VIEW,
      changes: { nestingRelationTypes: ['systems.is-part-of', 'data-modeling.is-column-of'] },
    });
    expect(executeCommand(stale, command!).ok).toBe(true);
  });

  it('changes no view when none is open, or when the view already lists what the package nests by', () => {
    expect(startUsingPackageCommand(project, 'data-modeling', undefined)?.commands).toHaveLength(1);
    const listed: ProjectSnapshot = {
      ...project,
      views: project.views.map((view) => ({
        ...view,
        nestingRelationTypes: ['data-modeling.is-column-of', ...view.nestingRelationTypes],
      })),
    };
    const command = startUsingPackageCommand(listed, 'data-modeling', VIEW);
    expect(command?.commands).toEqual([
      { type: 'update-project', changes: { packages: ['systems', 'clinic', 'data-modeling'] } },
    ]);
    expect(executeCommand(listed, command!).ok).toBe(true);
  });

  it('starts using Machine learning with Data science pipelines, whose Model its own derives from', () => {
    const command = startUsingPackageCommand(project, 'machine-learning', VIEW);
    expect(command?.commands[1]).toEqual({
      type: 'update-view',
      id: VIEW,
      changes: { nestingRelationTypes: ['systems.is-part-of', 'machine-learning.is-part-of'] },
    });
    const state = after(project, command!);
    expect(state.project.packages).toEqual([
      'systems',
      'clinic',
      'data-science',
      'machine-learning',
    ]);
    expect(definitionsOf(state.packages).problems).toEqual([]);
  });

  it('is undefined for a package in use, or one that is not built in', () => {
    expect(startUsingPackageCommand(project, 'systems', VIEW)).toBeUndefined();
    expect(startUsingPackageCommand(project, 'clinic', VIEW)).toBeUndefined();
    expect(startUsingPackageCommand(project, 'neuroscience', VIEW)).toBeUndefined();
  });
});

describe('unusedBuiltInPackages', () => {
  it('lists the built-in packages the project does not use yet', () => {
    expect(unusedBuiltInPackages(project).map((file) => file.id)).toEqual([
      'data-modeling',
      'c4',
      'data-science',
      'machine-learning',
      'physical-ai',
      'process',
      'finance',
    ]);
    expect(
      unusedBuiltInPackages(
        after(project, startUsingPackageCommand(project, 'data-modeling')!),
      ).map((file) => file.id),
    ).toEqual(['c4', 'data-science', 'machine-learning', 'physical-ai', 'process', 'finance']);
  });
});

describe('withPackageInUse', () => {
  it('starts using the package, then creates from it, as one action of three commands', () => {
    const command = withPackageInUse(project, 'data-modeling', VIEW, 'Create "Table"', (state) =>
      createAtCommand(state, VIEW, 'data-modeling.table', { x: 40, y: 40 }, undefined),
    );
    expect(command).toEqual({
      type: 'batch',
      label: 'Create "Table"',
      commands: [
        { type: 'update-project', changes: { packages: ['systems', 'clinic', 'data-modeling'] } },
        {
          type: 'update-view',
          id: VIEW,
          changes: {
            nestingRelationTypes: ['systems.is-part-of', 'data-modeling.is-column-of'],
          },
        },
        {
          type: 'create-element',
          element: { component: 'data-modeling.table', name: 'Table' },
          positions: [{ view: VIEW, x: 40, y: 40 }],
        },
      ],
    });
    const outcome = executeCommand(project, command!);
    expect(outcome.ok && outcome.created).toHaveLength(1);
  });

  it('keeps working when the view lists a nesting relation type that no longer exists', () => {
    const stale: ProjectSnapshot = {
      ...project,
      views: project.views.map((view) => ({
        ...view,
        nestingRelationTypes: [...view.nestingRelationTypes, 'gone.holds'],
      })),
    };
    const command = withPackageInUse(stale, 'data-modeling', VIEW, 'Create "Table"', (state) =>
      createAtCommand(state, VIEW, 'data-modeling.table', { x: 0, y: 0 }, undefined),
    );
    expect(command?.type === 'batch' && command.commands).toHaveLength(3);
    expect(executeCommand(stale, command!).ok).toBe(true);
  });

  it('only creates when the package is in use already, and gives up when nothing is made', () => {
    const command = withPackageInUse(project, 'systems', VIEW, 'Create "Person"', (state) =>
      createAtCommand(state, VIEW, 'systems.person', { x: 0, y: 0 }, undefined),
    );
    expect(command?.type).toBe('create-element');
    expect(
      withPackageInUse(project, 'data-modeling', VIEW, 'Create', () => undefined),
    ).toBeUndefined();
  });
});

describe('deriveCommand', () => {
  it('derives a component into a package of the project’s own, create-only, with an id the app makes', () => {
    const { command, id } = deriveCommand(
      project,
      {
        of: 'component',
        base: 'systems.database',
        name: 'Queue store',
        into: { package: 'clinic' },
      },
      fixed,
    );
    expect(id).toBe('clinic.queue-store-abc123');
    expect(command).toEqual({
      type: 'batch',
      label: 'Derive the component "Queue store"',
      commands: [
        {
          type: 'define-component',
          package: 'clinic',
          component: { id, name: 'Queue store', derivesFrom: 'systems.database' },
          createOnly: true,
        },
      ],
    });
    const state = after(project, command);
    expect(definitionsOf(state.packages).component(id)?.lineage).toEqual([
      id,
      'systems.database',
      'systems.box',
      'essence',
    ]);
  });

  it('creates the package first when the project has none of its own, and uses the new component for an element', () => {
    const flat = withoutOwnPackage();
    const { command, id } = deriveCommand(
      flat,
      {
        of: 'component',
        base: 'systems.database',
        name: 'Database',
        into: { newPackage: { id: 'my-systems', name: 'My systems' } },
        useFor: 'appointments-db',
      },
      fixed,
    );
    expect(id).toBe('my-systems.database-abc123');
    expect(command.type === 'batch' && command.commands).toEqual([
      { type: 'create-package', package: { id: 'my-systems', name: 'My systems' } },
      {
        type: 'define-component',
        package: 'my-systems',
        component: { id, name: 'Database', derivesFrom: 'systems.database' },
        createOnly: true,
      },
      { type: 'update-element', id: 'appointments-db', changes: { component: id } },
    ]);
    const state = after(flat, command);
    expect(state.model.elements.find((each) => each.id === 'appointments-db')?.component).toBe(id);
  });

  it('derives a relation type and uses it for a relation', () => {
    const { command, id } = deriveCommand(
      project,
      {
        of: 'relation-type',
        base: 'systems.communicates-with',
        name: 'asks',
        into: { package: 'clinic' },
        useFor: 'agent-to-api',
      },
      fixed,
    );
    expect(command).toEqual({
      type: 'batch',
      label: 'Derive the relation type "asks"',
      commands: [
        {
          type: 'define-relation-type',
          package: 'clinic',
          relationType: { id, name: 'asks', derivesFrom: 'systems.communicates-with' },
          createOnly: true,
        },
        { type: 'update-relation', id: 'agent-to-api', changes: { relationType: id } },
      ],
    });
    expect(executeCommand(project, command).ok).toBe(true);
  });

  it('says it defines a new one when it derives from Essence or “relates to”', () => {
    const component = deriveCommand(
      project,
      { of: 'component', base: 'essence', name: 'Queue', into: { package: 'clinic' } },
      fixed,
    );
    expect(component.command.type === 'batch' && component.command.label).toBe(
      'Define the component "Queue"',
    );
    const relationType = deriveCommand(
      project,
      { of: 'relation-type', base: 'relates-to', name: 'feeds', into: { package: 'clinic' } },
      fixed,
    );
    expect(relationType.command.type === 'batch' && relationType.command.label).toBe(
      'Define the relation type "feeds"',
    );
  });
});

describe('newDefinitionId', () => {
  it('starts with its package’s id, ends in six base-36 characters and never repeats an id the project holds', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), (name) => {
        const id = newDefinitionId(project, 'clinic', name);
        expect(id).toMatch(/^clinic\.[a-z0-9-]+-[0-9a-z]{6}$/);
        expect(takenIn(project)(id)).toBe(false);
      }),
    );
  });

  it('makes another id when the first one is taken', () => {
    const tries = ['clinic.calendar', 'scheduling', 'clinic.calendar-k3f9q2'];
    const generate: IdGenerator = () => tries.shift() ?? 'clinic.none';
    expect(newDefinitionId(project, 'clinic', 'Calendar', generate)).toBe('clinic.calendar-k3f9q2');
  });

  it('counts as taken every element, relation, view, scenario, package and definition id', () => {
    const taken = takenIn(project);
    for (const id of [
      'world',
      'patient',
      'agent-to-api',
      VIEW,
      'patient-books-appointment',
      'clinic',
      'clinic.calendar',
      'systems.box',
      'clinic.reminds',
      'essence',
      'relates-to',
    ]) {
      expect(taken(id)).toBe(true);
    }
    expect(taken('clinic.queue-abc123')).toBe(false);
  });
});

describe('package ids', () => {
  it('proposes an id made from the name that nothing holds', () => {
    expect(proposedPackageId(project, 'My systems')).toBe('my-systems');
    expect(proposedPackageId(project, 'Clinic')).toBe('clinic-2');
    expect(proposedPackageId(project, 'Data modeling')).toBe('data-modeling-2');
    expect(proposedPackageId(project, '***')).toBe('package');
  });

  it('says why an id cannot be a new package’s', () => {
    expect(packageIdProblem(project, 'my-systems')).toBeUndefined();
    expect(packageIdProblem(project, 'systems')).toBe(
      'The id "systems" is the built-in package Systems’s. Give the package another one.',
    );
    expect(packageIdProblem(project, 'neuroscience')).toBe(
      'Visual Anything keeps the id "neuroscience" for a package it plans to build in. Give the package another one.',
    );
    expect(packageIdProblem(project, 'clinic')).toBe(
      'The project already has the package "clinic".',
    );
    expect(packageIdProblem(project, 'scheduling')).toBe(
      'Something in the project already has the id "scheduling".',
    );
    expect(packageIdProblem(project, 'my systems')).toBe(
      'An id is letters, digits, dots, dashes and underscores, starting with a letter or a digit.',
    );
    expect(packageIdProblem(project, '')).toBe('A package needs an id.');
  });
});

describe('refusalOf', () => {
  it('gives the first problem the core finds on the app’s copy, and nothing for a command it accepts', () => {
    expect(
      refusalOf(project, {
        type: 'update-component',
        id: 'systems.database',
        changes: { name: 'Store' },
      })?.code,
    ).toBe('built-in-package');
    expect(
      refusalOf(project, {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { name: 'Agenda' },
      }),
    ).toBeUndefined();
  });
});

describe('stopUsingPackageCommand', () => {
  it('lists every package in use but this one', () => {
    const state = after(project, startUsingPackageCommand(project, 'data-modeling')!);
    const command = stopUsingPackageCommand(state, 'data-modeling');
    expect(command).toEqual({
      type: 'update-project',
      changes: { packages: ['systems', 'clinic'] },
    });
    expect(executeCommand(state, command).ok).toBe(true);
    expect(refusalOf(project, stopUsingPackageCommand(project, 'clinic'))?.code).toBe('in-use');
  });

  it('first takes its relation types out of the views that nest by them, as using it put them there', () => {
    const state = after(project, startUsingPackageCommand(project, 'data-modeling', VIEW)!);
    const command = stopUsingPackageCommand(state, 'data-modeling');
    expect(command).toEqual({
      type: 'batch',
      label: 'Stop using the package "Data modeling"',
      commands: [
        {
          type: 'update-view',
          id: VIEW,
          changes: { nestingRelationTypes: ['systems.is-part-of'] },
        },
        { type: 'update-project', changes: { packages: ['systems', 'clinic'] } },
      ],
    });
    const stopped = after(state, command);
    expect(stopped.views[0]?.nestingRelationTypes).toEqual(project.views[0]?.nestingRelationTypes);
    expect(stopped.project).toEqual(project.project);
  });
});

describe('usersOf', () => {
  it('names the elements created from a component and the components derived from it', () => {
    const definitions = definitionsOf(project.packages);
    expect(usersOf(project, definitions, 'clinic.calendar')).toEqual({
      elements: ['appointments-db'],
      relations: [],
      derived: [],
      limits: [],
      badges: [],
      views: [],
    });
    expect(usersOf(project, definitions, 'systems.database').derived).toEqual(['clinic.calendar']);
    expect(usersOf(project, definitions, 'systems.person')).toMatchObject({
      elements: ['patient'],
      limits: ['clinic.reminds'],
    });
  });

  it('names the relations of a relation type, the views that nest by it and the badges that name it', () => {
    const state = after(project, startUsingPackageCommand(project, 'data-modeling', VIEW)!);
    const definitions = definitionsOf(state.packages);
    expect(usersOf(state, definitions, 'systems.is-part-of')).toMatchObject({
      relations: [
        'whatsapp-in-clinic',
        'agent-in-clinic',
        'scheduling-in-clinic',
        'api-in-scheduling',
        'db-in-scheduling',
        'reminders-in-scheduling',
      ],
      views: [VIEW],
    });
    expect(usersOf(state, definitions, 'data-modeling.references').badges).toEqual([
      'data-modeling.column',
    ]);
  });
});

describe('isBuiltInDefinition', () => {
  it('tells built-in definitions from the project’s own', () => {
    const definitions = definitionsOf([...project.packages, DATA_MODELING]);
    const builtIn = (kind: 'component' | 'relation-type', id: Id) =>
      isBuiltInDefinition(definitions, kind, id);
    expect(builtIn('component', 'essence')).toBe(true);
    expect(builtIn('component', SYSTEMS.components[0]!.id)).toBe(true);
    expect(builtIn('component', 'data-modeling.table')).toBe(true);
    expect(builtIn('relation-type', 'relates-to')).toBe(true);
    expect(builtIn('component', 'clinic.calendar')).toBe(false);
    expect(builtIn('relation-type', 'clinic.reminds')).toBe(false);
  });
});
