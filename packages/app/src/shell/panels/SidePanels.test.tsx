import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardHelp } from '../../canvas/KeyboardHelp';
import { setCurrentLanguage } from '../../i18n/language';
import { ui } from '../../i18n/es';
import { loadSample } from '../../test/sample';
import { Shell } from '../Shell';
import { PANEL_STORAGE_KEY } from './layout';
import { PANEL_KEYS } from './keys';

vi.mock('../../canvas/CanvasArea', () => import('../../test/FakeCanvasArea'));

const sample = loadSample();
const MODEL_PANEL = 'Outline and model';

/** The frames the panels wait for, run by hand. */
let frames: Map<number, FrameRequestCallback>;

beforeEach(() => {
  localStorage.clear();
  frames = new Map();
  let next = 1;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(next, callback);
    return next++;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => frames.delete(handle));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function runFrames(): void {
  const waiting = [...frames.values()];
  frames.clear();
  act(() => {
    for (const callback of waiting) callback(0);
  });
}

function shellOf(): HTMLElement {
  const shell = document.querySelector<HTMLElement>('.shell');
  if (!shell) throw new Error('There is no shell.');
  return shell;
}

function press(key: string, init: KeyboardEventInit = {}, target: Element = document.body) {
  fireEvent.keyDown(target, { key, code: `Key${key.toUpperCase()}`, ...init });
}

describe('the side panels', () => {
  it('collapse to a strip from the button on their edge, and open again from it', () => {
    render(<Shell project={sample} />);
    const collapse = screen.getByRole('button', { name: 'Collapse the model panel' });
    expect(collapse).toHaveAttribute('aria-keyshortcuts', 'Alt+Shift+M');
    expect(collapse).toHaveAttribute('title', 'Collapse the model panel (Alt+Shift+M)');
    collapse.focus();
    fireEvent.click(collapse);
    expect(screen.queryByRole('complementary', { name: MODEL_PANEL })).not.toBeInTheDocument();
    expect(screen.queryByRole('separator', { name: 'Width of the model panel' })).toBeNull();
    const open = screen.getByRole('button', { name: 'Open the model panel' });
    expect(open).toHaveFocus();
    expect(open).toHaveAttribute('aria-controls', document.querySelector('.model-panel')?.id);
    expect(shellOf()).toHaveAttribute('data-model-panel-collapsed');
    expect(screen.getByText('The model panel is collapsed.')).toHaveAttribute(
      'aria-live',
      'polite',
    );

    fireEvent.click(open);
    expect(screen.getByRole('complementary', { name: MODEL_PANEL })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Collapse the model panel' })).toHaveFocus();
    expect(screen.getByText('The model panel is open.')).toBeInTheDocument();
    expect(shellOf()).not.toHaveAttribute('data-model-panel-collapsed');
  });

  it('collapse the inspector the same way, and keep the other panel as it is', () => {
    render(<Shell project={sample} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse the inspector' }));
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: MODEL_PANEL })).toBeInTheDocument();
    expect(screen.getByText('The inspector is collapsed.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open the inspector' }));
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
  });

  it('collapse and open with Alt+Shift+M and Alt+Shift+N wherever the focus is, but not while typing', () => {
    render(<Shell project={sample} />);
    press('M', { altKey: true, shiftKey: true });
    expect(screen.queryByRole('complementary', { name: MODEL_PANEL })).not.toBeInTheDocument();
    press('n', { altKey: true, shiftKey: true }, screen.getByRole('application'));
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
    // Held down, the key toggles once.
    press('n', { altKey: true, shiftKey: true, repeat: true });
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
    press('M', { altKey: true, shiftKey: true });
    expect(screen.getByRole('complementary', { name: MODEL_PANEL })).toBeInTheDocument();

    const field = document.createElement('input');
    document.body.append(field);
    press('M', { altKey: true, shiftKey: true }, field);
    expect(screen.getByRole('complementary', { name: MODEL_PANEL })).toBeInTheDocument();
    field.remove();
    // Alt+Shift+I is the browser's own.
    press('I', { altKey: true, shiftKey: true });
    expect(screen.getByRole('button', { name: 'Open the inspector' })).toBeInTheDocument();
  });

  it('move the focus out of a panel that collapses from the keyboard', () => {
    render(<Shell project={sample} />);
    const tab = screen.getByRole('tab', { name: 'Outline' });
    tab.focus();
    press('M', { altKey: true, shiftKey: true }, tab);
    expect(screen.getByRole('button', { name: 'Open the model panel' })).toHaveFocus();
  });

  it('have an edge that is a separator, with its width, its least and its most', () => {
    render(<Shell project={sample} />);
    const model = screen.getByRole('separator', { name: 'Width of the model panel' });
    expect(model).toHaveAttribute('aria-orientation', 'vertical');
    expect(model).toHaveAttribute('aria-valuenow', '288');
    expect(model).toHaveAttribute('aria-valuemin', '200');
    expect(model).toHaveAttribute('aria-valuemax', String(Math.floor(window.innerWidth / 2)));
    expect(model).toHaveAttribute('aria-valuetext', '288 pixels');
    expect(model).toHaveAttribute('tabindex', '0');
    const inspector = screen.getByRole('separator', { name: 'Width of the inspector' });
    expect(inspector).toHaveAttribute('aria-valuenow', '320');
    expect(shellOf().style.getPropertyValue('--model-panel-width')).toBe('288px');
    expect(shellOf().style.getPropertyValue('--inspector-width')).toBe('320px');
  });

  it('move the edge by 16 px with the arrows, to the ends with Home and End, and back with a double click', () => {
    render(<Shell project={sample} />);
    const model = screen.getByRole('separator', { name: 'Width of the model panel' });
    fireEvent.keyDown(model, { key: 'ArrowRight' });
    expect(model).toHaveAttribute('aria-valuenow', '304');
    expect(shellOf().style.getPropertyValue('--model-panel-width')).toBe('304px');
    fireEvent.keyDown(model, { key: 'ArrowLeft' });
    fireEvent.keyDown(model, { key: 'ArrowLeft' });
    expect(model).toHaveAttribute('aria-valuenow', '272');
    fireEvent.keyDown(model, { key: 'Home' });
    expect(model).toHaveAttribute('aria-valuenow', '200');
    fireEvent.keyDown(model, { key: 'End' });
    expect(model).toHaveAttribute('aria-valuenow', String(Math.floor(window.innerWidth / 2)));
    fireEvent.doubleClick(model);
    expect(model).toHaveAttribute('aria-valuenow', '288');

    const inspector = screen.getByRole('separator', { name: 'Width of the inspector' });
    fireEvent.keyDown(inspector, { key: 'ArrowLeft' });
    expect(inspector).toHaveAttribute('aria-valuenow', '336');
    inspector.focus();
    fireEvent.keyDown(inspector, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Open the inspector' })).toHaveFocus();
  });

  it('take the width the edge is dragged to, resizing once a frame', () => {
    render(<Shell project={sample} />);
    const model = screen.getByRole('separator', { name: 'Width of the model panel' });
    fireEvent.pointerDown(model, { pointerId: 1, button: 0, clientX: 288 });
    expect(shellOf()).toHaveAttribute('data-panel-resizing');
    for (const clientX of [300, 320, 340, 350]) {
      fireEvent.pointerMove(model, { pointerId: 1, clientX });
    }
    // The pointer's moves resize nothing: the next frame does, once.
    expect(shellOf().style.getPropertyValue('--model-panel-width')).toBe('288px');
    expect(frames.size).toBe(1);
    runFrames();
    expect(shellOf().style.getPropertyValue('--model-panel-width')).toBe('350px');
    expect(model).toHaveAttribute('aria-valuenow', '350');
    fireEvent.pointerMove(model, { pointerId: 1, clientX: 380 });
    fireEvent.pointerUp(model, { pointerId: 1, clientX: 380 });
    expect(frames.size).toBe(0);
    expect(shellOf()).not.toHaveAttribute('data-panel-resizing');
    expect(model).toHaveAttribute('aria-valuenow', '380');

    // The inspector's edge is its left side: dragging it left widens it.
    const inspector = screen.getByRole('separator', { name: 'Width of the inspector' });
    fireEvent.pointerDown(inspector, { pointerId: 2, button: 0, clientX: 700 });
    fireEvent.pointerMove(inspector, { pointerId: 2, clientX: 600 });
    fireEvent.pointerUp(inspector, { pointerId: 2, clientX: 600 });
    expect(inspector).toHaveAttribute('aria-valuenow', '420');
  });

  it('are kept in this browser’s local storage, and open as they were left', () => {
    const { unmount } = render(<Shell project={sample} />);
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Width of the model panel' }), {
      key: 'ArrowRight',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse the inspector' }));
    expect(JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY) ?? '')).toEqual({
      version: 1,
      model: { width: 304, collapsed: false },
      inspector: { width: 320, collapsed: true },
    });
    unmount();
    render(<Shell project={sample} />);
    expect(screen.getByRole('separator', { name: 'Width of the model panel' })).toHaveAttribute(
      'aria-valuenow',
      '304',
    );
    expect(screen.getByRole('button', { name: 'Open the inspector' })).toBeInTheDocument();
  });

  it('open at the defaults when local storage cannot be read or written', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<Shell project={sample} />);
    const model = screen.getByRole('separator', { name: 'Width of the model panel' });
    expect(model).toHaveAttribute('aria-valuenow', '288');
    fireEvent.keyDown(model, { key: 'ArrowRight' });
    expect(model).toHaveAttribute('aria-valuenow', '304');
  });

  it('are listed in the keyboard help', () => {
    render(<KeyboardHelp />);
    expect(screen.getByText('Alt+Shift+M (⌥⇧M on macOS)')).toBeInTheDocument();
    expect(screen.getByText('Alt+Shift+N (⌥⇧N on macOS)')).toBeInTheDocument();
    expect(screen.getByText('Home and End, on the edge of a panel')).toBeInTheDocument();
  });

  it('say everything in Spanish too', () => {
    for (const { keys, does } of PANEL_KEYS) {
      expect(ui[keys], keys).toBeDefined();
      expect(ui[does], does).toBeDefined();
    }
    setCurrentLanguage('es');
    render(<Shell project={sample} />);
    expect(screen.getByRole('separator', { name: 'Ancho del panel del modelo' })).toHaveAttribute(
      'aria-valuetext',
      '288 píxeles',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Contraer el inspector' }));
    expect(screen.getByRole('button', { name: 'Abrir el inspector' })).toHaveAttribute(
      'title',
      'Abrir el inspector (Alt+Shift+N)',
    );
    expect(screen.getByText('El inspector está contraído.')).toBeInTheDocument();
  });
});
