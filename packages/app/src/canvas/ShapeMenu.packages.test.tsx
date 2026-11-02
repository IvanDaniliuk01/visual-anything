/**
 * The shape menu's actions from packages (ADR 0089's M14.3 clarification): each in its package's
 * words, under "From packages", described by its file or by where it comes from, pressed from the
 * keyboard as any item, and doing nothing while the project cannot be changed.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { selectionOf } from '../editor/selection';
import type { OfferedAction } from '../packages/offered';
import { loadSample } from '../test/sample';
import { indexScene } from './hit';
import { buildScene } from './scene';
import { ShapeMenu } from './ShapeMenu';
import { stackingActions } from './stacking';

const VIEW = 'system-overview';
const sample = loadSample();

const ACTIONS: OfferedAction[] = [
  {
    package: { id: 'gauges', name: 'Gauges' },
    declared: { id: 'check', label: 'Check them', where: ['selection'] },
  },
  {
    package: { id: 'gauges', name: 'Gauges' },
    declared: {
      id: 'tidy',
      label: 'Tidy',
      description: 'Lines them up.',
      where: ['selection'],
    },
  },
];

function open(actions: readonly OfferedAction[] | undefined, editable = true) {
  const indexed = indexScene(buildScene(sample, VIEW));
  const shape = [...indexed.byKey.values()][0]!;
  const selection = selectionOf([{ kind: 'element', id: shape.element }]);
  const onPackageAction = vi.fn();
  render(
    <ShapeMenu
      indexed={indexed}
      project={sample}
      viewId={VIEW}
      selection={selection}
      shape={shape}
      at={{ x: 20, y: 30 }}
      stacking={stackingActions(indexed, sample, VIEW, selection)}
      editable={editable}
      onRestack={vi.fn()}
      onChange={vi.fn()}
      onChooseContainer={vi.fn()}
      onAddInside={vi.fn()}
      onSelectShape={vi.fn()}
      onClose={vi.fn()}
      {...(actions ? { packageActions: actions, onPackageAction } : {})}
    />,
  );
  return { menu: screen.getByRole('menu', { name: shape.name }), onPackageAction };
}

describe('the shape menu’s actions from packages', () => {
  it('lists each in its package’s words, under From packages, and runs the one pressed', () => {
    const { menu, onPackageAction } = open(ACTIONS);
    const group = within(menu).getByRole('group', { name: 'From packages' });
    const items = within(group).getAllByRole('menuitem');
    expect(items.map((each) => each.textContent)).toEqual(['Check them', 'Tidy']);
    expect(items[0]).toHaveAttribute(
      'title',
      'From the package “Gauges”: its changes wait for your review.',
    );
    expect(items[1]).toHaveAttribute('title', 'Lines them up.');
    // The arrow keys move through them as through any item of the menu.
    items[0]!.focus();
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.click(items[1]!);
    expect(onPackageAction).toHaveBeenCalledWith(ACTIONS[1]);
  });

  it('has none without actions', () => {
    const { menu } = open(undefined);
    expect(within(menu).queryByRole('group', { name: 'From packages' })).toBeNull();
  });

  it('has none when no action is offered for the selection', () => {
    const { menu } = open([]);
    expect(within(menu).queryByRole('group', { name: 'From packages' })).toBeNull();
  });

  it('runs none while the project cannot be changed', () => {
    const { menu, onPackageAction } = open(ACTIONS, false);
    const item = within(menu).getByRole('menuitem', { name: 'Check them' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(item);
    expect(onPackageAction).not.toHaveBeenCalled();
  });
});
