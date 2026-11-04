import { describe, expect, it, vi } from 'vitest';
import { showThisTab } from './shown';

describe('showThisTab', () => {
  it('comes forward and puts the view state in the address while a project is open', () => {
    const target = { focus: vi.fn(), location: { hash: '' } };
    showThisTab(target, { view: 'overview', select: ['api'] }, true);
    expect(target.focus).toHaveBeenCalledOnce();
    expect(target.location.hash).toBe('view=overview&select=api');
  });

  it('leaves the address as it is with no view state, no project, or one it cannot read', () => {
    const target = { focus: vi.fn(), location: { hash: '#view=old' } };
    showThisTab(target, undefined, true);
    showThisTab(target, { view: 'overview' }, false);
    showThisTab(target, { view: 'Not an id!' }, true);
    expect(target.location.hash).toBe('#view=old');
    expect(target.focus).toHaveBeenCalledTimes(3);
  });
});
