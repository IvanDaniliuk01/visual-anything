import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LiveProtocolProblem,
  checkFetchAddress,
  readLiveFetchMessage,
  readLiveFetchedMessage,
  readLiveKeptMessage,
  readLiveSetMessage,
  readLiveValuesMessage,
} from './messages';

const VALUE = {
  target: 'api',
  attribute: 'latency',
  value: 120,
  sender: { kind: 'claude' },
  arrivedAt: 1_000,
  freshFor: 60_000,
};

describe('readLiveValuesMessage', () => {
  it('keeps the values and what was removed', () => {
    expect(
      readLiveValuesMessage({
        type: 'live/values',
        values: [{ ...VALUE, extra: 1 }],
        removed: [{ target: 'db', attribute: 'load', also: 2 }],
      }),
    ).toEqual({
      type: 'live/values',
      values: [VALUE],
      removed: [{ target: 'db', attribute: 'load' }],
    });
  });

  it('refuses values without a sender, an arrival or a freshness', () => {
    for (const broken of [
      { ...VALUE, sender: { kind: 'someone' } },
      { ...VALUE, arrivedAt: 'now' },
      { ...VALUE, freshFor: undefined },
      { ...VALUE, value: undefined },
    ]) {
      expect(() =>
        readLiveValuesMessage({ type: 'live/values', values: [broken], removed: [] }),
      ).toThrow(LiveProtocolProblem);
    }
    expect(() => readLiveValuesMessage({ type: 'live/values', values: [] })).toThrow(
      LiveProtocolProblem,
    );
  });

  it('either reads a message or says why not, whatever it is given', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (values, removed) => {
        try {
          readLiveValuesMessage({ type: 'live/values', values, removed });
        } catch (error) {
          expect(error).toBeInstanceOf(LiveProtocolProblem);
        }
      }),
    );
  });
});

describe('the answers and requests', () => {
  it('reads what was kept', () => {
    expect(
      readLiveKeptMessage(
        { kept: 2, waiting: 0, dropped: 1, unknown: ['x'], refused: [{ at: 3, reason: 'r' }] },
        'r1',
      ),
    ).toEqual({
      type: 'live/kept',
      requestId: 'r1',
      kept: 2,
      waiting: 0,
      dropped: 1,
      unknown: ['x'],
      refused: [{ at: 3, reason: 'r' }],
    });
    expect(() =>
      readLiveKeptMessage({ kept: -1, waiting: 0, dropped: 0, unknown: [], refused: [] }, 'r'),
    ).toThrow(LiveProtocolProblem);
  });

  it('reads what was fetched: a status and text of at most 256 KiB', () => {
    expect(readLiveFetchedMessage({ status: 200, text: '{}' }, 'r')).toEqual({
      type: 'live/fetched',
      requestId: 'r',
      status: 200,
      text: '{}',
    });
    expect(() => readLiveFetchedMessage({ status: 99, text: '' }, 'r')).toThrow();
    expect(() =>
      readLiveFetchedMessage({ status: 200, text: 'x'.repeat(256 * 1024 + 1) }, 'r'),
    ).toThrow();
  });

  it('reads a request to fetch, and live values from package code', () => {
    expect(readLiveFetchMessage({ package: 'gauges', url: 'https://a.example' }, 'r')).toEqual({
      type: 'live/fetch',
      requestId: 'r',
      package: 'gauges',
      url: 'https://a.example',
    });
    expect(() => readLiveFetchMessage({ package: 'gauges', url: 'x'.repeat(2049) }, 'r')).toThrow();
    expect(readLiveSetMessage({ package: 'gauges', values: [], freshFor: 5_000 }, 'r')).toEqual({
      type: 'live/set',
      requestId: 'r',
      package: 'gauges',
      values: [],
      freshFor: 5_000,
    });
    expect(() => readLiveSetMessage({ package: 'gauges', values: [], freshFor: 1 }, 'r')).toThrow();
  });
});

describe('checkFetchAddress', () => {
  const granted = ['network:https://status.example.com', 'time'] as const;

  it('takes an address on an origin granted, without its fragment', () => {
    expect(checkFetchAddress('https://status.example.com/api/latency?x=1#top', granted)).toEqual({
      ok: true,
      url: 'https://status.example.com/api/latency?x=1',
      origin: 'https://status.example.com',
    });
    // Browsers write the origin in small letters and without its default port.
    expect(checkFetchAddress('HTTPS://Status.Example.com:443/a', granted).ok).toBe(true);
  });

  it('refuses any other origin, scheme, or an address with a user or password', () => {
    for (const url of [
      'https://status.example.com.evil.example/a',
      'https://status.example.com:8443/a',
      'http://status.example.com/a',
      'https://other.example.com/a',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://user:pass@status.example.com/a',
      'https://user@status.example.com/a',
      'not an address',
      '//status.example.com/a',
    ]) {
      expect(checkFetchAddress(url, granted).ok, url).toBe(false);
    }
    expect(checkFetchAddress('https://status.example.com/a', ['time']).ok).toBe(false);
  });

  it('never grants an origin no capability names, whatever it is given', () => {
    fc.assert(
      fc.property(fc.webUrl({ withFragments: true, withQueryParameters: true }), (url) => {
        const checked = checkFetchAddress(url, granted);
        if (checked.ok) expect(checked.origin).toBe('https://status.example.com');
      }),
    );
  });
});
