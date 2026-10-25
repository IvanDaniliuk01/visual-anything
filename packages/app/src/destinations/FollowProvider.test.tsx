/**
 * Following destinations (ADR 0056): a view opens at once through the view state; another project and
 * a web address ask first, naming the folder or the host, with Cancel taking the focus; nothing opens
 * on Cancel or Escape; a web address opens in a new tab only once confirmed; another project opens
 * through the local program.
 */
import { definitionsIn, type ProjectSnapshot } from '@visual-anything/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION } from '../editor/selection';
import { LiveContext, type Live } from '../live/context';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';
import type { GoTo } from '../view-state/applier';
import { useFollow } from './follower';
import { FollowProvider } from './FollowProvider';

const sample = loadSample();

function FollowButton({ value }: { value: unknown }) {
  const follower = useFollow();
  return (
    <button type="button" onClick={() => follower?.follow(value)}>
      Follow it
    </button>
  );
}

function renderFollow(value: unknown, live: Live = fakeLive()) {
  const goTo = vi.fn<(request: GoTo) => void>();
  const open = vi.fn<(url: string) => void>();
  const project: ProjectSnapshot = sample;
  const editor: Editor = {
    project,
    definitions: definitionsIn(project),
    viewId: project.views[0]?.id,
    scene: undefined,
    selection: EMPTY_SELECTION,
    select: () => {},
    send: undefined,
    reveal: () => {},
  };
  render(
    <LiveContext value={live}>
      <EditorContext.Provider value={editor}>
        <FollowProvider goTo={goTo} open={open}>
          <FollowButton value={value} />
        </FollowProvider>
      </EditorContext.Provider>
    </LiveContext>,
  );
  const button = screen.getByRole('button', { name: 'Follow it' });
  // As a press does, the button has the focus as it is pressed.
  button.focus();
  fireEvent.click(button);
  return { goTo, open, live };
}

describe('following a destination', () => {
  it('opens a view of this project at once, with what it focuses on selected', () => {
    const view = sample.views[0];
    const element = sample.model.elements[0];
    if (!view || !element) throw new Error('The sample has a view and elements.');
    const { goTo } = renderFollow({ view: view.id, focus: [element.id] });
    expect(goTo).toHaveBeenCalledWith({
      kind: 'address',
      state: { view: view.id, select: [element.id] },
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks before a web address, naming its host and showing it whole, and opens it once confirmed', () => {
    const { open } = renderFollow({ url: 'https://www.ebi.ac.uk/ols4/ontologies/uberon' });
    const dialog = screen.getByRole('dialog', { name: 'Open a page of www.ebi.ac.uk?' });
    expect(dialog.textContent).toContain('https://www.ebi.ac.uk/ols4/ontologies/uberon');
    // Cancel has the focus, so that Enter alone never opens anything.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open the page' }));
    expect(open).toHaveBeenCalledWith('https://www.ebi.ac.uk/ols4/ontologies/uberon');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens nothing on Cancel, or on Escape, and gives the focus back', () => {
    const { open } = renderFollow({ url: 'https://example.org' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const button = screen.getByRole('button', { name: 'Follow it' });
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it('asks before another project, naming its folder, and asks the local program to open it', async () => {
    const openOtherProject = vi.fn<NonNullable<Live['openOtherProject']>>(() =>
      Promise.resolve({ ok: true, name: 'Billing' }),
    );
    const live = fakeLive({ openOtherProject });
    renderFollow({ project: '../billing', view: 'invoices' }, live);
    expect(screen.getByRole('dialog', { name: 'Open the project in “billing”?' })).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('It opens at its view invoices.');
    fireEvent.click(screen.getByRole('button', { name: 'Open the project' }));
    expect(openOtherProject).toHaveBeenCalledWith('../billing', 'invoices');
    await waitFor(() => {
      expect(live.notify).toHaveBeenCalledWith('info', '“Billing” opens in a new tab.');
    });
  });

  it('says why another project did not open', async () => {
    const live = fakeLive({
      openOtherProject: () =>
        Promise.resolve({
          ok: false,
          problems: [{ code: 'broken-destination', message: 'Nothing is there.' }],
        }),
    });
    renderFollow({ project: '../billing' }, live);
    fireEvent.click(screen.getByRole('button', { name: 'Open the project' }));
    await waitFor(() => {
      expect(live.notify).toHaveBeenCalledWith(
        'error',
        'The project in “billing” does not open: Nothing is there.',
      );
    });
  });

  it.each([{ url: 'javascript:alert(1)' }, { url: 'file:///etc/passwd' }, 'https://example.org'])(
    'opens nothing, and asks nothing, for %j',
    (value) => {
      const { open, goTo, live } = renderFollow(value);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(open).not.toHaveBeenCalled();
      expect(goTo).not.toHaveBeenCalled();
      expect(live.notify).toHaveBeenCalledWith(
        'warning',
        'This is not a destination, so it opens nothing.',
      );
    },
  );
});
