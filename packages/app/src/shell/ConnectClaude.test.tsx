/**
 * "Connect Claude…" in the header's menu (ADR 0093): the dialog says what connecting does, asks the
 * program only once the person confirms, and says what the program did, with the commands to copy.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ClaudeSetupAnswerMessage } from '@visual-anything/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveResult } from '../live/connection';
import { LiveContext, type Live } from '../live/context';
import { fakeLive } from '../test/fakeLive';
import { resetPreferencesForTests } from '../theme/store';
import { ConnectClaudeDialog } from './ConnectClaude';
import { Header } from './Header';

afterEach(() => {
  resetPreferencesForTests();
});

const EXE = 'C:/Users/ada/visual-anything-windows-x64.exe';
const CODE = `claude mcp add visual-anything -- ${EXE} mcp`;

function answer(more: Partial<ClaudeSetupAnswerMessage>): ClaudeSetupAnswerMessage {
  return {
    type: 'claude/setup-answer',
    requestId: 'r1',
    outcome: 'written',
    config: 'C:/Users/ada/AppData/Roaming/Claude/claude_desktop_config.json',
    entry: { command: EXE, args: ['mcp'] },
    claudeCode: CODE,
    ...more,
  };
}

function liveAnswering(result: ClaudeSetupAnswerMessage): Live {
  return fakeLive({
    setUpClaude: vi.fn<NonNullable<Live['setUpClaude']>>(() =>
      Promise.resolve<LiveResult<ClaudeSetupAnswerMessage>>({ ok: true, answer: result }),
    ),
  });
}

function renderDialog(live: Live, writeText = vi.fn(() => Promise.resolve())) {
  const onClose = vi.fn();
  render(
    <LiveContext value={live}>
      <ConnectClaudeDialog onClose={onClose} writeText={writeText} />
    </LiveContext>,
  );
  return { onClose, writeText };
}

async function confirm(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Connect Claude Desktop' }));
    await Promise.resolve();
  });
}

describe('Connect Claude…', () => {
  it('is in the header’s menu while the program is connected, and opens the dialog', () => {
    render(
      <LiveContext value={liveAnswering(answer({}))}>
        <Header projectName="My systems" />
      </LiveContext>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect Claude…' }));
    expect(screen.getByRole('dialog', { name: 'Connect Claude' })).toBeTruthy();
  });

  it('is not in the menu without a program to ask', () => {
    render(
      <LiveContext value={null}>
        <Header projectName="My systems" />
      </LiveContext>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.queryByRole('button', { name: 'Connect Claude…' })).toBeNull();
  });

  it('asks nothing until the person confirms, and Cancel has the focus first', () => {
    const live = liveAnswering(answer({}));
    const { onClose } = renderDialog(live);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(/restart Claude Desktop/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(live.setUpClaude).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('says what was written, where the copy is, to restart Claude Desktop, and copies Claude Code’s command', async () => {
    const backup = 'C:/Users/ada/AppData/Roaming/Claude/claude_desktop_config.json.bak';
    const live = liveAnswering(answer({ backup }));
    const { writeText } = renderDialog(live);
    await confirm();
    expect(live.setUpClaude).toHaveBeenCalledOnce();
    expect(
      screen.getByText('Visual Anything is now in Claude Desktop’s configuration.'),
    ).toBeTruthy();
    expect(screen.getByText(`The file as it was is kept in ${backup}.`)).toBeTruthy();
    expect(screen.getByText(/^Restart Claude Desktop to use it/)).toBeTruthy();
    expect(screen.getByText(CODE)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Claude Code’s command' }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(CODE);
  });

  it('says when Visual Anything was there already', async () => {
    renderDialog(liveAnswering(answer({ outcome: 'already' })));
    await confirm();
    expect(
      screen.getByText(
        'Claude Desktop’s configuration already has Visual Anything: nothing was changed.',
      ),
    ).toBeTruthy();
  });

  it('from the sources, gives the entry to copy', async () => {
    const entry = {
      command: 'C:/node/node.exe',
      args: ['C:/repo/node_modules/tsx/dist/cli.mjs', 'C:/repo/packages/server/src/mcp-cli.ts'],
      env: { TSX_TSCONFIG_PATH: 'C:/repo/packages/server/tsconfig.json' },
    };
    const { writeText } = renderDialog(
      liveAnswering(answer({ outcome: 'from-sources', entry, claudeCode: 'claude mcp add x' })),
    );
    await confirm();
    expect(screen.getByText(/runs from its sources, so nothing was written/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Claude Desktop’s entry' }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ 'visual-anything': entry }, null, 2));
  });

  it('says why it was refused', async () => {
    const why = 'Claude Desktop’s configuration is not a JSON object, so nothing was changed.';
    renderDialog(liveAnswering(answer({ outcome: 'refused', why })));
    await confirm();
    expect(screen.getByRole('alert').textContent).toBe(why);
  });

  it('says when the copy failed', async () => {
    renderDialog(
      liveAnswering(answer({})),
      vi.fn(() => Promise.reject(new Error('no'))),
    );
    await confirm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Claude Code’s command' }));
      await Promise.resolve();
    });
    expect(screen.getByRole('alert').textContent).toBe(
      'Could not copy: select the text and copy it by hand.',
    );
  });
});
