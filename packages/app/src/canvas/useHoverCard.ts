/** When a shape's hover card shows (ADR 0082), for the editor's canvas and the read-only page. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { canvasMeasure } from './textBlock';
import { HOVER_CARD_DELAY, cutOnCanvas } from './hoverCut';
import type { ElementShape } from './scene';

/**
 * The shape whose card shows, and what the canvas calls when the pointer or the keys rest on a shape,
 * or leave it: the card shows 400 ms later, when the canvas cut the shape's text.
 */
export function useHoverCard(
  find: (key: string) => ElementShape | undefined,
): [string | undefined, (key: string | undefined) => void] {
  const [shown, setShown] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const finding = useRef(find);
  useLayoutEffect(() => {
    finding.current = find;
  });
  const hover = useCallback((key: string | undefined) => {
    clearTimeout(timer.current);
    setShown(undefined);
    if (key === undefined) return;
    timer.current = setTimeout(() => {
      const shape = finding.current(key);
      if (shape && cutOnCanvas(shape, canvasMeasure)) setShown(key);
    }, HOVER_CARD_DELAY);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [shown, hover];
}
