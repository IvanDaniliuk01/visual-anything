/**
 * Import… with HTML "As an explorable" (ADR 0107): the dialog asks what HTML becomes, a drawing by
 * default (ADR 0068); as an explorable, it is defined in the project's own package through the core's
 * one action, named from its title, and offered for approval, never approved.
 */
import type { BatchCommand, Command, DrawingMadeMessage } from '@visual-anything/core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExplorableSession, ExplorableSessionContext } from '../explorables/session';
import { LanguageProvider } from '../i18n/LanguageProvider';
import type { CommandResult, LiveResult } from '../live/connection';
import { loadSample } from '../test/sample';
import { ImportControl } from './ImportControl';

const HTML =
  '<!doctype html><title>Roots of a quadratic</title><canvas></canvas><script>va.ready()</script>';

type Make = (name: string, html: string, width: number) => Promise<LiveResult<DrawingMadeMessage>>;

afterEach(cleanup);

function renderControl(options: { language?: 'en' | 'es'; drawing?: boolean } = {}) {
  const send = vi.fn<(command: Command) => Promise<CommandResult>>(() =>
    Promise.resolve({ ok: true, created: [], warnings: [] }),
  );
  const makeDrawing = vi.fn<Make>(() => new Promise(() => {}));
  const session = new ExplorableSession(undefined);
  render(
    <LanguageProvider language={options.language ?? 'en'}>
      <ExplorableSessionContext value={session}>
        <ImportControl
          project={loadSample()}
          viewId="system-overview"
          send={send}
          {...(options.drawing === false ? {} : { makeDrawing })}
        />
      </ExplorableSessionContext>
    </LanguageProvider>,
  );
  return { send, makeDrawing, session };
}

const dialog = () => screen.getByRole('dialog');

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function paste(name: string, text = HTML, format?: string) {
  fireEvent.click(screen.getByRole('button', { name: /^(Import…|Importar…)$/ }));
  fireEvent.click(within(dialog()).getAllByRole('radio')[1] as HTMLElement);
  fireEvent.change(within(dialog()).getAllByRole('textbox')[0] as HTMLElement, {
    target: { value: name },
  });
  fireEvent.change(within(dialog()).getAllByRole('textbox')[1] as HTMLElement, {
    target: { value: text },
  });
  if (format !== undefined) {
    fireEvent.change(within(dialog()).getByRole('combobox'), { target: { value: format } });
  }
  fireEvent.click(within(dialog()).getAllByRole('button').at(-1) as HTMLElement);
  await settle();
}

describe('Import… with HTML as an explorable', () => {
  it('asks what HTML becomes, a drawing by default, and defines it as an explorable when chosen', async () => {
    const { send, session } = renderControl();
    await paste('roots.html');
    expect(within(dialog()).getByRole('radio', { name: /^As a drawing/ })).toBeChecked();
    fireEvent.click(within(dialog()).getByRole('radio', { name: /^As an explorable/ }));
    expect(
      within(dialog()).getByRole('heading', { name: 'Import “roots.html” as an explorable' }),
    ).toBeVisible();
    expect(within(dialog()).getByRole('textbox', { name: 'Name' })).toHaveValue(
      'Roots of a quadratic',
    );
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import' }));
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as BatchCommand;
    expect(command.label).toBe('Import "roots.html" as an explorable');
    expect(command.commands).toHaveLength(1);
    expect(command.commands[0]).toMatchObject({
      type: 'define-explorable',
      package: 'clinic',
      explorable: { name: 'Roots of a quadratic' },
      text: HTML,
    });
    expect(dialog()).toHaveTextContent('it asks you before it runs');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Review and approve…' }));
    const defined = command.commands[0];
    expect(session.snapshot().reviewing).toBe(
      defined?.type === 'define-explorable' ? defined.explorable.id : 'none',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('takes the format “HTML, as an explorable”, and the name the person gives', async () => {
    const { send, makeDrawing } = renderControl();
    await paste('pasted', HTML, 'html-explorable');
    expect(makeDrawing).not.toHaveBeenCalled();
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Roots' },
    });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import' }));
    await settle();
    const command = send.mock.calls[0]?.[0] as BatchCommand;
    expect(command.commands[0]).toMatchObject({ explorable: { name: 'Roots' } });
  });

  it('offers only an explorable where no drawing can be made', async () => {
    renderControl({ drawing: false });
    await paste('roots.html');
    expect(within(dialog()).queryByRole('radio', { name: /^As a drawing/ })).toBeNull();
    expect(within(dialog()).getByRole('radio', { name: /^As an explorable/ })).toBeChecked();
  });

  it('refuses a page past 512 KiB before anything is sent', async () => {
    const { send } = renderControl();
    await paste('big.html', `<p>${'x'.repeat(512 * 1024)}</p>`, 'html-explorable');
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('at most 512 KiB');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import' }));
    await settle();
    expect(send).not.toHaveBeenCalled();
  });

  it('reads in Spanish', async () => {
    renderControl({ language: 'es' });
    await paste('roots.html', HTML, 'html-explorable');
    expect(
      within(dialog()).getByRole('heading', { name: 'Importar “roots.html” como explorable' }),
    ).toBeVisible();
    expect(within(dialog()).getByRole('radio', { name: /^Como explorable/ })).toBeChecked();
  });
});
