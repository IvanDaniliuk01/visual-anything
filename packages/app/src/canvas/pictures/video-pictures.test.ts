/**
 * Videos in the app (ADR 0098, stage 2), without a browser: the scene names them, adding takes their
 * files and their posters, the SVG draws a poster with a play mark, and the read-only page holds a
 * video's file only within 32 MiB.
 */
import {
  cleanMedia,
  decodeBase64,
  encodeBase64,
  type MediaStoredMessage,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { MediaRef, Picture } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { gatherPageMedia } from '../../export/page-export';
import { exportedMediaOf } from '../../export/pictures';
import { writeSvg } from '../../export/svg';
import { pageDataOf, readPageData } from '../../viewer/data';
import { loadSample } from '../../test/sample';
import { buildScene, picturesOf } from '../scene';
import {
  addPictureCommand,
  isVideoFile,
  keepPoster,
  largeVideo,
  pictureFilesIn,
  tooLargeToSend,
} from './adding';
import { embeddedMediaFiles } from './media';
import { posterFileName, posterSize } from './poster';

const clean = (bytes: Uint8Array) => {
  const cleaned = cleanMedia(bytes);
  if (!cleaned.ok) throw new Error(cleaned.problem.message);
  return cleaned;
};

/** A 64 × 48 MP4 of H.264, its container only, as cleaning writes it. */
const MP4 = clean(
  decodeBase64(
    'AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMQAAAeVtb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABT3RyYWsAAABcdGtoZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAQAAAADAAAAAAAOttZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAmaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFRyYWNrAAAAAJ1taW5mAAAACGRpbmYAAACNc3RibAAAAHVzdHNkAAAAAAAAAAEAAABlYXZjMQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAABAADAASAAAAEgAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABj//wAAAA9hdmNDAWQAH//gAAAAABBzdHRzAAAAAAAAAAAAAAAidWR0YQAAABqpeHl6KzQ4Ljg1ODQrMDAyLjI5NDUvAAAADm1kYXQAAAACZYg=',
  ) as Uint8Array,
);

/** A 1 × 1 PNG standing for its poster. */
const POSTER = clean(
  decodeBase64(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ) as Uint8Array,
);

const LARGE: MediaRef = {
  hash: 'e'.repeat(64),
  format: 'webm',
  width: 640,
  height: 360,
  bytes: 40 * 1024 * 1024,
};

function withVideos(): { project: ProjectSnapshot; viewId: string } {
  const project = loadSample();
  const view = project.views[0];
  if (!view) throw new Error('The sample has no view.');
  const at = { y: -2000, width: 64, height: 48 };
  const videos: Picture[] = [
    {
      kind: 'picture',
      id: 'check-in',
      x: -2000,
      ...at,
      media: MP4.ref,
      poster: POSTER.ref,
      name: 'Check-in',
    },
    { kind: 'picture', id: 'bare', x: -1900, ...at, media: MP4.ref },
    { kind: 'picture', id: 'large', x: -1800, ...at, media: LARGE, poster: POSTER.ref },
  ];
  const views = project.views.map((each) =>
    each === view ? { ...each, freeShapes: [...each.freeShapes, ...videos] } : each,
  );
  return { project: { ...project, views }, viewId: view.id };
}

describe('videos in the scene', () => {
  it('are pictures that say they are videos, with their posters, "Video" when unnamed', () => {
    const { project, viewId } = withVideos();
    expect(
      picturesOf(buildScene(project, viewId)).map((each) => [
        each.id,
        each.name,
        each.video,
        each.poster?.hash,
      ]),
    ).toEqual([
      ['check-in', 'Check-in', true, POSTER.ref.hash],
      ['bare', 'Video', true, undefined],
      ['large', 'Video', true, POSTER.ref.hash],
    ]);
  });
});

describe('adding a video', () => {
  const file = (name: string, type: string, size = 1) =>
    Object.defineProperty(new File(['x'], name, { type }), 'size', { value: size });

  it('takes MP4 and WebM files, refuses one past 50 MiB and warns past 25 MiB', () => {
    expect(
      pictureFilesIn([
        file('a.mp4', 'video/mp4'),
        file('b.webm', ''),
        file('c.mov', 'video/quicktime'),
      ]).map((each) => each.name),
    ).toEqual(['a.mp4', 'b.webm']);
    expect(isVideoFile(file('a.m4v', ''))).toBe(true);
    expect(tooLargeToSend(file('a.mp4', 'video/mp4', 40 * 1024 * 1024))).toBe(false);
    expect(tooLargeToSend(file('a.png', 'image/png', 40 * 1024 * 1024))).toBe(true);
    expect(tooLargeToSend(file('a.mp4', 'video/mp4', 50 * 1024 * 1024 + 1))).toBe(true);
    expect(largeVideo(file('a.mp4', 'video/mp4', 26 * 1024 * 1024))).toBe(true);
    expect(largeVideo(file('a.mp4', 'video/mp4', 24 * 1024 * 1024))).toBe(false);
  });

  it('keeps its first frame as its poster, named after it, and places it with the poster', async () => {
    const asked: string[] = [];
    const put = (name: string): Promise<{ ok: true; answer: MediaStoredMessage }> => {
      asked.push(name);
      return Promise.resolve({
        ok: true,
        answer: { type: 'media/stored', requestId: 'r', media: POSTER.ref, removed: [] },
      });
    };
    const video = file('check-in.mp4', 'video/mp4');
    const poster = await keepPoster(video, put, () => Promise.resolve(Uint8Array.of(1)));
    expect(asked).toEqual(['check-in-poster.jpg']);
    expect(poster).toEqual(POSTER.ref);
    expect(await keepPoster(video, put, () => Promise.resolve(undefined))).toBeUndefined();
    expect(addPictureCommand('v', MP4.ref, { x: 0, y: 0 }, 'Check-in', poster)).toMatchObject({
      shape: { kind: 'picture', media: MP4.ref, poster: POSTER.ref, name: 'Check-in' },
    });
  });

  it('makes a poster at most 2,048 pixels a side', () => {
    expect(posterSize(4096, 2160)).toEqual({ width: 2048, height: 1080 });
    expect(posterSize(640, 360)).toEqual({ width: 640, height: 360 });
    expect(posterFileName('a.b.webm')).toBe('a.b-poster.jpg');
  });
});

describe('a video in the SVG', () => {
  it('draws its poster with a play mark, and one without a poster as a dark box with its name', async () => {
    const { project, viewId } = withVideos();
    const media = await exportedMediaOf(
      project.views,
      embeddedMediaFiles({ [POSTER.ref.hash]: POSTER.bytes }),
    );
    // The poster only: a video's own file is never read for a drawing.
    expect([...media.keys()]).toEqual([POSTER.ref.hash]);
    const drawing = writeSvg(project, viewId, { media });
    expect(drawing.text.match(/data-video="true"/g)).toHaveLength(3);
    expect(drawing.text.match(/href="#va-media-1"/g)).toHaveLength(2);
    expect(drawing.text).toContain('fill="#18181b"');
    expect(drawing.text).toContain('>Video<');
  });
});

describe('a video in the read-only page', () => {
  it('holds every poster and a video’s file within 32 MiB, and says how many it leaves to their posters', async () => {
    const { project } = withVideos();
    const files = embeddedMediaFiles({
      [MP4.ref.hash]: MP4.bytes,
      [POSTER.ref.hash]: POSTER.bytes,
    });
    const gathered = await gatherPageMedia(project, files);
    expect(Object.keys(gathered.media).sort()).toEqual([MP4.ref.hash, POSTER.ref.hash].sort());
    expect(gathered.videosLeftOut).toBe(1);
    const read = readPageData(
      JSON.stringify(pageDataOf(project, { media: gathered.media })),
      validateFile,
    );
    expect(read.ok && Object.keys(read.media ?? {}).sort()).toEqual(
      [MP4.ref.hash, POSTER.ref.hash].sort(),
    );
    expect(read.ok && encodeBase64(read.media?.[MP4.ref.hash] ?? new Uint8Array())).toBe(
      encodeBase64(MP4.bytes),
    );
  });
});
