import { DATA_MODELING, SYSTEMS, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { builtInPackageRefusal } from './builtin-refusal';

/** A project that uses the packages given, built-in ones by id. */
function project(packages: ProjectSnapshot['packages'], uses: string[]): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Audit', packages: uses },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [],
      relations: [],
    },
    packages,
    views: [],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

const ownPostgres = {
  id: 'postgres',
  name: 'PostgreSQL',
  components: [],
  relationTypes: [],
};

describe('the refusal to define in a built-in package', () => {
  it('is nothing for a package of the project’s own', () => {
    const state = project([SYSTEMS, ownPostgres], ['systems', 'postgres']);
    expect(
      builtInPackageRefusal(state, 'component', 'postgres', {
        name: 'Vista',
        derivesFrom: 'essence',
      }),
    ).toBeUndefined();
  });

  it('names the project’s own package to derive in, with the call to make', () => {
    const state = project(
      [SYSTEMS, DATA_MODELING, ownPostgres],
      ['systems', 'data-modeling', 'postgres'],
    );
    expect(
      builtInPackageRefusal(state, 'component', 'data-modeling', {
        name: 'Partition',
        derivesFrom: 'data-modeling.table',
      }),
    ).toBe(
      'The package "data-modeling" is built in, and built-in packages are closed: no project adds to them or changes them. Derive the component in a package of the project’s own instead, as in define_component { "package": "postgres", "component": { "name": "Partition", "derivesFrom": "data-modeling.table" } }.',
    );
  });

  it('says how to make a package of the project’s own when it has none', () => {
    const state = project([SYSTEMS, DATA_MODELING], ['systems', 'data-modeling']);
    expect(
      builtInPackageRefusal(state, 'relation-type', 'data-modeling', {
        name: 'lee de',
        derivesFrom: 'relates-to',
      }),
    ).toBe(
      'The package "data-modeling" is built in, and built-in packages are closed: no project adds to them or changes them. The project has no package of its own yet: create one with create_package { "id": "my-components", "name": "My components" }, then derive the relation type there, as in define_relation_type { "package": "my-components", "relationType": { "name": "lee de", "derivesFrom": "relates-to" } }.',
    );
  });

  it('points to what the built-in package defines already under that name', () => {
    const state = project([SYSTEMS, DATA_MODELING], ['systems', 'data-modeling']);
    expect(
      builtInPackageRefusal(state, 'component', 'data-modeling', {
        name: 'view',
        derivesFrom: 'data-modeling.table',
      }),
    ).toMatch(
      /closed: no project adds to them or changes them\. Use "data-modeling\.view", which "data-modeling" defines already, or create a package of the project’s own with create_package \{ "id": "my-components", "name": "My components" \} and derive the component there, as in define_component/,
    );
    expect(
      builtInPackageRefusal(state, 'relation-type', 'data-modeling', {
        name: 'Reads from',
        derivesFrom: 'relates-to',
      }),
    ).toMatch(/Use "data-modeling\.reads-from", which "data-modeling" defines already/);
  });
});
