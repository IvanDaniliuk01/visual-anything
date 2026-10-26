/**
 * Who signs a comment, end to end (ADR 0059): the session hands the core the sender it knows, so that
 * a comment sent through Claude's endpoint is Claude's whatever it says, a comment from the app is the
 * person's, and both are dated by the program's clock and kept in a file of their own.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command, CommandRejectedMessage } from '@visual-anything/core';
import type { CommentFile } from '@visual-anything/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachClaude } from './claude/endpoint';
import type { ProgramMessage as ClaudeAnswer } from './claude/messages';
import { openSession, type Session } from './session';
import { FakeClient, filesIn, testProject, writeProjectFolder } from './test-support';

const ANA = { kind: 'person', name: 'Ana', email: 'ana@example.com' } as const;
const AT = Date.UTC(2026, 9, 25, 14, 3);

let folder: string;
let session: Session;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-session-comments-'));
  await writeProjectFolder(folder, testProject());
  let made = 0;
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    now: () => AT,
    newId: (base) => `${base}-${(made += 1)}`,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  session = result.session;
});

afterEach(async () => {
  await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

function thread(author?: typeof ANA): Command {
  return {
    type: 'create-thread',
    thread: {
      id: 'why',
      anchor: { kind: 'element', element: 'api' },
      comment: { id: 'first', text: 'Why?', ...(author ? { author } : {}) },
    },
  };
}

/** Sends a command through Claude's endpoint, as Claude's MCP server does, and gives the answers. */
async function asClaude(command: Command): Promise<ClaudeAnswer[]> {
  const answers: ClaudeAnswer[] = [];
  const claude = attachClaude(session, (message) => answers.push(message));
  await claude.receive(JSON.stringify({ type: 'command', requestId: 'r1', command }));
  claude.detach();
  return answers;
}

async function savedThread(): Promise<CommentFile> {
  const file = (await filesIn(folder)).get('comments/why.vacomment');
  if (!file) throw new Error('No thread was saved.');
  return JSON.parse(file.toString('utf8')) as CommentFile;
}

describe('a comment', () => {
  it('sent through Claude’s endpoint is stored as Claude’s', async () => {
    const answers = await asClaude(thread());
    expect(answers.map((each) => each.type)).toContain('project/changed');
    expect(session.snapshot.comments[0]?.comments[0]?.author).toEqual({ kind: 'claude' });
    expect((await savedThread()).comments[0]).toEqual({
      id: 'first',
      author: { kind: 'claude' },
      time: '2026-10-25T14:03:00.000Z',
      text: 'Why?',
    });
    expect(session.actions.at(-1)).toMatchObject({ label: 'Comment on "API"', author: 'claude' });
  });

  it('sent through Claude’s endpoint in the person’s name is refused, and nothing is saved', async () => {
    const answers = await asClaude(thread(ANA));
    const refused = answers.find(
      (each): each is CommandRejectedMessage => each.type === 'command/rejected',
    );
    expect(refused?.problems.map((each) => each.code)).toEqual(['invalid-author']);
    expect(session.snapshot.comments).toEqual([]);
    expect([...(await filesIn(folder)).keys()].some((path) => path.startsWith('comments/'))).toBe(
      false,
    );
  });

  it('sent from the app is the person’s, as the app names them', async () => {
    const app = new FakeClient();
    session.connect(app);
    await session.receive(
      app,
      JSON.stringify({ type: 'command', requestId: 'c1', command: thread(ANA) }),
    );
    expect((await savedThread()).comments[0]?.author).toEqual(ANA);
    expect(session.actions.at(-1)).toMatchObject({ author: 'user' });
  });

  it('sent from the app as Claude is refused', async () => {
    const outcome = await session.execute(
      {
        type: 'add-comment',
        thread: 'nothing',
        comment: { text: 'x', author: { kind: 'claude' } },
      },
      'user',
    );
    expect(outcome.ok).toBe(false);
    const signed = await session.execute(
      {
        type: 'create-thread',
        thread: {
          anchor: { kind: 'view', view: 'overview' },
          comment: { text: 'x', author: { kind: 'claude' } },
        },
      },
      'user',
    );
    expect(signed.ok ? [] : signed.problems.map((each) => each.code)).toEqual(['invalid-author']);
  });
});
