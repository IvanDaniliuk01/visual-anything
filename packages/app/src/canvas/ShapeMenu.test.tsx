import { SYSTEMS, executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { selectionOf, type Selection } from '../editor/selection';
import { loadSample } from '../test/sample';
import { putInsideCommand, takeOutCommand } from './drop';
import { indexScene, shapesAt, type IndexedScene } from './hit';
import { buildScene, type ElementShape } from './scene';
import { ShapeMenu } from './ShapeMenu';
import { stackingActions } from './stacking';

const VIEW = 'system-overview';
const sample = loadSample();

function after(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  return outcome.state;
}

function withCalendar(at = { x: 300, y: 300 }): ProjectSnapshot {
  return after(sample, {
    type: 'create-element',
    element: { id: 'calendar', component: 'clinic.calendar', name: 'Calendar' },
    positions: [{ view: VIEW, ...at }],
  });
}

function elements(...ids: string[]): Selection {
  return selectionOf(ids.map((id) => ({ kind: 'element' as const, id })));
}

function shapeOf(indexed: IndexedScene, key: string): ElementShape {
  const found = indexed.byKey.get(key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

function open(
  project: ProjectSnapshot,
  key: string,
  options: Partial<ComponentProps<typeof ShapeMenu>> & { viewId?: string } = {},
) {
  const viewId = options.viewId ?? VIEW;
  const indexed = indexScene(buildScene(project, viewId));
  const shape = shapeOf(indexed, key);
  const selection = options.selection ?? elements(shape.element);
  const callbacks = {
    onRestack: vi.fn(),
    onChange: vi.fn(),
    onChooseContainer: vi.fn(),
    onAddInside: vi.fn(),
    onSelectShape: vi.fn(),
    onClose: vi.fn(),
  };
  const { unmount } = render(
    <ShapeMenu
      indexed={indexed}
      project={project}
      viewId={viewId}
      selection={selection}
      shape={shape}
      at={{ x: 20, y: 30 }}
      stacking={stackingActions(indexed, project, viewId, selection)}
      editable
      {...callbacks}
      {...options}
    />,
  );
  const menu = screen.getByRole('menu', { name: shape.name });
  const names = within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);
  return { menu, names, indexed, shape, unmount, ...callbacks };
}

describe('ShapeMenu', () => {
  it('moves through its items with the keys, and presses even the ones that would change nothing', () => {
    const { menu, names, onRestack, onClose } = open(withCalendar(), 'calendar');
    expect(names.slice(0, 4)).toEqual([
      'Bring to front',
      'Bring forward',
      'Send backward',
      'Send to back',
    ]);
    const items = within(menu).getAllByRole('menuitem');
    const front = items[0] as HTMLElement;
    expect(front).toHaveFocus();
    expect(front).toHaveAttribute('aria-disabled', 'true');
    expect(front.title).toMatch(/^"Calendar" is already in front of everything it overlaps/);
    expect(items[2]).not.toHaveAttribute('aria-disabled');
    expect(items[2]).toHaveAttribute(
      'title',
      'Send backward, behind "Clinic booking", which hides it (Ctrl+↓)',
    );

    fireEvent.keyDown(menu, { key: 'Enter' });
    expect(onRestack).toHaveBeenLastCalledWith('front');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[2]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Enter' });
    expect(onRestack).toHaveBeenLastCalledWith('backward');
    fireEvent.keyDown(menu, { key: 'End' });
    expect(items.at(-1)).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(front).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(front).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers to put a shape directly in World inside the container under its centre', () => {
    const project = withCalendar();
    const { menu, names, indexed, shape, onChange, onChooseContainer, onAddInside } = open(
      project,
      'calendar',
    );
    expect(names.slice(4)).toEqual([
      'Put inside "Clinic booking"',
      'Put inside…',
      'Add inside "Calendar"…',
    ]);
    expect(within(menu).getAllByRole('separator')).toHaveLength(1);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Put inside "Clinic booking"' }));
    expect(onChange).toHaveBeenCalledWith(
      putInsideCommand(indexed, project, VIEW, shape, shapeOf(indexed, 'clinic-booking')),
    );
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Put inside…' }));
    expect(onChooseContainer).toHaveBeenCalledWith('put');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Add inside "Calendar"…' }));
    expect(onAddInside).toHaveBeenCalledWith('calendar');
  });

  it('offers to move a shape in a container, or take it out of it', () => {
    const { menu, names, indexed, shape, onChange, onChooseContainer } = open(
      sample,
      'clinic-booking/whatsapp',
    );
    expect(names.slice(4)).toEqual([
      'Move to…',
      'Take out of "Clinic booking"',
      'Add inside "WhatsApp channel"…',
    ]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Take out of "Clinic booking"' }));
    expect(onChange).toHaveBeenCalledWith(takeOutCommand(indexed, sample, VIEW, shape));
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move to…' }));
    expect(onChooseContainer).toHaveBeenCalledWith('move');

    // The container under the Appointments API's centre beyond its own.
    const api = open(sample, 'clinic-booking/scheduling/appointments-api');
    expect(api.names.slice(4)).toEqual([
      'Move into "Clinic booking"',
      'Move to…',
      'Take out of "Scheduling"',
      'Add inside "Appointments API"…',
    ]);
  });

  it('takes nothing out of an element that sits in two containers in the view', () => {
    const twice = after(sample, {
      type: 'create-relation',
      relation: { relationType: 'systems.is-part-of', from: 'scheduling', to: 'patient' },
    });
    const { names } = open(twice, 'clinic-booking/scheduling');
    expect(names).not.toContainEqual(expect.stringMatching(/^Take out/));
    expect(names).toContain('Move to…');
  });

  it('offers no containment for several elements, or in a view that nests nothing', () => {
    const several = open(sample, 'clinic-booking/whatsapp', {
      selection: elements('whatsapp', 'patient'),
    });
    expect(several.names).toHaveLength(4);
    expect(within(several.menu).queryByRole('separator')).not.toBeInTheDocument();
    several.unmount();

    const flat: ProjectSnapshot = {
      ...sample,
      views: sample.views.map((view) => ({ ...view, nestingRelationTypes: [] })),
    };
    expect(open(flat, 'patient').names).toHaveLength(4);
  });

  it('turns the containment items off while the project cannot be changed', () => {
    const { menu, onChange } = open(sample, 'clinic-booking/whatsapp', { editable: false });
    const takeOut = within(menu).getByRole('menuitem', { name: 'Take out of "Clinic booking"' });
    expect(takeOut).toHaveAttribute('aria-disabled', 'true');
    expect(takeOut).toHaveAttribute('title', 'The project cannot be changed now.');
    fireEvent.click(takeOut);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('lists the other shapes under the pointer, topmost first, only when opened with the pointer', () => {
    const project = withCalendar({ x: 800, y: 150 });
    const indexed = indexScene(buildScene(project, VIEW));
    const under = shapesAt(indexed, { x: 890, y: 220 });
    const { menu, onSelectShape, unmount } = open(project, 'calendar', { under });
    const group = within(menu).getByRole('group', { name: 'Under the pointer' });
    expect(
      within(group)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Select "Appointments API"', 'Select "Scheduling"', 'Select "Clinic booking"']);
    fireEvent.click(within(group).getByRole('menuitem', { name: 'Select "Scheduling"' }));
    expect(onSelectShape).toHaveBeenCalledWith(shapeOf(indexed, 'clinic-booking/scheduling'));
    unmount();

    expect(open(project, 'calendar').menu).not.toHaveTextContent('Under the pointer');
  });

  it('lists at most eight shapes under the pointer', () => {
    const stack: ProjectSnapshot = {
      project: { schemaVersion: 1, name: 'Stack', packages: ['systems'] },
      model: {
        world: { id: 'world', component: 'essence', name: 'World' },
        elements: Array.from({ length: 12 }, (_, at) => ({
          id: `s${at}`,
          component: 'systems.service',
          name: `S${at}`,
        })),
        relations: [],
      },
      packages: [SYSTEMS],
      views: [
        {
          id: 'stack',
          name: 'Stack',
          perspective: { name: 'Stack' },
          nestingRelationTypes: ['systems.is-part-of'],
          positions: Array.from({ length: 12 }, (_, at) => ({
            element: `s${at}`,
            x: at,
            y: at,
          })),
          freeShapes: [],
        },
      ],
      scenarios: [],
    };
    const indexed = indexScene(buildScene(stack, 'stack'));
    const under = shapesAt(indexed, { x: 50, y: 50 });
    expect(under).toHaveLength(12);
    const { menu } = open(stack, 's11', { viewId: 'stack', under });
    const group = within(menu).getByRole('group', { name: 'Under the pointer' });
    expect(
      within(group)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['S10', 'S9', 'S8', 'S7', 'S6', 'S5', 'S4', 'S3'].map((name) => `Select "${name}"`));
  });
});
