import type { ProjectSnapshot } from '@visual-anything/core';
import type { TourFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveContext } from '../live/context';
import { Header } from '../shell/Header';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';
import { NOTES_WINDOW } from './notes-window';
import { TourStage } from './TourStage';

const sample = loadSample();
const tour = sample.tours[0] as TourFile;
const RENAME = { label: 'Rename "API" to "Gateway"', author: 'user' as const };

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
    expect(progress).toHaveAttribute('aria-valuemax', '4');
    expect(progress).toHaveAttribute('aria-valuetext', 'Step 1 of 4');
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

  it('takes the keys before anything else in the tab does, and lets none through to the app', () => {
    stage();
    const other = vi.fn();
    document.body.addEventListener('keydown', other);
    window.addEventListener('keydown', other);
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    fireEvent.keyDown(document.body, { key: 'ArrowUp', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true });
    document.body.removeEventListener('keydown', other);
    window.removeEventListener('keydown', other);
    expect(other).not.toHaveBeenCalled();
  });

  it('changes nothing with the app’s shortcuts while it plays, and leaves the browser’s keys to it', async () => {
    const live = fakeLive({ history: { undo: RENAME, redo: RENAME } });
    const onAction = vi.fn();
    const { rerender } = render(
      <LiveContext value={live}>
        <Header projectName="My systems" viewName="System overview" />
        <TourStage project={sample} tour={tour} step={0} onAction={onAction} />
      </LiveContext>,
    );
    const shown = screen.getByRole('region', { name: `Tour “${tour.name}”` });
    expect(shown).toHaveFocus();
    const pressed: boolean[] = [];
    await act(async () => {
      pressed.push(fireEvent.keyDown(shown, { key: 'z', ctrlKey: true }));
      pressed.push(fireEvent.keyDown(shown, { key: 'z', metaKey: true }));
      pressed.push(fireEvent.keyDown(shown, { key: 'y', ctrlKey: true }));
      pressed.push(fireEvent.keyDown(shown, { key: 'r', ctrlKey: true }));
      pressed.push(fireEvent.keyDown(shown, { key: 'l', ctrlKey: true }));
      await Promise.resolve();
    });
    expect(live.undo).not.toHaveBeenCalled();
    expect(live.redo).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
    // Nothing kept the browser from doing what it does with them.
    expect(pressed).toEqual([true, true, true, true, true]);

    // Once the tour ends, the shortcuts are the app's again.
    rerender(
      <LiveContext value={live}>
        <Header projectName="My systems" viewName="System overview" />
      </LiveContext>,
    );
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
      await Promise.resolve();
    });
    expect(live.undo).toHaveBeenCalledTimes(1);
  });

  it('lets Space and Enter press the control that has the focus', () => {
    const { onAction } = stage({ step: 1 });
    const next = screen.getByRole('button', { name: 'Next step' });
    next.focus();
    // The browser presses the button: the stage does not take the key for its own.
    expect(fireEvent.keyDown(next, { key: ' ' })).toBe(true);
    expect(fireEvent.keyDown(next, { key: 'Enter' })).toBe(true);
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.keyDown(next, { key: 'ArrowRight' });
    expect(onAction).toHaveBeenCalledWith('next');
  });

  it('leaves a dialog over the tour its own keys, but not the app’s shortcuts', async () => {
    const live = fakeLive({ history: { undo: RENAME } });
    const onAction = vi.fn();
    const inDialog = vi.fn();
    render(
      <LiveContext value={live}>
        <Header projectName="My systems" viewName="System overview" />
        <TourStage project={sample} tour={tour} step={0} onAction={onAction} />
        <div
          role="dialog"
          aria-label="Approve"
          onKeyDown={() => {
            inDialog();
          }}
        >
          <button type="button">Approve</button>
        </div>
      </LiveContext>,
    );
    const button = screen.getByRole('button', { name: 'Approve' });
    await act(async () => {
      fireEvent.keyDown(button, { key: 'Escape' });
      fireEvent.keyDown(button, { key: 'z', ctrlKey: true });
      await Promise.resolve();
    });
    expect(inDialog).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
    expect(live.undo).not.toHaveBeenCalled();
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

  // The caption fades out and in with the step's transition (ADR 0077).
  it('shows the caption the transition shows, fading as it says', () => {
    const [left, come] = tour.steps;
    if (!left || !come) throw new Error('The sample tour has too few steps.');
    const { rerender, onAction } = stage({
      step: 1,
      caption: { step: 0, phase: 'out', fade: 150 },
    });
    const card = screen.getByRole('article');
    expect(within(card).getByRole('heading', { name: left.caption.title })).toBeInTheDocument();
    expect(card).toHaveAttribute('data-phase', 'out');
    expect(card.style.transitionDuration).toBe('150ms');
    // Where the tour is says the step come to at once.
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
    rerender(
      <TourStage
        project={sample}
        tour={tour}
        step={1}
        caption={{ step: 1, phase: 'in', fade: 200 }}
        onAction={onAction}
      />,
    );
    expect(within(card).getByRole('heading', { name: come.caption.title })).toBeInTheDocument();
    expect(card).toHaveAttribute('data-phase', 'in');
    expect(card.style.transitionDuration).toBe('200ms');
  });

  it('goes forward while a step has reveals to show, and back while one shows', () => {
    const last = tour.steps.length - 1;
    const revealing: TourFile = {
      ...tour,
      steps: tour.steps.map((step, at) =>
        at === last || at === 0 ? { ...step, reveal: [{ marks: ['patient'] }] } : step,
      ),
    };
    const { rerender, onAction } = stage({ tour: revealing, step: last, reveal: 0 });
    expect(screen.getByRole('button', { name: 'Next step' })).toBeEnabled();
    rerender(
      <TourStage project={sample} tour={revealing} step={last} reveal={1} onAction={onAction} />,
    );
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
    rerender(
      <TourStage project={sample} tour={revealing} step={0} reveal={1} onAction={onAction} />,
    );
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeEnabled();
  });
});

// ADR 0077: the stage of a tour that moves.
describe('TourStage’s reveals, scenario card and controls', () => {
  const revealing: TourFile = {
    ...tour,
    steps: tour.steps.map((step, at) =>
      at === 1
        ? {
            ...step,
            reveal: [
              { marks: ['appointments-api'], text: 'Then the API answers.' },
              { marks: ['reminder-service'] },
              { marks: ['patient'], text: 'And the patient hears back.' },
            ],
          }
        : step,
    ),
  };

  it('adds each reveal’s text to the caption as a paragraph, and takes it away again', () => {
    const { rerender, onAction } = stage({ tour: revealing, step: 1, reveal: 1 });
    const card = screen.getByRole('article');
    expect(within(card).getByText('Then the API answers.')).toBeInTheDocument();
    expect(within(card).queryByText('And the patient hears back.')).toBeNull();
    rerender(
      <TourStage project={sample} tour={revealing} step={1} reveal={3} onAction={onAction} />,
    );
    expect(within(card).getByText('And the patient hears back.')).toBeInTheDocument();
    rerender(
      <TourStage project={sample} tour={revealing} step={1} reveal={0} onAction={onAction} />,
    );
    expect(within(card).queryByText('Then the API answers.')).toBeNull();
  });

  it('shows the reveals the step left had while its caption fades out', () => {
    stage({
      tour: revealing,
      step: 2,
      caption: { step: 1, phase: 'out', fade: 150, reveal: 3 },
    });
    expect(screen.getByText('And the patient hears back.')).toBeInTheDocument();
  });

  it('says which scenario plays, the step it is on and its description, and pauses it', () => {
    const scenario = sample.scenarios[0];
    if (!scenario) throw new Error('The sample has no scenario.');
    const { rerender, onAction } = stage({
      step: 2,
      scenario: { scenario: scenario.id, step: 1, state: 'playing' },
    });
    const card = screen.getByRole('region', { name: `Scenario “${scenario.name}”` });
    expect(card).toHaveTextContent(`Plays “${scenario.name}”`);
    expect(card).toHaveTextContent(`Step 2 of ${scenario.steps.length}`);
    expect(card).toHaveTextContent(scenario.steps[1]?.description ?? '');
    fireEvent.click(within(card).getByRole('button', { name: 'Pause' }));
    expect(onAction).toHaveBeenLastCalledWith('pause');
    rerender(
      <TourStage
        project={sample}
        tour={tour}
        step={2}
        scenario={{ scenario: scenario.id, step: 1, state: 'paused' }}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onAction).toHaveBeenLastCalledWith('pause');
    rerender(
      <TourStage
        project={sample}
        tour={tour}
        step={2}
        scenario={{ scenario: scenario.id, step: 3, state: 'done' }}
        onAction={onAction}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(onAction).toHaveBeenLastCalledWith('replay');
  });

  it('shows no scenario card for the caption of the step left', () => {
    const scenario = sample.scenarios[0];
    if (!scenario) throw new Error('The sample has no scenario.');
    stage({
      step: 2,
      caption: { step: 1, phase: 'out', fade: 150 },
      scenario: { scenario: scenario.id, step: 0, state: 'playing' },
    });
    expect(screen.queryByRole('region', { name: `Scenario “${scenario.name}”` })).toBeNull();
  });

  it('takes P, R, B, I and Enter, and the presenter’s Page Down and Page Up', () => {
    const { onAction } = stage({ step: 1 });
    for (const key of ['p', 'r', 'b', 'i', 'Enter', 'PageDown', 'PageUp']) {
      fireEvent.keyDown(document.body, { key });
    }
    fireEvent.keyDown(document.body, { key: 'r', ctrlKey: true });
    expect(onAction.mock.calls.map(([action]) => action as string)).toEqual([
      'pause',
      'replay',
      'back',
      'index',
      'next',
      'next',
      'previous',
    ]);
  });

  it('offers a pause control while the step advances by itself', () => {
    const { rerender, onAction } = stage({ advancing: { paused: false } });
    fireEvent.click(screen.getByRole('button', { name: 'Pause advancing' }));
    expect(onAction).toHaveBeenLastCalledWith('hold');
    rerender(
      <TourStage
        project={sample}
        tour={tour}
        step={0}
        advancing={{ paused: true }}
        onAction={onAction}
      />,
    );
    expect(screen.getByRole('button', { name: 'Resume advancing' })).toBeInTheDocument();
    rerender(<TourStage project={sample} tour={tour} step={0} onAction={onAction} />);
    expect(screen.queryByRole('button', { name: /advancing/ })).toBeNull();
  });

  it('offers Back to the step once the person looked around', () => {
    const { rerender, onAction } = stage();
    expect(screen.queryByRole('button', { name: 'Back to the step' })).toBeNull();
    rerender(<TourStage project={sample} tour={tour} step={0} looked onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the step' }));
    expect(onAction).toHaveBeenLastCalledWith('back');
  });

  it('opens the steps’ index, to jump to a step, and closes it with Escape', () => {
    const onGoTo = vi.fn();
    const { rerender, onAction } = stage({ step: 1, index: true, onGoTo });
    const index = screen.getByRole('dialog', { name: 'The steps of the tour' });
    const items = within(index).getAllByRole('button');
    expect(items.map((item) => item.textContent)).toEqual(
      tour.steps.map((step, at) => `${at + 1}${step.caption.title}`),
    );
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1] as HTMLElement, { key: 'ArrowDown' });
    expect(items[2]).toHaveFocus();
    fireEvent.click(items[2] as HTMLElement);
    expect(onGoTo).toHaveBeenCalledWith(2);
    fireEvent.keyDown(items[2] as HTMLElement, { key: 'Escape' });
    expect(onAction).toHaveBeenLastCalledWith('index');
    // Escape outside the index closes it too, rather than ending the tour.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onAction).toHaveBeenLastCalledWith('index');
    rerender(<TourStage project={sample} tour={tour} step={1} onAction={onAction} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onAction).toHaveBeenLastCalledWith('end');
  });

  it('puts the card where the stage says, or in the corner its caption fixes', () => {
    const { rerender, onAction } = stage({ place: 'top' });
    expect(screen.getByRole('article')).toHaveAttribute('data-place', 'top');
    const cornered: TourFile = {
      ...tour,
      steps: tour.steps.map((step) => ({
        ...step,
        caption: { ...step.caption, place: 'bottom-right' as const },
      })),
    };
    rerender(
      <TourStage project={sample} tour={cornered} step={0} place="top" onAction={onAction} />,
    );
    expect(screen.getByRole('article')).toHaveAttribute('data-place', 'bottom-right');
  });

  describe('what screen readers hear', () => {
    const status = () => screen.getByRole('status');

    it('says the step the person comes to, with what it marks', () => {
      const { rerender, onAction } = stage({
        step: 1,
        said: { kind: 'step', step: 1, reveal: 0, count: 1 },
      });
      const title = tour.steps[1]?.caption.title ?? '';
      expect(status()).toHaveTextContent(`Step 2 of 4: ${title}`);
      expect(status()).toHaveTextContent(/Marks “.+”/);
      // A step that comes on a timer brings no new cue: nothing new is said.
      rerender(
        <TourStage
          project={sample}
          tour={tour}
          step={2}
          said={{ kind: 'step', step: 1, reveal: 0, count: 1 }}
          onAction={onAction}
        />,
      );
      expect(status()).toHaveTextContent(`Step 2 of 4: ${title}`);
    });

    it('says each reveal as it comes, with its text and what it marks', () => {
      stage({
        tour: revealing,
        step: 1,
        reveal: 1,
        said: { kind: 'reveal', step: 1, reveal: 1, count: 2 },
      });
      expect(status()).toHaveTextContent(/^Then the API answers\. Marks “.+”\.\s*$/);
    });

    it('says the scenario’s step when it is paused', () => {
      const scenario = sample.scenarios[0];
      if (!scenario) throw new Error('The sample has no scenario.');
      stage({
        step: 2,
        said: { kind: 'paused', scenario: scenario.id, step: 1, count: 3 },
      });
      expect(status()).toHaveTextContent(
        `Paused on step 2 of ${scenario.steps.length} of “${scenario.name}”: ${scenario.steps[1]?.description ?? ''}`,
      );
    });

    it('says nothing until told', () => {
      stage();
      expect(status()).toHaveTextContent(/^\s*$/);
    });

    it('says what the caption points at, and the chain a pulse follows (ADR 0084)', () => {
      const explaining: TourFile = {
        ...tour,
        steps: [
          {
            id: 'explains',
            viewState: { view: 'system-overview' },
            caption: { title: 'Who books', pointTo: 'api-writes-db' },
            marks: ['api-writes-db'],
            pulse: { relations: ['agent-to-api', 'api-writes-db'] },
          },
        ],
      };
      stage({ tour: explaining, said: { kind: 'step', step: 0, reveal: 0, count: 1 } });
      expect(status()).toHaveTextContent(
        /Pointing at “.+”\. A pulse follows the chain: “Booking agent” .+ “Appointments API”; “Appointments API” .+ “Appointments DB”\./,
      );
    });

    it('names a note by its first words, an arrow as an arrow, and a relation without a name by its type', () => {
      const project: ProjectSnapshot = {
        ...sample,
        model: {
          ...sample.model,
          relations: sample.model.relations.map((each) =>
            each.id === 'agent-to-api' ? { ...each, name: undefined } : each,
          ),
        },
        views: sample.views.map((each) =>
          each.id === 'system-overview'
            ? {
                ...each,
                freeShapes: [
                  ...each.freeShapes,
                  {
                    kind: 'note',
                    id: 'why',
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 40,
                    text: 'Every **booking** goes through the API before it reaches the database.',
                  },
                  { kind: 'arrow', id: 'there', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
                ],
              }
            : each,
        ),
      };
      const pointing = (pointTo: string, extra: Partial<TourFile['steps'][number]> = {}) => {
        const explaining: TourFile = {
          ...tour,
          steps: [
            {
              id: 'explains',
              viewState: { view: 'system-overview' },
              caption: { title: 'Who books', pointTo },
              marks: [pointTo],
              ...extra,
            },
          ],
        };
        const { unmount } = stage(
          { tour: explaining, said: { kind: 'step', step: 0, reveal: 0, count: 1 } },
          project,
        );
        const said = status().textContent;
        unmount();
        return said;
      };
      expect(pointing('why')).toContain(
        'Pointing at the note “Every booking goes through the API…”.',
      );
      expect(pointing('there')).toContain('Pointing at an arrow.');
      expect(pointing('agent-to-api', { pulse: { relations: ['agent-to-api'] } })).toMatch(
        /Pointing at “communicates with”\. A pulse follows the chain: “Booking agent” communicates with “Appointments API”\./,
      );
    });
  });

  describe('a caption’s leader line (ADR 0084)', () => {
    it('draws from the card to its mark, and says when the mark is off the canvas', () => {
      const { container, rerender, onAction } = stage({
        leader: { from: { x: 10, y: 20 }, to: { x: 30, y: 40 } },
      });
      const line = container.querySelector('.tour-leader line');
      expect(line).toHaveAttribute('x1', '10');
      expect(line).toHaveAttribute('y2', '40');
      expect(container.querySelector('.tour-leader')).toHaveAttribute('aria-hidden', 'true');
      rerender(
        <TourStage project={sample} tour={tour} step={0} onAction={onAction} leader="off" />,
      );
      expect(container.querySelector('.tour-leader')).toBeNull();
      expect(screen.getByRole('article')).toHaveTextContent(
        'It explains something off the canvas.',
      );
    });
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
