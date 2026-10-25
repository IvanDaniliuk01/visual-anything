import type { CommentAnchor, CommentFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import type { ProjectSnapshot } from '../snapshot';
import { testProject } from '../test/fixtures';
import {
  anchorPhrase,
  anchorTargetOf,
  isDetached,
  lastActivityOf,
  threadInView,
  threadsAbout,
} from './anchors';

function thread(
  id: string,
  anchor: CommentAnchor,
  times: string[] = ['2026-10-25T10:00:00Z'],
): CommentFile {
  return {
    id,
    anchor,
    comments: times.map((time, at) => ({
      id: `c${at}`,
      author: { kind: 'claude' },
      time,
      text: 'x',
    })),
  };
}

/** The test project with a second view whose scope shows the client only. */
function project(): ProjectSnapshot {
  const state = testProject();
  return {
    ...state,
    views: [
      ...state.views,
      {
        id: 'clients',
        name: 'Clients',
        perspective: { name: 'Who calls' },
        nestingRelationTypes: [],
        positions: [],
        freeShapes: [],
        scope: { include: [{ kind: 'component', component: 'test.service' }], leftOut: ['api'] },
      },
    ],
  };
}

describe('anchors', () => {
  it('name what a thread is about, and the id when it is gone', () => {
    const state = project();
    expect(anchorPhrase(state, { kind: 'element', element: 'api' })).toBe('"API"');
    expect(anchorPhrase(state, { kind: 'element', element: 'gone' })).toBe('"gone"');
    expect(anchorPhrase(state, { kind: 'view', view: 'overview' })).toBe('the view "Overview"');
    expect(anchorPhrase(state, { kind: 'point', view: 'gone', x: 0, y: 0 })).toBe(
      'a point of the view "gone"',
    );
    expect(anchorTargetOf({ kind: 'relation', relation: 'api-reads-db' })).toBe('api-reads-db');
  });

  it('say which threads belong to a view, by its scope', () => {
    const state = project();
    const threads = [
      thread('on-api', { kind: 'element', element: 'api' }),
      thread('on-client', { kind: 'element', element: 'client' }),
      thread('on-call', { kind: 'relation', relation: 'client-calls-api' }),
      thread('on-view', { kind: 'view', view: 'clients' }),
      thread('on-point', { kind: 'point', view: 'overview', x: 1, y: 2 }),
      thread('on-gone', { kind: 'element', element: 'gone' }),
    ];
    const withThreads = { ...state, comments: threads };
    const ids = (view: string) =>
      threads.filter((each) => threadInView(withThreads, each, view)).map((each) => each.id);
    expect(ids('overview')).toEqual(['on-api', 'on-client', 'on-call', 'on-point']);
    expect(ids('clients')).toEqual(['on-client', 'on-view']);
    expect(ids('nowhere')).toEqual([]);
    expect(threads.filter((each) => isDetached(withThreads, each)).map((each) => each.id)).toEqual([
      'on-gone',
    ]);
    expect(threadsAbout(withThreads, 'api').map((each) => each.id)).toEqual(['on-api']);
  });

  it('say when a thread was last written in, edits included', () => {
    const written = thread('t', { kind: 'view', view: 'overview' }, [
      '2026-10-25T10:00:00Z',
      '2026-10-25T09:00:00Z',
    ]);
    expect(lastActivityOf(written)).toBe('2026-10-25T10:00:00Z');
    const edited: CommentFile = {
      ...written,
      comments: written.comments.map((each, at) =>
        at === 1 ? { ...each, edited: '2026-10-25T11:00:00Z' } : each,
      ),
    };
    expect(lastActivityOf(edited)).toBe('2026-10-25T11:00:00Z');
  });
});
