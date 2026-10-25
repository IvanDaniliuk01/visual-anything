import { render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { ImageSource, ImageSourceContext, useLendRenderer, type ImageMaker } from './source';

const maker: ImageMaker = {
  camera: { x: 0, y: 0, scale: 1 },
  viewport: { width: 800, height: 600 },
  exportImage: () => Promise.resolve(new Blob()),
};

function Canvas({ renderer }: { renderer: ImageMaker | undefined }) {
  const controller = useRef<{ renderer: ImageMaker } | null>(
    renderer === undefined ? null : { renderer },
  );
  useLendRenderer(controller);
  return null;
}

describe('ImageSource', () => {
  it('reaches the renderer the canvas lends, while the canvas is mounted', () => {
    const source = new ImageSource();
    const view = render(
      <ImageSourceContext value={source}>
        <Canvas renderer={maker} />
      </ImageSourceContext>,
    );

    expect(source.maker).toBe(maker);
    view.unmount();
    expect(source.maker).toBeUndefined();
  });

  it('has none while the canvas has no renderer, and outside a shell lends nothing', () => {
    const source = new ImageSource();
    render(
      <ImageSourceContext value={source}>
        <Canvas renderer={undefined} />
      </ImageSourceContext>,
    );
    expect(source.maker).toBeUndefined();
    expect(() => render(<Canvas renderer={maker} />)).not.toThrow();
  });

  it('keeps what a later canvas lends when an earlier one takes its own back', () => {
    const source = new ImageSource();
    const first = source.lend(() => maker);
    const other = { ...maker };
    source.lend(() => other);
    first();
    expect(source.maker).toBe(other);
  });
});
