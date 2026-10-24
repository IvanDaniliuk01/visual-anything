import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentTypeOf, resolveStaticFile } from './static';

const root = resolve('static-root');

describe('resolveStaticFile', () => {
  it.each([
    ['/', ['index.html']],
    ['/index.html', ['index.html']],
    ['/assets/app.js', ['assets', 'app.js']],
    ['/assets/app.js?v=3', ['assets', 'app.js']],
    ['/hello%20world.txt', ['hello world.txt']],
    ['/assets/%61pp.js', ['assets', 'app.js']],
    ['/..file.txt', ['..file.txt']],
  ])('finds %s inside the root', (target, segments) => {
    expect(resolveStaticFile(root, target)).toEqual({ ok: true, file: join(root, ...segments) });
  });

  it.each([
    '/../package.json',
    '/%2e%2e/package.json',
    '/%2E%2E/package.json',
    '/assets/../../package.json',
    '/assets/%2e%2e/%2e%2e/package.json',
    '/..%2fpackage.json',
    '/%2e%2e%2fpackage.json',
    '/..%5cpackage.json',
    '/..\\package.json',
    '/assets\\..\\..\\package.json',
    '/%5c%5cserver%5cshare%5cfile.txt',
    '/./index.html',
    '/C:/Windows/win.ini',
    '/c%3A/Windows/win.ini',
    '/C:%5CWindows%5Cwin.ini',
    '/index.html::$DATA',
  ])('refuses %s with 403', (target) => {
    expect(resolveStaticFile(root, target)).toEqual({ ok: false, status: 403 });
  });

  it.each([
    ['a NUL byte', '/%00'],
    ['a NUL byte inside a name', '/index.html%00.js'],
    ['a malformed escape', '/%E0%A4%A'],
    ['a lone percent sign', '/%'],
    ['an absolute URL', 'http://evil.example/index.html'],
    ['the asterisk form', '*'],
    ['an empty target', ''],
  ])('refuses %s with 400', (_case, target) => {
    expect(resolveStaticFile(root, target)).toEqual({ ok: false, status: 400 });
  });

  it.each(['/assets/', '//index.html', '/%2Fetc%2Fpasswd', '/assets//app.js'])(
    'does not look up %s, which names no file',
    (target) => {
      expect(resolveStaticFile(root, target)).toEqual({ ok: false, status: 404 });
    },
  );
});

describe('contentTypeOf', () => {
  it.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['app.js', 'text/javascript; charset=utf-8'],
    ['worker.mjs', 'text/javascript; charset=utf-8'],
    ['style.css', 'text/css; charset=utf-8'],
    ['logo.svg', 'image/svg+xml'],
    ['icon.png', 'image/png'],
    ['favicon.ico', 'image/x-icon'],
    ['data.json', 'application/json; charset=utf-8'],
    ['app.js.map', 'application/json; charset=utf-8'],
    ['font.woff2', 'font/woff2'],
    ['robots.txt', 'text/plain; charset=utf-8'],
    ['INDEX.HTML', 'text/html; charset=utf-8'],
  ])('gives %s the type %s', (file, type) => {
    expect(contentTypeOf(file)).toBe(type);
  });

  it('serves any other file as bytes', () => {
    expect(contentTypeOf('archive.bin')).toBe('application/octet-stream');
    expect(contentTypeOf('LICENSE')).toBe('application/octet-stream');
  });
});
