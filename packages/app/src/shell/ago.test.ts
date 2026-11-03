import { describe, expect, it } from 'vitest';
import { ago } from './ago';

const NOW = Date.UTC(2026, 10, 3, 12);
const DAY = 86_400_000;

describe('how long ago a project changed', () => {
  it('reads in relative words, the largest unit that fits', () => {
    expect(ago('en', NOW - 10_000, NOW)).toBe('now');
    expect(ago('en', NOW - 5 * 60_000, NOW)).toBe('5 minutes ago');
    expect(ago('en', NOW - 3 * 3_600_000, NOW)).toBe('3 hours ago');
    expect(ago('en', NOW - DAY, NOW)).toBe('yesterday');
    expect(ago('en', NOW - 2 * DAY, NOW)).toBe('2 days ago');
    expect(ago('en', NOW - 15 * DAY, NOW)).toBe('2 weeks ago');
    expect(ago('en', NOW - 70 * DAY, NOW)).toBe('2 months ago');
    expect(ago('en', NOW - 800 * DAY, NOW)).toBe('2 years ago');
  });

  it('reads in Spanish', () => {
    expect(ago('es', NOW - DAY, NOW)).toBe('ayer');
    expect(ago('es', NOW - 3 * DAY, NOW)).toBe('hace 3 días');
  });

  it('says "now" for a time ahead of the clock', () => {
    expect(ago('en', NOW + DAY, NOW)).toBe('now');
  });
});
