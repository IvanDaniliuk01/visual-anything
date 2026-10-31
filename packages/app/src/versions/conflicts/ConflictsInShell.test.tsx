/**
 * The conflicts in the Changes tab (ADR 0072): whenever the project holds any, each file with its
 * conflicts, drawn on request as a comparison between what is kept and the other choice; Keep and
 * Take the other, one at a time or for a whole file, sent as the person's action; a deletion's preview
 * first; and the note that the file can now be added with git.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import type { CommandResult } from '../../live/connection';
import { LiveContext, type Live } from '../../live/context';
import { Shell } from '../../shell/Shell';
import { REMOVED, RENAMED, conflictedSample } from '../../test/conflicts';
import { fakeLive } from '../../test/fakeLive';
import { loadSample } from '../../test/sample';

vi.mock('../../canvas/CanvasArea', () => import('../../test/FakeCanvasArea'));

const DONE: CommandResult = { ok: true, created: [], warnings: [] };

function setup(language: 'en' | 'es' = 'en') {
  const send = vi.fn<Live['send']>(() => Promise.resolve(DONE));
  const live = fakeLive({ project: conflictedSample(), send });
  const tree = (project: ProjectSnapshot) => (
    <LanguageProvider language={language}>
      <LiveContext value={live}>
        <Shell project={project} onCommand={send} />
      </LiveContext>
    </LanguageProvider>
  );
  const view = render(tree(conflictedSample()));
  return { send, rerender: (project: ProjectSnapshot) => view.rerender(tree(project)) };
}

function conflicts() {
  return screen.getByRole('region', { name: 'Conflicts from a merge' });
}

async function click(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button);
    await Promise.resolve();
  });
}

describe('the conflicts in the Changes tab', () => {
  it('show whenever the project holds any, each with what is kept and the other choice', () => {
    setup();
    const panel = screen.getByRole('complementary', { name: 'Outline and model' });
    expect(within(panel).getByRole('tab', { name: 'Changes' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const model = within(conflicts()).getByRole('region', { name: 'The model' });
    expect(within(model).getByText('2 conflicts')).toBeInTheDocument();
    const renamed = within(model).getByRole('listitem', { name: 'WhatsApp channel › name' });
    expect(within(renamed).getByText('Both sides changed it, differently.')).toBeInTheDocument();
    expect(within(renamed).getByText('Kept, from main')).toBeInTheDocument();
    expect(within(renamed).getByText('WhatsApp channel')).toBeInTheDocument();
    expect(within(renamed).getByText('The other choice, from feature/sms')).toBeInTheDocument();
    expect(within(renamed).getByText('WhatsApp Business')).toBeInTheDocument();
    const removed = within(model).getByRole('listitem', { name: 'Reminder service' });
    expect(within(removed).getByText('Taking it removes this.')).toBeInTheDocument();
  });

  it('are not there in a project that holds none', () => {
    render(
      <LiveContext value={fakeLive()}>
        <Shell project={loadSample()} />
      </LiveContext>,
    );
    expect(screen.queryByRole('tab', { name: 'Changes' })).toBeNull();
  });

  it('draws one on the canvas as a comparison between what is kept and the other choice', () => {
    setup();
    const renamed = within(conflicts()).getByRole('listitem', { name: 'WhatsApp channel › name' });
    fireEvent.click(within(renamed).getByRole('button', { name: 'Show' }));
    expect(screen.getByRole('application')).toHaveAccessibleName(
      /^WhatsApp channel › name: what is kept, and the other choice: /,
    );
    // The Changes tab lists what taking the other choice changes, below the conflicts.
    expect(screen.getByRole('tree')).toHaveTextContent('WhatsApp Business');
  });

  it('keeps one, or takes the other, as the person’s action', async () => {
    const { send } = setup();
    const renamed = within(conflicts()).getByRole('listitem', { name: 'WhatsApp channel › name' });
    await click(within(renamed).getByRole('button', { name: 'Keep' }));
    expect(send).toHaveBeenLastCalledWith({
      type: 'resolve-conflicts',
      file: { kind: 'model' },
      resolutions: [{ conflict: RENAMED.id, take: 'kept' }],
    });
    await click(within(renamed).getByRole('button', { name: 'Take the other' }));
    expect(send).toHaveBeenLastCalledWith({
      type: 'resolve-conflicts',
      file: { kind: 'model' },
      resolutions: [{ conflict: RENAMED.id, take: 'other' }],
    });
  });

  it('previews what taking the other choice deletes, before it does', async () => {
    const { send } = setup();
    const removed = within(conflicts()).getByRole('listitem', { name: 'Reminder service' });
    fireEvent.click(within(removed).getByRole('button', { name: 'Take the other' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete "Reminder service"?' });
    expect(send).not.toHaveBeenCalled();
    await click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(send).toHaveBeenLastCalledWith({
      type: 'resolve-conflicts',
      file: { kind: 'model' },
      resolutions: [{ conflict: REMOVED.id, take: 'other' }],
    });
  });

  it('resolves a whole file, then says it can be added with git', async () => {
    const { send, rerender } = setup();
    const model = within(conflicts()).getByRole('region', { name: 'The model' });
    await click(within(model).getByRole('button', { name: 'Keep all' }));
    expect(send).toHaveBeenLastCalledWith({
      type: 'resolve-conflicts',
      file: { kind: 'model' },
      resolutions: [
        { conflict: RENAMED.id, take: 'kept' },
        { conflict: REMOVED.id, take: 'kept' },
      ],
    });
    act(() => rerender(loadSample()));
    const note = within(conflicts()).getByRole('status');
    expect(note).toHaveTextContent(
      'The model holds no conflict now: its file can be added with git add.',
    );
    fireEvent.click(within(note).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'Conflicts from a merge' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Changes' })).toBeNull();
  });

  it('says why a resolution was refused', async () => {
    const { send } = setup();
    send.mockResolvedValueOnce({
      ok: false,
      problems: [{ code: 'invalid-command', message: 'There is no conflict in the model.' }],
    });
    const renamed = within(conflicts()).getByRole('listitem', { name: 'WhatsApp channel › name' });
    await click(within(renamed).getByRole('button', { name: 'Keep' }));
    expect(within(renamed).getByRole('alert')).toHaveTextContent(
      'There is no conflict in the model.',
    );
  });

  it('reads in Spanish', () => {
    setup('es');
    const section = screen.getByRole('region', { name: 'Conflictos de una unión' });
    const model = within(section).getByRole('region', { name: 'El modelo' });
    expect(within(model).getByText('2 conflictos')).toBeInTheDocument();
    expect(within(model).getByRole('button', { name: 'Conservar todo' })).toBeVisible();
    expect(within(model).getByRole('button', { name: 'Tomar la otra en todo' })).toBeVisible();
  });
});
