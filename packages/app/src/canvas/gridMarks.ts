/**
 * The grid as PixiJS draws it: over the whole canvas, under every shape, and on the fill of one
 * container, above its fill and under its contents. The canvas's grid is drawn in screen space, with a
 * transform that undoes the camera's, so that its lines stay 1 CSS pixel wide at any zoom: panning
 * only moves it, by less than one period of its coarsest lines, and zooming draws it again. A
 * container's grid is drawn in canvas units from the container's origin, where its contents snap to.
 * Both draw white, tinted in the theme's grid color, so that a theme switch only retints them.
 */
import { Container, Graphics } from 'pixi.js';
import { THEMES, type CanvasTheme } from '../theme/themes';
import type { Camera } from './camera';
import { cylinderCap, personHead, type Point, type Rect, type Size } from './geometry';
import { containerGridLines, familyAlpha, gridLines, gridOffset } from './grid';
import type { ElementShape } from './scene';

/** What the grid draws: whether it shows, and whether shapes snap to it. */
export interface GridState {
  shown: boolean;
  snapping: boolean;
}

/** What the canvas's grid was last drawn for; a camera that keeps it only moves the grid. */
interface Drawn {
  scale: number;
  width: number;
  height: number;
  resolution: number;
  snapping: boolean;
  theme: CanvasTheme;
  period: number;
}

/** What a container's grid was last drawn for. */
interface DrawnInside {
  key: string;
  area: Rect;
  origin: Point;
  scale: number;
  resolution: number;
  snapping: boolean;
  theme: CanvasTheme;
}

/** The container a grid is drawn in: its shape, and the drawing it goes last in. */
export interface GridTarget {
  shape: ElementShape;
  parent: Container;
}

export class GridMarks {
  /** The canvas's grid: the first child of the renderer's `world`, never left out by culling. */
  readonly whole = new Container({ label: 'grid', isRenderGroup: true });
  private readonly lines = new Graphics();
  /** A container's grid, put last in the drawing of the container's shape when it shows. */
  readonly inside = new Container({ label: 'container grid', isRenderGroup: true });
  private readonly insideLines = new Graphics();
  private state: GridState = { shown: false, snapping: false };
  private theme: CanvasTheme = THEMES.light.canvas;
  private drawn: Drawn | undefined;
  private drawnInside: DrawnInside | undefined;
  /** How many lines each grid drew last, and how many times the canvas's grid was drawn, for tests. */
  lineCount = 0;
  insideLineCount = 0;
  draws = 0;

  constructor() {
    this.whole.addChild(this.lines);
    this.whole.cullable = false;
    this.whole.visible = false;
    this.inside.addChild(this.insideLines);
    this.inside.visible = false;
    this.lines.tint = this.theme.gridLine;
    this.insideLines.tint = this.theme.gridLine;
  }

  get shown(): boolean {
    return this.state.shown;
  }

  /** Shows or hides the grid, and says whether its 8-unit lines show where shapes snap. */
  set(state: GridState): void {
    this.state = state;
    this.whole.visible = state.shown;
  }

  /** Draws in a theme from now on: only a retint, unless the theme's strengths differ. */
  setTheme(theme: CanvasTheme): void {
    this.theme = theme;
    this.lines.tint = theme.gridLine;
    this.insideLines.tint = theme.gridLine;
  }

  /**
   * Follows the camera: a pan moves the grid; a zoom, a resize, a change of resolution, of snapping or
   * of the theme's strengths draws its lines again. Nothing is done while the grid is hidden.
   */
  follow(camera: Camera, viewport: Size, resolution: number): void {
    if (!this.state.shown || viewport.width <= 0 || viewport.height <= 0) return;
    const { scale } = camera;
    const was = this.drawn;
    if (
      was?.scale !== scale ||
      was.width !== viewport.width ||
      was.height !== viewport.height ||
      was.resolution !== resolution ||
      was.snapping !== this.state.snapping ||
      was.theme.gridStrength !== this.theme.gridStrength ||
      was.theme.gridSnapAlpha !== this.theme.gridSnapAlpha
    ) {
      this.drawn = this.draw(scale, viewport, resolution);
    }
    const { period } = this.drawn as Drawn;
    const x = gridOffset(camera.x, period, resolution);
    const y = gridOffset(camera.y, period, resolution);
    // Undoes the camera's transform, so that the grid draws in screen space, `x` and `y` from the
    // screen's corner.
    this.whole.scale.set(1 / scale);
    this.whole.position.set((x - camera.x) / scale, (y - camera.y) / scale);
  }

  private draw(scale: number, viewport: Size, resolution: number): Drawn {
    const graphics = this.lines;
    graphics.clear();
    this.draws += 1;
    const planned = gridLines(scale, viewport, resolution);
    const { extent } = planned;
    for (const family of planned.families) {
      if (family.xs.length + family.ys.length === 0) continue;
      for (const line of family.xs) graphics.rect(line.start, 0, line.width, extent.height);
      for (const line of family.ys) graphics.rect(0, line.start, extent.width, line.width);
      graphics.fill({
        color: 0xffffff,
        alpha: familyAlpha(family, this.theme, this.state.snapping),
      });
    }
    this.lineCount = planned.count;
    return {
      scale,
      width: viewport.width,
      height: viewport.height,
      resolution,
      snapping: this.state.snapping,
      theme: this.theme,
      period: planned.period,
    };
  }

  /**
   * Shows the grid on a container's fill, last in the drawing its shape is in, or hides it. It is
   * drawn again when the container, its place or the zoom changes.
   */
  showInside(target: GridTarget | undefined, camera: Camera, resolution: number): void {
    if (!target) {
      this.hideInside();
      return;
    }
    const { shape, parent } = target;
    if (this.inside.parent !== parent || parent.children.at(-1) !== this.inside) {
      parent.addChild(this.inside);
    }
    this.inside.visible = true;
    const area = gridAreaOf(shape);
    const origin = { x: shape.rect.x, y: shape.rect.y };
    const was = this.drawnInside;
    if (
      was?.key === shape.key &&
      was.scale === camera.scale &&
      was.resolution === resolution &&
      was.snapping === this.state.snapping &&
      was.theme.gridStrength === this.theme.gridStrength &&
      sameRect(was.area, area) &&
      was.origin.x === origin.x &&
      was.origin.y === origin.y
    ) {
      return;
    }
    this.drawInside(area, origin, camera.scale, resolution);
    this.drawnInside = {
      key: shape.key,
      area,
      origin,
      scale: camera.scale,
      resolution,
      snapping: this.state.snapping,
      theme: this.theme,
    };
  }

  /** The key of the container whose grid shows, if any. */
  get insideOf(): string | undefined {
    return this.inside.visible ? this.drawnInside?.key : undefined;
  }

  private hideInside(): void {
    if (!this.inside.visible) return;
    this.inside.visible = false;
    this.inside.parent?.removeChild(this.inside);
  }

  private drawInside(area: Rect, origin: Point, scale: number, resolution: number): void {
    const graphics = this.insideLines;
    graphics.clear();
    // One device pixel or more, as the canvas's grid, in canvas units.
    const width = Math.max(1, Math.round(resolution)) / resolution / scale;
    const families = containerGridLines(area, origin, scale);
    for (const family of families) {
      if (family.xs.length + family.ys.length === 0) continue;
      for (const x of family.xs) graphics.rect(x - width / 2, area.y, width, area.height);
      for (const y of family.ys) graphics.rect(area.x, y - width / 2, area.width, width);
      graphics.fill({
        color: 0xffffff,
        alpha: familyAlpha(family, this.theme, this.state.snapping),
      });
    }
    this.insideLineCount = families.reduce(
      (sum, family) => sum + family.xs.length + family.ys.length,
      0,
    );
  }
}

/**
 * Where a container's grid is drawn: inside its outline, a little in from its border, so that it never
 * crosses the border or spills out of a shape that is not a rectangle.
 */
export function gridAreaOf(shape: ElementShape): Rect {
  const { x, y, width, height } = shape.rect;
  const inset = 2;
  let area: Rect;
  switch (shape.kind) {
    case 'cylinder': {
      const cap = cylinderCap(shape.rect);
      area = { x, y: y + 2 * cap, width, height: height - 3 * cap };
      break;
    }
    case 'person': {
      const top = personHead(shape.rect) * 2;
      area = { x, y: y + top, width, height: height - top };
      break;
    }
    case 'ellipse':
      // The rectangle inscribed in the ellipse.
      area = {
        x: x + (width * (1 - Math.SQRT1_2)) / 2,
        y: y + (height * (1 - Math.SQRT1_2)) / 2,
        width: width * Math.SQRT1_2,
        height: height * Math.SQRT1_2,
      };
      break;
    default:
      area = shape.rect;
  }
  return {
    x: area.x + inset,
    y: area.y + inset,
    width: Math.max(0, area.width - 2 * inset),
    height: Math.max(0, area.height - 2 * inset),
  };
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
