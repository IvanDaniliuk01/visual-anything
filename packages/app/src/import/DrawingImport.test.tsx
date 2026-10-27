/**
 * Import…'s drawing step (ADR 0068): HTML goes to the local program, which makes the drawing; the
 * dialog shows it with what was dropped before anything changes, and sends the core's one action.
 */
import type { BatchCommand, Command, DrawingMadeMessage } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../i18n/LanguageProvider';
import type { CommandResult, LiveResult } from '../live/connection';
import { loadSample } from '../test/sample';
import { ImportControl } from './ImportControl';

const HTML = '<div class="card"><h2>Basic</h2><p>$10 a month</p><script>alert(1)</script></div>';
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><path d="M0 0h800v400H0z" fill="#FFFFFF"/></svg>';

type Make = (name: string, html: string, width: number) => Promise<LiveResult<DrawingMadeMessage>>;

function made(width: number): LiveResult<DrawingMadeMessage> {
  return {
    ok: true,
    answer: {
      type: 'drawing/made',
      requestId: 'r1',
      svg: SVG,
      width,
      height: width / 2,
      report: ['1 script element'],
    },
  };
}

function renderControl(
  options: { selectedElement?: string; language?: 'en' | 'es'; makeDrawing?: Make } = {},
) {
  const send = vi.fn<(command: Command) => Promise<CommandResult>>(() =>
    Promise.resolve({ ok: true, created: [], warnings: [] }),
  );
  const makeDrawing = vi.fn<Make>(
    options.makeDrawing ?? ((_name, _html, width) => Promise.resolve(made(width))),
  );
  render(
    <LanguageProvider language={options.language ?? 'en'}>
      <ImportControl
        project={loadSample()}
        viewId="system-overview"
        send={send}
        makeDrawing={makeDrawing}
        {...(options.selectedElement === undefined
          ? {}
          : { selectedElement: options.selectedElement })}
      />
    </LanguageProvider>,
  );
  return { send, makeDrawing };
}

const dialog = () => screen.getByRole('dialog');

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function pasteHtml(name: string, labels = { import: 'Import…', pasted: 'Pasted text' }) {
  fireEvent.click(screen.getByRole('button', { name: labels.import }));
  fireEvent.click(within(dialog()).getByRole('radio', { name: labels.pasted }));
  fireEvent.change(within(dialog()).getAllByRole('textbox')[0] as HTMLElement, {
    target: { value: name },
  });
  fireEvent.change(within(dialog()).getAllByRole('textbox')[1] as HTMLElement, {
    target: { value: HTML },
  });
  fireEvent.click(within(dialog()).getAllByRole('button').at(-1) as HTMLElement);
  await settle();
}

describe('Import… with HTML', () => {
  it('has the local program make the drawing, shows what it dropped, then imports it as one action', async () => {
    const { send, makeDrawing } = renderControl();
    await pasteHtml('card.html');
    expect(makeDrawing).toHaveBeenCalledWith('card.html', HTML, 800);
    expect(
      within(dialog()).getByRole('heading', { name: 'Import “card.html” as a drawing' }),
    ).toBeVisible();
    expect(dialog()).toHaveTextContent('800 × 400 pixels');
    expect(dialog()).toHaveTextContent('1 script element');
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import' }));
    await settle();
    const command = send.mock.calls[0]?.[0] as BatchCommand;
    expect(command.label).toBe('Import "card.html" as a drawing');
    expect(command.commands.at(-1)).toMatchObject({
      type: 'create-element',
      element: { component: 'systems.box', name: 'card' },
      inView: 'system-overview',
    });
    expect(
      within(dialog()).getByRole('heading', { name: 'Imported “card.html” as a drawing' }),
    ).toBeVisible();
  });

  it('makes the drawing again at the width asked for', async () => {
    const { makeDrawing } = renderControl();
    await pasteHtml('card.html');
    const width = within(dialog()).getByRole('spinbutton', { name: 'Width in pixels' });
    fireEvent.change(width, { target: { value: '400' } });
    fireEvent.blur(width);
    await settle();
    expect(makeDrawing).toHaveBeenLastCalledWith('card.html', HTML, 400);
    expect(dialog()).toHaveTextContent('400 × 200 pixels');
  });

  it('shows it on the selected element, when one is', async () => {
    const sample = loadSample();
    const element = sample.model.elements[0];
    if (element === undefined) throw new Error('The sample has no element.');
    const { send } = renderControl({ selectedElement: element.id });
    await pasteHtml('legend.html');
    expect(
      within(dialog()).getByRole('radio', { name: `The selected element “${element.name}”` }),
    ).toBeChecked();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import' }));
    await settle();
    const command = send.mock.calls[0]?.[0] as BatchCommand;
    expect(command.commands.at(-1)).toMatchObject({ type: 'update-element', id: element.id });
  });

  it('says why the drawing was not made, and imports nothing', async () => {
    const { send } = renderControl({
      makeDrawing: () =>
        Promise.resolve({
          ok: false,
          problems: [
            { code: 'image-too-large', message: 'The HTML nests elements over 128 deep.' },
          ],
        }),
    });
    await pasteHtml('deep.html');
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(
      'The HTML nests elements over 128 deep.',
    );
    expect(within(dialog()).getByRole('button', { name: 'Import' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('reads in Spanish, the report included', async () => {
    renderControl({ language: 'es' });
    await pasteHtml('card.html', { import: 'Importar…', pasted: 'Texto pegado' });
    expect(
      within(dialog()).getByRole('heading', { name: 'Importar “card.html” como dibujo' }),
    ).toBeVisible();
    expect(dialog()).toHaveTextContent('1 elemento script');
  });
});
