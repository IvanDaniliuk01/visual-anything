/**
 * Recording on the canvas, through the whole shell: clicks on relations record steps in order, Shift
 * adds to the current step, and Enter records the selected relation from the keyboard.
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import { fitCamera, worldToScreen } from '../canvas/camera';
import { buildScene } from '../canvas/scene';
import { Shell } from '../shell/Shell';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { withoutDecisions } from '../test/sample';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

// The sample's scenario as it plays without its decision, which DecisionPanel.test.tsx covers.
const sample = withoutDecisions();
const view = sample.views[0]!;
const SIZE = { width: 1000, height: 600 };
const NAME = 'Patient books an appointment';

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The shell over a stand-in for the local program, which applies each command and answers after. */
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
  };
}

/** Starts the canvas at a known size; gives its host and where a relation's middle is on screen. */
async function started(program: ReturnType<typeof localProgram>) {
  render(<program.LiveShell />);
  const host = screen.getByRole('application');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: SIZE.width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: SIZE.height });
  const [app] = FakeApplication.created as [FakeApplication];
  await act(async () => {
    app.finishInit();
    await Promise.resolve();
  });
  const drawn = buildScene(program.project, view.id);
  const camera = fitCamera(drawn.bounds, SIZE, 32);
  const middleOf = (relation: string) => {
    const line = drawn.relations.find((each) => each.relation === relation);
    if (!line) throw new Error(relation);
    return worldToScreen(camera, line.middle);
  };
  return { host, middleOf };
}

function click(host: HTMLElement, at: { x: number; y: number }, init: MouseEventInit = {}) {
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: at.x,
      clientY: at.y,
      button: 0,
      ...init,
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    fireEvent(host, event);
  }
}

async function answers(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Scenarios' });
}

function startRecording() {
  fireEvent.click(within(panel()).getByRole('button', { name: new RegExp(`^${NAME}`) }));
  fireEvent.click(within(panel()).getByRole('button', { name: 'Record' }));
}

describe('Recording on the canvas', () => {
  it('records a click on a relation as the next step, and a Shift+click into the same step', async () => {
    const program = localProgram();
    const { host, middleOf } = await started(program);
    startRecording();
    expect(screen.getByText(/^Recording: click relations in order/)).toBeInTheDocument();

    click(host, middleOf('api-reads-db'));
    await answers();
    expect(program.onCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: `Record step 6 of “${NAME}”` }),
    );
    click(host, middleOf('api-to-reminders'), { shiftKey: true });
    await answers();
    click(host, middleOf('patient-to-whatsapp'));
    await answers();

    const steps = program.project.scenarios[0]!.steps;
    expect(steps.slice(5).map((step) => step.relations)).toEqual([
      ['api-reads-db', 'api-to-reminders'],
      ['patient-to-whatsapp'],
    ]);
    expect(program.onCommand).toHaveBeenCalledTimes(3);
  });

  it('records from the keyboard: Enter records the selected relation and follows it, Shift+Enter adds it', async () => {
    const program = localProgram();
    const { host, middleOf } = await started(program);
    startRecording();
    // A click records and selects the relation; the keys go on from there.
    click(host, middleOf('whatsapp-to-agent'));
    await answers();
    fireEvent.keyDown(host, { key: 'Enter', shiftKey: true });
    await answers();
    // Shift+Enter stays on the relation: Enter records it again, as a step of its own, and follows it.
    fireEvent.keyDown(host, { key: 'Enter' });
    await answers();
    const steps = program.project.scenarios[0]!.steps;
    expect(steps.slice(5).map((step) => step.relations)).toEqual([
      ['whatsapp-to-agent'],
      ['whatsapp-to-agent'],
    ]);
    expect(screen.getByRole('status', { name: 'Selection' })).toHaveTextContent(/Booking agent/);
  });

  it('selects and toggles relations as usual once recording stops', async () => {
    const program = localProgram();
    const { host, middleOf } = await started(program);
    startRecording();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Stop recording' }));
    expect(screen.queryByText(/^Recording: click relations in order/)).toBeNull();
    click(host, middleOf('api-reads-db'));
    await answers();
    expect(program.onCommand).not.toHaveBeenCalled();
  });

  it('fixes a broken step with the relation selected on the canvas', async () => {
    const broken: ProjectSnapshot = {
      ...sample,
      model: {
        ...sample.model,
        relations: sample.model.relations.filter((relation) => relation.id !== 'agent-to-api'),
      },
    };
    const program = localProgram(broken);
    const { host, middleOf } = await started(program);
    fireEvent.click(within(panel()).getByRole('button', { name: new RegExp(`^${NAME}`) }));
    fireEvent.click(within(panel()).getByRole('button', { name: /^3The agent/ }));
    click(host, middleOf('whatsapp-to-agent'));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Use the selected relation' }));
    await answers();
    expect(program.onCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: `Fix step 3 of “${NAME}”` }),
    );
    expect(program.project.scenarios[0]!.steps[2]!.relations).toEqual(['whatsapp-to-agent']);
  });
});
