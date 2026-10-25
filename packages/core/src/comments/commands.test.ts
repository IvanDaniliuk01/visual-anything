import type { CommentFile } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { executeCommand, type Command, type CommandContext } from '../commands';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { testProject } from '../test/fixtures';
import { detachedThreads, isDetached } from './anchors';

const ANA = { kind: 'person', name: 'Ana', email: 'ana@example.com' } as const;
const BRUNO = { kind: 'person', name: 'Bruno' } as const;

/** 2026-10-25T14:03:00.000Z, and a minute later each time it is read. */
function clock(start = Date.UTC(2026, 9, 25, 14, 3)): () => number {
  let now = start - 60_000;
  return () => (now += 60_000);
}

let made = 0;
/** Sent by the person unless `more` says otherwise, as the local program says for every command. */
function context(more: CommandContext = {}): CommandContext {
  return { newId: (base) => `${base}-${(made += 1)}`, now: clock(), author: 'user', ...more };
}

function run(state: ProjectSnapshot, command: Command, more: CommandContext = {}) {
  return executeCommand(state, command, context(more));
}

function done(state: ProjectSnapshot, command: Command, more: CommandContext = {}) {
  const outcome = run(state, command, more);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome;
}

function refusal(state: ProjectSnapshot, command: Command, more: CommandContext = {}) {
  const outcome = run(state, command, more);
  if (outcome.ok) throw new Error(`Expected a refusal of ${command.type}.`);
  return outcome.problems;
}

/** A project with a thread by Ana on the API. */
function withThread(): { state: ProjectSnapshot; thread: CommentFile } {
  const outcome = done(testProject(), {
    type: 'create-thread',
    thread: {
      id: 'why-api',
      anchor: { kind: 'element', element: 'api' },
      comment: { id: 'first', text: 'Why does the API read the DB directly?', author: ANA },
    },
  });
  const thread = outcome.state.comments[0];
  if (!thread) throw new Error('No thread was made.');
  return { state: outcome.state, thread };
}

describe('who signs a comment', () => {
  it('is never assumed: a comment command whose sender is not said is refused', () => {
    const { state } = withThread();
    const unsaid: CommandContext = { newId: (base) => `${base}-${(made += 1)}`, now: clock() };
    const commands: Command[] = [
      {
        type: 'create-thread',
        thread: {
          anchor: { kind: 'element', element: 'db' },
          comment: { text: 'Hi', author: ANA },
        },
      },
      { type: 'add-comment', thread: 'why-api', comment: { text: 'Hi', author: ANA } },
      { type: 'edit-comment', thread: 'why-api', comment: 'first', text: 'Hi', author: ANA },
      {
        type: 'batch',
        label: 'Answer',
        commands: [{ type: 'add-comment', thread: 'why-api', comment: { text: 'Hi' } }],
      },
    ];
    for (const command of commands) {
      const outcome = executeCommand(state, command, unsaid);
      expect(outcome.ok ? [] : outcome.problems.map((each) => each.code)).toEqual([
        'invalid-command',
      ]);
    }
    // What signs nothing needs no sender.
    expect(
      executeCommand(state, { type: 'resolve-thread', thread: 'why-api', resolved: true }, unsaid)
        .ok,
    ).toBe(true);
  });
});

describe('create-thread', () => {
  it('starts a thread about an element with its first comment, signed and timed', () => {
    const outcome = done(testProject(), {
      type: 'create-thread',
      thread: {
        anchor: { kind: 'element', element: 'api' },
        comment: { text: '  Is 20 ms right?\r\n', author: ANA },
      },
    });
    expect(outcome.label).toBe('Comment on "API"');
    const [thread] = outcome.state.comments;
    const id = thread?.id ?? '';
    const commentId = thread?.comments[0]?.id ?? '';
    expect(id).toMatch(/^is-20-ms-right-\d+$/);
    expect(commentId).toMatch(/^comment-\d+$/);
    expect(thread).toEqual({
      id,
      anchor: { kind: 'element', element: 'api' },
      comments: [
        { id: commentId, author: ANA, time: '2026-10-25T14:03:00.000Z', text: 'Is 20 ms right?' },
      ],
    });
    expect(outcome.created).toEqual([thread?.id, thread?.comments[0]?.id]);
    expect(validateFile('comment', thread).ok).toBe(true);
  });

  it('anchors to a relation, a view and a point of a view', () => {
    const anchors = [
      [{ kind: 'relation', relation: 'api-reads-db' }, 'Comment on "api-reads-db"'],
      [{ kind: 'view', view: 'overview' }, 'Comment on the view "Overview"'],
      [
        { kind: 'point', view: 'overview', x: 120.5, y: -40 },
        'Comment on a point of the view "Overview"',
      ],
    ] as const;
    for (const [anchor, label] of anchors) {
      const outcome = done(testProject(), {
        type: 'create-thread',
        thread: { anchor, comment: { text: 'Here.', author: ANA } },
      });
      expect(outcome.label).toBe(label);
      expect(outcome.state.comments[0]?.anchor).toEqual(anchor);
    }
  });

  it('signs Claude’s comments as Claude, whatever the command says', () => {
    const outcome = done(
      testProject(),
      {
        type: 'create-thread',
        thread: { anchor: { kind: 'element', element: 'db' }, comment: { text: 'Noted.' } },
      },
      { author: 'claude' },
    );
    expect(outcome.state.comments[0]?.comments[0]?.author).toEqual({ kind: 'claude' });
    expect(
      refusal(
        testProject(),
        {
          type: 'create-thread',
          thread: {
            anchor: { kind: 'element', element: 'db' },
            comment: { text: 'As Ana.', author: ANA },
          },
        },
        { author: 'claude' },
      ),
    ).toMatchObject([{ code: 'invalid-author' }]);
  });

  it('needs the person’s name, and never lets them sign as Claude', () => {
    const anchor = { kind: 'element', element: 'db' } as const;
    expect(
      refusal(testProject(), {
        type: 'create-thread',
        thread: { anchor, comment: { text: 'Hi' } },
      }),
    ).toMatchObject([{ code: 'no-comment-author' }]);
    expect(
      refusal(testProject(), {
        type: 'create-thread',
        thread: { anchor, comment: { text: 'Hi', author: { kind: 'claude' } } },
      }),
    ).toMatchObject([{ code: 'invalid-author' }]);
  });

  it('refuses an anchor that is not there, World, and a point outside the canvas', () => {
    const comment = { text: 'Hi', author: ANA };
    const cases = [
      [{ kind: 'element', element: 'nothing' }, 'unknown-element'],
      [{ kind: 'element', element: 'world' }, 'world-not-allowed'],
      [{ kind: 'relation', relation: 'nothing' }, 'unknown-relation'],
      [{ kind: 'view', view: 'nowhere' }, 'unknown-view'],
      [{ kind: 'point', view: 'overview', x: 1e9, y: 0 }, 'invalid-command'],
      [{ kind: 'point', view: 'overview', x: Number.NaN, y: 0 }, 'invalid-command'],
      [{ kind: 'shape', id: 'note' }, 'invalid-command'],
      [null, 'invalid-command'],
    ] as const;
    for (const [anchor, code] of cases) {
      expect(
        refusal(testProject(), {
          type: 'create-thread',
          thread: { anchor: anchor as never, comment },
        }),
      ).toMatchObject([{ code }]);
    }
  });

  it('refuses text a comment cannot hold', () => {
    const anchor = { kind: 'view', view: 'overview' } as const;
    for (const text of ['   ', 'x'.repeat(20_001), 'a\u0000b', 7]) {
      expect(
        refusal(testProject(), {
          type: 'create-thread',
          thread: { anchor, comment: { text: text as string, author: ANA } },
        }),
      ).toMatchObject([{ code: 'invalid-comment' }]);
    }
  });

  it('keeps only what an anchor has, so nothing else reaches the file', () => {
    const anchor = JSON.parse(
      '{"kind":"point","view":"overview","x":1,"y":2,"__proto__":{"bad":1},"extra":"<script>"}',
    ) as never;
    const outcome = done(testProject(), {
      type: 'create-thread',
      thread: { anchor, comment: { text: 'Hi', author: ANA } },
    });
    expect(outcome.state.comments[0]?.anchor).toEqual({
      kind: 'point',
      view: 'overview',
      x: 1,
      y: 2,
    });
    expect(validateFile('comment', outcome.state.comments[0]).ok).toBe(true);
  });

  it('warns about mentions of what the model does not hold', () => {
    const outcome = done(testProject(), {
      type: 'create-thread',
      thread: {
        anchor: { kind: 'element', element: 'api' },
        comment: { text: 'Like @[db] and @[gone].', author: ANA },
      },
    });
    expect(outcome.warnings).toMatchObject([
      {
        code: 'unknown-mention',
        message: 'The comment mentions "gone", which is no element or relation of the model.',
      },
    ]);
  });

  it('gives a thread an id nothing else has, and refuses one taken', () => {
    const { state } = withThread();
    expect(
      refusal(state, {
        type: 'create-thread',
        thread: {
          id: 'api',
          anchor: { kind: 'element', element: 'db' },
          comment: { text: 'x', author: ANA },
        },
      }),
    ).toMatchObject([{ code: 'id-taken' }]);
    expect(
      refusal(state, {
        type: 'create-thread',
        thread: {
          id: 'why-api',
          anchor: { kind: 'element', element: 'db' },
          comment: { text: 'x', author: ANA },
        },
      }),
    ).toMatchObject([{ code: 'id-taken' }]);
    // Nothing new takes the id of a thread.
    expect(
      refusal(state, {
        type: 'create-element',
        element: { id: 'why-api', component: 'test.box', name: 'X' },
      }),
    ).toMatchObject([{ code: 'id-taken' }]);
  });
});

describe('add-comment', () => {
  it('adds a reply, signed and timed', () => {
    const { state } = withThread();
    const outcome = done(state, {
      type: 'add-comment',
      thread: 'why-api',
      comment: { text: 'For speed.', author: BRUNO },
    });
    expect(outcome.label).toBe('Reply to the thread on "API"');
    expect(outcome.state.comments[0]?.comments.map((each) => [each.author, each.text])).toEqual([
      [ANA, 'Why does the API read the DB directly?'],
      [BRUNO, 'For speed.'],
    ]);
  });

  it('opens a resolved thread again', () => {
    const resolved = done(withThread().state, {
      type: 'resolve-thread',
      thread: 'why-api',
      resolved: true,
    }).state;
    const outcome = done(
      resolved,
      { type: 'add-comment', thread: 'why-api', comment: { text: 'One more thing.' } },
      { author: 'claude' },
    );
    expect(outcome.state.comments[0]?.resolved).toBeUndefined();
  });

  it('refuses a thread that is not there, and a thread already full', () => {
    const { state, thread } = withThread();
    expect(
      refusal(state, { type: 'add-comment', thread: 'nope', comment: { text: 'x', author: ANA } }),
    ).toMatchObject([{ code: 'unknown-thread' }]);
    const full: ProjectSnapshot = {
      ...state,
      comments: [
        {
          ...thread,
          comments: Array.from({ length: 1000 }, (_, at) => ({
            ...(thread.comments[0] as CommentFile['comments'][number]),
            id: `c${at}`,
          })),
        },
      ],
    };
    expect(
      refusal(full, {
        type: 'add-comment',
        thread: 'why-api',
        comment: { text: 'x', author: ANA },
      }),
    ).toMatchObject([{ code: 'invalid-comment' }]);
  });

  it('answers a detached thread too', () => {
    const { state } = withThread();
    const deleted = done(state, { type: 'delete', elements: ['api'] }).state;
    const outcome = done(deleted, {
      type: 'add-comment',
      thread: 'why-api',
      comment: { text: 'The API is gone.', author: ANA },
    });
    expect(outcome.label).toBe('Reply to the thread on "api"');
  });
});

describe('edit-comment', () => {
  it('changes one’s own comment and says when', () => {
    const { state } = withThread();
    const outcome = done(state, {
      type: 'edit-comment',
      thread: 'why-api',
      comment: 'first',
      text: 'Why does the API read the DB?',
      author: { kind: 'person', name: 'Ana Pérez', email: 'ANA@example.com' },
    });
    expect(outcome.label).toBe('Edit a comment on "API"');
    expect(outcome.state.comments[0]?.comments[0]).toMatchObject({
      author: ANA,
      text: 'Why does the API read the DB?',
      time: '2026-10-25T14:03:00.000Z',
      edited: '2026-10-25T14:03:00.000Z',
    });
  });

  it('refuses someone else’s comment, Claude’s included', () => {
    const { state } = withThread();
    const edit = {
      type: 'edit-comment',
      thread: 'why-api',
      comment: 'first',
      text: 'Mine now.',
    } as const;
    expect(refusal(state, { ...edit, author: BRUNO })).toMatchObject([
      { code: 'not-your-comment' },
    ]);
    expect(refusal(state, edit, { author: 'claude' })).toMatchObject([
      { code: 'not-your-comment' },
    ]);
    const claude = done(
      state,
      { type: 'add-comment', thread: 'why-api', comment: { id: 'answer', text: 'Speed.' } },
      { author: 'claude' },
    ).state;
    expect(refusal(claude, { ...edit, comment: 'answer', author: ANA })).toMatchObject([
      { code: 'not-your-comment' },
    ]);
    expect(done(claude, { ...edit, comment: 'answer' }, { author: 'claude' }).ok).toBe(true);
  });

  it('changes nothing when the text is the same', () => {
    const { state } = withThread();
    const outcome = done(state, {
      type: 'edit-comment',
      thread: 'why-api',
      comment: 'first',
      text: 'Why does the API read the DB directly?  ',
      author: ANA,
    });
    expect(outcome.operations).toEqual([]);
  });

  it('refuses a comment that is not there', () => {
    const { state } = withThread();
    expect(
      refusal(state, {
        type: 'edit-comment',
        thread: 'why-api',
        comment: 'nope',
        text: 'x',
        author: ANA,
      }),
    ).toMatchObject([{ code: 'unknown-comment' }]);
  });
});

describe('resolve-thread and delete-thread', () => {
  it('resolve a thread and open it again, each one action', () => {
    const { state } = withThread();
    const resolved = done(state, { type: 'resolve-thread', thread: 'why-api', resolved: true });
    expect(resolved.label).toBe('Resolve the thread on "API"');
    expect(resolved.state.comments[0]?.resolved).toBe(true);
    const again = done(resolved.state, {
      type: 'resolve-thread',
      thread: 'why-api',
      resolved: true,
    });
    expect(again.operations).toEqual([]);
    const reopened = done(resolved.state, {
      type: 'resolve-thread',
      thread: 'why-api',
      resolved: false,
    });
    expect(reopened.label).toBe('Reopen the thread on "API"');
    expect(reopened.state.comments[0]).not.toHaveProperty('resolved');
    expect(
      refusal(state, { type: 'resolve-thread', thread: 'why-api', resolved: 'yes' as never }),
    ).toMatchObject([{ code: 'invalid-command' }]);
  });

  it('delete a thread, and undo brings it back', () => {
    const { state } = withThread();
    const outcome = done(state, { type: 'delete-thread', thread: 'why-api' }, { author: 'claude' });
    expect(outcome.label).toBe('Delete the thread on "API"');
    expect(outcome.state.comments).toEqual([]);
    expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(state);
  });
});

describe('detached threads', () => {
  it('are kept when what they are about is deleted, and attach again on undo', () => {
    const { state } = withThread();
    const outcome = done(state, { type: 'delete', elements: ['api'] });
    expect(outcome.state.comments).toEqual(state.comments);
    expect(detachedThreads(outcome.state).map((thread) => thread.id)).toEqual(['why-api']);
    const undone = applyOperations(outcome.state, outcome.inverse).state;
    expect(detachedThreads(undone)).toEqual([]);
  });

  it('include threads on a deleted view and its points', () => {
    // No scenario plays over the view, so that it can be deleted.
    let state: ProjectSnapshot = { ...testProject(), scenarios: [] };
    for (const anchor of [
      { kind: 'view', view: 'overview' },
      { kind: 'point', view: 'overview', x: 0, y: 0 },
    ] as const) {
      state = done(state, {
        type: 'create-thread',
        thread: { anchor, comment: { text: 'Hi', author: ANA } },
      }).state;
    }
    const deleted = done(state, { type: 'delete-view', id: 'overview' }).state;
    expect(deleted.comments.every((thread) => isDetached(deleted, thread))).toBe(true);
  });

  it('never let something new take the id of what they were about', () => {
    const { state } = withThread();
    const deleted = done(state, { type: 'delete', elements: ['api'] }).state;
    expect(
      refusal(deleted, {
        type: 'create-element',
        element: { id: 'api', component: 'test.service', name: 'Another API' },
      }),
    ).toMatchObject([{ code: 'id-taken' }]);
  });
});

describe('a project’s threads, checked', () => {
  it('may be detached, but may not repeat a thread’s or a comment’s id', () => {
    const { state, thread } = withThread();
    const comment = thread.comments[0] as CommentFile['comments'][number];
    expect(
      checkProject({
        ...state,
        comments: [{ ...thread, anchor: { kind: 'element', element: 'gone' } }],
      }).errors,
    ).toEqual([]);
    expect(checkProject({ ...state, comments: [thread, thread] }).errors).toMatchObject([
      { code: 'id-taken', message: 'More than one thread has the id "why-api".' },
    ]);
    expect(
      checkProject({ ...state, comments: [{ ...thread, comments: [comment, comment] }] }).errors,
    ).toMatchObject([
      {
        code: 'id-taken',
        message: 'More than one comment in the thread "why-api" has the id "first".',
      },
    ]);
  });
});
