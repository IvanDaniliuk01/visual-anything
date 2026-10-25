import {
  SYSTEMS,
  executeCommand,
  previewChangeContainer,
  type ChangeContainerCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { selectionOf, type Selection } from '../editor/selection';
import { loadSample } from '../test/sample';
import {
  REST_TO_ARM,
  REST_TOLERANCE,
  confirmLabelOf,
  containerChangeLabel,
  dropAimAt,
  dropCaption,
  dropCommand,
  dropOverlay,
  landingCover,
  needsConfirmation,
  planDrop,
  putInsideCommand,
  putInsideTarget,
  takeOutCommand,
  type DropAim,
  type DropPlan,
} from './drop';
import { centerOf, type Point } from './geometry';
import { indexScene, type IndexedScene } from './hit';
import { buildScene, type ElementShape } from './scene';

const VIEW = 'system-overview';
const sample = loadSample();

function after(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  return outcome.state;
}

function indexOf(project: ProjectSnapshot): IndexedScene {
  return indexScene(buildScene(project, VIEW));
}

function elements(...ids: string[]): Selection {
  return selectionOf(ids.map((id) => ({ kind: 'element' as const, id })));
}

function shape(indexed: IndexedScene, key: string): ElementShape {
  const found = indexed.byKey.get(key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

/** The sample with Calendar created last, directly in World, at a point. */
function withCalendar(at: Point = { x: 800, y: 150 }): ProjectSnapshot {
  return after(sample, {
    type: 'create-element',
    element: { id: 'calendar', component: 'clinic.calendar', name: 'Calendar' },
    positions: [{ view: VIEW, ...at }],
  });
}

/** The sample with Scheduling in Patient too, so that Scheduling and what it holds are drawn twice. */
function withSchedulingInPatient(): ProjectSnapshot {
  return after(sample, {
    type: 'create-relation',
    relation: { relationType: 'systems.is-part-of', from: 'scheduling', to: 'patient' },
  });
}

/** A package with a second nesting relation type. */
const EXTRA: PackageFile = {
  id: 'extra',
  name: 'Extra',
  components: [],
  relationTypes: [
    {
      id: 'extra.holds',
      name: 'holds',
      derivesFrom: 'relates-to',
      direction: 'directed',
      nests: true,
    },
  ],
};

/** The sample with the extra package in use, and the view arranged by its type too when asked. */
function withExtra(shown: boolean): ProjectSnapshot {
  return {
    ...sample,
    project: { ...sample.project, packages: [...sample.project.packages, 'extra'] },
    packages: [...sample.packages, EXTRA],
    views: sample.views.map((view) =>
      shown
        ? { ...view, nestingRelationTypes: [...view.nestingRelationTypes, 'extra.holds'] }
        : view,
    ),
  };
}

/** A drag of the selection, grabbed by a shape at a point and held at another. */
interface Drag {
  project: ProjectSnapshot;
  indexed: IndexedScene;
  selection: Selection;
  plan: DropPlan;
  delta: Point;
  pointer: Point;
}

function drag(
  project: ProjectSnapshot,
  ids: string[],
  grabbed: string,
  pointer: Point,
  grip?: Point,
): Drag {
  const indexed = indexOf(project);
  const selection = elements(...ids);
  const grabbedShape = shape(indexed, grabbed);
  const plan = planDrop(indexed, project, VIEW, selection, grabbedShape);
  if (!plan) throw new Error('No plan');
  const from = grip ?? centerOf(grabbedShape.rect);
  return {
    project,
    indexed,
    selection,
    plan,
    delta: { x: pointer.x - from.x, y: pointer.y - from.y },
    pointer,
  };
}

function aimOf({ indexed, plan, pointer, delta }: Drag, armed?: string, alt = false): DropAim {
  return dropAimAt(indexed, plan, pointer, delta, armed, () => true, alt);
}

function dropped(run: Drag, aim: DropAim) {
  return dropCommand(run.indexed, run.project, VIEW, run.selection, run.plan, aim, run.delta);
}

function captionOf(run: Drag, aim: DropAim) {
  return dropCaption(
    run.project,
    run.plan,
    aim,
    landingCover(run.indexed, run.plan, aim, run.delta),
  );
}

describe('planDrop', () => {
  it('takes the moving shapes, what they carry, and what they may not go into', () => {
    const indexed = indexOf(sample);
    const scheduling = shape(indexed, 'clinic-booking/scheduling');
    const plan = planDrop(indexed, sample, VIEW, elements('scheduling'), scheduling);
    expect(plan?.moving).toEqual([
      { shape: scheduling, from: 'clinic-booking', fromShape: 'clinic-booking' },
    ]);
    expect(plan?.grabbedShape.shape).toBe(scheduling);
    expect([...(plan?.carried ?? [])].sort()).toEqual([
      'clinic-booking/scheduling',
      'clinic-booking/scheduling/appointments-api',
      'clinic-booking/scheduling/appointments-db',
      'clinic-booking/scheduling/reminder-service',
    ]);
    expect([...(plan?.blocked ?? [])].sort()).toEqual([
      'appointments-api',
      'appointments-db',
      'reminder-service',
      'scheduling',
    ]);
    expect(plan?.onlyMoves).toBeUndefined();
  });

  it('takes the shape a grabbed content sits in, when that moves too', () => {
    const indexed = indexOf(sample);
    const api = shape(indexed, 'clinic-booking/scheduling/appointments-api');
    const plan = planDrop(indexed, sample, VIEW, elements('scheduling', 'appointments-api'), api);
    expect(plan?.grabbedShape.shape.key).toBe('clinic-booking/scheduling');
    expect(plan?.moving).toHaveLength(1);
    // A shape that is not selected is not dragged.
    expect(planDrop(indexed, sample, VIEW, elements('patient'), api)).toBeUndefined();
  });

  it('makes no plan for a view arranged by no relation type that nests', () => {
    const flat = {
      ...sample,
      views: sample.views.map((view) => ({ ...view, nestingRelationTypes: [] })),
    };
    const indexed = indexOf(flat);
    expect(planDrop(indexed, flat, VIEW, elements('patient'), shape(indexed, 'patient'))).toBe(
      undefined,
    );

    // The view lists "is part of", which no longer nests.
    const unnested: ProjectSnapshot = {
      ...sample,
      packages: sample.packages.map((file) =>
        file.id === SYSTEMS.id
          ? {
              ...file,
              relationTypes: file.relationTypes.map((type) =>
                type.id === 'systems.is-part-of' ? { ...type, nests: false } : type,
              ),
            }
          : file,
      ),
    };
    const flatter = indexOf(unnested);
    expect(
      planDrop(flatter, unnested, VIEW, elements('patient'), shape(flatter, 'patient')),
    ).toBeUndefined();
  });

  it('only moves an element that sits in two containers in the view, and says so', () => {
    const project = withSchedulingInPatient();
    const run = drag(project, ['scheduling'], 'clinic-booking/scheduling', { x: 300, y: 700 });
    expect(run.plan.onlyMoves).toBe('"Scheduling" sits in 2 containers in this view');
    const aim = aimOf(run);
    expect(aim).toEqual({
      kind: 'only-moves',
      reason: '"Scheduling" sits in 2 containers in this view',
    });
    expect(captionOf(run, aim)).toEqual({
      text: 'Moves only',
      detail: '"Scheduling" sits in 2 containers in this view',
    });
    expect(dropped(run, aim)).toBeUndefined();
  });

  it('drops an element whose one container is drawn twice, through the copy grabbed', () => {
    const project = withSchedulingInPatient();
    const run = drag(project, ['appointments-api'], 'clinic-booking/scheduling/appointments-api', {
      x: 1400,
      y: 700,
    });
    expect(run.plan.onlyMoves).toBeUndefined();
    expect(run.plan.moving.map((mover) => mover.shape.key)).toEqual([
      'clinic-booking/scheduling/appointments-api',
    ]);
    const aim = aimOf(run);
    expect(aim).toEqual({ kind: 'out' });
    const drop = dropped(run, aim);
    expect(drop?.command).toEqual({
      type: 'change-container',
      view: VIEW,
      shapes: [{ element: 'appointments-api', from: 'scheduling', at: { x: 1312, y: 664 } }],
    });
    const outcome = executeCommand(project, drop!.command);
    expect(outcome.ok && outcome.label).toBe('Take "Appointments API" out of "Scheduling"');
    expect(drop?.label).toBe('Take "Appointments API" out of "Scheduling"');
  });
});

describe('dropAimAt and dropCommand', () => {
  it('exports the resting rules for the controller', () => {
    expect(REST_TO_ARM).toBe(500);
    expect(REST_TOLERANCE).toBe(8);
  });

  it('puts Patient inside Clinic booking', () => {
    const run = drag(sample, ['patient'], 'patient', { x: 400, y: 450 });
    const aim = aimOf(run);
    expect(aim).toEqual({ kind: 'into', target: shape(run.indexed, 'clinic-booking') });
    const drop = dropped(run, aim);
    expect(drop).toEqual({
      command: {
        type: 'change-container',
        view: VIEW,
        to: 'clinic-booking',
        shapes: [{ element: 'patient', at: { x: 88, y: 370 } }],
      },
      change: drop?.command,
      label: 'Put "Patient" inside "Clinic booking"',
    });
    const outcome = executeCommand(sample, drop!.command);
    expect(outcome.ok && outcome.label).toBe('Put "Patient" inside "Clinic booking"');
    expect(captionOf(run, aim)).toEqual({
      text: 'Put inside "Clinic booking"',
      detail: 'Alt: move only',
    });
    expect(dropOverlay(run.indexed, run.plan, aim)).toEqual({
      into: shape(run.indexed, 'clinic-booking').rect,
    });
  });

  it('takes WhatsApp out of Clinic booking once it no longer overlaps it, keeping its old position', () => {
    const run = drag(sample, ['whatsapp'], 'clinic-booking/whatsapp', { x: 370, y: 700 });
    const aim = aimOf(run);
    expect(aim).toEqual({ kind: 'out' });
    const drop = dropped(run, aim);
    expect(drop?.command).toEqual({
      type: 'change-container',
      view: VIEW,
      shapes: [{ element: 'whatsapp', from: 'clinic-booking', at: { x: 282, y: 664 } }],
    });
    expect(drop?.label).toBe('Take "WhatsApp channel" out of "Clinic booking"');
    const next = after(sample, drop!.command);
    expect(next.model.relations.some((relation) => relation.id === 'whatsapp-in-clinic')).toBe(
      false,
    );
    const positions = next.views[0]?.positions ?? [];
    expect(positions).toContainEqual({
      element: 'whatsapp',
      container: 'clinic-booking',
      x: 40,
      y: 168,
    });
    expect(positions).toContainEqual({ element: 'whatsapp', x: 282, y: 664, pinned: true });
    expect(captionOf(run, aim)).toEqual({
      text: 'Take out of "Clinic booking"',
      detail: 'Alt: move only',
    });
    expect(landingCover(run.indexed, run.plan, aim, run.delta)).toBeUndefined();
    expect(dropOverlay(run.indexed, run.plan, aim)).toEqual({
      leaving: shape(run.indexed, 'clinic-booking').rect,
    });
  });

  it('keeps WhatsApp in Clinic booking while it still overlaps it, with the pointer outside', () => {
    const run = drag(sample, ['whatsapp'], 'clinic-booking/whatsapp', { x: 370, y: 540 });
    const aim = aimOf(run);
    expect(aim).toEqual({ kind: 'stay' });
    expect(dropped(run, aim)).toBeUndefined();
    expect(captionOf(run, aim)).toBeUndefined();
    expect(dropOverlay(run.indexed, run.plan, aim)).toBeUndefined();
  });

  it('keeps contents in their container while they are rearranged inside it', () => {
    const row = (shape: 'ellipse' | undefined) => {
      const system = after(sample, {
        type: 'create-element',
        element: {
          id: 'empty-system',
          component: 'systems.system',
          name: 'Empty system',
          ...(shape ? { appearance: { shape } } : {}),
        },
        positions: [{ view: VIEW, x: 0, y: 1000, width: 448, height: 144 }],
      });
      const one = after(system, {
        type: 'create-element',
        element: { id: 'one', component: 'systems.service', name: 'One' },
        containers: [{ container: 'empty-system', relationType: 'systems.is-part-of' }],
        positions: [{ view: VIEW, container: 'empty-system', x: 24, y: 48 }],
      });
      return after(one, {
        type: 'create-element',
        element: { id: 'two', component: 'systems.service', name: 'Two' },
        containers: [{ container: 'empty-system', relationType: 'systems.is-part-of' }],
        positions: [{ view: VIEW, container: 'empty-system', x: 244, y: 48 }],
      });
    };
    // The second one below the first, with the pointer below the container.
    const below = drag(row(undefined), ['two'], 'empty-system/two', { x: 114, y: 1176 });
    expect(below.delta).toEqual({ x: -218, y: 92 });
    expect(aimOf(below)).toEqual({ kind: 'stay' });
    // In an ellipse, with the pointer in the corner of its rectangle, outside the ellipse.
    const corner = drag(row('ellipse'), ['two'], 'empty-system/two', { x: 440, y: 1140 });
    expect(shape(corner.indexed, 'empty-system').kind).toBe('ellipse');
    expect(aimOf(corner)).toEqual({ kind: 'stay' });
  });

  it('moves WhatsApp from Clinic booking into Scheduling', () => {
    const run = drag(sample, ['whatsapp'], 'clinic-booking/whatsapp', { x: 1000, y: 420 });
    const aim = aimOf(run);
    const scheduling = shape(run.indexed, 'clinic-booking/scheduling');
    expect(aim).toEqual({ kind: 'into', target: scheduling });
    const drop = dropped(run, aim);
    expect(drop?.command).toEqual({
      type: 'change-container',
      view: VIEW,
      to: 'scheduling',
      shapes: [{ element: 'whatsapp', from: 'clinic-booking', at: { x: 168, y: 280 } }],
    });
    const outcome = executeCommand(sample, drop!.command);
    expect(outcome.ok && outcome.label).toBe(
      'Move "WhatsApp channel" from "Clinic booking" into "Scheduling"',
    );
    expect(drop?.label).toBe('Move "WhatsApp channel" from "Clinic booking" into "Scheduling"');
    expect(captionOf(run, aim)).toEqual({
      text: 'Move into "Scheduling"',
      detail: 'Out of "Clinic booking" · Alt: move only',
    });
    expect(dropOverlay(run.indexed, run.plan, aim)).toEqual({
      into: scheduling.rect,
      leaving: shape(run.indexed, 'clinic-booking').rect,
    });
  });

  it('waits for the pointer to rest on a leaf before putting shapes inside it', () => {
    const run = drag(sample, ['whatsapp'], 'clinic-booking/whatsapp', { x: 590, y: 240 });
    const agent = shape(run.indexed, 'clinic-booking/booking-agent');
    const aim = aimOf(run);
    expect(aim).toEqual({ kind: 'pending', leaf: agent, fallback: { kind: 'stay' } });
    expect(captionOf(run, aim)).toEqual({
      text: 'Hold still to put inside "Booking agent"',
      detail: 'Release now: move only · Lands behind "Booking agent" · Alt: move only',
    });
    expect(dropOverlay(run.indexed, run.plan, aim)).toEqual({
      pending: agent.rect,
      leaving: shape(run.indexed, 'clinic-booking').rect,
    });
    expect(dropped(run, aim)).toBeUndefined();

    const armed = aimOf(run, agent.key);
    expect(armed).toEqual({ kind: 'into', target: agent });
    expect(dropped(run, armed)?.label).toBe(
      'Move "WhatsApp channel" from "Clinic booking" into "Booking agent"',
    );
    expect(captionOf(run, armed)?.text).toBe('Move into "Booking agent"');
  });

  it('never arms a leaf smaller than a dragged shape that holds contents', () => {
    const run = drag(sample, ['scheduling'], 'clinic-booking/scheduling', { x: 590, y: 240 });
    const agent = shape(run.indexed, 'clinic-booking/booking-agent');
    expect(aimOf(run)).toEqual({ kind: 'stay' });
    expect(aimOf(run, agent.key)).toEqual({ kind: 'stay' });
  });

  it('refuses a container inside what moves, and lets nothing below it take the drop', () => {
    const project = withSchedulingInPatient();
    const run = drag(project, ['patient'], 'patient', { x: 1000, y: 420 });
    const scheduling = shape(run.indexed, 'clinic-booking/scheduling');
    const aim = aimOf(run);
    expect(aim).toEqual({
      kind: 'refused',
      target: scheduling,
      reason: '"Scheduling" is part of "Patient" in the model through "is part of"',
    });
    // Released there, Patient only moves, and lands behind Clinic booking, drawn after it.
    expect(captionOf(run, aim)).toEqual({
      text: 'Cannot put inside "Scheduling"',
      detail:
        '"Scheduling" is part of "Patient" in the model through "is part of" · Lands behind "Clinic booking"',
    });
    expect(dropOverlay(run.indexed, run.plan, aim)).toEqual({ refused: scheduling.rect });
    expect(dropped(run, aim)).toBeUndefined();
  });

  it('says when the containment that refuses a drop is one the view does not show', () => {
    const project = after(withExtra(false), {
      type: 'create-relation',
      relation: { relationType: 'extra.holds', from: 'scheduling', to: 'patient' },
    });
    const run = drag(project, ['patient'], 'patient', { x: 1000, y: 420 });
    expect(aimOf(run)).toEqual({
      kind: 'refused',
      target: shape(run.indexed, 'clinic-booking/scheduling'),
      reason:
        '"Scheduling" is part of "Patient" in the model through "holds", which this view does not show',
    });
  });

  it('skips the shapes the drag carries', () => {
    // Clinic booking held over its own Scheduling, which would refuse it.
    const run = drag(sample, ['clinic-booking'], 'clinic-booking', { x: 1000, y: 420 });
    expect(run.plan.blocked.has('scheduling')).toBe(true);
    expect(aimOf(run)).toEqual({ kind: 'stay' });
  });

  it('only moves while Alt is held', () => {
    const run = drag(sample, ['patient'], 'patient', { x: 400, y: 450 });
    const aim = aimOf(run, undefined, true);
    expect(aim).toEqual({ kind: 'only-moves' });
    expect(captionOf(run, aim)).toEqual({
      text: 'Moves only',
      detail: 'Lands behind "Clinic booking"',
    });
    const clear = drag(sample, ['patient'], 'patient', { x: 110, y: 700 });
    expect(captionOf(clear, aimOf(clear, undefined, true))).toEqual({ text: 'Moves only' });
    expect(dropped(run, aim)).toBeUndefined();
  });

  it('shifts what goes inside below the container name, keeping its arrangement', () => {
    const project = withCalendar({ x: 40, y: 300 });
    const run = drag(project, ['patient', 'calendar'], 'patient', { x: 260, y: 60 });
    const aim = aimOf(run);
    expect(aim).toEqual({ kind: 'into', target: shape(run.indexed, 'clinic-booking') });
    const drop = dropped(run, aim);
    expect(drop?.change?.shapes).toEqual([
      { element: 'patient', at: { x: 24, y: 48 } },
      { element: 'calendar', at: { x: 24, y: 148 } },
    ]);
    expect(drop?.label).toBe('Put 2 elements inside "Clinic booking"');
    expect(captionOf(run, aim)?.text).toBe('Put 2 elements inside "Clinic booking"');
  });

  it('places what goes inside relative to the copy of the container under the pointer', () => {
    const project = withSchedulingInPatient();
    const run = drag(project, ['booking-agent'], 'clinic-booking/booking-agent', {
      x: 300,
      y: 600,
    });
    const copy = shape(run.indexed, 'patient/scheduling');
    const aim = aimOf(run);
    expect(aim).toEqual({ kind: 'into', target: copy });
    const drop = dropped(run, aim);
    expect(drop?.change?.shapes).toEqual([
      { element: 'booking-agent', from: 'clinic-booking', at: { x: 148, y: 316 } },
    ]);
    expect(executeCommand(project, drop!.command).ok).toBe(true);
    expect(dropOverlay(run.indexed, run.plan, aim)).toEqual({
      into: copy.rect,
      copies: [shape(run.indexed, 'clinic-booking/scheduling').rect],
      leaving: shape(run.indexed, 'clinic-booking').rect,
    });
  });

  it('puts a selection that spans containers inside entirely', () => {
    const run = drag(sample, ['patient', 'whatsapp'], 'clinic-booking/whatsapp', {
      x: 1000,
      y: 420,
    });
    const aim = aimOf(run);
    const drop = dropped(run, aim);
    expect(drop?.change).toEqual({
      type: 'change-container',
      view: VIEW,
      to: 'scheduling',
      shapes: [
        { element: 'patient', at: { x: 24, y: 272 } },
        { element: 'whatsapp', from: 'clinic-booking', at: { x: 264, y: 280 } },
      ],
    });
    const outcome = executeCommand(sample, drop!.command);
    expect(outcome.ok && outcome.label).toBe('Move 2 elements into "Scheduling"');
    expect(captionOf(run, aim)).toEqual({
      text: 'Move 2 elements into "Scheduling"',
      detail: 'Out of their containers · Alt: move only',
    });
  });

  it('moves the other selected shapes along in one action', () => {
    // WhatsApp leaves Clinic booking; Scheduling, still over it, stays; the note moves.
    const selection = selectionOf([
      { kind: 'element', id: 'whatsapp' },
      { kind: 'element', id: 'scheduling' },
      { kind: 'free-shape', id: 'calendar-note' },
    ]);
    const indexed = indexOf(sample);
    const whatsapp = shape(indexed, 'clinic-booking/whatsapp');
    const plan = planDrop(indexed, sample, VIEW, selection, whatsapp)!;
    const delta = { x: 0, y: 400 };
    const pointer = { x: 370, y: 640 };
    const aim = dropAimAt(indexed, plan, pointer, delta, undefined, () => true);
    expect(aim).toEqual({ kind: 'out' });
    const drop = dropCommand(indexed, sample, VIEW, selection, plan, aim, delta);
    expect(drop?.label).toBe(
      'Take "WhatsApp channel" out of "Clinic booking", and move 2 other shapes',
    );
    expect(drop?.command.type).toBe('batch');
    const outcome = executeCommand(sample, drop!.command);
    expect(outcome.ok && outcome.label).toBe(drop?.label);
    expect(drop?.command.type === 'batch' && drop.command.commands[1]).toEqual({
      type: 'set-positions',
      view: VIEW,
      positions: [
        {
          element: 'scheduling',
          container: 'clinic-booking',
          x: 504,
          y: 464,
          width: 440,
          height: 384,
          pinned: true,
        },
      ],
    });
  });

  it('asks first when a relation ends on the relation that goes, or it has data of its own', () => {
    const run = (project: ProjectSnapshot) => {
      const out = drag(project, ['whatsapp'], 'clinic-booking/whatsapp', { x: 370, y: 700 });
      const drop = dropped(out, aimOf(out));
      return previewChangeContainer(project, drop?.change as ChangeContainerCommand);
    };
    expect(needsConfirmation(run(sample))).toBe(false);
    const ended = after(sample, {
      type: 'create-relation',
      relation: { relationType: 'relates-to', from: 'patient', to: 'whatsapp-in-clinic' },
    });
    const endedOn = run(ended);
    expect(endedOn.cascaded).toHaveLength(1);
    expect(needsConfirmation(endedOn)).toBe(true);
    const named = after(sample, {
      type: 'update-relation',
      id: 'whatsapp-in-clinic',
      changes: { name: 'Front door' },
    });
    const withData = run(named);
    expect(withData.withData).toEqual(['whatsapp-in-clinic']);
    expect(needsConfirmation(withData)).toBe(true);
  });

  it('names the nesting relation type when the view is arranged by more than one', () => {
    const run = drag(withExtra(true), ['whatsapp'], 'clinic-booking/whatsapp', { x: 1000, y: 420 });
    expect(captionOf(run, aimOf(run))?.detail).toBe(
      'Out of "Clinic booking" · is part of · Alt: move only',
    );
  });
});

describe('landingCover', () => {
  it('finds the shape beside a container that will cover what goes into it', () => {
    const project = withCalendar();
    // Over Calendar, a leaf, with Scheduling under it.
    const over = drag(project, ['whatsapp'], 'clinic-booking/whatsapp', { x: 890, y: 190 });
    const aim = aimOf(over);
    expect(aim).toEqual({
      kind: 'pending',
      leaf: shape(over.indexed, 'calendar'),
      fallback: { kind: 'into', target: shape(over.indexed, 'clinic-booking/scheduling') },
    });
    expect(landingCover(over.indexed, over.plan, aim, over.delta)?.name).toBe('Calendar');
    // The detail lowers only the first character of what a release would do.
    expect(captionOf(over, aim)).toEqual({
      text: 'Hold still to put inside "Calendar"',
      detail: 'Release now: move into "Scheduling" · Lands behind "Calendar" · Alt: move only',
    });

    // Over Scheduling beside Calendar, landing under it.
    const beside = drag(
      project,
      ['whatsapp'],
      'clinic-booking/whatsapp',
      { x: 1000, y: 290 },
      { x: 458, y: 274 },
    );
    const into = aimOf(beside);
    expect(into).toEqual({
      kind: 'into',
      target: shape(beside.indexed, 'clinic-booking/scheduling'),
    });
    expect(captionOf(beside, into)).toEqual({
      text: 'Move into "Scheduling"',
      detail: 'Out of "Clinic booking" · Lands behind "Calendar" · Alt: move only',
    });
  });

  it('finds the shape beside a moved shape that will cover it', () => {
    // A plain move of WhatsApp onto Scheduling, with the pointer outside Scheduling.
    const run = drag(
      sample,
      ['whatsapp'],
      'clinic-booking/whatsapp',
      { x: 720, y: 300 },
      { x: 282, y: 240 },
    );
    const aim = aimOf(run);
    expect(aim).toEqual({ kind: 'stay' });
    expect(landingCover(run.indexed, run.plan, aim, run.delta)?.name).toBe('Scheduling');
    expect(captionOf(run, aim)).toEqual({ text: 'Lands behind "Scheduling"' });
  });
});

describe('takeOutCommand', () => {
  it('takes a shape out into the container around its own, beside the one it leaves', () => {
    const indexed = indexOf(sample);
    const api = shape(indexed, 'clinic-booking/scheduling/appointments-api');
    const up = takeOutCommand(indexed, sample, VIEW, api);
    expect(up).toEqual({
      type: 'change-container',
      view: VIEW,
      to: 'clinic-booking',
      shapes: [
        { element: 'appointments-api', from: 'scheduling', at: { x: 984, y: 64 }, pinned: false },
      ],
    });
    expect(containerChangeLabel(sample, VIEW, up!)).toBe(
      'Move "Appointments API" from "Scheduling" into "Clinic booking"',
    );
    const outcome = executeCommand(sample, up!);
    expect(outcome.ok && outcome.label).toBe(containerChangeLabel(sample, VIEW, up!));

    const out = takeOutCommand(indexed, sample, VIEW, shape(indexed, 'clinic-booking/whatsapp'));
    expect(out).toEqual({
      type: 'change-container',
      view: VIEW,
      shapes: [
        { element: 'whatsapp', from: 'clinic-booking', at: { x: 1264, y: 40 }, pinned: false },
      ],
    });
    expect(confirmLabelOf(sample, out!)).toBe('Take out');
    expect(confirmLabelOf(sample, up!)).toBe('Move');
    expect(takeOutCommand(indexed, sample, VIEW, shape(indexed, 'patient'))).toBeUndefined();
  });

  it('keeps a shape taken out into a container below its name', () => {
    const project = after(sample, {
      type: 'set-positions',
      view: VIEW,
      positions: [
        {
          element: 'scheduling',
          container: 'clinic-booking',
          x: 500,
          y: 10,
          width: 440,
          height: 380,
        },
      ],
    });
    const indexed = indexOf(project);
    const api = shape(indexed, 'clinic-booking/scheduling/appointments-api');
    expect(takeOutCommand(indexed, project, VIEW, api)?.shapes[0]?.at).toEqual({ x: 980, y: 48 });
  });

  it('leaves the place it chooses unpinned, so that layout may still move it, pinned or not before', () => {
    const pinned = after(sample, {
      type: 'set-positions',
      view: VIEW,
      positions: [
        { element: 'whatsapp', container: 'clinic-booking', x: 40, y: 164, pinned: true },
      ],
    });
    const indexed = indexOf(pinned);
    const whatsapp = shape(indexed, 'clinic-booking/whatsapp');
    expect(whatsapp.positioned).toBe('pinned');
    const done = after(pinned, takeOutCommand(indexed, pinned, VIEW, whatsapp)!);
    const placed = done.views[0]?.positions.find(
      (each) => each.element === 'whatsapp' && each.container === undefined,
    );
    expect(placed).toEqual({ element: 'whatsapp', x: 1264, y: 40 });
    expect(shape(indexOf(done), 'whatsapp').positioned).toBe('stored');
  });
});

describe('putInsideCommand', () => {
  /** Where Calendar's shape sits once put inside the container under its centre. */
  function putInside(project: ProjectSnapshot) {
    const indexed = indexOf(project);
    const calendar = shape(indexed, 'calendar');
    const target = putInsideTarget(indexed, project, VIEW, calendar)!;
    const done = after(project, putInsideCommand(indexed, project, VIEW, calendar, target));
    return {
      position: done.views[0]?.positions.find(
        (each) => each.element === 'calendar' && each.container === target.element,
      ),
      shape: shape(indexOf(done), `${target.key}/calendar`),
    };
  }

  it('leaves the place unpinned when the shape had a place no one chose by hand', () => {
    const { position, shape: inside } = putInside(withCalendar({ x: 300, y: 300 }));
    expect(position).toEqual({ element: 'calendar', container: 'clinic-booking', x: 60, y: 260 });
    expect(inside.positioned).toBe('stored');
  });

  it('keeps the place pinned when the shape was pinned where it is', () => {
    const pinned = after(withCalendar({ x: 300, y: 300 }), {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'calendar', x: 300, y: 300, pinned: true }],
    });
    const indexed = indexOf(pinned);
    const calendar = shape(indexed, 'calendar');
    const target = putInsideTarget(indexed, pinned, VIEW, calendar)!;
    expect(putInsideCommand(indexed, pinned, VIEW, calendar, target).shapes[0]?.pinned).toBe(true);
    const { position, shape: inside } = putInside(pinned);
    expect(position).toEqual({
      element: 'calendar',
      container: 'clinic-booking',
      x: 60,
      y: 260,
      pinned: true,
    });
    expect(inside.positioned).toBe('pinned');
  });
});

describe('putInsideTarget', () => {
  it('finds the container a shape sits over without being inside it', () => {
    const project = withCalendar({ x: 300, y: 300 });
    const indexed = indexOf(project);
    const calendar = shape(indexed, 'calendar');
    const target = putInsideTarget(indexed, project, VIEW, calendar);
    expect(target?.key).toBe('clinic-booking');
    const change = putInsideCommand(indexed, project, VIEW, calendar, target!);
    expect(change).toEqual({
      type: 'change-container',
      view: VIEW,
      to: 'clinic-booking',
      shapes: [{ element: 'calendar', at: { x: 60, y: 260 }, pinned: false }],
    });
    expect(containerChangeLabel(project, VIEW, change)).toBe(
      'Put "Calendar" inside "Clinic booking"',
    );
    expect(confirmLabelOf(project, change)).toBe('Put inside');
    expect(executeCommand(project, change).ok).toBe(true);
  });

  it('finds the topmost container under the centre, but not the one the shape sits in', () => {
    const project = withCalendar();
    const indexed = indexOf(project);
    expect(putInsideTarget(indexed, project, VIEW, shape(indexed, 'calendar'))?.key).toBe(
      'clinic-booking/scheduling',
    );
    expect(
      putInsideTarget(indexed, project, VIEW, shape(indexed, 'clinic-booking/whatsapp')),
    ).toBeUndefined();
    // Nor anything inside the shape itself.
    expect(
      putInsideTarget(indexed, project, VIEW, shape(indexed, 'clinic-booking')),
    ).toBeUndefined();
  });

  it('clamps the place below the target name', () => {
    const project = withCalendar({ x: 250, y: 45 });
    const indexed = indexOf(project);
    const calendar = shape(indexed, 'calendar');
    const target = putInsideTarget(indexed, project, VIEW, calendar)!;
    expect(putInsideCommand(indexed, project, VIEW, calendar, target).shapes[0]?.at).toEqual({
      x: 24,
      y: 48,
    });
  });
});
