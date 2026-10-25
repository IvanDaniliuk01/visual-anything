import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../../test/sample';
import { centerOf } from '../geometry';
import { indexScene } from '../hit';
import { buildScene, relationLinesOf, type ElementShape, type RelationLine } from '../scene';
import { carriedKeys, moveCommand, movingShapes } from '../gestures';
import { selectionOf } from '../../editor/selection';
import {
  carriedRouteCommands,
  reconnectCommand,
  relativeBendPoints,
  resetCommand,
  styleCommand,
} from './commands';
import { STUB, routeByHand } from './hand';
import { handleAt, handlesOf } from './handles';
import { cornersOf, moveSegment } from './segments';
import { aimEnd, snapBend, snapEnd } from './snap';

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

const box: ElementShape = {
  key: 'box',
  element: 'box',
  offset: { x: 0, y: 0 },
  positioned: 'stored',
  name: 'Box',
  componentName: 'Box',
  kind: 'rectangle',
  fill: '#FFFFFF',
  stroke: '#000000',
  rect: { x: 0, y: 0, width: 200, height: 100 },
  extent: { x: 0, y: 0, width: 200, height: 100 },
  holdsContents: false,
  points: [
    { name: 'in', side: 'left', at: 0.5 },
    { name: 'out', side: 'right', at: 0.5 },
  ],
};

describe('snapEnd', () => {
  it('snaps to a connection point within reach, and marks it', () => {
    const snap = snapEnd(box, { x: 195, y: 55 }, 1, false, false);
    expect(snap.attachment).toEqual({ kind: 'connection-point', name: 'out' });
    expect(snap.points).toEqual([
      { at: { x: 0, y: 50 }, snapped: false },
      { at: { x: 200, y: 50 }, snapped: true },
    ]);
  });

  it('snaps to the nearest border point elsewhere, with a tick there', () => {
    const snap = snapEnd(box, { x: 50, y: 3 }, 1, false, false);
    expect(snap.attachment).toEqual({ kind: 'border', side: 'top', at: 0.25 });
    expect(snap.tick).toEqual({ at: { x: 50, y: 0 }, side: 'top' });
  });

  it('attaches automatically deep inside, and outlines the shape', () => {
    const snap = snapEnd(box, { x: 100, y: 50 }, 1, false, false);
    expect(snap.attachment).toBeNull();
    expect(snap.outline).toEqual(box.rect);
  });

  it('keeps the sizes on screen: what is deep at one scale is near the border at another', () => {
    expect(snapEnd(box, { x: 100, y: 20 }, 1, false, false).attachment).toBeNull();
    expect(snapEnd(box, { x: 100, y: 20 }, 0.5, false, false).attachment).toEqual({
      kind: 'border',
      side: 'top',
      at: 0.5,
    });
  });

  it('with Alt, takes the exact border point nearest the pointer', () => {
    expect(snapEnd(box, { x: 195, y: 55 }, 1, true, false).attachment).toEqual({
      kind: 'border',
      side: 'right',
      at: 0.55,
    });
    expect(snapEnd(box, { x: 100, y: 49 }, 1, true, false).attachment).toEqual({
      kind: 'border',
      side: 'top',
      at: 0.5,
    });
  });

  it('on a row, takes its left or its right side, at the middle', () => {
    const snap = snapEnd(box, { x: 120, y: 2 }, 1, false, true);
    expect(snap.attachment).toEqual({ kind: 'border', side: 'right', at: 0.5 });
    expect(snap.points).toEqual([]);
  });
});

describe('aimEnd', () => {
  const indexed = indexScene(buildScene(sample, VIEW));
  const line = relationLinesOf(indexed.scene).get('agent-to-api') as RelationLine;
  const shapeOf = (element: string) =>
    indexed.scene.shapes.find((shape) => shape.element === element) as ElementShape;
  const aim = (point: { x: number; y: number }, project = sample, end: 'from' | 'to' = 'to') =>
    aimEnd(indexed, project, line, end, point, 1, false, () => true, { has: () => false });

  it('attaches to its own end’s shape', () => {
    const api = shapeOf('appointments-api');
    expect(aim(centerOf(api.rect))).toMatchObject({ kind: 'attach', attachment: null });
    expect(aim({ x: api.rect.x + 30, y: api.rect.y - 5 })).toMatchObject({
      kind: 'attach',
      attachment: { kind: 'border', side: 'top' },
    });
  });

  it('reconnects to another element’s shape', () => {
    const reminders = shapeOf('reminder-service');
    expect(aim(centerOf(reminders.rect))).toMatchObject({
      kind: 'reconnect',
      shape: { element: 'reminder-service' },
      attachment: null,
    });
  });

  it('refuses the other end, and goes back over nothing', () => {
    expect(aim(centerOf(shapeOf('booking-agent').rect))).toMatchObject({
      kind: 'refused',
      reason: 'other-end',
    });
    expect(aim({ x: -5000, y: -5000 })).toEqual({ kind: 'back' });
  });
});

describe('snapBend', () => {
  it('snaps to the x or the y of a neighbour within reach, unless Alt', () => {
    const neighbours = [
      { x: 100, y: 0 },
      { x: 300, y: 205 },
    ];
    expect(snapBend({ x: 104, y: 200 }, neighbours, 1, false)).toEqual({
      at: { x: 100, y: 205 },
      snapped: { x: true, y: true },
    });
    expect(snapBend({ x: 104, y: 200 }, neighbours, 1, true)).toEqual({
      at: { x: 104, y: 200 },
      snapped: { x: false, y: false },
    });
    expect(snapBend({ x: 120, y: 100 }, neighbours, 1, false).snapped).toEqual({ x: false, y: false });
  });
});

describe('moving a segment of an orthogonal route', () => {
  const route = [
    { x: 100, y: 50 },
    { x: 112, y: 50 },
    { x: 112, y: 150 },
    { x: 300, y: 150 },
    { x: 300, y: 112 },
    { x: 300, y: 100 },
  ];
  const ends = { from: { kind: 'stub', side: 'right' }, to: { kind: 'stub', side: 'bottom' } } as const;

  it('moves it perpendicular to itself, the segments on either side stretching', () => {
    expect(moveSegment(route, 2, 180, ends)).toEqual([
      { x: 100, y: 50 },
      { x: 112, y: 50 },
      { x: 112, y: 180 },
      { x: 300, y: 180 },
      { x: 300, y: 100 },
    ]);
  });

  it('adds a corner so that a stub keeps leaving its side', () => {
    const straight = [
      { x: 100, y: 50 },
      { x: 300, y: 50 },
    ];
    expect(
      moveSegment(straight, 0, 80, { from: { kind: 'stub', side: 'right' }, to: { kind: 'stub', side: 'left' } }),
    ).toEqual([
      { x: 100, y: 50 },
      { x: 100 + STUB, y: 50 },
      { x: 100 + STUB, y: 80 },
      { x: 300 - STUB, y: 80 },
      { x: 300 - STUB, y: 50 },
      { x: 300, y: 50 },
    ]);
  });

  it('slides an automatic end along its side while it can', () => {
    const straight = [
      { x: 100, y: 50 },
      { x: 300, y: 50 },
    ];
    const slides = {
      from: { kind: 'slides', rect: { x: 0, y: 0, width: 100, height: 100 }, side: 'right' },
      to: { kind: 'slides', rect: { x: 300, y: 0, width: 100, height: 100 }, side: 'left' },
    } as const;
    expect(moveSegment(straight, 0, 70, slides)).toEqual([
      { x: 100, y: 70 },
      { x: 300, y: 70 },
    ]);
  });

  it('gives back the corners as bend points, which route as drawn', () => {
    const moved = moveSegment(route, 2, 180, ends);
    const corners = cornersOf(moved, { from: 'right', to: 'bottom' });
    expect(corners).toEqual([
      { x: 112, y: 180 },
      { x: 300, y: 180 },
    ]);
    const again = routeByHand(
      { kind: 'shape', rect: { x: 0, y: 0, width: 100, height: 100 }, attach: { side: 'right', at: 0.5 } },
      { kind: 'shape', rect: { x: 250, y: 0, width: 100, height: 100 }, attach: { side: 'bottom', at: 0.5 } },
      corners,
      'orthogonal',
    );
    expect(again.route).toEqual(moved);
  });
});

describe('handles', () => {
  it('show at each end, each bend point and the middle of each segment, in route order', () => {
    const project = run(sample, {
      type: 'set-route',
      view: VIEW,
      relation: 'agent-to-api',
      bendPoints: [{ x: 500, y: -50 }],
      style: 'straight',
      to: { kind: 'border', side: 'top', at: 0.5 },
    });
    const line = relationLinesOf(buildScene(project, VIEW)).get('agent-to-api') as RelationLine;
    const handles = handlesOf(line, 1);
    expect(handles.map((handle) => handle.kind)).toEqual(['end', 'middle', 'bend', 'middle', 'end']);
    expect(handles[0]).toMatchObject({ end: 'from', byHand: false });
    expect(handles.at(-1)).toMatchObject({ end: 'to', byHand: true });
    const bend = handles[2];
    expect(handleAt(handles, { x: (bend?.at.x ?? 0) + 3, y: bend?.at.y ?? 0 }, 8)).toBe(bend);
  });
});

describe('route commands', () => {
  it('draw several relations in a style as one action, leaving those drawn so already', () => {
    const curved = run(sample, { type: 'set-route', view: VIEW, relation: 'api-reads-db', style: 'curved' });
    const command = styleCommand(curved, VIEW, ['api-reads-db', 'api-writes-db', 'api-to-reminders'], 'curved');
    expect(command).toEqual({
      type: 'batch',
      label: 'Draw 2 relations curved in "System overview"',
      commands: [
        { type: 'set-route', view: VIEW, relation: 'api-writes-db', style: 'curved' },
        { type: 'set-route', view: VIEW, relation: 'api-to-reminders', style: 'curved' },
      ],
    });
    expect(styleCommand(curved, VIEW, ['api-reads-db'], 'curved')).toBeUndefined();
    expect(styleCommand(sample, VIEW, ['api-reads-db'], 'orthogonal')).toBeUndefined();
  });

  it('reset only the relations routed by hand', () => {
    const curved = run(sample, { type: 'set-route', view: VIEW, relation: 'api-reads-db', style: 'curved' });
    expect(resetCommand(curved, VIEW, ['api-reads-db', 'api-writes-db'])).toEqual({
      type: 'reset-route',
      view: VIEW,
      relations: ['api-reads-db'],
    });
    expect(resetCommand(sample, VIEW, ['api-reads-db'])).toBeUndefined();
  });

  it('reconnect and attach as one action, named for the history', () => {
    const command = reconnectCommand(sample, VIEW, 'agent-to-api', 'to', 'reminder-service', {
      kind: 'border',
      side: 'top',
      at: 0.5,
    });
    expect(command).toMatchObject({ type: 'batch', label: 'Reconnect "HTTPS" to "Reminder service"' });
    const after = run(sample, command);
    expect(after.model.relations.find((relation) => relation.id === 'agent-to-api')?.to).toBe(
      'reminder-service',
    );
    expect(after.views[0]?.routes?.['agent-to-api']).toEqual({
      to: { kind: 'border', side: 'top', at: 0.5 },
    });
  });

  it('give bend points relative to an origin, rounded but where they snapped', () => {
    expect(
      relativeBendPoints([{ x: 10.4, y: 20.6 }], { x: 5, y: 5 }, [{ x: true, y: false }]),
    ).toEqual([{ x: 5.4, y: 16 }]);
  });

  it('carry the bend points of a relation whose two ends move, and not of one whose container moves', () => {
    const routed = run(sample, {
      type: 'set-route',
      view: VIEW,
      relation: 'api-to-reminders',
      bendPoints: [{ x: 40, y: 20 }],
    });
    const indexed = indexScene(buildScene(routed, VIEW));
    const both = selectionOf([
      { kind: 'element', id: 'appointments-api' },
      { kind: 'element', id: 'reminder-service' },
    ]);
    const keys = carriedKeys(indexed, movingShapes(indexed, both));
    expect(carriedRouteCommands(indexed, routed, VIEW, keys, { x: 30, y: -10 })).toEqual([
      {
        type: 'set-route',
        view: VIEW,
        relation: 'api-to-reminders',
        bendPoints: [{ x: 70, y: 10 }],
        container: 'scheduling',
      },
    ]);
    // The move sends it in its own action.
    const move = moveCommand(indexed, routed, VIEW, both, { x: 30, y: -10 });
    const after = run(routed, move as Command);
    expect(after.views[0]?.routes?.['api-to-reminders']?.bendPoints).toEqual([{ x: 70, y: 10 }]);

    const container = selectionOf([{ kind: 'element', id: 'scheduling' }]);
    const carried = carriedKeys(indexed, movingShapes(indexed, container));
    expect(carriedRouteCommands(indexed, routed, VIEW, carried, { x: 30, y: -10 })).toEqual([]);
  });
});
