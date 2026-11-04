import { createHmac, webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { proveSession, type ProofTools } from './session';

const location = { protocol: 'http:', host: '127.0.0.1:47700' };

/** Tools whose fetch answers as `answer` does, with the crypto of Node, which the browser's matches. */
function tools(answer: (url: string) => Promise<Response>): ProofTools {
  return {
    fetch: ((url: string) => answer(url)) as unknown as typeof fetch,
    crypto: webcrypto as unknown as Crypto,
  };
}

/** The proof the program answers, as security.ts makes it. */
function proofFor(token: string, url: string): string {
  const challenge = new URL(url).searchParams.get('challenge') ?? '';
  return createHmac('sha256', token)
    .update(`visual-anything session proof\n${challenge}`, 'utf8')
    .digest('base64url');
}

describe('proveSession (ADR 0099)', () => {
  it('is ok when the program answers the HMAC of a random challenge keyed by the token', async () => {
    const asked: string[] = [];
    const answer = tools((url) => {
      asked.push(url);
      return Promise.resolve(new Response(JSON.stringify({ proof: proofFor('s3cr3t', url) })));
    });
    expect(await proveSession(location, 's3cr3t', answer)).toBe('ok');
    expect(await proveSession(location, 's3cr3t', answer)).toBe('ok');
    expect(asked[0]).toMatch(
      /^http:\/\/127\.0\.0\.1:47700\/session\/proof\?challenge=[0-9a-f]{32}$/,
    );
    expect(asked[0]).not.toBe(asked[1]);
    expect(asked.join()).not.toContain('s3cr3t');
  });

  it('is other for a wrong proof or a refusal, and unreachable while nothing answers', async () => {
    const wrong = tools(() => Promise.resolve(new Response(JSON.stringify({ proof: 'nope' }))));
    expect(await proveSession(location, 's3cr3t', wrong)).toBe('other');
    const refused = tools(() => Promise.resolve(new Response('Not found.', { status: 404 })));
    expect(await proveSession(location, 's3cr3t', refused)).toBe('other');
    const down = tools(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await proveSession(location, 's3cr3t', down)).toBe('unreachable');
  });
});
