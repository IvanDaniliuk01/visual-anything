import type { Picture } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import {
  PAGE_MEDIA_BYTES,
  isVideo,
  mediaNamedBy,
  pageMediaOf,
  pictureName,
  pictureStill,
} from './index';

const ref = (hash: string, format: Picture['media']['format'], bytes = 1000) => ({
  hash: hash.repeat(64),
  format,
  width: 640,
  height: 360,
  bytes,
});

const photo: Picture = {
  kind: 'picture',
  id: 'photo',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  media: ref('a', 'jpeg'),
};
const video: Picture = { ...photo, id: 'video', media: ref('b', 'mp4'), poster: ref('c', 'jpeg') };
const bare: Picture = { ...photo, id: 'bare', media: ref('d', 'webm') };
const large: Picture = {
  ...photo,
  id: 'large',
  media: ref('e', 'mp4', PAGE_MEDIA_BYTES + 1),
  poster: ref('f', 'png'),
};

describe('pictures and videos (ADR 0098, stage 2)', () => {
  it('tells a video by its file, and names one left unnamed "Video"', () => {
    expect(isVideo(photo)).toBe(false);
    expect(isVideo(video)).toBe(true);
    expect(pictureName(photo)).toBe('Picture');
    expect(pictureName(video)).toBe('Video');
    expect(pictureName({ ...video, name: 'Check-in' })).toBe('Check-in');
  });

  it('shows a picture’s own file, a video’s poster, and nothing for a video without one', () => {
    expect(pictureStill(photo)).toBe(photo.media);
    expect(pictureStill(video)).toBe(video.poster);
    expect(pictureStill(bare)).toBeUndefined();
  });

  it('counts a poster among the files pictures name', () => {
    const named = mediaNamedBy([{ freeShapes: [photo, video, bare] }]);
    expect([...named].sort()).toEqual(['a', 'b', 'c', 'd'].map((each) => each.repeat(64)));
  });

  it('holds in a page every image and poster, and a video’s file only within 32 MiB', () => {
    expect(pageMediaOf([{ freeShapes: [photo, video, bare, large] }])).toEqual({
      hashes: ['a', 'b', 'c', 'd', 'f'].map((each) => each.repeat(64)),
      videosLeftOut: ['e'.repeat(64)],
    });
  });
});
