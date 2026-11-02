/**
 * The finance sample, "Workshop books" (ADR 0079, Track P6), as the canvas's scene draws it: it opens
 * clean, its journal entries draw their lines as rows that write their amount and "Dr" or "Cr", every
 * entry balances, every name is written whole inside its shape, its scenario plays either way of its
 * decision (ADR 0078), and its tour's check finds nothing to look at.
 */
import { checkProject, checkTour, scenarioTimeline } from '@visual-anything/core';
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { layoutCommand } from './layout/command';
import { layOut } from './layout/engine';
import { layoutInput } from './layout/input';
import { inputAfter } from './layout/settle';
import { buildScene, buildSceneAfresh } from './scene';
import { detailOf } from './draw';
import { writesNameInside } from './outlined';

const project = loadSample('workshop-books');
const VIEWS = ['invoice-to-ledger', 'reserve-portfolio', 'risks-and-controls'];

function elementOf(id: string) {
  const found = project.model.elements.find((each) => each.id === id);
  if (!found) throw new Error(`No element ${id}`);
  return found;
}

describe('the finance sample', () => {
  it('opens with nothing to warn about, using only the finance package', () => {
    expect(checkProject(project)).toEqual({ errors: [], warnings: [] });
    expect(project.project.packages).toEqual(['finance']);
    expect(project.views.map((view) => view.id).sort()).toEqual(VIEWS);
  });

  it.each(VIEWS)(
    'keeps %s where the app’s layout puts it: laying it out again moves nothing',
    { timeout: 30_000 },
    async (view) => {
      const elk = new ELK();
      const scope = { kind: 'view' } as const;
      const scene = buildSceneAfresh(project, view);
      const input = layoutInput(scene, project, scope);
      if (!input) throw new Error('Nothing to lay out.');
      let result = await layOut(input, elk);
      const again = inputAfter(project, view, scene, scope, input, result.shapes);
      if (again) result = await layOut(again, elk);
      expect(layoutCommand(project, view, scene, scope, result.shapes)).toBeUndefined();
    },
  );

  it('keeps every journal entry balanced: its lines debit as much as they credit', () => {
    const entries = project.model.elements.filter(
      (each) => each.component === 'finance.journal-entry',
    );
    expect(entries.map((each) => each.id)).toEqual(['je-0107', 'je-0112', 'je-0113']);
    for (const entry of entries) {
      const lines = project.model.relations
        .filter((each) => each.relationType === 'finance.is-part-of' && each.to === entry.id)
        .map((each) => elementOf(each.from));
      expect(lines.length, entry.id).toBeGreaterThanOrEqual(2);
      const total = { debits: 0, credits: 0 };
      for (const line of lines) {
        const sides = project.model.relations.filter(
          (each) =>
            each.from === line.id &&
            (each.relationType === 'finance.debits' || each.relationType === 'finance.credits'),
        );
        // Each line debits or credits exactly one account.
        expect(sides, line.id).toHaveLength(1);
        const side = sides[0]?.relationType === 'finance.debits' ? 'debits' : 'credits';
        total[side] += Number(line.attributes?.amount);
      }
      expect(total.debits, entry.id).toBeGreaterThan(0);
      expect(total.debits, entry.id).toBe(total.credits);
    }
  });

  it('draws each journal entry’s lines as rows, writing the amount and Dr or Cr', () => {
    const scene = buildScene(project, 'invoice-to-ledger');
    const row = (element: string) => {
      const found = scene.shapes.find((shape) => shape.element === element);
      if (!found) throw new Error(`No shape for ${element}`);
      return found;
    };
    expect(row('je-0107').holdsContents).toBe(true);
    expect(detailOf(row('je-0107-receivable'))).toBe('2400 · Dr');
    expect(detailOf(row('je-0107-sales'))).toBe('2000 · Cr');
    expect(detailOf(row('je-0107-vat'))).toBe('400 · Cr');
    expect(row('je-0107-receivable').row).toBe(0);
  });

  it.each(VIEWS)('writes every name in %s whole inside its shape', (view) => {
    const scene = buildScene(project, view);
    expect(scene.shapes.length).toBeGreaterThan(6);
    for (const shape of scene.shapes) {
      expect(writesNameInside(shape), `${view} ${shape.element}`).toBe(true);
      // A journal entry's header and its rows write their name and detail on one line each, uncut.
      if (shape.fitted) {
        expect(shape.fitted.name, `${view} ${shape.element}`).toBe(shape.name);
        expect(shape.fitted.detail.endsWith('…'), `${view} ${shape.element}`).toBe(false);
      }
    }
  });

  it('plays the invoice to the ledger, either way of its decision', () => {
    const scenario = project.scenarios.find((each) => each.id === 'invoice-to-ledger');
    if (!scenario) throw new Error('No scenario "invoice-to-ledger".');
    const played = (choices?: Record<string, string>) =>
      scenarioTimeline(project, scenario, undefined, choices).entries.flatMap(
        (entry) => entry.relations,
      );
    const shared = [
      'workshop-issues-invoice',
      'je-0107-records-invoice',
      'je-0107-receivable-debits',
      'je-0107-sales-credits',
      'je-0107-vat-credits',
      'je-0107-posts',
      'cafe-pays-invoice',
      'matching-checks-payment',
    ];
    expect(played()).toEqual([
      ...shared,
      'payment-settles-invoice',
      'je-0112-records-payment',
      'je-0112-bank-debits',
      'je-0112-receivable-credits',
      'je-0112-posts',
    ]);
    expect(played({ 'matches-invoice': 'unmatched' })).toEqual([
      ...shared,
      'je-0113-records-payment',
      'je-0113-bank-debits',
      'je-0113-unapplied-credits',
      'je-0113-posts',
    ]);
  });

  it('has a tour whose check finds nothing to look at', () => {
    expect(project.tours.map((tour) => tour.id)).toEqual(['read-the-books']);
    const tour = project.tours[0];
    if (!tour) throw new Error('No tour.');
    const warnings = checkTour(project, tour).flatMap((step) =>
      step.warnings.map((warning) => `${step.step}: ${warning.kind}`),
    );
    expect(warnings).toEqual([]);
  });

  it('holds no real data: its company and customer are said to be invented', () => {
    expect(project.project.description).toContain('invented');
    for (const id of ['workshop', 'cafe']) expect(elementOf(id).description).toContain('invented');
  });
});
