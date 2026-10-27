/**
 * Names written beside shapes whose own outline leaves no room for them inside and that write them
 * nowhere else, an anchored part in its drawing or a container whose header has no room (ADR 0066,
 * ADR 0067); a shape drawn on its own writes such a name in its name tag (`writesNameBelow`):
 * the hover mark, and the selection's marks while the selection holds at most 64 shapes, write each
 * such shape's name under it, centred below its outline, at one size on screen whatever the zoom, in
 * the theme's text over a halo of its canvas, as relations' names are written. The hovered shape's
 * comes first; the outline, the inspector and announcements give every name as for any shape.
 */
import type { Color } from '@visual-anything/schema';
import { Container, Text } from 'pixi.js';
import { FONT_FAMILY } from './draw';
import { outlineBoundsOn, writesNameBelow, writesNameInside } from './outlined';
import type { ElementShape } from './scene';

/** The most names written beside their shapes at once. */
export const MOST_NAMES_BESIDE = 64;
/** How far below its shape's outline a name is written, in screen pixels. */
const GAP = 4;
const SIZE = 12;

/** Whether the marks write a shape's name beside it: a shape with its own outline that writes it neither inside nor in a name tag. */
export function namedBeside(shape: ElementShape): boolean {
  return shape.outline !== undefined && !writesNameInside(shape) && !writesNameBelow(shape);
}

/** The names written beside shapes, which the marks show and keep up to date. */
export class NamesBeside {
  readonly container = new Container();
  private readonly texts: Text[] = [];
  private colors: { text: Color; back: Color } | undefined;

  /**
   * Writes beside each of these shapes that the marks name beside it, at most 64, for a camera of
   * this scale, in these colors; the names written before and not now are hidden.
   */
  show(shapes: readonly ElementShape[], scale: number, colors: { text: Color; back: Color }): void {
    const restyle =
      this.colors === undefined ||
      this.colors.text !== colors.text ||
      this.colors.back !== colors.back;
    this.colors = colors;
    if (restyle) for (const text of this.texts) this.paint(text, colors);
    let used = 0;
    const seen = new Set<string>();
    for (const shape of shapes) {
      if (used >= MOST_NAMES_BESIDE) break;
      if (seen.has(shape.key) || !namedBeside(shape) || !shape.outline) continue;
      seen.add(shape.key);
      let text = this.texts[used];
      if (!text) {
        text = new Text({ text: '', anchor: { x: 0.5, y: 0 } });
        this.paint(text, colors);
        this.texts.push(text);
        this.container.addChild(text);
      }
      if (text.text !== shape.name) text.text = shape.name;
      const bounds = outlineBoundsOn({ rect: shape.rect, outline: shape.outline });
      text.position.set(bounds.x + bounds.width / 2, bounds.y + bounds.height + GAP / scale);
      text.scale.set(1 / scale);
      text.visible = true;
      used += 1;
    }
    for (let at = used; at < this.texts.length; at++) (this.texts[at] as Text).visible = false;
  }

  /** The names written now, in order: for tests. */
  get written(): string[] {
    return this.texts.filter((text) => text.visible).map((text) => text.text);
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.texts.length = 0;
  }

  private paint(text: Text, colors: { text: Color; back: Color }): void {
    text.style = {
      fontFamily: FONT_FAMILY,
      fontSize: SIZE,
      fontWeight: '600',
      fill: colors.text,
      stroke: { color: colors.back, width: 4, join: 'round' },
    };
  }
}
