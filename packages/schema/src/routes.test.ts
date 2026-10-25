/**
 * Routes chosen by hand in view files (ADR 0039): what the schema accepts, and how they are written.
 */
import { describe, expect, it } from 'vitest';
import type { RelationRoute, ViewFile } from './files';
import { formatFile } from './format';
import type { ValidationError } from './validate';
import { validateFile } from './validate';

const view: ViewFile = {
  id: 'system-overview',
  name: 'System overview',
  perspective: { name: 'Data flow' },
  nestingRelationTypes: ['systems.is-part-of'],
  positions: [],
  freeShapes: [],
};

/** A view that routes the relation `calls` as given. */
function routing(route: unknown): unknown {
  return { ...view, routes: { calls: route } };
}

function problemsIn(data: unknown): ValidationError[] {
  const result = validateFile('view', data);
  return result.ok ? [] : result.errors;
}

describe('routes in a view file', () => {
  it('accepts every part a route can choose by hand', () => {
    const routed: ViewFile = {
      ...view,
      routes: {
        calls: {
          from: { kind: 'connection-point', name: 'out' },
          to: { kind: 'border', side: 'top', at: 0.25 },
          style: 'curved',
          container: 'clinic-booking',
          bendPoints: [
            { x: 320, y: 96 },
            { x: -40.5, y: 0 },
          ],
        },
        reads: { style: 'straight' },
        writes: { to: { kind: 'border', side: 'left', at: 0 } },
        queries: { from: { kind: 'border', side: 'bottom', at: 1 } },
      },
    };
    expect(validateFile('view', routed)).toEqual({ ok: true, value: routed });
  });

  it.each<[string, unknown, ValidationError[]]>([
    [
      'an empty map of routes',
      { ...view, routes: {} },
      [{ path: '/routes', message: 'must not be empty' }],
    ],
    ['an empty route', routing({}), [{ path: '/routes/calls', message: 'must not be empty' }]],
    [
      'a route keyed by something that is not an id',
      { ...view, routes: { 'two words': { style: 'straight' } } },
      [{ path: '/routes', message: 'must have ids as its keys, and "two words" is not one' }],
    ],
    [
      'orthogonal written out, which is what no style means',
      routing({ style: 'orthogonal' }),
      [{ path: '/routes/calls/style', message: 'must be one of "straight", "curved"' }],
    ],
    [
      'an attachment of an unknown kind',
      routing({ from: { kind: 'anywhere' } }),
      [{ path: '/routes/calls/from/kind', message: 'must be one of "connection-point", "border"' }],
    ],
    [
      'an attachment without its kind',
      routing({ from: { side: 'top', at: 0.5 } }),
      [{ path: '/routes/calls/from', message: 'must have the key "kind"' }],
    ],
    [
      'a connection point without a name',
      routing({ to: { kind: 'connection-point', name: '' } }),
      [{ path: '/routes/calls/to/name', message: 'must not be empty' }],
    ],
    [
      'a border point on a side that is not one',
      routing({ to: { kind: 'border', side: 'middle', at: 0.5 } }),
      [
        {
          path: '/routes/calls/to/side',
          message: 'must be one of "top", "right", "bottom", "left"',
        },
      ],
    ],
    [
      'a border point beyond its side',
      routing({ to: { kind: 'border', side: 'top', at: 1.5 } }),
      [{ path: '/routes/calls/to/at', message: 'must be at most 1' }],
    ],
    [
      'a border point before its side',
      routing({ to: { kind: 'border', side: 'top', at: -0.1 } }),
      [{ path: '/routes/calls/to/at', message: 'must be at least 0' }],
    ],
    [
      'a border point that also names a connection point',
      routing({ to: { kind: 'border', side: 'top', at: 0.5, name: 'in' } }),
      [{ path: '/routes/calls/to', message: 'must not have the key "name"' }],
    ],
    [
      'an empty list of bend points',
      routing({ bendPoints: [] }),
      [{ path: '/routes/calls/bendPoints', message: 'must have at least 1 item' }],
    ],
    [
      'more than 64 bend points',
      routing({ bendPoints: Array.from({ length: 65 }, (_, x) => ({ x, y: 0 })) }),
      [{ path: '/routes/calls/bendPoints', message: 'must have at most 64 items' }],
    ],
    [
      'a bend point without a y',
      routing({ bendPoints: [{ x: 1 }] }),
      [{ path: '/routes/calls/bendPoints/0', message: 'must have the key "y"' }],
    ],
    [
      'a container that is not an id',
      routing({ container: 'two words', bendPoints: [{ x: 1, y: 2 }] }),
      [
        {
          path: '/routes/calls/container',
          message:
            'must be an id: 1 to 128 letters, digits, ".", "_" or "-", starting with a letter or digit',
        },
      ],
    ],
    [
      'a key a route does not have',
      routing({ style: 'straight', label: 'HTTPS' }),
      [{ path: '/routes/calls', message: 'must not have the key "label"' }],
    ],
  ])('refuses %s', (_, data, problems) => {
    expect(problemsIn(data)).toEqual(problems);
  });

  it('writes a route with its keys in the order of the schema, and routes by relation id', () => {
    const route: RelationRoute = {
      bendPoints: [{ y: 96, x: 320 }],
      container: 'clinic-booking',
      style: 'curved',
      to: { at: 0.25, side: 'top', kind: 'border' },
      from: { name: 'out', kind: 'connection-point' },
    };
    const text = formatFile('view', {
      ...view,
      routes: { writes: { style: 'straight' }, calls: route },
    });
    const written = JSON.parse(text) as ViewFile;
    expect(Object.keys(written).at(-1)).toBe('routes');
    expect(Object.keys(written.routes ?? {})).toEqual(['calls', 'writes']);
    const calls = written.routes?.calls;
    expect(Object.keys(calls ?? {})).toEqual(['from', 'to', 'style', 'container', 'bendPoints']);
    expect(Object.keys(calls?.from ?? {})).toEqual(['kind', 'name']);
    expect(Object.keys(calls?.to ?? {})).toEqual(['kind', 'side', 'at']);
    expect(Object.keys(calls?.bendPoints?.[0] ?? {})).toEqual(['x', 'y']);
    expect(formatFile('view', written)).toBe(text);
  });
});
