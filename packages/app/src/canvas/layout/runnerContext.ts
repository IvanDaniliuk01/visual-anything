/** What runs the canvas's layouts, as the canvas and expanding by zoom find it. */
import { createContext, useContext, useState } from 'react';
import { sharedRunner, type LayoutRunner } from './client';

/**
 * What runs the canvas's layouts: by default (null) the layout worker every canvas shares; tests give
 * a runner of their own, and undefined turns layout off.
 */
export const LayoutRunnerContext = createContext<LayoutRunner | null | undefined>(null);

/** The runner layouts here use: the context's, or the shared worker; undefined when off. */
export function useLayoutRunner(): LayoutRunner | undefined {
  const given = useContext(LayoutRunnerContext);
  const [shared] = useState(() => (given === null ? sharedRunner() : undefined));
  return given === null ? shared : given;
}
