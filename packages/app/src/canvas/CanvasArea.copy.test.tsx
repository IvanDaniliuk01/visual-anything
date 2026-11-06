/**
 * Copy, Paste, Paste as duplicates and Duplicate on the canvas (ADR 0103): Ctrl+C puts the selection
 * on the clipboard, Ctrl+V shows the same elements or says they are there already, Ctrl+Shift+V and
 * Ctrl+D send `duplicate-elements`, and what is not a copy of elements is left alone.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectionOf, type Selection } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { CanvasArea, type SendCommand } from './CanvasArea';
import { COPIED_ELEMENTS, MOST_COPIED, readCopied } from './elementCopy';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const sample = loadSample();
const VIEW = 'system-overview';
const SIZE = { width: 1000, height: 600 };

let selected: Selection = selectionOf([]);

function Harness(props: { project: ProjectSnapshot; start: Selection; onCommand: SendCommand }) {
  const [selection, setSelection] = useState<Selection>(props.start);
  const view = props.project.views.find((each) => each.id === VIEW)!;
  const scene = useMemo(() => buildScene(props.project, VIEW), [props.project]);
  return (
    <CanvasArea
      project={props.project}
      view={view}
      scene={scene}
      label="System overview"
      selection={selection}
      onSelect={(next) => {
        selected = next;
        setSelection(next);
      }}
      onCommand={props.onCommand}
    />
  );
}

async function started(start: Selection, onCommand: SendCommand, project = sample) {
  render(<Harness project={project} start={start} onCommand={onCommand} />);
  const host = screen.getByRole('application');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: SIZE.width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: SIZE.height });
  const [app] = FakeApplication.created as [FakeApplication];
  await act(async () => {
    app.finishInit();
    await Promise.resolve();
  });
  return host;
}

/** A clipboard event's data, as the browser gives it to `copy` and `paste`. */
function clipboard(text = '') {
  const held = new Map<string, string>([['text/plain', text]]);
  return {
    files: [] as unknown as FileList,
    getData: (type: string) => held.get(type) ?? '',
    setData: (type: string, value: string) => {
      held.set(type, value);
    },
    held,
  };
}

function fire(kind: 'copy' | 'paste', target: HTMLElement, data: ReturnType<typeof clipboard>) {
  const event = createEvent[kind](target);
  Object.defineProperty(event, 'clipboardData', { value: data });
  fireEvent(target, event);
  return event;
}

/** A copy of elements as the clipboard holds it, each at the copy's top left corner. */
function copyText(elements: string[], project = sample.project.name): string {
  return JSON.stringify({
    kind: COPIED_ELEMENTS,
    project,
    packages: [...sample.project.packages].sort(),
    view: VIEW,
    elements,
    arrangement: elements.map((element) => ({ element, x: 0, y: 0 })),
    freeShapes: [],
  });
}

async function answers(): Promise<void> {
  await act(async () => {
    for (let each = 0; each < 5; each++) await Promise.resolve();
  });
}

const status = () => screen.getByRole('status', { name: 'Selection' });

const accepted = () =>
  vi.fn<SendCommand>(() => Promise.resolve({ ok: true, created: ['made-1', 'made-2'] }));

const sent = (onCommand: ReturnType<typeof accepted>): Command[] =>
  onCommand.mock.calls.map(([command]) => command);

beforeEach(() => {
  selected = selectionOf([]);
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Copy and Paste on the canvas', () => {
  it('copies the selection, and pasting elements the view shows selects them and says so', async () => {
    const onCommand = accepted();
    const host = await started(
      selectionOf([
        { kind: 'element', id: 'patient' },
        { kind: 'element', id: 'whatsapp' },
      ]),
      onCommand,
    );
    host.focus();
    const data = clipboard();
    const copy = fire('copy', host, data);
    expect(copy.defaultPrevented).toBe(true);
    const copied = readCopied(data.held.get('text/plain') ?? '');
    expect(copied).toMatchObject({
      kind: COPIED_ELEMENTS,
      project: sample.project.name,
      elements: ['patient', 'whatsapp'],
    });
    expect(status()).toHaveTextContent('Copied 2 shapes.');

    const paste = fire('paste', host, data);
    expect(paste.defaultPrevented).toBe(true);
    await answers();
    expect(onCommand).not.toHaveBeenCalled();
    expect([...selected.elements]).toEqual(['patient', 'whatsapp']);
    expect(status()).toHaveTextContent('All 2 are already in this view, so nothing was added.');
  });

  it('leaves text that is not a copy of elements to what it was pasted in', async () => {
    const onCommand = accepted();
    const host = await started(selectionOf([]), onCommand);
    host.focus();
    const paste = fire('paste', host, clipboard('Patient\nWhatsApp'));
    expect(paste.defaultPrevented).toBe(false);
    await answers();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('refuses a copy from another project, saying so', async () => {
    const onCommand = accepted();
    const host = await started(selectionOf([]), onCommand);
    host.focus();
    fire('paste', host, clipboard(copyText(['patient'], 'Another project')));
    await answers();
    expect(onCommand).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent(/copied from another project, “Another project”/);
  });

  it('shows the same elements in a view whose scope leaves them out, as one action, and selects them', async () => {
    const outcome = executeCommand(sample, {
      type: 'set-scope',
      view: VIEW,
      scope: { include: [{ kind: 'component', component: 'systems.person' }] },
    });
    if (!outcome.ok) throw new Error('the scope was refused');
    const onCommand = accepted();
    const host = await started(selectionOf([]), onCommand, outcome.state);
    host.focus();
    fire('paste', host, clipboard(copyText(['clinic-booking'])));
    await answers();
    expect(sent(onCommand)).toEqual([
      expect.objectContaining({
        type: 'batch',
        commands: [
          { type: 'add-to-view', view: VIEW, elements: ['clinic-booking'] },
          expect.objectContaining({ type: 'set-positions', view: VIEW }),
        ],
      }),
    ]);
    expect([...selected.elements]).toEqual(['clinic-booking']);
  });

  it('adds a pasted picture as a picture, even beside a copy of elements (ADR 0098)', async () => {
    const onCommand = accepted();
    const host = await started(selectionOf([]), onCommand);
    host.focus();
    const data = clipboard(copyText(['patient'], 'Another project'));
    data.files = [new File(['x'], 'photo.png', { type: 'image/png' })] as unknown as FileList;
    expect(fire('paste', host, data).defaultPrevented).toBe(true);
    await answers();
    // The picture's way took it: without the local program it cannot be kept, and says so.
    expect(status()).toHaveTextContent('The project cannot be changed now.');
    expect(status()).not.toHaveTextContent(/another project/);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('copies from the Outline, which shares the selection, and nowhere else with the focus', async () => {
    await started(selectionOf([{ kind: 'element', id: 'patient' }]), accepted());
    const outline = document.createElement('div');
    outline.className = 'outline-hover';
    const row = document.createElement('div');
    row.tabIndex = 0;
    outline.append(row);
    const elsewhere = document.createElement('button');
    document.body.append(outline, elsewhere);
    try {
      row.focus();
      const data = clipboard();
      expect(fire('copy', row, data).defaultPrevented).toBe(true);
      expect(readCopied(data.held.get('text/plain') ?? '')).toMatchObject({
        elements: ['patient'],
      });
      elsewhere.focus();
      expect(fire('copy', elsewhere, clipboard()).defaultPrevented).toBe(false);
    } finally {
      outline.remove();
      elsewhere.remove();
    }
  });

  it('copies nothing, and leaves the event alone, while nothing is selected', async () => {
    const host = await started(selectionOf([]), accepted());
    host.focus();
    expect(fire('copy', host, clipboard()).defaultPrevented).toBe(false);
  });

  it('says a copy too large to paste is too large, rather than pasting nothing', async () => {
    const onCommand = accepted();
    const host = await started(selectionOf([]), onCommand);
    host.focus();
    const many = Array.from({ length: MOST_COPIED + 1 }, (_, at) => `e${at}`);
    const paste = fire('paste', host, clipboard(copyText(many)));
    expect(paste.defaultPrevented).toBe(true);
    await answers();
    expect(onCommand).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent(/A copy holds at most 10000 elements and free shapes/);
  });
});

describe('where the keys of copying act', () => {
  /** Presses every key of copying on a target, and says whether any of them was taken. */
  async function pressAll(target: HTMLElement) {
    const copy = fire('copy', target, clipboard());
    const paste = fire('paste', target, clipboard(copyText(['patient'])));
    fireEvent.keyDown(target, { key: 'd', code: 'KeyD', ctrlKey: true });
    fireEvent.keyDown(target, { key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true });
    await answers();
    return copy.defaultPrevented || paste.defaultPrevented;
  }

  it('never while typing in a field', async () => {
    const onCommand = accepted();
    await started(selectionOf([{ kind: 'element', id: 'patient' }]), onCommand);
    const field = document.createElement('input');
    document.body.append(field);
    try {
      field.focus();
      expect(await pressAll(field)).toBe(false);
      expect(onCommand).not.toHaveBeenCalled();
    } finally {
      field.remove();
    }
  });

  it('never in a dialog', async () => {
    const onCommand = accepted();
    await started(selectionOf([{ kind: 'element', id: 'patient' }]), onCommand);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.append(button);
    document.body.append(dialog);
    try {
      button.focus();
      expect(await pressAll(button)).toBe(false);
      expect(onCommand).not.toHaveBeenCalled();
    } finally {
      dialog.remove();
    }
  });

  it('never with a menu open', async () => {
    const onCommand = accepted();
    const host = await started(selectionOf([{ kind: 'element', id: 'patient' }]), onCommand);
    host.focus();
    act(() => {
      fireEvent.keyDown(host, { key: 'F10', shiftKey: true });
    });
    const menu = screen.getByRole('menu', { name: 'Patient' });
    const item = within(menu).getAllByRole('menuitem')[0]!;
    expect(await pressAll(item)).toBe(false);
    expect(await pressAll(host)).toBe(false);
    expect(onCommand).not.toHaveBeenCalled();
  });
});

describe('the menus of copying', () => {
  /** The system's clipboard, holding a copy of these elements. */
  const holding = (elements: string[]) =>
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { readText: () => Promise.resolve(copyText(elements)) },
    });

  /** Opens the canvas's menu with a secondary press on its top left corner, where nothing is. */
  function openCanvasMenu(host: HTMLElement) {
    act(() => {
      fireEvent.pointerDown(host, { button: 2, pointerId: 1, clientX: 2, clientY: 2 });
      fireEvent.contextMenu(host, { button: 2, clientX: 2, clientY: 2 });
    });
    return screen.getByRole('menu', { name: 'Canvas' });
  }

  async function press(menu: HTMLElement, name: string) {
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name }));
      await Promise.resolve();
    });
    await answers();
  }

  it('Paste in the canvas’s menu shows the same elements there', async () => {
    const outcome = executeCommand(sample, {
      type: 'set-scope',
      view: VIEW,
      scope: { include: [{ kind: 'component', component: 'systems.person' }] },
    });
    if (!outcome.ok) throw new Error('the scope was refused');
    holding(['clinic-booking']);
    const onCommand = accepted();
    const host = await started(selectionOf([]), onCommand, outcome.state);
    await press(openCanvasMenu(host), 'Paste');
    expect(sent(onCommand)).toEqual([
      expect.objectContaining({
        type: 'batch',
        commands: [
          { type: 'add-to-view', view: VIEW, elements: ['clinic-booking'] },
          expect.objectContaining({ type: 'set-positions' }),
        ],
      }),
    ]);
    expect(screen.queryByRole('menu', { name: 'Canvas' })).not.toBeInTheDocument();
  });

  it('Paste as duplicates in the canvas’s menu makes them in World, where nothing is', async () => {
    holding(['patient']);
    const onCommand = accepted();
    const host = await started(selectionOf([]), onCommand);
    await press(openCanvasMenu(host), 'Paste as duplicates');
    expect(sent(onCommand)).toEqual([
      expect.objectContaining({ type: 'duplicate-elements', view: VIEW, elements: ['patient'] }),
    ]);
    expect(sent(onCommand)[0]).not.toHaveProperty('container');
  });

  it('Duplicate in the shape’s menu duplicates the selection beside itself', async () => {
    const onCommand = accepted();
    const host = await started(selectionOf([{ kind: 'element', id: 'scheduling' }]), onCommand);
    host.focus();
    act(() => {
      fireEvent.keyDown(host, { key: 'F10', shiftKey: true });
    });
    await press(screen.getByRole('menu', { name: 'Scheduling' }), 'Duplicate');
    expect(sent(onCommand)).toEqual([
      expect.objectContaining({
        type: 'duplicate-elements',
        elements: ['scheduling'],
        beside: true,
      }),
    ]);
    expect([...selected.elements]).toEqual(['made-1']);
  });

  it('Paste as duplicates in the shape’s menu makes them in the container under it', async () => {
    holding(['patient']);
    const onCommand = accepted();
    const host = await started(selectionOf([{ kind: 'element', id: 'whatsapp' }]), onCommand);
    host.focus();
    act(() => {
      fireEvent.keyDown(host, { key: 'F10', shiftKey: true });
    });
    await press(screen.getByRole('menu', { name: 'WhatsApp channel' }), 'Paste as duplicates');
    expect(sent(onCommand)).toEqual([
      expect.objectContaining({
        type: 'duplicate-elements',
        elements: ['patient'],
        container: 'clinic-booking',
      }),
    ]);
  });
});

describe('Duplicate and Paste as duplicates on the canvas', () => {
  it('Ctrl+D duplicates the selection beside itself, and selects the duplicates', async () => {
    const onCommand = accepted();
    const host = await started(selectionOf([{ kind: 'element', id: 'scheduling' }]), onCommand);
    host.focus();
    fireEvent.keyDown(host, { key: 'd', code: 'KeyD', ctrlKey: true });
    await answers();
    expect(sent(onCommand)).toEqual([
      expect.objectContaining({
        type: 'duplicate-elements',
        view: VIEW,
        elements: ['scheduling'],
        beside: true,
      }),
    ]);
    expect([...selected.elements]).toEqual(['made-1']);
  });

  it('Ctrl+Shift+V pastes what this tab copied as duplicates', async () => {
    const onCommand = accepted();
    const host = await started(selectionOf([{ kind: 'element', id: 'patient' }]), onCommand);
    host.focus();
    fire('copy', host, clipboard());
    fireEvent.keyDown(host, { key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true });
    await answers();
    expect(sent(onCommand)).toEqual([
      expect.objectContaining({ type: 'duplicate-elements', view: VIEW, elements: ['patient'] }),
    ]);
  });
});
