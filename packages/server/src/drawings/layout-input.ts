/**
 * The cleaned tree as satori takes it (ADR 0068): objects shaped as React elements, `type`, `props.style`
 * and `props.children`, made of nothing but the cleaned tree's tags, styles and text. The page goes in
 * a box of the width asked for. It names no font: satori writes every text in the fonts it is given,
 * Roboto, whatever the page asked for. A page taller than a drawing is cut afterwards
 * (`svg-output.ts`), since a box that hides what overflows it makes satori write masks within masks,
 * which the SVG cleaner refuses.
 */
import type { CleanChild, CleanElement } from './clean';

/** An element as satori takes it. */
export interface LayoutElement {
  type: string;
  props: { style: Record<string, string>; children?: LayoutChild | LayoutChild[] };
}

export type LayoutChild = LayoutElement | string;

/** The cleaned page in a box of `width` CSS pixels. */
export function layoutInput(page: CleanElement, width: number): LayoutElement {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: `${width}px`,
        fontSize: '16px',
        color: '#000000',
      },
      children: element(page),
    },
  };
}

function element(clean: CleanElement): LayoutElement {
  const children = clean.children.map(child);
  return {
    type: clean.tag,
    props: {
      style: { ...clean.style },
      ...(children.length === 0
        ? {}
        : { children: children.length === 1 ? (children[0] as LayoutChild) : children }),
    },
  };
}

function child(each: CleanChild): LayoutChild {
  return typeof each === 'string' ? each : element(each);
}
