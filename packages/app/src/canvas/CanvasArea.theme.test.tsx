/**
 * The canvas follows the person's theme: the canvas area starts in it and passes every change to the
 * renderer, and the shell's panels change in the frame the canvas shows it (ADR-0033).
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SELECTION } from '../editor/selection';
import { Shell } from '../shell/Shell';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { changePreferences, resetPreferencesForTests } from '../theme/store';
import { THEMES } from '../theme/themes';
import { CanvasArea } from './CanvasArea';
import { CanvasRenderer } from './renderer';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const project = loadSample();
const view = project.views[0]!;
const scene = buildScene(project, view.id);

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  resetPreferencesForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetPreferencesForTests();
});

async function started(): Promise<void> {
  await act(async () => {
    FakeApplication.created.at(-1)?.finishInit();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('CanvasArea themes', () => {
  it('starts the canvas in its theme, passes changes on, and says when the canvas shows one', async () => {
    const shown = vi.fn();
    const setTheme = vi.spyOn(CanvasRenderer.prototype, 'setTheme');
    const area = (theme: 'light' | 'dark') => (
      <CanvasArea
        project={project}
        view={view}
        scene={scene}
        label="System overview"
        selection={EMPTY_SELECTION}
        onSelect={() => undefined}
        theme={theme}
        onThemeShown={shown}
      />
    );
    const { rerender } = render(area('dark'));
    expect(FakeApplication.created.at(-1)?.initOptions?.background).toBe(
      THEMES.dark.canvas.background,
    );
    await started();
    expect(shown).toHaveBeenCalledWith('dark');
    rerender(area('light'));
    expect(setTheme).toHaveBeenLastCalledWith(THEMES.light.canvas);
  });
});

describe('Shell themes', () => {
  it('draws the canvas in the person’s theme, and changes the panels when the canvas shows it', async () => {
    const setTheme = vi.spyOn(CanvasRenderer.prototype, 'setTheme');
    render(<Shell project={project} />);
    await started();
    const root = document.documentElement;
    const before = root.getAttribute('data-theme');
    act(() => changePreferences({ theme: before === 'dark' ? 'light' : 'dark' }));
    const wanted = before === 'dark' ? 'light' : 'dark';
    expect(setTheme).toHaveBeenLastCalledWith(THEMES[wanted].canvas);
    // The page waits for the canvas, which shows the theme in a frame of its own.
    expect(root.getAttribute('data-theme')).toBe(before);
    const renderer = setTheme.mock.contexts.at(-1) as CanvasRenderer;
    for (let frame = 0; frame < 40 && renderer.switching; frame++) renderer.renderNow();
    expect(renderer.theme).toBe(wanted);
    expect(root.getAttribute('data-theme')).toBe(wanted);
  });
});
