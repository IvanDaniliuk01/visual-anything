import { describe, expect, it, vi } from 'vitest';
import { installTrustedTypes, trustedTypesRules, type TrustedTypesRules } from './trusted-types';

const page = { origin: 'http://127.0.0.1:47715', href: 'http://127.0.0.1:47715/' };

describe('the page’s Trusted Types policy', () => {
  const rules = trustedTypesRules(page);

  it('turns only the empty string into HTML, which PixiJS uses to empty an element', () => {
    expect(rules.createHTML('')).toBe('');
    for (const html of ['<b>x</b>', '<svg onload="alert(1)">', ' ', 'text']) {
      expect(() => rules.createHTML(html), html).toThrow(TypeError);
    }
  });

  it('loads scripts, such as workers, only from the page’s own origin', () => {
    expect(rules.createScriptURL('/assets/layout.worker-abc.js')).toBe(
      '/assets/layout.worker-abc.js',
    );
    expect(
      rules.createScriptURL(
        'http://127.0.0.1:47715/src/canvas/layout/worker.ts?worker_file&type=module',
      ),
    ).toBe('http://127.0.0.1:47715/src/canvas/layout/worker.ts?worker_file&type=module');
    for (const url of [
      'https://evil.example/x.js',
      'http://localhost:47715/x.js',
      'http://127.0.0.1:47716/x.js',
      'data:text/javascript,alert(1)',
      'blob:http://127.0.0.1:47715/5f0c',
      'javascript:alert(1)',
      '//evil.example/x.js',
    ]) {
      expect(() => rules.createScriptURL(url), url).toThrow(TypeError);
    }
  });

  it('makes no script from text', () => {
    expect(() => rules.createScript('alert(1)')).toThrow(TypeError);
    expect(() => rules.createScript('')).toThrow(TypeError);
  });

  it('is installed as the default policy where the browser has Trusted Types, and nowhere else', () => {
    const createPolicy = vi.fn<(name: string, rules: TrustedTypesRules) => unknown>();
    expect(installTrustedTypes({ trustedTypes: { createPolicy }, location: page })).toBe(true);
    const [name, installed] = createPolicy.mock.calls[0] ?? [];
    expect(name).toBe('default');
    expect(installed?.createHTML('')).toBe('');
    expect(() => installed?.createHTML('<b>x</b>')).toThrow(TypeError);
    expect(installTrustedTypes({ location: page })).toBe(false);
  });

  it('leaves a default policy already installed in place, so that strings stay refused', () => {
    const createPolicy = vi.fn(() => {
      throw new TypeError('Policy with name "default" already exists.');
    });
    expect(installTrustedTypes({ trustedTypes: { createPolicy }, location: page })).toBe(false);
  });
});
