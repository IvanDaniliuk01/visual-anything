/**
 * Where the program may connect for package code (ADR 0057's clarification on addresses): a name only
 * to public addresses, resolved here and pinned; an address granted as written, also on this computer
 * or the person's network; never the program itself; https but for such an address.
 */
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Capability } from '@visual-anything/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PackageFetcher, pinnedLookup, type Requester, type Resolver } from './live-fetch';

let server: Server;
let port: number;
let requests: { url: string; headers: Record<string, unknown> }[];

beforeEach(async () => {
  requests = [];
  server = createServer((request, response) => {
    requests.push({ url: request.url ?? '', headers: { ...request.headers } });
    response.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'a=b' });
    response.end('{"ok": true}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const NAMED: Capability = 'network:https://status.example.com';

function pkg(granted: Capability[]) {
  return { id: 'gauges', name: 'Gauges', granted };
}

/**
 * A requester that sends every request to the test server, whatever it was meant to reach, and
 * notes where the pinned lookup would have connected, both as Node asks for one address and for all.
 */
function towardTheTestServer(
  seen: { host: string | undefined; one: unknown; all: unknown }[],
): Requester {
  return (_secure, options, onResponse) => {
    const lookup = options.lookup as unknown as (
      hostname: string,
      lookupOptions: { all?: boolean },
      callback: (error: Error | null, address: unknown, family?: number) => void,
    ) => void;
    const note = {
      host: options.hostname ?? undefined,
      one: undefined as unknown,
      all: undefined as unknown,
    };
    lookup('status.example.com', {}, (_error, address, family) => {
      note.one = [address, family];
    });
    lookup('status.example.com', { all: true }, (_error, addresses) => {
      note.all = addresses;
    });
    seen.push(note);
    return httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: options.path,
        method: 'GET',
        headers: options.headers,
        agent: false,
      },
      onResponse,
    );
  };
}

describe('names granted to package code', () => {
  it('lead only to public addresses: never this computer, the network or metadata', async () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.5',
      '169.254.169.254',
      '::ffff:127.0.0.1',
      '::1',
      'fd00::5',
      '0.0.0.0',
    ]) {
      const resolve: Resolver = () =>
        Promise.resolve([{ address, family: address.includes(':') ? 6 : 4 }]);
      const fetcher = new PackageFetcher({ resolve, request: towardTheTestServer([]) });
      const fetched = await fetcher.fetch(pkg([NAMED]), 'https://status.example.com/latency');
      expect(fetched.ok, address).toBe(false);
      if (!fetched.ok) {
        expect(fetched.problem.code).toBe('fetch-refused');
        expect(fetched.problem.message).toContain(`by its name status.example.com, to ${address}`);
      }
    }
    expect(requests).toEqual([]);
  });

  it('refuse a name when any address it resolves to is not public', async () => {
    const resolve: Resolver = () =>
      Promise.resolve([
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.0.10', family: 4 },
      ]);
    const fetched = await new PackageFetcher({ resolve }).fetch(
      pkg([NAMED]),
      'https://status.example.com/',
    );
    expect(fetched.ok).toBe(false);
    expect(requests).toEqual([]);
  });

  it('connect to the address checked, however the name answers after', async () => {
    let asked = 0;
    // A rebinding resolver: public the first time, this computer from then on.
    const resolve: Resolver = () => {
      asked += 1;
      return Promise.resolve([
        asked === 1 ? { address: '93.184.216.34', family: 4 } : { address: '127.0.0.1', family: 4 },
      ]);
    };
    const seen: { host: string | undefined; one: unknown; all: unknown }[] = [];
    const fetcher = new PackageFetcher({ resolve, request: towardTheTestServer(seen) });
    const fetched = await fetcher.fetch(pkg([NAMED]), 'https://status.example.com/latency?x=1');
    expect(fetched).toEqual({ ok: true, status: 200, text: '{"ok": true}' });
    expect(asked).toBe(1);
    expect(seen).toEqual([
      {
        host: 'status.example.com',
        one: ['93.184.216.34', 4],
        all: [{ address: '93.184.216.34', family: 4 }],
      },
    ]);
    expect(requests[0]?.url).toBe('/latency?x=1');
    expect(requests[0]?.headers.cookie).toBeUndefined();
    // A second fetch resolves again, and is refused there.
    const again = await fetcher.fetch(pkg([NAMED]), 'https://status.example.com/latency');
    expect(again.ok).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it('must be https: http is only for an address granted as written', async () => {
    const resolve: Resolver = () => Promise.resolve([{ address: '93.184.216.34', family: 4 }]);
    const fetched = await new PackageFetcher({ resolve, request: towardTheTestServer([]) }).fetch(
      pkg(['network:http://status.example.com']),
      'http://status.example.com/latency',
    );
    expect(fetched.ok).toBe(false);
    if (!fetched.ok)
      expect(fetched.problem.message).toMatch(/is not https, which an address by name must be/);
  });

  it('say so when a name does not resolve, or not in time', async () => {
    const none = await new PackageFetcher({
      resolve: () => Promise.reject(new Error('ENOTFOUND')),
    }).fetch(pkg([NAMED]), 'https://status.example.com/');
    expect(none.ok === false && none.problem.message).toMatch(/does not resolve/);
    const slow = await new PackageFetcher({
      resolve: () => new Promise(() => {}),
      limits: { timeoutMs: 100, bytes: 1024 },
    }).fetch(pkg([NAMED]), 'https://status.example.com/');
    expect(slow.ok === false && slow.problem.message).toMatch(/did not answer within 0.1 seconds/);
  });
});

describe('addresses granted as written', () => {
  it('reach this computer or the person’s network, as granted on purpose', async () => {
    const fetcher = new PackageFetcher({ resolve: () => Promise.reject(new Error('never asked')) });
    const fetched = await fetcher.fetch(
      pkg([`network:http://127.0.0.1:${port}`]),
      `http://127.0.0.1:${port}/latency`,
    );
    expect(fetched).toEqual({ ok: true, status: 200, text: '{"ok": true}' });
  });

  it('never reach the program itself, whatever is granted', async () => {
    const fetcher = new PackageFetcher();
    fetcher.servesAt(port);
    const fetched = await fetcher.fetch(
      pkg([`network:http://127.0.0.1:${port}`]),
      `http://127.0.0.1:${port}/`,
    );
    expect(fetched.ok === false && fetched.problem.message).toMatch(
      /leads to Visual Anything itself, which package code never reaches/,
    );
    expect(requests).toEqual([]);
  });

  it('never reach link-local, metadata, unspecified, multicast or broadcast addresses', async () => {
    for (const host of ['169.254.169.254', '0.0.0.0', '224.0.0.1', '255.255.255.255']) {
      const fetched = await new PackageFetcher().fetch(
        pkg([`network:http://${host}`]),
        `http://${host}/`,
      );
      expect(fetched.ok, host).toBe(false);
    }
  });

  it('must be https for an address on the internet', async () => {
    const fetched = await new PackageFetcher().fetch(
      pkg(['network:http://93.184.216.34']),
      'http://93.184.216.34/',
    );
    expect(fetched.ok === false && fetched.problem.message).toMatch(
      /is not https, which an address on the internet must be/,
    );
  });
});

describe('pinnedLookup', () => {
  it('answers the address checked, as one or as all', () => {
    const lookup = pinnedLookup({ address: '93.184.216.34', family: 4 }) as unknown as (
      hostname: string,
      options: { all?: boolean },
      callback: (error: Error | null, address: unknown, family?: number) => void,
    ) => void;
    const answers: unknown[] = [];
    lookup('anything', { all: true }, (error, address) => answers.push([error, address]));
    lookup('anything', {}, (error, address, family) => answers.push([error, address, family]));
    expect(answers).toEqual([
      [null, [{ address: '93.184.216.34', family: 4 }]],
      [null, '93.184.216.34', 4],
    ]);
  });
});
