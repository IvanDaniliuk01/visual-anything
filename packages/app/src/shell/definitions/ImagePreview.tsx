import { decodeBase64, type CleanedImage } from '@visual-anything/core';
import { useEffect, useRef } from 'react';
import { loadSvgPicture } from '../../canvas/images';

interface ImagePreviewProps {
  /** The cleaned view of the image: previews are drawn from nothing else. */
  image: CleanedImage;
  /** Its longer side on screen, in pixels. */
  size: number;
}

/**
 * A picture drawn into a canvas, as the canvas's textures are made: SVG through a Blob URL into a
 * detached image, revoked once decoded; bitmaps with `createImageBitmap`. No image is ever put in the
 * page, and nothing is drawn as markup. Where the browser draws no 2D canvas, it shows empty.
 */
export function ImagePreview({ image, size }: ImagePreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const density = Math.min(3, Math.max(1, Math.ceil(globalThis.devicePixelRatio || 1)));
  const side = size * density;

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let gone = false;
    const long = Math.max(image.width, image.height);
    const width = Math.max(1, Math.round((side * image.width) / long));
    const height = Math.max(1, Math.round((side * image.height) / long));
    const draw = async () => {
      const picture: CanvasImageSource & { close?: () => void } =
        image.kind === 'svg'
          ? await loadSvgPicture(image.svg, width, height)
          : await createImageBitmap(
              new Blob([decodeBase64(image.data) as Uint8Array<ArrayBuffer>], {
                type: `image/${image.format}`,
              }),
              { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' },
            );
      if (!gone) {
        context.clearRect(0, 0, side, side);
        context.drawImage(picture, (side - width) / 2, (side - height) / 2, width, height);
      }
      picture.close?.();
    };
    draw().catch(() => {
      // A picture the browser cannot draw shows an empty preview, as it shows a placeholder on the canvas.
    });
    return () => {
      gone = true;
    };
  }, [image, side]);

  return (
    <canvas
      ref={ref}
      className="image-preview"
      width={side}
      height={side}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
