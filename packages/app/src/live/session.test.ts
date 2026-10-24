import { describe, expect, it } from 'vitest';
import { liveUrl, rememberSessionToken, takeSessionToken } from './session';

describe('takeSessionToken', () => {
  it('reads a launch code from the fragment of the address the local program opened', () => {
    window.history.replaceState(null, '', '/#launch=c0de-L4unch_');
    expect(takeSessionToken(window)).toEqual({ launch: 'c0de-L4unch_' });
  });

  it('removes the launch code from the address and the tab’s history, leaving the rest', () => {
    window.history.replaceState(null, '', '/app/?mode=dev#launch=c0de');
    takeSessionToken(window);
    expect(window.location.href).toBe('http://localhost:3000/app/?mode=dev');
    expect(window.location.hash).toBe('');
  });

  it('leaves the theme hint beside the launch code in the address, for the theme to read', () => {
    window.history.replaceState(null, '', '/#launch=c0de&theme=dark');
    expect(takeSessionToken(window)).toEqual({ launch: 'c0de' });
    expect(window.location.hash).toBe('#theme=dark');
  });

  it('keeps no launch code: it works once, so a reload uses the session token instead', () => {
    window.history.replaceState(null, '', '/#launch=c0de');
    takeSessionToken(window);
    expect(takeSessionToken(window)).toBeNull();
    rememberSessionToken(window, 's3cr3t');
    expect(takeSessionToken(window)).toEqual({ token: 's3cr3t' });
  });

  it('prefers a launch code in the fragment to a token kept from an earlier session', () => {
    rememberSessionToken(window, 'old');
    window.history.replaceState(null, '', '/#launch=new');
    expect(takeSessionToken(window)).toEqual({ launch: 'new' });
    expect(takeSessionToken(window)).toEqual({ token: 'old' });
  });

  it('never takes a session token from the address, and removes one found there', () => {
    window.history.replaceState(null, '', '/#token=s3cr3t');
    expect(takeSessionToken(window)).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('finds nothing when the fragment has no code and no token was kept', () => {
    expect(takeSessionToken(window)).toBeNull();
    window.history.replaceState(null, '', '/#launch=');
    expect(takeSessionToken(window)).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('still reads a launch code when session storage is unavailable', () => {
    window.history.replaceState(null, '', '/#launch=c0de');
    const withoutStorage = {
      location: window.location,
      history: window.history,
      get sessionStorage(): Storage {
        throw new DOMException('Storage is disabled.', 'SecurityError');
      },
    };
    expect(takeSessionToken(withoutStorage)).toEqual({ launch: 'c0de' });
    expect(() => rememberSessionToken(withoutStorage, 's3cr3t')).not.toThrow();
    expect(takeSessionToken(withoutStorage)).toBeNull();
  });
});

describe('liveUrl', () => {
  it('opens the live connection on the host that served the app, carrying the token', () => {
    expect(liveUrl({ protocol: 'http:', host: '127.0.0.1:4321' }, { token: 's3cr3t' })).toBe(
      'ws://127.0.0.1:4321/live?token=s3cr3t',
    );
  });

  it('carries a launch code instead, the first time', () => {
    expect(liveUrl({ protocol: 'http:', host: '127.0.0.1:4321' }, { launch: 'c0de' })).toBe(
      'ws://127.0.0.1:4321/live?launch=c0de',
    );
  });

  it('takes a bare string as the session token', () => {
    expect(liveUrl({ protocol: 'http:', host: 'h' }, 's3cr3t')).toBe('ws://h/live?token=s3cr3t');
  });

  it('uses a secure WebSocket when the app was served over HTTPS', () => {
    expect(liveUrl({ protocol: 'https:', host: 'example.test' }, { token: 's3cr3t' })).toBe(
      'wss://example.test/live?token=s3cr3t',
    );
  });

  it('encodes what it carries', () => {
    expect(liveUrl({ protocol: 'http:', host: 'h' }, { token: 'a b&c' })).toBe(
      'ws://h/live?token=a+b%26c',
    );
  });
});
