import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import type { Rect } from '../canvas/geometry';
import { buildScene } from '../canvas/scene';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { loadSample } from '../test/sample';
import { PAGE_DATA_ID } from '../viewer/data';
import { LARGE_PAGE, type ViewerAssets } from '../viewer/page';
import { ExportControl } from './ExportControl';
import { FILE_EXPORTS, type FileExport } from './formats';
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
  project?: ProjectSnapshot;
}

function renderControl({
  assets = () => Promise.resolve(ASSETS),
  start = () => 'view=system-overview&select=booking-agent',
  files = [],
  language = 'en',
  project = sample,
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
        project={project}
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

/**
 * Lets the dialog's work run: a moment, then, when `until` is given, more moments until it holds,
 * for a machine too busy to finish within the first.
 */
async function settle(until?: () => boolean): Promise<void> {
  for (let waited = 0; waited < 10_000; waited += 60) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    if (!until || until()) return;
  }
}

/** Whether the dialog has written its page, or said why it could not. */
function pageWritten(): boolean {
  const page = screen.queryByRole('radio', { name: /^(Read-only page|Página de solo lectura)/ });
  return (
    /\d\s?(byte|kB|MB)$/.test(page?.closest('label')?.textContent ?? '') ||
    screen.queryByRole('alert') !== null
  );
}

async function choosePage(): Promise<void> {
  fireEvent.click(within(dialog()).getByRole('radio', { name: /^Read-only page/ }));
  await settle(pageWritten);
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

  it('says it leaves out package code, only when a package of the project holds some', async () => {
    const CODE_LEFT_OUT =
      'Package code, and what it computes and draws: no code of a package runs in a page.';
    renderControl();
    await choosePage();
    expect(within(dialog()).queryByText(CODE_LEFT_OUT)).not.toBeInTheDocument();
    cleanup();

    const coded: ProjectSnapshot = {
      ...sample,
      packages: sample.packages.map((pkg) =>
        pkg.id === 'clinic' ? { ...pkg, code: ['export function check() { return []; }'] } : pkg,
      ),
    };
    const { save } = renderControl({ project: coded });
    await choosePage();
    expect(within(dialog()).getByText(CODE_LEFT_OUT)).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save the page' }));
    const [blob] = save.mock.calls[0]!;
    expect(await blob.text()).not.toContain('export function check');
  });

  it('opens at the project’s first view when asked not to open at what the canvas shows', async () => {
    const { save } = renderControl();
    await choosePage();
    fireEvent.click(
      within(dialog()).getByRole('checkbox', { name: /^Open at what the canvas shows now/ }),
    );
    await settle(pageWritten);
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
    await settle(pageWritten);
    expect(within(dialog()).getByRole('button', { name: 'Guardar la página' })).toBeInTheDocument();
  });
});

describe('Export, with the files of a writer', () => {
  const svg: FileExport = {
    id: 'svg',
    name: () => 'SVG drawing',
    hint: () => 'A drawing that scales',
    extension: 'svg',
    slow: false,
    unavailable: () => undefined,
    leavesOut: () => ['Nothing it draws'],
    make: () =>
      Promise.resolve({
        blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }),
        fileName: 'My systems - System overview.svg',
        lost: ['A picture that could not be read'],
      }),
  };

  /** A slow writer, as the PDF's is, whose file comes when the test says. */
  function slowWriter() {
    let finish: () => void = () => {};
    const made = vi.fn();
    const pdf: FileExport = {
      ...svg,
      id: 'pdf',
      name: () => 'PDF document',
      hint: () => 'Made when saved',
      extension: 'pdf',
      slow: true,
      make: () => {
        made();
        return new Promise((resolve) => {
          finish = () =>
            resolve({ blob: new Blob(['%PDF']), fileName: 'My systems.pdf', lost: [] });
        });
      },
    };
    return { pdf, made, finish: () => finish() };
  }

  it('offers each writer’s file, makes it to say its size, and saves it under its name', async () => {
    const { save } = renderControl({ files: [svg] });
    const formats = within(dialog()).getByRole('group', { name: 'Format' });
    fireEvent.click(
      within(formats).getByRole('radio', { name: 'SVG drawing A drawing that scales' }),
    );
    await settle(() => screen.queryByRole('radio', { name: 'SVG drawing 6 byte' }) !== null);
    expect(within(formats).getByRole('radio', { name: 'SVG drawing 6 byte' })).toBeChecked();
    expect(within(dialog()).getByText('Nothing it draws')).toBeInTheDocument();
    expect(within(dialog()).getByText('A picture that could not be read')).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save SVG' }));
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'My systems - System overview.svg');
  });

  it('makes a slow file only when it is saved, says so, and saves it once it is made', async () => {
    const { pdf, made, finish } = slowWriter();
    const { save } = renderControl({ files: [pdf] });
    fireEvent.click(within(dialog()).getByRole('radio', { name: /^PDF document/ }));
    await settle();
    expect(made).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save PDF' }));
    await settle();
    expect(made).toHaveBeenCalledTimes(1);
    expect(within(dialog()).getByRole('status')).toHaveTextContent(/^Making the file/);
    finish();
    await settle(() => save.mock.calls.length > 0);
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'My systems.pdf');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stops waiting for a slow file, and saves nothing of it', async () => {
    const { pdf, finish } = slowWriter();
    const { save } = renderControl({ files: [pdf] });
    fireEvent.click(within(dialog()).getByRole('radio', { name: /^PDF document/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save PDF' }));
    await settle();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Stop making it' }));
    finish();
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole('status')).toHaveTextContent('');
    expect(within(dialog()).getByRole('button', { name: 'Save PDF' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('says why a view cannot give a format, and does not offer it', () => {
    const none: FileExport = {
      ...svg,
      id: 'structurizr',
      name: () => 'Structurizr DSL',
      unavailable: () => 'The view shows no element of the Systems package.',
    };
    renderControl({ files: [none] });
    expect(
      within(dialog()).getByRole('radio', {
        name: 'Structurizr DSL The view shows no element of the Systems package.',
      }),
    ).toBeDisabled();
  });

  it('lists the writers of SVG, PDF and the text exports by default', () => {
    renderControl({ files: FILE_EXPORTS });
    const formats = within(dialog()).getByRole('group', { name: 'Format' });
    const names = within(formats)
      .getAllByRole('radio')
      .map((radio) => radio.closest('label')?.querySelector('.export-choice-name')?.textContent);
    expect(names).toEqual([
      'PNG image',
      'SVG drawing',
      'PDF document',
      'Outline in Markdown',
      'Mermaid flowchart',
      'Structurizr DSL',
      'Read-only page',
    ]);
  });

  it('writes the SVG of the view with W32’s writer', async () => {
    const { save } = renderControl({ files: FILE_EXPORTS });
    fireEvent.click(within(dialog()).getByRole('radio', { name: /^SVG drawing/ }));
    await settle(() =>
      /\d\s?(byte|kB|MB)$/.test(
        screen.getByRole('radio', { name: /^SVG drawing/ }).closest('label')?.textContent ?? '',
      ),
    );
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save SVG' }));
    const [blob, name] = save.mock.calls[0]!;
    expect(name).toBe('My systems - System overview.svg');
    expect(await blob.text()).toMatch(/^<svg|^<\?xml/);
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
