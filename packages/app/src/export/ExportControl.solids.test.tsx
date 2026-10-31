/**
 * Export → Read-only page with solids (ADR 0075): the dialog asks how the page holds the solids its
 * views show, only when they show some, worded for the person; the page then holds their files with
 * the solid worker, or only their pictures, and says how much of it they take. The SVG and the PDF
 * are drawn through the same painter.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { encodeBase64, solidHash, type ProjectSnapshot } from '@visual-anything/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rect } from '../canvas/geometry';
import { buildScene } from '../canvas/scene';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { loadSample } from '../test/sample';
import { ARM_FILE, withSolids } from '../test/solids';
import { PAGE_DATA_ID } from '../viewer/data';
import { SOLID_WORKER_ID, type ViewerAssets } from '../viewer/page';
import { ExportControl } from './ExportControl';
import type { PageSolidSource } from './page-export';
import type { SolidPainter } from './solid-pictures';
import { ImageSource, type ImageMaker } from './source';

const ASSETS: ViewerAssets = {
  script: 'document.title = "viewer";',
  style: 'body{margin:0}',
  solidWorker: 'self.onmessage = () => {}; /* the solid worker */',
};

const maker: ImageMaker = {
  camera: { x: 0, y: 0, scale: 0.5 },
  viewport: { width: 1200, height: 800 },
  exportImage: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
};

/** A painter that draws every picture as one of a single opaque pixel's colour, its bucket's size. */
const painter: SolidPainter = {
  paint: (asks) =>
    Promise.resolve(
      asks.map(() => ({ width: 128, height: 128, pixels: new Uint8ClampedArray(128 * 128 * 4).fill(200) })),
    ),
};

const source: PageSolidSource = {
  files: {
    get: (hash) =>
      Promise.resolve(
        hash === solidHash(ARM_FILE)
          ? { ok: true, bytes: ARM_FILE.slice() }
          : { ok: false, code: 'solid-file-missing', message: 'No such file.' },
      ),
  },
  painter,
};

afterEach(() => cleanup());

function renderControl(project: ProjectSnapshot, assets = vi.fn(() => Promise.resolve(ASSETS))) {
  const images = new ImageSource();
  images.lend(() => maker);
  const save = vi.fn<(blob: Blob, name: string) => void>();
  const view = project.views[0]!;
  render(
    <LanguageProvider language="en">
      <ExportControl
        source={images}
        projectName="Robot"
        viewName={view.name}
        bounds={{ x: 0, y: 0, width: 1000, height: 800 } satisfies Rect}
        save={save}
        project={project}
        page={{ start: () => undefined, assets, solids: source }}
        drawn={{ view, scene: buildScene(project, view.id), theme: 'light' }}
        files={[]}
      />
    </LanguageProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Export…' }));
  return { save, assets };
}

async function pageSaved(save: ReturnType<typeof vi.fn>): Promise<string> {
  const button = within(screen.getByRole('dialog')).getByRole('button', { name: /^Save the page/ });
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'), { timeout: 10_000 });
  fireEvent.click(button);
  const [blob] = save.mock.calls.at(-1) as [Blob, string];
  return blob.text();
}

describe('Export → Read-only page, with solids', () => {
  it('asks nothing of solids for a project whose views show none', async () => {
    renderControl(loadSample());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: /^Read-only page/ }));
    expect(screen.queryByRole('group', { name: 'Solids' })).toBeNull();
  });

  it('holds their files and the solid worker by default, and says what they take of the page', async () => {
    const { save, assets } = renderControl(withSolids());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: /^Read-only page/ }));
    const group = screen.getByRole('group', { name: 'Solids' });
    const turn = within(group).getByRole('radio', { name: /^Turn them in the page/ });
    expect(turn).toBeChecked();
    expect(within(group).getByRole('radio', { name: /^Only their pictures/ })).not.toBeChecked();
    await waitFor(() => expect(screen.getByText(/^Its solids take /)).toBeInTheDocument(), {
      timeout: 10_000,
    });
    const html = await pageSaved(save);
    expect(assets).toHaveBeenCalled();
    expect(html).toContain(`id="${SOLID_WORKER_ID}"`);
    expect(html).toContain('worker-src blob:');
    const data = /<script type="application\/json" id="[^"]+">([\s\S]*?)<\/script>/.exec(html);
    expect(data?.[0]).toContain(PAGE_DATA_ID);
    const held = JSON.parse(data?.[1] ?? '{}') as { solids?: { form: string; files: object } };
    expect(held.solids?.form).toBe('files');
    expect(held.solids?.files).toEqual({ [solidHash(ARM_FILE)]: encodeBase64(ARM_FILE) });
  });

  it('holds only their pictures when asked, with neither three.js nor the worker', async () => {
    const { save } = renderControl(withSolids());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: /^Read-only page/ }));
    fireEvent.click(screen.getByRole('radio', { name: /^Only their pictures/ }));
    await waitFor(() => expect(screen.getByText(/^Its solids take /)).toBeInTheDocument(), {
      timeout: 10_000,
    });
    const html = await pageSaved(save);
    expect(html).not.toContain(SOLID_WORKER_ID);
    expect(html).not.toContain(ASSETS.solidWorker);
    expect(html).toContain("worker-src 'none'");
    const data = /<script type="application\/json" id="[^"]+">([\s\S]*?)<\/script>/.exec(html);
    const held = JSON.parse(data?.[1] ?? '{}') as {
      solids?: { form: string; pictures: { key: string; png: string }[] };
    };
    expect(held.solids?.form).toBe('pictures');
    expect(held.solids?.pictures.length).toBeGreaterThan(0);
    for (const picture of held.solids?.pictures ?? []) expect(picture.png).toMatch(/^iVBORw0KGgo/);
  });
});
