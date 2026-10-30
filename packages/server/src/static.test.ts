import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  contentTypeOf,
  folderFiles,
  memoryFiles,
  resolveAppPath,
  resolveStaticFile,
} from './static';

const root = resolve('static-root');

describe('resolveAppPath', () => {
  it.each([
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/assets/app.js', 'assets/app.js'],
    ['/assets/app.js?v=3', 'assets/app.js'],
    ['/hello%20world.txt', 'hello world.txt'],
    ['/..file.txt', '..file.txt'],
  ])('names %s by its path in the built app', (target, path) => {
    expect(resolveAppPath(target)).toEqual({ ok: true, path });
  });

  it.each([
    ['/../package.json', 403],
    ['/%2e%2e%2fpackage.json', 403],
    ['/assets\\..\\..\\package.json', 403],
    ['/C:/Windows/win.ini', 403],
    ['/index.html::$DATA', 403],
    ['/%00', 400],
    ['/%', 400],
    ['http://evil.example/index.html', 400],
    ['/assets/', 404],
    ['//index.html', 404],
  ])('refuses %s with %i, as it refuses a file of a folder', (target, status) => {
    expect(resolveAppPath(target)).toEqual({ ok: false, status });
  });
});

describe('memoryFiles', () => {
  it('reads the files it holds by their path, and nothing else', async () => {
    const files = memoryFiles(new Map([['assets/app.js', Buffer.from('app')]]));
    expect(await files.read('assets/app.js')).toEqual(Buffer.from('app'));
    expect(await files.read('assets/other.js')).toBeUndefined();
    expect(await files.read('ASSETS/APP.JS')).toBeUndefined();
  });
});

describe('folderFiles', () => {
  let folder: string;
  let dist: string;

  beforeAll(async () => {
    // The real path, as openStaticRoot gives it: the temporary folder may be reached through a link.
    folder = await realpath(await mkdtemp(join(tmpdir(), 'va-static-')));
    dist = join(folder, 'dist');
    await mkdir(join(dist, 'assets'), { recursive: true });
    await writeFile(join(dist, 'assets', 'app.js'), 'app');
    await writeFile(join(folder, 'secret.txt'), 'secret');
  });

  afterAll(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it('reads a file of the folder by its path', async () => {
    expect(await folderFiles(dist).read('assets/app.js')).toEqual(Buffer.from('app'));
  });

  it('reads nothing for a folder or a file it does not hold', async () => {
    expect(await folderFiles(dist).read('assets')).toBeUndefined();
    expect(await folderFiles(dist).read('missing.js')).toBeUndefined();
  });

  it('reads nothing through a link that leads outside the folder', async (context) => {
    try {
      await symlink(join(folder, 'secret.txt'), join(dist, 'secret.txt'), 'file');
    } catch {
      context.skip(
        'This user may not make symbolic links here: Windows lets only Developer Mode or an administrator make them.',
      );
    }
    expect(await folderFiles(dist).read('secret.txt')).toBeUndefined();
  });
});

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
    ['module.wasm', 'application/wasm'],
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
