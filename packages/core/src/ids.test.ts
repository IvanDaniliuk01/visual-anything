import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ID_PATTERN, freshId, isId, randomIds, slug } from './ids';
import projectSchema from '@visual-anything/schema/schemas/project.schema.json' with { type: 'json' };

describe('slug', () => {
  it('turns a name into a readable base', () => {
    expect(slug('Booking agent', 'element')).toBe('booking-agent');
    expect(slug('  Árbol de decisión — v2! ', 'element')).toBe('arbol-de-decision-v2');
    expect(slug('東京', 'element')).toBe('element');
  });

  it('keeps bases short and makes valid ids', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        const base = slug(name, 'element');
        expect(base.length).toBeLessThanOrEqual(40);
        expect(isId(randomIds()(base))).toBe(true);
      }),
    );
  });
});

describe('ids', () => {
  it('match the Id pattern of the published schema', () => {
    expect(ID_PATTERN.source).toBe(projectSchema.definitions.Id.pattern);
  });

  it('add a random suffix of six base-36 characters', () => {
    expect(randomIds(() => 0.5)('api')).toBe('api-iiiiii');
    expect(randomIds()('api')).toMatch(/^api-[0-9a-z]{6}$/);
  });

  it('skip ids that are taken', () => {
    const taken = new Set(['a-1', 'a-2']);
    let next = 0;
    const generate = (base: string) => `${base}-${(next += 1)}`;
    expect(freshId(generate, 'a', (id) => taken.has(id))).toBe('a-3');
  });
});
