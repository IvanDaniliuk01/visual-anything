/**
 * Fetching a link card's preview (ADR 0098, stage 3), against a stub server on 127.0.0.1: every
 * request is sent there whatever it was meant to reach, and the resolver is the test's, so nothing
 * leaves this computer. What is checked is where the fetcher would connect, and what it reads.
 */
import { createServer, request as httpRequest, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Requester, Resolver } from '../live-fetch';
import { LinkFetcher } from './preview-fetch';

type Route = (response: ServerResponse) => void;

let server: Server;
let port: number;
let routes: Map<string, Route>;
let requests: { path: string; headers: Record<string, unknown> }[];

beforeEach(async () => {
  routes = new Map();
  requests = [];
  server = createServer((request, response) => {
    requests.push({ path: request.url ?? '', headers: { ...request.headers } });
    const route = routes.get(request.url ?? '');
    if (route) route(response);
    else {
      response.writeHead(404, { 'content-type': 'text/html' });
      response.end('<title>Not here</title>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const PUBLIC: Resolver = () => Promise.resolve([{ address: '93.184.216.34', family: 4 }]);

/** Where each request would have connected, by the pinned lookup, and to which host. */
let pinned: { host: string | undefined; address: unknown }[];

/** A requester that sends every request to the stub server, noting where it would have gone. */
const toStub: Requester = (_secure, options, onResponse) => {
  const lookup = options.lookup as unknown as (
    hostname: string,
    lookupOptions: object,
    callback: (error: Error | null, address: unknown) => void,
  ) => void;
  lookup(String(options.hostname), {}, (_error, address) => {
    pinned.push({ host: options.hostname ?? undefined, address });
  });
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

beforeEach(() => {
  pinned = [];
});

function html(body: string, headers: Record<string, string> = {}): Route {
  return (response) => {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'set-cookie': 'session=abc',
      ...headers,
    });
    response.end(body);
  };
}

function redirect(location: string): Route {
  return (response) => {
    response.writeHead(302, { location });
    response.end();
  };
}

const PAGE = `<!doctype html><html><head>
  <meta property="og:title" content="The intake guide">
  <meta property="og:description" content="How a patient is received.">
  <meta property="og:image" content="/intake.png">
</head><body>Body</body></html>`;

describe('fetching a page’s preview', () => {
  it('reads its title, description and image, sending nothing of the person’s', async () => {
    routes.set('/guide', html(PAGE));
    const fetcher = new LinkFetcher({ resolve: PUBLIC, request: toStub });
    expect(await fetcher.page('https://example.org/guide')).toEqual({
      ok: true,
      preview: {
        title: 'The intake guide',
        description: 'How a patient is received.',
        image: 'https://example.org/intake.png',
      },
    });
    expect(pinned).toEqual([{ host: 'example.org', address: '93.184.216.34' }]);
    const headers = requests[0]?.headers ?? {};
    expect(headers).not.toHaveProperty('cookie');
    expect(headers).not.toHaveProperty('authorization');
    expect(headers).not.toHaveProperty('referer');
    expect(headers['accept-encoding']).toBe('identity');
    // A cookie it was given is never sent back.
    await fetcher.page('https://example.org/guide');
    expect(requests[1]?.headers).not.toHaveProperty('cookie');
  });

  it.each([
    ['http://example.org/', 'only an https address is'],
    ['javascript:alert(1)', 'it is not an http or https address'],
    ['https://user:pw@example.org/', 'it holds a user name or a password'],
  ])('refuses %s before connecting', async (url, why) => {
    const fetched = await new LinkFetcher({ resolve: PUBLIC, request: toStub }).page(url);
    expect(fetched).toMatchObject({ ok: false, problem: { code: 'link-refused' } });
    if (!fetched.ok) expect(fetched.problem.message).toContain(why);
    expect(requests).toEqual([]);
  });

  it('never reaches this computer, the network or the metadata address, by name or as written', async () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.5',
      '169.254.169.254',
      '::1',
      'fd00::5',
      '0.0.0.0',
    ]) {
      const resolve: Resolver = () =>
        Promise.resolve([{ address, family: address.includes(':') ? 6 : 4 }]);
      const fetcher = new LinkFetcher({ resolve, request: toStub });
      const byName = await fetcher.page('https://example.org/');
      expect(byName, address).toMatchObject({ ok: false, problem: { code: 'link-refused' } });
      const host = address.includes(':') ? `[${address}]` : address;
      const written = await fetcher.page(`https://${host}/`);
      expect(written, address).toMatchObject({ ok: false, problem: { code: 'link-refused' } });
    }
    expect(requests).toEqual([]);
  });

  it('refuses a name when any address it resolves to is not public', async () => {
    const resolve: Resolver = () =>
      Promise.resolve([
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.0.10', family: 4 },
      ]);
    const fetched = await new LinkFetcher({ resolve, request: toStub }).page('https://a.org/');
    expect(fetched.ok).toBe(false);
    expect(requests).toEqual([]);
  });

  it('connects to the address checked, however the name answers after', async () => {
    routes.set('/', html('<title>Here</title>'));
    let asked = 0;
    const rebinding: Resolver = () => {
      asked += 1;
      return Promise.resolve([{ address: asked === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }]);
    };
    const fetched = await new LinkFetcher({ resolve: rebinding, request: toStub }).page(
      'https://a.org/',
    );
    expect(fetched).toEqual({ ok: true, preview: { title: 'Here' } });
    expect(pinned).toEqual([{ host: 'a.org', address: '93.184.216.34' }]);
    expect(asked).toBe(1);
  });

  it('follows a redirect, checking where it leads as the first address', async () => {
    routes.set('/short', redirect('https://www.example.org/long'));
    routes.set('/long', html('<title>Long</title>'));
    const fetched = await new LinkFetcher({ resolve: PUBLIC, request: toStub }).page(
      'https://example.org/short',
    );
    expect(fetched).toEqual({ ok: true, preview: { title: 'Long' } });
    expect(pinned.map((each) => each.host)).toEqual(['example.org', 'www.example.org']);
  });

  it('refuses a redirect to http, or to a name that leads to the network', async () => {
    routes.set('/clear', redirect('http://example.org/long'));
    routes.set('/inside', redirect('https://inside.example.org/'));
    const resolve: Resolver = (host) =>
      Promise.resolve([
        { address: host === 'inside.example.org' ? '10.1.2.3' : '93.184.216.34', family: 4 },
      ]);
    const fetcher = new LinkFetcher({ resolve, request: toStub });
    const clear = await fetcher.page('https://example.org/clear');
    expect(clear).toMatchObject({ ok: false, problem: { code: 'link-refused' } });
    if (!clear.ok) expect(clear.problem.message).toContain('which is not https');
    const inside = await fetcher.page('https://example.org/inside');
    expect(inside).toMatchObject({ ok: false, problem: { code: 'link-refused' } });
    if (!inside.ok) expect(inside.problem.message).toContain('10.1.2.3');
    expect(requests.map((each) => each.path)).toEqual(['/clear', '/inside']);
  });

  it('follows at most three redirects', async () => {
    routes.set('/loop', redirect('/loop'));
    const fetched = await new LinkFetcher({ resolve: PUBLIC, request: toStub }).page(
      'https://example.org/loop',
    );
    expect(fetched).toMatchObject({ ok: false, problem: { code: 'link-failed' } });
    if (!fetched.ok) expect(fetched.problem.message).toContain('redirects more than 3 times');
    expect(requests).toHaveLength(4);
  });

  it('reads a page past its cap as far as it came', async () => {
    routes.set('/big', html(`<title>Big</title>${'x'.repeat(4096)}`));
    const fetched = await new LinkFetcher({
      resolve: PUBLIC,
      request: toStub,
      limits: { pageBytes: 1024 },
    }).page('https://example.org/big');
    expect(fetched).toEqual({ ok: true, preview: { title: 'Big' } });
  });

  it.each([
    [
      'a status but 200',
      (response: ServerResponse) => {
        response.writeHead(500, { 'content-type': 'text/html' });
        response.end('<title>x</title>');
      },
      'with status 500',
    ],
    [
      'a type that is not HTML',
      (response: ServerResponse) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{}');
      },
      'answered with application/json, not text/html or application/xhtml+xml',
    ],
  ])('fails on %s', async (_, route, why) => {
    routes.set('/odd', route);
    const fetched = await new LinkFetcher({ resolve: PUBLIC, request: toStub }).page(
      'https://example.org/odd',
    );
    expect(fetched).toMatchObject({ ok: false, problem: { code: 'link-failed' } });
    if (!fetched.ok) expect(fetched.problem.message).toContain(why);
  });

  it('gives up on a page that does not answer in time', async () => {
    routes.set('/slow', () => {});
    const fetched = await new LinkFetcher({
      resolve: PUBLIC,
      request: toStub,
      limits: { pageMs: 200 },
    }).page('https://example.org/slow');
    expect(fetched).toMatchObject({ ok: false, problem: { code: 'link-failed' } });
    if (!fetched.ok) expect(fetched.problem.message).toContain('did not answer within 0.2 seconds');
  });

  it('decodes a page in the charset it says', async () => {
    routes.set('/latin', (response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=iso-8859-1' });
      response.end(Buffer.from([...Buffer.from('<title>Caf'), 0xe9, ...Buffer.from('</title>')]));
    });
    const fetched = await new LinkFetcher({ resolve: PUBLIC, request: toStub }).page(
      'https://example.org/latin',
    );
    expect(fetched).toEqual({ ok: true, preview: { title: 'Café' } });
  });
});

describe('fetching a preview’s image', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  it('takes a PNG, JPEG, WebP or GIF within its cap', async () => {
    routes.set('/a.png', (response) => {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(png);
    });
    const fetched = await new LinkFetcher({ resolve: PUBLIC, request: toStub }).image(
      'https://example.org/a.png',
    );
    expect(fetched).toEqual({ ok: true, bytes: new Uint8Array(png) });
  });

  it.each([
    ['an SVG', { 'content-type': 'image/svg+xml' }, 'answered with image/svg+xml'],
    ['a file past its cap', { 'content-type': 'image/png' }, 'is larger than 8 KiB'],
  ])('leaves out %s', async (_, headers, why) => {
    routes.set('/b', (response) => {
      response.writeHead(200, headers);
      response.end(Buffer.alloc(9 * 1024));
    });
    const fetched = await new LinkFetcher({
      resolve: PUBLIC,
      request: toStub,
      limits: { imageBytes: 8 * 1024 },
    }).image('https://example.org/b');
    expect(fetched.ok).toBe(false);
    if (!fetched.ok) expect(fetched.reason).toContain(why);
  });

  it('leaves out an image past its cap that does not say its size', async () => {
    routes.set('/c', (response) => {
      response.writeHead(200, { 'content-type': 'image/gif', 'transfer-encoding': 'chunked' });
      response.write(Buffer.alloc(6 * 1024));
      response.end(Buffer.alloc(6 * 1024));
    });
    const fetched = await new LinkFetcher({
      resolve: PUBLIC,
      request: toStub,
      limits: { imageBytes: 8 * 1024 },
    }).image('https://example.org/c');
    expect(fetched).toEqual({ ok: false, reason: 'is larger than 8 KiB' });
  });

  it('refuses an image at an http address', async () => {
    const fetched = await new LinkFetcher({ resolve: PUBLIC, request: toStub }).image(
      'http://example.org/a.png',
    );
    expect(fetched).toEqual({ ok: false, reason: 'is not https' });
    expect(requests).toEqual([]);
  });
});
