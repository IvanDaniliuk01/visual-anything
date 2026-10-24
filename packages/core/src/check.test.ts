import type { PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import type { ProjectSnapshot } from './snapshot';
import { TEST_PACKAGE, colorProject, testProject } from './test/fixtures';

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

  it('warns about stacking lists that name no element, and refuses an id named twice in one', () => {
    const state = testProject();
    const [view] = state.views;
    if (!view) throw new Error('fixture');
    view.stackingOrder = { world: ['client'], gone: ['system'], system: ['db', 'nothing'] };
    const { errors, warnings } = checkProject(state);
    expect(errors).toEqual([]);
    expect(warnings.map((each) => [each.code, each.message, each.subjects])).toEqual([
      [
        'unknown-element',
        'The view "Overview" keeps a stacking order for "gone", which is no element of the model; it is ignored.',
        ['overview'],
      ],
      [
        'unknown-element',
        'The stacking order of "System" in the view "Overview" names "nothing", which is no element of the model; it is ignored.',
        ['overview'],
      ],
    ]);
    view.stackingOrder = { system: ['db', 'api', 'db'] };
    expect(
      checkProject(state).errors.map((each) => [each.code, each.message, each.subjects]),
    ).toEqual([
      [
        'id-taken',
        'The stacking order of "System" in the view "Overview" names "db" more than once.',
        ['overview'],
      ],
    ]);
  });

  it('refuses a project saved in a newer format', () => {
    const state = testProject();
    state.project = { ...state.project, schemaVersion: 2 as 1 };
    expect(checkProject(state).errors.map((each) => [each.code, each.message])).toEqual([
      [
        'newer-format',
        'This project was saved by a newer Visual Anything, format 2. Update the program to open it.',
      ],
    ]);
  });

  it('only warns about appearances, limits and values that name or hold what does not fit', () => {
    const state = JSON.parse(JSON.stringify(testProject())) as ProjectSnapshot;
    const own = state.packages[0] as PackageFile;
    own.components.push(
      {
        id: 'test.odd',
        name: 'Odd',
        derivesFrom: 'test.database',
        attributes: [{ name: 'tier', type: 'string', choices: ['gold', 'silver'] }],
        appearance: {
          contentsAsRows: true,
          detail: {
            attributes: ['missing'],
            badges: [{ when: 'from-end', text: 'X', relationType: 'test.nothing' }],
          },
          connectionPoints: [
            { name: 'in', side: 'left', at: 0.5 },
            { name: 'in', side: 'right', at: 0.5 },
          ],
        },
      },
      // Inherits both the rows and the cylinder, and sets neither: only "Odd" is warned about.
      { id: 'test.odder', name: 'Odder', derivesFrom: 'test.odd' },
    );
    own.relationTypes.push({
      id: 'test.feeds',
      name: 'feeds',
      derivesFrom: 'relates-to',
      limits: { to: ['test.nowhere'] },
    });
    state.model.elements.push(
      ...Array.from({ length: 22 }, (_, at) => ({
        id: `odd-${at}`,
        component: 'test.odd',
        name: `Odd ${at}`,
        attributes: { tier: 'bronze' },
      })),
      {
        id: 'mine',
        component: 'test.box',
        name: 'Mine',
        appearance: { detail: { attributes: ['owner', 'gone'] } },
      },
    );
    state.packages.push({ id: 'neuroscience', name: 'Mine', components: [], relationTypes: [] });
    state.project.packages.push('neuroscience');
    const [view] = state.views;
    if (view) view.collapsed = ['gone', 'system'];

    const { errors, warnings } = checkProject(state);
    expect(errors).toEqual([]);
    const counted = new Map<string, number>();
    for (const each of warnings) counted.set(each.code, (counted.get(each.code) ?? 0) + 1);
    expect(Object.fromEntries(counted)).toEqual({
      'unknown-attribute': 2,
      'unknown-relation-type': 1,
      'invalid-appearance': 2,
      'unknown-component': 1,
      'choice-broken': 21,
      'built-in-package': 1,
      'unknown-element': 1,
    });
    expect(warnings.filter((each) => each.code === 'choice-broken').at(-1)?.message).toBe(
      '…and 2 more values are outside their choices.',
    );
    expect(warnings.find((each) => each.code === 'built-in-package')?.message).toBe(
      'The package "neuroscience" takes an id Visual Anything keeps for a package it plans to build in; rename it before that package ships.',
    );
  });

  it('only warns about project appearances that have no effect, and the project still opens', () => {
    const state = colorProject();
    state.project.appearances = {
      components: {
        'systems.service': { fill: '#FFE8D6' },
        'clinic.desk': { fill: '#000000' },
        'nowhere.thing': { fill: '#000000' },
        'systems.database': { detail: { attributes: ['nonsense'] } },
      },
      relationTypes: { 'clinic.reminds': { width: 4 }, 'relates-to': { dash: 'dotted' } },
    };
    const { errors, warnings } = checkProject(state);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([
      {
        code: 'appearance-not-used',
        message:
          'The project gives "Desk" an appearance, but it belongs to the project’s package "clinic"; set it there. This entry is ignored.',
        subjects: ['clinic.desk'],
      },
      {
        code: 'appearance-not-used',
        message:
          'The project gives "nowhere.thing" an appearance, but no package in use defines it; it is ignored.',
        subjects: ['nowhere.thing'],
      },
      {
        code: 'unknown-attribute',
        message:
          'The detail of the project appearance of "Database" writes "nonsense", which it does not have.',
        subjects: ['systems.database'],
      },
      {
        code: 'appearance-not-used',
        message:
          'The project gives "reminds" an appearance, but it belongs to the project’s package "clinic"; set it there. This entry is ignored.',
        subjects: ['clinic.reminds'],
      },
    ]);
    expect(checkProject(colorProject())).toEqual({ errors: [], warnings: [] });
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
