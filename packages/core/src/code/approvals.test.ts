import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_CODE_APPROVALS,
  checkCodeApprovals,
  codeStatusOf,
  readCodeApprovals,
  withApproval,
  withoutApproval,
  type CodeApproval,
} from './approvals';
import type { PackageCode } from './packages';

const HASH = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

const code: PackageCode = {
  package: 'gauges',
  name: 'Gauges',
  text: 'export const a = 1;',
  hash: HASH,
  capabilities: ['model:read', 'network:https://status.example.com', 'time'],
  declared: ['model:read', 'network:https://status.example.com', 'time'],
  tooLarge: false,
};

describe('codeStatusOf', () => {
  it('is unapproved until an approval has its hash', () => {
    expect(codeStatusOf(code, [])).toEqual({ state: 'unapproved' });
    expect(codeStatusOf(code, [{ hash: OTHER, package: 'gauges', capabilities: [] }])).toEqual({
      state: 'unapproved',
    });
  });

  it('grants only the approved capabilities the code still declares', () => {
    const approvals: CodeApproval[] = [
      { hash: HASH, package: 'gauges', capabilities: ['time', 'model:read'] },
    ];
    expect(codeStatusOf(code, approvals)).toEqual({
      state: 'approved',
      granted: ['model:read', 'time'],
    });
  });

  it('never runs code too large, approved or not', () => {
    const approvals: CodeApproval[] = [{ hash: HASH, package: 'gauges', capabilities: [] }];
    expect(codeStatusOf({ ...code, tooLarge: true }, approvals)).toEqual({ state: 'too-large' });
  });
});

describe('withApproval and withoutApproval', () => {
  it('puts the newest first, once per hash, and keeps at most so many', () => {
    const one = { hash: HASH, package: 'gauges', capabilities: [] };
    const two = { hash: OTHER, package: 'other', capabilities: ['time'] };
    expect(withApproval([one], two)).toEqual([two, one]);
    expect(withApproval([two, one], { ...one, capabilities: ['time'] })).toEqual([
      { ...one, capabilities: ['time'] },
      two,
    ]);
    const many = Array.from({ length: MAX_CODE_APPROVALS }, (_, i) => ({
      hash: i.toString(16).padStart(64, '0'),
      package: 'p',
      capabilities: [],
    }));
    const next = withApproval(many, one);
    expect(next).toHaveLength(MAX_CODE_APPROVALS);
    expect(next[0]).toEqual(one);
    expect(next.at(-1)).toEqual(many.at(-2));
    expect(withoutApproval([two, one], HASH)).toEqual([two]);
  });
});

describe('readCodeApprovals', () => {
  it('reads valid approvals and ignores keys a later version adds', () => {
    expect(
      readCodeApprovals([
        { hash: HASH, package: 'gauges', capabilities: ['time'], approvedAt: '2026-10-25' },
      ]),
    ).toEqual([{ hash: HASH, package: 'gauges', capabilities: ['time'] }]);
  });

  it('cannot read a list with any approval it cannot read', () => {
    for (const value of [
      'all',
      [{ hash: 'short', package: 'gauges', capabilities: [] }],
      [{ hash: HASH, package: 'gauges', capabilities: ['files'] }],
      [{ hash: HASH, package: '', capabilities: [] }],
      [{ hash: HASH.toUpperCase(), package: 'gauges', capabilities: [] }],
      [null],
    ]) {
      expect(readCodeApprovals(value)).toBeUndefined();
    }
  });
});

describe('checkCodeApprovals', () => {
  it('takes approvals as the app sends them, capabilities sorted', () => {
    expect(
      checkCodeApprovals([{ hash: HASH, package: 'gauges', capabilities: ['time', 'model:read'] }]),
    ).toEqual({
      ok: true,
      value: [{ hash: HASH, package: 'gauges', capabilities: ['model:read', 'time'] }],
    });
  });

  it.each([
    ['not a list', {}, '"codeApprovals" must be a list of approvals of package code.'],
    [
      'an unknown key',
      [{ hash: HASH, package: 'gauges', capabilities: [], all: true }],
      'An approval of package code has a hash, a package and capabilities, and nothing else.',
    ],
    [
      'a hash that is not one',
      [{ hash: 'x', package: 'gauges', capabilities: [] }],
      'An approval of package code names its SHA-256 in 64 small hexadecimal digits.',
    ],
    [
      'a capability that is not one',
      [{ hash: HASH, package: 'gauges', capabilities: ['files'] }],
      '"files" is not a capability: package code may have "model:read", "time" and "network:" with one web origin.',
    ],
    [
      'one hash twice',
      [
        { hash: HASH, package: 'gauges', capabilities: [] },
        { hash: HASH, package: 'gauges', capabilities: [] },
      ],
      `"codeApprovals" approves ${HASH} twice.`,
    ],
  ])('refuses %s', (_, value, message) => {
    expect(checkCodeApprovals(value)).toEqual({ ok: false, message });
  });

  it('refuses more than so many', () => {
    const many = Array.from({ length: MAX_CODE_APPROVALS + 1 }, (_, i) => ({
      hash: i.toString(16).padStart(64, '0'),
      package: 'p',
      capabilities: [],
    }));
    expect(checkCodeApprovals(many)).toEqual({
      ok: false,
      message: `"codeApprovals" holds ${MAX_CODE_APPROVALS + 1} approvals, more than ${MAX_CODE_APPROVALS}.`,
    });
  });

  it('never fails, whatever it is given', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        expect(typeof checkCodeApprovals(value).ok).toBe('boolean');
        readCodeApprovals(value);
      }),
    );
  });
});
