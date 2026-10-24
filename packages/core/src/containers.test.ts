import fc from 'fast-check';
import type { PackageFile, Relation } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { DATA_MODELING, SYSTEMS } from './builtin';
import { leavingRelations, nestingTypeFor, nestingTypesInView } from './containers';
import type { ProjectSnapshot } from './snapshot';
import { TEST_PACKAGE, testProject } from './test/fixtures';

/** The test project with a second relation type that nests, and a view arranged by both. */
function twoNestingTypes(): ProjectSnapshot {
  const project = testProject();
  const partOf = {
    id: 'test.part-of',
    name: 'is part of',
    derivesFrom: 'relates-to',
    direction: 'directed' as const,
    nests: true,
  };
  const [view] = project.views;
  if (!view) throw new Error('The test project has no view.');
  return {
    ...project,
    packages: [{ ...TEST_PACKAGE, relationTypes: [...TEST_PACKAGE.relationTypes, partOf] }],
    views: [{ ...view, nestingRelationTypes: ['test.part-of', 'test.inside'] }],
  };
}

const viewOf = (project: ProjectSnapshot) => {
  const [view] = project.views;
  if (!view) throw new Error('No view.');
  return view;
};

describe('nestingTypesInView', () => {
  it('keeps the view’s order, and drops types no package defines and types that do not nest', () => {
    const project = twoNestingTypes();
    const view = {
      ...viewOf(project),
      nestingRelationTypes: ['test.part-of', 'test.calls', 'other.nests', 'test.inside'],
    };
    expect(nestingTypesInView(project, view)).toEqual(['test.part-of', 'test.inside']);
  });

  it('drops a listed type once it no longer nests', () => {
    const project = twoNestingTypes();
    const turnedOff: ProjectSnapshot = {
      ...project,
      packages: project.packages.map((file) => ({
        ...file,
        relationTypes: file.relationTypes.map((type) =>
          type.id === 'test.inside' ? { ...type, nests: false } : type,
        ),
      })),
    };
    expect(nestingTypesInView(turnedOff, viewOf(turnedOff))).toEqual(['test.part-of']);
  });
});

describe('leavingRelations', () => {
  it('finds every relation of the view’s types that places an element in a container', () => {
    const project = twoNestingTypes();
    const second: Relation = {
      id: 'api-part-of-system',
      relationType: 'test.part-of',
      from: 'api',
      to: 'system',
    };
    const both = {
      ...project,
      model: { ...project.model, relations: [...project.model.relations, second] },
    };
    expect(
      leavingRelations(both, viewOf(both), 'api', 'system').map((relation) => relation.id),
    ).toEqual(['api-in-system', 'api-part-of-system']);
    expect(leavingRelations(both, viewOf(both), 'client', 'system')).toEqual([]);
    // Nothing places an element in World: it sits there when nothing else holds it.
    expect(leavingRelations(both, viewOf(both), 'system', undefined)).toEqual([]);
    expect(leavingRelations(both, viewOf(both), 'system', both.model.world.id)).toEqual([]);
  });

  it('leaves out relations of types the view is not arranged by', () => {
    const project = twoNestingTypes();
    const view = { ...viewOf(project), nestingRelationTypes: ['test.part-of'] };
    expect(leavingRelations(project, view, 'api', 'system')).toEqual([]);
  });
});

describe('nestingTypeFor', () => {
  const project = twoNestingTypes();
  const view = viewOf(project);
  const relation = (id: string, relationType: string): Relation => ({
    id,
    relationType,
    from: 'api',
    to: 'system',
  });

  it('keeps the type of the relations left, when they are all of one type', () => {
    expect(nestingTypeFor(project, view, [relation('a', 'test.inside')])).toBe('test.inside');
    expect(
      nestingTypeFor(project, view, [relation('a', 'test.inside'), relation('b', 'test.inside')]),
    ).toBe('test.inside');
  });

  it('takes the view’s first type otherwise, and none when the view has none', () => {
    expect(nestingTypeFor(project, view, [])).toBe('test.part-of');
    expect(
      nestingTypeFor(project, view, [relation('a', 'test.inside'), relation('b', 'test.part-of')]),
    ).toBe('test.part-of');
    expect(nestingTypeFor(project, { ...view, nestingRelationTypes: [] }, [])).toBeUndefined();
  });
});

/**
 * A project with Systems and Data modeling in use, an Appointments DB, a table and a column, and a
 * view nesting by the given types.
 */
function tables(nesting: string[]): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Tables', packages: ['systems', 'data-modeling'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'clinic', component: 'systems.system', name: 'Clinic' },
        { id: 'db', component: 'systems.database', name: 'Appointments DB' },
        { id: 'appointments', component: 'data-modeling.table', name: 'appointments' },
        { id: 'id', component: 'data-modeling.column', name: 'id' },
      ],
      relations: [],
    },
    packages: [SYSTEMS, DATA_MODELING],
    views: [
      {
        id: 'overview',
        name: 'Overview',
        perspective: { name: 'Data flow' },
        nestingRelationTypes: nesting,
        positions: [],
        freeShapes: [],
      },
    ],
    scenarios: [],
  };
}

describe('nestingTypeFor, by limits', () => {
  const sample = ['systems.is-part-of', 'data-modeling.is-column-of'];

  it('puts a column in a table through "is column of", whatever the view lists first', () => {
    expect(
      nestingTypeFor(tables(sample), 'overview', 'data-modeling.column', 'appointments'),
    ).toEqual({ relationType: 'data-modeling.is-column-of', addToView: false });
    // A view that does not nest by it yet is told to start.
    expect(nestingTypeFor(tables([]), 'overview', 'data-modeling.column', 'appointments')).toEqual({
      relationType: 'data-modeling.is-column-of',
      addToView: true,
    });
  });

  it('puts anything else through the type that accepts it, preferring the view’s', () => {
    expect(nestingTypeFor(tables(sample), 'overview', 'data-modeling.table', 'db')).toEqual({
      relationType: 'systems.is-part-of',
      addToView: false,
    });
    expect(
      nestingTypeFor(tables(['data-modeling.is-column-of']), 'overview', 'systems.box', 'clinic'),
    ).toEqual({ relationType: 'systems.is-part-of', addToView: true });
  });

  it('falls back on the view’s first type when no type accepts the ends, and has none in World', () => {
    const base = tables(['data-modeling.is-column-of']);
    const onlyTables: ProjectSnapshot = {
      ...base,
      project: { ...base.project, packages: ['data-modeling'] },
      packages: [DATA_MODELING],
      model: {
        ...base.model,
        elements: base.model.elements.filter((each) => each.component.startsWith('data-')),
      },
    };
    expect(nestingTypeFor(onlyTables, 'overview', 'data-modeling.table', 'appointments')).toEqual({
      relationType: 'data-modeling.is-column-of',
      addToView: false,
    });
    const nestingNothing: ProjectSnapshot = {
      ...onlyTables,
      views: [{ ...viewOf(onlyTables), nestingRelationTypes: [] }],
    };
    expect(
      nestingTypeFor(nestingNothing, 'overview', 'data-modeling.table', 'appointments'),
    ).toBeUndefined();
    expect(
      nestingTypeFor(tables(sample), 'overview', 'data-modeling.column', 'world'),
    ).toBeUndefined();
    expect(
      nestingTypeFor(tables(sample), 'nope', 'data-modeling.column', 'appointments'),
    ).toBeUndefined();
  });

  it('always ranks a type whose limits name both ends before one without limits', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(['test.loose', 'test.tight', 'test.inside']),
        fc.boolean(),
        (nesting, derived) => {
          const project = testProject();
          const own: PackageFile = {
            ...TEST_PACKAGE,
            components: [
              ...TEST_PACKAGE.components,
              { id: 'test.special', name: 'Special', derivesFrom: 'test.service' },
            ],
            relationTypes: [
              ...TEST_PACKAGE.relationTypes,
              { id: 'test.loose', name: 'loose', derivesFrom: 'relates-to', nests: true },
              {
                id: 'test.tight',
                name: 'tight',
                derivesFrom: 'relates-to',
                nests: true,
                limits: { from: ['test.service'], to: ['test.box'] },
              },
            ],
          };
          const state: ProjectSnapshot = {
            ...project,
            packages: [own],
            views: [{ ...viewOf(project), nestingRelationTypes: nesting }],
          };
          const component = derived ? 'test.special' : 'test.service';
          const choice = nestingTypeFor(state, 'overview', component, 'system');
          expect(choice).toEqual({
            relationType: 'test.tight',
            addToView: !nesting.includes('test.tight'),
          });
        },
      ),
    );
  });

  it('ranks by how near the limits name the ends', () => {
    const project = testProject();
    const own: PackageFile = {
      ...TEST_PACKAGE,
      relationTypes: [
        ...TEST_PACKAGE.relationTypes,
        {
          id: 'test.in-box',
          name: 'in a box',
          derivesFrom: 'relates-to',
          nests: true,
          limits: { from: ['test.box'], to: ['test.box'] },
        },
        {
          id: 'test.service-in-box',
          name: 'service in a box',
          derivesFrom: 'relates-to',
          nests: true,
          limits: { from: ['test.service'], to: ['test.box'] },
        },
      ],
    };
    const state = { ...project, packages: [own] };
    expect(nestingTypeFor(state, 'overview', 'test.service', 'system')?.relationType).toBe(
      'test.service-in-box',
    );
    expect(nestingTypeFor(state, 'overview', 'test.database', 'system')?.relationType).toBe(
      'test.in-box',
    );
  });
});
