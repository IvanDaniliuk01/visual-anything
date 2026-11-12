import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeAppMessage, decodeServerMessage } from '../protocol';
import {
  MAX_EXPLORABLE_APPROVALS,
  approvalHashOf,
  checkExplorableApprovals,
  continuedApprovals,
  explorableApprovalHash,
  explorableFrameAddress,
  explorableFrameSource,
  explorableTextHash,
  isApproved,
  isFrameHost,
  readExplorableApprovals,
  readExplorableFramePath,
  registryAddresses,
  withExplorableApproval,
  withoutExplorableApproval,
  type ExplorableApproval,
} from './index';

const hash = (n: number) => n.toString(16).padStart(64, '0');

describe('approvals', () => {
  it('hash the text and the libraries, in order', () => {
    const text = '<p>x</p>';
    expect(explorableApprovalHash(text, ['a', 'b'])).toBe(
      approvalHashOf(explorableTextHash(text), ['a', 'b']),
    );
    expect(explorableApprovalHash(text, ['a', 'b'])).not.toBe(
      explorableApprovalHash(text, ['b', 'a']),
    );
    expect(explorableApprovalHash(text, [])).not.toBe(explorableApprovalHash(`${text} `, []));
  });

  it('continue an approval only from an approved text, by Claude, newest first', () => {
    const person = withExplorableApproval([], hash(1), 'test.q');
    expect(person).toEqual([{ hash: hash(1), explorable: 'test.q', by: 'person' }]);
    const continued = continuedApprovals(person, 'test.q', hash(1), hash(2));
    expect(continued[0]).toEqual({ hash: hash(2), explorable: 'test.q', by: 'claude' });
    expect(isApproved(continued, hash(2))).toBe(true);
    // A text from outside, written over one not approved, asks.
    expect(continuedApprovals(person, 'test.q', hash(3), hash(4))).toEqual(person);
    expect(withoutExplorableApproval(continued, hash(1))).toEqual([continued[0]]);
  });

  it('keep at most 1,024, and never let Claude approve what the person did not start', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({ kind: fc.constant('person'), n: fc.nat(40) }),
            fc.record({ kind: fc.constant('claude'), from: fc.nat(40), to: fc.nat(40) }),
          ),
          { maxLength: 60 },
        ),
        (steps) => {
          let approvals: ExplorableApproval[] = [];
          const approvedByPerson = new Set<string>();
          for (const step of steps) {
            if (step.kind === 'person') {
              approvals = withExplorableApproval(approvals, hash(step.n), 'test.q');
              approvedByPerson.add(hash(step.n));
            } else {
              const was = isApproved(approvals, hash(step.from));
              const next = continuedApprovals(approvals, 'test.q', hash(step.from), hash(step.to));
              if (!was) expect(next).toEqual(approvals);
              approvals = next;
            }
            expect(approvals.length).toBeLessThanOrEqual(MAX_EXPLORABLE_APPROVALS);
            expect(new Set(approvals.map((each) => each.hash)).size).toBe(approvals.length);
          }
          // Every approval Claude holds is reached from one the person gave.
          if (approvedByPerson.size === 0) expect(approvals).toEqual([]);
        },
      ),
    );
    let many: ExplorableApproval[] = [];
    for (let n = 0; n < 1100; n += 1) many = withExplorableApproval(many, hash(n), 'test.q');
    expect(many).toHaveLength(MAX_EXPLORABLE_APPROVALS);
    expect(many[0]?.hash).toBe(hash(1099));
  });

  it('read leniently from the file and strictly from an app', () => {
    const good = [{ hash: hash(1), explorable: 'test.q', by: 'claude' }];
    expect(readExplorableApprovals(good)).toEqual(good);
    expect(readExplorableApprovals([...good, ...good])).toBeUndefined();
    expect(readExplorableApprovals([{ ...good[0], by: 'robot' }])).toBeUndefined();
    expect(checkExplorableApprovals(good)).toEqual({ ok: true, value: good });
    expect(checkExplorableApprovals([{ ...good[0], extra: 1 }]).ok).toBe(false);
    expect(checkExplorableApprovals('x').ok).toBe(false);
  });
});

describe('frame addresses', () => {
  const address = {
    label: 'abcdefgh12345678',
    port: 47750,
    nonce: 'n'.repeat(22),
    explorable: 'test.quadratic',
    hash: hash(7),
  };

  it('build and read back, under the session’s nonce and a fresh label', () => {
    const url = explorableFrameAddress(address);
    expect(url).toBe(
      `http://abcdefgh12345678.localhost:47750/${'n'.repeat(22)}/frame/test.quadratic/${hash(7)}`,
    );
    const parsed = new URL(url);
    expect(isFrameHost(parsed.host, 47750)).toBe(true);
    expect(readExplorableFramePath(parsed.pathname, address.nonce)).toEqual({
      explorable: 'test.quadratic',
      hash: hash(7),
    });
    expect(explorableFrameSource(47750)).toBe('http://*.localhost:47750');
  });

  it('refuse other hosts, ports, nonces and paths', () => {
    for (const host of [
      'localhost:47750',
      '127.0.0.1:47750',
      'abcdefgh12345678.localhost:47751',
      'ABCDEFGH12345678.localhost:47750',
      'short.localhost:47750',
      'abcdefgh12345678.evil.com:47750',
      undefined,
    ]) {
      expect(isFrameHost(host, 47750)).toBe(false);
    }
    for (const path of [
      `/${'m'.repeat(22)}/frame/test.quadratic/${hash(7)}`,
      `/${'n'.repeat(22)}/frame/test.quadratic/${hash(7)}/x`,
      `/${'n'.repeat(22)}/frame/../${hash(7)}`,
      `/${'n'.repeat(22)}/lib/test.quadratic/${hash(7)}`,
      `/${'n'.repeat(22)}/frame/test.quadratic/XYZ`,
    ]) {
      expect(readExplorableFramePath(path, address.nonce)).toBeUndefined();
    }
    expect(() => explorableFrameAddress({ ...address, label: 'Short' })).toThrow();
    expect(() => explorableFrameAddress({ ...address, explorable: 'a/b' })).toThrow();
  });
});

describe('the live connection’s messages on explorables', () => {
  it('reads each of them, both ways, strictly', () => {
    expect(
      decodeAppMessage(JSON.stringify({ type: 'explorables/listen', requestId: 'r' })),
    ).toEqual({
      type: 'explorables/listen',
      requestId: 'r',
    });
    expect(
      decodeServerMessage(
        JSON.stringify({
          type: 'explorables/listening',
          requestId: 'r',
          port: 47750,
          nonce: 'n'.repeat(22),
        }),
      ),
    ).toEqual({
      type: 'explorables/listening',
      requestId: 'r',
      port: 47750,
      nonce: 'n'.repeat(22),
    });
    const ask = {
      package: 'math',
      npm: '@scope/plot',
      version: '1.2.3',
      path: 'dist/plot.min.js',
      global: 'Plot',
    };
    expect(
      decodeAppMessage(JSON.stringify({ type: 'script-library/fetch', requestId: 'r', ...ask })),
    ).toEqual({ type: 'script-library/fetch', requestId: 'r', ...ask });
    const addresses = registryAddresses('@scope/plot', '1.2.3');
    expect(addresses).toEqual({
      document: 'https://registry.npmjs.org/@scope%2Fplot/1.2.3',
      tarball: 'https://registry.npmjs.org/@scope/plot/-/plot-1.2.3.tgz',
    });
    const consent = {
      type: 'script-library/consent',
      requestId: 'r',
      asker: 'claude',
      ...ask,
      ...addresses,
    };
    expect(decodeServerMessage(JSON.stringify(consent))).toEqual(consent);
    expect(
      decodeAppMessage(
        JSON.stringify({ type: 'script-library/consented', requestId: 'r', approved: true }),
      ),
    ).toEqual({ type: 'script-library/consented', requestId: 'r', approved: true });
    expect(
      decodeServerMessage(
        JSON.stringify({
          type: 'script-library/refused',
          requestId: 'r',
          code: 'fetch-failed',
          message: 'No.',
        }),
      ),
    ).toEqual({
      type: 'script-library/refused',
      requestId: 'r',
      code: 'fetch-failed',
      message: 'No.',
    });
  });

  it('refuses consent to an address that is not the registry’s, and asks that escape the package', () => {
    const ask = { package: 'math', npm: 'd3', version: '7.9.0' };
    expect(() =>
      decodeServerMessage(
        JSON.stringify({
          type: 'script-library/consent',
          requestId: 'r',
          asker: 'claude',
          ...ask,
          document: 'https://evil.example/d3',
          tarball: registryAddresses('d3', '7.9.0').tarball,
        }),
      ),
    ).toThrow();
    for (const bad of [
      { npm: 'D3' },
      { version: 'latest' },
      { version: '^7.0.0' },
      { path: '../../etc/passwd' },
      { path: '/abs.js' },
      { global: 'a b' },
      { package: '' },
      { extra: 1 },
    ]) {
      expect(() =>
        decodeAppMessage(
          JSON.stringify({ type: 'script-library/fetch', requestId: 'r', ...ask, ...bad }),
        ),
      ).toThrow();
    }
    expect(() =>
      decodeServerMessage(
        JSON.stringify({
          type: 'explorables/listening',
          requestId: 'r',
          port: 0,
          nonce: 'n'.repeat(22),
        }),
      ),
    ).toThrow();
  });
});
