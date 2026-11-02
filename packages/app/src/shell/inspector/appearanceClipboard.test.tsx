/**
 * Copy appearance and Paste appearance in the format panel (ADR 0088, A6.4): the buttons name their
 * keys, pasting sends one action, and a paste with nothing copied says why.
 */
import { definitionsIn, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepCopiedAppearance } from '../../canvas/appearanceCopy';
import type { SendCommand } from '../../canvas/CanvasArea';
import { buildScene } from '../../canvas/scene';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { selectionOf, type Selectable } from '../../editor/selection';
import { loadSample } from '../../test/sample';
import { Inspector } from '../Inspector';

const VIEW = 'system-overview';
const sample = loadSample();

function Harness({
  project,
  selected,
  send,
}: {
  project: ProjectSnapshot;
  selected: Selectable[];
  send: SendCommand;
}) {
  const definitions = useMemo(() => definitionsIn(project), [project]);
  const view = project.views.find((each) => each.id === VIEW);
  const scene = useMemo(() => buildScene(project, VIEW), [project]);
  const editor: Editor = {
    project,
    definitions,
    viewId: VIEW,
    scene,
    selection: selectionOf(selected),
    select: vi.fn(),
    send,
    reveal: vi.fn(),
  };
  return (
    <EditorContext.Provider value={editor}>
      <Inspector view={view} scene={scene} definitions={definitions} />
    </EditorContext.Provider>
  );
}

const element = (id: string): Selectable => ({ kind: 'element', id });

function shown(selected: Selectable[]) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  const view = render(<Harness project={sample} selected={selected} send={send} />);
  const appearance = screen.getByRole('region', { name: /^Appearance/ });
  return { send, appearance, view };
}

async function press(button: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  keepCopiedAppearance(undefined);
});

describe('the format panel’s copy and paste of appearance', () => {
  it('copies one element’s appearance, and pastes it onto several in one action', async () => {
    const first = shown([element('appointments-api')]);
    const copy = within(first.appearance).getByRole('button', { name: 'Copy appearance' });
    expect(copy).toHaveAttribute('aria-keyshortcuts', 'Control+Alt+C Meta+Alt+C');
    await press(copy);
    expect(
      within(first.appearance).getByText('Copied the appearance of "Appointments API".'),
    ).toBeInTheDocument();
    first.view.unmount();

    const { send, appearance } = shown([element('whatsapp'), element('scheduling')]);
    const paste = within(appearance).getByRole('button', { name: 'Paste appearance' });
    expect(paste).not.toHaveAttribute('aria-disabled');
    await press(paste);
    expect(send).toHaveBeenCalledTimes(1);
    const [command] = send.mock.calls[0] as [Command];
    expect(command).toMatchObject({ type: 'batch', label: 'Paste the appearance onto 2 items' });
  });

  it('says why it pastes nothing while nothing is copied', async () => {
    const { send, appearance } = shown([element('whatsapp')]);
    const paste = within(appearance).getByRole('button', { name: 'Paste appearance' });
    expect(paste).toHaveAttribute('aria-disabled', 'true');
    await press(paste);
    expect(send).not.toHaveBeenCalled();
    expect(
      within(appearance).getByText('Copy the appearance of an element or a relation first.'),
    ).toBeInTheDocument();
  });
});
