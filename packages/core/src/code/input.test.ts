import { describe, expect, it } from 'vitest';
import { testProject } from '../test/fixtures';
import { hookInputOf, modelReaderOf } from './input';
import { CODE_LIMITS } from './limits';

describe('hookInputOf', () => {
  it('gives the element with its values, its component, its relations, their ends, its containers and contents', () => {
    const input = hookInputOf(testProject(), 'api');
    expect(input).toEqual({
      element: {
        id: 'api',
        name: 'API',
        component: 'test.service',
        // Its own value, then its component's defaults; "owner" has none.
        attributes: { latency: 20 },
      },
      context: {
        component: {
          id: 'test.service',
          name: 'Service',
          package: 'test',
          lineage: ['test.service', 'test.box', 'essence'],
        },
        relations: [
          {
            id: 'api-in-system',
            relationType: 'test.inside',
            from: 'api',
            to: 'system',
            attributes: {},
          },
          {
            id: 'client-calls-api',
            relationType: 'test.calls',
            from: 'client',
            to: 'api',
            attributes: {},
          },
          { id: 'api-reads-db', relationType: 'test.reads', from: 'api', to: 'db', attributes: {} },
        ],
        ends: [
          { id: 'system', kind: 'element', name: 'System', component: 'test.box' },
          { id: 'client', kind: 'element', name: 'Client', component: 'test.service' },
          { id: 'db', kind: 'element', name: 'DB', component: 'test.database' },
        ],
        containers: [{ id: 'system', name: 'System', component: 'test.box' }],
        contents: [],
      },
    });
  });

  it('gives defaults for the values an element does not set, and a relation as an end', () => {
    const input = hookInputOf(testProject(), 'client');
    expect(input?.element.attributes).toEqual({ latency: 100 });
    const contract = hookInputOf(testProject(), 'contract');
    expect(contract?.context.ends).toEqual([
      {
        id: 'client-calls-api',
        kind: 'relation',
        name: 'client-calls-api',
        relationType: 'test.calls',
      },
    ]);
  });

  it('gives the view and its scale to draw', () => {
    const input = hookInputOf(testProject(), 'system', { view: 'overview', scale: 0.5 });
    expect(input?.context.contents.map((each) => each.id)).toEqual(['api', 'db']);
    expect(input?.context.view).toBe('overview');
    expect(input?.context.scale).toBe(0.5);
  });

  it('gives nothing for an id that is no element', () => {
    expect(hookInputOf(testProject(), 'client-calls-api')).toBeUndefined();
    expect(hookInputOf(testProject(), 'nope')).toBeUndefined();
  });

  it('keeps an attribute named "__proto__" as data, never as what the object derives from', () => {
    const project = testProject();
    const api = project.model.elements[1]!;
    const attributes: Record<string, unknown> = JSON.parse(
      '{"__proto__": {"polluted": 1}}',
    ) as Record<string, unknown>;
    project.model.elements[1] = { ...api, attributes: attributes as never };
    const input = hookInputOf(project, 'api');
    expect(Object.getPrototypeOf(input?.element.attributes)).toBe(Object.prototype);
    expect(Object.hasOwn(input?.element.attributes ?? {}, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('holds at most so many relations', () => {
    const project = testProject();
    for (let i = 0; i < CODE_LIMITS.contextItems + 10; i += 1) {
      project.model.relations.push({
        id: `r${i}`,
        relationType: 'test.calls',
        from: 'client',
        to: 'api',
      });
    }
    const input = hookInputOf(project, 'api');
    expect(input?.context.relations).toHaveLength(CODE_LIMITS.contextItems);
  });
});

describe('modelReaderOf', () => {
  it('reads elements and relations by id, and lists elements by component', () => {
    const reader = modelReaderOf(testProject());
    expect(reader.element('db')).toEqual({
      id: 'db',
      name: 'DB',
      component: 'test.database',
      attributes: {},
    });
    expect(reader.relation('api-reads-db')).toMatchObject({ from: 'api', to: 'db' });
    expect(reader.element('nope')).toBeNull();
    expect(reader.relation('db')).toBeNull();
    expect(reader.elements('test.box')).toEqual(['system', 'api', 'db', 'client', 'contract']);
    expect(reader.elements('test.service')).toEqual(['api', 'client']);
    expect(reader.elements()).toEqual(['world', 'system', 'api', 'db', 'client', 'contract']);
    expect(reader.relationsOn('db')).toEqual(['db-in-system', 'api-reads-db']);
  });
});
