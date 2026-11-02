import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_PREFERENCES, type PreferenceChanges } from '@visual-anything/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandResult } from '../live/connection';
import { LiveContext, type Live } from '../live/context';
import { SEND_DELAY_MS, resetPreferencesForTests, type PreferencesAnswer } from '../theme/store';
import { readSource, stubSystemTheme } from '../theme/testing';
import { fakeLive } from '../test/fakeLive';
import { Header } from './Header';

afterEach(() => {
  resetPreferencesForTests();
  vi.useRealTimers();
});

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
    expect(screen.queryByRole('button', { name: /^(Undo|Redo)/ })).not.toBeInTheDocument();
  });

  it('shows no undo or redo on the screens without a project', () => {
    render(
      <LiveContext value={fakeLive({ history: { undo: RENAME } })}>
        <Header />
      </LiveContext>,
    );
    expect(screen.queryByRole('button', { name: /^(Undo|Redo)/ })).not.toBeInTheDocument();
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

describe('the product and the tab', () => {
  it('shows the product mark beside its name, hidden from assistive technology', () => {
    renderHeader(null);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAccessibleName('Visual Anything');
    expect(heading.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('names the tab after the open project, and after the product alone without one', () => {
    const { unmount } = renderHeader(null);
    expect(document.title).toBe('My systems · Visual Anything');
    unmount();
    render(<Header />);
    expect(document.title).toBe('Visual Anything');
  });
});

/** Opens the header's Language and theme, unless it is open already. */
function openPreferences(): void {
  const button = screen.getByRole('button', { name: 'Language and theme' });
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
}

describe('the Theme control', () => {
  function themeRadio(name: string): HTMLInputElement {
    openPreferences();
    return within(screen.getByRole('radiogroup', { name: 'Theme' })).getByRole('radio', { name });
  }

  it('offers Match the system, Light and Dark, matching the system at first', () => {
    renderHeader(fakeLive());
    openPreferences();
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('value')),
    ).toEqual(['system', 'light', 'dark']);
    expect(themeRadio('Match the system')).toBeChecked();
  });

  it('says what matching the system gives now', () => {
    stubSystemTheme('dark');
    renderHeader(null);
    expect(themeRadio('Match the system').closest('label')).toHaveAttribute(
      'title',
      'Match the system (dark now)',
    );
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('applies a choice in the tab at once', () => {
    renderHeader(null);
    fireEvent.click(themeRadio('Dark'));
    expect(themeRadio('Dark')).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(themeRadio('Light'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('is one radio group, so the arrow keys move the choice as in any other', () => {
    renderHeader(null);
    const names = new Set(
      ['Match the system', 'Light', 'Dark'].map((name) => themeRadio(name).name),
    );
    expect(names.size).toBe(1);
    expect([...names][0]).not.toBe('');
  });

  it('draws the focus ring on the option, since the radio itself is hidden', () => {
    const css = readSource('styles.css');
    expect(css).toMatch(
      /\.theme-option:has\(:focus-visible\)\s*\{[^}]*outline: var\(--stroke-thick\) solid var\(--focus-ring\)/,
    );
    renderHeader(null);
    expect(themeRadio('Light')).toHaveClass('visually-hidden');
  });

  it('works on the screens without a project, and without a live session', () => {
    render(<Header />);
    fireEvent.click(themeRadio('Dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('sends the program one change after several quick choices', async () => {
    vi.useFakeTimers();
    const asked: PreferenceChanges[] = [];
    const setPreferences = vi.fn((changes: PreferenceChanges) => {
      asked.push(changes);
      return Promise.resolve<PreferencesAnswer>({
        ok: true,
        preferences: { ...DEFAULT_PREFERENCES, ...changes },
      });
    });
    const live = { ...fakeLive(), preferences: DEFAULT_PREFERENCES, setPreferences };
    renderHeader(live);
    fireEvent.click(themeRadio('Dark'));
    fireEvent.click(themeRadio('Light'));
    fireEvent.click(themeRadio('Dark'));
    expect(asked).toEqual([]);
    await act(async () => {
      vi.advanceTimersByTime(SEND_DELAY_MS);
      await Promise.resolve();
    });
    expect(asked).toEqual([{ theme: 'dark' }]);
    expect(themeRadio('Dark')).toBeChecked();
  });

  it('follows the program’s preferences when it sends them', () => {
    const { rerender } = renderHeader(fakeLive());
    expect(themeRadio('Match the system')).toBeChecked();
    const live = {
      ...fakeLive(),
      preferences: { ...DEFAULT_PREFERENCES, theme: 'light' as const },
    };
    rerender(
      <LiveContext value={live}>
        <Header projectName="My systems" viewName="System overview" />
      </LiveContext>,
    );
    expect(themeRadio('Light')).toBeChecked();
  });
});

describe('Language and theme (A5)', () => {
  function menuButton(): HTMLElement {
    return screen.getByRole('button', { name: 'Language and theme' });
  }

  it('is one icon button at the header’s end, with no select of languages in the header', () => {
    renderHeader(fakeLive());
    const banner = screen.getByRole('banner');
    expect(within(banner).queryByRole('combobox')).not.toBeInTheDocument();
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton()).toHaveAttribute('title', 'Language and theme');
    expect(menuButton().querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    const actions = banner.querySelector('.shell-actions');
    expect(actions?.lastElementChild).toContainElement(menuButton());
  });

  it('opens on the theme chosen, with the same choices of theme and language as before', () => {
    renderHeader(fakeLive());
    fireEvent.click(menuButton());
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('group', { name: 'Language and theme' });
    expect(menuButton()).toHaveAttribute('aria-controls', panel.id);
    expect(within(panel).getByRole('radio', { name: 'Match the system' })).toHaveFocus();
    const languages = within(panel).getByRole('radiogroup', { name: 'Language' });
    expect(
      within(languages)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('value')),
    ).toEqual(['system', 'en', 'es']);
    expect(within(languages).getByRole('radio', { name: /^Match the browser/ })).toBeChecked();
    expect(within(languages).getByRole('radio', { name: 'Español' })).not.toBeChecked();
  });

  it('keeps the language chosen, which language.test.tsx sees applied', () => {
    renderHeader(fakeLive());
    fireEvent.click(menuButton());
    fireEvent.click(screen.getByRole('radio', { name: 'Español' }));
    expect(screen.getByRole('radio', { name: 'Español' })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Match the browser/ })).not.toBeChecked();
  });

  it('closes with Escape, giving the focus back to its button, and on a press outside', () => {
    render(
      <>
        <Header projectName="My systems" />
        <button type="button">Elsewhere</button>
      </>,
    );
    fireEvent.click(menuButton());
    const dark = screen.getByRole('radio', { name: 'Dark' });
    dark.focus();
    fireEvent.keyDown(dark, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Language and theme' })).not.toBeInTheDocument();
    expect(menuButton()).toHaveFocus();
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menuButton());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('group', { name: 'Language and theme' })).not.toBeInTheDocument();
  });
});

describe('the header’s one row (A4)', () => {
  const LONG_VIEW = 'How one gesture becomes a command and comes back to every app';
  const LONG_UNDO = {
    label: 'Collapse "Operations and history of every command"',
    author: 'user' as const,
  };

  it('cuts the view’s name, and keeps it and the undo label whole in tooltips and for screen readers', () => {
    render(
      <LiveContext value={fakeLive({ history: { undo: LONG_UNDO } })}>
        <Header projectName="My systems" viewName={LONG_VIEW} />
      </LiveContext>,
    );
    const banner = within(screen.getByRole('banner'));
    const view = banner.getByText(LONG_VIEW);
    expect(view).toHaveAttribute('title', LONG_VIEW);
    expect(view).toHaveClass('shell-context-value');
    expect(banner.getByText('My systems')).toHaveAttribute('title', 'My systems');
    expect(undoButton()).toHaveAccessibleName(`Undo: ${LONG_UNDO.label}`);
    expect(undoButton().getAttribute('title')).toContain(LONG_UNDO.label);
  });

  it('shows the project and the view as a path, naming each for screen readers', () => {
    renderHeader(null);
    expect(screen.getAllByRole('definition').map((value) => value.textContent)).toEqual([
      'My systems',
      'System overview',
    ]);
    for (const term of screen.getAllByRole('term')) expect(term).toHaveClass('visually-hidden');
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Project',
      'View',
    ]);
    expect(readSource('shell/header.css')).toMatch(
      /\.shell-context > div \+ div::before\s*\{[^}]*content: '\/'/,
    );
  });

  it('never widens the page past the window, which never scrolls as a whole (A5)', () => {
    // A grid's item is as wide as its content at least, unless told otherwise.
    expect(readSource('styles.css')).toMatch(/\.shell > \*\s*\{\s*min-width: 0;\s*min-height: 0;/);
  });

  it('never wraps: the row cuts the view’s name and the undo label with an ellipsis instead', () => {
    expect(readSource('styles.css')).toMatch(/\.shell-header\s*\{[^}]*flex-wrap: nowrap/);
    const css = readSource('shell/header.css');
    expect(css).toMatch(/\.shell-context-value\s*\{[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/\.shell-context-value\s*\{[^}]*white-space: nowrap/);
    expect(css).toMatch(/\.shell-header \.shell-actions\s*\{[^}]*flex-wrap: nowrap/);
  });
});
