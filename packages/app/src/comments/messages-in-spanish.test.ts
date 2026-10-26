/**
 * What the core's comment commands say, through the Spanish templates (ADR 0038, ADR 0059): every
 * label, refusal and warning, the person's commands and Claude's, with what people wrote kept as it
 * was written.
 */
import {
  checkProject,
  executeCommand,
  type Author,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { CommentFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { translateMessage, untranslatedParts } from '../i18n/translate';
import { loadSample } from '../test/sample';

const sample = loadSample();
const VIEW = 'system-overview';
const ANA = { kind: 'person', name: 'Ana' } as const;
const BRUNO = { kind: 'person', name: 'Bruno' } as const;

/** Commands written by hand, as Claude's can be; their types say nothing of them. */
const hand = (command: unknown) => command as Command;

/** Each command, with who sends it: undefined for a caller that does not say, which is refused. */
const COMMANDS: readonly [string, Author | undefined, Command][] = [
  [
    'comment',
    'user',
    {
      type: 'create-thread',
      thread: {
        id: 'why',
        anchor: { kind: 'element', element: 'patient' },
        comment: { id: 'c1', text: 'Why here? See @[booking-agent] and @[gone].', author: ANA },
      },
    },
  ],
  [
    'comment on a relation',
    'user',
    {
      type: 'create-thread',
      thread: {
        anchor: { kind: 'relation', relation: 'agent-to-api' },
        comment: { text: 'Hi', author: ANA },
      },
    },
  ],
  [
    'comment on a view',
    'claude',
    {
      type: 'create-thread',
      thread: { anchor: { kind: 'view', view: VIEW }, comment: { text: 'Hi' } },
    },
  ],
  [
    'comment on a point',
    'user',
    {
      type: 'create-thread',
      thread: {
        anchor: { kind: 'point', view: VIEW, x: 10, y: 20 },
        comment: { text: 'Hi', author: ANA },
      },
    },
  ],
  ['no thread', 'user', hand({ type: 'create-thread' })],
  [
    'unknown element',
    'user',
    {
      type: 'create-thread',
      thread: {
        anchor: { kind: 'element', element: 'nobody' },
        comment: { text: 'x', author: ANA },
      },
    },
  ],
  [
    'World',
    'user',
    {
      type: 'create-thread',
      thread: {
        anchor: { kind: 'element', element: 'world' },
        comment: { text: 'x', author: ANA },
      },
    },
  ],
  [
    'far point',
    'user',
    {
      type: 'create-thread',
      thread: {
        anchor: { kind: 'point', view: VIEW, x: 1e9, y: 0 },
        comment: { text: 'x', author: ANA },
      },
    },
  ],
  [
    'point not a number',
    'user',
    hand({
      type: 'create-thread',
      thread: {
        anchor: { kind: 'point', view: VIEW, x: 0, y: 'a' },
        comment: { text: 'x', author: ANA },
      },
    }),
  ],
  [
    'no anchor',
    'user',
    hand({ type: 'create-thread', thread: { anchor: 'x', comment: { text: 'x', author: ANA } } }),
  ],
  [
    'not an anchor',
    'user',
    hand({
      type: 'create-thread',
      thread: { anchor: { kind: 'shape' }, comment: { text: 'x', author: ANA } },
    }),
  ],
  [
    'no name',
    'user',
    {
      type: 'create-thread',
      thread: { anchor: { kind: 'view', view: VIEW }, comment: { text: 'x' } },
    },
  ],
  [
    'as Claude',
    'user',
    {
      type: 'create-thread',
      thread: {
        anchor: { kind: 'view', view: VIEW },
        comment: { text: 'x', author: { kind: 'claude' } },
      },
    },
  ],
  [
    'Claude as a person',
    'claude',
    {
      type: 'create-thread',
      thread: { anchor: { kind: 'view', view: VIEW }, comment: { text: 'x', author: ANA } },
    },
  ],
  [
    'long name',
    'user',
    {
      type: 'create-thread',
      thread: {
        anchor: { kind: 'view', view: VIEW },
        comment: { text: 'x', author: { kind: 'person', name: 'x'.repeat(201) } },
      },
    },
  ],
  [
    'bad email',
    'user',
    {
      type: 'create-thread',
      thread: {
        anchor: { kind: 'view', view: VIEW },
        comment: { text: 'x', author: { kind: 'person', name: 'Ana', email: 'ana' } },
      },
    },
  ],
  [
    'email not text',
    'user',
    hand({
      type: 'create-thread',
      thread: {
        anchor: { kind: 'view', view: VIEW },
        comment: { text: 'x', author: { kind: 'person', name: 'Ana', email: 5 } },
      },
    }),
  ],
  [
    'no text',
    'user',
    {
      type: 'create-thread',
      thread: { anchor: { kind: 'view', view: VIEW }, comment: { text: ' ', author: ANA } },
    },
  ],
  [
    'too much text',
    'user',
    {
      type: 'create-thread',
      thread: {
        anchor: { kind: 'view', view: VIEW },
        comment: { text: 'x'.repeat(20_001), author: ANA },
      },
    },
  ],
  [
    'control character',
    'user',
    {
      type: 'create-thread',
      thread: { anchor: { kind: 'view', view: VIEW }, comment: { text: 'a\u0007', author: ANA } },
    },
  ],
  [
    'reply',
    'claude',
    { type: 'add-comment', thread: 'why', comment: { id: 'c2', text: 'Because.' } },
  ],
  [
    'reply to nothing',
    'user',
    { type: 'add-comment', thread: 'nope', comment: { text: 'x', author: ANA } },
  ],
  [
    'edit',
    'user',
    { type: 'edit-comment', thread: 'why', comment: 'c1', text: 'Why?', author: ANA },
  ],
  [
    'edit another’s',
    'user',
    { type: 'edit-comment', thread: 'why', comment: 'c1', text: 'x', author: BRUNO },
  ],
  [
    'Claude edits the person’s',
    'claude',
    { type: 'edit-comment', thread: 'why', comment: 'c1', text: 'x' },
  ],
  [
    'edit nothing',
    'user',
    { type: 'edit-comment', thread: 'why', comment: 'nope', text: 'x', author: ANA },
  ],
  ['resolve', 'user', { type: 'resolve-thread', thread: 'why', resolved: true }],
  ['reopen', 'claude', { type: 'resolve-thread', thread: 'why', resolved: false }],
  ['resolve unclearly', 'user', hand({ type: 'resolve-thread', thread: 'why', resolved: 'yes' })],
  [
    'no sender said',
    undefined,
    { type: 'add-comment', thread: 'why', comment: { text: 'x', author: ANA } },
  ],
  ['delete', 'user', { type: 'delete-thread', thread: 'why' }],
  [
    'the sample’s thread',
    'user',
    { type: 'resolve-thread', thread: 'reminder-timing', resolved: true },
  ],
];

interface Said {
  command: string;
  message: string;
}

function allMessages(): Said[] {
  let state: ProjectSnapshot = sample;
  let made = 0;
  const said: Said[] = [];
  for (const [name, author, command] of COMMANDS) {
    const outcome = executeCommand(state, command, {
      ...(author === undefined ? {} : { author }),
      newId: (base) => `${base}-${(made += 1)}`,
      now: () => Date.UTC(2026, 9, 25, 12),
    });
    if (outcome.ok) {
      state = outcome.state;
      said.push({ command: name, message: outcome.label });
      for (const warning of outcome.warnings)
        said.push({ command: name, message: warning.message });
    } else {
      for (const problem of outcome.problems)
        said.push({ command: name, message: problem.message });
    }
  }
  // The full thread, and ids used twice, as a file written by hand holds them.
  const thread = sample.comments[0] as CommentFile;
  const comment = thread.comments[0] as CommentFile['comments'][number];
  const full = {
    ...thread,
    comments: Array.from({ length: 1000 }, (_, at) => ({ ...comment, id: `c${at}` })),
  };
  const outcome = executeCommand(
    { ...sample, comments: [full] },
    { type: 'add-comment', thread: thread.id, comment: { text: 'x', author: ANA } },
    { author: 'user' },
  );
  if (!outcome.ok)
    for (const problem of outcome.problems)
      said.push({ command: 'full', message: problem.message });
  // A thread whose comments hold as many characters as one holds, answered and edited past it.
  const long = {
    ...thread,
    comments: Array.from({ length: 11 }, (_, at) => ({
      ...comment,
      id: `l${at}`,
      author: ANA,
      text: 'x'.repeat(at === 0 ? 10 : at === 10 ? 19_990 : 20_000),
    })),
  };
  for (const command of [
    { type: 'add-comment', thread: thread.id, comment: { text: 'x', author: ANA } },
    { type: 'edit-comment', thread: thread.id, comment: 'l0', text: 'x'.repeat(11), author: ANA },
  ] as Command[]) {
    const refused = executeCommand({ ...sample, comments: [long] }, command, {
      author: 'user',
      now: () => Date.UTC(2026, 9, 25, 12),
    });
    if (!refused.ok)
      for (const problem of refused.problems)
        said.push({ command: 'long', message: problem.message });
  }
  const twice = { ...sample, comments: [thread, { ...thread, comments: [comment, comment] }] };
  for (const problem of checkProject(twice).errors)
    said.push({ command: 'check', message: problem.message });
  return said;
}

describe('the comment commands’ messages in Spanish', () => {
  const said = allMessages();

  it('say what each command came to', () => {
    expect(said.length).toBeGreaterThanOrEqual(COMMANDS.length);
  });

  it('each have a Spanish template', () => {
    const missing = said.flatMap(({ command, message }) =>
      untranslatedParts('es', message).map((part) => `${command}: ${part}`),
    );
    expect(missing).toEqual([]);
  });

  it('keep what people wrote as they wrote it', () => {
    const labelOf = (name: string) => said.find((each) => each.command === name)?.message ?? '';
    expect(translateMessage('es', labelOf('comment'))).toBe('Comentar "Patient"');
    expect(translateMessage('es', labelOf('comment on a view'))).toBe(
      'Comentar la vista "System overview"',
    );
    expect(translateMessage('es', labelOf('comment on a point'))).toBe(
      'Comentar un punto de la vista "System overview"',
    );
    expect(translateMessage('es', labelOf('reply'))).toBe('Responder al hilo sobre "Patient"');
  });
});
