/**
 * The media files an exported drawing shows (ADR 0098), read once each before it is written: a bitmap
 * as base64, an SVG as its cleaned markup, and a GIF as its first frame, written as a PNG, since a
 * drawing does not play. A file that cannot be had is left out, and the drawing shows a gray box.
 */
import { composeGifFrames, encodeBase64, parseGif, picturesOf } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import type { MediaFiles } from '../canvas/pictures/files';
import { encodePng } from './png';
import type { ExportedMedia } from './svg';

/** The media files the pictures of these views show, by hash, as a drawing holds them. */
export async function exportedMediaOf(
  views: readonly Pick<ViewFile, 'freeShapes'>[],
  files: MediaFiles | undefined,
): Promise<Map<string, ExportedMedia>> {
  const media = new Map<string, ExportedMedia>();
  if (files === undefined) return media;
  const refs = new Map(
    views.flatMap((view) => picturesOf(view).map((picture) => [picture.media.hash, picture.media])),
  );
  for (const [hash, ref] of refs) {
    const bytes = await files(hash);
    if (bytes === undefined) continue;
    try {
      if (ref.format === 'svg') {
        media.set(hash, { kind: 'svg', svg: new TextDecoder().decode(bytes) });
      } else if (ref.format === 'gif') {
        const document = parseGif(bytes);
        const step = composeGifFrames(document).next();
        if (step.done === true) continue;
        const first: Uint8ClampedArray = step.value;
        const png = await encodePng(first, document.width, document.height);
        media.set(hash, {
          kind: 'bitmap',
          format: 'png',
          data: encodeBase64(png),
          width: document.width,
          height: document.height,
        });
      } else {
        media.set(hash, {
          kind: 'bitmap',
          format: ref.format,
          data: encodeBase64(bytes),
          width: ref.width,
          height: ref.height,
        });
      }
    } catch {
      // A file that does not read is drawn as a missing one.
    }
  }
  return media;
}
