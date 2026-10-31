import type { PackageFile, SolidDefinition } from '@visual-anything/schema';
import packageSchema from '@visual-anything/schema/schemas/package.schema.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import {
  LICENSE_PATTERN,
  SHIPPABLE_LICENSES,
  VERSION_PATTERN,
  isLicenseId,
  isShippableLicense,
  shippingProblems,
} from '../licenses';
import { BUILTIN_PACKAGES } from './index';

describe('licenses and versions as files write them', () => {
  it('follow the published schema', () => {
    expect(LICENSE_PATTERN.source).toBe(packageSchema.definitions.LicenseId.pattern);
    expect(VERSION_PATTERN.source).toBe(packageSchema.definitions.PackageVersion.pattern);
    for (const license of SHIPPABLE_LICENSES) expect(isLicenseId(license)).toBe(true);
  });
});

describe('the licenses content may ship under (ADR 0047)', () => {
  it('are exactly the ones ADR 0047 and ADR 0079 allow', () => {
    expect([...SHIPPABLE_LICENSES]).toEqual([
      'CC0-1.0',
      'CC-BY-4.0',
      'MIT',
      'ISC',
      'BSD-2-Clause',
      'BSD-3-Clause',
      'Apache-2.0',
      'CC-PDM-1.0',
      'LicenseRef-public-domain',
    ]);
  });

  it('leave out share-alike, non-commercial, no-derivatives and unknown terms', () => {
    for (const license of [
      'CC-BY-SA-4.0',
      'CC-BY-NC-4.0',
      'CC-BY-ND-4.0',
      'GPL-3.0-only',
      'LicenseRef-proprietary',
      'mit',
      '',
      undefined,
    ]) {
      expect(isShippableLicense(license), String(license)).toBe(false);
    }
    expect(isShippableLicense('Apache-2.0')).toBe(true);
  });
});

describe('the license test: what ships with Visual Anything', () => {
  it.each(BUILTIN_PACKAGES.map((file) => [file.id, file] as const))(
    'the built-in package %s and every image in it carry a license that lets them ship',
    (_id, file) => {
      expect(shippingProblems(file)).toEqual([]);
    },
  );

  it('says what keeps a package from shipping', () => {
    const file: PackageFile = {
      id: 'icons',
      name: 'Icons',
      license: 'CC-BY-SA-4.0',
      components: [],
      relationTypes: [],
      images: [
        {
          kind: 'svg',
          id: 'icons.a',
          name: 'A',
          width: 24,
          height: 24,
          svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"/>',
        },
        {
          kind: 'svg',
          id: 'icons.b',
          name: 'B',
          source: 'Some set',
          license: 'CC-BY-NC-4.0',
          width: 24,
          height: 24,
          svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"/>',
        },
      ],
    };
    expect(shippingProblems(file)).toEqual([
      'The package "icons" is under CC-BY-SA-4.0, which is not a license that lets it ship.',
      'The package "icons" says nothing about whom to credit: it needs an attribution.',
      'The image "icons.a" says nothing about where it comes from: it needs a source.',
      'The image "icons.a" has no license.',
      'The image "icons.b" is under CC-BY-NC-4.0, which is not a license that lets it ship.',
    ]);
    expect(shippingProblems({ ...file, license: undefined, images: undefined })).toEqual([
      'The package "icons" has no license.',
      'The package "icons" says nothing about whom to credit: it needs an attribution.',
    ]);
  });

  it('asks every solid for a source, a license that lets it ship and a description (ADR 0075)', () => {
    const solid: SolidDefinition = {
      id: 'arms.arm',
      name: 'Arm',
      hash: 'a'.repeat(64),
      bytes: 1000,
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      counts: { triangles: 12, vertices: 8, nodes: 1, textures: 0 },
      parts: [],
      camera: { azimuth: 30, elevation: 20 },
    };
    const file: PackageFile = {
      id: 'arms',
      name: 'Arms',
      license: 'CC0-1.0',
      attribution: 'Visual Anything contributors',
      components: [],
      relationTypes: [],
      solids: [
        solid,
        { ...solid, id: 'arms.b', source: 'Some set', license: 'CC-BY-NC-4.0', description: ' ' },
        {
          ...solid,
          id: 'arms.c',
          source: 'Drawn for us',
          license: 'CC0-1.0',
          description: 'A box.',
        },
      ],
    };
    expect(shippingProblems(file)).toEqual([
      'The solid "arms.arm" says nothing about where it comes from: it needs a source.',
      'The solid "arms.arm" has no license.',
      'The solid "arms.arm" has no description, which is its text alternative.',
      'The solid "arms.b" is under CC-BY-NC-4.0, which is not a license that lets it ship.',
      'The solid "arms.b" has no description, which is its text alternative.',
    ]);
  });
});
