import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import type { ProjectSnapshot } from './snapshot';
import { TEST_PACKAGE, testProject } from './test/fixtures';

function codes(change: (state: ProjectSnapshot) => void) {
  const state = testProject();
  change(state);
  const { errors, warnings } = checkProject(state);
  return { errors: errors.map((each) => each.code), warnings: warnings.map((each) => each.code) };
}

describe('checkProject', () => {
  it('finds nothing wrong with a sound project', () => {
    expect(checkProject(testProject())).toEqual({ errors: [], warnings: [] });
  });

  it('refuses ids used twice, by elements and relations alike, World included', () => {
    expect(
      codes((state) => {
        state.model.elements.push({ id: 'api', component: 'test.box', name: 'Second API' });
        state.model.elements.push({ id: 'world', component: 'test.box', name: 'Not World' });
        state.model.relations.push({
          id: 'db',
          relationType: 'test.calls',
          from: 'client',
          to: 'api',
        });
      }).errors,
    ).toEqual(['id-taken', 'id-taken', 'id-taken']);
  });

  it('refuses components and relation types defined twice', () => {
    expect(
      codes((state) => {
        state.packages = [TEST_PACKAGE, { ...TEST_PACKAGE, id: 'test2', name: 'Test 2' }];
      }).errors,
    ).toContain('defined-twice');
  });

  it('refuses repeated positions, free shapes, views, scenarios and steps', () => {
    const { errors } = codes((state) => {
      const view = state.views[0];
      const scenario = state.scenarios[0];
      if (!view || !scenario) throw new Error('fixture');
      view.positions.push({ element: 'api', container: 'system', x: 1, y: 1 });
      view.freeShapes.push({ kind: 'note', id: 'note', x: 0, y: 0, width: 1, height: 1, text: '' });
      state.views.push({ ...view, positions: [], freeShapes: [] });
      scenario.steps.push({ id: 'call', description: '', relations: ['api-reads-db'] });
      state.scenarios.push({ ...scenario, steps: [] });
    });
    expect(errors).toEqual(['id-taken', 'id-taken', 'id-taken', 'id-taken', 'id-taken']);
  });

  it('refuses what does not resolve: components, relation types, ends and views', () => {
    const { errors } = codes((state) => {
      state.model.elements.push({ id: 'ghost', component: 'test.nope', name: 'Ghost' });
      state.model.relations.push({ id: 'r1', relationType: 'test.nope', from: 'api', to: 'db' });
      state.model.relations.push({
        id: 'r2',
        relationType: 'test.calls',
        from: 'api',
        to: 'nowhere',
      });
      state.model.relations.push({ id: 'r3', relationType: 'test.calls', from: 'r3', to: 'api' });
      const scenario = state.scenarios[0];
      if (scenario) scenario.view = 'no-view';
    });
    expect(errors).toEqual([
      'unknown-component',
      'unknown-relation-type',
      'unknown-end',
      'unknown-end',
      'unknown-view',
    ]);
  });

  it('refuses containment cycles, nesting relations on relations and World inside anything', () => {
    const { errors } = codes((state) => {
      state.model.relations.push({
        id: 'loop',
        relationType: 'test.inside',
        from: 'system',
        to: 'api',
      });
      state.model.relations.push({
        id: 'odd',
        relationType: 'test.inside',
        from: 'client',
        to: 'api-reads-db',
      });
      state.model.relations.push({
        id: 'up',
        relationType: 'test.inside',
        from: 'world',
        to: 'client',
      });
    });
    expect(errors).toEqual(['nesting-end-not-element', 'world-not-allowed', 'containment-cycle']);
  });

  it('only warns about broken limits, stale positions and odd nesting choices', () => {
    const { errors, warnings } = codes((state) => {
      state.model.relations.push({
        id: 'odd-read',
        relationType: 'test.reads',
        from: 'db',
        to: 'api',
      });
      const view = state.views[0];
      if (!view) throw new Error('fixture');
      view.positions.push({ element: 'gone', x: 0, y: 0 });
      view.nestingRelationTypes.push('test.calls', 'test.nope');
    });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([
      'limit-broken',
      'limit-broken',
      'not-nesting',
      'unknown-relation-type',
      'unknown-position',
    ]);
  });

  it('keeps broken steps, which are not a problem of the files', () => {
    expect(
      codes((state) => {
        state.model.relations = state.model.relations.filter(
          (relation) => relation.id !== 'api-reads-db',
        );
      }),
    ).toEqual({ errors: [], warnings: [] });
  });
});
