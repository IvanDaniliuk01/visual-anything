/**
 * The built-in Finance package (P6, ADR 0079): accounts and their kinds in ledgers, journal entries
 * whose lines debit and credit them, transactions, payments and invoices, instruments held in
 * portfolios by positions, and the risks they are exposed to with the controls that mitigate them.
 */
import type { Component } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { CANVAS_BACKGROUNDS, contrastRatio } from '../colors';
import { definitionsOf } from '../definitions';
import { cleanSvg } from '../images/svg';
import { shippingProblems } from '../licenses';
import { FINANCE } from './finance';
import { ACCOUNT_ICONS, FINANCE_ICONS } from './finance-images';
import { BUILTIN_PACKAGES, RESERVED_PACKAGE_IDS, builtinPackage } from './index';

const definitions = definitionsOf(BUILTIN_PACKAGES);
const id = (name: string) => `finance.${name}`;
const ACCOUNT_KINDS = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

function component(name: string): Component {
  const found = FINANCE.components.find((each) => each.id === id(name));
  if (found === undefined) throw new Error(`No component ${id(name)}`);
  return found;
}

function colorsIn(svg: string): string[] {
  return [...new Set(svg.match(/#[0-9A-F]{6}/g) ?? [])];
}

describe('the built-in Finance package', () => {
  it('is a valid package file, built in, with a reserved id', () => {
    expect(validateFile('package', FINANCE)).toEqual({ ok: true, value: FINANCE });
    expect(builtinPackage('finance')).toBe(FINANCE);
    expect(BUILTIN_PACKAGES).toContain(FINANCE);
    expect(RESERVED_PACKAGE_IDS.has('finance')).toBe(true);
  });

  it('defines what the spec lists, nesting by "is part of" alone', () => {
    expect(FINANCE.components.map((each) => each.name)).toEqual([
      'Ledger',
      'Account',
      'Asset account',
      'Liability account',
      'Equity account',
      'Revenue account',
      'Expense account',
      'Journal entry',
      'Entry line',
      'Transaction',
      'Payment',
      'Invoice',
      'Party',
      'Instrument',
      'Portfolio',
      'Position',
      'Risk',
      'Control',
    ]);
    expect(FINANCE.relationTypes.map((each) => each.name)).toEqual([
      'posts to',
      'debits',
      'credits',
      'records',
      'issues',
      'pays',
      'settles',
      'holds',
      'is exposed to',
      'mitigates',
      'checks',
      'is part of',
    ]);
    const own = definitionsOf([FINANCE]);
    expect(own.problems).toEqual([]);
    expect([...own.nestingRelationTypes]).toEqual(['finance.is-part-of']);
    for (const each of [...FINANCE.components, ...FINANCE.relationTypes]) {
      expect(each.id.startsWith('finance.'), each.id).toBe(true);
    }
  });

  it('derives the kinds of account from Account, Payment from Transaction, and all up to Essence', () => {
    const own = definitionsOf([FINANCE]);
    for (const kind of ACCOUNT_KINDS) {
      expect(own.component(id(`${kind}-account`))?.lineage, kind).toEqual([
        id(`${kind}-account`),
        id('account'),
        'essence',
      ]);
    }
    expect(own.component(id('payment'))?.lineage).toEqual([
      id('payment'),
      id('transaction'),
      'essence',
    ]);
    for (const { id: each } of FINANCE.components) {
      expect(own.component(each)?.lineage.at(-1), each).toBe('essence');
    }
    for (const { id: each } of FINANCE.relationTypes) {
      expect(own.relationType(each)?.lineage.at(-1), each).toBe('relates-to');
    }
  });

  it('says which side increases each kind of account, as double entry does', () => {
    for (const kind of ['asset', 'expense']) {
      expect(component(`${kind}-account`).description, kind).toContain('debit');
    }
    for (const kind of ['liability', 'equity', 'revenue']) {
      expect(component(`${kind}-account`).description, kind).toContain('credit');
    }
  });

  it('debits and credits accounts from the lines of journal entries, which post to a ledger', () => {
    const limits = (name: string) => FINANCE.relationTypes.find((each) => each.id === id(name));
    for (const side of ['debits', 'credits']) {
      expect(limits(side)?.limits, side).toEqual({
        from: [id('entry-line')],
        to: [id('account')],
      });
      expect(limits(side)?.direction, side).toBe('directed');
    }
    expect(limits('posts-to')?.limits).toEqual({
      from: [id('journal-entry')],
      to: [id('ledger')],
    });
    expect(limits('mitigates')?.limits).toEqual({ from: [id('control')], to: [id('risk')] });
    expect(limits('is-exposed-to')?.limits).toEqual({ to: [id('risk')] });
  });

  it('draws a journal entry’s lines as its rows, each writing its amount and whether it debits or credits', () => {
    const entry = definitions.component(id('journal-entry'));
    expect(entry?.appearance.contentsAsRows).toBe(true);
    const line = definitions.component(id('entry-line'));
    expect(line?.appearance.detail).toMatchObject({
      componentName: false,
      attributes: ['amount'],
      badges: [
        { when: 'from-end', text: 'Dr', relationType: id('debits') },
        { when: 'from-end', text: 'Cr', relationType: id('credits') },
      ],
    });
    const amount = component('entry-line').attributes?.find((each) => each.name === 'amount');
    expect(amount?.type).toBe('number');
  });

  it('names in its limits only definitions it has', () => {
    const ids = new Set(FINANCE.components.map((each) => each.id));
    for (const type of FINANCE.relationTypes) {
      for (const end of [type.limits?.from, type.limits?.to]) {
        if (!Array.isArray(end)) continue;
        for (const each of end) expect(ids.has(each), `${type.id} ${each}`).toBe(true);
      }
    }
  });

  it('gives attributes as data, with choices and no defaults, and runs nothing', () => {
    expect(FINANCE.code).toBeUndefined();
    for (const each of FINANCE.components) {
      for (const attribute of each.attributes ?? []) {
        expect(attribute.default, `${each.id} ${attribute.name}`).toBeUndefined();
        expect(attribute.description, `${each.id} ${attribute.name}`).toBeDefined();
      }
    }
    const choices = (name: string, attribute: string) =>
      component(name).attributes?.find((each) => each.name === attribute)?.choices;
    expect(choices('risk', 'category')).toEqual([
      'market',
      'credit',
      'liquidity',
      'operational',
      'compliance',
    ]);
    expect(choices('control', 'kind')).toEqual(['preventive', 'detective', 'corrective']);
    expect(choices('invoice', 'status')).toEqual(['open', 'paid', 'overdue', 'cancelled']);
  });

  it('ships under CC0 with its pictures, at most 128 of them, all drawn for Visual Anything', () => {
    expect(shippingProblems(FINANCE)).toEqual([]);
    expect(FINANCE.license).toBe('CC0-1.0');
    expect(FINANCE.images).toEqual(FINANCE_ICONS);
    expect((FINANCE.images ?? []).length).toBeLessThanOrEqual(128);
    for (const image of FINANCE.images ?? []) {
      expect(image.id.startsWith('finance.'), image.id).toBe(true);
      expect([image.source, image.license]).toEqual(['Drawn for Visual Anything', 'CC0-1.0']);
    }
  });
});

describe('how its shapes look', () => {
  it('gives every component an icon of its own package, but Entry line, which is a row', () => {
    const images = new Set((FINANCE.images ?? []).map((image) => image.id));
    for (const each of FINANCE.components) {
      const image = each.appearance?.image;
      if (each.id === id('entry-line')) {
        expect(image).toBeUndefined();
        continue;
      }
      expect(typeof image === 'object' && images.has(image.image), each.id).toBe(true);
    }
    for (const kind of ACCOUNT_KINDS) {
      const image = component(`${kind}-account`).appearance?.image;
      expect(typeof image === 'object' && image.image, kind).toBe(ACCOUNT_ICONS[kind].id);
    }
  });

  it('stores every icon as cleaning writes it', () => {
    for (const image of FINANCE_ICONS) {
      const cleaned = cleanSvg(image.svg);
      expect(cleaned.ok && cleaned.value.svg, image.id).toBe(image.svg);
      expect(cleaned.ok && cleaned.removed, image.id).toEqual([]);
      expect(colorsIn(image.svg), image.id).toHaveLength(1);
    }
  });

  it('writes names and strokes that read at 4.5:1 in the light theme, on its fills and the canvas', () => {
    for (const { id: each } of FINANCE.components) {
      const { fill = '', stroke = '' } = definitions.component(each)?.appearance ?? {};
      expect(contrastRatio(stroke, fill), each).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(stroke, CANVAS_BACKGROUNDS.light), each).toBeGreaterThanOrEqual(4.5);
    }
    for (const { id: each } of FINANCE.relationTypes) {
      const stroke = definitions.relationType(each)?.appearance.stroke ?? '';
      expect(contrastRatio(stroke, CANVAS_BACKGROUNDS.light), each).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('draws icons that read at 3:1 or more on their component’s fill, in both themes', () => {
    for (const each of FINANCE.components) {
      const shown = each.appearance?.image;
      if (typeof shown !== 'object') continue;
      const image = FINANCE_ICONS.find((icon) => icon.id === shown.image);
      if (image === undefined) throw new Error(`${each.id} shows no icon of the package`);
      const resolved = definitions.component(each.id);
      for (const color of colorsIn(image.svg)) {
        for (const fill of [resolved?.appearance.fill, resolved?.darkColors.fill]) {
          expect(contrastRatio(color, fill ?? ''), `${each.id} ${color}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('colors each kind of account apart', () => {
    const fills = ACCOUNT_KINDS.map(
      (kind) => definitions.component(id(`${kind}-account`))?.appearance.fill,
    );
    expect(new Set(fills).size).toBe(ACCOUNT_KINDS.length);
  });
});
