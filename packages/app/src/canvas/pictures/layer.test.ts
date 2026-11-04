/**
 * The canvas's pictures (ADR 0098), with a fake decoder: a gray box while a file comes, its texture
 * once decoded, nearest the middle first and one a frame; a missing file's name and warning; a GIF
 * playing only while on screen, and under reduced motion only while hovered; a drag moving it.
 */
import { parseGif } from '@visual-anything/core';
import type { MediaRef } from '@visual-anything/schema';
import { Graphics, Sprite, Text, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { PictureShape } from '../scene';
import { PictureLayer, type DecodedPicture, type PicturePlatform } from './layer';
import { GifPlayer } from './media';
import { gifOf } from './test-gifs';

const media = (hash: string, format: MediaRef['format'] = 'png'): MediaRef => ({
  hash: hash.repeat(64),
  format,
  width: 400,
  height: 300,
  bytes: 10,
});

const picture = (id: string, x: number, ref = media('a')): PictureShape => ({
  id,
  rect: { x, y: 0, width: 200, height: 150 },
  media: ref,
  name: `${id} name`,
  named: true,
});

const VIEW = {
  scale: 1,
  shown: { x: 0, y: 0, width: 800, height: 600 },
  resolution: 1,
  settled: true,
};

class FakePlatform implements PicturePlatform {
  time = 0;
  decoded: { media: MediaRef; width: number; height: number }[] = [];
  timers: { ms: number; then: () => void }[] = [];
  now(): number {
    return this.time;
  }
  later(ms: number, then: () => void): void {
    this.timers.push({ ms, then });
  }
  decode(bytes: Uint8Array, ref: MediaRef, width: number, height: number): Promise<DecodedPicture> {
    this.decoded.push({ media: ref, width, height });
    if (ref.format === 'gif') {
      const drawn: number[] = [];
      return Promise.resolve({
        kind: 'gif',
        texture: Texture.WHITE,
        player: new GifPlayer(parseGif(bytes)),
        draw: (rgba) => drawn.push(rgba[1] as number),
        drawn,
      } as DecodedPicture);
    }
    return Promise.resolve({ kind: 'still', texture: Texture.EMPTY });
  }
}

/** Lets the layer's fetching and decoding settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function layerWith(files: Record<string, Uint8Array>, options: { reducedMotion?: boolean } = {}) {
  const platform = new FakePlatform();
  let frames = 0;
  const layer = new PictureLayer({
    files: () => (hash) => Promise.resolve(files[hash]),
    platform,
    requestRender: () => {
      frames += 1;
    },
    reducedMotion: () => options.reducedMotion === true,
  });
  return { layer, platform, frames: () => frames };
}

const spritesOf = (layer: PictureLayer) =>
  layer.container.children.flatMap((node) =>
    node.children.filter((each) => each instanceof Sprite),
  );

describe('PictureLayer', () => {
  it('draws a gray box while its file comes, then its texture at the size it shows', async () => {
    const { layer, platform } = layerWith({ ['a'.repeat(64)]: new Uint8Array([1]) });
    layer.setScene([picture('p', 0)]);
    const box = layer.container.children[0]?.children[0] as Graphics;
    expect(box).toBeInstanceOf(Graphics);
    expect(spritesOf(layer)).toHaveLength(0);
    layer.frame(VIEW);
    await settle();
    layer.frame(VIEW);
    expect(spritesOf(layer)).toHaveLength(1);
    // 200 units at scale 1, at rest: the 256 bucket, its proportions kept.
    expect(platform.decoded).toEqual([{ media: media('a'), width: 256, height: 192 }]);
    const [sprite] = spritesOf(layer);
    expect([sprite?.x, sprite?.width, sprite?.height]).toEqual([0, 200, 150]);
  });

  it('makes one texture a frame, nearest the middle of the screen first', async () => {
    const files = { ['a'.repeat(64)]: new Uint8Array([1]), ['b'.repeat(64)]: new Uint8Array([1]) };
    const { layer } = layerWith(files);
    layer.setScene([picture('far', 2000, media('a')), picture('near', 300, media('b'))]);
    const view = { ...VIEW, shown: { x: 0, y: 0, width: 4000, height: 600 }, scale: 0.2 };
    layer.frame(view);
    await settle();
    layer.frame(view);
    expect(spritesOf(layer)).toHaveLength(1);
    layer.frame(view);
    expect(spritesOf(layer)).toHaveLength(2);
  });

  it('draws a missing file as a gray box with its name and a warning', async () => {
    const { layer } = layerWith({});
    layer.setScene([picture('gone', 0)]);
    layer.frame(VIEW);
    await settle();
    layer.frame(VIEW);
    expect(layer.isMissing('gone')).toBe(true);
    const texts = layer.container.children[0]?.children.filter(
      (each): each is Text => each instanceof Text,
    );
    expect(texts?.map((each) => each.text)).toEqual(['gone name']);
  });

  it('plays a GIF while it is on screen, and under reduced motion only while hovered', async () => {
    const gif = gifOf(
      [
        { indices: [0], delay: 10 },
        { indices: [1], delay: 10 },
      ],
      0,
    );
    for (const reduced of [false, true]) {
      const { layer, platform } = layerWith({ ['c'.repeat(64)]: gif }, { reducedMotion: reduced });
      layer.setScene([picture('anim', 0, media('c', 'gif'))]);
      layer.frame(VIEW);
      await settle();
      layer.frame(VIEW);
      expect(spritesOf(layer)).toHaveLength(1);
      expect(platform.decoded).toHaveLength(1);
      platform.time = 150;
      const played = layer.frame(VIEW);
      expect(played).toBe(!reduced);
      layer.setHovered('anim');
      platform.time = 300;
      expect(layer.frame(VIEW)).toBe(true);
      // Off screen, it waits.
      platform.time = 450;
      expect(layer.frame({ ...VIEW, shown: { x: 5000, y: 0, width: 100, height: 100 } })).toBe(
        false,
      );
    }
  });

  it('moves the pictures dragged by the drag’s distance, and back when it ends', () => {
    const { layer } = layerWith({});
    layer.setScene([picture('p', 0), picture('q', 300, media('b'))]);
    layer.setDrag(new Set(['p']), { x: 40, y: 10 });
    const [p, q] = layer.container.children;
    expect([p?.x, p?.y, q?.x]).toEqual([40, 10, 0]);
    layer.setDrag(new Set(), { x: 0, y: 0 });
    expect(p?.x).toBe(0);
  });

  it('forgets the pictures a scene no longer holds, and leaves out those hidden', () => {
    const { layer } = layerWith({});
    layer.setScene([picture('p', 0), picture('q', 300, media('b'))]);
    expect(layer.container.children).toHaveLength(2);
    layer.setScene([picture('p', 0), picture('q', 300, media('b'))], new Set(['q']));
    expect(layer.container.children).toHaveLength(1);
  });
});
