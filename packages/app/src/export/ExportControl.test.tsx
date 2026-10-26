import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Rect } from '../canvas/geometry';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { ExportControl } from './ExportControl';
import { ImageError, type ImageRequest } from './image';
import { ImageSource, type ImageMaker } from './source';

const BOUNDS: Rect = { x: 0, y: 0, width: 2000, height: 1000 };
const PNG = new Blob(['png'], { type: 'image/png' });

/** What draws images, with the export it records. */
function makerWith(draws: (request: ImageRequest) => Promise<Blob>) {
  const exportImage = vi.fn(draws);
  const maker: ImageMaker = {
    camera: { x: 0, y: 0, scale: 0.5 },
    viewport: { width: 1200, height: 800 },
    exportImage,
  };
  return { maker, exportImage };
}

interface Setup {
  drawn?: ReturnType<typeof makerWith>;
  bounds?: Rect;
  /** The open view's name, or null when none is open. */
  viewName?: string | null;
  language?: 'en' | 'es';
}

function renderControl({
  drawn = makerWith(() => Promise.resolve(PNG)),
  bounds = BOUNDS,
  viewName = 'System overview',
  language = 'en',
}: Setup = {}) {
  const source = new ImageSource();
  source.lend(() => drawn.maker);
  const save = vi.fn<(blob: Blob, name: string) => void>();
  render(
    <LanguageProvider language={language}>
      <ExportControl
        source={source}
        projectName="My systems"
        viewName={viewName ?? undefined}
        bounds={bounds}
        save={save}
      />
    </LanguageProvider>,
  );
  return { exportImage: drawn.exportImage, save };
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog');
}

/** How long a wait for the dialog's drawing may take, for a machine too busy to draw at once. */
const PATIENCE = { timeout: 10_000 };

/** Waits until something holds, as the dialog's drawing makes it hold. */
async function until(holds: () => boolean): Promise<void> {
  await waitFor(() => expect(holds()).toBe(true), PATIENCE);
}

describe('ExportControl', () => {
  it('opens a dialog that exports the open view as PNG', () => {
    renderControl();

    fireEvent.click(screen.getByRole('button', { name: 'Export…' }));

    expect(dialog()).toHaveAccessibleName('Export “System overview” as PNG');
    const show = within(dialog()).getByRole('group', { name: 'Show' });
    expect(within(show).getByRole('radio', { name: /^The whole view/ })).toBeChecked();
    expect(within(show).getByRole('radio', { name: /^What is visible/ })).not.toBeChecked();
  });

  it('says how large each size makes the image, and starts at 2× when it fits', () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }));

    const size = within(dialog()).getByRole('group', { name: 'Size' });
    expect(within(size).getByRole('radio', { name: '1× 2,064 × 1,064 pixels' })).not.toBeChecked();
    expect(within(size).getByRole('radio', { name: '2× 4,128 × 2,128 pixels' })).toBeChecked();

    fireEvent.click(within(dialog()).getByRole('radio', { name: /^What is visible/ }));
    expect(within(size).getByRole('radio', { name: '1× 1,200 × 800 pixels' })).toBeInTheDocument();
  });

  it('draws the image asked for, has the browser save it under the view’s name, and closes', async () => {
    const { exportImage, save } = renderControl();
    const opener = screen.getByRole('button', { name: 'Export…' });
    fireEvent.click(opener);
    fireEvent.click(within(dialog()).getByRole('radio', { name: /^What is visible/ }));
    fireEvent.click(within(dialog()).getByRole('radio', { name: /^1×/ }));

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save PNG' }));
    await until(() => save.mock.calls.length > 0);

    expect(exportImage).toHaveBeenCalledWith({ area: 'visible', scale: 1 });
    expect(save).toHaveBeenCalledWith(PNG, 'My systems - System overview.png');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('says while it draws, and draws once at a time', async () => {
    let finish: (blob: Blob) => void = () => {};
    const { exportImage, save } = renderControl({
      drawn: makerWith(() => new Promise<Blob>((resolve) => (finish = resolve))),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }));
    const saveButton = within(dialog()).getByRole('button', { name: 'Save PNG' });

    fireEvent.click(saveButton);
    await until(() => exportImage.mock.calls.length > 0);
    // While it draws, Save does nothing: the dialog turns it down before it waits for anything.
    fireEvent.click(saveButton);

    expect(within(dialog()).getByRole('status')).toHaveTextContent('Drawing the image…');
    expect(saveButton).toHaveAttribute('aria-disabled', 'true');
    expect(exportImage).toHaveBeenCalledTimes(1);
    finish(PNG);
    await until(() => save.mock.calls.length > 0);
    expect(exportImage).toHaveBeenCalledTimes(1);
  });

  it('says an image is too large, and offers no save for it', () => {
    const huge = { x: 0, y: 0, width: 12_000, height: 6_000 };
    const { exportImage } = renderControl({ bounds: huge });
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }));

    const size = within(dialog()).getByRole('group', { name: 'Size' });
    // 2× would be too large, so it starts at 1×, which is too large as well.
    expect(within(size).getByRole('radio', { name: /^1×/ })).toBeChecked();
    expect(within(size).getByRole('radio', { name: /^2× Too large/ })).toBeInTheDocument();
    expect(
      within(dialog()).getByText(/the most is 16,384 pixels a side and 64 megapixels/),
    ).toBeInTheDocument();
    const saveButton = within(dialog()).getByRole('button', { name: 'Save PNG' });
    expect(saveButton).toHaveAttribute('aria-disabled', 'true');
    // Save turns a size too large down before it waits for anything.
    fireEvent.click(saveButton);
    expect(within(dialog()).getByRole('status')).toHaveTextContent('');
    expect(exportImage).not.toHaveBeenCalled();
  });

  it('says why an image could not be drawn, and stays open', async () => {
    renderControl({
      drawn: makerWith(() => Promise.reject(new ImageError({ reason: 'not-ready' }))),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }));

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save PNG' }));
    await within(dialog()).findByRole('alert', {}, PATIENCE);

    expect(within(dialog()).getByRole('alert')).toHaveTextContent(
      'The canvas is not ready yet. Try again in a moment.',
    );
  });

  it('cannot export without an open view, and says so', () => {
    renderControl({ viewName: null });
    const button = screen.getByRole('button', { name: 'Export…' });

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('title', 'There is no view to export.');
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape and on Cancel, giving the focus back', () => {
    renderControl();
    const opener = screen.getByRole('button', { name: 'Export…' });
    fireEvent.click(opener);
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    fireEvent.click(opener);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reads in Spanish', () => {
    renderControl({ language: 'es' });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar…' }));

    expect(dialog()).toHaveAccessibleName('Exportar “System overview” como PNG');
    expect(within(dialog()).getByRole('radio', { name: /^Toda la vista/ })).toBeChecked();
    expect(
      within(dialog()).getByRole('radio', { name: '1× 2064 × 1064 píxeles' }),
    ).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'Guardar PNG' })).toBeInTheDocument();
  });
});
