/**
 * Videos on the canvas (ADR 0098, stage 2), with a fake player: a poster with a play mark, a dark box
 * with its name without one, playing once toggled from its file and back to its poster when stopped,
 * at most four at once, and the step's hook playing exactly the videos it names.
 */
import type { MediaRef } from '@visual-anything/schema';
import { Graphics, Sprite, Text, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { PictureShape } from '../scene';
import {
  PLAYING_AT_ONCE,
  PictureLayer,
  type DecodedPicture,
  type PicturePlatform,
  type PlayingVideo,
} from './layer';
import { playMark } from './mark';

const ref = (hash: string, format: MediaRef['format']): MediaRef => ({
  hash: hash.repeat(64),
  format,
  width: 640,
  height: 360,
  bytes: 10,
});

const video = (id: string, poster = true): PictureShape => ({
  id,
  rect: { x: 0, y: 0, width: 320, height: 180 },
  media: ref(id, 'mp4'),
  ...(poster ? { poster: ref('p', 'jpeg') } : {}),
  video: true,
  name: `${id} video`,
  named: true,
});

const VIEW = {
  scale: 1,
  shown: { x: 0, y: 0, width: 800, height: 600 },
  resolution: 1,
  settled: true,
};

class FakePlatform implements PicturePlatform {
  decoded: string[] = [];
  played: string[] = [];
  stopped: string[] = [];
  updates = 0;
  now = () => 0;
  later() {}
  decode(_: Uint8Array, media: MediaRef): Promise<DecodedPicture> {
    this.decoded.push(media.format);
    return Promise.resolve({ kind: 'still', texture: Texture.EMPTY });
  }
  play = (_: Uint8Array, media: MediaRef): Promise<PlayingVideo> => {
    this.played.push(media.hash.slice(0, 1));
    return Promise.resolve({
      texture: Texture.WHITE,
      update: () => {
        this.updates += 1;
      },
      stop: () => {
        this.stopped.push(media.hash.slice(0, 1));
      },
    });
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

const nodeOf = (layer: PictureLayer, at = 0) => layer.container.children[at]!;
const marks = (layer: PictureLayer, at = 0) =>
  nodeOf(layer, at).children.filter((child) => child instanceof Graphics).length;

describe('videos on the canvas', () => {
  it('shows its poster, decoded as a picture, with a play mark over it', async () => {
    const { layer, platform } = layerWith();
    layer.setScene([video('a')]);
    layer.frame(VIEW);
    await settle();
    layer.frame(VIEW);
    expect(platform.decoded).toEqual(['jpeg']);
    expect(nodeOf(layer).children.some((child) => child instanceof Sprite)).toBe(true);
    // The box behind, and the mark.
    expect(marks(layer)).toBe(2);
  });

  it('draws a video without a poster as a dark box with a play mark and its name', () => {
    const { layer, platform } = layerWith();
    layer.setScene([video('a', false)]);
    layer.frame(VIEW);
    expect(platform.decoded).toEqual([]);
    const label = nodeOf(layer).children.find((child) => child instanceof Text);
    expect(label?.text).toBe('a video');
    expect(marks(layer)).toBe(2);
  });

  it('plays from its file once toggled, updating each frame, and goes back to its poster', async () => {
    const { layer, platform } = layerWith();
    layer.setScene([video('a')]);
    layer.toggle('a');
    expect(layer.isPlaying('a')).toBe(true);
    await settle();
    expect(platform.played).toEqual(['a']);
    expect(layer.frame(VIEW)).toBe(true);
    expect(platform.updates).toBe(1);
    // No mark while it plays.
    expect(marks(layer)).toBe(1);
    layer.toggle('a');
    expect(layer.isPlaying('a')).toBe(false);
    expect(platform.stopped).toEqual(['a']);
    expect(marks(layer)).toBe(2);
  });

  it('plays at most four at once, the one started first stopping', async () => {
    const { layer, platform } = layerWith();
    const ids = ['a', 'b', 'c', 'd', 'e'];
    layer.setScene(ids.map((id) => video(id)));
    for (const id of ids) layer.toggle(id);
    await settle();
    expect(PLAYING_AT_ONCE).toBe(4);
    expect(ids.filter((id) => layer.isPlaying(id))).toEqual(['b', 'c', 'd', 'e']);
    expect(platform.played).not.toContain('a');
  });

  it('plays exactly the videos a step names, and stops those that leave the view', async () => {
    const { layer, platform } = layerWith();
    layer.setScene([video('a'), video('b')]);
    layer.setPlaying(new Set(['a', 'b']));
    await settle();
    layer.setPlaying(new Set(['b']));
    expect(platform.stopped).toEqual(['a']);
    layer.setScene([video('a')]);
    expect(layer.isPlaying('b')).toBe(false);
    expect(platform.stopped).toEqual(['a', 'b']);
  });

  it('leaves a video the person started playing, and plays a step’s once it is drawn', async () => {
    const { layer, platform } = layerWith();
    layer.setScene([video('a'), video('b')]);
    layer.toggle('a');
    layer.setPlaying(new Set(['b', 'c']));
    await settle();
    layer.setPlaying(new Set());
    expect(layer.isPlaying('a')).toBe(true);
    expect(platform.stopped).toEqual(['b']);
    // A video the step asks for before its view is drawn plays once it is.
    layer.setPlaying(new Set(['c']));
    expect(layer.isPlaying('c')).toBe(false);
    layer.setScene([video('a'), video('c')]);
    expect(layer.isPlaying('c')).toBe(true);
  });

  it('starts no step’s video again once the person stops it, but after it was hidden', async () => {
    const { layer } = layerWith();
    layer.setScene([video('a'), video('b')]);
    layer.setPlaying(new Set(['a', 'b']));
    await settle();
    layer.toggle('a');
    layer.setScene([video('a'), video('b')]);
    expect(layer.isPlaying('a')).toBe(false);
    layer.setScene([video('a'), video('b')], new Set(['b']));
    expect(layer.isPlaying('b')).toBe(false);
    layer.setScene([video('a'), video('b')]);
    expect(layer.isPlaying('b')).toBe(true);
  });

  it('never plays a picture that is not a video', () => {
    const { layer } = layerWith();
    layer.setScene([{ ...video('a'), media: ref('a', 'png'), video: undefined }]);
    layer.toggle('a');
    expect(layer.isPlaying('a')).toBe(false);
  });
});

describe('playMark', () => {
  it('is a disc a fifth of the shorter side, within 6 and 40 units, in the middle', () => {
    expect(playMark({ x: 0, y: 0, width: 100, height: 50 }).disc).toEqual({
      x: 50,
      y: 25,
      radius: 10,
    });
    expect(playMark({ x: 0, y: 0, width: 1000, height: 1000 }).disc.radius).toBe(40);
    expect(playMark({ x: 0, y: 0, width: 10, height: 10 }).disc.radius).toBe(6);
  });
});

describe('a video a read-only page leaves to its poster', () => {
  it('shows no play mark, and does not play', async () => {
    const platform = new FakePlatform();
    const files = Object.assign(() => Promise.resolve(Uint8Array.of(1)), {
      holds: (hash: string) => !hash.startsWith('a'),
    });
    const layer = new PictureLayer({ files: () => files, platform, requestRender: () => {} });
    layer.setScene([video('a')]);
    layer.frame(VIEW);
    await settle();
    layer.frame(VIEW);
    expect(marks(layer)).toBe(1);
    layer.toggle('a');
    expect(layer.isPlaying('a')).toBe(false);
  });
});
