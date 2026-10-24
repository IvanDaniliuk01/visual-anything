import type { Relation } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
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
