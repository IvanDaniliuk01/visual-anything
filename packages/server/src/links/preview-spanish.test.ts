/**
 * What the local program says of a link card's preview, in Spanish (ADR 0038, ADR 0098 stage 3): why
 * it is not fetched or could not be, and what it leaves out; the app reads each through its catalog's
 * templates. Nothing here reaches the internet: every request goes to a stub server on 127.0.0.1.
 */
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { untranslatedParts } from '@visual-anything/app/src/i18n/translate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Requester, Resolver } from '../live-fetch';
import { fetchPreview } from './preview';
import { LinkFetcher } from './preview-fetch';

const inEnglish = (message: string) => untranslatedParts('es', message);

let server: Server;
let port: number;

beforeEach(async () => {
  server = createServer((request, response) => {
    const url = request.url ?? '';
    if (url === '/clear') {
      response.writeHead(302, { location: 'http://example.org/' });
      response.end();
    } else if (url === '/loop') {
      response.writeHead(302, { location: '/loop' });
      response.end();
    } else if (url === '/odd') {
      response.writeHead(302, { location: 'javascript:alert(1)' });
      response.end();
    } else if (url === '/json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    } else if (url === '/untyped') {
      response.writeHead(200);
      response.end('<title>x</title>');
    } else if (url === '/gone') {
      response.writeHead(404, { 'content-type': 'text/html' });
      response.end();
    } else if (url === '/slow') {
      // Never answers.
    } else if (url === '/page') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(
        '<head><title>T</title><meta property="og:image" content="https://example.org/big.png"></head>',
      );
    } else if (url === '/svg-page') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<head><meta property="og:image" content="https://example.org/a.svg"></head>');
    } else if (url === '/fake-page') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(
        '<head><meta property="og:image" content="https://example.org/fake.png"></head>',
      );
    } else if (url === '/big.png') {
      response.writeHead(200, { 'content-type': 'image/png', 'content-length': '20000' });
      response.end(Buffer.alloc(20000));
    } else if (url === '/a.svg') {
      response.writeHead(200, { 'content-type': 'image/svg+xml' });
      response.end('<svg/>');
    } else {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end('not a picture');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const toStub: Requester = (_secure, options, onResponse) =>
  httpRequest(
    { host: '127.0.0.1', port, path: options.path, method: 'GET', headers: options.headers },
    onResponse,
  );

const at =
  (address: string): Resolver =>
  () =>
    Promise.resolve([{ address, family: address.includes(':') ? 6 : 4 }]);

describe('what the program says of a link card’s preview, in Spanish', () => {
  it('says why a preview is not fetched, or could not be', async () => {
    const said: string[] = [];
    const page = async (fetcher: LinkFetcher, url: string) => {
      const fetched = await fetcher.page(url);
      if (!fetched.ok) said.push(fetched.problem.message);
    };
    const stub = new LinkFetcher({
      resolve: at('93.184.216.34'),
      request: toStub,
      limits: { pageMs: 300 },
    });
    for (const url of [
      'http://example.org/',
      'javascript:alert(1)',
      'not an address',
      'https://user:pw@example.org/',
      `https://example.org/${'a'.repeat(2100)}`,
      'https://example.org/clear',
      'https://example.org/loop',
      'https://example.org/odd',
      'https://example.org/json',
      'https://example.org/untyped',
      'https://example.org/gone',
      'https://example.org/slow',
    ]) {
      await page(stub, url);
    }
    for (const address of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '0.0.0.0', '224.0.0.1']) {
      await page(new LinkFetcher({ resolve: at(address), request: toStub }), 'https://a.org/');
      await page(new LinkFetcher({ request: toStub }), `https://${address}/`);
    }
    await page(new LinkFetcher({ resolve: at('192.0.2.1'), request: toStub }), 'https://a.org/');
    await page(new LinkFetcher({ request: toStub }), 'https://192.0.2.1/');
    await page(
      new LinkFetcher({ resolve: () => Promise.reject(new Error('no')), request: toStub }),
      'https://a.org/',
    );
    expect(said.length).toBeGreaterThan(20);
    expect(said.flatMap(inEnglish)).toEqual([]);
  });

  it('says what it leaves out of a preview', async () => {
    const fetcher = new LinkFetcher({
      resolve: at('93.184.216.34'),
      request: toStub,
      limits: { imageBytes: 8 * 1024 },
    });
    const notes: string[] = [];
    for (const url of [
      'https://example.org/page',
      'https://example.org/svg-page',
      'https://example.org/fake-page',
    ]) {
      const answer = await fetchPreview(url, fetcher, () =>
        Promise.resolve({ ok: false, problem: { code: 'invalid-image', message: 'Not kept.' } }),
      );
      if (answer.ok) notes.push(...answer.notes);
    }
    expect(notes).toHaveLength(3);
    expect(notes.flatMap(inEnglish)).toEqual([]);
  });
});
