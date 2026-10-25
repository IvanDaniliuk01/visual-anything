import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../../test/sample';
import type { Point } from '../geometry';
import { buildScene, buildSceneAfresh, relationLinesOf, type RelationLine } from '../scene';
import { STUB, attachPoint } from './hand';

const VIEW = 'system-overview';
const sample = loadSample();

function run(project: ProjectSnapshot, ...commands: Command[]): ProjectSnapshot {
  let state = project;
  for (const command of commands) {
    const outcome = executeCommand(state, command);
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    state = outcome.state;
  }
  return state;
}

function lineOf(project: ProjectSnapshot, relation: string): RelationLine {
  const line = relationLinesOf(buildScene(project, VIEW)).get(relation);
  if (!line) throw new Error(`No line for ${relation}`);
  return line;
}

function shapeRect(project: ProjectSnapshot, element: string) {
  const shape = buildScene(project, VIEW).shapes.find((each) => each.element === element);
  if (!shape) throw new Error(`No shape for ${element}`);
  return shape.rect;
}

/** Whether a point lies on a route, within a small distance. */
function onRoute(route: readonly Point[], point: Point): boolean {
  return route.some((a, at) => {
    const b = route[at + 1];
    if (!b) return false;
    const length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t =
      length2 === 0 ? 0 : ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length2;
    const s = Math.min(1, Math.max(0, t));
    return Math.hypot(point.x - (a.x + s * (b.x - a.x)), point.y - (a.y + s * (b.y - a.y))) < 1e-6;
  });
}

describe('lines routed by hand in the scene', () => {
  it('attach where the view says, and leave their side with a stub', () => {
    const project = run(sample, {
      type: 'set-route',
      view: VIEW,
      relation: 'agent-to-api',
      from: { kind: 'border', side: 'bottom', at: 0.25 },
    });
    const line = lineOf(project, 'agent-to-api');
    const start = attachPoint(shapeRect(project, 'booking-agent'), { side: 'bottom', at: 0.25 });
    expect(line.from).toEqual(start);
    expect(line.route[1]).toEqual({ x: start.x, y: start.y + STUB });
    expect(line.hand?.route.from).toEqual({ kind: 'border', side: 'bottom', at: 0.25 });
    expect(line.hand?.route.byHand).toBe(true);
    expect(line.style).toBeUndefined();
  });

  it('pass through their bend points, relative to the container that holds both ends', () => {
    const project = run(sample, {
      type: 'set-route',
      view: VIEW,
      relation: 'api-to-reminders',
      bendPoints: [{ x: 40, y: 20 }],
      style: 'straight',
    });
    const line = lineOf(project, 'api-to-reminders');
    const scheduling = shapeRect(project, 'scheduling');
    expect(line.hand?.route.bendPointsIn).toBe('scheduling');
    expect(line.hand?.bendOrigin).toEqual({ x: scheduling.x, y: scheduling.y });
    expect(line.hand?.bendPoints).toEqual([{ x: scheduling.x + 40, y: scheduling.y + 20 }]);
    expect(line.route).toContainEqual({ x: scheduling.x + 40, y: scheduling.y + 20 });
    expect(line.style).toBe('straight');
    expect(line.route).toHaveLength(3);

    // Moving the container moves the bend points with it.
    const moved = run(project, {
      type: 'set-positions',
      view: VIEW,
      positions: [
        { element: 'scheduling', container: 'clinic-booking', x: 500, y: 60, pinned: true },
      ],
    });
    const after = shapeRect(moved, 'scheduling');
    expect(lineOf(moved, 'api-to-reminders').route).toContainEqual({
      x: after.x + 40,
      y: after.y + 20,
    });
  });

  it('are curved through their spans, flattened for everything that reads the route', () => {
    const project = run(sample, {
      type: 'set-route',
      view: VIEW,
      relation: 'whatsapp-to-agent',
      style: 'curved',
    });
    const line = lineOf(project, 'whatsapp-to-agent');
    expect(line.style).toBe('curved');
    expect(line.curve).toHaveLength(1);
    expect(line.route.length).toBeGreaterThan(4);
    const [span] = line.curve ?? [];
    expect(line.from).toEqual(span?.from);
    expect(line.to).toEqual(span?.to);
    // The arrowhead points along the last flattened segment, into the shape.
    expect(line.arrowhead?.tip).toEqual(line.to);
  });

  it('draw a relation that ends on a routed one at its new middle', () => {
    const contract = run(sample, {
      type: 'create-relation',
      relation: { relationType: 'relates-to', from: 'patient', to: 'agent-to-api' },
    });
    const before = lineOf(contract, 'agent-to-api');
    const routed = run(contract, {
      type: 'set-route',
      view: VIEW,
      relation: 'agent-to-api',
      bendPoints: [{ x: 300, y: -60 }],
    });
    const after = lineOf(routed, 'agent-to-api');
    expect(after.middle).not.toEqual(before.middle);
    const onIt = buildScene(routed, VIEW).relations.find(
      (line) => line.ends?.to.kind === 'relation' && line.ends.to.relation === 'agent-to-api',
    );
    expect(onIt?.to).toEqual(after.middle);
  });

  it('re-route only the lines whose route changed, as a build from nothing does', () => {
    const before = buildScene(sample, VIEW);
    const project = run(sample, {
      type: 'set-route',
      view: VIEW,
      relation: 'api-reads-db',
      style: 'curved',
    });
    const after = buildScene(project, VIEW);
    expect(after.shapes).toBe(before.shapes);
    const changed = after.relations.filter((line, at) => line !== before.relations[at]);
    expect(changed.map((line) => line.relation)).toEqual(['api-reads-db']);
    expect(after).toEqual(buildSceneAfresh(project, VIEW));

    const reset = run(project, { type: 'reset-route', view: VIEW, relations: ['api-reads-db'] });
    const back = buildScene(reset, VIEW);
    expect(back.relations.find((line) => line.relation === 'api-reads-db')?.route).toEqual(
      before.relations.find((line) => line.relation === 'api-reads-db')?.route,
    );
    expect(back).toEqual(buildSceneAfresh(reset, VIEW));
  });

  it('keep the offset between siblings only while both ends are automatic and there are no bend points', () => {
    const reads = lineOf(sample, 'api-reads-db');
    const writes = lineOf(sample, 'api-writes-db');
    expect(reads.route).not.toEqual(writes.route);
    const project = run(sample, {
      type: 'set-route',
      view: VIEW,
      relation: 'api-reads-db',
      from: { kind: 'border', side: 'bottom', at: 0.5 },
    });
    expect(lineOf(project, 'api-reads-db').from).toEqual(
      attachPoint(shapeRect(project, 'appointments-api'), { side: 'bottom', at: 0.5 }),
    );
    expect(lineOf(project, 'api-writes-db')).toEqual(writes);
  });

  it('take no route on an aggregated relation', () => {
    const project = run(
      sample,
      {
        type: 'set-route',
        view: VIEW,
        relation: 'agent-to-api',
        style: 'curved',
      },
      { type: 'set-collapsed', view: VIEW, elements: ['scheduling'], collapsed: true },
    );
    const line = relationLinesOf(buildScene(project, VIEW)).get('agent-to-api');
    expect(line?.aggregate).toBeDefined();
    expect(line?.hand).toBeUndefined();
    expect(line?.curve).toBeUndefined();
  });
});

describe('connection points on the canvas', () => {
  /** The sample with a component of its own whose shapes have points on their left and right. */
  function withPoints(): ProjectSnapshot {
    const clinic = sample.packages.find((each) => each.id === 'clinic') as PackageFile;
    const packages = sample.packages.map((each): PackageFile =>
      each === clinic
        ? {
            ...clinic,
            components: (clinic.components ?? []).map((component) =>
              component.id === 'clinic.calendar'
                ? {
                    ...component,
                    appearance: {
                      ...component.appearance,
                      connectionPoints: [
                        { name: 'in', side: 'left', at: 0.5 },
                        { name: 'top-out', side: 'top', at: 0.2 },
                        { name: 'top-in', side: 'top', at: 0.8 },
                      ],
                    },
                  }
                : component,
            ),
          }
        : each,
    );
    return { ...sample, packages };
  }

  it('give shapes their points, and attach automatic lines at the one facing the other end', () => {
    const project = withPoints();
    const scene = buildScene(project, VIEW);
    const db = scene.shapes.find((shape) => shape.element === 'appointments-db');
    expect(db?.points).toHaveLength(3);
    const reads = relationLinesOf(scene).get('api-reads-db') as RelationLine;
    const writes = relationLinesOf(scene).get('api-writes-db') as RelationLine;
    const points = (db?.points ?? []).map((point) =>
      attachPoint(db?.rect ?? { x: 0, y: 0, width: 0, height: 0 }, point),
    );
    const ends = [reads.to, writes.to];
    // Both end at or beside one connection point, siblings 12 units apart along its side.
    for (const end of ends) {
      expect(
        points.some(
          (point) => Math.abs(point.x - end.x) <= 12.01 && Math.abs(point.y - end.y) <= 12.01,
        ),
      ).toBe(true);
    }
    expect(reads.to).not.toEqual(writes.to);
    expect(scene).toEqual(buildSceneAfresh(project, VIEW));
  });

  it('attach a line routed by hand at a named point', () => {
    const project = run(withPoints(), {
      type: 'set-route',
      view: VIEW,
      relation: 'api-reads-db',
      to: { kind: 'connection-point', name: 'top-in' },
    });
    const line = lineOf(project, 'api-reads-db');
    expect(line.to).toEqual(
      attachPoint(shapeRect(project, 'appointments-db'), { side: 'top', at: 0.8 }),
    );
    expect(onRoute(line.route, line.to)).toBe(true);
  });
});
