import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ID_PATTERN, definitionIdFor, freshId, isId, randomIds, slug } from './ids';
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

describe('definitionIdFor', () => {
  it("starts with its package's id, has a base made from the name, and ends in six base-36 characters", () => {
    expect(
      definitionIdFor(
        'clinic',
        'Message queue',
        randomIds(() => 0.5),
      ),
    ).toBe('clinic.message-queue-iiiiii');
    expect(definitionIdFor('clinic', '東京', randomIds())).toMatch(
      /^clinic\.definition-[0-9a-z]{6}$/,
    );
  });

  it('makes valid ids that never repeat one the project holds, whatever the names', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,100}$/),
        fc.string(),
        fc.uniqueArray(fc.nat({ max: 5 }), { maxLength: 4 }),
        (packageId, name, takenDraws) => {
          let draw = 0;
          const generate = (base: string) => `${base}-${String(draw++).padStart(6, '0')}`;
          const taken = new Set(
            takenDraws.map((at) => definitionIdFor(packageId, name, () => `x-${at}`)),
          );
          const all = new Set<string>();
          for (let i = 0; i < 3; i += 1) {
            const id = definitionIdFor(
              packageId,
              name,
              generate,
              (each) => taken.has(each) || all.has(each),
            );
            expect(isId(id)).toBe(true);
            expect(id.startsWith(`${packageId}.`)).toBe(true);
            expect(id).toMatch(/-[0-9a-z]{6}$/);
            expect(taken.has(id) || all.has(id)).toBe(false);
            all.add(id);
          }
        },
      ),
    );
  });
});
