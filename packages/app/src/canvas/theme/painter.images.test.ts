/**
 * Pictures in each theme: the name under a picture is written, and tinted again, in colours read on
 * what the shape sits on in the theme shown, its container's fill or the canvas, never on the plate.
 */
import { cleanedImage } from '@visual-anything/core';
import { Color, Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../../theme/themes';
import { readableTextColors } from '../colors';
import type { TextFactory } from '../draw';
import { imageSerial } from '../image-serials';
import type { ElementShape } from '../scene';
import { placeImage } from '../shape-images';
import { painterOf, type LabelPaint, type PaintLookups } from './painter';
import { labelsFollowTheme } from './restyle';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const picture = cleanedImage({
  kind: 'svg',
  id: 'test.logo',
  name: 'Logo',
  width: 24,
  height: 24,
  svg: `<svg viewBox="0 0 24 24" ${NS}><circle cx="12" cy="12" r="10" fill="#25D366"/></svg>`,
});
if (!picture) throw new Error('The test picture does not clean.');

const rect = { x: 40, y: 60, width: 160, height: 160 };
const placed = placeImage(
  { id: picture.id, image: picture, serial: imageSerial(picture), placement: 'drawing' },
  { kind: 'rectangle', rect, holdsContents: false, rows: false },
  true,
);
const drawing: ElementShape = {
  key: 'system/logo',
  element: 'logo',
  container: 'system',
  containerShape: 'system',
  offset: { x: 40, y: 60 },
  positioned: 'stored',
  name: 'Logo',
  componentName: 'Service',
  kind: 'rectangle',
  // A light fill of its own: the name is never written on it.
  fill: '#FFFFFF',
  stroke: '#000000',
  rect,
  extent: rect,
  holdsContents: false,
  ...(placed ? { image: placed.image, ...(placed.plate ? { plate: placed.plate } : {}) } : {}),
};
const system: ElementShape = {
  key: 'system',
  element: 'system',
  offset: { x: 0, y: 0 },
  positioned: 'stored',
  name: 'System',
  componentName: 'System',
  kind: 'rectangle',
  fill: '#F3F5F8',
  stroke: '#3E4C59',
  dark: { fill: '#1B2430', stroke: '#9AA5B1' },
  rect: { x: 0, y: 0, width: 400, height: 400 },
  extent: { x: 0, y: 0, width: 400, height: 400 },
  holdsContents: true,
};
const lookups: PaintLookups = {
  shape: (key) => (key === 'system' ? system : key === drawing.key ? drawing : undefined),
  note: () => undefined,
};

/** Labels tinted as the bitmap labels are: to the fill their options give. */
const tinting: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  const fill = (options.style as { fill?: string } | undefined)?.fill;
  if (fill) label.tint = fill;
  return label;
};

const tint = (color: string) => new Color(color).toNumber();

describe('the name under a picture', () => {
  it('is written on its container’s fill in the theme shown, and tinted again on a switch', () => {
    const dark = painterOf(THEMES.dark.canvas);
    const light = painterOf(THEMES.light.canvas);
    const records: LabelPaint[] = [];
    const [name] = dark.shapeLabels([drawing], true, tinting, records, lookups);
    expect(name?.tint).toBe(tint(readableTextColors('#1B2430').name));
    light.retint(records, lookups);
    expect(name?.tint).toBe(tint(readableTextColors('#F3F5F8').name));
  });

  it('is written on the canvas directly in World', () => {
    const inWorld: ElementShape = { ...drawing, key: 'logo' };
    delete inWorld.container;
    delete inWorld.containerShape;
    const dark = painterOf(THEMES.dark.canvas);
    const [name] = dark.shapeLabels([inWorld], false, tinting, [], lookups);
    expect(name?.tint).toBe(tint(readableTextColors(THEMES.dark.canvas.background).name));
  });

  it('makes its tile’s labels follow the theme, whatever its own colors', () => {
    const tile = {
      kind: 'shapes' as const,
      shapes: [drawing],
      touching: [],
      lines: [],
      notes: [],
      arrows: [],
    };
    expect(labelsFollowTheme(tile)).toBe(true);
    const plain = { ...drawing };
    delete plain.image;
    expect(labelsFollowTheme({ ...tile, shapes: [plain] })).toBe(false);
  });
});
