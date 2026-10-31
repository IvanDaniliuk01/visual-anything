import { changeKey, compareProjects } from '@visual-anything/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../../editor/selection';
import { translatorFor } from '../../i18n';
import { comparedSample, VIEW } from '../../test/comparison';
import { ChangesList } from './ChangesList';
import { ChangeNames, changeSentence, countsText, differencesText } from './describe';
import type { OpenedChanges } from './store';

const { older, newer, comparison } = comparedSample();
const opened: OpenedChanges = {
  kind: 'comparison',
  title: 'Compared with HEAD',
  older,
  newer,
  comparison,
};

function rows(): string[] {
  return within(screen.getByRole('tree'))
    .getAllByRole('treeitem')
    .map((row) => row.getAttribute('aria-label') ?? '');
}

describe('ChangesList', () => {
  it('gives the counts, then the changes by kind with what differs', () => {
    render(
      <ChangesList
        changes={opened}
        openViewId={VIEW}
        selection={EMPTY_SELECTION}
        onShow={() => {}}
      />,
    );
    const counts = screen.getByRole('list', { name: 'Changes by state' });
    expect(counts).toHaveTextContent(`${comparison.counts.added} added`);
    expect(rows()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Elements: \d+$/),
        'Changed: WhatsApp Business. Name: “WhatsApp channel” → “WhatsApp Business”.',
        'Removed: Reminder service.',
        'Added: SMS channel.',
      ]),
    );
  });

  it('filters by state, and to what the open view draws', () => {
    render(
      <ChangesList
        changes={opened}
        openViewId={VIEW}
        selection={EMPTY_SELECTION}
        onShow={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Removed' }));
    expect(rows().some((row) => row.startsWith('Removed:'))).toBe(false);
    expect(rows().some((row) => row.startsWith('Added:'))).toBe(true);
    for (const status of ['Added', 'Changed', 'Moved']) {
      fireEvent.click(screen.getByRole('checkbox', { name: status }));
    }
    expect(
      screen.getByText(/^No change matches the filters\. Change the filters/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Moved' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only the open view' }));
    expect(rows().filter((row) => row.startsWith('Moved:')).length).toBeGreaterThan(0);
  });

  it('shows a change chosen with Enter, and lists every difference of it', () => {
    const onShow = vi.fn();
    render(
      <ChangesList
        changes={opened}
        openViewId={VIEW}
        selection={EMPTY_SELECTION}
        onShow={onShow}
      />,
    );
    const row = screen.getByRole('treeitem', { name: /^Changed: WhatsApp Business/ });
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onShow).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'changed', ref: { kind: 'element', id: 'whatsapp' } }),
    );
    expect(row).toHaveAttribute('aria-selected', 'true');
  });

  it('follows the canvas’s selection', () => {
    function Following() {
      const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
      return (
        <>
          <button
            type="button"
            onClick={() => setSelection(selectionOf([{ kind: 'element', id: 'sms' }]))}
          >
            Select
          </button>
          <ChangesList changes={opened} openViewId={VIEW} selection={selection} onShow={() => {}} />
        </>
      );
    }
    render(<Following />);
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByRole('treeitem', { name: 'Added: SMS channel.' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('ticks changes where a proposal asks, with Space or a click, and a whole kind at once', () => {
    const onTick = vi.fn<(keys: readonly string[], ticked: boolean) => void>();
    const ticked = new Set([changeKey(comparison.changes[0] ?? comparison.changes[1]!)]);
    render(
      <ChangesList
        changes={{ ...opened, kind: 'proposal', ticks: { ticked, onTick } }}
        openViewId={VIEW}
        selection={EMPTY_SELECTION}
        onShow={() => {}}
      />,
    );
    const row = screen.getByRole('treeitem', { name: /^Added: SMS channel\. Not ticked\.$/ });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onTick).toHaveBeenLastCalledWith(['element:sms added'], true);
    const group = screen.getByRole('treeitem', { name: /^Elements:/ });
    fireEvent.keyDown(group, { key: ' ' });
    expect(onTick.mock.lastCall?.[0].length).toBeGreaterThan(1);
  });

  it('says when there is nothing to list', () => {
    render(
      <ChangesList
        changes={{ ...opened, comparison: compareProjects(older, older) }}
        openViewId={VIEW}
        selection={EMPTY_SELECTION}
        onShow={() => {}}
      />,
    );
    expect(screen.getByText(/^No changes: both sides are the same\./)).toBeInTheDocument();
  });
});

describe('how changes read', () => {
  const t = translatorFor('en');
  const names = new ChangeNames(older, newer, comparison);

  it('counts every state', () => {
    expect(countsText(t, { added: 1, removed: 2, changed: 0, moved: 3 })).toBe(
      '1 added, 2 removed, 0 changed, 3 moved',
    );
  });

  it('cuts what differs after a few, and says how many more', () => {
    const change = {
      status: 'changed' as const,
      ref: { kind: 'element' as const, id: 'whatsapp' },
      items: [],
      differences: [
        { path: 'name', before: 'A', after: 'B' },
        { path: 'attributes.latency', before: 1, after: 2 },
        { path: 'appearance.fill', after: '#FFFFFF' },
      ],
    };
    expect(differencesText(t, change, names)).toBe(
      'Name: “A” → “B”; Attribute “latency”: 1 → 2; and 1 more',
    );
    expect(changeSentence(t, change, names)).toMatch(/^Changed: WhatsApp Business\. /);
  });

  it('reads in Spanish', () => {
    const es = translatorFor('es');
    expect(countsText(es, { added: 1, removed: 2, changed: 0, moved: 3 })).not.toMatch(/added/);
  });
});
