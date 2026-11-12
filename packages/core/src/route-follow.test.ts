/**
 * A route by hand follows its ends (ADR 0039's clarification of 2026-10-30, M3c Stage 1, and ADR
 * 0092 §5): when `set-positions` moves both ends of a route with bend points together, the bend points
 * move with them; when the ends move apart, the bend points stretch with the box their ends span,
 * along each axis, and the runs into the ends keep level with them, so that the route stays
 * orthogonal. Layout, a drag and Claude's `set_positions` all send `set-positions`.
 */
import type { Point, RelationRoute, ViewFile } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import { followedBendPoints, type EndMove } from './commands/follow';
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

  it('stretches the bend points with the box of the ends, and keeps the run into an end level with it', () => {
    const state = routed();
    // The client, 180 by 72 at -250, 40, has its middle at -160, 76; the API's, in the system at 0,
    // 0, is at 110, 76. The client moves 24 right and 16 down. Across, the span of 270 shrinks to
    // 246: the corners at -40 go to -136 + 120 × 246 / 270, about -27. Down, the ends are level, so
    // the span is under 8 and the corner rule holds: the first corner has the next one below it, the
    // run into it is horizontal, and it moves down with the client.
    const moved = run(state, {
      type: 'set-positions',
      view: 'overview',
      positions: [{ element: 'client', x: -226, y: 56, pinned: true }],
    });
    expect(routeIn(moved, 'client-calls-api')?.bendPoints).toEqual([
      { x: -27, y: 76 },
      { x: -27, y: 90 },
    ]);
    // The other end, the API, moves alone straight down: the last corner moves down with it.
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

  it('moves a bend point beyond the ends with the nearer end, and stretches those between them', () => {
    const state = routed();
    // In the system, the API's middle is at 110, 76 and the DB's at 95, 196; the route leaves the API
    // to the right, at 200, and comes down to 180 beside the DB. The DB moves 200 right and 200 down.
    // Across, 200 lies beyond both ends, nearer the API, which stays: it stays. Down, 60 lies above
    // both, nearer the API: it stays; 180 is the run into the DB, which keeps level with it.
    const moved = run(state, {
      type: 'set-positions',
      view: 'overview',
      positions: [{ element: 'db', container: 'system', x: 220, y: 360 }],
    });
    expect(routeIn(moved, 'api-reads-db')?.bendPoints).toEqual([
      { x: 200, y: 60 },
      { x: 200, y: 380 },
    ]);
  });

  it('stretches a route of three runs so that it keeps its shape', () => {
    let state = routed();
    // From the client's right, at the level of its middle, across to 40, down to the API's middle.
    state = run(state, {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      bendPoints: [
        { x: 40, y: 76 },
        { x: 40, y: 200 },
        { x: 80, y: 200 },
      ],
    });
    // The client goes 200 left and 100 up: its middle to -360, -24.
    const moved = run(state, {
      type: 'set-positions',
      view: 'overview',
      positions: [{ element: 'client', x: -450, y: -60, pinned: true }],
    });
    // Across, -160..110 becomes -360..110: 40 goes to -360 + 200 × 470 / 270, about -12; 80 is on
    // the run up into the API, which stays, and keeps level with it. Down, the ends are level: under
    // 8, so the corner rule holds, and the run into the client, horizontal, keeps level with it.
    expect(routeIn(moved, 'client-calls-api')?.bendPoints).toEqual([
      { x: -12, y: -24 },
      { x: -12, y: 200 },
      { x: 80, y: 200 },
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

  it('moves only the corner next to an end that moves alone, where the ends’ places are not known', () => {
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

describe('followedBendPoints, with the places of the ends known (ADR 0092 §5)', () => {
  const at = (x: number, y: number) => ({ x, y });

  it('stretches a route between ends that move apart, so that it keeps its shape', () => {
    // From the middle of one shape, right to 50, down, right into the other, which moves 200 by 200.
    const bends = [at(50, 0), at(50, 100)];
    expect(
      followedBendPoints(
        bends,
        { delta: at(0, 0), at: at(0, 0) },
        { delta: at(200, 200), at: at(100, 100) },
      ),
    ).toEqual([at(150, 0), at(150, 300)]);
  });

  it('keeps the run into an end level with it, even off its middle', () => {
    // The line leaves the still end's right side 10 above its middle.
    const bends = [at(50, -10), at(50, 100)];
    expect(
      followedBendPoints(
        bends,
        { delta: at(0, 0), at: at(0, 0), axis: 'h' },
        { delta: at(200, 200), at: at(100, 100), axis: 'h' },
      ),
    ).toEqual([at(150, -10), at(150, 300)]);
  });

  it('moves the bend points beyond the ends with the nearer end', () => {
    // Up from the first end, over to the right of the second, down and into its right side.
    const bends = [at(0, -50), at(150, -50), at(150, 100)];
    expect(
      followedBendPoints(
        bends,
        { delta: at(0, 0), at: at(0, 0), axis: 'v' },
        { delta: at(100, 0), at: at(100, 100), axis: 'h' },
      ),
    ).toEqual([at(0, -50), at(250, -50), at(250, 100)]);
  });

  it('moves an axis whose span is under 8 by the end that moved, as the corner rule does', () => {
    // The ends are level: down, the corner next to the end that moved goes with it.
    const bends = [at(40, 0), at(40, 60), at(80, 60)];
    expect(
      followedBendPoints(
        bends,
        { delta: at(0, 30), at: at(0, 0), axis: 'h' },
        { delta: at(0, 0), at: at(120, 4) },
      ),
    ).toEqual([at(40, 30), at(40, 60), at(80, 60)]);
  });

  it('rounds what it stretches to whole units', () => {
    expect(
      followedBendPoints(
        [at(10, 0)],
        { delta: at(0, 0), at: at(0, 0) },
        { delta: at(10, 0), at: at(30, 30) },
      ),
    ).toEqual([at(13, 0)]);
  });

  const coordinate = fc.integer({ min: -400, max: 400 });
  const point = fc.record({ x: coordinate, y: coordinate });
  const axis = fc.constantFrom<'h' | 'v' | undefined>(undefined, 'h', 'v');
  /** An orthogonal run of corners: each shares an x or a y with the one before, in turn. */
  const orthogonal = fc
    .tuple(point, fc.array(coordinate, { minLength: 1, maxLength: 8 }), fc.boolean())
    .map(([start, steps, horizontalFirst]) => {
      const corners: Point[] = [start];
      steps.forEach((step, index) => {
        const last = corners.at(-1) as Point;
        const horizontal = (index % 2 === 0) === horizontalFirst;
        const by = step === 0 ? 8 : step;
        corners.push(horizontal ? { x: last.x + by, y: last.y } : { x: last.x, y: last.y + by });
      });
      return corners;
    });
  const end = fc
    .record({ at: point, delta: point, axis })
    .map(({ at: place, delta, axis: leaves }) => ({
      at: place,
      delta,
      ...(leaves === undefined ? {} : { axis: leaves }),
    }));
  const spans = (from: { at: Point; delta: Point }, to: { at: Point; delta: Point }) =>
    (['x', 'y'] as const).map((key) => ({
      key,
      before: to.at[key] - from.at[key],
      after: to.at[key] + to.delta[key] - from.at[key] - from.delta[key],
    }));

  it('keeps every run of an orthogonal route straight', () => {
    fc.assert(
      fc.property(orthogonal, end, end, (bends, from, to) => {
        const moved = followedBendPoints(bends, from, to) ?? bends;
        expect(moved).toHaveLength(bends.length);
        for (let index = 1; index < bends.length; index++) {
          const was = [bends[index - 1] as Point, bends[index] as Point];
          const now = [moved[index - 1] as Point, moved[index] as Point];
          if (was[0]?.x === was[1]?.x) expect(now[0]?.x).toBe(now[1]?.x);
          if (was[0]?.y === was[1]?.y) expect(now[0]?.y).toBe(now[1]?.y);
        }
      }),
    );
  });

  it('changes nothing when neither end moves', () => {
    fc.assert(
      fc.property(orthogonal, point, point, axis, (bends, a, b, leaves) => {
        const still = { delta: { x: 0, y: 0 } };
        const ends = [
          { ...still, at: a, ...(leaves === undefined ? {} : { axis: leaves }) },
          { ...still, at: b },
        ] as const;
        expect(followedBendPoints(bends, ends[0], ends[1])).toBeUndefined();
      }),
    );
  });

  it('moves no bend point further along an axis than its ends moved', () => {
    fc.assert(
      fc.property(orthogonal, end, end, (bends, from, to) => {
        const moved = followedBendPoints(bends, from, to) ?? bends;
        for (const { key, before } of spans(from, to)) {
          const moves = [from.delta[key], to.delta[key]];
          // Where the ends' span lets the route stretch, between their two moves; otherwise, as the
          // corner rule moves it, by one of them, by their mean or not at all.
          if (Math.abs(before) < 8) moves.push(0);
          const least = Math.min(...moves);
          const most = Math.max(...moves);
          moved.forEach((each, index) => {
            const by = each[key] - (bends[index] as Point)[key];
            expect(by).toBeGreaterThanOrEqual(least);
            expect(by).toBeLessThanOrEqual(most);
          });
        }
      }),
    );
  });

  /**
   * A route as the canvas draws one, of two bend points or more: each end's middle some way out from
   * its first bend point, the run into it level with it, leaving across the route's first run.
   */
  const drawn = fc
    .tuple(
      orthogonal.filter((bends) => bends.length >= 2),
      fc.tuple(fc.integer({ min: 16, max: 300 }), fc.boolean(), point),
      fc.tuple(fc.integer({ min: 16, max: 300 }), fc.boolean(), point),
    )
    .map(([bends, [fromOut, fromBack, fromBy], [toOut, toBack, toBy]]) => {
      const endOf = (
        corner: Point,
        next: Point,
        out: number,
        back: boolean,
        delta: Point,
      ): EndMove => {
        const by = back ? -out : out;
        // The run from the corner to the next is horizontal: the end leaves up or down.
        return corner.y === next.y
          ? { at: { x: corner.x, y: corner.y + by }, axis: 'v', delta }
          : { at: { x: corner.x + by, y: corner.y }, axis: 'h', delta };
      };
      const first = bends[0] as Point;
      const second = bends[1] as Point;
      const last = bends.at(-1) as Point;
      const beforeLast = bends.at(-2) as Point;
      return {
        bends,
        from: endOf(first, second, fromOut, fromBack, fromBy),
        to: endOf(last, beforeLast, toOut, toBack, toBy),
      };
    });

  it('gives a route drawn level with its ends back, within rounding, when the ends move back', () => {
    fc.assert(
      fc.property(drawn, ({ bends, from: start, to: end }) => {
        const from = start as Required<EndMove>;
        const to = end as Required<EndMove>;
        const sides = spans(from, to);
        fc.pre(
          sides.every(
            ({ before, after }) =>
              Math.abs(before) >= 8 &&
              Math.abs(after) >= 8 &&
              Math.sign(before) === Math.sign(after),
          ),
        );
        const there = followedBendPoints(bends, from, to) ?? bends;
        const back = (move: typeof from) => ({
          ...move,
          at: { x: move.at.x + move.delta.x, y: move.at.y + move.delta.y },
          delta: { x: -move.delta.x, y: -move.delta.y },
        });
        const again = followedBendPoints(there, back(from), back(to)) ?? there;
        for (const { key, before, after } of sides) {
          // Rounding to whole units on the way there, magnified by the way back, and again.
          const slack = 0.5 + 0.5 * Math.abs(before / after) + 1e-9;
          again.forEach((each, index) => {
            expect(Math.abs(each[key] - (bends[index] as Point)[key])).toBeLessThanOrEqual(slack);
          });
        }
      }),
    );
  });
});
