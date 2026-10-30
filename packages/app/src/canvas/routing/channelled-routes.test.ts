/**
 * The canvas's routes beside rows (ADR 0080, section 2): routed in the routing worker, then spread
 * into channels there once every route has come, as `avoidedScene` draws them at once.
 */
import { describe, expect, it } from 'vitest';
import { measureScene } from '../layout/quality';
import { buildSceneAfresh } from '../scene';
import { VIEW, tablesProject, type TableSpec } from '../../test/tables';
import { avoidedScene } from './avoided';
import { inThreadAvoidRunner, type AvoidRunner } from './avoidRunner';
import { RoutesAround } from './useAvoidedRoutes';

function table(id: string, x: number, y: number, rows: number): TableSpec {
  return {
    id,
    at: { x, y },
    columns: Array.from({ length: rows }, (_, at) => ({ id: `${id}-c${at}`, name: `c${at}` })),
  };
}

/** Two tables, five rows of one referring to five rows of the other, through one gap. */
const project = tablesProject({
  tables: [table('a', 0, 0, 6), table('b', 400, 300, 6)],
  references: [0, 1, 2, 3, 4].map((at) => ({ id: `fk${at}`, from: `a-c${at}`, to: `b-c${at}` })),
});

/** The in-thread runner, counting the channel passes it is asked for. */
function counting(): AvoidRunner & { passes: number } {
  const inner = inThreadAvoidRunner();
  const runner = {
    passes: 0,
    route: (...args: Parameters<AvoidRunner['route']>) => inner.route(...args),
    channels: (...args: Parameters<NonNullable<AvoidRunner['channels']>>) => {
      runner.passes += 1;
      return inner.channels?.(...args) ?? (() => undefined);
    },
    dispose: () => inner.dispose(),
  };
  return runner;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RoutesAround beside rows', () => {
  it('routes, then spreads into channels, drawing what the exports draw', async () => {
    const runner = counting();
    let now = 0;
    const routes = new RoutesAround(
      runner,
      () => undefined,
      () => (now += 1_000),
    );
    const scene = buildSceneAfresh(project, VIEW);
    expect(measureScene(routes.compose(VIEW, scene)).sharedSegments).toBeGreaterThan(0);
    routes.request(VIEW, scene, undefined);
    await settle();
    routes.compose(VIEW, scene);
    await settle();
    await settle();
    const drawn = routes.compose(VIEW, scene);
    expect(runner.passes).toBeGreaterThan(0);
    const quality = measureScene(drawn);
    expect(quality.sharedSegments).toBe(0);
    expect(quality.rowEndsAtMiddle).toBe(quality.rowEnds);
    expect(drawn.relations.map((line) => line.route)).toEqual(
      avoidedScene(scene).relations.map((line) => line.route),
    );
    routes.dispose();
  });

  it('asks for no channel pass while routes are still being asked for', () => {
    const runner = counting();
    const routes = new RoutesAround(
      runner,
      () => undefined,
      () => 0,
    );
    const scene = buildSceneAfresh(project, VIEW);
    routes.compose(VIEW, scene);
    routes.request(VIEW, scene, undefined);
    routes.compose(VIEW, scene);
    expect(runner.passes).toBe(0);
    routes.dispose();
  });
});
