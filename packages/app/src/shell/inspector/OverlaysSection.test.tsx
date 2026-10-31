/**
 * The open view's overlays in the inspector (ADR 0055): what each changes by which attribute, turning
 * one off, moving and removing it, and adding one from the values the model has, each as one command.
 */
import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Overlay, ViewFile } from '@visual-anything/schema';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { EMPTY_SELECTION } from '../../editor/selection';
import { loadSample } from '../../test/sample';
import { OverlaysSection } from './OverlaysSection';

const VIEW = 'system-overview';

const owner: Overlay = {
  id: 'owner',
  of: 'elements',
  attribute: 'owner',
  channel: 'fill',
  mapping: { kind: 'discrete', cases: [{ value: 'Scheduling team', color: '#FDE68A' }] },
};
const size: Overlay = {
  id: 'size',
  name: 'Storage',
  of: 'elements',
  attribute: 'sizeGb',
  channel: 'size',
  mapping: {
    kind: 'continuous',
    stops: [
      { at: 0, size: 1 },
      { at: 12, size: 2 },
    ],
  },
};

function withOverlays(overlays: Overlay[]): ProjectSnapshot {
  const sample = loadSample();
  return {
    ...sample,
    views: sample.views.map((view) => (view.id === VIEW ? { ...view, overlays } : view)),
  };
}

function Harness({ initial, send }: { initial: ProjectSnapshot; send: SendCommand }) {
  const [project, setProject] = useState(initial);
  const latest = useRef(initial);
  const definitions = useMemo(() => definitionsIn(project), [project]);
  const view = project.views.find((each) => each.id === VIEW) as ViewFile;
  const editor: Editor = {
    project,
    definitions,
    viewId: VIEW,
    scene: undefined,
    selection: EMPTY_SELECTION,
    select: () => {},
    send: async (command) => {
      const answer = await send(command);
      const outcome = executeCommand(latest.current, command);
      if (!outcome.ok) return { ok: false };
      latest.current = outcome.state;
      setProject(outcome.state);
      return answer;
    },
    reveal: () => {},
  };
  return (
    <EditorContext.Provider value={editor}>
      <OverlaysSection view={view} />
    </EditorContext.Provider>
  );
}

function renderSection(overlays: Overlay[]) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  render(<Harness initial={withOverlays(overlays)} send={send} />);
  const section = screen.getByRole('region', { name: 'Overlays' });
  const sent = (): Command[] => send.mock.calls.map(([command]) => command);
  return { section, sent };
}

describe('OverlaysSection', () => {
  it('says what each overlay changes by which attribute, and that the first wins', () => {
    const { section } = renderSection([owner, size]);
    expect(within(section).getByText('Fill by owner')).toBeTruthy();
    expect(within(section).getByText('Storage')).toBeTruthy();
    expect(within(section).getByText('Size by sizeGb')).toBeTruthy();
    expect(
      within(section).getByText(
        'Where two overlays set the same thing, the one higher in the list wins.',
      ),
    ).toBeTruthy();
  });

  it('turns one off, moves and removes one, each as one command', async () => {
    const { section, sent } = renderSection([owner, size]);
    fireEvent.click(within(section).getByRole('checkbox', { name: 'owner' }));
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toEqual({
      type: 'update-overlay',
      view: VIEW,
      overlay: 'owner',
      changes: { off: true },
    });
    const storage = within(section).getByRole('group', { name: 'Storage' });
    fireEvent.click(within(storage).getByRole('button', { name: 'Move up' }));
    await vi.waitFor(() => expect(sent()).toHaveLength(2));
    expect(sent()[1]).toEqual({
      type: 'move-overlay',
      view: VIEW,
      overlay: 'size',
      before: 'owner',
    });
    const ownerGroup = within(section).getByRole('group', { name: 'owner' });
    fireEvent.click(within(ownerGroup).getByRole('button', { name: 'Remove' }));
    await vi.waitFor(() => expect(sent()).toHaveLength(3));
    expect(sent()[2]).toEqual({ type: 'remove-overlays', view: VIEW, overlays: ['owner'] });
  });

  it('adds an overlay from the values the model has, as one command', async () => {
    const { section, sent } = renderSection([]);
    expect(
      within(section).getByText(
        'No overlay changes how this view’s shapes look by their attributes. Add one with Add an overlay.',
      ),
    ).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: 'Add an overlay' }));
    const form = within(section).getByRole('form', { name: 'New overlay' });
    fireEvent.change(within(form).getByLabelText('Attribute'), { target: { value: 'owner' } });
    fireEvent.change(within(form).getByLabelText('Name in the legend'), {
      target: { value: 'Team' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Add each value it has' }));
    fireEvent.click(within(form).getByRole('checkbox', { name: 'Any other value' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Add the overlay' }));
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    const command = sent()[0] as Extract<Command, { type: 'add-overlay' }>;
    expect(command.type).toBe('add-overlay');
    expect(command.overlay).toMatchObject({
      name: 'Team',
      of: 'elements',
      attribute: 'owner',
      channel: 'fill',
    });
    const mapping = command.overlay.mapping as {
      kind: string;
      cases: { value: string }[];
      otherwise?: string;
    };
    expect(mapping.kind).toBe('discrete');
    expect(mapping.cases.map((each) => each.value)).toEqual([
      'Patient experience',
      'Scheduling team',
    ]);
    expect(mapping.otherwise).toMatch(/^#[0-9A-Fa-f]{6}$/);
    // The form closes, and the overlay is listed.
    await vi.waitFor(() => expect(within(section).queryByRole('form')).toBeNull());
    expect(within(section).getByText('Team')).toBeTruthy();
  });

  it('edits one in place, keeping its id', async () => {
    const { section, sent } = renderSection([size]);
    fireEvent.click(within(section).getByRole('button', { name: 'Edit' }));
    const form = within(section).getByRole('form', { name: 'Edit the overlay' });
    fireEvent.change(within(form).getByLabelText('Name in the legend'), { target: { value: '' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save the overlay' }));
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toMatchObject({
      type: 'update-overlay',
      view: VIEW,
      overlay: 'size',
      changes: { name: null, attribute: 'sizeGb', channel: 'size' },
    });
  });
});
