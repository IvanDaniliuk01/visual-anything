/**
 * The scene of a view with a scope (ADR-0040): it draws only what the scope shows, each shape in its
 * nearest container that shows; collapsed containers aggregate only the relations that show; shapes
 * keep the relations that leave the view; layout sees only what shows; and a change of scope keeps
 * every shape it does not touch the same object.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Scope, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { layoutInput } from './layout/input';
import { buildScene, buildSceneAfresh, type Scene } from './scene';

const VIEW = 'system-overview';

function scoped(
  scope: Scope | undefined,
  project: ProjectSnapshot = loadSample(),
): ProjectSnapshot {
  return {
    ...project,
    views: project.views.map((view) => {
      if (view.id !== VIEW) return view;
      const rest: ViewFile = { ...view };
      delete rest.scope;
      return scope === undefined ? rest : { ...rest, scope };
    }),
  };
}

function run(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

const keysOf = (scene: Scene) => scene.shapes.map((shape) => shape.key);
const linesOf = (scene: Scene) => scene.relations.map((line) => line.relation);

describe('the scene of a view with a scope', () => {
  it('draws only what the scope shows, and the relations both of whose ends show', () => {
    const project = scoped({ leftOut: ['appointments-db'] });
    const scene = buildScene(project, VIEW);
    expect(scene.shapes.some((shape) => shape.element === 'appointments-db')).toBe(false);
    expect(linesOf(scene)).not.toContain('api-reads-db');
    expect(linesOf(scene)).not.toContain('api-writes-db');
    expect(linesOf(scene)).toContain('agent-to-api');
    expect(scene).toEqual(buildSceneAfresh(project, VIEW));
  });

  it('puts a shape whose container is left out in its nearest container that shows', () => {
    const project = scoped({ leftOut: ['scheduling'] });
    const scene = buildScene(project, VIEW);
    expect(keysOf(scene)).toEqual(
      expect.arrayContaining([
        'clinic-booking/appointments-api',
        'clinic-booking/appointments-db',
        'clinic-booking/reminder-service',
      ]),
    );
    expect(keysOf(scene).some((key) => key.includes('scheduling'))).toBe(false);
    const api = scene.shapes.find((shape) => shape.element === 'appointments-api');
    expect(api?.container).toBe('clinic-booking');
    // Its position inside the scheduling system is kept in the view, and not used here.
    expect(api?.positioned).toBe('placed');
    expect(scene).toEqual(buildSceneAfresh(project, VIEW));
  });

  it('puts it directly in World when no container that holds it shows', () => {
    const project = scoped({ leftOut: ['scheduling', 'clinic-booking'] });
    const scene = buildScene(project, VIEW);
    const api = scene.shapes.find((shape) => shape.element === 'appointments-api');
    expect(api?.key).toBe('appointments-api');
    expect(api?.container).toBeUndefined();
  });

  it('places it where a move or a layout stores it, in the container it sits in', () => {
    const project = scoped({ leftOut: ['scheduling'] });
    const moved = run(project, {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'appointments-api', container: 'clinic-booking', x: 48, y: 96 }],
    });
    const scene = buildScene(moved, VIEW);
    const api = scene.shapes.find((shape) => shape.element === 'appointments-api');
    expect(api?.offset).toEqual({ x: 48, y: 96 });
    expect(api?.positioned).toBe('stored');
    expect(scene).toEqual(buildSceneAfresh(moved, VIEW));
  });

  it('counts on each shape the relations that leave the view from it', () => {
    const project = scoped({ leftOut: ['appointments-db', 'patient'] });
    const scene = buildScene(project, VIEW);
    const leaving = (element: string) =>
      scene.shapes.find((shape) => shape.element === element)?.leaving;
    expect(leaving('appointments-api')).toEqual(['api-reads-db', 'api-writes-db']);
    expect(leaving('whatsapp')).toEqual(['patient-to-whatsapp']);
    expect(leaving('booking-agent')).toBeUndefined();
    // Containment that the view arranges by never leaves it.
    expect(leaving('scheduling')).toBeUndefined();
    // Nothing leaves a view without a scope.
    expect(buildScene(scoped(undefined), VIEW).shapes.some((shape) => shape.leaving)).toBe(false);
  });

  it('aggregates in a collapsed container only the relations that show', () => {
    const whole = run(scoped(undefined), {
      type: 'set-collapsed',
      view: VIEW,
      elements: ['clinic-booking'],
      collapsed: true,
    });
    const aggregated = (scene: Scene) =>
      scene.relations.flatMap((line) => line.aggregate?.relations ?? []);
    expect(aggregated(buildScene(whole, VIEW))).toContain('patient-to-whatsapp');
    const without = scoped({ leftOut: ['whatsapp'] }, whole);
    const scene = buildScene(without, VIEW);
    expect(aggregated(scene)).not.toContain('patient-to-whatsapp');
    expect(scene).toEqual(buildSceneAfresh(without, VIEW));
  });

  it('gives layout only what shows', () => {
    const project = scoped({ leftOut: ['reminder-service', 'patient'] });
    const scene = buildScene(project, VIEW);
    const input = layoutInput(scene, project, { kind: 'view' });
    const laid = input?.shapes.map((shape) => shape.element) ?? [];
    expect(laid).not.toContain('reminder-service');
    expect(laid).not.toContain('patient');
    expect(laid).toContain('appointments-api');
  });

  it('keeps the shapes a change of scope does not touch the same objects', () => {
    const project = scoped(undefined);
    const before = buildScene(project, VIEW);
    const after = buildScene(
      run(project, { type: 'leave-out-of-view', view: VIEW, elements: ['reminder-service'] }),
      VIEW,
    );
    const patient = (scene: Scene) => scene.shapes.find((shape) => shape.element === 'patient');
    expect(patient(after)).toBe(patient(before));
    expect(after.shapes.some((shape) => shape.element === 'reminder-service')).toBe(false);
  });

  it('draws what a scope that shows everything shows as a view without one does', () => {
    const whole = buildSceneAfresh(scoped(undefined), VIEW);
    const all = buildSceneAfresh(
      scoped({ exclude: [{ kind: 'component', component: 'nothing.at-all' }] }),
      VIEW,
    );
    expect(all).toEqual(whole);
  });
});
