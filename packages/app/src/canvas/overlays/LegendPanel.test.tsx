/**
 * The legend on the canvas and below an image (ADR 0055): each overlay's title and what it changes,
 * each entry's words beside its swatch, its warnings in the language read in, and nothing without
 * overlays.
 */
import { definitionsIn, legendOf, type Legend } from '@visual-anything/core';
import type { Overlay, ViewFile } from '@visual-anything/schema';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withLegendBand } from '../../export/legendBand';
import { layOutBand } from '../../export/legendLayout';
import { t, translatorFor } from '../../i18n';
import { loadSample } from '../../test/sample';
import { THEMES } from '../../theme/themes';
import { LegendPanel } from './LegendPanel';

const sample = loadSample();
const view = sample.views[0] as ViewFile;

function legendWith(overlays: Overlay[], theme: 'light' | 'dark' = 'light'): Legend {
  return legendOf({ ...view, overlays }, definitionsIn(sample), theme);
}

const owner: Overlay = {
  id: 'owner',
  name: 'Team',
  of: 'elements',
  attribute: 'owner',
  channel: 'fill',
  mapping: {
    kind: 'discrete',
    cases: [
      { value: 'Scheduling team', color: '#FFFF00' },
      { value: 'Patient experience', color: '#FFFF33', label: 'Patients' },
    ],
    otherwise: '#6B7280',
  },
};
const rate: Overlay = {
  id: 'rate',
  of: 'relations',
  attribute: 'rate',
  channel: 'size',
  mapping: {
    kind: 'continuous',
    stops: [
      { at: 0, size: 0.5 },
      { at: 100, size: 2 },
    ],
  },
};

describe('LegendPanel', () => {
  it('shows each overlay’s title, what it changes, and each entry in words', () => {
    render(<LegendPanel legend={legendWith([owner, rate])} />);
    const panel = screen.getByRole('group');
    expect(within(panel).getByText('Legend')).toBeTruthy();
    const team = screen.getByRole('region', { name: 'Team' });
    expect(within(team).getByText('Fill by owner')).toBeTruthy();
    expect(within(team).getByText('Scheduling team')).toBeTruthy();
    expect(within(team).getByText('Patients')).toBeTruthy();
    expect(within(team).getByText('Any other value')).toBeTruthy();
    // Colors hard to tell apart are said so.
    expect(
      within(team).getByText(
        '"Scheduling team" and "Patients" of "Team" differ by 6, under 20: hard to tell apart.',
      ),
    ).toBeTruthy();
    const lines = screen.getByRole('region', { name: 'rate' });
    expect(within(lines).getByText('Line width by rate')).toBeTruthy();
    expect(within(lines).getByText('×0.5')).toBeTruthy();
    expect(within(lines).getByText('×2')).toBeTruthy();
  });

  it('shows nothing while no overlay is on', () => {
    const { container } = render(<LegendPanel legend={legendWith([{ ...owner, off: true }])} />);
    expect(container.childNodes).toHaveLength(0);
  });
});

describe('the legend below an image', () => {
  /** Every character 7 pixels wide, as a plain font would be at that size. */
  const measure = (text: string) => text.length * 7;

  it('lays each overlay out below the next, its entries wrapping before the edge', () => {
    const band = layOutBand(legendWith([owner, rate]), t, measure, 360, 1, 'light');
    const texts = band.items.flatMap((item) =>
      item.kind === 'text' && item.warning === undefined ? [item.text] : [],
    );
    expect(texts).toEqual([
      'Team',
      'Fill by owner',
      'Scheduling team',
      'Patients',
      'Any other value',
      'rate',
      'Line width by rate',
      '0 ×0.5',
      '100 ×2',
    ]);
    const swatches = band.items.filter((item) => item.kind === 'swatch');
    expect(swatches).toHaveLength(5);
    // Every item lies within the image's width, and the band holds them all.
    expect(band.width).toBe(360);
    for (const item of band.items) {
      expect(item.x).toBeLessThan(360);
      expect(item.y).toBeLessThan(band.height);
    }
    // The third entry wraps onto a line of its own.
    const rows = new Set(swatches.slice(0, 3).map((item) => item.y));
    expect(rows.size).toBe(2);
    // Each overlay's items, in order.
    expect(band.parts.map((part) => part.id)).toEqual(['owner', 'rate']);
    expect(band.parts[0]?.to).toBe(band.parts[1]?.from);
    expect(band.parts[1]?.to).toBe(band.items.length);
  });

  it('writes what the legend warns about its colors below the entries, wrapped to the band', () => {
    const band = layOutBand(legendWith([owner]), t, measure, 360, 1, 'light');
    const warnings = band.items.filter((item) => item.kind === 'text' && item.warning);
    const lastSwatch = band.items.filter((item) => item.kind === 'swatch').at(-1);
    expect(warnings.length).toBeGreaterThan(0);
    for (const warning of warnings) {
      if (warning.kind !== 'text') continue;
      expect(warning.y).toBeGreaterThan(lastSwatch?.y ?? 0);
      expect(warning.x + measure(warning.text)).toBeLessThanOrEqual(360 - 16);
      expect(warning.color).toBe(THEMES.light.shell.colors.warning);
    }
    const said = warnings.map((item) => (item.kind === 'text' ? item.text : '')).join(' ');
    expect(said).toContain(
      '"Scheduling team" and "Patients" of "Team" differ by 6, under 20: hard to tell apart.',
    );
  });

  it('writes its warnings in the language read in', () => {
    const band = layOutBand(legendWith([owner]), translatorFor('es'), measure, 360, 1, 'light');
    const said = band.items
      .flatMap((item) => (item.kind === 'text' && item.warning ? [item.text] : []))
      .join(' ');
    expect(said).toContain(
      '"Scheduling team" y "Patients" de "Team" difieren en 6, menos de 20: cuesta distinguirlos.',
    );
  });

  it('is at least 320 pixels wide, so that a narrow drawing is widened to hold it', () => {
    expect(layOutBand(legendWith([owner]), t, measure, 120, 1, 'light').width).toBe(320);
    expect(layOutBand(legendWith([owner]), t, measure, 120, 2, 'light').width).toBe(640);
  });

  it('draws the image and its band on one canvas taller by the band', () => {
    const drawn: string[] = [];
    const context = {
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      textBaseline: '',
      measureText: (text: string) => ({ width: text.length * 7 }),
      drawImage: () => drawn.push('image'),
      fillRect: () => drawn.push('rect'),
      strokeRect: () => drawn.push('box'),
      fillText: (text: string) => drawn.push(`text ${text}`),
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => drawn.push('line'),
      save: () => {},
      restore: () => {},
    };
    const make = () =>
      ({ width: 0, height: 0, getContext: () => context }) as unknown as HTMLCanvasElement;
    const image = { width: 800, height: 600 } as HTMLCanvasElement;
    const result = withLegendBand(image, legendWith([owner]), t, 'light', 1, make);
    expect(result).not.toBe(image);
    expect(result.width).toBe(800);
    expect(result.height).toBeGreaterThan(600);
    // The canvas's color, then the image, then the band on it.
    expect(drawn.slice(0, 2)).toEqual(['rect', 'image']);
    expect(drawn).toContain('text Team');
    expect(drawn).toContain('text Fill by owner');
    // Without overlays, the image is the image.
    expect(withLegendBand(image, legendWith([]), t, 'light', 1, make)).toBe(image);
  });
});
