/**
 * The shape menu's scope items (ADR-0040): Leave out of this view, for the shape or the selection that
 * holds it, and Add to this view for the far ends of the relations that leave the view.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Scope } from '@visual-anything/schema';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { selectionOf, type Selection } from '../editor/selection';
import { loadSample } from '../test/sample';
import { indexScene } from './hit';
import { buildScene } from './scene';
import type { ScopeAction } from './scopeActions';
import { ShapeMenu } from './ShapeMenu';
import { stackingActions } from './stacking';

const VIEW = 'system-overview';

function scoped(scope: Scope | undefined): ProjectSnapshot {
  const project = loadSample();
  return {
    ...project,
    views: project.views.map((view) => (view.id === VIEW ? { ...view, scope } : view)),
  };
}

function open(project: ProjectSnapshot, key: string, selection?: Selection, editable = true) {
  const indexed = indexScene(buildScene(project, VIEW));
  const shape = indexed.byKey.get(key);
  if (!shape) throw new Error(`No shape ${key}`);
  const chosen = selection ?? selectionOf([{ kind: 'element', id: shape.element }]);
  const onScope = vi.fn<(action: ScopeAction) => void>();
  render(
    <ShapeMenu
      indexed={indexed}
      project={project}
      viewId={VIEW}
      selection={chosen}
      shape={shape}
      at={{ x: 10, y: 10 }}
      stacking={stackingActions(indexed, project, VIEW, chosen)}
      editable={editable}
      onRestack={vi.fn()}
      onChange={vi.fn()}
      onChooseContainer={vi.fn()}
      onAddInside={vi.fn()}
      onSelectShape={vi.fn()}
      onClose={vi.fn()}
      onScope={onScope}
    />,
  );
  return { menu: screen.getByRole('menu', { name: shape.name }), onScope };
}

describe('the shape menu’s scope items', () => {
  it('leave the shape out of the view', () => {
    const { menu, onScope } = open(scoped(undefined), 'patient');
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Leave "Patient" out of this view' }),
    );
    expect(onScope).toHaveBeenCalledWith(
      expect.objectContaining({
        command: { type: 'leave-out-of-view', view: VIEW, elements: ['patient'] },
      }),
    );
  });

  it('leave the whole selection out when it holds the shape', () => {
    const selection = selectionOf([
      { kind: 'element', id: 'patient' },
      { kind: 'element', id: 'whatsapp' },
    ]);
    const { menu } = open(scoped(undefined), 'patient', selection);
    expect(
      within(menu).getByRole('menuitem', { name: 'Leave 2 elements out of this view' }),
    ).toBeTruthy();
  });

  it('add what the relations that leave the view reach', () => {
    const { menu, onScope } = open(
      scoped({ leftOut: ['appointments-db'] }),
      'clinic-booking/scheduling/appointments-api',
    );
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Add to this view the element they relate to' }),
    );
    expect(onScope).toHaveBeenCalledWith(
      expect.objectContaining({
        command: { type: 'add-to-view', view: VIEW, elements: ['appointments-db'] },
        done: 'Add "Appointments DB" to "System overview"',
      }),
    );
  });

  it('do nothing while the project cannot be changed', () => {
    const { menu, onScope } = open(scoped(undefined), 'patient', undefined, false);
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Leave "Patient" out of this view' }),
    );
    expect(onScope).not.toHaveBeenCalled();
  });
});
