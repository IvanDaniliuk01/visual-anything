/**
 * The inspector's sheet: an element's attributes read whole, an "emphasis" attribute drawn as Markdown
 * blocks and any other text as written, attributes without a value left out; and the switch between
 * the sheet and editing kept in the browser for the next element.
 */
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { AttributeDefinition } from '@visual-anything/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { INSPECTOR_MODE_KEY, useInspectorMode } from './inspectorMode';
import { InspectorModeSwitch, ReadSheet } from './ReadSheet';

const DEFINITIONS: AttributeDefinition[] = [
  { name: 'rule', type: 'string', format: 'emphasis', description: 'The rule, in words.' },
  { name: 'field', type: 'string' },
  { name: 'empty', type: 'string' },
  { name: 'accuracy', type: 'number' },
];

afterEach(() => localStorage.clear());

describe('ReadSheet', () => {
  it('draws an emphasis attribute as Markdown blocks and leaves the others as written', () => {
    render(
      <ReadSheet
        description="Decides **first**."
        definitions={DEFINITIONS}
        values={{ rule: '- one\n- **two**', field: 'a_b *c*', accuracy: 0.88, extra: 'kept' }}
      />,
    );
    expect(screen.getByText('first').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('two').tagName).toBe('STRONG');
    expect(screen.getByText('a_b *c*')).toBeTruthy();
    expect(screen.getByText('0.88')).toBeTruthy();
    expect(screen.getByText('kept')).toBeTruthy();
    expect(screen.queryByText('empty')).toBeNull();
    expect(screen.getByText('rule').getAttribute('title')).toBe('The rule, in words.');
  });

  it('says so when no attribute has a value', () => {
    render(<ReadSheet description={undefined} definitions={DEFINITIONS} values={{}} />);
    expect(screen.getByText('No attribute has a value.')).toBeTruthy();
  });
});

describe('the inspector mode', () => {
  it('starts in editing and keeps the sheet for the next element', () => {
    const first = renderHook(() => useInspectorMode());
    expect(first.result.current[0]).toBe('edit');
    render(<InspectorModeSwitch mode="edit" onChange={first.result.current[1]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sheet' }));
    expect(localStorage.getItem(INSPECTOR_MODE_KEY)).toBe('sheet');
    const next = renderHook(() => useInspectorMode());
    expect(next.result.current[0]).toBe('sheet');
  });
});
