import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLanguage } from '../i18n/language';
import type { Notice } from '../live/connection';
import { LiveContext, type Live } from '../live/context';
import { fakeLive } from '../test/fakeLive';
import { readSource } from '../theme/testing';
import { Notices } from './Notices';

const info: Notice = {
  id: 1,
  level: 'info',
  message: 'Reloaded the project: model.vamodel changed on disk.',
};
const warning: Notice = { id: 2, level: 'warning', message: 'model.vamodel is not valid.' };
const error: Notice = {
  id: 3,
  level: 'error',
  message: 'Could not undo: There is nothing to undo.',
};

function renderNotices(live: Live) {
  return render(
    <LiveContext value={live}>
      <Notices />
    </LiveContext>,
  );
}

function dismissButtons(): HTMLElement[] {
  return screen.getAllByRole('button', { name: 'Dismiss' });
}

function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`There is no item ${index}.`);
  return item;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Notices', () => {
  it('shows nothing when there is nothing to tell', () => {
    const { container } = renderNotices(fakeLive());
    expect(container).toBeEmptyDOMElement();
  });

  it('announces info and warnings politely, and errors at once', () => {
    renderNotices(fakeLive({ notices: [info, warning, error] }));
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(2);
    expect(nth(statuses, 0)).toHaveTextContent(info.message);
    expect(nth(statuses, 1)).toHaveTextContent(`Warning: ${warning.message}`);
    expect(screen.getByRole('alert')).toHaveTextContent(`Error: ${error.message}`);
  });

  it('shows the newest notice last, nearest the corner', () => {
    renderNotices(fakeLive({ notices: [warning, error] }));
    const [first, second] = dismissButtons();
    expect(nth(dismissButtons(), 0).compareDocumentPosition(nth(dismissButtons(), 1))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(first?.closest('.notice')).toHaveTextContent(warning.message);
    expect(second?.closest('.notice')).toHaveTextContent(error.message);
  });

  it('announces only the message, not the button that dismisses it', () => {
    renderNotices(fakeLive({ notices: [warning] }));
    const status = screen.getByRole('status');
    expect(within(status).queryByRole('button')).not.toBeInTheDocument();
    expect(status).toHaveTextContent(/^Warning: model\.vamodel is not valid\.$/);
  });

  it('dismisses a notice with its button', () => {
    const live = fakeLive({ notices: [warning, error] });
    renderNotices(live);
    fireEvent.click(nth(dismissButtons(), 1));
    expect(live.dismiss).toHaveBeenCalledExactlyOnceWith(error.id);
  });

  it('dismisses info by itself after a few seconds', () => {
    vi.useFakeTimers();
    const live = fakeLive({ notices: [info] });
    renderNotices(live);
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(live.dismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(live.dismiss).toHaveBeenCalledExactlyOnceWith(info.id);
  });

  it('keeps warnings and errors until they are dismissed', () => {
    vi.useFakeTimers();
    const live = fakeLive({ notices: [warning, error] });
    renderNotices(live);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(live.dismiss).not.toHaveBeenCalled();
  });

  it('keeps an info notice while the pointer is over it', () => {
    vi.useFakeTimers();
    const live = fakeLive({ notices: [info] });
    renderNotices(live);
    fireEvent.mouseEnter(screen.getByRole('status'));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(live.dismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(screen.getByRole('status'));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(live.dismiss).toHaveBeenCalledExactlyOnceWith(info.id);
  });

  it('keeps an info notice while the focus is in it', () => {
    vi.useFakeTimers();
    const live = fakeLive({ notices: [info] });
    renderNotices(live);
    const button = nth(dismissButtons(), 0);
    act(() => {
      button.focus();
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(live.dismiss).not.toHaveBeenCalled();

    act(() => {
      button.blur();
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(live.dismiss).toHaveBeenCalledExactlyOnceWith(info.id);
  });

  it('keeps an info notice while the tab is hidden, so that it is not missed', () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      const live = fakeLive({ notices: [info] });
      renderNotices(live);
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(live.dismiss).not.toHaveBeenCalled();

      visibility.mockReturnValue('visible');
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(live.dismiss).toHaveBeenCalledExactlyOnceWith(info.id);
    } finally {
      visibility.mockRestore();
    }
  });

  it('moves the focus to a neighbouring notice when one is dismissed from the keyboard', () => {
    renderNotices(fakeLive({ notices: [info, warning, error] }));
    const [first, second, third] = dismissButtons();
    first?.focus();
    fireEvent.click(nth(dismissButtons(), 0));
    expect(second).toHaveFocus();

    third?.focus();
    fireEvent.click(nth(dismissButtons(), 2));
    expect(second).toHaveFocus();
  });

  it('leaves the focus alone when the pointer dismisses a notice', () => {
    renderNotices(fakeLive({ notices: [info, warning] }));
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    fireEvent.click(nth(dismissButtons(), 0));
    expect(outside).toHaveFocus();
    outside.remove();
  });
});

/** The warnings of a project as it opens, as the local program writes them. */
function loadWarnings(count: number, id = 10): Notice {
  const lines = Array.from(
    { length: count },
    (_, at) =>
      `views/a.vaview: The view "A" keeps a position for "ghost-${at}", but the model has no element "ghost-${at}"; it is ignored.`,
  );
  return {
    id,
    level: 'warning',
    message: `The project has ${count} warnings:\n${lines.join('\n')}`,
  };
}

describe('a burst of warnings (A5)', () => {
  it('is summed up in one short notice, with Show', () => {
    renderNotices(fakeLive({ notices: [loadWarnings(29)] }));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/^Warning: 29 warnings$/);
    expect(status).toHaveAttribute('title', 'The project has 29 warnings:');
    expect(screen.queryByText(/ghost-0/)).not.toBeInTheDocument();
    const show = screen.getByRole('button', { name: 'Show' });
    expect(show).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the warnings with Show, as a list under their heading, and closes them with Hide', () => {
    renderNotices(fakeLive({ notices: [loadWarnings(29)] }));
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    const hide = screen.getByRole('button', { name: 'Hide' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('region', { name: 'The project has 29 warnings:' });
    expect(hide).toHaveAttribute('aria-controls', list.id);
    expect(within(list).getByRole('heading')).toHaveTextContent('The project has 29 warnings:');
    expect(within(list).getAllByRole('listitem')).toHaveLength(29);
    expect(nth(within(list).getAllByRole('listitem'), 0)).toHaveTextContent('"ghost-0"');
    fireEvent.click(hide);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('copies the list as it reads, its heading first', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    try {
      renderNotices(fakeLive({ notices: [loadWarnings(3)] }));
      fireEvent.click(screen.getByRole('button', { name: 'Show' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
        await Promise.resolve();
      });
      expect(writeText).toHaveBeenCalledExactlyOnceWith(loadWarnings(3).message);
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('selects the list for the person to copy, when the browser will not', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    try {
      renderNotices(fakeLive({ notices: [loadWarnings(3)] }));
      fireEvent.click(screen.getByRole('button', { name: 'Show' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
        await Promise.resolve();
      });
      expect(screen.getByText(/the list is selected/)).toBeInTheDocument();
      expect(window.getSelection()?.toString()).toContain('ghost-2');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('says it in Spanish too', () => {
    setCurrentLanguage('es');
    try {
      renderNotices(fakeLive({ notices: [loadWarnings(29)] }));
      expect(screen.getByRole('status')).toHaveTextContent(/^Advertencia: 29 advertencias$/);
      fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
      const list = screen.getByRole('region', { name: 'El proyecto tiene 29 advertencias:' });
      expect(nth(within(list).getAllByRole('listitem'), 0)).toHaveTextContent(
        /^views\/a\.vaview: La vista "A" guarda una posición para "ghost-0"/,
      );
    } finally {
      setCurrentLanguage('en');
    }
  });

  it('leaves a warning of one line, or of one line under its heading, as it is', () => {
    const one: Notice = {
      id: 20,
      level: 'warning',
      message: 'The project has 1 warning:\nX is odd.',
    };
    renderNotices(fakeLive({ notices: [warning, one] }));
    expect(screen.queryByRole('button', { name: 'Show' })).not.toBeInTheDocument();
    expect(nth(screen.getAllByRole('status'), 1)).toHaveTextContent('X is odd.');
  });

  it('shows the same notice sent twice once, and dismisses both with it', () => {
    const live = fakeLive({ notices: [loadWarnings(29, 10), loadWarnings(29, 11)] });
    renderNotices(live);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    fireEvent.click(nth(dismissButtons(), 0));
    expect(live.dismiss).toHaveBeenCalledTimes(2);
    expect(live.dismiss).toHaveBeenCalledWith(10);
    expect(live.dismiss).toHaveBeenCalledWith(11);
  });

  it('keeps a single long notice to a few lines, scrolling within them', () => {
    expect(readSource('styles.css')).toMatch(
      /\.notice-message\s*\{[^}]*max-height: 5lh;[^}]*overflow-y: auto/,
    );
  });
});
