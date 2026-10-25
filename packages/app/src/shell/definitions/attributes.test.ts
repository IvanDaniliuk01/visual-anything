import type { AttributeDefinition } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import {
  choicesText,
  defaultText,
  movedOrder,
  readChoices,
  readDefault,
  retyped,
  withTrait,
} from './attributes';

const delivery: AttributeDefinition = {
  name: 'delivery',
  type: 'string',
  default: 'at least once',
  description: 'How messages are delivered.',
  choices: ['at most once', 'at least once'],
};

describe('attribute definitions in the component editor', () => {
  it('keeps what fits a new type and drops what does not', () => {
    expect(retyped(delivery, 'json')).toEqual({
      name: 'delivery',
      type: 'json',
      default: 'at least once',
      description: 'How messages are delivered.',
    });
    expect(retyped(delivery, 'number')).toEqual({
      name: 'delivery',
      type: 'number',
      description: 'How messages are delivered.',
    });
    expect(retyped({ name: 'depth', type: 'number', default: 3, unit: 'msgs' }, 'number')).toEqual({
      name: 'depth',
      type: 'number',
      default: 3,
      unit: 'msgs',
    });
    expect(retyped({ name: 'depth', type: 'number', unit: 'msgs' }, 'string')).toEqual({
      name: 'depth',
      type: 'string',
    });
  });

  it('sets one optional trait, or takes it out', () => {
    expect(withTrait(delivery, 'default', undefined)).not.toHaveProperty('default');
    expect(withTrait(delivery, 'description', 'Delivery.').description).toBe('Delivery.');
    expect(withTrait(delivery, 'choices', ['exactly once']).choices).toEqual(['exactly once']);
  });

  it('reads choices one per line, without blanks or repeats', () => {
    expect(readChoices(' a \n\nb\na\n')).toEqual(['a', 'b']);
    expect(readChoices('  \n')).toBeUndefined();
    expect(choicesText(['a', 'b'])).toBe('a\nb');
  });

  it('reads a default for its type, blank for none', () => {
    expect(readDefault('', 'number')).toEqual({ ok: true, value: undefined });
    expect(readDefault('12.5', 'number')).toEqual({ ok: true, value: 12.5 });
    expect(readDefault('twelve', 'number')).toEqual({ ok: false, message: 'Enter a number.' });
    expect(readDefault('true', 'boolean')).toEqual({ ok: true, value: true });
    expect(readDefault('yes', 'boolean').ok).toBe(false);
    expect(readDefault('{"days": 30}', 'json')).toEqual({ ok: true, value: { days: 30 } });
    expect(readDefault('at most once', 'string')).toEqual({ ok: true, value: 'at most once' });
    expect(defaultText({ days: 30 })).toBe('{"days":30}');
    expect(defaultText('x')).toBe('x');
    expect(defaultText(undefined)).toBe('');
  });

  it('moves an attribute up or down among the definition’s own, never past the ends', () => {
    expect(movedOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(movedOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(movedOrder(['a', 'b'], 'a', -1)).toBeUndefined();
    expect(movedOrder(['a', 'b'], 'b', 1)).toBeUndefined();
    expect(movedOrder(['a'], 'z', 1)).toBeUndefined();
  });
});
