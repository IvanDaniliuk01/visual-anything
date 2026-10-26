/**
 * Why a file of the Export dialog could not be written, in Spanish (ADR-0038): a reason of the app's
 * own, such as the PDF writer's fonts that cannot be read, reads in the language; a reason from
 * outside, such as a library's, stays as it was written.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { loadSample } from '../test/sample';
import { ExportControl } from './ExportControl';
import type { FileExport } from './formats';
import { ImageSource } from './source';

const sample = loadSample();

/** A writer that fails with a reason. */
function failing(reason: string): FileExport {
  return {
    id: 'failing',
    name: () => 'Failing',
    hint: () => 'It fails.',
    extension: 'pdf',
    slow: false,
    unavailable: () => undefined,
    leavesOut: () => [],
    make: () => Promise.reject(new Error(reason)),
  };
}

async function failureShown(reason: string): Promise<string> {
  render(
    <LanguageProvider language="es">
      <ExportControl
        source={new ImageSource()}
        projectName="My systems"
        viewName="System overview"
        bounds={{ x: 0, y: 0, width: 100, height: 100 }}
        project={sample}
        drawn={{ view: sample.views[0] as ViewFile, scene: {} as never, theme: 'light' }}
        files={[failing(reason)]}
      />
    </LanguageProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Exportar…' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: /^Failing/ }));
  for (let waited = 0; waited < 2000 && screen.queryByRole('alert') === null; waited += 20) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  return screen.getByRole('alert').textContent ?? '';
}

describe('why a file could not be written, in Spanish', () => {
  it('reads the app’s own reason in the language', async () => {
    expect(await failureShown('The fonts the PDF embeds could not be read.')).toBe(
      'No se pudo escribir el archivo: No se pudieron leer las fuentes que incorpora el PDF.',
    );
  });

  it('keeps a reason from outside as it was written', async () => {
    expect(await failureShown('Unknown font format')).toBe(
      'No se pudo escribir el archivo: Unknown font format',
    );
  });
});
