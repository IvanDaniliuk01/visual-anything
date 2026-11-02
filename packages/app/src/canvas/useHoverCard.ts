/** When a shape's hover card shows (ADR 0082), for the editor's canvas and the read-only page. */
import type { ResolvedDrawing } from '@visual-anything/core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BASE_DRAWING } from './drawing';
import { canvasMeasure } from './textBlock';
import { HOVER_CARD_DELAY, cutOnCanvas } from './hoverCut';
import type { ElementShape } from './scene';

/**
 * The shape whose card shows, and what the canvas calls when the pointer or the keys rest on a shape,
 * or leave it: the card shows 400 ms later, when the canvas cut the shape's text as the drawing it is
 * drawn with writes it (`drawing`, ADR 0086).
 */
export function useHoverCard(
  find: (key: string) => ElementShape | undefined,
  drawing: () => ResolvedDrawing = () => BASE_DRAWING,
): [string | undefined, (key: string | undefined) => void] {
  const [shown, setShown] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const finding = useRef({ find, drawing });
  useLayoutEffect(() => {
    finding.current = { find, drawing };
  });
  const hover = useCallback((key: string | undefined) => {
    clearTimeout(timer.current);
    setShown(undefined);
    if (key === undefined) return;
    timer.current = setTimeout(() => {
      const shape = finding.current.find(key);
      if (shape && cutOnCanvas(shape, canvasMeasure, finding.current.drawing())) setShown(key);
    }, HOVER_CARD_DELAY);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [shown, hover];
}
