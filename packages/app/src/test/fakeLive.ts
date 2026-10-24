import { vi } from 'vitest';
import type { CommandResult } from '../live/connection';
import type { Live } from '../live/context';
import { loadSample } from './sample';

const DONE: CommandResult = { ok: true, created: [], warnings: [] };

/**
 * A live session open on the sample project, for components tested without a local program: give it to
 * `LiveContext`. Its requests resolve as done at once unless a test replaces them.
 */
export function fakeLive(overrides: Partial<Live> = {}): Live {
  return {
    status: 'open',
    failure: undefined,
    project: loadSample(),
    history: {},
    notices: [],
    send: vi.fn<Live['send']>(() => Promise.resolve(DONE)),
    undo: vi.fn<Live['undo']>(() => Promise.resolve(DONE)),
    redo: vi.fn<Live['redo']>(() => Promise.resolve(DONE)),
    notify: vi.fn<Live['notify']>(),
    dismiss: vi.fn<Live['dismiss']>(),
    ...overrides,
  };
}
