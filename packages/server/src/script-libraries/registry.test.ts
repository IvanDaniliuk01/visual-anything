/**
 * The registry fetcher (ADR 0107), against a stand-in for the registry on 127.0.0.1: only
 * `https://registry.npmjs.org/`, only to public addresses, no redirect, within its time and size.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { RegistryFetcher } from './registry';
import { startRegistryStub, type RegistryStub } from './test/registry-stub';

let stub: RegistryStub | undefined;

afterEach(async () => {
  await stub?.close();
  stub = undefined;
});

async function fetcherWith(
  routes: RegistryStub['routes'],
  limits: Partial<{ timeoutMs: number; tarballBytes: number; documentBytes: number }> = {},
  resolve?: RegistryStub['resolve'],
): Promise<RegistryFetcher> {
  stub = await startRegistryStub(routes);
  return new RegistryFetcher({ request: stub.request, resolve: resolve ?? stub.resolve, limits });
}

const DOCUMENT = 'https://registry.npmjs.org/d3/7.9.0';

describe('RegistryFetcher', () => {
  it('reads an address of the registry', async () => {
    const fetcher = await fetcherWith(new Map([['/d3/7.9.0', { body: '{"name":"d3"}' }]]));
    const visit = fetcher.visit();
    const read = await visit.get(DOCUMENT, 'document');
    visit.end();
    expect(read).toEqual({ ok: true, bytes: Buffer.from('{"name":"d3"}') });
  });

  it('refuses every address but https://registry.npmjs.org/, before resolving anything', async () => {
    let resolved = 0;
    const fetcher = await fetcherWith(new Map(), {}, () => {
      resolved += 1;
      return Promise.resolve([{ address: '104.16.0.35', family: 4 }]);
    });
    const visit = fetcher.visit();
    for (const url of [
      'http://registry.npmjs.org/d3/7.9.0',
      'https://registry.npmjs.org.evil.example/d3',
      'https://cdn.jsdelivr.net/npm/d3@7/+esm',
      'https://registry.npmjs.org:8443/d3',
      'https://user:pass@registry.npmjs.org/d3',
      'https://registry.npmjs.org/d3#x',
      'file:///etc/passwd',
      'not an address',
    ]) {
      expect(await visit.get(url, 'document'), url).toMatchObject({ ok: false, refused: true });
    }
    visit.end();
    expect(resolved).toBe(0);
    expect(stub?.asked).toEqual([]);
  });

  it('refuses a name that resolves to this computer or the person’s network', async () => {
    for (const address of ['127.0.0.1', '10.0.0.8', '169.254.169.254', '::1']) {
      const fetcher = await fetcherWith(new Map([['/d3/7.9.0', { body: '{}' }]]), {}, () =>
        Promise.resolve([
          { address: '104.16.0.35', family: 4 },
          { address, family: address.includes(':') ? 6 : 4 },
        ]),
      );
      const visit = fetcher.visit();
      expect(await visit.get(DOCUMENT, 'document'), address).toMatchObject({
        ok: false,
        refused: true,
      });
      visit.end();
      expect(stub?.asked).toEqual([]);
      await stub?.close();
      stub = undefined;
    }
  });

  it('follows no redirect and takes only 200', async () => {
    const fetcher = await fetcherWith(
      new Map([['/d3/7.9.0', { status: 302, body: 'https://evil.example/' }]]),
    );
    const visit = fetcher.visit();
    expect(await visit.get(DOCUMENT, 'document')).toMatchObject({ ok: false, refused: false });
    visit.end();
    expect(stub?.asked).toEqual(['/d3/7.9.0']);
  });

  it('stops past its size and its time', async () => {
    const big = await fetcherWith(new Map([['/d3/7.9.0', { body: 'x'.repeat(5000) }]]), {
      documentBytes: 1000,
    });
    let visit = big.visit();
    expect(await visit.get(DOCUMENT, 'document')).toMatchObject({ ok: false, refused: true });
    visit.end();
    await stub?.close();
    const slow = await fetcherWith(new Map([['/d3/7.9.0', { body: '{}', delay: 2000 }]]), {
      timeoutMs: 100,
    });
    visit = slow.visit();
    const read = await visit.get(DOCUMENT, 'document');
    visit.end();
    expect(read).toMatchObject({ ok: false, refused: false });
    if (!read.ok) expect(read.reason).toMatch(/did not answer within/);
  });
});
