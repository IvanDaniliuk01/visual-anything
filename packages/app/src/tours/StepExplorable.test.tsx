import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { TourFile, TourStep } from '@visual-anything/schema';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import { LiveContext } from '../live/context';
import { Shell } from '../shell/Shell';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const sample = loadSample('quadratic-function');
const tour = sample.tours[0] as TourFile;

afterEach(cleanup);

/** The sample with its tour's first step changed. */
function withFirstStep(change: (step: TourStep) => TourStep): ProjectSnapshot {
  return {
    ...sample,
    tours: [{ ...tour, steps: tour.steps.map((step, at) => (at === 0 ? change(step) : step)) }],
  };
}

/** Opens the tour in the Tours tab; commands are recorded and done. */
function openTour(project: ProjectSnapshot = sample) {
  const sent: Command[] = [];
  const onCommand = vi.fn<SendCommand>((command) => {
    sent.push(command);
    return Promise.resolve({ ok: true, created: [], warnings: [] });
  });
  render(
    <LiveContext value={fakeLive({ project })}>
      <Shell project={project} onCommand={onCommand} />
    </LiveContext>,
  );
  const panel = screen.getByRole('complementary', { name: 'Outline and model' });
  fireEvent.click(within(panel).getByRole('tab', { name: 'Tours' }));
  const tab = within(panel).getByRole('tabpanel', { name: 'Tours' });
  fireEvent.click(within(tab).getByRole('button', { name: /^Playing with a, b and c/ }));
  const steps = within(tab).getByRole('list', { name: 'Steps of “Playing with a, b and c”' });
  const first = within(steps).getAllByRole('group', { name: 'Explorable' })[0] as HTMLElement;
  return { sent, first };
}

/** The first step as the last command sent gives it. */
function firstStepSent(sent: readonly Command[]): TourStep | undefined {
  const command = sent.at(-1);
  return command?.type === 'update-tour' ? (command.changes.steps?.[0] as TourStep) : undefined;
}

describe('a tour step’s explorable in the step editor', () => {
  it('shows the explorable it plays and its parameters, each with its default', () => {
    const { first } = openTour();
    expect(within(first).getByLabelText('Shows live while it plays')).toHaveDisplayValue(
      'Parabola',
    );
    expect(within(first).getByLabelText('Leading coefficient a')).toHaveValue('1');
    expect(within(first).getByLabelText('Constant c')).toHaveValue('0');
    expect(first).toHaveTextContent('Default: 1, from -5 to 5');
  });

  it('sets a value within its range, as one change to the tour', async () => {
    const { first, sent } = openTour();
    const a = within(first).getByLabelText('Leading coefficient a');
    fireEvent.change(a, { target: { value: '2,5' } });
    fireEvent.blur(a);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(firstStepSent(sent)?.explorable).toEqual({
      id: 'quadratic.parabola',
      parameters: { a: 2.5, b: 0, c: 0 },
    });
  });

  it('refuses a value out of its range, saying why, and sends nothing', () => {
    const { first, sent } = openTour();
    const a = within(first).getByLabelText('Leading coefficient a');
    fireEvent.change(a, { target: { value: '9' } });
    fireEvent.keyDown(a, { key: 'Enter' });
    expect(within(first).getByRole('alert')).toHaveTextContent('"a" takes a number from -5 to 5.');
    expect(a).toHaveAttribute('aria-invalid', 'true');
    expect(sent).toEqual([]);
  });

  it('takes a value back to its default', async () => {
    const { first, sent } = openTour();
    fireEvent.click(
      within(first).getByRole('button', {
        name: 'Take “Leading coefficient a” back to its default',
      }),
    );
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(firstStepSent(sent)?.explorable).toEqual({
      id: 'quadratic.parabola',
      parameters: { b: 0, c: 0 },
    });
  });

  it('shows none once None is chosen', async () => {
    const { first, sent } = openTour();
    fireEvent.change(within(first).getByLabelText('Shows live while it plays'), {
      target: { value: '' },
    });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(firstStepSent(sent)).not.toHaveProperty('explorable');
  });

  it('says what a broken step sets that its explorable no longer takes, and takes it out', async () => {
    const { first, sent } = openTour(
      withFirstStep((step) => ({
        ...step,
        explorable: { id: 'quadratic.parabola', parameters: { a: 1, d: 3, c: 40 } },
      })),
    );
    const broken = within(first).getByRole('group', { name: 'What is broken' });
    expect(broken).toHaveTextContent('declares no parameter "d"');
    expect(broken).toHaveTextContent('"c" takes a number from -10 to 10.');
    fireEvent.click(
      within(broken).getByRole('button', { name: 'Take out what it no longer takes' }),
    );
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(firstStepSent(sent)?.explorable).toEqual({
      id: 'quadratic.parabola',
      parameters: { a: 1 },
    });
  });

  it('keeps a step whose explorable is gone, naming it, and shows none on request', async () => {
    const { first, sent } = openTour(
      withFirstStep((step) => ({ ...step, explorable: { id: 'quadratic.gone' } })),
    );
    expect(within(first).getByLabelText('Shows live while it plays')).toHaveDisplayValue(
      '“quadratic.gone”, which no package defines',
    );
    const broken = within(first).getByRole('group', { name: 'What is broken' });
    expect(broken).toHaveTextContent('No package defines this explorable now');
    fireEvent.click(within(broken).getByRole('button', { name: 'Show none' }));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(firstStepSent(sent)).not.toHaveProperty('explorable');
  });
});

describe('a tour step’s explorable while the tour plays', () => {
  it('shows beside the caption, as its card until it is approved, and follows the steps', () => {
    openTour();
    fireEvent.click(screen.getByRole('button', { name: 'Play full screen from step 1' }));
    const aside = screen.getByRole('complementary', { name: 'The explorable “Parabola”' });
    expect(within(aside).getByRole('region', { name: 'Explorable “Parabola”' })).toBeVisible();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 2 of 6');
    expect(screen.getByRole('complementary', { name: 'The explorable “Parabola”' })).toBe(aside);
  });
});
