/**
 * Claude's duplicate_elements (ADR 0103): new elements with what they hold and the relations among
 * them, as one undoable action of Claude's.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

const elementNamed = (id: unknown) =>
  tools.session.snapshot.model.elements.find((element) => element.id === id);

describe('duplicate_elements', () => {
  it('duplicates a container with what it holds, and answers the duplicates by their originals', async () => {
    const result = await tools.value('duplicate_elements', {
      view: 'overview',
      elements: ['system'],
      positions: [{ element: 'system', x: 600, y: 0 }],
    });
    expect(result).toMatchObject({ done: 'Duplicate "Shop system"' });
    const [made] = result.duplicates as { of: string; id: string }[];
    expect(made?.of).toBe('system');
    expect(elementNamed(made?.id)?.name).toBe('Shop system (copy)');
    // The system, its API and DB, their two nesting relations and "reads from".
    expect(result.created).toHaveLength(6);
    const inside = tools.session.snapshot.model.relations.filter(
      (relation) => relation.to === made?.id,
    );
    expect(inside.map((relation) => elementNamed(relation.from)?.name).sort()).toEqual([
      'API',
      'DB',
    ]);
    const view = tools.session.snapshot.views.find((each) => each.id === 'overview');
    expect(view?.positions).toContainEqual({
      element: made?.id,
      x: 600,
      y: 0,
      width: 400,
      height: 300,
    });
  });

  it('duplicates into a container, and beside the originals', async () => {
    const into = await tools.value('duplicate_elements', {
      view: 'overview',
      elements: ['customer'],
      into: 'system',
    });
    const [inSystem] = into.duplicates as { id: string }[];
    expect(elementNamed(inSystem?.id)?.name).toBe('Customer');
    const beside = await tools.value('duplicate_elements', {
      view: 'overview',
      elements: ['api'],
      beside: true,
    });
    const [nextToApi] = beside.duplicates as { id: string }[];
    expect(elementNamed(nextToApi?.id)?.name).toBe('API (copy)');
    expect(
      tools.session.snapshot.model.relations.find((relation) => relation.from === nextToApi?.id),
    ).toMatchObject({ relationType: 'systems.is-part-of', to: 'system' });
  });

  it('refuses World, and changes nothing', async () => {
    const before = tools.session.snapshot;
    expect(
      await tools.failure('duplicate_elements', { view: 'overview', elements: ['world'] }),
    ).toMatch(/^Refused, so nothing changed: .*world-not-allowed/);
    expect(tools.session.snapshot).toBe(before);
  });
});
