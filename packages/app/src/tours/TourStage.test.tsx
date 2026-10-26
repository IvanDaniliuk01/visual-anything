import type { ProjectSnapshot } from '@visual-anything/core';
import type { TourFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
import { NOTES_WINDOW } from './notes-window';
import { TourStage } from './TourStage';

const sample = loadSample();
const tour = sample.tours[0] as TourFile;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function stage(
  props: Partial<Parameters<typeof TourStage>[0]> = {},
  project: ProjectSnapshot = sample,
) {
  const onAction = vi.fn();
  const view = render(
    <TourStage project={project} tour={tour} step={0} onAction={onAction} {...props} />,
  );
  return { onAction, ...view };
}

describe('TourStage', () => {
  it('shows the step’s caption, its paragraphs and lists, and where the tour is', () => {
    stage();
    const card = screen.getByRole('article');
    expect(within(card).getByRole('heading', { name: 'Clinic booking' })).toBeInTheDocument();
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'the booking agent, which talks with the patient;',
      'the Appointments API and its database;',
      'the reminder service.',
    ]);
    const progress = screen.getByRole('progressbar', { name: 'Progress through the tour' });
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress).toHaveAttribute('aria-valuemax', '3');
    expect(progress).toHaveAttribute('aria-valuetext', 'Step 1 of 3');
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
  });

  it('writes markup in a caption as the text it is', () => {
    const marked: TourFile = {
      ...tour,
      steps: [
        {
          ...tour.steps[0],
          id: 'x',
          viewState: { view: 'system-overview' },
          caption: { title: '<img src=x onerror=alert(1)>', text: '<b>bold</b>\n\n- <i>one</i>' },
        },
      ],
    };
    const { container } = stage({ tour: marked });
    expect(container.querySelector('img, b, i, script')).toBeNull();
    expect(
      screen.getByRole('heading', { name: '<img src=x onerror=alert(1)>' }),
    ).toBeInTheDocument();
    expect(screen.getByText('<b>bold</b>')).toBeInTheDocument();
  });

  it('moves on with the keys and the controls, and ends with Escape', () => {
    const { onAction } = stage({ step: 1 });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: 'PageUp' });
    fireEvent.keyDown(document.body, { key: 'Home' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.keyDown(document.body, { key: 'x' });
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    fireEvent.click(screen.getByRole('button', { name: 'End the tour' }));
    expect(onAction.mock.calls.map(([action]) => action as string)).toEqual([
      'next',
      'next',
      'previous',
      'first',
      'end',
      'next',
      'end',
    ]);
  });

  it('takes the keys before anything else in the tab does', () => {
    stage();
    const other = vi.fn();
    document.body.addEventListener('keydown', other);
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    document.body.removeEventListener('keydown', other);
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('says when a step names what is gone, and when its view is', () => {
    const gone: TourFile = {
      ...tour,
      steps: [
        {
          id: 'a',
          viewState: { view: 'system-overview' },
          caption: { title: 'A' },
          marks: ['gone'],
        },
        { id: 'b', viewState: { view: 'gone' }, caption: { title: 'B' } },
      ],
    };
    const { rerender, onAction } = stage({ tour: gone });
    expect(screen.getByRole('article')).toHaveTextContent(
      'This step names what the project no longer holds, and plays without it.',
    );
    rerender(<TourStage project={sample} tour={gone} step={1} onAction={onAction} />);
    expect(screen.getByRole('article')).toHaveTextContent(
      'This step’s view no longer exists, so the canvas stays where it is.',
    );
  });
});

describe('the speaker notes window', () => {
  /** A window of the tab's own, as `window.open` gives one. */
  function fakeWindow() {
    const page = document.implementation.createHTMLDocument('');
    const listeners = new Map<string, EventListener>();
    return {
      document: page,
      closed: false,
      close: vi.fn(),
      addEventListener: vi.fn((type: string, listener: EventListener) =>
        listeners.set(type, listener),
      ),
      removeEventListener: vi.fn(),
      press: (key: string) => listeners.get('keydown')?.(new KeyboardEvent('keydown', { key })),
    };
  }

  const notesButton = () => screen.getByRole('button', { name: 'Speaker notes' });

  it('opens a window of its own with the step’s notes, which follows the keys pressed in it', () => {
    const notes = fakeWindow();
    const open = vi.spyOn(window, 'open').mockReturnValue(notes as unknown as Window);
    const { onAction } = stage({ step: 0 });
    fireEvent.click(notesButton());
    expect(open).toHaveBeenCalledWith('', NOTES_WINDOW, expect.stringContaining('popup'));
    expect(notesButton()).toHaveAttribute('aria-pressed', 'true');
    const text = notes.document.body.textContent;
    expect(text).toContain('Start from the whole picture before following one request.');
    expect(text).toContain('Next: The booking agent');
    expect(notes.document.title).toBe('Speaker notes: How booking works');
    act(() => notes.press('ArrowRight'));
    expect(onAction).toHaveBeenCalledWith('next');
  });

  it('closes the window from the button, and lets go once the person closes it', () => {
    vi.useFakeTimers();
    const notes = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(notes as unknown as Window);
    const { unmount } = stage();
    fireEvent.click(notesButton());
    notes.closed = true;
    act(() => {
      vi.advanceTimersByTime(600);
    });
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(notesButton()).toHaveAttribute('aria-pressed', 'false');
    expect(notes.close).toHaveBeenCalled();
    notes.closed = false;
    fireEvent.click(notesButton());
    fireEvent.click(notesButton());
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(notes.close).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('keeps the window when the same notes mount again at once, as StrictMode does', () => {
    vi.useFakeTimers();
    const notes = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(notes as unknown as Window);
    render(
      <StrictMode>
        <TourStage project={sample} tour={tour} step={0} onAction={() => {}} />
      </StrictMode>,
    );
    fireEvent.click(notesButton());
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(notes.close).not.toHaveBeenCalled();
    expect(notesButton()).toHaveAttribute('aria-pressed', 'true');
  });

  it('says how to allow it when the browser did not open it', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    stage();
    fireEvent.click(notesButton());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The browser did not open the speaker notes window. Allow pop-up windows for this page, then try again.',
    );
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is not offered when the host leaves it out', () => {
    stage({ notes: false });
    expect(screen.queryByRole('button', { name: 'Speaker notes' })).toBeNull();
  });
});
