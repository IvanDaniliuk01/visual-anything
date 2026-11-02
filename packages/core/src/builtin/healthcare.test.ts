/**
 * The built-in "Healthcare" package (ADR 0079, Track P5): what it defines, how its shapes read in both
 * themes, and its icons.
 */
import type { Color, ImageDefinition, SvgImage } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { CANVAS_BACKGROUNDS, contrastRatio } from '../colors';
import { definitionsOf } from '../definitions';
import { cleanSvg } from '../images/svg';
import { shippingProblems } from '../licenses';
import { HEALTHCARE } from './healthcare';
import { BUILTIN_PACKAGES, RESERVED_PACKAGE_IDS, builtinPackage } from './index';

const definitions = definitionsOf(BUILTIN_PACKAGES);
const id = (name: string) => `healthcare.${name}`;

function svgOf(image: ImageDefinition | undefined): SvgImage {
  if (image?.kind !== 'svg') throw new Error('The package’s pictures are SVG.');
  return image;
}

function colorsIn(svg: string): Color[] {
  return [...new Set(svg.match(/#[0-9A-F]{6}/g) ?? [])];
}

describe('the built-in Healthcare package', () => {
  it('is a valid package file, built in, with its reserved id', () => {
    expect(validateFile('package', HEALTHCARE)).toEqual({ ok: true, value: HEALTHCARE });
    expect(builtinPackage('healthcare')).toBe(HEALTHCARE);
    expect(BUILTIN_PACKAGES).toContain(HEALTHCARE);
    expect(RESERVED_PACKAGE_IDS.has('healthcare')).toBe(true);
    expect(HEALTHCARE.name).toBe('Healthcare');
  });

  it('defines what the spec lists', () => {
    expect(HEALTHCARE.components.map((each) => each.name)).toEqual([
      'Patient',
      'Encounter',
      'Provider',
      'Practitioner',
      'Provider organization',
      'Payer',
      'Plan',
      'Claim',
      'Claim line',
      'Authorization',
      'Audit',
      'Audit finding',
      'Care plan',
      'Goal',
      'Clinical record',
      'Observation',
      'Condition',
      'Procedure',
      'Medication',
    ]);
    expect(HEALTHCARE.relationTypes.map((each) => each.name)).toEqual([
      'treats',
      'is for',
      'is covered by',
      'requests',
      'is submitted to',
      'authorizes',
      'bills',
      'pays',
      'denies',
      'audits',
      'is found in',
      'addresses',
      'measures',
      'is part of',
    ]);
    const own = definitionsOf([HEALTHCARE]);
    expect(own.problems).toEqual([]);
    expect([...own.nestingRelationTypes]).toEqual([id('is-part-of')]);
  });

  it('derives the kinds of provider and of clinical record from theirs, all up to Essence', () => {
    const own = definitionsOf([HEALTHCARE]);
    for (const { id: each } of HEALTHCARE.components) {
      expect(own.component(each)?.lineage.at(-1)).toBe('essence');
    }
    for (const { id: each } of HEALTHCARE.relationTypes) {
      expect(own.relationType(each)?.lineage.at(-1)).toBe('relates-to');
    }
    const kinds = {
      provider: ['practitioner', 'provider-organization'],
      'clinical-record': ['observation', 'condition', 'procedure', 'medication'],
    };
    for (const [parent, children] of Object.entries(kinds)) {
      for (const child of children) {
        expect(own.componentDerives(id(child), id(parent)), child).toBe(true);
      }
    }
  });

  it('gives each component and relation type its attributes, with choices where they are few', () => {
    const attributes = (componentId: string) =>
      definitions.component(id(componentId))?.attributes.map((each) => each.name);
    expect(attributes('patient')).toEqual(['birthYear', 'recordNumber']);
    expect(attributes('encounter')).toEqual(['setting', 'date']);
    expect(attributes('practitioner')).toEqual(['specialty']);
    expect(attributes('provider-organization')).toEqual(['kind']);
    expect(attributes('payer')).toEqual(['kind']);
    expect(attributes('plan')).toEqual(['tier']);
    expect(attributes('claim')).toEqual(['number', 'status', 'total']);
    expect(attributes('claim-line')).toEqual(['code', 'quantity', 'amount']);
    expect(attributes('authorization')).toEqual(['number', 'status', 'quantity', 'validUntil']);
    expect(attributes('audit')).toEqual(['timing', 'period']);
    expect(attributes('audit-finding')).toEqual(['severity', 'amount', 'status']);
    expect(attributes('care-plan')).toEqual(['status', 'period']);
    expect(attributes('goal')).toEqual(['target', 'due']);
    expect(attributes('observation')).toEqual(['date', 'code', 'value']);
    expect(attributes('condition')).toEqual(['date', 'code', 'clinicalStatus']);
    expect(attributes('procedure')).toEqual(['date', 'code']);
    expect(attributes('medication')).toEqual(['date', 'code', 'dose']);
    const choices = (componentId: string, name: string) =>
      definitions.component(id(componentId))?.attributes.find((each) => each.name === name)
        ?.choices;
    expect(choices('claim', 'status')).toEqual([
      'draft',
      'submitted',
      'in review',
      'paid',
      'partly paid',
      'denied',
    ]);
    expect(choices('authorization', 'status')).toEqual([
      'requested',
      'approved',
      'denied',
      'expired',
    ]);
    expect(choices('audit', 'timing')).toEqual(['prepayment', 'postpayment']);
    expect(choices('encounter', 'setting')).toEqual([
      'ambulatory',
      'emergency',
      'inpatient',
      'virtual',
      'home',
    ]);
    const relationAttributes = (relationTypeId: string) =>
      definitions.relationType(id(relationTypeId))?.attributes.map((each) => each.name);
    expect(relationAttributes('is-covered-by')).toEqual(['memberId']);
    expect(relationAttributes('is-submitted-to')).toEqual(['date']);
    expect(relationAttributes('denies')).toEqual(['reason']);
  });

  it('limits the ends of its relation types as care is given and paid for, which only warns', () => {
    const limits = Object.fromEntries(
      HEALTHCARE.relationTypes.map((each) => [each.id.slice('healthcare.'.length), each.limits]),
    );
    const records = [id('clinical-record')];
    expect(limits).toEqual({
      treats: {
        from: [id('provider'), id('procedure'), id('medication')],
        to: [id('patient'), id('condition')],
      },
      'is-for': {
        from: [id('encounter'), id('claim'), id('authorization'), id('care-plan'), ...records],
        to: [id('patient')],
      },
      'is-covered-by': { from: [id('patient')], to: [id('plan'), id('payer')] },
      requests: { from: [id('provider')], to: [id('authorization')] },
      'is-submitted-to': { from: [id('claim'), id('authorization')], to: [id('payer')] },
      authorizes: {
        from: [id('authorization')],
        to: [id('procedure'), id('medication'), id('encounter'), id('claim-line')],
      },
      bills: { from: [id('claim'), id('claim-line')], to: [id('encounter'), ...records] },
      pays: { from: [id('payer')], to: [id('claim'), id('claim-line')] },
      denies: { from: [id('payer')], to: [id('claim'), id('claim-line'), id('authorization')] },
      audits: {
        from: [id('audit')],
        to: [
          id('claim'),
          id('claim-line'),
          id('encounter'),
          id('authorization'),
          id('provider'),
          ...records,
        ],
      },
      'is-found-in': {
        from: [id('audit-finding')],
        to: [id('claim'), id('claim-line'), id('encounter'), id('authorization'), ...records],
      },
      addresses: { from: [id('care-plan'), id('goal')], to: [id('condition')] },
      measures: { from: [id('observation')], to: [id('goal'), id('condition')] },
      'is-part-of': {
        to: [
          id('provider-organization'),
          id('payer'),
          id('claim'),
          id('audit'),
          id('care-plan'),
          id('encounter'),
        ],
      },
    });
  });

  it('draws a claim’s lines and a care plan’s goals as their rows', () => {
    expect(definitions.component(id('claim'))?.appearance.contentsAsRows).toBe(true);
    expect(definitions.component(id('care-plan'))?.appearance.contentsAsRows).toBe(true);
    for (const row of ['claim-line', 'goal']) {
      expect(definitions.component(id(row))?.appearance.height, row).toBe(32);
      const own = HEALTHCARE.components.find((each) => each.id === id(row));
      expect(own?.appearance?.image, row).toBeUndefined();
    }
  });

  it('names no mark and no real organization, and speaks of no one real', () => {
    const named = [
      HEALTHCARE.name,
      HEALTHCARE.description ?? '',
      ...[...HEALTHCARE.components, ...HEALTHCARE.relationTypes].flatMap((each) => [
        each.id,
        each.name,
        each.description ?? '',
        ...(each.attributes ?? []).map((attribute) => attribute.description ?? ''),
      ]),
    ];
    for (const text of named) {
      expect(text, text).not.toMatch(
        /\b(FHIR|HL7|SNOMED|LOINC|ICD|CPT|HIPAA|Medicare|Medicaid)\b/i,
      );
    }
  });

  it('ships under CC0 with its icons, at most 128 of them (ADR 0079)', () => {
    expect(shippingProblems(HEALTHCARE)).toEqual([]);
    expect(HEALTHCARE.license).toBe('CC0-1.0');
    expect((HEALTHCARE.images ?? []).length).toBeLessThanOrEqual(128);
    for (const image of HEALTHCARE.images ?? []) {
      expect(image.id.startsWith('healthcare.'), image.id).toBe(true);
      expect(image.source).toBe('Drawn for Visual Anything');
      const cleaned = cleanSvg(svgOf(image).svg);
      expect(cleaned.ok && cleaned.value.svg, image.id).toBe(svgOf(image).svg);
    }
  });
});

describe('how its shapes look', () => {
  it('gives every component an icon of its own package, but the rows, and uses every icon', () => {
    const images = new Set((HEALTHCARE.images ?? []).map((image) => image.id));
    const shown = new Set<string>();
    for (const component of HEALTHCARE.components) {
      const image = component.appearance?.image;
      if (component.id === id('claim-line') || component.id === id('goal')) {
        expect(image).toBeUndefined();
        continue;
      }
      expect(typeof image === 'object' && images.has(image.image), component.id).toBe(true);
      if (typeof image === 'object') shown.add(image.image);
    }
    expect(shown).toEqual(images);
  });

  it('writes names and strokes that read at 4.5:1 in the light theme, on its fills and the canvas', () => {
    for (const { id: each } of HEALTHCARE.components) {
      const { fill = '', stroke = '' } = definitions.component(each)?.appearance ?? {};
      expect(contrastRatio(stroke, fill), each).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(stroke, CANVAS_BACKGROUNDS.light), each).toBeGreaterThanOrEqual(4.5);
    }
    for (const { id: each } of HEALTHCARE.relationTypes) {
      const stroke = definitions.relationType(each)?.appearance.stroke ?? '';
      expect(contrastRatio(stroke, CANVAS_BACKGROUNDS.light), each).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('draws icons that read at 3:1 or more on their component’s fill, in both themes', () => {
    for (const component of HEALTHCARE.components) {
      const shown = component.appearance?.image;
      if (typeof shown !== 'object') continue;
      const image = svgOf(HEALTHCARE.images?.find((each) => each.id === shown.image));
      const resolved = definitions.component(component.id);
      for (const color of colorsIn(image.svg)) {
        for (const fill of [resolved?.appearance.fill, resolved?.darkColors.fill]) {
          expect(
            contrastRatio(color, fill ?? ''),
            `${component.id} ${color}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});
