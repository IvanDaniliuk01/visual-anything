import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Notice } from '../live/connection';
import { LiveContext, type Live } from '../live/context';
import { fakeLive } from '../test/fakeLive';
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
