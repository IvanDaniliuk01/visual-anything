import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CommandResult } from '../live/connection';
import { LiveContext, type Live } from '../live/context';
import { fakeLive } from '../test/fakeLive';
import { Header } from './Header';

const RENAME = { label: 'Rename "API" to "Gateway"', author: 'user' as const };
const DELETE = { label: 'Delete "Patient"', author: 'user' as const };
const DONE: CommandResult = { ok: true, created: [], warnings: [] };

function renderHeader(live: Live | null) {
  return render(
    <LiveContext value={live}>
      <Header projectName="My systems" viewName="System overview" />
    </LiveContext>,
  );
}

function undoButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Undo/ });
}

function redoButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Redo/ });
}

/** Presses keys on a target, lets the answer arrive, and says whether the browser may still act. */
async function press(target: Element, init: KeyboardEventInit): Promise<boolean> {
  let leftToBrowser = true;
  await act(async () => {
    leftToBrowser = fireEvent.keyDown(target, init);
    await Promise.resolve();
  });
  return leftToBrowser;
}

async function click(target: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(target);
    await Promise.resolve();
  });
}

describe('Header', () => {
  it('shows no undo or redo outside a live session', () => {
    renderHeader(null);
    expect(within(screen.getByRole('banner')).getByText('My systems')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows no undo or redo on the screens without a project', () => {
    render(
      <LiveContext value={fakeLive({ history: { undo: RENAME } })}>
        <Header />
      </LiveContext>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('names the action that undo and redo would do', () => {
    renderHeader(fakeLive({ history: { undo: RENAME, redo: DELETE } }));
    const history = screen.getByRole('group', { name: 'Undo history' });
    expect(within(history).getByRole('button', { name: 'Undo: Rename "API" to "Gateway"' })).toBe(
      undoButton(),
    );
    expect(within(history).getByRole('button', { name: 'Redo: Delete "Patient"' })).toBe(
      redoButton(),
    );
    expect(undoButton()).not.toHaveAttribute('aria-disabled');
    expect(undoButton()).toHaveTextContent('Rename "API" to "Gateway"');
    expect(within(undoButton()).queryByText('Claude')).not.toBeInTheDocument();
  });

  it('says when Claude did the action', () => {
    renderHeader(
      fakeLive({
        history: { undo: { ...RENAME, author: 'claude' }, redo: { ...DELETE, author: 'claude' } },
      }),
    );
    expect(undoButton()).toHaveAccessibleName('Undo Claude’s action: Rename "API" to "Gateway"');
    expect(redoButton()).toHaveAccessibleName('Redo Claude’s action: Delete "Patient"');
    expect(within(undoButton()).getByText('Claude')).toBeVisible();
  });

  it('shows the shortcut with the action, and tells assistive technology about it', () => {
    renderHeader(fakeLive({ history: { undo: RENAME, redo: DELETE } }));
    expect(undoButton()).toHaveAttribute('title', 'Undo: Rename "API" to "Gateway" (Ctrl+Z)');
    expect(undoButton()).toHaveAttribute('aria-keyshortcuts', 'Control+Z Meta+Z');
    expect(redoButton()).toHaveAttribute('title', 'Redo: Delete "Patient" (Ctrl+Y)');
    expect(redoButton()).toHaveAttribute(
      'aria-keyshortcuts',
      'Control+Shift+Z Meta+Shift+Z Control+Y',
    );
  });

  it('disables undo and redo when there is nothing to undo or redo', async () => {
    const live = fakeLive({ history: {} });
    renderHeader(live);
    expect(undoButton()).toHaveAccessibleName('Undo');
    expect(undoButton()).toHaveAttribute('aria-disabled', 'true');
    expect(undoButton()).toHaveAccessibleDescription('Nothing to undo');
    expect(redoButton()).toHaveAccessibleName('Redo');
    expect(redoButton()).toHaveAttribute('aria-disabled', 'true');
    expect(redoButton()).toHaveAccessibleDescription('Nothing to redo');

    await click(undoButton());
    await click(redoButton());
    expect(live.undo).not.toHaveBeenCalled();
    expect(live.redo).not.toHaveBeenCalled();
  });

  it('disables only the one that has nothing to do', () => {
    renderHeader(fakeLive({ history: { undo: RENAME } }));
    expect(undoButton()).not.toHaveAttribute('aria-disabled');
    expect(redoButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps disabled buttons focusable, so the focus stays put when nothing is left to undo', () => {
    renderHeader(fakeLive({ history: {} }));
    undoButton().focus();
    expect(undoButton()).toHaveFocus();
    expect(undoButton()).not.toBeDisabled();
  });

  it('disables undo and redo while the connection is not open', async () => {
    const live = fakeLive({ status: 'closed', history: { undo: RENAME, redo: DELETE } });
    renderHeader(live);
    expect(undoButton()).toHaveAttribute('aria-disabled', 'true');
    expect(undoButton()).toHaveAccessibleDescription('Visual Anything is not connected');
    expect(redoButton()).toHaveAttribute('aria-disabled', 'true');
    await click(undoButton());
    await press(document.body, { key: 'z', ctrlKey: true });
    expect(live.undo).not.toHaveBeenCalled();
  });

  it('undoes and redoes when the buttons are pressed', async () => {
    const live = fakeLive({ history: { undo: RENAME, redo: DELETE } });
    renderHeader(live);
    await click(undoButton());
    expect(live.undo).toHaveBeenCalledTimes(1);
    await click(redoButton());
    expect(live.redo).toHaveBeenCalledTimes(1);
  });

  it('undoes with Ctrl+Z or ⌘Z', async () => {
    const live = fakeLive({ history: { undo: RENAME } });
    renderHeader(live);
    await press(document.body, { key: 'z', ctrlKey: true });
    await press(document.body, { key: 'z', metaKey: true });
    expect(live.undo).toHaveBeenCalledTimes(2);
    expect(live.redo).not.toHaveBeenCalled();
  });

  it('redoes with Ctrl+Shift+Z, ⌘⇧Z or Ctrl+Y', async () => {
    const live = fakeLive({ history: { redo: DELETE } });
    renderHeader(live);
    await press(document.body, { key: 'Z', ctrlKey: true, shiftKey: true });
    await press(document.body, { key: 'Z', metaKey: true, shiftKey: true });
    await press(document.body, { key: 'y', ctrlKey: true });
    expect(live.redo).toHaveBeenCalledTimes(3);
    expect(live.undo).not.toHaveBeenCalled();
  });

  it('takes the shortcuts from the browser, wherever the focus is outside text', async () => {
    renderHeader(fakeLive({ history: { undo: RENAME } }));
    expect(await press(document.body, { key: 'z', ctrlKey: true })).toBe(false);
    undoButton().focus();
    expect(await press(undoButton(), { key: 'z', ctrlKey: true })).toBe(false);
  });

  it('leaves the shortcuts to text inputs and editable content, which keep their own undo', async () => {
    const live = fakeLive({ history: { undo: RENAME, redo: DELETE } });
    renderHeader(live);
    render(
      <form>
        <input aria-label="Name" />
        <textarea aria-label="Description" />
        <div aria-label="Note" role="textbox" contentEditable suppressContentEditableWarning>
          <b>text</b>
        </div>
      </form>,
    );
    const textEntries = [
      screen.getByRole('textbox', { name: 'Name' }),
      screen.getByRole('textbox', { name: 'Description' }),
      within(screen.getByRole('textbox', { name: 'Note' })).getByText('text'),
    ];
    for (const entry of textEntries) {
      expect(await press(entry, { key: 'z', ctrlKey: true })).toBe(true);
      expect(await press(entry, { key: 'y', ctrlKey: true })).toBe(true);
    }
    expect(live.undo).not.toHaveBeenCalled();
    expect(live.redo).not.toHaveBeenCalled();
  });

  it('ignores the shortcuts when there is nothing to undo or redo', async () => {
    const live = fakeLive({ history: {} });
    renderHeader(live);
    await press(document.body, { key: 'z', ctrlKey: true });
    await press(document.body, { key: 'y', ctrlKey: true });
    expect(live.undo).not.toHaveBeenCalled();
    expect(live.redo).not.toHaveBeenCalled();
  });

  it('leaves a shortcut that something else already handled', async () => {
    const live = fakeLive({ history: { undo: RENAME } });
    renderHeader(live);
    const handled = (event: KeyboardEvent) => event.preventDefault();
    document.body.addEventListener('keydown', handled);
    try {
      await press(document.body, { key: 'z', ctrlKey: true });
    } finally {
      document.body.removeEventListener('keydown', handled);
    }
    expect(live.undo).not.toHaveBeenCalled();
  });

  it('sends one undo or redo at a time, waiting for each answer', async () => {
    let answer: (result: CommandResult) => void = () => undefined;
    const undo = vi.fn<Live['undo']>(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const live = fakeLive({ history: { undo: RENAME, redo: DELETE }, undo });
    renderHeader(live);
    await press(document.body, { key: 'z', ctrlKey: true });
    await press(document.body, { key: 'z', ctrlKey: true });
    await click(undoButton());
    await press(document.body, { key: 'y', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(live.redo).not.toHaveBeenCalled();

    await act(async () => {
      answer(DONE);
      await Promise.resolve();
    });
    await press(document.body, { key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(2);
  });

  it('stops listening to the keyboard when it goes away', async () => {
    const live = fakeLive({ history: { undo: RENAME } });
    const { unmount } = renderHeader(live);
    unmount();
    expect(await press(document.body, { key: 'z', ctrlKey: true })).toBe(true);
    expect(live.undo).not.toHaveBeenCalled();
  });
});
