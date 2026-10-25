/** The header's toggle opens and closes the element list, and takes the focus back when it closes. */
import { definitionsIn } from '@visual-anything/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION } from '../editor/selection';
import { loadSample } from '../test/sample';
import { ElementListPanel, ElementListToggle } from './ElementListToggle';
import { ElementListStore } from './store';

function Harness() {
  const [store] = useState(() => new ElementListStore());
  const project = loadSample();
  const editor: Editor = {
    project,
    definitions: definitionsIn(project),
    viewId: project.views[0]?.id,
    scene: undefined,
    selection: EMPTY_SELECTION,
    select: () => {},
    send: undefined,
    reveal: () => {},
  };
  return (
    <EditorContext.Provider value={editor}>
      <ElementListToggle store={store} />
      <ElementListPanel store={store} />
    </EditorContext.Provider>
  );
}

describe('the element list’s toggle', () => {
  it('opens the list, says so, and takes the focus back once the list is closed', () => {
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: 'Element list' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Element list' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('region', { name: 'Element list' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close the element list' }));
    expect(screen.queryByRole('region', { name: 'Element list' })).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });
});
