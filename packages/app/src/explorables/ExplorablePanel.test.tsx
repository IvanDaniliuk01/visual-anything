/**
 * The explorable panel (ADR 0107): it shows the explorable of the one element selected, an element's
 * own appearance winning over its component's, and stands below the physical-space panel when both
 * are open, with a divider for its height and its side edge moving that panel's width.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectSnapshot } from '@visual-anything/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectionOf, EMPTY_SELECTION, type Selection } from '../editor/selection';
import { LiveContext, type Live } from '../live/context';
import { SpacePanelStore } from '../space/store';
import { loadSample } from '../test/sample';
import { changePreferences, resetPreferencesForTests } from '../theme/store';
import { explorableOf } from './explorable';
import { ExplorablePanel } from './ExplorablePanel';
import { ExplorablePanelStore } from './panel-store';
import { ExplorableSession, ExplorableSessionContext } from './session';

afterEach(() => {
  cleanup();
  resetPreferencesForTests();
});

const FRAMES = { request: () => 0, cancel: () => undefined };

/** The quadratic sample, with a second explorable, "Roots", and the given element appearance. */
function quadratic(own?: { explorable: string } | 'none'): ProjectSnapshot {
  const project = loadSample('quadratic-function');
  return {
    ...project,
    packages: project.packages.map((file) =>
      file.id === 'quadratic'
        ? {
            ...file,
            explorables: [
              ...(file.explorables ?? []),
              {
                id: 'quadratic.roots',
                name: 'Roots',
                file: 'roots.html',
                api: 1,
                hash: '0'.repeat(64),
              },
            ],
          }
        : file,
    ),
    model: {
      ...project.model,
      elements: project.model.elements.map((each) =>
        each.id === 'quadratic-function' && own !== undefined
          ? { ...each, appearance: { ...each.appearance, explorable: own } }
          : each,
      ),
    },
  };
}

function stores() {
  const store = new ExplorablePanelStore({
    frames: FRAMES,
    windowWidth: () => 1600,
    columnHeight: () => 900,
  });
  const space = new SpacePanelStore({ frames: FRAMES, windowWidth: () => 1600 });
  store.setOpen(true);
  return { store, space };
}

function renderPanel(project: ProjectSnapshot, selection: Selection, given = stores()) {
  const onSelect = vi.fn();
  render(
    <ExplorablePanel
      id="explorable-panel"
      store={given.store}
      space={given.space}
      project={project}
      selection={selection}
      onSelect={onSelect}
    />,
  );
  return { ...given, onSelect };
}

const FUNCTION = selectionOf([{ kind: 'element', id: 'quadratic-function' }]);

describe('the explorable panel', () => {
  it('shows nothing while closed, and asks for one element while none is selected', () => {
    const closed = stores();
    closed.store.setOpen(false);
    renderPanel(quadratic(), FUNCTION, closed);
    expect(screen.queryByRole('region', { name: 'Explorable' })).toBeNull();
    cleanup();
    renderPanel(quadratic(), EMPTY_SELECTION);
    expect(
      screen.getByText('Select one element that shows an explorable, and it runs here.'),
    ).toBeTruthy();
  });

  it('shows the explorable the selected element’s component gives it', () => {
    renderPanel(quadratic(), FUNCTION);
    expect(screen.getByText('Parabola', { selector: '.explorable-panel-shows' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Explorable “Parabola”' })).toBeTruthy();
  });

  it('shows an element’s own explorable over its component’s, and none for its own None', () => {
    renderPanel(quadratic({ explorable: 'quadratic.roots' }), FUNCTION);
    expect(screen.getByText('Roots', { selector: '.explorable-panel-shows' })).toBeTruthy();
    expect(screen.queryByText('Parabola', { selector: '.explorable-panel-shows' })).toBeNull();
    cleanup();
    renderPanel(quadratic('none'), FUNCTION);
    expect(screen.getByText('The element selected shows no explorable.')).toBeTruthy();
  });

  it('stands alone with its own width, or below the physical-space panel with a divider', () => {
    const alone = renderPanel(quadratic(), FUNCTION);
    const edge = screen.getByRole('separator', { name: 'Width of the explorable panel' });
    expect(edge.classList.contains('stacked')).toBe(false);
    expect(edge.getAttribute('aria-valuenow')).toBe(String(alone.store.width));
    expect(screen.queryByRole('separator', { name: 'Height of the explorable panel' })).toBeNull();
    cleanup();

    const given = stores();
    given.space.setOpenView('the-function');
    given.space.open('the-function');
    expect(given.space.shown).toBe(true);
    renderPanel(quadratic(), FUNCTION, given);
    const stacked = screen.getByRole('separator', { name: 'Width of the explorable panel' });
    expect(stacked.classList.contains('stacked')).toBe(true);
    // Stacked, its side edge moves the physical-space panel's width, which the column takes.
    const before = given.space.width;
    fireEvent.keyDown(stacked, { key: 'ArrowLeft' });
    expect(given.space.width).toBeGreaterThan(before);
    const divider = screen.getByRole('separator', { name: 'Height of the explorable panel' });
    const height = given.store.height;
    fireEvent.keyDown(divider, { key: 'ArrowUp' });
    expect(given.store.height).toBeGreaterThan(height);
  });

  it('selects on the canvas what the page’s va.select names, only among the elements it was sent', async () => {
    const text = readFileSync(
      join(
        import.meta.dirname,
        '../../../../examples/quadratic-function/explorables/quadratic.html',
      ),
      'utf8',
    );
    const project = { ...quadratic(), explorableTexts: [{ id: 'quadratic.parabola', text }] };
    const shown = explorableOf(project, 'quadratic.parabola')!;
    changePreferences({
      explorableApprovals: [{ hash: shown.hash!, explorable: 'quadratic.parabola', by: 'person' }],
    });
    const live = {
      status: 'open',
      listenExplorables: () =>
        Promise.resolve({
          ok: true,
          answer: {
            type: 'explorables/listening',
            requestId: 'r',
            port: 47890,
            nonce: 'n'.repeat(32),
          },
        }),
    } as unknown as Live;
    const session = new ExplorableSession(undefined);
    const onSelect = vi.fn();
    const { store, space } = stores();
    await act(async () => {
      render(
        <LiveContext value={live}>
          <ExplorableSessionContext value={session}>
            <ExplorablePanel
              id="explorable-panel"
              store={store}
              space={space}
              project={project}
              selection={FUNCTION}
              onSelect={onSelect}
            />
          </ExplorableSessionContext>
        </LiveContext>,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const frame = screen.getByTitle<HTMLIFrameElement>('Explorable “Parabola”');
    const hello = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);
    fireEvent.load(frame);
    const [message, , ports] = hello.mock.calls[0] as unknown as [
      { kind: string; data: { element?: { id: string }; contents?: { id: string }[] } },
      string,
      MessagePort[],
    ];
    expect(message.kind).toBe('va/hello');
    expect(message.data.element?.id).toBe('quadratic-function');
    const content = message.data.contents?.[0]?.id;
    expect(content).toBeDefined();
    const port = ports[0]!;
    try {
      // An id the page was never sent, as its own script could post, is dropped by the host.
      port.postMessage({ kind: 'va/select', id: 'the-function' });
      port.postMessage({ kind: 'va/select', id: content });
      await vi.waitFor(() => expect(onSelect).toHaveBeenCalled());
      expect(onSelect.mock.calls).toEqual([[content]]);
    } finally {
      port.close();
    }
  });
});
