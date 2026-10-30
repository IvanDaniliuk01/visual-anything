/**
 * A route by hand follows its ends (ADR 0039's clarification of 2026-10-30, M3c Stage 1): when
 * `set-positions` moves both ends of a route with bend points together, the bend points move with
 * them; when it moves one end, the corner next to that end moves along its axis, so that the route
 * stays orthogonal. Layout, a drag and Claude's `set_positions` all send `set-positions`.
 */
import type { Point, RelationRoute, ViewFile } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import { followedBendPoints } from './commands/follow';
import { applyOperations } from './operations';
import type { ProjectSnapshot } from './snapshot';
import { testProject } from './test/fixtures';

function run(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const done = executeCommand(state, command);
  if (!done.ok) throw new Error(done.problems.map((each) => each.message).join(' '));
  return done.state;
}

const overview = (state: ProjectSnapshot) =>
  state.views.find((view) => view.id === 'overview') as ViewFile;
const routeIn = (state: ProjectSnapshot, relation: string): RelationRoute | undefined =>
  overview(state).routes?.[relation];

/**
 * The test project with routes by hand: the client's call to the API, bend points relative to the
 * canvas (the client sits in World, the API in the system at 0, 0); and the API's read of the DB,
 * relative to the system that holds both.
 */
function routed(): ProjectSnapshot {
  let state = testProject();
  state = run(state, {
    type: 'set-route',
    view: 'overview',
    relation: 'client-calls-api',
    bendPoints: [
      { x: -40, y: 60 },
      { x: -40, y: 90 },
    ],
  });
  state = run(state, {
    type: 'set-route',
    view: 'overview',
    relation: 'api-reads-db',
    bendPoints: [
      { x: 200, y: 60 },
      { x: 200, y: 180 },
    ],
  });
  return state;
}

describe('set-positions carries the bend points of routes whose ends it moves', () => {
  it('moves them with both ends when both move together', () => {
    const state = routed();
    const moved = run(state, {
      type: 'set-positions',
      view: 'overview',
      positions: [
        { element: 'client', x: -250 + 30, y: 40 - 20, pinned: true },
        { element: 'system', x: 30, y: -20, width: 400, height: 300 },
      ],
    });
    expect(routeIn(moved, 'client-calls-api')?.bendPoints).toEqual([
      { x: -10, y: 40 },
      { x: -10, y: 70 },
    ]);
    // The DB's read is relative to the system, which carries it.
    expect(routeIn(moved, 'api-reads-db')).toEqual(routeIn(state, 'api-reads-db'));
  });

  it('moves them with both ends inside their container, which itself stays', () => {
    const state = routed();
    const moved = run(state, {
      type: 'set-positions',
      view: 'overview',
      positions: [
        { element: 'api', container: 'system', x: 28, y: 48 },
        { element: 'db', container: 'system', x: 28, y: 168 },
      ],
    });
    expect(routeIn(moved, 'api-reads-db')?.bendPoints).toEqual([
      { x: 208, y: 68 },
      { x: 208, y: 188 },
    ]);
  });

  it('moves the corner next to an end that moves alone along its axis, so the route stays orthogonal', () => {
    const state = routed();
    // The client moves 24 right and 16 down. Its first corner, at -40, 60, has the next one below it:
    // the run into it is horizontal, so it moves down with the client, and nothing else moves.
    const moved = run(state, {
      type: 'set-positions',
      view: 'overview',
      positions: [{ element: 'client', x: -226, y: 56, pinned: true }],
    });
    expect(routeIn(moved, 'client-calls-api')?.bendPoints).toEqual([
      { x: -40, y: 76 },
      { x: -40, y: 90 },
    ]);
    // The other end, the API, moves alone: the last corner moves across with it.
    const other = run(state, {
      type: 'set-positions',
      view: 'overview',
      positions: [{ element: 'api', container: 'system', x: 20, y: 70 }],
    });
    expect(routeIn(other, 'client-calls-api')?.bendPoints).toEqual([
      { x: -40, y: 60 },
      { x: -40, y: 120 },
    ]);
  });

  it('is undone with the move, in one action', () => {
    const state = routed();
    const done = executeCommand(state, {
      type: 'set-positions',
      view: 'overview',
      positions: [{ element: 'client', x: -200, y: 100, pinned: true }],
    });
    if (!done.ok) throw new Error('refused');
    expect(routeIn(done.state, 'client-calls-api')).not.toEqual(routeIn(state, 'client-calls-api'));
    expect(applyOperations(done.state, done.inverse).state).toEqual(state);
  });

  it('leaves a route alone when an end gets a stored place for the first time', () => {
    // The DB's place is not stored: what the scene placed it at is not the core's to know.
    let state = routed();
    state = {
      ...state,
      views: state.views.map((view) => ({
        ...view,
        positions: view.positions.filter((position) => position.element !== 'db'),
      })),
    };
    const moved = run(state, {
      type: 'set-positions',
      view: 'overview',
      positions: [
        { element: 'api', container: 'system', x: 40, y: 40 },
        { element: 'db', container: 'system', x: 40, y: 200 },
      ],
    });
    expect(routeIn(moved, 'api-reads-db')).toEqual(routeIn(state, 'api-reads-db'));
  });

  it('leaves routes without bend points, and positions that move nothing, as they are', () => {
    let state = routed();
    state = run(state, {
      type: 'set-route',
      view: 'overview',
      relation: 'api-reads-db',
      bendPoints: null,
      style: 'curved',
    });
    const moved = run(state, {
      type: 'set-positions',
      view: 'overview',
      positions: [
        { element: 'api', container: 'system', x: 60, y: 40 },
        { element: 'client', x: -250, y: 40, pinned: true },
      ],
    });
    expect(routeIn(moved, 'api-reads-db')).toEqual({ style: 'curved' });
  });
});

describe('followedBendPoints', () => {
  const still = { delta: { x: 0, y: 0 } };

  it('translates every bend point when both ends move by the same amount', () => {
    const bends = [
      { x: 10, y: 0 },
      { x: 10, y: 50 },
      { x: 80, y: 50 },
    ];
    const by = { delta: { x: 5, y: -7 } };
    expect(followedBendPoints(bends, by, by)).toEqual([
      { x: 15, y: -7 },
      { x: 15, y: 43 },
      { x: 85, y: 43 },
    ]);
    expect(followedBendPoints(bends, still, still)).toBeUndefined();
  });

  it('moves a lone corner by the axis its end leaves along, when it is known', () => {
    const bend = [{ x: 100, y: 20 }];
    // Leaving horizontally, as beside a row: the corner keeps level with the end.
    expect(followedBendPoints(bend, { delta: { x: 30, y: 10 }, axis: 'h' }, still)).toEqual([
      { x: 100, y: 30 },
    ]);
    expect(followedBendPoints(bend, still, { delta: { x: 30, y: 10 }, axis: 'v' })).toEqual([
      { x: 130, y: 20 },
    ]);
    // Unknown: the corner goes with its end.
    expect(followedBendPoints(bend, { delta: { x: 30, y: 10 } }, still)).toEqual([
      { x: 130, y: 30 },
    ]);
    // Both ends on one corner, each by its axis.
    expect(
      followedBendPoints(
        bend,
        { delta: { x: 30, y: 10 }, axis: 'h' },
        { delta: { x: -4, y: 8 }, axis: 'v' },
      ),
    ).toEqual([{ x: 96, y: 30 }]);
  });

  it('moves the run an end leaves along through every bend point in line with it, up to the corner', () => {
    // Leaving the bottom of its shape, down through two points in line, then turning right.
    const bends = [
      { x: 100, y: 80 },
      { x: 100, y: 200 },
      { x: 300, y: 200 },
    ];
    expect(followedBendPoints(bends, { delta: { x: 40, y: 10 }, axis: 'v' }, still)).toEqual([
      { x: 140, y: 80 },
      { x: 140, y: 200 },
      { x: 300, y: 200 },
    ]);
  });

  const point = fc.record({
    x: fc.integer({ min: -500, max: 500 }),
    y: fc.integer({ min: -500, max: 500 }),
  });
  /** An orthogonal run of corners: each shares an x or a y with the one before, in turn. */
  const orthogonal = fc
    .tuple(
      point,
      fc.array(fc.integer({ min: -400, max: 400 }), { minLength: 1, maxLength: 8 }),
      fc.boolean(),
    )
    .map(([start, steps, horizontalFirst]) => {
      const corners: Point[] = [start];
      steps.forEach((step, at) => {
        const last = corners.at(-1) as Point;
        const horizontal = (at % 2 === 0) === horizontalFirst;
        // Never a repeated corner.
        const by = step === 0 ? 8 : step;
        corners.push(horizontal ? { x: last.x + by, y: last.y } : { x: last.x, y: last.y + by });
      });
      return corners;
    });

  it('keeps every run of an orthogonal route straight, whatever its ends do', () => {
    fc.assert(
      fc.property(orthogonal, point, point, (bends, a, b) => {
        const moved = followedBendPoints(bends, { delta: a }, { delta: b }) ?? bends;
        expect(moved).toHaveLength(bends.length);
        for (let at = 1; at < bends.length; at++) {
          const was = [bends[at - 1] as Point, bends[at] as Point];
          const now = [moved[at - 1] as Point, moved[at] as Point];
          if (was[0]?.x === was[1]?.x) expect(now[0]?.x).toBe(now[1]?.x);
          if (was[0]?.y === was[1]?.y) expect(now[0]?.y).toBe(now[1]?.y);
        }
      }),
    );
  });

  it('moves only the corner next to an end that moves alone', () => {
    fc.assert(
      fc.property(orthogonal, point, (bends, a) => {
        fc.pre(bends.length >= 3);
        const moved = followedBendPoints(bends, { delta: a }, still) ?? bends;
        expect(moved.slice(1)).toEqual(bends.slice(1));
        const back = followedBendPoints(bends, still, { delta: a }) ?? bends;
        expect(back.slice(0, -1)).toEqual(bends.slice(0, -1));
      }),
    );
  });

  it('translates the whole route when both ends move together', () => {
    fc.assert(
      fc.property(fc.array(point, { minLength: 1, maxLength: 10 }), point, (bends, by) => {
        fc.pre(by.x !== 0 || by.y !== 0);
        const moved = followedBendPoints(bends, { delta: by }, { delta: by });
        expect(moved).toEqual(bends.map((each) => ({ x: each.x + by.x, y: each.y + by.y })));
      }),
    );
  });
});
