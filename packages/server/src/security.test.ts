import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LAUNCH_ADDRESS_SPENT,
  LAUNCH_CODE_LIFETIME,
  LaunchCodes,
  checkClaudeRequest,
  checkLiveRequest,
  challengeOf,
  checkRequest,
  createToken,
  isAllowedHost,
  isAllowedOrigin,
  sessionProof,
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
      via: 'token',
    });
  });

  describe('with a launch code', () => {
    it('accepts a launch code once', () => {
      const launchCodes = new LaunchCodes();
      const code = launchCodes.create();
      const url = `/live?launch=${code}`;
      expect(checkLiveRequest({ host, origin, url }, { ...session, launchCodes })).toEqual({
        ok: true,
        via: 'launch',
      });
      expect(checkLiveRequest({ host, origin, url }, { ...session, launchCodes })).toEqual({
        ok: false,
        status: 401,
        message: LAUNCH_ADDRESS_SPENT,
        reused: true,
      });
    });

    it('checks the host and the origin before spending the code', () => {
      const launchCodes = new LaunchCodes();
      const code = launchCodes.create();
      const url = `/live?launch=${code}`;
      const checked = { ...session, launchCodes };
      expect(checkLiveRequest({ host, origin: 'http://evil.example', url }, checked)).toMatchObject(
        {
          status: 403,
        },
      );
      expect(checkLiveRequest({ host, origin, url }, checked)).toMatchObject({ ok: true });
    });

    it.each([
      ['without launch codes', undefined, (code: string) => `/live?launch=${code}`],
      [
        'with the code twice',
        new LaunchCodes(),
        (code: string) => `/live?launch=${code}&launch=${code}`,
      ],
      [
        'with both a token and a code',
        new LaunchCodes(),
        (code: string) => `/live?launch=${code}&token=${token}`,
      ],
    ])('refuses a connection %s with 401', (_case, launchCodes, urlOf) => {
      const code = launchCodes?.create() ?? 'abc';
      const checked = launchCodes === undefined ? session : { ...session, launchCodes };
      expect(checkLiveRequest({ host, origin, url: urlOf(code) }, checked)).toMatchObject({
        ok: false,
        status: 401,
      });
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

describe('LaunchCodes', () => {
  it('makes codes of 16 random bytes in base64url', () => {
    const code = new LaunchCodes().create();
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Buffer.from(code, 'base64url')).toHaveLength(16);
  });

  it('redeems a code once', () => {
    const codes = new LaunchCodes();
    const code = codes.create();
    expect(codes.redeem(code)).toBe('ok');
    expect(codes.redeem(code)).toBe('used');
  });

  it('keeps one code open at a time: making a new one ends the old', () => {
    const codes = new LaunchCodes();
    const old = codes.create();
    const current = codes.create();
    expect(codes.redeem(old)).toBe('unknown');
    expect(codes.redeem(current)).toBe('ok');
  });

  it('ends a code two minutes after it was made', () => {
    let now = 1_000;
    const codes = new LaunchCodes({ now: () => now });
    expect(LAUNCH_CODE_LIFETIME).toBe(120_000);
    const code = codes.create();
    now += LAUNCH_CODE_LIFETIME;
    const late = codes.create();
    now += LAUNCH_CODE_LIFETIME + 1;
    expect(codes.redeem(code)).toBe('unknown');
    expect(codes.redeem(late)).toBe('expired');
    expect(codes.redeem(late)).toBe('unknown');
  });

  it.each([
    ['no code', undefined],
    ['an empty code', ''],
    ['a code it never made', 'AAAAAAAAAAAAAAAAAAAAAA'],
  ])('refuses %s', (_case, code) => {
    const codes = new LaunchCodes();
    codes.create();
    expect(codes.redeem(code)).toBe('unknown');
  });

  it('refuses everything before it makes a code', () => {
    expect(new LaunchCodes().redeem('AAAAAAAAAAAAAAAAAAAAAA')).toBe('unknown');
  });
});

describe('checkClaudeRequest', () => {
  const credential = createToken();
  const claude = { port, credential };
  const host = `127.0.0.1:${port}`;
  const authorization = `Bearer ${credential}`;

  it('accepts our host, no origin and Claude’s credential', () => {
    expect(checkClaudeRequest({ host, origin: undefined, authorization }, claude)).toEqual({
      ok: true,
    });
  });

  it.each([
    ['a foreign host', `evil.example:${port}`, undefined],
    ['our own origin, since only browsers send one', host, `http://${host}`],
    ['a foreign origin', host, 'http://evil.example'],
    ['the origin null', host, 'null'],
  ])('refuses %s with 403, even with the credential', (_case, requestHost, origin) => {
    expect(checkClaudeRequest({ host: requestHost, origin, authorization }, claude)).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it.each([
    ['no credential', undefined],
    ['an empty credential', 'Bearer '],
    ['a wrong credential', `Bearer ${createToken()}`],
    ['the credential without its scheme', credential],
    ['another scheme', `Basic ${credential}`],
    ['the credential with more after it', `Bearer ${credential} x`],
  ])('refuses %s with 401', (_case, value) => {
    expect(checkClaudeRequest({ host, origin: undefined, authorization: value }, claude)).toEqual({
      ok: false,
      status: 401,
      message: 'The Claude endpoint needs Claude’s credential.',
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

describe('sessionProof and challengeOf (ADR 0099)', () => {
  const token = createToken();
  const challenge = 'ab'.repeat(16);

  it('proves the token with an HMAC of the challenge, as the tab works it out', () => {
    const expected = createHmac('sha256', token)
      .update(`visual-anything session proof\n${challenge}`, 'utf8')
      .digest('base64url');
    expect(sessionProof(token, challenge)).toBe(expected);
    expect(sessionProof(createToken(), challenge)).not.toBe(expected);
    expect(sessionProof(token, 'cd'.repeat(16))).not.toBe(expected);
  });

  it('reads exactly one challenge of the form a tab makes', () => {
    expect(challengeOf(`/session/proof?challenge=${challenge}`)).toBe(challenge);
    expect(challengeOf('/session/proof')).toBeUndefined();
    expect(challengeOf('/session/proof?challenge=short')).toBeUndefined();
    expect(challengeOf(`/session/proof?challenge=${challenge}&challenge=${challenge}`)).toBe(
      undefined,
    );
  });
});
