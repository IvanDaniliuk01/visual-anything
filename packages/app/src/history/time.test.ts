import { describe, expect, it } from 'vitest';
import { actionTime } from './time';

const NOW = new Date(2026, 9, 24, 15, 0).getTime();

describe('actionTime', () => {
  it('writes the time alone for an action done today', () => {
    const done = new Date(2026, 9, 24, 9, 5).getTime();
    expect(actionTime(done, NOW, 'en')).toBe(
      new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(done),
    );
  });

  it('writes the day too for an action done before today, in the language the app reads in', () => {
    const done = new Date(2026, 9, 23, 23, 50).getTime();
    const written = actionTime(done, NOW, 'es');
    expect(written).toBe(
      new Intl.DateTimeFormat('es', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(done),
    );
    expect(written).toContain('23');
  });
});
