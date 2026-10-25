/** Projects for the import tests: one that uses the built-in Systems and Data modeling packages. */
import { DATA_MODELING } from '../../builtin/data-modeling';
import { SYSTEMS } from '../../builtin/systems';
import type { ProjectSnapshot } from '../../snapshot';

/** A project with no elements that uses Systems, and Data modeling when asked. */
export function systemsProject(withDataModeling = false): ProjectSnapshot {
  const packages = withDataModeling ? [SYSTEMS, DATA_MODELING] : [SYSTEMS];
  return {
    project: {
      schemaVersion: 1,
      name: 'Imports',
      packages: packages.map((file) => file.id),
    },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [],
      relations: [],
    },
    packages,
    views: [
      {
        id: 'overview',
        name: 'Overview',
        perspective: { name: 'Structure' },
        nestingRelationTypes: ['systems.is-part-of'],
        positions: [],
        freeShapes: [],
      },
    ],
    scenarios: [],
  };
}
