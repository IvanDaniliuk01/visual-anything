/**
 * `THIRD-PARTY-NOTICES.md` names what ships (ADR 0047's clarification of 2026-11-03). Building
 * everything takes minutes, so this test builds nothing: it fails when a production dependency of a
 * package that ships is missing from the notice or named at another version than the one installed,
 * and when the notice names a package that is not installed at the version it gives. An upgrade of a
 * dependency changes its version, and with it the packages it brings, so the test asks for
 * `pnpm notices` then. `pnpm notices --check` makes the full comparison, with the builds.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  THIRD_PARTY_FILE,
  namedPackages,
  packageFoldersOfPaths,
  thirdPartyMarkdown,
  unnamedPackages,
  type ShippedPackage,
} from './third-party';

const REPOSITORY = fileURLToPath(new URL('../../../', import.meta.url));
const notice = readFileSync(join(REPOSITORY, THIRD_PARTY_FILE), 'utf8');
const named = namedPackages(notice);

/** The packages whose production dependencies ship, and those dependencies that ship nothing. */
const SHIPPING_PACKAGES = ['app', 'server', 'core', 'schema'];
// A dependency that ships nothing is named here, with why: none today.
const SHIPS_NOTHING: Record<string, string> = {};

function installedVersion(owner: string, name: string): string {
  const manifest = join(REPOSITORY, 'packages', owner, 'node_modules', name, 'package.json');
  return (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).version;
}

describe('the notice of third-party code', () => {
  it('names every production dependency of what ships, at the version installed', () => {
    const missing: string[] = [];
    for (const owner of SHIPPING_PACKAGES) {
      const manifest = JSON.parse(
        readFileSync(join(REPOSITORY, 'packages', owner, 'package.json'), 'utf8'),
      ) as { dependencies?: Record<string, string> };
      for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
        if (range.startsWith('workspace:') || name in SHIPS_NOTHING) continue;
        const version = installedVersion(owner, name);
        if (!named.some((each) => each.name === name && each.version === version)) {
          missing.push(`${name}@${version} (a dependency of ${owner})`);
        }
      }
    }
    expect(missing, 'run pnpm notices and commit THIRD-PARTY-NOTICES.md').toEqual([]);
  });

  it('names only packages installed at the version it gives', () => {
    const store = new Set(readdirSync(join(REPOSITORY, 'node_modules', '.pnpm')));
    const stale = named.filter(({ name, version }) => {
      const prefix = `${name.replace('/', '+')}@${version}`;
      return ![...store].some((entry) => entry === prefix || entry.startsWith(`${prefix}_`));
    });
    expect(stale, 'run pnpm notices and commit THIRD-PARTY-NOTICES.md').toEqual([]);
  });

  it('keeps the license text of each package that has one, and the fonts’ license', () => {
    expect(named.length).toBeGreaterThan(50);
    expect(notice).toContain('### `elkjs` ');
    expect(notice).toContain('https://github.com/eclipse/elk');
    expect(notice).toContain('### `three` 0.186.1');
    expect(notice).toContain('Apache License');
    expect(notice).toContain('### Roboto Mono 3.000 Regular');
    expect(notice).not.toContain('libavoid');
  });

  it('flags the packages whose license is not a permissive one', () => {
    const flagged = /^Not under a permissive license.*$/m.exec(notice)?.[0] ?? '';
    for (const { name } of named) {
      const license = new RegExp(
        `### \`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\` \\S+\\n\\n- License: (.+)`,
      ).exec(notice)?.[1];
      if (license !== undefined && /MPL|EPL|GPL|see its files/.test(license)) {
        expect(flagged).toContain(`\`${name}\``);
      }
    }
  });
});

describe('the parts of the notice', () => {
  it('maps paths under node_modules to their package folders, scoped ones too', () => {
    const root = join('/', 'repo', 'packages', 'app');
    expect(
      packageFoldersOfPaths(
        [
          '/repo/node_modules/.pnpm/elkjs@0.12.0/node_modules/elkjs/lib/elk-worker.min.js?url',
          '\0/repo/node_modules/.pnpm/@pixi+colord@2.9.6/node_modules/@pixi/colord/index.mjs',
          '../../node_modules/.pnpm/three@0.186.1/node_modules/three/build/three.module.js',
          '/repo/packages/core/src/index.ts',
        ],
        root,
      ),
    ).toEqual(
      [
        '/repo/node_modules/.pnpm/@pixi+colord@2.9.6/node_modules/@pixi/colord',
        '/repo/node_modules/.pnpm/elkjs@0.12.0/node_modules/elkjs',
        join(root, '../../node_modules/.pnpm/three@0.186.1/node_modules/three'),
      ].sort(),
    );
  });

  it('names each package, flags copyleft ones and says which are missing', () => {
    const shipped = (name: string, license: string, files = 1): ShippedPackage => ({
      name,
      version: '1.0.0',
      license,
      source: `https://example.org/${name}`,
      parts: ['app'],
      files: Array.from({ length: files }, () => ({ name: 'LICENSE', text: `${license} text` })),
      author: 'Someone',
    });
    const text = thirdPartyMarkdown(
      [shipped('a', 'MIT'), shipped('b', 'MPL-2.0'), shipped('c', 'MIT', 0)],
      '## Fonts\n',
    );
    expect(namedPackages(text)).toEqual([
      { name: 'a', version: '1.0.0' },
      { name: 'b', version: '1.0.0' },
      { name: 'c', version: '1.0.0' },
    ]);
    expect(text).toContain(
      'Not under a permissive license, and shipped as their licenses allow: `b` (MPL-2.0).',
    );
    expect(text).toContain('its author as Someone');
    expect(text).toContain('### The MIT License');
    expect(
      unnamedPackages(
        [
          { name: 'a', version: '1.0.0' },
          { name: 'a', version: '2.0.0' },
        ],
        text,
      ),
    ).toEqual(['a@2.0.0']);
  });
});
