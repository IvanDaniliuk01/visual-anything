import { describe, expect, it } from 'vitest';
import { ProtocolError, decodeAppMessage, decodeServerMessage, readGuidance } from './protocol';

const COMMIT = 'a'.repeat(40);

function reason(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof ProtocolError) return error.message;
    throw error;
  }
  throw new Error('It was read.');
}

const app = (message: object) => () =>
  decodeAppMessage(JSON.stringify({ requestId: 'r1', ...message }));
const server = (message: object) => () => decodeServerMessage(JSON.stringify(message));

describe('versions over the live connection (ADR 0071)', () => {
  it('reads an app’s asks, keeping only what they hold', () => {
    expect(app({ type: 'versions/list', extra: 1 })()).toEqual({
      type: 'versions/list',
      requestId: 'r1',
    });
    expect(
      app({ type: 'version/compare', version: { kind: 'commit', commit: COMMIT }, view: 'v' })(),
    ).toEqual({
      type: 'version/compare',
      requestId: 'r1',
      version: { kind: 'commit', commit: COMMIT },
      view: 'v',
    });
    expect(app({ type: 'version/compare', version: { kind: 'opened', commit: 'x' } })()).toEqual({
      type: 'version/compare',
      requestId: 'r1',
      version: { kind: 'opened' },
    });
  });

  it('refuses a version named otherwise than as listed, and a view that is not an id', () => {
    const named = 'A version is the project as opened, or a commit the program listed, by its id.';
    expect(
      reason(app({ type: 'version/compare', version: { kind: 'commit', commit: 'HEAD' } })),
    ).toBe(named);
    expect(
      reason(app({ type: 'version/compare', version: { kind: 'branch', name: 'main' } })),
    ).toBe(named);
    expect(
      reason(
        app({ type: 'version/compare', version: { kind: 'commit', commit: COMMIT.toUpperCase() } }),
      ),
    ).toBe(named);
    expect(reason(app({ type: 'version/compare', version: { kind: 'opened' }, view: 1 }))).toBe(
      'The view to compare is named by its id.',
    );
  });

  it('reads the versions listed strictly, as text only', () => {
    const version = {
      kind: 'branch',
      name: 'feature/billing',
      commit: COMMIT,
      short: 'aaaaaaa',
      subject: 'Add billing',
      author: 'Ana',
      time: 1,
    };
    const read = server({
      type: 'versions/listed',
      requestId: 'r1',
      versions: [{ ...version, email: 'dropped' }],
    })();
    expect(read).toEqual({
      type: 'versions/listed',
      requestId: 'r1',
      versions: [version],
    });
    expect(
      reason(
        server({
          type: 'versions/listed',
          requestId: 'r1',
          versions: [{ ...version, kind: 'stash' }],
        }),
      ),
    ).toBe('A version listed has its kind, its commit, its subject, author and time.');
    expect(
      reason(
        server({
          type: 'versions/listed',
          requestId: 'r1',
          versions: [{ ...version, subject: 'x'.repeat(201) }],
        }),
      ),
    ).toBe('A version listed has its kind, its commit, its subject, author and time.');
    expect(reason(server({ type: 'versions/listed', requestId: 'r1', versions: 1 }))).toBe(
      'The versions listed are a list.',
    );
    expect(reason(server({ type: 'versions/listed', requestId: 'r1', versions: [], why: 1 }))).toBe(
      'Why no version was listed is said in words.',
    );
  });

  it('reads a comparison and a refusal by their envelopes', () => {
    expect(
      reason(server({ type: 'version/compared', requestId: 'r1', version: { kind: 'opened' } })),
    ).toBe('The comparison has no changes, or a project that is not one.');
    expect(reason(server({ type: 'version/refused', requestId: 'r1' }))).toBe(
      'The refusal names its request and its problems.',
    );
  });

  it('reads the guidance comparison, as the person would choose it', () => {
    expect(
      readGuidance({
        kind: 'comparison',
        version: { kind: 'commit', commit: COMMIT },
        show: 'before',
      }),
    ).toEqual({ kind: 'comparison', version: { kind: 'commit', commit: COMMIT }, show: 'before' });
    expect(
      reason(() => readGuidance({ kind: 'comparison', version: { kind: 'opened' }, show: 'side' })),
    ).toBe('A comparison shows one of: before, after, comparison.');
  });
});

describe('proposals over the live connection (ADR 0073)', () => {
  it('reads an acceptance of all changes, or of some by their keys, and a refusal', () => {
    expect(app({ type: 'proposal/accept', proposal: 'p1', changes: 'all' })()).toEqual({
      type: 'proposal/accept',
      requestId: 'r1',
      proposal: 'p1',
      changes: 'all',
    });
    expect(
      app({ type: 'proposal/accept', proposal: 'p1', changes: ['element:a added'] })(),
    ).toEqual({
      type: 'proposal/accept',
      requestId: 'r1',
      proposal: 'p1',
      changes: ['element:a added'],
    });
    expect(app({ type: 'proposal/refuse', proposal: 'p1' })()).toEqual({
      type: 'proposal/refuse',
      requestId: 'r1',
      proposal: 'p1',
    });
  });

  it('refuses an acceptance of no proposal, or of changes not named by their keys', () => {
    expect(reason(app({ type: 'proposal/accept', proposal: 1, changes: 'all' }))).toBe(
      'A proposal is named by its id.',
    );
    expect(reason(app({ type: 'proposal/accept', proposal: 'p1', changes: [1] }))).toBe(
      'Accepting names "all" the changes, or at most 100000 of them by their keys.',
    );
    expect(reason(app({ type: 'proposal/refuse' }))).toBe('A proposal is named by its id.');
  });

  it('reads the proposal shown and closed by their envelopes', () => {
    expect(reason(server({ type: 'proposal/shown', proposal: { id: 'p1' } }))).toBe(
      'The proposal shown has its id, labels, operations and changes.',
    );
    expect(reason(server({ type: 'proposal/closed', proposal: 'p1', how: 'lost' }))).toBe(
      'The proposal closed is named, with how it closed.',
    );
    const closed = { type: 'proposal/closed', proposal: 'p1', how: 'accepted', accepted: ['x'] };
    expect(server(closed)()).toEqual(closed);
  });
});
