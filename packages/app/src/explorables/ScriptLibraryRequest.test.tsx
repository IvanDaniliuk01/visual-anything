/**
 * Asking for a script library from the Components tab (ADR 0107): the form reads the npm package and
 * its exact version, shows the registry's two addresses before anything is fetched, and then what
 * was kept, or why not.
 */
import type { ScriptLibraryAsk, ScriptLibraryKeptMessage } from '@visual-anything/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import type { LiveResult } from '../live/connection';
import { LiveContext } from '../live/context';
import { Shell } from '../shell/Shell';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';
import { readScriptLibraryAsk } from './script-library-ask';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

afterEach(cleanup);

const project = loadSample();

const KEPT: ScriptLibraryKeptMessage = {
  type: 'script-library/kept',
  requestId: 'r-1',
  library: {
    id: 'clinic.d3',
    npm: 'd3',
    version: '7.9.0',
    tarball: 'https://registry.npmjs.org/d3/-/d3-7.9.0.tgz',
    integrity: `sha512-${'A'.repeat(86)}==`,
    path: 'dist/d3.min.js',
    license: 'ISC',
    global: 'd3',
    hash: 'a'.repeat(64),
    bytes: 280 * 1024,
  },
};

function openForm(answer: LiveResult<ScriptLibraryKeptMessage> = { ok: true, answer: KEPT }) {
  const fetchScriptLibrary = vi.fn<(ask: ScriptLibraryAsk) => Promise<typeof answer>>(() =>
    Promise.resolve(answer),
  );
  const onCommand = vi.fn<SendCommand>(() =>
    Promise.resolve({ ok: true, created: [], warnings: [] }),
  );
  render(
    <LiveContext value={fakeLive({ project, fetchScriptLibrary })}>
      <Shell project={project} onCommand={onCommand} />
    </LiveContext>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Components' }));
  fireEvent.click(screen.getByText('Ask for a script library…'));
  const form = screen.getByText('Ask for a script library…').closest('details') as HTMLElement;
  return { fetchScriptLibrary, form };
}

describe('asking for a script library from the app', () => {
  it('shows the registry’s addresses first, fetches on approval, then says what was kept', async () => {
    const { fetchScriptLibrary, form } = openForm();
    fireEvent.change(within(form).getByRole('textbox', { name: 'npm package' }), {
      target: { value: 'd3' },
    });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Exact version' }), {
      target: { value: '7.9.0' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Fetch…' }));
    const asking = screen.getByRole('alertdialog', { name: 'Fetch a script library?' });
    expect(asking).toHaveTextContent('https://registry.npmjs.org/d3/7.9.0');
    expect(asking).toHaveTextContent('https://registry.npmjs.org/d3/-/d3-7.9.0.tgz');
    expect(fetchScriptLibrary).not.toHaveBeenCalled();
    fireEvent.click(within(asking).getByRole('button', { name: 'Fetch' }));
    expect(fetchScriptLibrary).toHaveBeenCalledWith({
      package: 'clinic',
      npm: 'd3',
      version: '7.9.0',
    });
    const done = await screen.findByText('Kept beside the project: 280 KiB, license ISC.');
    fireEvent.click(within(done.closest('[role="dialog"]') as HTMLElement).getByRole('button'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says why nothing was kept', async () => {
    const { form } = openForm({
      ok: false,
      problems: [{ code: 'invalid-command', message: 'The registry has no such version.' }],
    });
    fireEvent.change(within(form).getByRole('textbox', { name: 'npm package' }), {
      target: { value: 'd3' },
    });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Exact version' }), {
      target: { value: '9.9.9' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Fetch…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(
      await screen.findByText('Nothing was kept: The registry has no such version.'),
    ).toBeTruthy();
  });

  it('refuses a range or a name the registry does not take, before asking anything', () => {
    const { fetchScriptLibrary, form } = openForm();
    fireEvent.change(within(form).getByRole('textbox', { name: 'npm package' }), {
      target: { value: 'D3 js' },
    });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Exact version' }), {
      target: { value: '^7' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Fetch…' }));
    const alert = within(form).getByRole('alert');
    expect(alert).toHaveTextContent('Name an npm package as the registry writes it');
    expect(alert).toHaveTextContent('Give one exact version');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fetchScriptLibrary).not.toHaveBeenCalled();
  });
});

describe('readScriptLibraryAsk', () => {
  it('keeps the file and the global only when given, trimmed', () => {
    expect(
      readScriptLibraryAsk({
        package: 'p',
        npm: ' @scope/name ',
        version: '1.2.3-beta.1',
        path: ' dist/x.js ',
        global: 'X',
      }),
    ).toEqual({
      ok: true,
      ask: {
        package: 'p',
        npm: '@scope/name',
        version: '1.2.3-beta.1',
        path: 'dist/x.js',
        global: 'X',
      },
    });
    expect(
      readScriptLibraryAsk({
        package: undefined,
        npm: 'd3',
        version: '1.0.0',
        path: '',
        global: '',
      }).ok,
    ).toBe(false);
    expect(
      readScriptLibraryAsk({ package: 'p', npm: 'd3', version: 'latest', path: '', global: '' }).ok,
    ).toBe(false);
    expect(
      readScriptLibraryAsk({ package: 'p', npm: 'd3', version: '1.0.0', path: '', global: '1x' })
        .ok,
    ).toBe(false);
  });
});
