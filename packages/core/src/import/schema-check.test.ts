/**
 * Checking JSON against the published JSON Schema without Ajv, so that the browser can check an
 * import too, where a page's policy lets no code be compiled: it must agree with Ajv on every file,
 * and say what is wrong in the words the schema's reasons use.
 */
import modelSchema from '@visual-anything/schema/schemas/model.schema.json' with { type: 'json' };
import { validateFile } from '@visual-anything/schema/validate';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { testProject } from '../test/fixtures';
import { checkAgainstSchema, depthOf } from './schema-check';

const model = () => JSON.parse(JSON.stringify(testProject().model)) as Record<string, unknown>;

describe('checkAgainstSchema', () => {
  it('passes a valid model file', () => {
    expect(checkAgainstSchema(modelSchema, model())).toEqual([]);
  });

  it.each([
    [
      'a missing key',
      { elements: [], relations: [] },
      [{ path: '', message: 'must have the key "world"' }],
    ],
    [
      'an unknown key',
      { ...model(), extra: 1 },
      [{ path: '', message: 'must not have the key "extra"' }],
    ],
    [
      'an empty name',
      { ...model(), world: { id: 'world', component: 'essence', name: '' } },
      [{ path: '/world/name', message: 'must not be empty' }],
    ],
    [
      'an id that is not one',
      { ...model(), world: { id: 'no spaces', component: 'essence', name: 'W' } },
      [
        {
          path: '/world/id',
          message:
            'must be an id: 1 to 128 letters, digits, ".", "_" or "-", starting with a letter or digit',
        },
      ],
    ],
    [
      'a value of the wrong kind',
      { ...model(), elements: 'none' },
      [{ path: '/elements', message: 'must be an array' }],
    ],
    [
      'a bad color in an appearance',
      {
        ...model(),
        world: { id: 'w', component: 'essence', name: 'W', appearance: { fill: 'red' } },
      },
      [{ path: '/world/appearance/fill', message: 'must be a color written as #RRGGBB' }],
    ],
    [
      'a value no member of a union takes',
      {
        ...model(),
        world: { id: 'w', component: 'essence', name: 'W', appearance: { image: 5 } },
      },
      [{ path: '/world/appearance/image', message: 'must be an object or a string or "none"' }],
    ],
    [
      'a width out of range',
      {
        ...model(),
        world: { id: 'w', component: 'essence', name: 'W', appearance: { width: 0 } },
      },
      [{ path: '/world/appearance/width', message: 'must be greater than 0' }],
    ],
  ])('reports %s as the schema’s reasons do', (_what, data, errors) => {
    expect(checkAgainstSchema(modelSchema, data)).toEqual(errors);
    const ajv = validateFile('model', data);
    expect(ajv.ok).toBe(false);
    if (!ajv.ok) expect(ajv.errors).toEqual(errors);
  });

  it('agrees with Ajv on whether any change to a model leaves it valid', () => {
    const value = fc.oneof(
      fc.string({ maxLength: 6 }),
      fc.constantFrom('', 'essence', '#12AB34', 'none', 'test.box', 'w', 'a b'),
      fc.integer({ min: -2, max: 3 }),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.boolean(),
      fc.constant(null),
      fc.constant([]),
      fc.constant({}),
      fc.constant({ image: 'x' }),
      fc.constant({ when: 'attribute', text: 'PK', attribute: 'pk' }),
    );
    const path = fc.array(
      fc.constantFrom(
        'world',
        'elements',
        'relations',
        0,
        1,
        'id',
        'name',
        'component',
        'appearance',
        'attributes',
        'fill',
        'width',
        'detail',
        'badges',
        'image',
        'connectionPoints',
        'from',
        'relationType',
        'dash',
        'extra',
      ),
      { minLength: 1, maxLength: 5 },
    );
    fc.assert(
      fc.property(fc.array(fc.tuple(path, value), { minLength: 1, maxLength: 4 }), (changes) => {
        const data = model();
        for (const [keys, set] of changes) {
          let at: unknown = data;
          for (const key of keys.slice(0, -1)) {
            if (typeof at !== 'object' || at === null) break;
            const next = (at as Record<string | number, unknown>)[key];
            if (typeof next !== 'object' || next === null) {
              (at as Record<string | number, unknown>)[key] =
                typeof keys[keys.indexOf(key) + 1] === 'number' ? [] : {};
            }
            at = (at as Record<string | number, unknown>)[key];
          }
          if (typeof at === 'object' && at !== null) {
            (at as Record<string | number, unknown>)[keys.at(-1) as string | number] = JSON.parse(
              JSON.stringify(set),
            ) as unknown;
          }
        }
        // What is checked always comes from parsed JSON, which has no holes: an array built by
        // index above may skip one, which the round trip writes as null.
        const parsed = JSON.parse(JSON.stringify(data)) as unknown;
        const ours = checkAgainstSchema(modelSchema, parsed);
        const theirs = validateFile('model', parsed);
        expect(ours.length === 0).toBe(theirs.ok);
      }),
      { numRuns: 400 },
    );
  });

  it('stops after a number of problems, however many the file has', () => {
    const elements = Array.from({ length: 5_000 }, () => ({ id: '' }));
    const errors = checkAgainstSchema(modelSchema, { ...model(), elements });
    expect(errors.length).toBeLessThanOrEqual(50);
  });
});

describe('depthOf', () => {
  it('measures nesting without recursion, so that a deep file is measured too', () => {
    let deep: unknown = 1;
    for (let at = 0; at < 100_000; at++) deep = [deep];
    expect(depthOf(deep, 64)).toBe(65);
    expect(depthOf({ a: [{ b: 1 }] }, 64)).toBe(3);
    expect(depthOf('x', 64)).toBe(0);
  });
});
