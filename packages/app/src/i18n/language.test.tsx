import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_PREFERENCES, type PreferenceChanges } from '@visual-anything/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Live, PreferencesAnswer } from '../live/context';
import { LiveContext } from '../live/context';
import { Header } from '../shell/Header';
import { Notices } from '../shell/Notices';
import { SEND_DELAY_MS, resetPreferencesForTests } from '../theme/store';
import { fakeLive } from '../test/fakeLive';
import { browserLanguage, currentLanguage, resolveLanguage } from './language';
import { LanguageProvider } from './LanguageProvider';
import { t } from './t';
import { useT } from './useT';

afterEach(() => {
  resetPreferencesForTests();
  vi.useRealTimers();
});

function stubBrowserLanguages(languages: readonly string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(languages[0] ?? '');
}

/** The header of an open project, in a live session that may carry preferences. */
function renderApp(live: Live, language?: 'en' | 'es') {
  return render(
    <LanguageProvider language={language}>
      <LiveContext value={live}>
        <Header projectName="My systems" viewName="System overview" />
        <Notices />
      </LiveContext>
    </LanguageProvider>,
  );
}

/** The Language control's radios, in the header's Language and theme, opened if it is not (A5). */
function languageChoices(): HTMLElement {
  const button = screen.getByRole('button', { name: /^(Menu|Menú)$/ });
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
  return screen.getByRole('radiogroup', { name: /^(Language|Idioma)$/ });
}

/** The language chosen in the Language control. */
function chosenLanguage(): string | null {
  const checked = within(languageChoices())
    .getAllByRole<HTMLInputElement>('radio')
    .find((radio) => radio.checked);
  return checked?.value ?? null;
}

describe('the browser’s language', () => {
  it('is Spanish for any Spanish, and English for any other language', () => {
    expect(browserLanguage(['es'])).toBe('es');
    expect(browserLanguage(['es-AR', 'en'])).toBe('es');
    expect(browserLanguage(['ES-mx'])).toBe('es');
    expect(browserLanguage(['en-US'])).toBe('en');
    expect(browserLanguage(['fr-FR'])).toBe('en');
    expect(browserLanguage([])).toBe('en');
  });

  it('is the first of the person’s languages the app reads', () => {
    expect(browserLanguage(['fr-FR', 'es-ES', 'en'])).toBe('es');
    expect(browserLanguage(['en-GB', 'es'])).toBe('en');
  });

  it('applies only while the person matches the browser', () => {
    expect(resolveLanguage('system', ['es-AR'])).toBe('es');
    expect(resolveLanguage('en', ['es-AR'])).toBe('en');
    expect(resolveLanguage('es', ['en-US'])).toBe('es');
  });
});

describe('the language provider', () => {
  it('reads in the browser’s language until the person chooses one', () => {
    stubBrowserLanguages(['es-AR', 'en']);
    renderApp(fakeLive());
    expect(screen.getByText('Proyecto')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
    expect(currentLanguage()).toBe('es');
  });

  it('reads in English when the browser asks for a language it does not read', () => {
    stubBrowserLanguages(['de-DE']);
    renderApp(fakeLive());
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('follows the language the local program keeps for the person', () => {
    stubBrowserLanguages(['en-US']);
    renderApp({ ...fakeLive(), preferences: { ...DEFAULT_PREFERENCES, language: 'es' } });
    expect(screen.getByText('Vista')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
  });

  it('re-renders what it holds when the language changes', () => {
    function Probe() {
      const t = useT();
      return <p>{t('Undo')}</p>;
    }
    const { rerender } = render(
      <LanguageProvider language="en">
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByText('Undo')).toBeInTheDocument();
    rerender(
      <LanguageProvider language="es">
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByText('Deshacer')).toBeInTheDocument();
  });

  it('is the current language already while what it holds renders', () => {
    // Code outside React that a component calls as it renders, such as a relation's sentence.
    function Probe() {
      useT();
      return <p>{t('Redo')}</p>;
    }
    const { rerender } = render(
      <LanguageProvider language="en">
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByText('Redo')).toBeInTheDocument();
    rerender(
      <LanguageProvider language="es">
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByText('Rehacer')).toBeInTheDocument();
  });
});

describe('the Language control', () => {
  it('offers matching the browser, English and Español, each language by its own name', () => {
    stubBrowserLanguages(['es-AR']);
    renderApp(fakeLive());
    const options = within(languageChoices()).getAllByRole('radio');
    expect(options.map((option) => option.closest('label')?.textContent)).toEqual([
      'Usar el idioma del navegador (Español)',
      'English',
      'Español',
    ]);
    expect(options[2]?.closest('label')?.querySelector('[lang]')).toHaveAttribute('lang', 'es');
    expect(chosenLanguage()).toBe('system');
  });

  it('applies a choice in the tab at once, and the program keeps it', async () => {
    vi.useFakeTimers();
    stubBrowserLanguages(['en-US']);
    const asked: PreferenceChanges[] = [];
    const setPreferences = vi.fn((changes: PreferenceChanges) => {
      asked.push(changes);
      return Promise.resolve<PreferencesAnswer>({
        ok: true,
        preferences: { ...DEFAULT_PREFERENCES, ...changes },
      });
    });
    renderApp({ ...fakeLive(), preferences: DEFAULT_PREFERENCES, setPreferences });
    fireEvent.click(within(languageChoices()).getByRole('radio', { name: 'Español' }));
    expect(screen.getByText('Proyecto')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
    await act(async () => {
      vi.advanceTimersByTime(SEND_DELAY_MS);
      await Promise.resolve();
    });
    expect(asked).toEqual([{ language: 'es' }]);
    expect(chosenLanguage()).toBe('es');
  });
});

describe('the header and the notices in Spanish', () => {
  it('names the action undo and redo would do, through the core’s templates', () => {
    renderApp(
      fakeLive({
        history: {
          undo: { label: 'Rename "API" to "Gateway"', author: 'user' },
          redo: { label: 'Rename "A" to "B"', author: 'claude' },
        },
      }),
      'es',
    );
    const history = screen.getByRole('group', { name: 'Historial para deshacer' });
    expect(
      within(history).getByRole('button', {
        name: 'Deshacer: Cambiar el nombre de "API" a "Gateway"',
      }),
    ).toBeInTheDocument();
    expect(
      within(history).getByRole('button', {
        name: 'Rehacer la acción de Claude: Cambiar el nombre de "A" a "B"',
      }),
    ).toBeInTheDocument();
  });

  it('shows the notices in Spanish, what the core wrote included', () => {
    renderApp(
      fakeLive({
        notices: [
          { id: 1, level: 'error', message: 'Could not undo: There is nothing to undo.' },
          { id: 2, level: 'warning', message: 'Something nobody translated.' },
        ],
      }),
      'es',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Error: No se pudo deshacer: No hay nada que deshacer.',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Advertencia: Something nobody translated.',
    );
    expect(screen.getAllByRole('button', { name: 'Descartar' })).toHaveLength(2);
  });
});
