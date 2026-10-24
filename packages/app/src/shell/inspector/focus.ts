import { useMemo, useRef } from 'react';

/**
 * Keeps the focus in place when a control gives way to another, as when a committed value changes the
 * kind of control that edits it: the control that goes with the focus leaves it, and the one that
 * comes takes it.
 */
export interface FocusKeeper {
  /** A control that has the focus is going. */
  leave(): void;
  /** A control is coming: whether it takes the focus. */
  take(): boolean;
}

/** A focus keeper for the controls that take each other's place in one spot. */
export function useFocusKeeper(): FocusKeeper {
  const left = useRef(false);
  return useMemo(
    () => ({
      leave: () => {
        left.current = true;
      },
      take: () => {
        const taken = left.current;
        left.current = false;
        return taken;
      },
    }),
    [],
  );
}
