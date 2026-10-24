import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { loadSample } from '../test/sample';
import { ContainerChooser } from './ContainerChooser';

const VIEW = 'system-overview';
const sample = loadSample();

function after(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  return outcome.state;
}

function withCalendar(): ProjectSnapshot {
  return after(sample, {
    type: 'create-element',
    element: { id: 'calendar', component: 'clinic.calendar', name: 'Calendar' },
    positions: [{ view: VIEW, x: 300, y: 300 }],
  });
}

function choose(project: ProjectSnapshot, element: string, mode: 'put' | 'move', viewId = VIEW) {
  const onChoose = vi.fn();
  const onCancel = vi.fn();
  const { unmount } = render(
    <ContainerChooser
      project={project}
      viewId={viewId}
      element={element}
      mode={mode}
      onChoose={onChoose}
      onCancel={onCancel}
    />,
  );
  const dialog = screen.getByRole('dialog');
  const field = within(dialog).getByRole('combobox');
  const options = () =>
    within(dialog)
      .queryAllByRole('option')
      .map((option) => option.textContent);
  return { dialog, field, options, onChoose, onCancel, unmount };
}

describe('ContainerChooser', () => {
  it('puts an element directly in World inside any element but itself', () => {
    const { dialog, field, options } = choose(withCalendar(), 'calendar', 'put');
    expect(dialog).toHaveAccessibleName('Put "Calendar" inside…');
    expect(field).toHaveAccessibleName('Put "Calendar" inside…');
    expect(field).toHaveFocus();
    expect(options()).toEqual([
      'Patient',
      'Clinic booking',
      'WhatsApp channel',
      'Booking agent',
      'Scheduling',
      'Appointments API',
      'Appointments DB',
      'Reminder service',
    ]);
  });

  it('moves an element elsewhere, or directly in World, but not into what holds it or what it holds', () => {
    const { dialog, options } = choose(sample, 'scheduling', 'move');
    expect(dialog).toHaveAccessibleName('Move "Scheduling" to…');
    expect(options()).toEqual([
      'Directly in World',
      'Patient',
      'WhatsApp channel',
      'Booking agent',
    ]);
  });

  it('leaves out what the element holds through a nesting relation type the view does not show', () => {
    const extra: PackageFile = {
      id: 'extra',
      name: 'Extra',
      components: [],
      relationTypes: [{ id: 'extra.holds', name: 'holds', derivesFrom: 'relates-to', nests: true }],
    };
    const project = after(
      {
        ...sample,
        project: { ...sample.project, packages: [...sample.project.packages, 'extra'] },
        packages: [...sample.packages, extra],
      },
      {
        type: 'create-relation',
        relation: { relationType: 'extra.holds', from: 'patient', to: 'scheduling' },
      },
    );
    expect(choose(project, 'scheduling', 'move').options()).toEqual([
      'Directly in World',
      'WhatsApp channel',
      'Booking agent',
    ]);
  });

  it('lists the elements whose names hold what is typed, whatever the case', () => {
    const { field, options, unmount } = choose(withCalendar(), 'calendar', 'put');
    fireEvent.change(field, { target: { value: 'BOOK' } });
    expect(options()).toEqual(['Clinic booking', 'Booking agent']);
    fireEvent.change(field, { target: { value: 'nothing like it' } });
    expect(options()).toEqual([]);
    expect(field).toHaveAttribute('aria-expanded', 'false');
    unmount();

    const move = choose(sample, 'whatsapp', 'move');
    fireEvent.change(move.field, { target: { value: 'sched' } });
    expect(move.options()).toEqual(['Scheduling']);
  });

  it('lists twenty elements at most', () => {
    const big = syntheticProject({ elements: 100 });
    const { options } = choose(big, 'system-0', 'put', 'everything');
    expect(options()).toHaveLength(20);
  });

  it('chooses with the arrow keys and Enter, and cancels with Escape', () => {
    const first = choose(sample, 'scheduling', 'move');
    const listed = within(first.dialog).getAllByRole('option');
    expect(listed[0]).toHaveAttribute('aria-selected', 'true');
    expect(first.field).toHaveAttribute('aria-activedescendant', listed[0]?.id);
    fireEvent.keyDown(first.field, { key: 'ArrowDown' });
    fireEvent.keyDown(first.field, { key: 'ArrowDown' });
    fireEvent.keyDown(first.field, { key: 'ArrowUp' });
    expect(first.field).toHaveAttribute('aria-activedescendant', listed[1]?.id);
    expect(listed[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(first.field, { key: 'Enter' });
    expect(first.onChoose).toHaveBeenCalledWith('patient');
    first.unmount();

    const world = choose(sample, 'scheduling', 'move');
    fireEvent.keyDown(world.field, { key: 'Enter' });
    expect(world.onChoose).toHaveBeenCalledWith(undefined);
    fireEvent.keyDown(world.field, { key: 'Escape' });
    expect(world.onCancel).toHaveBeenCalledTimes(1);
    world.unmount();

    const clicked = choose(sample, 'scheduling', 'move');
    fireEvent.click(within(clicked.dialog).getByRole('option', { name: 'Booking agent' }));
    expect(clicked.onChoose).toHaveBeenCalledWith('booking-agent');
    fireEvent.click(within(clicked.dialog).getByRole('button', { name: 'Cancel' }));
    expect(clicked.onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the focus inside while it is open', () => {
    const { dialog, field } = choose(sample, 'scheduling', 'move');
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    fireEvent.keyDown(field, { key: 'Tab', shiftKey: true });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: 'Tab' });
    expect(field).toHaveFocus();
  });
});
