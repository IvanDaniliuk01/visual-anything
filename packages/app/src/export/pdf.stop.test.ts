// @vitest-environment node
// In Node, as `pdf.test.ts` is, for the same reason. Stopping a PDF: the writer draws its SVG piece by
// piece, and once its signal is aborted it draws no further piece and rejects as stopped.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_VIEW, richSample } from '../test/exports';
import { loadSample } from '../test/sample';
import { exportView, isStopped } from './exports';
import { writePdf } from './pdf';
import { svgPieces, writeSvg } from './svg';

/** How many pieces SVG-to-PDFKit drew, and what to do after each. */
const drawn = vi.hoisted(() => ({ pieces: 0, after: undefined as (() => void) | undefined }));

// SVG-to-PDFKit as it is, counting what it draws.
vi.mock('svg-to-pdfkit', async (importOriginal) => {
  const real = (await importOriginal<{ default: (...args: unknown[]) => void }>()).default;
  return {
    default: (...args: unknown[]) => {
      drawn.pieces += 1;
      real(...args);
      drawn.after?.();
    },
  };
});

afterEach(() => {
  drawn.pieces = 0;
  drawn.after = undefined;
});

/** Lets every timer and message waiting run, a few times over. */
async function idle(): Promise<void> {
  for (let round = 0; round < 10; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('stopping a PDF', () => {
  it('draws its SVG in several pieces, as many as the drawing has', async () => {
    const project = richSample();
    const pieces = svgPieces(writeSvg(project, SAMPLE_VIEW).layers, 64_000);
    expect(pieces.length).toBeGreaterThan(2);
    await writePdf(project, SAMPLE_VIEW);
    expect(drawn.pieces).toBe(pieces.length);
  }, 60_000);

  it('draws no further piece once stopped, and rejects as stopped', async () => {
    const controller = new AbortController();
    // Stopped while the first piece is drawn, as a click on Stop would come in between.
    drawn.after = () => controller.abort();
    const made = writePdf(richSample(), SAMPLE_VIEW, { signal: controller.signal });
    const error = await made.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
    expect(isStopped(error, controller.signal)).toBe(true);
    expect(drawn.pieces).toBe(1);
    await idle();
    expect(drawn.pieces).toBe(1);
  }, 60_000);

  it('does nothing at all when it is stopped before it starts', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      writePdf(loadSample(), SAMPLE_VIEW, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await idle();
    expect(drawn.pieces).toBe(0);
  }, 60_000);

  it('stops through exportView too, for every format', async () => {
    const controller = new AbortController();
    drawn.after = () => controller.abort();
    const pdf = exportView(loadSample(), SAMPLE_VIEW, 'pdf', { signal: controller.signal });
    await expect(pdf).rejects.toMatchObject({ name: 'AbortError' });
    expect(drawn.pieces).toBe(1);
    for (const format of ['svg', 'md', 'mermaid', 'structurizr'] as const) {
      await expect(
        exportView(loadSample(), SAMPLE_VIEW, format, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
    }
  }, 60_000);

  it('tells a stop from a failure', () => {
    const controller = new AbortController();
    expect(isStopped(new Error('The fonts the PDF embeds could not be read.'))).toBe(false);
    expect(isStopped(new DOMException('Stopped', 'AbortError'))).toBe(true);
    controller.abort(new Error('the person stopped it'));
    expect(isStopped(controller.signal.reason, controller.signal)).toBe(true);
  });
});
