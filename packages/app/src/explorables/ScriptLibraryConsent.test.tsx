/**
 * The consent before a script library is fetched (ADR 0107): who asks, the package and its version,
 * the registry's two addresses; and, when the change touches a library approved explorables use, the
 * list of them and that they stay approved (A10's review), read from the optional field the core's
 * request carries for it.
 */
import { registryAddresses, type ScriptLibraryConsentMessage } from '@visual-anything/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveContext, type Live } from '../live/context';
import { affectedExplorables } from './affected-explorables';
import { ScriptLibraryConsent } from './ScriptLibraryConsent';

afterEach(cleanup);

const ASKED: ScriptLibraryConsentMessage = {
  type: 'script-library/consent',
  requestId: 'r1',
  asker: 'claude',
  package: 'quadratic',
  npm: 'd3',
  version: '7.9.0',
  ...registryAddresses('d3', '7.9.0'),
};

function shown(asked: ScriptLibraryConsentMessage) {
  const answer = vi.fn();
  const live = {
    scriptLibraryConsents: [asked],
    scriptLibraryOutcomes: [],
    answerScriptLibraryConsent: answer,
  } as unknown as Live;
  render(
    <LiveContext value={live}>
      <ScriptLibraryConsent />
    </LiveContext>,
  );
  return { answer, dialog: screen.getByRole('alertdialog') };
}

describe('the consent to fetch a script library', () => {
  it('names who asks, the package, the version and the two addresses, and lists nothing else', () => {
    const { answer, dialog } = shown(ASKED);
    expect(dialog.textContent).toContain('Claude asks for a script library');
    expect(dialog.textContent).toContain('d3, version 7.9.0');
    expect(dialog.textContent).toContain(ASKED.tarball);
    expect(dialog.textContent).not.toContain('stay approved');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fetch' }));
    expect(answer).toHaveBeenCalledWith('r1', true);
  });

  it('lists the approved explorables the change affects, and says they stay approved', () => {
    const { dialog } = shown({
      ...ASKED,
      approvedExplorables: [{ id: 'quadratic.parabola', name: 'Parabola' }, 'quadratic.roots'],
    } as ScriptLibraryConsentMessage);
    expect(dialog.textContent).toContain(
      'It changes the script library of 2 approved explorables, which stay approved:',
    );
    const items = within(dialog)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items).toEqual(expect.arrayContaining(['Parabola', 'quadratic.roots']));
  });

  it('reads only ids and names from the field, passing over anything else', () => {
    const read = (approvedExplorables: unknown) =>
      affectedExplorables({ ...ASKED, approvedExplorables } as ScriptLibraryConsentMessage);
    expect(read(undefined)).toEqual([]);
    expect(read('quadratic.parabola')).toEqual([]);
    expect(
      read([{ explorable: 'a.b' }, 7, null, { name: 'No id' }, { id: 'c.d', name: '' }]),
    ).toEqual([
      { id: 'a.b', name: 'a.b' },
      { id: 'c.d', name: 'c.d' },
    ]);
  });
});
