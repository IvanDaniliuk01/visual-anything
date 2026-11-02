/**
 * The physical-space panel's legend (ADR 0076): the parts of the view's legend whose overlays give
 * something the panel draws its fill or its opacity, and none of those that only stroke, size or
 * badge, that color relations, that are off, or that another overlay of the same channel overrides.
 */
import { definitionsIn, legendOf, spaceOf } from '@visual-anything/core';
import type { Id, JsonValue, Overlay } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { workcell } from '../test/space';
import { overlaysColoringSpace, spaceLegendOf } from './legend';

const fill = (id: string, attribute: string, more: Partial<Overlay> = {}): Overlay =>
  ({
    id,
    of: 'elements',
    attribute,
    channel: 'fill',
    mapping: { kind: 'discrete', cases: [{ value: 'hot', color: '#B91C1C' }] },
    ...more,
  }) as Overlay;

/** The workcell's space, with these attributes on its elements. */
function spaceWith(values: Record<Id, Record<string, JsonValue>>) {
  const project = workcell();
  const view = project.views[0];
  if (!view) throw new Error('The workcell has a view.');
  const valueOf = (element: Id, attribute: string) => values[element]?.[attribute];
  return { project, view, space: spaceOf(project, view), valueOf };
}

describe('the panel’s legend', () => {
  it('keeps the overlays that color what the panel draws', () => {
    const { space, valueOf } = spaceWith({ camera: { heat: 'hot' } });
    const overlays = [fill('heat', 'heat'), fill('other', 'missing')];
    expect([...overlaysColoringSpace(space, overlays, valueOf)]).toEqual(['heat']);
  });

  it('counts opacity, and leaves out stroke, size, badges, relations and what is off', () => {
    const { space, valueOf } = spaceWith({ arm: { load: 3 }, table: { heat: 'hot' } });
    const opacity = {
      id: 'faded',
      of: 'elements',
      attribute: 'load',
      channel: 'opacity',
      mapping: {
        kind: 'continuous',
        stops: [
          { at: 0, opacity: 0.2 },
          { at: 10, opacity: 1 },
        ],
      },
    } as Overlay;
    const stroke = fill('stroked', 'heat', { channel: 'stroke' });
    const relations = fill('lines', 'heat', { of: 'relations', channel: 'stroke' });
    const off = fill('off', 'heat', { off: true });
    expect([...overlaysColoringSpace(space, [stroke, relations, off, opacity], valueOf)]).toEqual([
      'faded',
    ]);
  });

  it('leaves out an overlay that the one before it on the same channel overrides everywhere', () => {
    const { space, valueOf } = spaceWith({ table: { heat: 'hot', kind: 'hot' } });
    const overlays = [fill('first', 'heat'), fill('second', 'kind')];
    expect([...overlaysColoringSpace(space, overlays, valueOf)]).toEqual(['first']);
  });

  it('leaves out what colors only elements the panel does not draw', () => {
    const { space, valueOf } = spaceWith({ lamp: { heat: 'hot' }, spare: { heat: 'hot' } });
    expect(overlaysColoringSpace(space, [fill('heat', 'heat')], valueOf).size).toBe(0);
  });

  it('shows only the legend’s parts of the overlays coloring something there', () => {
    const { project, view } = spaceWith({});
    const overlays = [fill('heat', 'heat'), fill('kind', 'kind', { channel: 'stroke' })];
    const legend = legendOf({ ...view, overlays }, definitionsIn(project), 'light');
    expect(legend.overlays.map((part) => part.id)).toEqual(['heat', 'kind']);
    expect(spaceLegendOf(legend, new Set(['heat'])).overlays.map((part) => part.id)).toEqual([
      'heat',
    ]);
    expect(spaceLegendOf(legend, new Set()).overlays).toEqual([]);
    expect(spaceLegendOf(legend, new Set(['heat', 'kind']))).toBe(legend);
  });
});
