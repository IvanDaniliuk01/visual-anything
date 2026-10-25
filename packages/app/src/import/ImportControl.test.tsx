/**
 * The import dialog (ADR-0042): it reads pasted text or a chosen file in the tab, shows what the
 * import creates and how each kind maps, with the suggestions chosen at first, sends the one batch the
 * core makes, and reports what was done and what matched nothing.
 */
import type { BatchCommand, Command } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../i18n/LanguageProvider';
import type { CommandResult } from '../live/connection';
import { loadSample } from '../test/sample';
import { ImportControl } from './ImportControl';

const FLOWCHART = `flowchart LR
  shopper((Shopper)) --> web[Web shop]
  web --> stock[(Stock)]
  subgraph back [Back end]
    stock
  end
  click web "https://example.com"`;

interface Setup {
  send?: ReturnType<typeof vi.fn<(command: Command) => Promise<CommandResult>>>;
  connected?: boolean;
  language?: 'en' | 'es';
}

function renderControl({
  send = vi.fn<(command: Command) => Promise<CommandResult>>(() =>
    Promise.resolve({ ok: true, created: [], warnings: [] }),
  ),
  connected = true,
  language = 'en',
}: Setup = {}) {
  const openView = vi.fn<(id: string) => void>();
  render(
    <LanguageProvider language={language}>
      <ImportControl
        project={loadSample()}
        viewId="system-overview"
        send={connected ? send : undefined}
        openView={openView}
      />
    </LanguageProvider>,
  );
  return { send, openView };
}

const dialog = () => screen.getByRole('dialog');

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function paste(text: string, name?: string): void {
  fireEvent.click(screen.getByRole('button', { name: 'Import…' }));
  fireEvent.click(within(dialog()).getByRole('radio', { name: 'Pasted text' }));
  if (name !== undefined) {
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Name' }), {
      target: { value: name },
    });
  }
  fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Text' }), {
    target: { value: text },
  });
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Read' }));
}

describe('Import…', () => {
  it('waits for the connection before it opens', () => {
    renderControl({ connected: false });
    const button = screen.getByRole('button', { name: 'Import…' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reads pasted text and maps each kind, the suggestions chosen at first', () => {
    renderControl();
    paste(FLOWCHART, 'checkout.mmd');
    expect(within(dialog()).getByRole('heading', { name: 'Import “checkout.mmd”' })).toBeVisible();
    expect(dialog()).toHaveTextContent('It creates 4 elements, 3 relations and 1 view.');
    const cylinder = within(dialog()).getByRole('combobox', { name: 'Component for [( )]' });
    expect(cylinder).toHaveValue('systems.database');
    expect(within(dialog()).getByRole('combobox', { name: 'Relation type for -->' })).toHaveValue(
      'systems.communicates-with',
    );
    expect(
      within(dialog()).getByRole('combobox', { name: 'What sits inside what goes inside through' }),
    ).toHaveValue('systems.is-part-of');
    expect(within(dialog()).getByText('1 thing matched nothing')).toBeVisible();
    expect(dialog()).toHaveTextContent('Web addresses and callbacks are never followed.');
    expect(
      within(dialog()).getByRole('checkbox', { name: 'Create its view “checkout”' }),
    ).toBeChecked();
  });

  it('sends one batch with the choices made, then reports and opens the view it made', async () => {
    const { send, openView } = renderControl();
    paste(FLOWCHART, 'checkout.mmd');
    fireEvent.change(within(dialog()).getByRole('combobox', { name: 'Component for [( )]' }), {
      target: { value: 'systems.object-storage' },
    });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import' }));
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as BatchCommand;
    expect(command.type).toBe('batch');
    expect(command.label).toBe('Import "checkout.mmd"');
    const stock = command.commands.find(
      (each) => each.type === 'create-element' && each.element.name === 'Stock',
    );
    expect(stock?.type === 'create-element' && stock.element.component).toBe(
      'systems.object-storage',
    );
    expect(
      within(dialog()).getByRole('heading', { name: 'Imported “checkout.mmd”' }),
    ).toBeVisible();
    expect(dialog()).toHaveTextContent('It created 4 elements, 3 relations and 1 view.');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Open its view' }));
    expect(openView).toHaveBeenCalledWith(expect.stringMatching(/^checkout/));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('leaves the view out when asked', async () => {
    const { send } = renderControl();
    paste(FLOWCHART, 'checkout.mmd');
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Create its view “checkout”' }));
    expect(dialog()).toHaveTextContent('It creates 4 elements, 3 relations and 0 views.');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import' }));
    await settle();
    const command = send.mock.calls[0]?.[0] as BatchCommand;
    expect(command.commands.some((each) => each.type === 'create-view')).toBe(false);
  });

  it('says why it cannot read text, and why the local program refused', async () => {
    const send = vi.fn<(command: Command) => Promise<CommandResult>>(() =>
      Promise.resolve({ ok: false, problems: [{ code: 'invalid-command', message: 'No.' }] }),
    );
    renderControl({ send });
    paste('Just some words.');
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(
      'Visual Anything cannot tell what this file is: name its format.',
    );
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Text' }), {
      target: { value: 'name,component\nBilling,Service' },
    });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Read' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import' }));
    await settle();
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('No.');
  });

  it('reads a chosen file, and matches its rows by the column chosen', async () => {
    const { send } = renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Import…' }));
    const csv = new File(
      ['id,name,component\npatient,Patient (renamed),Person\nnew,Newcomer,Service\n'],
      'people.csv',
      {
        type: 'text/csv',
      },
    );
    fireEvent.change(within(dialog()).getByLabelText('File'), { target: { files: [csv] } });
    await settle();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Read' }));
    expect(dialog()).toHaveTextContent(
      'It creates 1 element, 0 relations and 0 views. It updates 1 element of the project.',
    );
    const key = within(dialog()).getByRole('combobox', {
      name: 'Match rows to the project’s elements by',
    });
    fireEvent.change(key, { target: { value: 'name' } });
    expect(dialog()).toHaveTextContent('It creates 2 elements');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import' }));
    await settle();
    expect((send.mock.calls[0]?.[0] as BatchCommand).label).toBe('Import "people.csv"');
  });

  it('reads in Spanish, keeping what the file writes', () => {
    renderControl({ language: 'es' });
    fireEvent.click(screen.getByRole('button', { name: 'Importar…' }));
    fireEvent.click(within(dialog()).getByRole('radio', { name: 'Texto pegado' }));
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Texto' }), {
      target: { value: FLOWCHART },
    });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Leer' }));
    expect(dialog()).toHaveTextContent('Crea 4 elementos, 3 relaciones y 1 vista.');
    expect(dialog()).toHaveTextContent('Las direcciones web y las llamadas nunca se siguen.');
    expect(within(dialog()).getByRole('combobox', { name: 'Componente para [( )]' })).toBeVisible();
  });
});
