/**
 * The starter packages (R38): C4 architecture and data-science pipelines, built in with their icons.
 */
import type { PackageFile } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { contrastRatio } from '../colors';
import { definitionsOf } from '../definitions';
import { cleanSvg } from '../images/svg';
import type { ProjectSnapshot } from '../snapshot';
import { C4 } from './c4';
import { DATA_SCIENCE } from './data-science';
import { BUILTIN_PACKAGES, RESERVED_PACKAGE_IDS, builtinPackage } from './index';

const STARTERS = [C4, DATA_SCIENCE] as const;

describe('the starter packages', () => {
  it.each(STARTERS.map((file) => [file.id, file] as const))(
    '%s is a valid package file, built in, with a reserved id',
    (id, file) => {
      expect(validateFile('package', file)).toEqual({ ok: true, value: file });
      expect(builtinPackage(id)).toBe(file);
      expect(BUILTIN_PACKAGES).toContain(file);
      expect(RESERVED_PACKAGE_IDS.has(id)).toBe(true);
    },
  );

  it('C4 defines what the spec lists, with structure and deployment nesting apart', () => {
    expect(C4.components.map((each) => each.name)).toEqual([
      'Person',
      'Software system',
      'Container',
      'Component',
      'Deployment node',
    ]);
    expect(C4.relationTypes.map((each) => each.name)).toEqual([
      'uses',
      'runs in',
      'delivers to',
      'is part of',
    ]);
    const definitions = definitionsOf([C4]);
    expect(definitions.problems).toEqual([]);
    expect([...definitions.nestingRelationTypes].sort()).toEqual(['c4.is-part-of', 'c4.runs-in']);
  });

  it('data-science pipelines define what the spec lists', () => {
    expect(DATA_SCIENCE.components.map((each) => each.name)).toEqual([
      'Source',
      'Transform',
      'Feature store',
      'Model',
      'Dashboard',
    ]);
    expect(DATA_SCIENCE.relationTypes.map((each) => each.name)).toEqual(['feeds', 'trains']);
    expect(definitionsOf([DATA_SCIENCE]).problems).toEqual([]);
  });

  it.each(STARTERS.map((file) => [file.id, file] as const))(
    '%s derives everything up to Essence and "relates to", and needs no other package',
    (_id, file) => {
      const definitions = definitionsOf([file]);
      for (const { id } of file.components) {
        expect(definitions.component(id)?.lineage.at(-1)).toBe('essence');
      }
      for (const { id } of file.relationTypes) {
        expect(definitions.relationType(id)?.lineage.at(-1)).toBe('relates-to');
      }
    },
  );

  it('gives every component an icon of its own package, but Person, whose shape is a person', () => {
    for (const file of STARTERS) {
      const images = new Set((file.images ?? []).map((image) => image.id));
      for (const component of file.components) {
        const image = component.appearance?.image;
        if (component.id === 'c4.person') {
          expect(component.appearance?.shape).toBe('person');
          continue;
        }
        expect(typeof image === 'object' && images.has(image.image), component.id).toBe(true);
      }
    }
  });

  it('opens in a project with every built-in package, with nothing to warn about', () => {
    const project: ProjectSnapshot = {
      project: {
        schemaVersion: 1,
        name: 'All',
        packages: BUILTIN_PACKAGES.map((file) => file.id),
      },
      model: {
        world: { id: 'world', component: 'essence', name: 'World' },
        elements: [],
        relations: [],
      },
      packages: [...BUILTIN_PACKAGES],
      views: [],
      scenarios: [],
      tours: [],
      comments: [],
    };
    expect(checkProject(project)).toEqual({ errors: [], warnings: [] });
  });
});

describe('the icons of the built-in packages', () => {
  const images = BUILTIN_PACKAGES.flatMap((file) =>
    (file.images ?? []).map((image) => [image.id, image] as const),
  );

  it.each(images)('%s is stored as cleaning writes it', (_id, image) => {
    if (image.kind !== 'svg') throw new Error('Built-in icons are SVG.');
    const cleaned = cleanSvg(image.svg);
    expect(cleaned.ok && cleaned.value.svg).toBe(image.svg);
    expect(cleaned.ok && cleaned.removed).toEqual([]);
    expect(cleaned.ok && [cleaned.value.width, cleaned.value.height]).toEqual([
      image.width,
      image.height,
    ]);
  });

  /** The colours each icon is drawn in, with the component that shows it. */
  function iconUses(file: PackageFile) {
    return file.components.flatMap((component) => {
      const shown = component.appearance?.image;
      if (typeof shown !== 'object') return [];
      const image = file.images?.find((each) => each.id === shown.image);
      if (image?.kind !== 'svg') return [];
      const colors = [...new Set(image.svg.match(/#[0-9A-F]{6}/g) ?? [])];
      return [{ component, colors }];
    });
  }

  it('read at 3:1 or more on their component’s fill, in both themes', () => {
    const definitions = definitionsOf(BUILTIN_PACKAGES);
    for (const file of STARTERS) {
      for (const { component, colors } of iconUses(file)) {
        const resolved = definitions.component(component.id);
        const light = resolved?.appearance.fill ?? '';
        const dark = resolved?.darkColors.fill ?? '';
        for (const color of colors) {
          expect(contrastRatio(color, light), `${component.id} ${color}`).toBeGreaterThanOrEqual(3);
          expect(contrastRatio(color, dark), `${component.id} ${color}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});
