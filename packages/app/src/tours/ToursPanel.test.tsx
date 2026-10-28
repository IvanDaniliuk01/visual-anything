import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { TourFile } from '@visual-anything/schema';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import { LiveContext } from '../live/context';
import { Shell } from '../shell/Shell';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const sample = loadSample();
const tour = sample.tours[0] as TourFile;

/** Opens the shell on a project, the Tours tab chosen; commands are recorded and done. */
function openTours(project: ProjectSnapshot = sample) {
  const sent: Command[] = [];
  const onCommand = vi.fn<SendCommand>((command) => {
    sent.push(command);
    return Promise.resolve({ ok: true, created: ['made-1'], warnings: [] });
  });
  const view = render(
    <LiveContext value={fakeLive({ project })}>
      <Shell project={project} onCommand={onCommand} />
    </LiveContext>,
  );
  const panel = screen.getByRole('complementary', { name: 'Outline and model' });
  fireEvent.click(within(panel).getByRole('tab', { name: 'Tours' }));
  const tab = within(panel).getByRole('tabpanel', { name: 'Tours' });
  return { sent, tab, ...view };
}

/** The steps a command gives the tour, by their captions' titles. */
function titlesIn(command: Command | undefined): string[] {
  if (command?.type !== 'update-tour') return [];
  return (command.changes.steps ?? []).map((step) => step.caption.title);
}

describe('the tours panel', () => {
  it('lists the project’s tours, and starts one from what the canvas shows', async () => {
    const { tab, sent } = openTours();
    const list = within(tab).getByRole('list', { name: 'Tours of the project' });
    expect(within(list).getByRole('button', { name: /^How booking works/ })).toHaveTextContent(
      '4 steps',
    );
    fireEvent.click(within(tab).getByRole('button', { name: 'New tour from the canvas' }));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      type: 'create-tour',
      tour: {
        name: 'New tour',
        steps: [{ viewState: { view: 'system-overview' }, caption: { title: 'System overview' } }],
      },
    });
  });

  it('edits a step’s caption in place, as one action, when the person leaves the field', async () => {
    const { tab, sent } = openTours();
    fireEvent.click(within(tab).getByRole('button', { name: /^How booking works/ }));
    const steps = within(tab).getByRole('list', { name: 'Steps of “How booking works”' });
    const [first] = within(steps).getAllByLabelText('Title');
    fireEvent.change(first as HTMLElement, { target: { value: 'The clinic' } });
    expect(sent).toHaveLength(0);
    fireEvent.blur(first as HTMLElement);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(titlesIn(sent[0])).toEqual([
      'The clinic',
      'The booking agent',
      'One request, step by step',
      'When the week is full',
    ]);
    const [command] = sent;
    expect(command?.type === 'update-tour' && command.changes.steps?.[1]).toBe(tour.steps[1]);
  });

  it('adds a step from the canvas, and moves, duplicates and deletes steps, each as one action', async () => {
    const { tab, sent } = openTours();
    fireEvent.click(within(tab).getByRole('button', { name: /^How booking works/ }));
    fireEvent.click(within(tab).getByRole('button', { name: 'Add step' }));
    const second = within(tab).getByRole('group', { name: 'Step 2' });
    fireEvent.click(within(second).getByRole('button', { name: 'Move up' }));
    fireEvent.click(within(second).getByRole('button', { name: 'Duplicate' }));
    fireEvent.click(within(second).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => expect(sent).toHaveLength(4));
    expect(titlesIn(sent[0])).toEqual([
      'Clinic booking',
      'The booking agent',
      'One request, step by step',
      'When the week is full',
      'System overview',
    ]);
    expect(titlesIn(sent[1])).toEqual([
      'The booking agent',
      'Clinic booking',
      'One request, step by step',
      'When the week is full',
    ]);
    expect(titlesIn(sent[2])).toEqual([
      'Clinic booking',
      'The booking agent',
      'The booking agent',
      'One request, step by step',
      'When the week is full',
    ]);
    // The copy has no id of its own yet: the core gives it one.
    const copy = sent[2]?.type === 'update-tour' ? sent[2].changes.steps?.[2] : undefined;
    expect(copy?.id).toBeUndefined();
    expect(titlesIn(sent[3])).toEqual([
      'Clinic booking',
      'One request, step by step',
      'When the week is full',
    ]);
  });

  it('marks the selection only when something is selected', () => {
    const { tab } = openTours();
    fireEvent.click(within(tab).getByRole('button', { name: /^How booking works/ }));
    for (const button of within(tab).getAllByRole('button', { name: 'Mark the selection' })) {
      expect(button).toBeDisabled();
    }
  });

  it('flags a step that names what the project no longer holds', () => {
    const broken: ProjectSnapshot = {
      ...sample,
      tours: [
        {
          ...tour,
          steps: [{ ...(tour.steps[1] as TourFile['steps'][number]), marks: ['gone-element'] }],
        },
      ],
    };
    const { tab } = openTours(broken);
    expect(within(tab).getByRole('button', { name: /^How booking works/ })).toHaveTextContent(
      '1 names what is gone',
    );
    fireEvent.click(within(tab).getByRole('button', { name: /^How booking works/ }));
    expect(tab).toHaveTextContent(
      'A step marks elements and relations, and "gone-element" is neither.',
    );
  });
});

// ADR 0077: the Tours panel says what check_tour says, under each step.
describe('the tour’s check in the panel', () => {
  const far = { x: 100_000, y: 100_000, zoom: 1 };
  const checked: TourFile = {
    id: 'checked',
    name: 'Checked',
    steps: [
      {
        id: 'away',
        viewState: { view: 'system-overview', camera: far },
        caption: { title: 'Away' },
        marks: ['patient'],
      },
      {
        id: 'again',
        viewState: { view: 'system-overview', camera: far },
        caption: { title: 'Again' },
      },
      {
        id: 'back',
        viewState: { view: 'system-overview', camera: { x: 0, y: 0, zoom: 1 } },
        caption: { title: 'Back' },
      },
      {
        id: 'quick',
        viewState: { view: 'system-overview' },
        caption: { title: 'Quick', text: Array.from({ length: 40 }, () => 'word').join(' ') },
        advance: 1000,
      },
    ],
  };

  it('says where a step cuts, what its marks miss, what could be a reveal and a caption read too fast', () => {
    const { tab } = openTours({ ...sample, tours: [checked] });
    fireEvent.click(within(tab).getByRole('button', { name: /^Checked/ }));
    expect(tab).toHaveTextContent(
      'Read on a screen of 1366 by 768 pixels: 4 things to look at, under their steps.',
    );
    const look = (n: number) =>
      within(tab)
        .queryByRole('list', { name: `What to look at in step ${n}` })
        ?.textContent?.trim();
    expect(look(1)).toBe('Step 1 marks what its camera does not show: "Patient".');
    expect(look(2)).toBe(
      'Step 2 shows the same view state as step 1: it could be a reveal of that step.',
    );
    expect(look(3)).toBe(
      'Step 3 cuts from step 2: its camera is too far, or too much zoomed, to glide to.',
    );
    expect(look(4)).toMatch(/^Step 4 moves on after 1 s, but its text takes .+ to read/);
  });

  it('says nothing to look at in a tour that plays as written', () => {
    const { tab } = openTours();
    fireEvent.click(within(tab).getByRole('button', { name: /^How booking works/ }));
    expect(tab).toHaveTextContent('Read on a screen of 1366 by 768 pixels: nothing to look at.');
    expect(within(tab).queryByRole('list', { name: /^What to look at/ })).toBeNull();
  });
});

describe('full-screen playback', () => {
  it('hides the panels, shows the caption card and moves through the steps by keys, until Escape', () => {
    const { tab, container } = openTours();
    fireEvent.click(
      within(tab).getByRole('button', { name: 'Play “How booking works” full screen' }),
    );
    const shell = container.querySelector('.shell');
    expect(shell).toHaveClass('tour-playing');
    expect(screen.getByRole('article')).toHaveTextContent('Clinic booking');
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByRole('article')).toHaveTextContent('The booking agent');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 2 of 4');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('article')).toBeNull();
    expect(shell).not.toHaveClass('tour-playing');
  });

  it('plays from a step, and changes nothing in the project', async () => {
    const { tab, sent } = openTours();
    fireEvent.click(within(tab).getByRole('button', { name: /^How booking works/ }));
    fireEvent.click(within(tab).getByRole('button', { name: 'Play full screen from step 4' }));
    expect(screen.getByRole('article')).toHaveTextContent('When the week is full');
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
    // Once the canvas fills the window, the step opens its scenario, in the alternative it plays.
    const scenarios = screen.getByRole('complementary', { name: 'Scenarios' });
    await waitFor(() =>
      expect(
        within(scenarios).getByRole('heading', { name: 'Patient books an appointment' }),
      ).toBeInTheDocument(),
    );
    const alternatives = within(scenarios).getByRole('list', {
      name: 'Is a cardiology slot free next week?',
    });
    await waitFor(() =>
      expect(
        within(alternatives).getByRole('button', { name: 'No, the week is full' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(sent).toEqual([]);
  });

  it('refuses, in words, a change the connection could not carry, and sends nothing', async () => {
    // Text past what the core lets a tour hold, as a file written by hand can.
    const heavy: TourFile = {
      ...tour,
      steps: tour.steps.map((step, at) =>
        at === 0 ? { ...step, notes: '語'.repeat(1_500_000) } : step,
      ),
    };
    const project = { ...sample, tours: [heavy] };
    const live = fakeLive({ project });
    const onCommand = vi.fn<SendCommand>(() =>
      Promise.resolve({ ok: true, created: [], warnings: [] }),
    );
    render(
      <LiveContext value={live}>
        <Shell project={project} onCommand={onCommand} />
      </LiveContext>,
    );
    const panel = screen.getByRole('complementary', { name: 'Outline and model' });
    fireEvent.click(within(panel).getByRole('tab', { name: 'Tours' }));
    const tab = within(panel).getByRole('tabpanel', { name: 'Tours' });
    fireEvent.click(within(tab).getByRole('button', { name: /^How booking works/ }));
    const second = within(tab).getByRole('group', { name: 'Step 2' });
    fireEvent.click(within(second).getByRole('button', { name: 'Move up' }));
    await vi.waitFor(() =>
      expect(live.notify).toHaveBeenCalledWith(
        'warning',
        'This change to the tour was not made: with its steps, the tour takes more than the 4 MiB one change from the app carries. Delete some of its steps, or put them in another tour.',
      ),
    );
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('goes back to where the tab was once the tour ends', async () => {
    const { tab } = openTours();
    const scenarios = screen.getByRole('complementary', { name: 'Scenarios' });
    const opened = () =>
      within(scenarios).queryByRole('heading', { name: 'Patient books an appointment' });
    expect(opened()).toBeNull();
    fireEvent.click(within(tab).getByRole('button', { name: /^How booking works/ }));
    fireEvent.click(within(tab).getByRole('button', { name: 'Play full screen from step 3' }));
    await waitFor(() => expect(opened()).not.toBeNull());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    // The scenario the step opened closes again with the view state from before the tour.
    await waitFor(() => expect(opened()).toBeNull());
  });
});
