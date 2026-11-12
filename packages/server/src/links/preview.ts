/**
 * A link card's preview as the program answers `link/fetch` (ADR 0098, stage 3): the page's title
 * and description, and its image fetched, checked to be a PNG, JPEG, WebP or GIF by its first bytes,
 * then cleaned and kept in `media/` as any picture's file. An image that cannot be had is left out,
 * and a note says why; the title and description still come.
 */
import type { LinkPreview, Problem } from '@visual-anything/core';
import type { Keeping } from '../media/store';
import type { LinkFetcher } from './preview-fetch';

export type PreviewAnswer =
  { ok: true; preview: LinkPreview; notes: string[] } | { ok: false; problem: Problem };

/** Whether a file's first bytes are a PNG's, a JPEG's, a WebP's or a GIF's. */
export function isPreviewImage(bytes: Uint8Array): boolean {
  const starts = (...expected: number[]) => expected.every((byte, at) => bytes[at] === byte);
  const ascii = (text: string, at: number) =>
    [...text].every((char, index) => bytes[at + index] === char.charCodeAt(0));
  return (
    starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ||
    starts(0xff, 0xd8, 0xff) ||
    ascii('GIF87a', 0) ||
    ascii('GIF89a', 0) ||
    (ascii('RIFF', 0) && ascii('WEBP', 8))
  );
}

/** Fetches a card's preview, and keeps its image as a media file. */
export async function fetchPreview(
  url: string,
  fetcher: Pick<LinkFetcher, 'page' | 'image'>,
  keep: (bytes: Uint8Array) => Promise<Keeping>,
): Promise<PreviewAnswer> {
  const page = await fetcher.page(url);
  if (!page.ok) return page;
  const { title, description, image } = page.preview;
  const notes: string[] = [];
  const preview: LinkPreview = {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
  };
  if (image !== undefined) {
    const shown = image.length > 200 ? `${image.slice(0, 199)}…` : image;
    const fetched = await fetcher.image(image);
    if (!fetched.ok) {
      notes.push(`The page's image, ${shown}, is left out: it ${fetched.reason}.`);
    } else if (!isPreviewImage(fetched.bytes)) {
      notes.push(`The page's image, ${shown}, is left out: it is not a PNG, JPEG, WebP or GIF.`);
    } else {
      const kept = await keep(fetched.bytes);
      if (kept.ok) preview.picture = kept.media;
      else notes.push(`The page's image, ${shown}, is left out: ${kept.problem.message}`);
    }
  }
  return { ok: true, preview, notes };
}
