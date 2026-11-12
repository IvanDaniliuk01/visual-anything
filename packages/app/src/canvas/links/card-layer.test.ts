/**
 * Link cards on the canvas (ADR 0098, stage 3), with a fake decoder: a card is drawn as its card and
 * its texts from its data, its picture decoded at the size its band shows it and placed there, never
 * played as a video, and drawn again in the other theme's colors.
 */
import type { MediaRef } from '@visual-anything/schema';
import { Container, Sprite, Text, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PictureLayer, type DecodedPicture, type PicturePlatform } from '../pictures/layer';
import type { PictureShape } from '../scene';
import { CARD_COLORS, cardLayout } from './card';

const PICTURE: MediaRef = {
  hash: 'a'.repeat(64),
  format: 'png',
  width: 1200,
  height: 630,
  bytes: 9,
};

const card = (picture?: MediaRef): PictureShape => ({
  id: 'guide',
  rect: { x: 0, y: 0, width: 320, height: 280 },
  ...(picture ? { media: picture } : {}),
  name: 'The intake guide',
  named: true,
  link: {
    url: 'https://example.org/intake',
    host: 'example.org',
    title: 'The intake guide',
    description: 'How a patient is received.',
  },
});

const VIEW = {
  scale: 1,
  shown: { x: 0, y: 0, width: 800, height: 600 },
  resolution: 1,
  settled: true,
};

class FakePlatform implements PicturePlatform {
  sizes: [number, number][] = [];
  played = 0;
  now = () => 0;
  later() {}
  decode(_: Uint8Array, __: MediaRef, width: number, height: number): Promise<DecodedPicture> {
    this.sizes.push([width, height]);
    return Promise.resolve({ kind: 'still', texture: Texture.WHITE });
  }
  play = () => {
    this.played += 1;
    return Promise.reject(new Error('A card never plays.'));
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function layerWith() {
  const platform = new FakePlatform();
  const layer = new PictureLayer({
    files: () => () => Promise.resolve(Uint8Array.of(1)),
    platform,
    requestRender: () => {},
  });
  return { layer, platform };
}

/** The texts a card writes, in order. */
const textsOf = (layer: PictureLayer) =>
  (layer.container.children[0]?.children ?? [])
    .filter((child): child is Container => child instanceof Container && !(child instanceof Sprite))
    .flatMap((child) => child.children)
    .filter((child): child is Text => child instanceof Text);

describe('link cards on the canvas', () => {
  it('writes its title, description and host from its data, with no picture to fetch', () => {
    const { layer, platform } = layerWith();
    layer.setScene([card()]);
    layer.frame(VIEW);
    expect(platform.sizes).toEqual([]);
    const texts = textsOf(layer);
    expect(texts.map((text) => text.text)).toEqual([
      'The intake guide',
      'How a patient is received.',
      'example.org',
    ]);
    expect(texts[2]?.tint).toBe(Number.parseInt(CARD_COLORS.light.link.slice(1), 16));
    expect(layer.container.children[0]?.children.some((child) => child instanceof Sprite)).toBe(
      false,
    );
  });

  it('decodes its picture at the size its band shows it, and places it there', async () => {
    const { layer, platform } = layerWith();
    layer.setScene([card(PICTURE)]);
    layer.frame(VIEW);
    await settle();
    layer.frame(VIEW);
    const band = cardLayout(card().rect, card().link!, PICTURE).picture!;
    expect(band).toEqual({ x: 0, y: 0, width: 320, height: 168 });
    expect(platform.sizes).toHaveLength(1);
    const sprite = layer.container.children[0]?.children.find((child) => child instanceof Sprite);
    expect(sprite?.position).toMatchObject({ x: 0, y: 0 });
    expect(sprite?.width).toBe(320);
    expect(sprite?.height).toBe(168);
    expect(layer.cardLayout('guide')?.picture).toEqual(band);
  });

  it('never plays as a video, and is drawn again in the dark theme', () => {
    const { layer, platform } = layerWith();
    layer.setScene([card()]);
    layer.toggle('guide');
    layer.setPlaying(new Set(['guide']));
    expect(platform.played).toBe(0);
    expect(layer.isPlaying('guide')).toBe(false);
    layer.setTheme(true);
    const host = textsOf(layer).at(-1);
    expect(host?.tint).toBe(Number.parseInt(CARD_COLORS.dark.link.slice(1), 16));
  });
});
