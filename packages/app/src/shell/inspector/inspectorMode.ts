/**
 * Whether the inspector shows an element as a sheet to read or as sections to edit (ReadSheet): each
 * person's, kept in the browser, and held from one element to the next.
 */
import { useCallback, useState } from 'react';

/** Where the browser keeps how the inspector shows an element. */
export const INSPECTOR_MODE_KEY = 'visual-anything.inspector-mode';

export type InspectorMode = 'edit' | 'sheet';

function readMode(): InspectorMode {
  try {
    return localStorage.getItem(INSPECTOR_MODE_KEY) === 'sheet' ? 'sheet' : 'edit';
  } catch {
    return 'edit';
  }
}

/** How the inspector shows an element, and how to change it; kept for the next element. */
export function useInspectorMode(): [InspectorMode, (mode: InspectorMode) => void] {
  const [mode, setStored] = useState<InspectorMode>(readMode);
  const set = useCallback((next: InspectorMode) => {
    setStored(next);
    try {
      localStorage.setItem(INSPECTOR_MODE_KEY, next);
    } catch {
      // A browser that keeps nothing still switches for this element.
    }
  }, []);
  return [mode, set];
}
