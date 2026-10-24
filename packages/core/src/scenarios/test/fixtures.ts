/** A project for the scenario tests: containers two levels deep, a relation on a relation, a scenario. */
import type { Id, ScenarioFile, Step, ViewFile } from '@visual-anything/schema';
import type { ProjectSnapshot } from '../../snapshot';
import { TEST_PACKAGE } from '../../test/fixtures';

/**
 * World holds a client, a contract and a system. The system holds an API, a DB and a store; the store
 * holds a worker and a blob. The cache sits in both the system and the store.
 *
 * Relations: the client calls the API (into the system), the API reads the DB (inside the system), the
 * API calls the worker (inside the system, into the store), the worker reads the blob (inside the
 * store), the worker reads the cache (inside the store), and the contract governs the client's call.
 */
export function scenarioProject(collapsed?: Id[]): ProjectSnapshot {
  const view: ViewFile & { collapsed?: Id[] } = {
    id: 'overview',
    name: 'Overview',
    perspective: { name: 'Data flow' },
    nestingRelationTypes: ['test.inside'],
    positions: [],
    freeShapes: [],
    ...(collapsed ? { collapsed } : {}),
  };
  return {
    project: { schemaVersion: 1, name: 'Scenario project', packages: ['test'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'client', component: 'test.service', name: 'Client' },
        { id: 'contract', component: 'test.box', name: 'Contract' },
        { id: 'system', component: 'test.box', name: 'System' },
        { id: 'api', component: 'test.service', name: 'API' },
        { id: 'db', component: 'test.database', name: 'DB' },
        { id: 'store', component: 'test.box', name: 'Store' },
        { id: 'worker', component: 'test.service', name: 'Worker' },
        { id: 'blob', component: 'test.database', name: 'Blob' },
        { id: 'cache', component: 'test.database', name: 'Cache' },
      ],
      relations: [
        { id: 'api-in-system', relationType: 'test.inside', from: 'api', to: 'system' },
        { id: 'db-in-system', relationType: 'test.inside', from: 'db', to: 'system' },
        { id: 'store-in-system', relationType: 'test.inside', from: 'store', to: 'system' },
        { id: 'worker-in-store', relationType: 'test.inside', from: 'worker', to: 'store' },
        { id: 'blob-in-store', relationType: 'test.inside', from: 'blob', to: 'store' },
        { id: 'cache-in-system', relationType: 'test.inside', from: 'cache', to: 'system' },
        { id: 'cache-in-store', relationType: 'test.inside', from: 'cache', to: 'store' },
        { id: 'client-calls-api', relationType: 'test.calls', from: 'client', to: 'api' },
        { id: 'api-reads-db', relationType: 'test.reads', from: 'api', to: 'db' },
        { id: 'api-calls-worker', relationType: 'test.calls', from: 'api', to: 'worker' },
        { id: 'worker-reads-blob', relationType: 'test.reads', from: 'worker', to: 'blob' },
        { id: 'worker-reads-cache', relationType: 'test.reads', from: 'worker', to: 'cache' },
        {
          id: 'contract-governs-call',
          relationType: 'test.governs',
          from: 'contract',
          to: 'client-calls-api',
        },
      ],
    },
    packages: [TEST_PACKAGE],
    views: [view],
    scenarios: [
      scenario([
        step('call', 'client-calls-api'),
        step('read', 'api-reads-db'),
        step('delegate', 'api-calls-worker'),
        step('fetch', 'worker-reads-blob'),
        step('answer', 'client-calls-api'),
      ]),
    ],
  };
}

/** A step with these relations, described by its id. */
export function step(id: Id, ...relations: Id[]): Step {
  return { id, description: `The ${id} step.`, relations };
}

/** The scenario over the overview, with these steps. */
export function scenario(steps: Step[]): ScenarioFile {
  return { id: 'request', name: 'A request', view: 'overview', steps };
}

/** The project with the scenario's steps replaced. */
export function withSteps(project: ProjectSnapshot, steps: Step[]): ProjectSnapshot {
  return { ...project, scenarios: [scenario(steps)] };
}

/** The project's scenario. */
export function theScenario(project: ProjectSnapshot): ScenarioFile {
  const [found] = project.scenarios;
  if (!found) throw new Error('The project has no scenario.');
  return found;
}
