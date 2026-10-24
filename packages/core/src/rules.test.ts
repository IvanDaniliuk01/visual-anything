import { describe, expect, it } from 'vitest';
import { containmentCycles, limitWarnings, previewDelete, wouldFormCycle } from './rules';
import { definitionsIn, modelIndexOf } from './state';
import type { ProjectSnapshot } from './snapshot';
import { testProject } from './test/fixtures';

describe('wouldFormCycle', () => {
  const index = modelIndexOf(testProject());

  it('finds a cycle when the container already sits inside the content', () => {
    expect(wouldFormCycle(index, 'system', 'api')).toBe(true);
    expect(wouldFormCycle(index, 'api', 'api')).toBe(true);
  });

  it('finds none for containment that keeps a tree', () => {
    expect(wouldFormCycle(index, 'client', 'system')).toBe(false);
    expect(wouldFormCycle(index, 'api', 'client')).toBe(false);
  });
});

describe('containmentCycles', () => {
  it('lists every cycle of a model that holds them', () => {
    const state = testProject();
    state.model.relations.push({
      id: 'loop',
      relationType: 'test.inside',
      from: 'system',
      to: 'api',
    });
    const index = modelIndexOf(state);
    expect(containmentCycles(index, ['system', 'api', 'db'])).toEqual([['system', 'api']]);
    expect(containmentCycles(modelIndexOf(testProject()), ['system', 'api', 'db'])).toEqual([]);
  });
});

describe('limitWarnings', () => {
  const state = testProject();
  const index = modelIndexOf(state);
  const definitions = definitionsIn(state);

  it('warns for each end outside the limits of the relation type and its ancestors', () => {
    const warnings = limitWarnings(
      { relationType: 'test.reads', from: 'db', to: 'api' },
      index,
      definitions,
    );
    expect(warnings.map((warning) => [warning.code, warning.subjects])).toEqual([
      ['limit-broken', ['db']],
      ['limit-broken', ['api']],
    ]);
  });

  it('accepts ends derived from what the limits name', () => {
    expect(
      limitWarnings({ relationType: 'test.reads', from: 'api', to: 'db' }, index, definitions),
    ).toEqual([]);
  });
});

describe('previewDelete', () => {
  it('cascades to the relations that end on what is deleted, through relations that end on relations', () => {
    const preview = previewDelete(testProject(), { elements: ['api'] });
    expect(preview.elements).toEqual(['api']);
    expect(preview.relations).toEqual([
      'api-in-system',
      'client-calls-api',
      'api-reads-db',
      'contract-governs-call',
    ]);
    expect(preview.cascaded).toEqual(preview.relations);
    expect(preview.positions).toEqual([{ view: 'overview', element: 'api', container: 'system' }]);
    expect(preview.brokenSteps).toEqual([
      { scenario: 'request', step: 'call' },
      { scenario: 'request', step: 'read' },
    ]);
    expect(preview.problems).toEqual([]);
  });

  it('removes the positions of shapes inside a deleted container, but not the elements', () => {
    const preview = previewDelete(testProject(), { elements: ['system'] });
    expect(preview.elements).toEqual(['system']);
    expect(preview.relations).toEqual(['api-in-system', 'db-in-system']);
    expect(preview.positions.map((position) => position.element)).toEqual(['system', 'api', 'db']);
  });

  it('cascades from a deleted relation to the relations that end on it', () => {
    const preview = previewDelete(testProject(), { relations: ['client-calls-api'] });
    expect(preview.relations).toEqual(['client-calls-api', 'contract-governs-call']);
    expect(preview.cascaded).toEqual(['contract-governs-call']);
  });

  it('refuses World and what does not exist', () => {
    const preview = previewDelete(testProject(), {
      elements: ['world', 'nothing'],
      relations: ['none'],
    });
    expect(preview.problems.map((each) => each.code)).toEqual([
      'world-not-allowed',
      'unknown-element',
      'unknown-relation',
    ]);
  });

  describe('of stacking orders', () => {
    const stacked = (): ProjectSnapshot => {
      const project = testProject();
      const [view] = project.views;
      if (!view) throw new Error('No view.');
      return {
        ...project,
        views: [{ ...view, stackingOrder: { system: ['db', 'api'], world: ['client', 'system'] } }],
      };
    };

    it('lists each id a delete takes out of a list, once', () => {
      expect(previewDelete(stacked(), { elements: ['db'] }).stacking).toEqual([
        { view: 'overview', container: 'system', element: 'db' },
      ]);
      // Deleting a container takes its whole list, and its id out of the list it sits in.
      expect(previewDelete(stacked(), { elements: ['system', 'db'] }).stacking).toEqual([
        { view: 'overview', container: 'system', element: 'db' },
        { view: 'overview', container: 'system', element: 'api' },
        { view: 'overview', container: 'world', element: 'system' },
      ]);
    });

    it('takes nothing out when a relation is deleted, nesting or not', () => {
      expect(previewDelete(stacked(), { relations: ['api-in-system'] }).stacking).toEqual([]);
    });
  });

  describe('what the deleted elements hold', () => {
    /**
     * Two tables drawn as rows: "orders" holds id and total, "invoices" holds tenant_id with orders;
     * total holds a note, and a server outside both holds total too in one case.
     */
    const tables = (shared = false): ProjectSnapshot => {
      const project = JSON.parse(JSON.stringify(testProject())) as ProjectSnapshot;
      const own = project.packages[0];
      own?.components.push({
        id: 'test.table',
        name: 'Table',
        derivesFrom: 'essence',
        appearance: { contentsAsRows: true },
      });
      project.model.elements.push(
        { id: 'orders', component: 'test.table', name: 'orders' },
        { id: 'invoices', component: 'test.table', name: 'invoices' },
        { id: 'order-id', component: 'test.box', name: 'id' },
        { id: 'total', component: 'test.box', name: 'total' },
        { id: 'tenant', component: 'test.box', name: 'tenant_id' },
        { id: 'note', component: 'test.box', name: 'note' },
      );
      project.model.relations.push(
        { id: 'r1', relationType: 'test.inside', from: 'order-id', to: 'orders' },
        { id: 'r2', relationType: 'test.inside', from: 'total', to: 'orders' },
        { id: 'r3', relationType: 'test.inside', from: 'tenant', to: 'orders' },
        { id: 'r4', relationType: 'test.inside', from: 'tenant', to: 'invoices' },
        { id: 'r5', relationType: 'test.inside', from: 'note', to: 'total' },
        ...(shared ? [{ id: 'r6', relationType: 'test.inside', from: 'total', to: 'system' }] : []),
      );
      return project;
    };

    it('groups the rows nothing else holds apart from what is also held elsewhere', () => {
      expect(previewDelete(tables(), { elements: ['orders'] }, 'overview').contents).toEqual([
        { element: 'order-id', group: 'rows' },
        { element: 'total', group: 'rows' },
        { element: 'tenant', group: 'other', elsewhere: 'invoices' },
        // Inside a row, so it goes with the row.
        { element: 'note', group: 'rows' },
      ]);
      expect(previewDelete(tables(true), { elements: ['orders'] }, 'overview').contents).toEqual([
        { element: 'order-id', group: 'rows' },
        { element: 'total', group: 'other', elsewhere: 'system' },
        { element: 'tenant', group: 'other', elsewhere: 'invoices' },
        // Total stays, and keeps holding it.
        { element: 'note', group: 'other', elsewhere: 'total' },
      ]);
    });

    it('counts nothing as rows without a view, or in a view that does not draw them', () => {
      expect(
        previewDelete(tables(), { elements: ['orders'] }).contents.map((each) => each.group),
      ).toEqual(['other', 'other', 'other', 'other']);
      const notNesting = tables();
      const view = notNesting.views[0];
      if (view) view.nestingRelationTypes = [];
      expect(
        previewDelete(notNesting, { elements: ['orders'] }, 'overview').contents.map(
          (each) => each.group,
        ),
      ).toEqual(['other', 'other', 'other', 'other']);
    });

    it('lists nothing the deletion already removes, and nothing for a plain container', () => {
      expect(
        previewDelete(tables(), { elements: ['orders', 'invoices', 'tenant'] }, 'overview')
          .contents,
      ).toEqual([
        { element: 'order-id', group: 'rows' },
        { element: 'total', group: 'rows' },
        { element: 'note', group: 'rows' },
      ]);
      expect(previewDelete(testProject(), { elements: ['system'] }, 'overview').contents).toEqual([
        { element: 'api', group: 'other' },
        { element: 'db', group: 'other' },
      ]);
    });
  });
});
