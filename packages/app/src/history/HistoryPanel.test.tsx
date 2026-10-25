import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ListedAction } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../i18n/LanguageProvider';
import type { CommandResult } from '../live/connection';
import { LiveContext, type Live } from '../live/context';
import { fakeLive } from '../test/fakeLive';
import { HistoryPanel } from './HistoryPanel';

const AT = new Date(2026, 9, 24, 14, 30).getTime();
const MINUTE = 60_000;

function action(id: number, label: string, author: ListedAction['author'], undone = false) {
  return { id, label, author, time: AT + id * MINUTE, undone };
}

const RENAME = action(1, 'Rename "API" to "Gateway"', 'user');
const CREATE = action(2, 'Create "Booking agent"', 'claude');
const MOVE = action(3, 'Move "Customer" in "Overview"', 'user', true);
const DONE: CommandResult = { ok: true, created: [], warnings: [] };

function liveWith(actions: ListedAction[] | undefined, overrides: Partial<Live> = {}): Live {
  return fakeLive({
    ...(actions ? { actions } : {}),
    undoTo: vi.fn<NonNullable<Live['undoTo']>>(() => Promise.resolve(DONE)),
    redoTo: vi.fn<NonNullable<Live['redoTo']>>(() => Promise.resolve(DONE)),
    ...overrides,
  });
}

function renderPanel(live: Live | null, language: 'en' | 'es' = 'en') {
  const view = render(
    <LanguageProvider language={language}>
      <LiveContext value={live}>
        <HistoryPanel active />
      </LiveContext>
    </LanguageProvider>,
  );
  return {
    ...view,
    rerenderWith: (next: Live) =>
      view.rerender(
        <LanguageProvider language={language}>
          <LiveContext value={next}>
            <HistoryPanel active />
          </LiveContext>
        </LanguageProvider>,
      ),
  };
}

function rows(): HTMLElement[] {
  return within(screen.getByRole('list')).getAllByRole('listitem');
}

beforeEach(() => {
  // Only the clock, so that the actions read as done today.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 24, 15, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

async function click(target: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(target);
    await Promise.resolve();
  });
}

describe('HistoryPanel', () => {
  it('lists the actions newest first, each with its label, its author and its time', () => {
    renderPanel(liveWith([RENAME, CREATE, MOVE]));

    expect(rows().map((row) => row.querySelector('.history-item-label')?.textContent)).toEqual([
      MOVE.label,
      CREATE.label,
      RENAME.label,
    ]);
    const time = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' });
    const [moved, created, renamed] = rows() as [HTMLElement, HTMLElement, HTMLElement];
    expect(renamed).toHaveTextContent('You');
    expect(within(renamed).getByText(time.format(RENAME.time))).toHaveAttribute(
      'datetime',
      new Date(RENAME.time).toISOString(),
    );
    expect(created).toHaveTextContent('Claude');
    expect(moved).toHaveTextContent('Undone');
  });

  it('marks Claude’s actions in words and with a mark, not by color alone', () => {
    renderPanel(liveWith([RENAME, CREATE]));

    const [created, renamed] = rows() as [HTMLElement, HTMLElement];
    expect(created.querySelector('.history-item-claude')).toHaveTextContent('Claude');
    expect(created.querySelector('.history-item-claude svg')).toBeInTheDocument();
    expect(renamed.querySelector('.history-item-claude')).toBeNull();
  });

  it('offers to undo each action done up to there, and to redo each one undone', async () => {
    const live = liveWith([RENAME, CREATE, MOVE]);
    renderPanel(live);

    await click(screen.getByRole('button', { name: `Undo to here ${RENAME.label}` }));
    await click(screen.getByRole('button', { name: `Redo to here ${MOVE.label}` }));

    expect(live.undoTo).toHaveBeenCalledWith(RENAME.id);
    expect(live.redoTo).toHaveBeenCalledWith(MOVE.id);
    expect(
      screen.getByRole('button', { name: `Undo to here ${CREATE.label}` }),
    ).toHaveAccessibleDescription(expect.stringContaining('Claude') as string);
  });

  it('asks once at a time, and not while disconnected', async () => {
    let finish: (result: CommandResult) => void = () => {};
    const live = liveWith([RENAME, CREATE], {
      undoTo: vi.fn<NonNullable<Live['undoTo']>>(
        () => new Promise<CommandResult>((resolve) => (finish = resolve)),
      ),
    });
    const { rerenderWith } = renderPanel(live);

    await click(screen.getByRole('button', { name: `Undo to here ${CREATE.label}` }));
    await click(screen.getByRole('button', { name: `Undo to here ${RENAME.label}` }));
    expect(live.undoTo).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(DONE);
      await Promise.resolve();
    });

    rerenderWith({ ...live, status: 'closed' });
    const button = screen.getByRole('button', { name: `Undo to here ${RENAME.label}` });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await click(button);
    expect(live.undoTo).toHaveBeenCalledTimes(1);
  });

  it('moves through the actions with the arrow keys, Home and End, one tab stop for all', () => {
    renderPanel(liveWith([RENAME, CREATE, MOVE]));
    const buttons = screen.getAllByRole('button', { name: /to here/ });

    // The tab stop starts on the newest action done.
    expect(buttons.map((button) => button.tabIndex)).toEqual([-1, 0, -1]);
    const [moved, created, renamed] = buttons as [HTMLElement, HTMLElement, HTMLElement];
    created.focus();
    fireEvent.keyDown(created, { key: 'ArrowDown' });
    expect(renamed).toHaveFocus();
    fireEvent.keyDown(renamed, { key: 'ArrowDown' });
    expect(renamed).toHaveFocus();
    fireEvent.keyDown(renamed, { key: 'Home' });
    expect(moved).toHaveFocus();
    fireEvent.keyDown(moved, { key: 'End' });
    expect(renamed).toHaveFocus();
    fireEvent.keyDown(renamed, { key: 'ArrowUp' });
    expect(created).toHaveFocus();
    expect(buttons.map((button) => button.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('says when an action is added, and who did it, but not for the history it opened with', () => {
    const { rerenderWith } = renderPanel(liveWith([RENAME]));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');

    rerenderWith(liveWith([RENAME, CREATE]));
    expect(status).toHaveTextContent(`${CREATE.label}, by Claude`);

    rerenderWith(liveWith([RENAME, CREATE, action(4, 'Delete "Patient"', 'user')]));
    expect(status).toHaveTextContent('Delete "Patient", by you');

    // An undo adds nothing.
    rerenderWith(liveWith([RENAME, { ...CREATE, undone: true }]));
    expect(status).toHaveTextContent('Delete "Patient", by you');
  });

  it('says what to do while the history is empty, and while it has not arrived', () => {
    const { rerenderWith } = renderPanel(liveWith(undefined));
    expect(screen.getByText(/Nothing is done yet/)).toBeInTheDocument();
    rerenderWith(liveWith([]));
    expect(screen.getByText(/Nothing is done yet/)).toBeInTheDocument();
  });

  it('says so outside a live session', () => {
    renderPanel(null);
    expect(
      screen.getByText('The history shows while Visual Anything is connected.'),
    ).toBeInTheDocument();
  });

  it('reads in Spanish, the core’s labels through their templates', () => {
    renderPanel(liveWith([RENAME, CREATE, MOVE]), 'es');

    expect(rows()[2]).toHaveTextContent('Cambiar el nombre de "API" a "Gateway"');
    expect(
      screen.getByRole('list', { name: 'Acciones, de la más reciente a la más antigua' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Deshacer hasta aquí Crear "Booking agent"' }),
    ).toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent('Deshecha');
    expect(rows()[2]).toHaveTextContent('Usted');
  });
});
