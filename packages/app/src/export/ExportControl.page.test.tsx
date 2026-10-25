import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Rect } from '../canvas/geometry';
import { buildScene } from '../canvas/scene';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { loadSample } from '../test/sample';
import { PAGE_DATA_ID } from '../viewer/data';
import { LARGE_PAGE, type ViewerAssets } from '../viewer/page';
import { ExportControl } from './ExportControl';
import type { FileExport } from './formats';
import {
  ViewerMissing,
  fetchViewerAssets,
  fragmentOf,
  pageFileName,
  sizeText,
} from './page-export';
import { ImageSource, type ImageMaker } from './source';

const sample = loadSample();
const VIEW = sample.views[0]!;
const BOUNDS: Rect = { x: 0, y: 0, width: 2000, height: 1000 };
const ASSETS: ViewerAssets = { script: 'document.title = "viewer";', style: 'body{margin:0}' };
const TOKEN = 'k3J9xQ2mZ7pL0vB5nC8rT1yW4sD6fG3hJ9kL2zX5cV8';

const maker: ImageMaker = {
  camera: { x: 0, y: 0, scale: 0.5 },
  viewport: { width: 1200, height: 800 },
  exportImage: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
};

interface Setup {
  assets?: () => Promise<ViewerAssets>;
  start?: () => string | undefined;
  files?: readonly FileExport[];
  language?: 'en' | 'es';
}

function renderControl({
  assets = () => Promise.resolve(ASSETS),
  start = () => 'view=system-overview&select=booking-agent',
  files = [],
  language = 'en',
}: Setup = {}) {
  const source = new ImageSource();
  source.lend(() => maker);
  const save = vi.fn<(blob: Blob, name: string) => void>();
  render(
    <LanguageProvider language={language}>
      <ExportControl
        source={source}
        projectName="My systems"
        viewName={VIEW.name}
        bounds={BOUNDS}
        save={save}
        project={sample}
        page={{ start, assets }}
        drawn={{ view: VIEW, scene: buildScene(sample, VIEW.id), theme: 'light' }}
        files={files}
      />
    </LanguageProvider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: language === 'es' ? 'Exportar…' : 'Export…' }),
  );
  return { save };
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog');
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

async function choosePage(): Promise<void> {
  fireEvent.click(within(dialog()).getByRole('radio', { name: /^Read-only page/ }));
  await settle();
}

describe('Export, with the read-only page', () => {
  it('offers the PNG and the page, each with its size, the PNG chosen first', () => {
    renderControl();
    expect(dialog()).toHaveAccessibleName('Export “System overview”');
    const formats = within(dialog()).getByRole('group', { name: 'Format' });
    expect(
      within(formats).getByRole('radio', { name: 'PNG image 4,128 × 2,128 pixels' }),
    ).toBeChecked();
    expect(
      within(formats).getByRole('radio', {
        name: 'Read-only page One file to share, embed and read on a phone',
      }),
    ).not.toBeChecked();
    expect(within(dialog()).getByRole('button', { name: 'Save PNG' })).toBeInTheDocument();
  });

  it('writes the page once it is chosen, says its size and what it leaves out, and saves it', async () => {
    const { save } = renderControl();
    await choosePage();
    const page = within(dialog()).getByRole('radio', { name: /^Read-only page/ });
    expect(page).toBeChecked();
    expect(page).toHaveAccessibleName(expect.stringMatching(/^Read-only page \d+(\.\d)? kB$/));
    expect(within(dialog()).getByText(/^It holds the whole project/)).toBeInTheDocument();
    expect(
      within(dialog()).getByText(
        'Editing, the history and Claude’s guidance: the page only reads.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save the page' }));
    expect(save).toHaveBeenCalledTimes(1);
    const [blob, name] = save.mock.calls[0]!;
    expect(name).toBe('My systems.html');
    const html = await blob.text();
    expect(html).toContain(`id="${PAGE_DATA_ID}"`);
    expect(html).toContain(ASSETS.script);
    // The data writes `&` as an escape, which JSON reads the same.
    expect(html).toContain('"start":"view=system-overview\\u0026select=booking-agent"');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens at the project’s first view when asked not to open at what the canvas shows', async () => {
    const { save } = renderControl();
    await choosePage();
    fireEvent.click(
      within(dialog()).getByRole('checkbox', { name: /^Open at what the canvas shows now/ }),
    );
    await settle();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save the page' }));
    const html = await save.mock.calls[0]![0].text();
    expect(html).not.toContain('"start"');
  });

  it('holds no token, whatever the tab keeps', async () => {
    window.sessionStorage.setItem('visual-anything.session-token', TOKEN);
    const { save } = renderControl();
    await choosePage();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save the page' }));
    const html = await save.mock.calls[0]![0].text();
    expect(html).not.toContain(TOKEN);
    expect(html).not.toContain('session-token');
  });

  it('says so before saving a page past 25 MB', async () => {
    const big: ViewerAssets = { ...ASSETS, script: `/*${'x'.repeat(LARGE_PAGE)}*/` };
    const { save } = renderControl({ assets: () => Promise.resolve(big) });
    await choosePage();
    // Hashing and measuring 25 MB takes a moment.
    const alert = await within(dialog()).findByRole('alert', {}, { timeout: 20_000 });
    expect(alert).toHaveTextContent(/^This page is 25 MB, past 25 MB: it may open slowly/);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save the page anyway' }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('says what to do when the program has no viewer to give, and saves nothing', async () => {
    const { save } = renderControl({ assets: () => Promise.reject(new ViewerMissing('missing')) });
    await choosePage();
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(/Run pnpm build/);
    const button = within(dialog()).getByRole('button', { name: 'Save the page' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(save).not.toHaveBeenCalled();
  });

  it('reads in Spanish', async () => {
    renderControl({ language: 'es' });
    expect(dialog()).toHaveAccessibleName('Exportar “System overview”');
    fireEvent.click(within(dialog()).getByRole('radio', { name: /^Página de solo lectura/ }));
    await settle();
    expect(within(dialog()).getByRole('button', { name: 'Guardar la página' })).toBeInTheDocument();
  });
});

describe('Export, with the files of a writer', () => {
  const svg: FileExport = {
    id: 'svg',
    name: () => 'SVG drawing',
    hint: () => 'A drawing that scales',
    extension: 'svg',
    leavesOut: () => ['Nothing it draws'],
    make: () => Promise.resolve(new Blob(['<svg/>'], { type: 'image/svg+xml' })),
  };

  it('offers each writer’s file, makes it to say its size, and saves it with its extension', async () => {
    const { save } = renderControl({ files: [svg] });
    const formats = within(dialog()).getByRole('group', { name: 'Format' });
    fireEvent.click(
      within(formats).getByRole('radio', { name: 'SVG drawing A drawing that scales' }),
    );
    await settle();
    expect(within(formats).getByRole('radio', { name: 'SVG drawing 6 byte' })).toBeChecked();
    expect(within(dialog()).getByText('Nothing it draws')).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save SVG' }));
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'My systems - System overview.svg');
  });
});

describe('The page’s file and its viewer', () => {
  it('is named after the project', () => {
    expect(pageFileName('My systems')).toBe('My systems.html');
    expect(pageFileName('a/b: c')).toBe('a-b- c.html');
    expect(pageFileName('')).toBe('view.html');
  });

  it('opens at a view address’s fragment', () => {
    expect(fragmentOf('http://127.0.0.1:4/#view=a&select=b')).toBe('view=a&select=b');
    expect(fragmentOf('http://127.0.0.1:4/')).toBeUndefined();
    expect(fragmentOf(undefined)).toBeUndefined();
  });

  it('says sizes as people read them', () => {
    expect(sizeText('en', 512)).toBe('512 byte');
    expect(sizeText('en', 1_561_794)).toBe('1.6 MB');
    expect(sizeText('es', 1_561_794)).toBe('1,6 MB');
  });

  it('fetches the viewer beside the app, and counts anything else as missing', async () => {
    const asked: string[] = [];
    const served = (type: string, text: string) => ({
      ok: true,
      headers: new Headers({ 'content-type': type }),
      text: () => Promise.resolve(text),
    });
    const assets = await fetchViewerAssets('http://127.0.0.1:4700/', (url) => {
      asked.push(url);
      return Promise.resolve(
        url.endsWith('.js')
          ? served('text/javascript; charset=utf-8', 'js')
          : served('text/css; charset=utf-8', 'css'),
      );
    });
    expect(assets).toEqual({ script: 'js', style: 'css' });
    expect(asked).toEqual([
      'http://127.0.0.1:4700/viewer/viewer.js',
      'http://127.0.0.1:4700/viewer/viewer.css',
    ]);
    await expect(
      fetchViewerAssets('http://127.0.0.1:4700/', () =>
        Promise.resolve(served('text/html', '<!doctype html>')),
      ),
    ).rejects.toBeInstanceOf(ViewerMissing);
  });
});
