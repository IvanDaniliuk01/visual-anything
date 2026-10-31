/**
 * The outline marks the shapes whose elements are in physical space (ADR 0076): under World, and
 * under what the view's physical-space panel shows; screen readers hear ", in physical space".
 */
import { definitionsIn, type ProjectSnapshot } from '@visual-anything/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION } from '../editor/selection';
import { SpacePanelContext } from '../space/context';
import { SpacePanelStore } from '../space/store';
import { workcell } from '../test/space';
import { OutlineTree } from './OutlineTree';

const VIEW = 'cell-view';

function renderOutline(project: ProjectSnapshot, store: SpacePanelStore | null = null) {
  const editor: Editor = {
    project,
    definitions: definitionsIn(project),
    viewId: VIEW,
    scene: buildScene(project, VIEW),
    selection: EMPTY_SELECTION,
    select: vi.fn(),
    send: undefined,
    reveal: vi.fn(),
  };
  render(
    <SpacePanelContext value={store}>
      <EditorContext.Provider value={editor}>
        <OutlineTree active />
      </EditorContext.Provider>
    </SpacePanelContext>,
  );
  return within(screen.getByRole('tree'));
}

const marked = (tree: ReturnType<typeof renderOutline>, name: string) =>
  tree.getByRole('treeitem', { name: new RegExp(`^${name}`) }).querySelector('.outline-space') !==
  null;

describe('the outline’s mark for what is in physical space', () => {
  it('marks what is posed or anchored under World, and nothing else', () => {
    const tree = renderOutline(workcell());
    for (const name of ['Table', 'Camera', 'Arm', 'Elbow']) expect(marked(tree, name)).toBe(true);
    for (const name of ['Spare arm', 'Lamp']) expect(marked(tree, name)).toBe(false);
    expect(tree.getByRole('treeitem', { name: /^Camera/ })).toHaveAccessibleName(
      'Camera, in physical space, Thing',
    );
    expect(
      tree.getByRole('treeitem', { name: /^Lamp/ }).querySelector('.outline-space'),
    ).toBeNull();
  });

  it('marks what the panel shows, and what is posed or anchored in it', () => {
    const store = new SpacePanelStore({
      frames: { request: () => 0, cancel: () => {} },
      windowWidth: () => 1600,
    });
    store.open(VIEW, { root: 'arm' });
    const tree = renderOutline(workcell({ posed: false }), store);
    expect(marked(tree, 'Arm')).toBe(true);
    expect(marked(tree, 'Elbow')).toBe(true);
    for (const name of ['Table', 'Camera', 'Spare arm', 'Lamp']) {
      expect(marked(tree, name)).toBe(false);
    }
  });
});
