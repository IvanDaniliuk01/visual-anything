/**
 * A video's poster (ADR 0098, stage 2): its first frame, made in the app, the only place a video is
 * decoded, from the file the person added or from the file of `media/`. The video plays muted in a
 * `<video>` element from a `blob:` address, its first frame is drawn on a canvas at its own size,
 * scaled to at most 2,048 pixels a side, and kept as a JPEG, which the program cleans as any picture.
 */

/** The largest side a poster takes, as the largest a picture's texture takes. */
export const POSTER_SIDE = 2_048;

/** How long a video may take to show its first frame. */
const WAIT_MS = 10_000;

/** A poster's size: the video's own, scaled down to fit 2,048 pixels a side. */
export function posterSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, POSTER_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** A poster's file name, from its video's: `check-in.mp4` gives `check-in-poster.jpg`. */
export function posterFileName(videoName: string): string {
  const base = videoName.replace(/\.[^.]+$/, '').slice(0, 200) || 'video';
  return `${base}-poster.jpg`;
}

/**
 * The first frame of a video as a JPEG's bytes, or `undefined` when the browser cannot decode the
 * video or shows no frame within 10 seconds.
 */
export async function makePoster(video: Blob): Promise<Uint8Array | undefined> {
  const address = URL.createObjectURL(video);
  const element = document.createElement('video');
  element.muted = true;
  element.playsInline = true;
  element.preload = 'auto';
  try {
    const shown = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), WAIT_MS);
      element.addEventListener(
        'loadeddata',
        () => {
          clearTimeout(timer);
          resolve(true);
        },
        { once: true },
      );
      element.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          resolve(false);
        },
        { once: true },
      );
      element.src = address;
    });
    if (!shown || element.videoWidth === 0 || element.videoHeight === 0) return undefined;
    const { width, height } = posterSize(element.videoWidth, element.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.drawImage(element, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  } finally {
    element.removeAttribute('src');
    element.load();
    URL.revokeObjectURL(address);
  }
}
