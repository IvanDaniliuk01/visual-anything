import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import { Shell } from '../shell/Shell';
import { loadSample } from '../test/sample';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const sample = loadSample();
const NAME = 'Patient books an appointment';

/**
 * The shell over a stand-in for the local program, which applies each command to the project it
 * keeps, shows the change, and answers after it. A command it cannot apply is refused.
 */
function localProgram(start: ProjectSnapshot = sample) {
  let current = start;
  const shows = new Set<(next: ProjectSnapshot) => void>();
  const onCommand = vi.fn<SendCommand>(async (command) => {
    const outcome = executeCommand(current, command);
    if (!outcome.ok) return { ok: false };
    current = outcome.state;
    for (const show of shows) show(current);
    await Promise.resolve();
    return { ok: true, created: outcome.created };
  });
  function LiveShell() {
    const [shown, setShown] = useState(current);
    useEffect(() => {
      shows.add(setShown);
      return () => void shows.delete(setShown);
    }, []);
    return <Shell project={shown} onCommand={onCommand} />;
  }
  return {
    LiveShell,
    onCommand,
    get project() {
      return current;
    },
    /** The last command sent. */
    get last(): Command | undefined {
      return onCommand.mock.calls.at(-1)?.[0];
    },
  };
}

/** The scenario panel. */
function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Scenarios' });
}

/** The steps as the panel lists them: what each says, and whether it is the one playback is on. */
function steps(): { text: string; current: boolean }[] {
  const list = within(panel()).getByRole('list', { name: 'Steps' });
  return within(list)
    .getAllByRole('listitem')
    .filter((item) => item.parentElement === list)
    .map((item) => ({
      text: item.querySelector('.scenario-step-head')?.textContent ?? '',
      current: item.getAttribute('aria-current') === 'step',
    }));
}

function currentStep(): string | undefined {
  return steps().find((step) => step.current)?.text;
}

/** What the panel last said to screen readers. */
function said(): string {
  return panel().querySelector('[aria-live]')?.textContent?.trim() ?? '';
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function openScenario(name = NAME) {
  fireEvent.click(within(panel()).getByRole('button', { name: new RegExp(`^${name}`) }));
}

/** The sample with its view collapsing these containers, as interface I1 stores them. */
function collapsing(collapsed: Id[]): ProjectSnapshot {
  const [view, ...rest] = sample.views;
  const folded: ViewFile & { collapsed?: Id[] } = { ...view!, collapsed };
  return { ...sample, views: [folded, ...rest] };
}

describe('ScenarioPanel', () => {
  it('lists the project’s scenarios, with their steps and the view they play over', () => {
    render(<Shell project={sample} />);
    const list = within(panel()).getByRole('list', { name: 'Scenarios of the project' });
    expect(within(list).getByRole('button')).toHaveTextContent(
      `${NAME}5 steps over System overview`,
    );
  });

  it('opens a scenario at its first step, with the step’s description and data to read', () => {
    render(<Shell project={sample} />);
    openScenario();
    expect(within(panel()).getByRole('heading', { name: NAME })).toBeInTheDocument();
    expect(steps().map((step) => step.text)).toEqual([
      '1The patient asks for an appointment on WhatsApp.',
      '2The channel hands the message to the booking agent.',
      '3The agent asks the Appointments API for free cardiology slots next week.',
      '4The API reads the free slots from the calendar.',
      '5The API books the first free slot and schedules its reminder, both at once.',
    ]);
    expect(currentStep()).toMatch(/^1/);
    expect(within(panel()).getByText('Step 1 of 5')).toBeInTheDocument();
    expect(
      within(panel()).getByText('Patient communicates with WhatsApp channel'),
    ).toBeInTheDocument();
    expect(within(panel()).getByLabelText('Data in (JSON)')).toHaveValue(
      JSON.stringify({ text: 'Hi! Can I see a cardiologist next week?' }, null, 2),
    );
    expect(within(panel()).getByLabelText('Data out (JSON)')).toHaveValue(
      JSON.stringify({ messageId: 'msg-7f3a' }, null, 2),
    );
  });

  it('steps forward and back, and through the list with the arrow keys', () => {
    render(<Shell project={sample} />);
    openScenario();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Next' }));
    expect(currentStep()).toMatch(/^2/);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Previous' }));
    expect(currentStep()).toMatch(/^1/);
    const first = within(panel()).getByRole('button', { name: /^1The patient/ });
    fireEvent.keyDown(first, { key: 'End' });
    expect(currentStep()).toMatch(/^5/);
    expect(document.activeElement).toHaveTextContent(/^5/);
    expect(within(panel()).getByText('Relations, at once')).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(currentStep()).toMatch(/^4/);
    fireEvent.click(within(panel()).getByRole('button', { name: /^2The channel/ }));
    expect(currentStep()).toMatch(/^2/);
  });

  it('plays and pauses, at the speed chosen', () => {
    render(<Shell project={sample} />);
    openScenario();
    const play = within(panel()).getByRole('button', { name: 'Play' });
    fireEvent.click(play);
    expect(within(panel()).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    fireEvent.change(within(panel()).getByLabelText('Speed'), { target: { value: '2' } });
    expect(within(panel()).getByLabelText('Speed')).toHaveValue('2');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Pause' }));
    expect(within(panel()).getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('never changes the project while it plays or steps', () => {
    const program = localProgram();
    render(<program.LiveShell />);
    openScenario();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Play' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Next' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Previous' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Pause' }));
    expect(program.onCommand).not.toHaveBeenCalled();
  });

  it('saves a step’s description as one action', async () => {
    const program = localProgram();
    render(<program.LiveShell />);
    openScenario();
    const description = within(panel()).getByLabelText('Description');
    fireEvent.change(description, { target: { value: 'A patient writes to the clinic.' } });
    fireEvent.keyDown(description, { key: 'Enter' });
    await flush();
    expect(program.last).toMatchObject({
      type: 'batch',
      label: `Describe step 1 of “${NAME}”`,
    });
    expect(program.project.scenarios[0]!.steps[0]!.description).toBe(
      'A patient writes to the clinic.',
    );
    expect(steps()[0]!.text).toBe('1A patient writes to the clinic.');
  });

  it('edits a step’s data as JSON, refusing what is not JSON and removing what is blank', async () => {
    const program = localProgram();
    render(<program.LiveShell />);
    openScenario();
    const dataIn = within(panel()).getByLabelText('Data in (JSON)');
    fireEvent.change(dataIn, { target: { value: '{ "text": ' } });
    fireEvent.blur(dataIn);
    expect(within(panel()).getByRole('alert')).toHaveTextContent(/^This is not JSON/);
    expect(program.onCommand).not.toHaveBeenCalled();
    fireEvent.change(dataIn, { target: { value: '{ "text": "Hello" }' } });
    fireEvent.blur(dataIn);
    await flush();
    expect(program.last).toMatchObject({ label: `Change what step 1 of “${NAME}” takes in` });
    expect(program.project.scenarios[0]!.steps[0]!.dataIn).toEqual({ text: 'Hello' });
    const dataOut = within(panel()).getByLabelText('Data out (JSON)');
    fireEvent.change(dataOut, { target: { value: '  ' } });
    fireEvent.blur(dataOut);
    await flush();
    expect(program.project.scenarios[0]!.steps[0]).not.toHaveProperty('dataOut');
  });

  it('moves and deletes steps, each as one action', async () => {
    const program = localProgram();
    render(<program.LiveShell />);
    openScenario();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Move down' }));
    await flush();
    expect(program.last).toMatchObject({ label: `Move step 1 of “${NAME}” down` });
    expect(program.project.scenarios[0]!.steps.map((step) => step.id).slice(0, 2)).toEqual([
      'hand-over',
      'ask',
    ]);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete step' }));
    await flush();
    expect(program.project.scenarios[0]!.steps).toHaveLength(4);
    expect(said()).toBe('Step 1 is deleted.');
  });

  it('offers to remove decisions that do not hold together, as one action', async () => {
    const [scenario, ...rest] = sample.scenarios;
    // A decision whose alternatives name steps the scenario does not have.
    const tangled = {
      ...scenario!,
      blocks: [
        {
          kind: 'decision' as const,
          id: 'tangled',
          question: 'Which way?',
          alternatives: [
            { id: 'a', label: 'A', steps: ['gone'] },
            { id: 'b', label: 'B', steps: [] },
          ],
        },
      ],
    };
    const program = localProgram({ ...sample, scenarios: [tangled, ...rest] });
    render(<program.LiveShell />);
    openScenario();
    expect(within(panel()).getByText(/Its decisions do not hold together/)).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Remove the decisions' }));
    await flush();
    expect(program.last).toMatchObject({ label: `Remove the decisions of “${NAME}”` });
    expect(program.project.scenarios[0]!.blocks).toBeUndefined();
    expect(program.project.scenarios[0]!.steps).toEqual(scenario!.steps);
    expect(within(panel()).queryByText(/Its decisions do not hold together/)).toBeNull();
  });

  it('shows a broken step, which a relation selected on the canvas can fix', () => {
    const broken: ProjectSnapshot = {
      ...sample,
      model: {
        ...sample.model,
        relations: sample.model.relations.filter((relation) => relation.id !== 'agent-to-api'),
      },
    };
    const program = localProgram(broken);
    render(<program.LiveShell />);
    openScenario();
    expect(steps()[2]!.text).toMatch(/Broken$/);
    fireEvent.click(within(panel()).getByRole('button', { name: /^3The agent/ }));
    expect(within(panel()).getByText(/no longer exists \(agent-to-api\)/)).toBeInTheDocument();
    expect(within(panel()).getByText(/This is a broken step/)).toBeInTheDocument();
    // Nothing is selected: the canvas's tests select the relation that fixes it.
    expect(
      within(panel()).getByRole('button', { name: 'Use the selected relation' }),
    ).toBeDisabled();
    expect(within(panel()).queryByRole('button', { name: 'Take out what is gone' })).toBeNull();
    expect(program.onCommand).not.toHaveBeenCalled();
  });

  it('fixes a broken step by taking out what is gone', async () => {
    const broken: ProjectSnapshot = {
      ...sample,
      model: {
        ...sample.model,
        relations: sample.model.relations.filter((relation) => relation.id !== 'api-to-reminders'),
      },
    };
    const program = localProgram(broken);
    render(<program.LiveShell />);
    openScenario();
    fireEvent.click(within(panel()).getByRole('button', { name: /^5The API books/ }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Take out what is gone' }));
    await flush();
    expect(program.last).toMatchObject({ label: `Fix step 5 of “${NAME}”` });
    expect(program.project.scenarios[0]!.steps[4]!.relations).toEqual(['api-writes-db']);
    expect(steps()[4]!.text).not.toMatch(/Broken/);
  });

  it('plays the steps inside a collapsed container as one aggregated step, and expands it', async () => {
    const program = localProgram(collapsing(['scheduling']));
    render(<program.LiveShell />);
    openScenario();
    expect(steps().map((step) => step.text)).toEqual([
      '1The patient asks for an appointment on WhatsApp.',
      '2The channel hands the message to the booking agent.',
      '3The agent asks the Appointments API for free cardiology slots next week.',
      '4–52 steps inside “Scheduling”×2',
    ]);
    fireEvent.click(within(panel()).getByRole('button', { name: /^4–5/ }));
    expect(within(panel()).getByText('Steps 4–5 of 5')).toBeInTheDocument();
    expect(
      within(panel()).getByText(/These 2 steps happen inside “Scheduling”/),
    ).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Expand “Scheduling”' }));
    await flush();
    expect(program.onCommand).toHaveBeenCalledWith({
      type: 'set-collapsed',
      view: 'system-overview',
      elements: ['scheduling'],
      collapsed: false,
    });
  });

  it('reveals the steps of an aggregated step once its container is expanded mid-playback', () => {
    const { rerender } = render(<Shell project={collapsing(['scheduling'])} />);
    openScenario();
    fireEvent.click(within(panel()).getByRole('button', { name: /^4–5/ }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Play' }));
    rerender(<Shell project={sample} />);
    expect(steps()).toHaveLength(5);
    expect(currentStep()).toMatch(/^4The API reads/);
    expect(within(panel()).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('creates a scenario over the open view, and starts recording it', async () => {
    const program = localProgram();
    render(<program.LiveShell />);
    fireEvent.click(within(panel()).getByRole('button', { name: 'New scenario' }));
    const name = within(panel()).getByLabelText('Name of the new scenario over “System overview”');
    expect(name).toHaveValue('New scenario');
    fireEvent.change(name, { target: { value: 'Reminder goes out' } });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Create and record' }));
    await flush();
    expect(program.onCommand).toHaveBeenCalledWith({
      type: 'create-scenario',
      scenario: { name: 'Reminder goes out', view: 'system-overview', steps: [] },
    });
    expect(within(panel()).getByRole('heading', { name: 'Reminder goes out' })).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: 'Stop recording' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      within(panel()).getByText(/Click relations on the canvas in the order/),
    ).toBeInTheDocument();
  });

  it('renames and deletes a scenario', async () => {
    const program = localProgram();
    render(<program.LiveShell />);
    openScenario();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Rename' }));
    const name = within(panel()).getByLabelText('Name of the scenario');
    fireEvent.change(name, { target: { value: 'Booking' } });
    fireEvent.click(within(name.closest('form')!).getByRole('button', { name: 'Rename' }));
    await flush();
    expect(program.last).toMatchObject({
      type: 'batch',
      label: `Rename the scenario “${NAME}” to “Booking”`,
    });
    expect(within(panel()).getByRole('heading', { name: 'Booking' })).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete' }));
    const confirm = within(panel()).getByRole('alertdialog', { name: 'Delete the scenario?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete scenario' }));
    await flush();
    expect(program.project.scenarios).toEqual([]);
    expect(within(panel()).getByText(/This project has no scenarios yet/)).toBeInTheDocument();
  });

  it('opens a scenario’s view when it plays over another one', () => {
    const second: ViewFile = {
      id: 'ownership',
      name: 'Ownership',
      perspective: { name: 'Ownership' },
      nestingRelationTypes: ['systems.is-part-of'],
      positions: [],
      freeShapes: [],
    };
    const project: ProjectSnapshot = {
      ...sample,
      views: [second, ...sample.views],
    };
    render(<Shell project={project} />);
    expect(screen.getByRole('banner')).toHaveTextContent('Ownership');
    openScenario();
    expect(screen.getByRole('banner')).toHaveTextContent('System overview');
    expect(within(panel()).getByRole('button', { name: 'Play' })).toBeEnabled();
  });

  it('can be read but not changed while the project cannot be changed', () => {
    render(<Shell project={sample} />);
    expect(within(panel()).getByRole('button', { name: 'New scenario' })).toBeDisabled();
    openScenario();
    expect(within(panel()).getByRole('button', { name: 'Record' })).toBeDisabled();
    expect(within(panel()).getByLabelText('Description')).toBeDisabled();
    expect(within(panel()).getByRole('button', { name: 'Play' })).toBeEnabled();
  });

  it('closes the scenario, back to the list, keeping the focus in the panel', () => {
    render(<Shell project={sample} />);
    openScenario();
    expect(document.activeElement).toBe(within(panel()).getByRole('heading', { name: NAME }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }));
    expect(
      within(panel()).getByRole('list', { name: 'Scenarios of the project' }),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(
      within(panel()).getByRole('heading', { name: 'Scenarios' }),
    );
  });
});
