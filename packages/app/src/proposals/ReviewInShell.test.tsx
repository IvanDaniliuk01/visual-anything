/**
 * Reviewing Claude's proposal in the shell (ADR 0073): the header says Claude proposes changes, and
 * opens the review on the person's say, drawn as a comparison with the changes in the Changes tab,
 * each with its tick; Accept, Accept the ticked changes and Refuse decide, naming the revision shown;
 * a stale acceptance is said and the proposal shown again; and the review closes with the proposal.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../i18n/LanguageProvider';
import type { CommandResult, WaitingProposal } from '../live/connection';
import { LiveContext, type Live } from '../live/context';
import { Shell } from '../shell/Shell';
import { fakeLive } from '../test/fakeLive';
import { sampleProposal } from '../test/proposal';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const MODEL_PANEL = 'Outline and model';
const STALE = 'The proposal changed since it was shown: review it again.';

function waiting(revision = 1): WaitingProposal {
  const { base, proposed, shown } = sampleProposal(undefined, { revision });
  return { base, proposed, shown };
}

function setup(language: 'en' | 'es' = 'en') {
  const proposal = waiting();
  const accept = vi.fn<NonNullable<Live['acceptProposal']>>(() =>
    Promise.resolve<CommandResult>({ ok: true, created: [], warnings: [] }),
  );
  const refuse = vi.fn<NonNullable<Live['refuseProposal']>>(() =>
    Promise.resolve<CommandResult>({ ok: true, created: [], warnings: [] }),
  );
  const liveWith = (next: WaitingProposal | undefined) =>
    fakeLive({
      project: proposal.base,
      ...(next ? { proposal: next } : {}),
      acceptProposal: accept,
      refuseProposal: refuse,
    });
  const tree = (live: Live) => (
    <LanguageProvider language={language}>
      <LiveContext value={live}>
        <Shell project={proposal.base} />
      </LiveContext>
    </LanguageProvider>
  );
  const view = render(tree(liveWith(proposal)));
  return {
    proposal,
    accept,
    refuse,
    show: (next: WaitingProposal | undefined) => view.rerender(tree(liveWith(next))),
  };
}

function panel(name = MODEL_PANEL) {
  return screen.getByRole('complementary', { name });
}

function review(name = /^Claude proposes 3 changes$/) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('a proposal that waits', () => {
  it('shows in the header, and opens the review as a comparison with its changes ticked', () => {
    setup();
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(
      'Claude proposes 3 changes: review them before they apply.',
    );
    review();

    expect(screen.getByRole('button', { name: /^Claude proposes 3 changes$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('application')).toHaveAccessibleName(/^Claude’s proposal: /);
    const changes = panel();
    expect(within(changes).getByRole('tab', { name: 'Changes' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      within(changes).getByRole('treeitem', { name: /^Added: SMS\. Ticked\.$/ }),
    ).toBeVisible();
    expect(
      within(changes).getByRole('button', { name: 'Accept the ticked changes (3 of 3)' }),
    ).toBeVisible();
  });

  it('unticks what needs a change unticked, says so, and accepts the ticked ones', async () => {
    const { accept, proposal } = setup();
    review();
    const changes = panel();
    fireEvent.keyDown(within(changes).getByRole('treeitem', { name: /^Added: SMS\. Ticked\.$/ }), {
      key: ' ',
    });
    expect(
      within(changes).getByRole('treeitem', { name: /^Added: SMS\. Not ticked\.$/ }),
    ).toBeVisible();
    expect(
      within(changes).getByRole('treeitem', { name: /SMS to WhatsApp Business. Not ticked\.$/ }),
    ).toBeVisible();
    expect(within(changes).getByText(/^Also unticked, since they need it: /)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        within(changes).getByRole('button', { name: 'Accept the ticked changes (1 of 3)' }),
      );
      await Promise.resolve();
    });
    expect(accept).toHaveBeenCalledWith(proposal.shown.id, 1, ['element:whatsapp changed']);
  });

  it('accepts every change, or refuses them', async () => {
    const { accept, refuse, proposal } = setup();
    review();
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Accept' }));
      await Promise.resolve();
    });
    expect(accept).toHaveBeenCalledWith(proposal.shown.id, 1, 'all');
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Refuse' }));
      await Promise.resolve();
    });
    expect(refuse).toHaveBeenCalledWith(proposal.shown.id);
  });

  it('says what a change needs and what needs it, once it is chosen', () => {
    setup();
    review();
    const changes = panel();
    fireEvent.click(within(changes).getByRole('treeitem', { name: /SMS to WhatsApp Business./ }));
    expect(within(changes).getByText('It needs: SMS (added).')).toBeInTheDocument();
  });

  it('says a stale acceptance, and names the revision shown again when it accepts', async () => {
    const { accept, show, proposal } = setup();
    review();
    accept.mockResolvedValueOnce({
      ok: false,
      problems: [{ code: 'invalid-command', message: STALE }],
    });
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Accept' }));
      await Promise.resolve();
    });
    expect(within(panel()).getByRole('alert')).toHaveTextContent(STALE);

    // The program shows it again, at the revision it is now: the review follows.
    act(() => show(waiting(4)));
    expect(screen.getByRole('application')).toHaveAccessibleName(/^Claude’s proposal: /);
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Accept' }));
      await Promise.resolve();
    });
    expect(accept).toHaveBeenLastCalledWith(proposal.shown.id, 4, 'all');
  });

  it('closes with the proposal, wherever it was decided', () => {
    const { show } = setup();
    review();
    act(() => show(undefined));
    expect(screen.queryByRole('button', { name: /Claude proposes/ })).toBeNull();
    expect(screen.getByRole('application')).not.toHaveAccessibleName(/Claude’s proposal/);
    expect(within(panel()).queryByRole('tab', { name: 'Changes' })).toBeNull();
  });

  it('ends the review, but keeps the proposal waiting, when the comparison ends', () => {
    setup();
    review();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /^Claude proposes 3 changes$/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(panel()).queryByRole('tab', { name: 'Changes' })).toBeNull();
  });

  it('reads in Spanish', () => {
    setup('es');
    review(/^Claude propone 3 cambios$/);
    const changes = panel('Esquema y modelo');
    expect(within(changes).getByRole('heading', { name: 'Propuesta de Claude' })).toBeVisible();
    expect(within(changes).getByRole('button', { name: 'Aceptar' })).toBeVisible();
    expect(
      within(changes).getByRole('button', { name: 'Aceptar los cambios marcados (3 de 3)' }),
    ).toBeVisible();
    expect(within(changes).getByRole('button', { name: 'Rechazar' })).toBeVisible();
  });
});

describe('the history panel', () => {
  it('holds the toggle of Review Claude’s changes, and the proposal that waits', () => {
    setup();
    const changes = panel();
    fireEvent.click(within(changes).getByRole('tab', { name: 'History' }));
    const toggle = within(changes).getByRole('checkbox', { name: 'Review Claude’s changes' });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription(
      'Claude’s changes apply at once, and you can undo them.',
    );
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription(
      'Claude’s changes wait for you to accept them, change by change.',
    );
    fireEvent.click(within(changes).getByRole('button', { name: 'Review' }));
    expect(screen.getByRole('application')).toHaveAccessibleName(/^Claude’s proposal: /);
  });
});
