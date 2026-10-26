/**
 * Live values in the inspector (ADR 0057): each with its mark, its sender and its age, faded once
 * stale; Keep as attribute is one undoable action of the person's.
 */
import {
  SYSTEMS,
  builtinPackage,
  definitionsIn,
  type LiveValue,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION } from '../editor/selection';
import { translateMessage } from '../i18n/translate';
import type { LiveView } from './book';
import { AttributeLookupContext } from './context';
import { keepCommand } from './keep';
import { LiveValuesSection } from './LiveValuesSection';
import { AttributeLookup } from './lookup';

const project: ProjectSnapshot = {
  project: { schemaVersion: 1, name: 'Shop', packages: ['systems'] },
  model: {
    world: { id: 'world', component: 'essence', name: 'World' },
    elements: [
      { id: 'api', component: 'systems.service', name: 'API', attributes: { latency: 120 } },
    ],
    relations: [],
  },
  packages: [builtinPackage(SYSTEMS.id) ?? SYSTEMS],
  views: [],
  scenarios: [],
  tours: [],
  comments: [],
};
const api = project.model.elements[0]!;

function viewOf(values: LiveValue[], now: number): LiveView {
  const byTarget = new Map<Id, Map<string, LiveValue>>();
  for (const each of values) {
    const map = byTarget.get(each.target) ?? new Map<string, LiveValue>();
    map.set(each.attribute, each);
    byTarget.set(each.target, map);
  }
  return {
    version: 1,
    now,
    of: (id) => byTarget.get(id),
    targets: new Set(byTarget.keys()),
    size: values.length,
  };
}

function show(values: LiveValue[], now: number, send?: Editor['send']) {
  const editor: Editor = {
    project,
    definitions: definitionsIn(project),
    viewId: undefined,
    scene: undefined,
    selection: EMPTY_SELECTION,
    select: () => {},
    send,
    reveal: () => {},
  };
  vi.setSystemTime(now);
  return render(
    <EditorContext.Provider value={editor}>
      <AttributeLookupContext value={new AttributeLookup(viewOf(values, now))}>
        <LiveValuesSection item={{ kind: 'element', element: api }} />
      </AttributeLookupContext>
    </EditorContext.Provider>,
  );
}

const LATENCY: LiveValue = {
  target: 'api',
  attribute: 'latency',
  value: 95,
  sender: { kind: 'claude' },
  arrivedAt: 1_000_000,
  freshFor: 60_000,
};

describe('live values in the inspector', () => {
  it('shows each with its mark, who sent it and how old it is, over the stored value', () => {
    show([LATENCY], 1_012_000);
    const list = screen.getByRole('list', { name: 'Live values' });
    expect(list.textContent).toContain('latency');
    expect(list.textContent).toContain('95');
    expect(list.textContent).toContain('From Claude, 12 seconds ago.');
    expect(list.textContent).toContain('Stored: 120');
    expect(screen.getByText('live').getAttribute('title')).toBe(
      'A live value from Claude, never saved.',
    );
  });

  it('fades a value past its freshness and says how old it is', () => {
    show([{ ...LATENCY, sender: { kind: 'command-line' } }], 1_000_000 + 3 * 60_000);
    expect(screen.getByText('live, stale')).toBeTruthy();
    expect(screen.getByRole('listitem').className).toContain('live-value-stale');
    expect(screen.getByRole('listitem').textContent).toContain(
      'From the command line, 3 minutes ago: older than it stays fresh.',
    );
  });

  it('keeps a live value as the stored attribute in one undoable action', () => {
    const send = vi.fn<NonNullable<Editor['send']>>(() =>
      Promise.resolve({ ok: true, created: [], warnings: [] }),
    );
    show([LATENCY], 1_001_000, send);
    fireEvent.click(screen.getByRole('button', { name: 'Keep as attribute' }));
    expect(send).toHaveBeenCalledWith({
      type: 'batch',
      label: 'Keep the live value of “latency” as an attribute',
      commands: [{ type: 'update-element', id: 'api', changes: { attributes: { latency: 95 } } }],
    });
  });

  it('offers nothing to keep when the stored value is the live one already', () => {
    show([{ ...LATENCY, value: 120 }], 1_001_000, vi.fn());
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Keep as attribute' }).disabled,
    ).toBe(true);
  });

  it('shows nothing without live values', () => {
    const { container } = show([], 1_000_000);
    expect(container.textContent).toBe('');
  });

  it('labels the action so the history reads it in Spanish', () => {
    const command = keepCommand({ kind: 'element', element: api }, 'latency', 95);
    expect(command.type === 'batch' && translateMessage('es', command.label)).toBe(
      'Conservar el valor en vivo de “latency” como atributo',
    );
  });
});
