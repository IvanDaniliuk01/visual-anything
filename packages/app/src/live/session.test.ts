import { describe, expect, it } from 'vitest';
import { liveUrl, takeSessionToken } from './session';

describe('takeSessionToken', () => {
  it('reads the token from the fragment of the address the local program opened', () => {
    window.history.replaceState(null, '', '/#token=s3cr3t-T0ken_');
    expect(takeSessionToken(window)).toBe('s3cr3t-T0ken_');
  });

  it('removes the token from the address, leaving the rest of the URL', () => {
    window.history.replaceState(null, '', '/app/?mode=dev#token=s3cr3t');
    takeSessionToken(window);
    expect(window.location.href).toBe('http://localhost:3000/app/?mode=dev');
    expect(window.location.hash).toBe('');
  });

  it('keeps the token, so that reloading the tab still connects', () => {
    window.history.replaceState(null, '', '/#token=s3cr3t');
    takeSessionToken(window);
    // A reload: same tab, same session storage, no fragment.
    expect(window.location.hash).toBe('');
    expect(takeSessionToken(window)).toBe('s3cr3t');
  });

  it('prefers a token in the fragment to one kept from an earlier session', () => {
    window.history.replaceState(null, '', '/#token=old');
    takeSessionToken(window);
    window.history.replaceState(null, '', '/#token=new');
    expect(takeSessionToken(window)).toBe('new');
    expect(takeSessionToken(window)).toBe('new');
  });

  it('finds no token when the fragment has none and none was kept', () => {
    expect(takeSessionToken(window)).toBeNull();
    window.history.replaceState(null, '', '/#token=');
    expect(takeSessionToken(window)).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('still reads the token from the fragment when session storage is unavailable', () => {
    window.history.replaceState(null, '', '/#token=s3cr3t');
    const withoutStorage = {
      location: window.location,
      history: window.history,
      get sessionStorage(): Storage {
        throw new DOMException('Storage is disabled.', 'SecurityError');
      },
    };
    expect(takeSessionToken(withoutStorage)).toBe('s3cr3t');
    expect(takeSessionToken(withoutStorage)).toBeNull();
  });
});

describe('liveUrl', () => {
  it('opens the live connection on the host that served the app, carrying the token', () => {
    expect(liveUrl({ protocol: 'http:', host: '127.0.0.1:4321' }, 's3cr3t')).toBe(
      'ws://127.0.0.1:4321/live?token=s3cr3t',
    );
  });

  it('uses a secure WebSocket when the app was served over HTTPS', () => {
    expect(liveUrl({ protocol: 'https:', host: 'example.test' }, 's3cr3t')).toBe(
      'wss://example.test/live?token=s3cr3t',
    );
  });

  it('encodes the token', () => {
    expect(liveUrl({ protocol: 'http:', host: 'h' }, 'a b&c')).toBe('ws://h/live?token=a+b%26c');
  });
});
