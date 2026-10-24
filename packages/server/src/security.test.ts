import { describe, expect, it } from 'vitest';
import {
  checkLiveRequest,
  checkRequest,
  createToken,
  isAllowedHost,
  isAllowedOrigin,
  tokensMatch,
} from './security';

const port = 51234;

describe('isAllowedHost', () => {
  it.each([`127.0.0.1:${port}`, `localhost:${port}`, `LocalHost:${port}`])('allows %s', (host) => {
    expect(isAllowedHost(host, port)).toBe(true);
  });

  it.each([
    ['another port', `127.0.0.1:${port + 1}`],
    ['another port on localhost', `localhost:${port + 1}`],
    ['no port', '127.0.0.1'],
    ['another hostname', `evil.example:${port}`],
    ['a hostname that resolves to 127.0.0.1 (DNS rebinding)', `127.0.0.1.nip.io:${port}`],
    ['a subdomain of localhost', `app.localhost:${port}`],
    ['localhost with a trailing dot', `localhost.:${port}`],
    ['the IPv6 loopback', `[::1]:${port}`],
    ['the unspecified address', `0.0.0.0:${port}`],
    ['credentials before the host', `user@127.0.0.1:${port}`],
    ['an empty value', ''],
    ['no value', undefined],
  ])('refuses %s', (_case, host) => {
    expect(isAllowedHost(host, port)).toBe(false);
  });

  it('allows the hostnames without a port on port 80, where browsers leave the port out', () => {
    expect(isAllowedHost('127.0.0.1', 80)).toBe(true);
    expect(isAllowedHost('localhost', 80)).toBe(true);
    expect(isAllowedHost('127.0.0.1:80', 80)).toBe(true);
    expect(isAllowedHost('evil.example', 80)).toBe(false);
  });
});

describe('isAllowedOrigin', () => {
  it.each([`http://127.0.0.1:${port}`, `http://localhost:${port}`])('allows %s', (origin) => {
    expect(isAllowedOrigin(origin, port)).toBe(true);
  });

  it.each([
    ['another port', `http://127.0.0.1:${port + 1}`],
    ['another hostname', `http://evil.example:${port}`],
    ['a hostname that starts like ours', `http://127.0.0.1:${port}.evil.example`],
    ['the opaque origin null', 'null'],
    ['https on 127.0.0.1', `https://127.0.0.1:${port}`],
    ['https on localhost', `https://localhost:${port}`],
    ['a WebSocket scheme', `ws://127.0.0.1:${port}`],
    ['a trailing slash', `http://127.0.0.1:${port}/`],
    ['no port', 'http://127.0.0.1'],
    ['an empty value', ''],
    ['no value', undefined],
  ])('refuses %s', (_case, origin) => {
    expect(isAllowedOrigin(origin, port)).toBe(false);
  });

  it('allows the origins without a port on port 80, where browsers leave the port out', () => {
    expect(isAllowedOrigin('http://127.0.0.1', 80)).toBe(true);
    expect(isAllowedOrigin('http://localhost', 80)).toBe(true);
    expect(isAllowedOrigin('http://evil.example', 80)).toBe(false);
  });
});

describe('checkRequest', () => {
  const host = `127.0.0.1:${port}`;

  it('accepts a request for our host without an Origin, as a navigation sends it', () => {
    expect(checkRequest({ host, origin: undefined }, port)).toEqual({ ok: true });
  });

  it('accepts a request for our host from our own origin', () => {
    expect(checkRequest({ host, origin: `http://localhost:${port}` }, port)).toEqual({ ok: true });
  });

  it.each([
    ['a foreign host', `evil.example:${port}`, undefined],
    ['a missing host', undefined, undefined],
    ['a foreign origin', host, 'http://evil.example'],
    ['the origin null', host, 'null'],
  ])('refuses %s with 403', (_case, requestHost, origin) => {
    expect(checkRequest({ host: requestHost, origin }, port)).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe('checkLiveRequest', () => {
  const token = createToken();
  const session = { port, token };
  const host = `127.0.0.1:${port}`;
  const origin = `http://127.0.0.1:${port}`;

  it('accepts our host and origin with the session token', () => {
    expect(checkLiveRequest({ host, origin, url: `/live?token=${token}` }, session)).toEqual({
      ok: true,
    });
  });

  it.each([
    ['a foreign host', `evil.example:${port}`, origin],
    ['a foreign origin', host, 'http://evil.example'],
    ['the origin null', host, 'null'],
    ['a missing origin', host, undefined],
  ])('refuses %s with 403, even with the session token', (_case, requestHost, requestOrigin) => {
    const request = { host: requestHost, origin: requestOrigin, url: `/live?token=${token}` };
    expect(checkLiveRequest(request, session)).toMatchObject({ ok: false, status: 403 });
  });

  it.each([
    ['no token', '/live'],
    ['an empty token', '/live?token='],
    ['a wrong token', `/live?token=${createToken()}`],
    ['a shorter token', `/live?token=${token.slice(1)}`],
    ['the token twice', `/live?token=${token}&token=${token}`],
    ['the token under another name', `/live?session=${token}`],
  ])('refuses %s with 401', (_case, url) => {
    expect(checkLiveRequest({ host, origin, url }, session)).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});

describe('createToken', () => {
  it('makes 32 random bytes written in base64url', () => {
    const token = createToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('makes a new token every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createToken()));
    expect(tokens.size).toBe(50);
  });
});

describe('tokensMatch', () => {
  const token = createToken();

  it('matches the same token', () => {
    expect(tokensMatch(token, `${token}`)).toBe(true);
  });

  it.each([
    ['a different token of the same length', createToken()],
    ['a shorter token', token.slice(0, -1)],
    ['a longer token', `${token}A`],
    ['an empty token', ''],
    ['the same length in characters but not in bytes', `${token.slice(0, -1)}é`],
    ['no token', undefined],
  ])('does not match %s', (_case, received) => {
    expect(tokensMatch(token, received)).toBe(false);
  });
});
