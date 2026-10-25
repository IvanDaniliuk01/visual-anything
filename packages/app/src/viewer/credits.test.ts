import type { PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { creditsOf } from './credits';

const sample = loadSample();

describe('The credits of a page’s packages', () => {
  it('name each package the project uses, in its order, and say which are built in', () => {
    const [systems, clinic] = creditsOf(sample);
    // A built-in package says its license and attribution, as every one that ships does (ADR 0047).
    expect(systems).toMatchObject({ id: 'systems', name: 'Systems', builtIn: true });
    expect(systems?.license).toEqual(expect.any(String));
    expect(systems?.attribution).toEqual(expect.any(String));
    expect(clinic).toEqual({ id: 'clinic', name: 'Clinic', builtIn: false, imageSources: [] });
  });

  it('give a package’s version, license and attribution, and its images’ sources, where it has them', () => {
    const attributed = {
      ...sample.packages[1],
      version: '1.2.0',
      license: 'CC-BY-4.0',
      attribution: 'Icons by Someone, CC BY 4.0',
      images: [
        {
          kind: 'svg',
          id: 'clinic.a',
          name: 'A',
          width: 1,
          height: 1,
          svg: '<svg/>',
          source: 'Lucide',
          license: 'ISC',
        },
        {
          kind: 'svg',
          id: 'clinic.b',
          name: 'B',
          width: 1,
          height: 1,
          svg: '<svg/>',
          source: 'Lucide',
          license: 'ISC',
        },
        { kind: 'svg', id: 'clinic.c', name: 'C', width: 1, height: 1, svg: '<svg/>' },
      ],
    } as unknown as PackageFile;
    const [, clinic] = creditsOf({ ...sample, packages: [sample.packages[0]!, attributed] });
    expect(clinic).toEqual({
      id: 'clinic',
      name: 'Clinic',
      builtIn: false,
      version: '1.2.0',
      license: 'CC-BY-4.0',
      attribution: 'Icons by Someone, CC BY 4.0',
      imageSources: ['Lucide, ISC'],
    });
  });

  it('pass over fields that are not text', () => {
    const odd = {
      ...sample.packages[1],
      version: 3,
      license: { id: 'MIT' },
    } as unknown as PackageFile;
    const [, clinic] = creditsOf({ ...sample, packages: [sample.packages[0]!, odd] });
    expect(clinic).not.toHaveProperty('version');
    expect(clinic).not.toHaveProperty('license');
  });
});
