/**
 * Decisions in the scenario panel (ADR 0078), over the process sample's "An order": the decision
 * card and its keys, the steps' list grouped by alternative, going to a step of an alternative not
 * chosen, Stop at each decision, and recording's Rejoin here and Add an alternative here.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import { Shell } from '../shell/Shell';
import { loadSample, withoutDecisions } from '../test/sample';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const sample = loadSample('order-process');
const QUESTION = 'Is every item in stock?';

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
    get last(): Command | undefined {
      return onCommand.mock.calls.at(-1)?.[0];
    },
  };
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Scenarios' });
}

function said(): string {
  return panel().querySelector('[aria-live]')?.textContent?.trim() ?? '';
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function openOrder() {
  fireEvent.click(within(panel()).getByRole('button', { name: /^An order/ }));
}

/** The step playback is on, as the list marks it. */
function currentStep(): string | undefined {
  return (
    panel().querySelector('[aria-current="step"] .scenario-step-head')?.textContent ?? undefined
  );
}

/** The card's group for the decision, while playback meets it. */
function card(): HTMLElement {
  return within(panel()).getByRole('group', { name: QUESTION });
}

describe('a scenario with a decision, in the panel', () => {
  it('lists the steps of each alternative under it, the one not chosen folded and dashed', () => {
    render(<Shell project={sample} />);
    openOrder();
    const alternatives = within(panel()).getByRole('list', { name: QUESTION });
    const [yes, no] = within(alternatives)
      .getAllByRole('listitem')
      .filter((item) => item.parentElement === alternatives);
    expect(within(yes!).getByRole('button', { name: 'Yes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(yes).toHaveTextContent('6 steps');
    expect(no).toHaveClass('scenario-alternative-aside');
    expect(no).toHaveTextContent('3 steps');
    expect(within(no!).queryByText(/cancelled and its payment refunded/)).toBeNull();
    fireEvent.click(within(no!).getByRole('button', { name: /^Show its steps/ }));
    expect(
      within(no!).getByText('The order is cancelled and its payment refunded.'),
    ).toBeInTheDocument();
    // Steps keep their numbers in reading order.
    expect(
      within(no!).getByRole('button', { name: /^11The order is cancelled/ }),
    ).toBeInTheDocument();
  });

  it('shows the decision card before the decision, which the digits choose, and says so', () => {
    render(<Shell project={sample} />);
    openOrder();
    expect(within(panel()).queryByRole('group', { name: QUESTION })).toBeNull();
    fireEvent.click(within(panel()).getByRole('button', { name: /^3The inventory is read/ }));
    const buttons = within(card()).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['1Yes', '2No']);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(within(card()).getByText('Next, a decision')).toBeInTheDocument();
    fireEvent.keyDown(buttons[0]!, { key: '2' });
    expect(said()).toBe(`“No” plays at “${QUESTION}”.`);
    expect(within(card()).getByRole('button', { name: 'No' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.activeElement).toHaveTextContent('2No');
    // Playback stays before the decision, then goes into the alternative chosen.
    expect(currentStep()).toMatch(/^3/);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Next' }));
    expect(currentStep()).toMatch(/^10An item is out of stock/);
    expect(within(card()).getByText('Decision')).toBeInTheDocument();
  });

  it('goes from one alternative of the card to the next with the arrow keys', () => {
    render(<Shell project={sample} />);
    openOrder();
    fireEvent.click(within(panel()).getByRole('button', { name: /^3The inventory is read/ }));
    const yes = within(card()).getByRole('button', { name: 'Yes' });
    yes.focus();
    fireEvent.keyDown(yes, { key: 'ArrowRight' });
    expect(document.activeElement).toHaveTextContent('2No');
    // Focusing does not choose.
    expect(yes).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toHaveTextContent('1Yes');
  });

  it('chooses what reaches a step of an alternative not chosen, from the list, and says so', () => {
    render(<Shell project={sample} />);
    openOrder();
    const alternatives = within(panel()).getByRole('list', { name: QUESTION });
    fireEvent.click(within(alternatives).getByRole('button', { name: /^Show its steps/ }));
    fireEvent.click(within(panel()).getByRole('button', { name: /^11The order is cancelled/ }));
    expect(said()).toBe(`“No” plays at “${QUESTION}”.`);
    expect(currentStep()).toMatch(/^11/);
    expect(within(alternatives).getByRole('button', { name: 'No' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('chooses an alternative from its button in the list', () => {
    render(<Shell project={sample} />);
    openOrder();
    const alternatives = within(panel()).getByRole('list', { name: QUESTION });
    fireEvent.click(within(alternatives).getByRole('button', { name: 'No' }));
    expect(said()).toBe(`“No” plays at “${QUESTION}”.`);
    expect(within(panel()).getByText(/^Step 1 of 12/)).toBeInTheDocument();
  });

  it('offers Stop at each decision only for a scenario with decisions, and changes nothing', () => {
    const program = localProgram();
    render(<program.LiveShell />);
    openOrder();
    const stop = within(panel()).getByRole('checkbox', { name: 'Stop at each decision' });
    fireEvent.click(stop);
    expect(stop).toBeChecked();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Play' }));
    expect(program.onCommand).not.toHaveBeenCalled();
  });

  it('rejoins at a step of an alternative as one action', async () => {
    const program = localProgram();
    render(<program.LiveShell />);
    openOrder();
    fireEvent.click(
      within(panel()).getByRole('button', { name: /^9The customer gets the tracking/ }),
    );
    fireEvent.click(within(panel()).getByRole('button', { name: 'Rejoin here' }));
    await flush();
    expect(program.last).toMatchObject({ type: 'batch', label: 'Rejoin at step 9 of “An order”' });
    const scenario = program.project.scenarios.find((each) => each.id === 'an-order')!;
    expect(scenario.blocks?.[0]?.alternatives[0]?.steps).not.toContain('tell');
    expect(scenario.steps.at(-1)?.id).toBe('tell');
    expect(said()).toBe(
      'Step 9 and the steps after it in its alternative now follow the decision.',
    );
  });

  it('asks for the words of an alternative added after a step, then records its first click', () => {
    const program = localProgram();
    render(<program.LiveShell />);
    openOrder();
    fireEvent.click(within(panel()).getByRole('button', { name: /^3The inventory is read/ }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Add an alternative here' }));
    const form = within(panel()).getByRole('form', { name: 'Add an alternative here' });
    // A decision starts right after the step: only the new alternative's label.
    expect(within(form).queryByLabelText('Question')).toBeNull();
    const label = within(form).getByLabelText('Label of the new alternative');
    expect(label).toHaveValue('Alternative 3');
    fireEvent.change(label, { target: { value: 'Some of them' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Record the alternative' }));
    expect(within(panel()).getByRole('button', { name: 'Stop recording' })).toBeInTheDocument();
    expect(
      within(panel()).getByText(/the alternative “Some of them” starts with/),
    ).toBeInTheDocument();
    expect(program.onCommand).not.toHaveBeenCalled();
  });

  it('asks for a new decision’s question after a step with none right after it', () => {
    const program = localProgram();
    render(<program.LiveShell />);
    openOrder();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Add an alternative here' }));
    const form = within(panel()).getByRole('form', { name: 'Add an alternative here' });
    const submit = within(form).getByRole('button', { name: 'Record the alternative' });
    expect(submit).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('Question'), {
      target: { value: 'Is the customer known?' },
    });
    expect(within(form).getByLabelText('Label of the steps that follow')).toHaveValue('Yes');
    expect(within(form).getByLabelText('Label of the new alternative')).toHaveValue('No');
    expect(submit).toBeEnabled();
  });
});

describe('a scenario without decisions, in the panel', () => {
  it('shows no decision card, no option and no alternatives', () => {
    render(<Shell project={withoutDecisions()} />);
    fireEvent.click(within(panel()).getByRole('button', { name: /^Patient books an appointment/ }));
    expect(within(panel()).queryByRole('checkbox', { name: 'Stop at each decision' })).toBeNull();
    expect(panel().querySelector('.scenario-decision')).toBeNull();
    expect(within(panel()).queryByRole('button', { name: 'Rejoin here' })).toBeNull();
  });
});
