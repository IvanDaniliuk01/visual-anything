import {
  executeCommand,
  previewChangeContainer,
  previewDelete,
  type ChangeContainerCommand,
  type Command,
  type ContainerChangePreview,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { loadSample } from '../test/sample';
import { DeleteDialog } from './DeleteDialog';

const VIEW = 'system-overview';
const sample = loadSample();

function after(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  return outcome.state;
}

/** Takes elements out of Clinic booking, to World. */
function takeOut(...elements: string[]): ChangeContainerCommand {
  return {
    type: 'change-container',
    view: VIEW,
    shapes: elements.map((element) => ({ element, from: 'clinic-booking' })),
  };
}

function confirmChange(
  project: ProjectSnapshot,
  change: ChangeContainerCommand,
  title: string,
  confirmLabel = 'Take out',
) {
  const preview: ContainerChangePreview = previewChangeContainer(project, change);
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const { unmount } = render(
    <DeleteDialog
      project={project}
      preview={preview}
      freeShapes={0}
      action={{ title, confirmLabel, leaving: preview.leaving, withData: preview.withData }}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { dialog: screen.getByRole('dialog', { name: title }), onConfirm, onCancel, unmount };
}

describe('DeleteDialog', () => {
  it('previews a deletion and what it cascades to', () => {
    const preview = previewDelete(sample, { elements: ['appointments-api'] });
    const onConfirm = vi.fn();
    render(
      <DeleteDialog
        project={sample}
        preview={preview}
        freeShapes={0}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete "Appointments API"?' });
    expect(dialog).toHaveTextContent('These 5 relations end on what you delete, so they go too:');
    expect(within(dialog).getByText('HTTPS')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('You can undo this.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('asks before a change of container takes away the relation that places a shape', () => {
    const { dialog, onConfirm, onCancel } = confirmChange(
      sample,
      takeOut('whatsapp'),
      'Take "WhatsApp channel" out of "Clinic booking"?',
    );
    expect(dialog).toHaveTextContent(
      'This takes away the relation "WhatsApp channel → Clinic booking".',
    );
    expect(dialog).not.toHaveTextContent('of its own');
    expect(dialog).toHaveTextContent('You can undo this.');
    const confirm = within(dialog).getByRole('button', { name: 'Take out' });
    expect(confirm).toHaveFocus();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('says when the relation that goes has data of its own', () => {
    const named = after(sample, {
      type: 'update-relation',
      id: 'whatsapp-in-clinic',
      changes: { description: 'Where patients write first.' },
    });
    const { dialog } = confirmChange(
      named,
      takeOut('whatsapp'),
      'Take "WhatsApp channel" out of "Clinic booking"?',
    );
    expect(dialog).toHaveTextContent(
      'It has a name, a description or attributes of its own, which go with it.',
    );
  });

  it('lists the relations that go, and those that end on them', () => {
    const endedOnce = after(sample, {
      type: 'create-relation',
      relation: { relationType: 'relates-to', from: 'patient', to: 'whatsapp-in-clinic' },
    });
    const once = confirmChange(
      endedOnce,
      takeOut('whatsapp'),
      'Take "WhatsApp channel" out of "Clinic booking"?',
    );
    expect(once.dialog).toHaveTextContent('This relation ends on it, so it goes too:');
    once.unmount();

    const endedTwice = after(endedOnce, {
      type: 'create-relation',
      relation: { relationType: 'relates-to', from: 'booking-agent', to: 'whatsapp-in-clinic' },
    });
    const twice = confirmChange(
      endedTwice,
      takeOut('whatsapp'),
      'Take "WhatsApp channel" out of "Clinic booking"?',
    );
    expect(twice.dialog).toHaveTextContent('These 2 relations end on it, so they go too:');
    twice.unmount();

    const two = confirmChange(
      sample,
      takeOut('whatsapp', 'booking-agent'),
      'Take 2 elements out of "Clinic booking"?',
    );
    expect(two.dialog).toHaveTextContent(
      'This takes away the 2 relations that place the shapes where they are:',
    );
    expect(within(two.dialog).getByText('WhatsApp channel → Clinic booking')).toBeInTheDocument();
    expect(within(two.dialog).getByText('Booking agent → Clinic booking')).toBeInTheDocument();
  });

  it('keeps the focus inside while it is open', () => {
    const { dialog } = confirmChange(
      sample,
      takeOut('whatsapp'),
      'Take "WhatsApp channel" out of "Clinic booking"?',
    );
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const confirm = within(dialog).getByRole('button', { name: 'Take out' });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    // A press beside the dialog leaves the focus where it is.
    const backdrop = dialog.parentElement as HTMLElement;
    expect(fireEvent.mouseDown(backdrop)).toBe(false);
    expect(fireEvent.mouseDown(cancel)).toBe(true);
  });

  it('shows the preview of a deletion of 10,000 elements at once, naming only what it lists', () => {
    const big = syntheticProject({ elements: 10_000 });
    const preview = previewDelete(big, {
      elements: big.model.elements.map((element) => element.id),
    });
    expect(preview.cascaded.length).toBeGreaterThan(9_000);
    const started = performance.now();
    render(
      <DeleteDialog
        project={big}
        preview={preview}
        freeShapes={0}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    // It took seconds when it named every cascaded relation, each through searches of the model.
    expect(performance.now() - started).toBeLessThan(1_000);
    const dialog = screen.getByRole('dialog', { name: 'Delete 10000 elements?' });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(9);
    expect(dialog).toHaveTextContent(`and ${preview.cascaded.length - 8} more`);
  }, 60_000);
});
