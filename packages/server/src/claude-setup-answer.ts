/**
 * The app's "Connect Claude…" on the live connection (ADR 0093, section 3): `claude/setup` is
 * answered by the program itself, whether a project, the start screen or nothing is open, since it
 * touches no project. It runs what `setup-claude` runs, one request at a time, and answers with
 * `claude/setup-answer`.
 */
import { decodeAppMessage, ProtocolError } from '@visual-anything/core';
import type { ClaudeSetup } from './claude-setup';
import { errorReason } from './errors';
import type { SessionClient } from './session';

/** Why a program that was given no way to set Claude up refuses to. */
export const NO_CLAUDE_SETUP = 'This Visual Anything cannot set up Claude Desktop.';

/**
 * The request id of an app's `claude/setup`, or undefined for any other message, which goes to the
 * session as before. Only a message that names the type is decoded here, so that the rest, commands
 * included, are read once.
 */
export function claudeSetupAsked(text: string): string | undefined {
  if (!text.includes('"claude/setup"')) return undefined;
  try {
    const message = decodeAppMessage(text);
    return message.type === 'claude/setup' ? message.requestId : undefined;
  } catch (error) {
    if (error instanceof ProtocolError) return undefined;
    throw error;
  }
}

/** The last request's run, which the next one waits for, so that two never write at once. */
let running: Promise<unknown> = Promise.resolve();

/** Sets Claude up for an app, and answers it with what that came to. */
export async function answerClaudeSetup(
  client: SessionClient,
  requestId: string,
  setUp: (() => Promise<ClaudeSetup>) | undefined,
): Promise<void> {
  const refused = (why: string): ClaudeSetup => ({
    outcome: 'refused',
    entry: { command: '', args: [] },
    claudeCode: '',
    why,
  });
  const run = running.then(async (): Promise<ClaudeSetup> => {
    if (setUp === undefined) return refused(NO_CLAUDE_SETUP);
    try {
      return await setUp();
    } catch (error) {
      return refused(`Could not set up Claude Desktop: ${errorReason(error)}`);
    }
  });
  running = run.catch(() => undefined);
  const setup = await run;
  client.send({ type: 'claude/setup-answer', requestId, ...setup });
}
