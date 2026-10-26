import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { definitionsOf } from '../definitions';
import { DATA_MODELING } from './data-modeling';
import { BUILTIN_PACKAGES, RESERVED_PACKAGE_IDS, builtinPackage } from './index';
import { SYSTEMS } from './systems';

describe('the built-in Data modeling package', () => {
  it('is a valid package file', () => {
    expect(validateFile('package', DATA_MODELING)).toEqual({ ok: true, value: DATA_MODELING });
  });

  it('defines Table, Column, "is column of" and "references", each id starting with "data-modeling."', () => {
    expect(DATA_MODELING.components.map((component) => component.name)).toEqual([
      'Table',
      'Column',
    ]);
    expect(DATA_MODELING.relationTypes.map((relationType) => relationType.name)).toEqual([
      'is column of',
      'references',
    ]);
    for (const { id } of [...DATA_MODELING.components, ...DATA_MODELING.relationTypes]) {
      expect(id.startsWith('data-modeling.')).toBe(true);
    }
  });

  it('derives everything up to Essence and "relates to", with no problems beside Systems', () => {
    const definitions = definitionsOf([SYSTEMS, DATA_MODELING]);
    expect(definitions.problems).toEqual([]);
    expect(definitions.relationType('data-modeling.is-column-of')?.nests).toBe(true);
    expect(definitions.relationType('data-modeling.references')?.nests).toBe(false);
    expect(definitions.component('data-modeling.table')?.appearance.contentsAsRows).toBe(true);
  });

  it('names only definitions it has, in its limits and its badges', () => {
    const definitions = definitionsOf([DATA_MODELING]);
    const known = (id: string) =>
      definitions.component(id) !== undefined || definitions.relationType(id) !== undefined;
    for (const relationType of DATA_MODELING.relationTypes) {
      for (const limit of [relationType.limits?.from, relationType.limits?.to]) {
        if (Array.isArray(limit)) for (const id of limit) expect(known(id)).toBe(true);
      }
    }
    for (const component of DATA_MODELING.components) {
      const attributes = new Set(
        definitions.component(component.id)?.attributes.map((attribute) => attribute.name),
      );
      for (const name of component.appearance?.detail?.attributes ?? []) {
        expect(attributes.has(name)).toBe(true);
      }
      for (const badge of component.appearance?.detail?.badges ?? []) {
        if (badge.when === 'from-end') expect(known(badge.relationType)).toBe(true);
        else expect(attributes.has(badge.attribute)).toBe(true);
      }
    }
  });

  it('gives column attributes no defaults, so their values are data and not particularities', () => {
    for (const component of DATA_MODELING.components) {
      for (const attribute of component.attributes ?? []) {
        expect(attribute.default).toBeUndefined();
      }
    }
  });

  it('is built in, and its id is reserved with those of the domains planned next', () => {
    expect(BUILTIN_PACKAGES.slice(0, 2)).toEqual([SYSTEMS, DATA_MODELING]);
    expect(builtinPackage('data-modeling')).toBe(DATA_MODELING);
    expect([...RESERVED_PACKAGE_IDS]).toEqual([
      'systems',
      'data-modeling',
      'c4',
      'data-science',
      'neuroscience',
      'physical-ai',
      'machine-learning',
      'process',
      'networks',
      'kubernetes',
      'control-and-circuits',
      'anatomy',
    ]);
    for (const builtin of BUILTIN_PACKAGES) expect(RESERVED_PACKAGE_IDS.has(builtin.id)).toBe(true);
  });
});
