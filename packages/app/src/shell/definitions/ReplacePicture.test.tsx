/**
 * Replace the picture… (ADR 0067): the new picture is cleaned, the anchored parts it would lose are
 * listed with the elements drawn as them before anything is sent, and the replacement keeps the
 * image's id, as one action.
 */
import type { Command } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { beyondBoxes, ORGANS_ID } from '../../test/beyond';
import { ReplacePicture } from './ReplacePicture';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

function renderReplace(image = ORGANS_ID) {
  const send = vi.fn<(command: Command) => Promise<boolean>>(() => Promise.resolve(true));
  render(<ReplacePicture project={beyondBoxes()} image={image} disabled={false} send={send} />);
  return { send };
}

/** Chooses a file, then lets it be read. */
async function choose(svg: string): Promise<void> {
  const input = screen.getByLabelText('Replace the picture of “Organs”', { selector: 'input' });
  const file = new File([svg], 'Organs.svg', { type: 'image/svg+xml' });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
    for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('Replace the picture…', () => {
  it('lists the anchored parts the new picture would lose, with their elements, before it applies', async () => {
    const { send } = renderReplace();
    await choose(`<svg viewBox="0 0 100 100" ${NS}><path id="left" d="M0 0h50v50h-50z"/></svg>`);
    const dialog = screen.getByRole('dialog', { name: 'Replace the picture of “Organs”?' });
    expect(dialog.textContent).toContain(
      'The new picture lacks 2 parts that elements are drawn as.',
    );
    const items = within(dialog)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items).toEqual(['“right”, drawn as “right”', '“ring”, drawn as “loose”']);
    expect(send).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Replace' }));
      await Promise.resolve();
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      type: 'define-image',
      package: 'anatomy',
      image: { id: ORGANS_ID, name: 'Organs' },
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('replaces at once a picture that keeps every anchored part, and sends nothing when cancelled', async () => {
    const { send } = renderReplace();
    await choose(
      `<svg viewBox="0 0 300 100" ${NS}><path id="left" d="M0 0h50v50h-50z"/><path id="right" d="M60 0h50v50h-50z"/><path id="ring" d="M120 0h50v50h-50z"/></svg>`,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    send.mockClear();
    await choose(`<svg viewBox="0 0 10 10" ${NS}><path d="M0 0h5v5z"/></svg>`);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('is not offered for an image no package of the project’s own defines', () => {
    renderReplace('anatomy.nothing');
    expect(screen.queryByRole('button', { name: 'Replace the picture…' })).toBeNull();
  });
});
