/**
 * What a view's scope does on the canvas and in its menus (ADR-0040): the relations that leave the
 * view, the elements adding brings in, the menu's items, the mark on a shape, the commands sent when
 * creating, and the order of the perspective switcher.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Scope, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, selectionOf } from '../editor/selection';
import { loadSample } from '../test/sample';
import { describeShape } from './announce';
import { createAtCommand, createInsideCommand } from './gestures';
import { indexScene } from './hit';
import { leavingMarkRect, leavingText, onLeavingMark } from './leavingMark';
import { buildScene, type ElementShape } from './scene';
import {
  endsToAdd,
  leavingByElement,
  leavingTitle,
  madeIn,
  scopeSignature,
  toAdd,
  viewsByScope,
} from './scope';
import { scopeActions } from './scopeActions';

const VIEW = 'system-overview';

function scoped(scope: Scope | undefined): ProjectSnapshot {
  const project = loadSample();
  return {
    ...project,
    views: project.views.map((view) => (view.id === VIEW ? { ...view, scope } : view)),
  };
}

const viewOf = (project: ProjectSnapshot) =>
  project.views.find((view) => view.id === VIEW) as ViewFile;

describe('the relations that leave a view', () => {
  it('are listed for each element that shows, and nothing leaves a view without a scope', () => {
    const project = scoped({ leftOut: ['appointments-db'] });
    expect([...leavingByElement(project, viewOf(project))]).toEqual([
      ['appointments-api', ['api-reads-db', 'api-writes-db']],
    ]);
    const whole = loadSample();
    expect(leavingByElement(whole, viewOf(whole)).size).toBe(0);
  });

  it('bring in their far ends when added', () => {
    const project = scoped({ leftOut: ['appointments-db', 'patient'] });
    const view = viewOf(project);
    expect(
      endsToAdd(project, view, ['api-reads-db', 'api-writes-db', 'patient-to-whatsapp']),
    ).toEqual(['appointments-db', 'patient']);
    expect(toAdd(project, view, { elements: ['patient', 'whatsapp'] })).toEqual(['patient']);
    expect(toAdd(project, view, { relations: ['agent-to-api'] })).toEqual([]);
  });

  it('are named in the mark’s tooltip', () => {
    const project = scoped({ leftOut: ['appointments-db'] });
    expect(leavingTitle(project, ['api-reads-db', 'api-writes-db'])).toMatch(
      /^2 relations leave this view: .*Appointments API.*\. The inspector lists them, with Add to this view\.$/,
    );
  });
});

describe('the mark of the relations that leave the view', () => {
  const shape = (leaving: string[] | undefined, width = 160, height = 80) =>
    ({
      rect: { x: 0, y: 0, width, height },
      ...(leaving ? { leaving } : {}),
    }) as unknown as ElementShape;

  it('sits in the bottom right corner of a shape from which relations leave', () => {
    const mark = leavingMarkRect(shape(['a', 'b']));
    expect(mark).toBeDefined();
    expect(mark!.x + mark!.width).toBeLessThanOrEqual(160);
    expect(mark!.y + mark!.height).toBeLessThanOrEqual(80);
    expect(mark!.x).toBeGreaterThan(80);
    expect(leavingText(shape(['a', 'b']))).toBe('→2');
    expect(onLeavingMark(shape(['a']), { x: mark!.x + 2, y: mark!.y + 2 })).toBe(true);
    expect(onLeavingMark(shape(['a']), { x: 4, y: 4 })).toBe(false);
  });

  it('is not drawn when nothing leaves, on a row, or on a shape too small for it', () => {
    expect(leavingMarkRect(shape(undefined))).toBeUndefined();
    expect(leavingMarkRect({ ...shape(['a']), row: 0 })).toBeUndefined();
    expect(leavingMarkRect(shape(['a'], 30, 20))).toBeUndefined();
  });
});

describe('the menu’s scope items', () => {
  it('leave out the element pressed, or the selection that holds it, as one command', () => {
    const project = scoped(undefined);
    const one = scopeActions(project, VIEW, EMPTY_SELECTION, 'patient');
    expect(one.leaveOut).toMatchObject({
      label: 'Leave "Patient" out of this view',
      command: { type: 'leave-out-of-view', view: VIEW, elements: ['patient'] },
      done: 'Leave "Patient" out of "System overview"',
    });
    expect(one.add).toBeUndefined();
    const selection = selectionOf([
      { kind: 'element', id: 'patient' },
      { kind: 'element', id: 'whatsapp' },
    ]);
    expect(scopeActions(project, VIEW, selection, 'whatsapp').leaveOut).toMatchObject({
      label: 'Leave 2 elements out of this view',
      command: { elements: ['patient', 'whatsapp'] },
    });
  });

  it('add what the relations that leave the view reach', () => {
    const project = scoped({ leftOut: ['appointments-db'] });
    expect(scopeActions(project, VIEW, EMPTY_SELECTION, 'appointments-api').add).toMatchObject({
      label: 'Add to this view the element they relate to',
      command: { type: 'add-to-view', view: VIEW, elements: ['appointments-db'] },
      done: 'Add "Appointments DB" to "System overview"',
    });
  });

  it('offer nothing for World, or in a view the project does not have', () => {
    const project = scoped(undefined);
    expect(scopeActions(project, VIEW, EMPTY_SELECTION, 'world')).toEqual({});
    expect(scopeActions(project, 'nowhere', EMPTY_SELECTION, 'patient')).toEqual({});
  });
});

describe('creating in a view with a scope', () => {
  it('says the view it is made in, so that the new element shows there', () => {
    const project = scoped({ include: [{ kind: 'component', component: 'systems.person' }] });
    expect(madeIn(viewOf(project))).toEqual({ inView: VIEW });
    expect(madeIn(viewOf(loadSample()))).toEqual({});
    const inside = createInsideCommand(project, VIEW, 'systems.service', 'clinic-booking');
    expect(JSON.stringify(inside)).toContain(`"inView":"${VIEW}"`);
    const at = createAtCommand(project, VIEW, 'systems.service', { x: 10, y: 10 }, undefined);
    expect(JSON.stringify(at)).toContain(`"inView":"${VIEW}"`);
    expect(
      JSON.stringify(
        createAtCommand(loadSample(), VIEW, 'systems.service', { x: 0, y: 0 }, undefined),
      ),
    ).not.toContain('inView');
  });
});

describe('the perspective switcher', () => {
  it('lists first the views with the same scope as the open one', () => {
    const base = viewOf(loadSample());
    const views: ViewFile[] = [
      { ...base, id: 'a' },
      { ...base, id: 'b', scope: { leftOut: ['patient'] } },
      { ...base, id: 'c' },
      { ...base, id: 'd', scope: { leftOut: ['patient'] } },
    ];
    expect(viewsByScope(views, 'b')).toEqual({
      same: [views[1], views[3]],
      others: [views[0], views[2]],
    });
    expect(viewsByScope(views, 'a').same.map((view) => view.id)).toEqual(['a', 'c']);
  });

  it('compares scopes whatever the order of their keys and lists', () => {
    expect(
      scopeSignature({
        include: [{ kind: 'component', component: 'x', exactly: true }],
        added: ['b', 'a'],
      }),
    ).toBe(
      scopeSignature({
        added: ['a', 'b'],
        include: [{ exactly: true, component: 'x', kind: 'component' }],
      }),
    );
    expect(scopeSignature(undefined)).toBe('');
  });
});

describe('the scene that the scope items act on', () => {
  it('has the mark’s relations on the shapes, which the keys say', () => {
    const project = scoped({ leftOut: ['appointments-db'] });
    const indexed = indexScene(buildScene(project, VIEW));
    const api = indexed.scene.shapes.find((each) => each.element === 'appointments-api');
    expect(api?.leaving).toEqual(['api-reads-db', 'api-writes-db']);
    expect(describeShape(indexed, project, api!)).toMatch(/ 2 relations leave this view\.$/);
  });
});
