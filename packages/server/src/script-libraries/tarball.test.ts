/**
 * The strict reader of npm tarballs (ADR 0107): regular files and folders only, every path inside the
 * package, every header's checksum and size checked, and nothing in it ever run.
 */
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { TarballRefusal, readTar, readTarball } from './tarball';
import { paxEntry, tar, tarEntry, tarball } from './test/registry-stub';

describe('readTarball', () => {
  it('reads the regular files under the tarball’s own folder, by their paths inside the package', async () => {
    const files = await readTarball(
      gzipSync(
        tar([
          { name: 'package/', type: '5' },
          { name: 'package/package.json', body: '{"name":"d3"}' },
          { name: 'package/dist/', type: '5' },
          { name: 'package/dist/d3.min.js', body: 'var d3 = {};' },
          { name: 'd3.min.js', prefix: 'package/dist/umd', body: 'umd' },
        ]),
      ),
    );
    expect([...files.keys()]).toEqual(['package.json', 'dist/d3.min.js', 'dist/umd/d3.min.js']);
    expect(files.get('dist/d3.min.js')?.toString()).toBe('var d3 = {};');
  });

  it('takes a pax or GNU long name for the next entry', async () => {
    const long = `package/${'a'.repeat(120)}/index.js`;
    const files = await readTarball(
      gzipSync(
        tar([
          paxEntry({ path: long }),
          { name: 'package/short', body: 'one' },
          { name: '././@LongLink', type: 'L', body: `package/${'b'.repeat(110)}.js\0` },
          { name: 'package/cut', body: 'two' },
        ]),
      ),
    );
    expect([...files.keys()]).toEqual([`${'a'.repeat(120)}/index.js`, `${'b'.repeat(110)}.js`]);
  });

  it('refuses what is not gzip, a damaged gzip, and one that inflates past its cap', async () => {
    await expect(readTarball(tar([{ name: 'package/a', body: 'x' }]))).rejects.toThrow(
      TarballRefusal,
    );
    const zipped = tarball({ 'index.js': 'x' });
    zipped.writeUInt8((zipped.at(-6) ?? 0) ^ 0xff, zipped.length - 6);
    await expect(readTarball(zipped)).rejects.toThrow(/damaged/);
    await expect(
      readTarball(tarball({ 'big.js': 'x'.repeat(100_000) }), {
        inflatedBytes: 10_000,
        entries: 10,
      }),
    ).rejects.toThrow(/once inflated/);
  });

  it('refuses links of every kind, devices and FIFOs', () => {
    for (const entry of [
      { name: 'package/link', type: '2', linkname: '/etc/passwd' },
      { name: 'package/hard', type: '1', linkname: 'package/index.js' },
      { name: 'package/device', type: '3' },
      { name: 'package/block', type: '4' },
      { name: 'package/fifo', type: '6' },
      { name: 'package/long-link', type: 'K', body: 'x' },
    ]) {
      expect(() => readTar(tar([entry])), entry.type).toThrow(TarballRefusal);
    }
    expect(() =>
      readTar(tar([paxEntry({ linkpath: '/etc' }), { name: 'package/a', body: 'x' }])),
    ).toThrow(/link/);
  });

  it('refuses every path outside the package', () => {
    for (const name of [
      '/etc/passwd',
      'package/../../outside.js',
      'package/./index.js',
      'package//index.js',
      'package\\..\\outside.js',
      'C:/Windows/evil.js',
      'index.js',
    ]) {
      expect(() => readTar(tar([{ name, body: 'x' }])), name).toThrow(/outside the package/);
    }
    expect(() => readTar(tar([paxEntry({ path: 'package/../x' }), { name: 'package/a' }]))).toThrow(
      /outside/,
    );
  });

  it('refuses a path twice, whatever its case', () => {
    expect(() =>
      readTar(
        tar([
          { name: 'package/index.js', body: 'a' },
          { name: 'package/INDEX.js', body: 'b' },
        ]),
      ),
    ).toThrow(/twice/);
  });

  it('refuses a header that fails its checksum, a size past what is left, or one it cannot read', () => {
    const damaged = tarEntry({ name: 'package/a.js', body: 'x' });
    damaged[0] = 'q'.charCodeAt(0);
    expect(() => readTar(Buffer.concat([damaged, Buffer.alloc(1024)]))).toThrow(/checksum/);
    expect(() => readTar(tar([{ name: 'package/a.js', body: 'x', size: 10_000 }]))).toThrow(
      /larger than what is left/,
    );
    const binary = tarEntry({ name: 'package/a.js', body: 'x' });
    binary[124] = 0x80;
    expect(() => readTar(Buffer.concat([binary, Buffer.alloc(1024)]))).toThrow(TarballRefusal);
    expect(() => readTar(tarEntry({ name: 'package/a.js', body: 'x' }).subarray(0, 300))).toThrow(
      /ends inside/,
    );
  });

  it('refuses more entries than its cap', () => {
    const entries = Array.from({ length: 5 }, (_, n) => ({ name: `package/${n}.js`, body: 'x' }));
    expect(() => readTar(tar(entries), 4)).toThrow(/more than 4 entries/);
  });
});
