/**
 * An explorable not approved shows its card, whose Approve… opens the approval dialog (ADR 0107):
 * its name and description, who wrote it, its code behind Show code and the WebRTC sentence.
 * Approving keeps the hash of its text in the person's preferences, and Withdraw approval in
 * Packages… takes it back.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectSnapshot } from '@visual-anything/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { appliedPreferences, resetPreferencesForTests } from '../theme/store';
import { ExplorableApproval } from './ApprovalDialog';
import { ApprovedExplorables } from './ApprovedExplorables';
import { explorableOf } from './explorable';
import { ExplorableView } from './ExplorableView';
import { ExplorableSession, ExplorableSessionContext } from './session';

afterEach(() => {
  cleanup();
  resetPreferencesForTests();
});

function quadratic(): ProjectSnapshot {
  const project = loadSample('quadratic-function');
  const text = readFileSync(
    join(import.meta.dirname, '../../../../examples/quadratic-function/explorables/quadratic.html'),
    'utf8',
  );
  return { ...project, explorableTexts: [{ id: 'quadratic.parabola', text }] };
}

describe('approving an explorable', () => {
  it('shows its card, asks with the dialog, and keeps the approval by its hash', () => {
    const project = quadratic();
    const shown = explorableOf(project, 'quadratic.parabola')!;
    const session = new ExplorableSession(undefined);
    render(
      <ExplorableSessionContext value={session}>
        <ExplorableView
          project={project}
          explorable="quadratic.parabola"
          element="quadratic-function"
        />
        <ExplorableApproval project={project} />
        <ApprovedExplorables project={project} />
      </ExplorableSessionContext>,
    );
    expect(screen.getByText('Not approved yet: Approve to run.')).toBeTruthy();
    expect(
      screen.getByText(
        'No explorable is approved yet. Each asks you before it runs the first time.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve…' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain(shown.definition.name);
    expect(dialog.textContent).toContain(
      'It came from outside: an import, git or your own editor.',
    );
    expect(dialog.textContent).toContain('over WebRTC');
    expect(dialog.textContent).toContain('It uses no script library.');
    expect(screen.getByText('Show code')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve and run' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(appliedPreferences().preferences.explorableApprovals).toEqual([
      { hash: shown.hash, explorable: 'quadratic.parabola', by: 'person' },
    ]);
    // Approved, it would run; with no program to serve it here, the card says so.
    expect(
      screen.getByText('Not running: Visual Anything is not connected.', { exact: false }),
    ).toBeTruthy();
    expect(screen.getByText('the text it runs now', { exact: false })).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: `Withdraw the approval of “${shown.definition.name}”` }),
    );
    expect(appliedPreferences().preferences.explorableApprovals).toEqual([]);
    expect(screen.getByText('Not approved yet: Approve to run.')).toBeTruthy();
  });
});
