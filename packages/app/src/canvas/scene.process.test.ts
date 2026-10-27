/**
 * The process sample, "Online order" (ADR 0079, Track P1), as the canvas's scene draws it: its
 * events, gateways and data are drawn by their own outlines and write their names whole in the label
 * area beside the symbol, its boxes and containers are drawn by their kinds, and each scenario plays
 * either way of its decision (ADR 0078).
 */
import { checkProject, scenarioTimeline } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { nameLinesInside, writesNameInside } from './outlined';
import { buildScene } from './scene';

const project = loadSample('order-process');

describe('the process sample', () => {
  it('opens with nothing to warn about, using only the process package', () => {
    expect(checkProject(project)).toEqual({ errors: [], warnings: [] });
    expect(project.project.packages).toEqual(['process']);
    expect(project.views.map((view) => view.id).sort()).toEqual([
      'order-lifecycle',
      'order-process',
    ]);
  });

  it.each(['order-process', 'order-lifecycle'])(
    'writes every name in %s whole inside its shape, and each symbol’s in its label area',
    (view) => {
      const scene = buildScene(project, view);
      expect(scene.shapes.length).toBeGreaterThan(8);
      for (const shape of scene.shapes) {
        expect(writesNameInside(shape), shape.element).toBe(true);
        if (shape.outline && !shape.holdsContents) {
          expect(
            nameLinesInside({ ...shape, outline: shape.outline }),
            shape.element,
          ).toBeDefined();
        }
      }
      const outlined = scene.shapes.filter((shape) => shape.outline).map((shape) => shape.element);
      expect(outlined.length).toBeGreaterThanOrEqual(3);
      // Boxes and containers are drawn by their kinds.
      for (const shape of scene.shapes.filter((each) => !each.outline)) {
        expect(['rectangle', 'rounded-rectangle'], shape.element).toContain(shape.kind);
      }
    },
  );

  it('shows each event’s trigger by the icon its element takes', () => {
    const scene = buildScene(project, 'order-process');
    const icon = (element: string) =>
      scene.shapes.find((shape) => shape.element === element)?.image?.id;
    expect(icon('order-received')).toBe('process.message-icon');
    expect(icon('carrier-pickup')).toBe('process.timer-icon');
    expect(icon('order-shipped')).toBe('process.message-icon');
    expect(icon('check-stock')).toBeUndefined();
  });

  it('plays an order through its gateway, either way of the decision', () => {
    const scenario = project.scenarios.find((each) => each.id === 'an-order');
    if (!scenario) throw new Error('No scenario "an-order".');
    const played = (choices?: Record<string, string>) =>
      scenarioTimeline(project, scenario, undefined, choices).entries.flatMap(
        (entry) => entry.relations,
      );
    const shared = [
      'places-order',
      'received-to-check',
      'order-with-check',
      'inventory-with-check',
    ];
    expect(played()).toEqual([
      ...shared,
      'check-to-gateway',
      'in-stock-yes',
      'pick-to-pack',
      'parcel-to-pickup',
      'pickup-to-hand-over',
      'hand-over-to-shipped',
      'sends-tracking',
    ]);
    expect(played({ 'stock-check': 'out-of-stock' })).toEqual([
      ...shared,
      'check-to-gateway',
      'in-stock-no',
      'cancel-to-end',
      'sends-refund',
    ]);
  });
});
