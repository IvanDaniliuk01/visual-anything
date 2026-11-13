/**
 * The inspector's explorable shape (ADR 0107, A10.3): it names the shape, changes the explorable it
 * shows, binds it to an element the view shows or to none, each one change, and Explore asks the
 * active canvas to make it live in place, with the element it is bound to.
 */
import type { Command } from '@visual-anything/core';
import type { ExplorableShape } from '@visual-anything/schema';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { onExploreAsked } from '../../canvas/explorables/adding';
import type { LiveTarget } from '../../canvas/explorables/live';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { loadSample } from '../../test/sample';
import { ExplorableShapeInspector } from './ExplorableShapeInspector';

afterEach(cleanup);

const project = loadSample('quadratic-function');

const shape = (more: Partial<ExplorableShape> = {}): ExplorableShape => ({
  kind: 'explorable',
  id: 'the-parabola',
  x: 0,
  y: 0,
  width: 320,
  height: 240,
  explorable: 'quadratic.parabola',
  ...more,
});

function shown(given: ExplorableShape) {
  const sent: Command[] = [];
  const editor = {
    send: (command: Command) => {
      sent.push(command);
      return Promise.resolve({ ok: true });
    },
  } as unknown as Editor;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <EditorContext value={editor}>{children}</EditorContext>
  );
  render(
    <ExplorableShapeInspector
      shape={given}
      viewId="the-function"
      project={project}
      shown={['quadratic-function', 'coefficient-a']}
    />,
    { wrapper },
  );
  return { sent };
}

describe('the inspector’s explorable shape', () => {
  it('binds the shape to an element the view shows, and unbinds it', () => {
    const { sent } = shown(shape());
    const bound = screen.getByLabelText<HTMLSelectElement>('Bound to');
    expect(bound.value).toBe('');
    expect([...bound.options].map((option) => option.value)).toEqual([
      '',
      'coefficient-a',
      'quadratic-function',
    ]);
    fireEvent.change(bound, { target: { value: 'quadratic-function' } });
    cleanup();
    const again = shown(shape({ element: 'quadratic-function' }));
    fireEvent.change(screen.getByLabelText('Bound to'), { target: { value: '' } });
    expect([...sent, ...again.sent]).toEqual([
      {
        type: 'update-free-shape',
        view: 'the-function',
        id: 'the-parabola',
        changes: { element: 'quadratic-function' },
      },
      {
        type: 'update-free-shape',
        view: 'the-function',
        id: 'the-parabola',
        changes: { element: null },
      },
    ]);
  });

  it('names it by its explorable until given a name of its own', () => {
    const { sent } = shown(shape());
    expect(screen.getByRole('heading', { name: 'Parabola' })).toBeTruthy();
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: '  The   curve ' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(sent).toEqual([
      {
        type: 'update-free-shape',
        view: 'the-function',
        id: 'the-parabola',
        changes: { name: 'The curve' },
      },
    ]);
  });

  it('Explore asks the canvas to make it live in place, with its element', () => {
    const asked: LiveTarget[] = [];
    const stop = onExploreAsked((target) => asked.push(target));
    try {
      shown(shape({ element: 'quadratic-function' }));
      fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
    } finally {
      stop();
    }
    expect(asked).toEqual([
      { spot: 'the-parabola', explorable: 'quadratic.parabola', element: 'quadratic-function' },
    ]);
  });
});
