/** How things move: the person's Motion and Fades where the shell gives them (ADR 0077). */
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionContext, useMotion, useReducedMotion, type MotionPreference } from './motion';

/** The system asks for reduced motion, or not. */
function systemReduces(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: reduce && query.includes('reduce'),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

function within(chosen: MotionPreference) {
  return ({ children }: { children: ReactNode }) => (
    <MotionContext value={chosen}>{children}</MotionContext>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMotion', () => {
  it('follows the system, with fades on, where the person chose nothing', () => {
    systemReduces(true);
    expect(renderHook(() => useMotion()).result.current).toEqual({ reduced: true, fades: true });
    systemReduces(false);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });

  it('takes the person’s Motion and Fades over the system’s setting', () => {
    systemReduces(true);
    expect(
      renderHook(() => useMotion(), { wrapper: within({ motion: 'full', fades: false }) }).result
        .current,
    ).toEqual({ reduced: false, fades: false });
    systemReduces(false);
    expect(
      renderHook(() => useReducedMotion(), {
        wrapper: within({ motion: 'reduced', fades: true }),
      }).result.current,
    ).toBe(true);
    expect(
      renderHook(() => useReducedMotion(), {
        wrapper: within({ motion: 'system', fades: true }),
      }).result.current,
    ).toBe(false);
  });
});
