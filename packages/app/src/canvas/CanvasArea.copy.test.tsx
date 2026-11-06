/**
 * Copy, Paste, Paste as duplicates and Duplicate on the canvas (ADR 0103): Ctrl+C puts the selection
 * on the clipboard, Ctrl+V shows the same elements or says they are there already, Ctrl+Shift+V and
 * Ctrl+D send `duplicate-elements`, and what is not a copy of elements is left alone.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectionOf, type Selection } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { CanvasArea, type SendCommand } from './CanvasArea';
import { COPIED_ELEMENTS, readCopied } from './elementCopy';
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
      elements: ['patient', 'whatsapp'],
      relations: ['patient-to-whatsapp'],
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
    const text = JSON.stringify({
      kind: COPIED_ELEMENTS,
      project: 'Another project',
      view: VIEW,
      elements: ['patient'],
      relations: [],
      arrangement: [],
      freeShapes: [],
    });
    fire('paste', host, clipboard(text));
    await answers();
    expect(onCommand).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent(/copied from another project, “Another project”/);
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
      expect(readCopied(data.held.get('text/plain') ?? '')?.elements).toEqual(['patient']);
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
