import type { ProjectSnapshot } from '@visual-anything/core';
import type { CommentFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { DEFAULT_FILTERS } from './store';
import { threadRows } from './threads';

const VIEW = 'system-overview';

function thread(
  id: string,
  anchor: CommentFile['anchor'],
  authors: ('Ana' | 'Bruno' | 'Claude')[],
  options: { resolved?: boolean; at?: number } = {},
): CommentFile {
  return {
    id,
    anchor,
    ...(options.resolved ? { resolved: true } : {}),
    comments: authors.map((name, at) => ({
      id: `${id}-${at}`,
      author: name === 'Claude' ? { kind: 'claude' } : { kind: 'person', name },
      time: new Date(Date.UTC(2026, 9, 25, 10 + (options.at ?? 0), at)).toISOString(),
      text: `${name} says something.`,
    })),
  };
}

function project(): ProjectSnapshot {
  const sample = loadSample();
  return {
    ...sample,
    comments: [
      thread('on-patient', { kind: 'element', element: 'patient' }, ['Ana'], { at: 1 }),
      thread('on-view', { kind: 'view', view: VIEW }, ['Bruno', 'Claude'], { at: 3 }),
      thread('resolved', { kind: 'element', element: 'patient' }, ['Ana'], {
        resolved: true,
        at: 2,
      }),
      thread('on-gone', { kind: 'element', element: 'gone' }, ['Bruno'], { at: 4 }),
      thread('elsewhere', { kind: 'view', view: 'gone-view' }, ['Ana'], { at: 0 }),
    ],
  };
}

const ids = (rows: { thread: CommentFile }[]) => rows.map((row) => row.thread.id);

describe('threadRows', () => {
  it('lists the open threads of the open view, the latest written in first, and detached ones apart', () => {
    const rows = threadRows(project(), VIEW, DEFAULT_FILTERS);
    expect(ids(rows.attached)).toEqual(['on-view', 'on-patient']);
    expect(ids(rows.detached)).toEqual(['on-gone', 'elsewhere']);
  });

  it('filters by state, by author and by what threads are about', () => {
    const state = project();
    expect(
      ids(threadRows(state, VIEW, { ...DEFAULT_FILTERS, state: 'resolved' }).attached),
    ).toEqual(['resolved']);
    expect(ids(threadRows(state, VIEW, { ...DEFAULT_FILTERS, state: 'all' }).attached)).toEqual([
      'on-view',
      'resolved',
      'on-patient',
    ]);
    expect(ids(threadRows(state, VIEW, { ...DEFAULT_FILTERS, author: 'claude' }).attached)).toEqual(
      ['on-view'],
    );
    const bruno = threadRows(state, VIEW, { ...DEFAULT_FILTERS, author: 'name:bruno' });
    expect(ids(bruno.attached)).toEqual(['on-view']);
    expect(ids(bruno.detached)).toEqual(['on-gone']);
    expect(
      ids(threadRows(state, VIEW, { ...DEFAULT_FILTERS, state: 'all', about: 'patient' }).attached),
    ).toEqual(['resolved', 'on-patient']);
  });

  it('lists every author once, by name, Claude among them', () => {
    expect(threadRows(project(), VIEW, DEFAULT_FILTERS).authors).toEqual([
      { key: 'name:ana', name: 'Ana' },
      { key: 'name:bruno', name: 'Bruno' },
      { key: 'claude', name: 'Claude' },
    ]);
  });

  it('lists the whole project’s threads, and none of a view that is not there', () => {
    const state = project();
    expect(ids(threadRows(state, VIEW, { ...DEFAULT_FILTERS, where: 'all' }).attached)).toEqual([
      'on-view',
      'on-patient',
    ]);
    expect(ids(threadRows(state, undefined, DEFAULT_FILTERS).attached)).toEqual([]);
  });
});
