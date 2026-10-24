import type { Id } from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { CANVAS_BACKGROUNDS, contrastRatio } from '../colors';
import { definitionsOf } from '../definitions';
import { DARK_SHADES, darkShadeOf } from './dark';
import { ESSENCE, RELATES_TO } from './essence-and-relates-to';
import { BUILTIN_PACKAGES } from './index';

const dark = CANVAS_BACKGROUNDS.dark;
const components = [
  { id: ESSENCE_ID, appearance: ESSENCE.appearance },
  ...BUILTIN_PACKAGES.flatMap((file) => file.components),
];
const relationTypes = [
  { id: RELATES_TO_ID, appearance: RELATES_TO.appearance },
  ...BUILTIN_PACKAGES.flatMap((file) => file.relationTypes),
];

describe('the dark shades of built-in colors', () => {
  it('give a shade to every color a built-in definition sets itself, and to nothing else', () => {
    for (const { id, appearance } of components) {
      const set = (['fill', 'stroke'] as const).filter((trait) => appearance?.[trait] !== undefined);
      expect(Object.keys(DARK_SHADES.components[id] ?? {}).sort(), id).toEqual(set.sort());
    }
    for (const { id, appearance } of relationTypes) {
      const set = appearance?.stroke === undefined ? [] : ['stroke'];
      expect(Object.keys(DARK_SHADES.relationTypes[id] ?? {}), id).toEqual(set);
    }
    const known = new Set<Id>([...components, ...relationTypes].map((each) => each.id));
    for (const id of [
      ...Object.keys(DARK_SHADES.components),
      ...Object.keys(DARK_SHADES.relationTypes),
    ]) {
      expect(known.has(id), id).toBe(true);
    }
  });

  it('are written #RRGGBB in capitals', () => {
    const all = [
      ...Object.values(DARK_SHADES.components).flatMap((each) => Object.values(each)),
      ...Object.values(DARK_SHADES.relationTypes).flatMap((each) => Object.values(each)),
    ];
    for (const color of all) expect(color).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('read on the dark canvas: strokes well above 3:1 on it and on their fill, fills close to it', () => {
    const definitions = definitionsOf(BUILTIN_PACKAGES);
    for (const { id } of components) {
      const { fill, stroke } = definitions.component(id)?.darkColors ?? {};
      if (fill === undefined || stroke === undefined) throw new Error(`No dark colors for ${id}`);
      expect(contrastRatio(stroke, dark), id).toBeGreaterThanOrEqual(6);
      expect(contrastRatio(stroke, fill), id).toBeGreaterThanOrEqual(5.7);
      expect(contrastRatio(fill, dark), id).toBeLessThanOrEqual(1.35);
    }
    for (const { id } of relationTypes) {
      const stroke = definitions.relationType(id)?.darkStroke ?? '';
      expect(contrastRatio(stroke, dark), id).toBeGreaterThanOrEqual(6);
      for (const { id: on } of components) {
        const fill = definitions.component(on)?.darkColors.fill ?? '';
        expect(contrastRatio(stroke, fill), `${id} on ${on}`).toBeGreaterThanOrEqual(4.7);
      }
    }
  });

  it('are looked up by own key only', () => {
    expect(darkShadeOf('component', 'systems.service', 'fill')).toBe('#172B45');
    expect(darkShadeOf('relation-type', 'systems.communicates-with', 'stroke')).toBe('#AEB8C4');
    expect(darkShadeOf('component', 'constructor', 'fill')).toBeUndefined();
    expect(darkShadeOf('component', 'toString', 'stroke')).toBeUndefined();
    expect(darkShadeOf('relation-type', 'systems.queries', 'stroke')).toBeUndefined();
  });
});
