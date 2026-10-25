import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { TourFile } from '@visual-anything/schema';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
      '3 steps',
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
      'System overview',
    ]);
    expect(titlesIn(sent[1])).toEqual([
      'The booking agent',
      'Clinic booking',
      'One request, step by step',
    ]);
    expect(titlesIn(sent[2])).toEqual([
      'Clinic booking',
      'The booking agent',
      'The booking agent',
      'One request, step by step',
    ]);
    // The copy has no id of its own yet: the core gives it one.
    const copy = sent[2]?.type === 'update-tour' ? sent[2].changes.steps?.[2] : undefined;
    expect(copy?.id).toBeUndefined();
    expect(titlesIn(sent[3])).toEqual(['Clinic booking', 'One request, step by step']);
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
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 2 of 3');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('article')).toBeNull();
    expect(shell).not.toHaveClass('tour-playing');
  });

  it('plays from a step, and changes nothing in the project', () => {
    const { tab, sent } = openTours();
    fireEvent.click(within(tab).getByRole('button', { name: /^How booking works/ }));
    fireEvent.click(within(tab).getByRole('button', { name: 'Play full screen from step 3' }));
    expect(screen.getByRole('article')).toHaveTextContent('One request, step by step');
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
    // The step opens its scenario, which plays from its first step.
    const scenarios = screen.getByRole('complementary', { name: 'Scenarios' });
    expect(
      within(scenarios).getByRole('heading', { name: 'Patient books an appointment' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(sent).toEqual([]);
  });

  it('goes back to where the tab was once the tour ends', () => {
    const { tab } = openTours();
    const scenarios = screen.getByRole('complementary', { name: 'Scenarios' });
    const opened = () =>
      within(scenarios).queryByRole('heading', { name: 'Patient books an appointment' });
    expect(opened()).toBeNull();
    fireEvent.click(within(tab).getByRole('button', { name: /^How booking works/ }));
    fireEvent.click(within(tab).getByRole('button', { name: 'Play full screen from step 3' }));
    expect(opened()).not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    // The scenario the step opened closes again with the view state from before the tour.
    expect(opened()).toBeNull();
  });
});
