/**
 * The gate before a change of Claude's that takes more than it names (ADR-0029): each delete in a
 * batch is previewed over the project the commands before it leave, those commands run as Claude's,
 * as the real run signs them, so that a comment command before a delete cannot hide its cascade.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSession, type Session } from '../session';
import { testProject, writeProjectFolder } from '../test-support';
import type { Program } from './bridge';
import { cascadeOf, takesMore } from './cascade';
import { TOOLS, runTool } from './tools';

const THREAD: Command = {
  type: 'create-thread',
  thread: {
    id: 'db-question',
    anchor: { kind: 'element', element: 'db' },
    comment: { text: 'Is this the DB?' },
  },
};
const DELETE_API: Command = { type: 'delete', elements: ['api'] };
const TAKEN = ['api-in-system', 'customer-calls-api', 'api-reads-db'];

describe('cascadeOf', () => {
  it('previews a delete after a comment command in a batch, as Claude’s run would make it', () => {
    const alone = cascadeOf(testProject(), {
      type: 'batch',
      label: 'Remove the API',
      commands: [DELETE_API],
    });
    const after = cascadeOf(testProject(), {
      type: 'batch',
      label: 'Note it, then remove the API',
      commands: [
        THREAD,
        { type: 'add-comment', thread: 'db-question', comment: { text: 'Yes.' } },
        { type: 'resolve-thread', thread: 'db-question', resolved: true },
        DELETE_API,
      ],
    });
    expect(alone.cascaded).toEqual(TAKEN);
    expect(after).toEqual(alone);
    expect(takesMore(after)).toBe(true);
  });
});

describe('run_commands', () => {
  let folder: string;
  let session: Session;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'va-cascade-'));
    await writeProjectFolder(folder, testProject());
    const result = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
    if (!result.ok) throw new Error('The test project does not open.');
    session = result.session;
  });

  afterEach(async () => {
    await session.close();
    await rm(folder, { recursive: true, force: true, maxRetries: 10 });
  });

  /** Runs a tool as Claude does, its commands signed as Claude's. */
  async function call(name: string, args: unknown) {
    const definition = TOOLS.find((each) => each.name === name);
    if (!definition) throw new Error(`There is no tool ${name}.`);
    const program: Program = {
      project: () => Promise.resolve(session.snapshot),
      execute: async (command: Command) => {
        const outcome = await session.execute(command, 'claude');
        return outcome.ok
          ? {
              ok: true,
              label: outcome.label,
              changed: outcome.recorded,
              created: outcome.created,
              warnings: outcome.warnings,
            }
          : { ok: false, problems: outcome.problems };
      },
      guide: (guidance) => session.guide(guidance),
      openApp: () => Promise.resolve(),
    };
    return runTool(definition, args, program);
  }

  it('refuses a delete that cascades after a comment command until told it may', async () => {
    const commands = [THREAD, DELETE_API];
    const refused = await call('run_commands', { label: 'Note it, then remove the API', commands });
    expect(refused.ok ? '' : refused.message).toBe(
      `Nothing was done: this would also delete 3 relation(s) that end on what the commands delete (${TAKEN.join(', ')}) and mark 2 scenario step(s) broken. Tell the person, then call again with cascade: true.`,
    );
    expect(session.snapshot.comments).toEqual([]);
    expect(session.snapshot.model.elements.some((each) => each.id === 'api')).toBe(true);

    const done = await call('run_commands', {
      label: 'Note it, then remove the API',
      commands,
      cascade: true,
    });
    expect(done.ok).toBe(true);
    expect(session.snapshot.comments[0]?.comments[0]?.author).toEqual({ kind: 'claude' });
    expect(session.snapshot.model.elements.some((each) => each.id === 'api')).toBe(false);
  });
});
