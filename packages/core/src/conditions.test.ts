import { describe, expect, it } from 'vitest';
import { meetsCondition } from './conditions';

describe('meetsCondition', () => {
  it('tests the value of an attribute that takes text emphasis by its plain text (ADR 0082)', () => {
    expect(meetsCondition('**orders**', 'is', 'orders', 'emphasis')).toBe(true);
    expect(meetsCondition('the `status` column', 'contains', 'status column', 'emphasis')).toBe(
      true,
    );
    expect(meetsCondition('**orders**', 'is', 'orders')).toBe(false);
    expect(meetsCondition('**orders**', 'is', '**orders**', 'plain')).toBe(true);
    // Numbers and other values are tested as they are, whatever the format.
    expect(meetsCondition(3, 'above', '2', 'emphasis')).toBe(true);
  });
});
