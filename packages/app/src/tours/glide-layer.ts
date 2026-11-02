/**
 * The glide layer (ADR 0084): while a tour step goes into another view, the shapes it shares with the
 * step before move and resize on screen from their places before to their places after, drawn simply
 * on a 2D canvas laid over the WebGL canvas: their kind or free geometry, fill, stroke and name, with
 * no rows, detail, images or face, on the canvas's background. The canvas under it is already in the
 * step after; once the shapes arrive the layer fades out over the in stage, and the full drawing
 * replaces them. Drawing a box and a name for each of at most 400 shapes keeps a frame within budget
 * whatever the shapes hold.
 *
 * The shapes glide as the drawing defaults of the step after draw them (ADR 0086), simply and on
 * screen: their borders at its border width and its corner radius, their names in its fonts and name
 * weight at its `reading.farNameSize`, the size names written at one size on screen take.
 */
import {
  simplifyOutline,
  tourEase,
  type GlideRect,
  type GlideShape,
  type ResolvedDrawing,
} from '@visual-anything/core';
import type { Camera } from '../canvas/camera';
import { BASE_DRAWING, fontFamilyOf, nameWeightOf } from '../canvas/drawing';
import type { Rect, ShapeKind, Size } from '../canvas/geometry';
import { cssFontFamily, SANS_FAMILY } from '../canvas/robotoFonts';
import { drawingOfScene, type ElementShape, type Scene } from '../canvas/scene';

/** How a shape is drawn while it glides. */
export interface GlideLook {
  kind: ShapeKind;
  fill: string;
  stroke: string;
  /** Its fill and stroke on the dark canvas, when they differ. */
  dark?: { fill: string; stroke: string };
  name: string;
  /** Its free geometry's contours, as x, y pairs in a box of `size`, when it has its own outline. */
  contours?: readonly Float64Array[];
  size?: Size;
  /** How its drawing draws it, one object for every shape of a drawing; absent, the base's. */
  type?: GlideType;
}

/** How a drawing's shapes glide, on screen: their border, its corners, and their names. */
export interface GlideType {
  border: number;
  radius: number;
  /** The CSS font names are written in, and its size in pixels. */
  font: string;
  nameSize: number;
}

const glideTypes = new WeakMap<ResolvedDrawing, GlideType>();

/** How a drawing's shapes glide, the same object for the same drawing. */
export function glideTypeOf(drawing: ResolvedDrawing): GlideType {
  let type = glideTypes.get(drawing);
  if (!type) {
    const nameSize = drawing.reading.farNameSize;
    type = {
      border: drawing.shapes.borderWidth,
      radius: drawing.shapes.cornerRadius,
      font: `${nameWeightOf(drawing)} ${nameSize}px ${cssFontFamily(fontFamilyOf(drawing))}`,
      nameSize,
    };
    glideTypes.set(drawing, type);
  }
  return type;
}

/** The shapes of one side of a glide, on screen, and how each is drawn. */
export interface GlideSide {
  shapes: GlideShape[];
  looks: GlideLook[];
}

/** One shape gliding, from where it was to where it goes, on screen. */
export interface GlideItem {
  from: GlideRect;
  to: GlideRect;
  look: GlideLook;
}

/** A 2D canvas laid over the WebGL canvas, which the renderer lends for a glide. */
export interface GlideSurface {
  element: HTMLCanvasElement;
  /** The canvas's background in the theme it shows. */
  background: string;
  /** Whether the canvas shows its dark theme. */
  dark: boolean;
  /** Device pixels for each pixel of the screen. */
  resolution: number;
}

/**
 * The shapes a scene draws on screen with a camera, as one side of a glide: element shapes but rows
 * and parts anchored in a drawing, which move with what holds them, and what `hidden` hides; only
 * those on screen, since only those can be followed.
 */
export function glideSideOf(
  scene: Scene,
  camera: Camera,
  screen: Size,
  options: { hidden?: ReadonlySet<string> | undefined } = {},
): GlideSide {
  const shapes: GlideShape[] = [];
  const looks: GlideLook[] = [];
  const type = glideTypeOf(drawingOfScene(scene));
  for (const shape of scene.shapes) {
    if (shape.row !== undefined || shape.part?.inDrawing === true) continue;
    if (options.hidden?.has(shape.key)) continue;
    const rect = onScreen(shape.rect, camera);
    if (!meets(rect, screen)) continue;
    shapes.push({ element: shape.element, path: shape.key, rect });
    looks.push(lookOf(shape, type));
  }
  return { shapes, looks };
}

/** A canvas rectangle where a camera shows it on screen. */
export function onScreen(rect: Rect, camera: Camera): Rect {
  return {
    x: rect.x * camera.scale + camera.x,
    y: rect.y * camera.scale + camera.y,
    width: rect.width * camera.scale,
    height: rect.height * camera.scale,
  };
}

function meets(rect: Rect, screen: Size): boolean {
  return (
    rect.x < screen.width &&
    rect.y < screen.height &&
    rect.x + rect.width > 0 &&
    rect.y + rect.height > 0
  );
}

function lookOf(shape: ElementShape, type: GlideType): GlideLook {
  const look: GlideLook = {
    kind: shape.kind,
    fill: shape.fill,
    stroke: shape.stroke,
    name: shape.name,
    type,
  };
  if (shape.dark) look.dark = { ...shape.dark };
  if (shape.outline) {
    const { fitted, x, y } = shape.outline;
    // In the shape's own box: the outline is placed from its rectangle's top left.
    look.contours = simplifyOutline(fitted).map((points) => {
      const placed = new Float64Array(points.length);
      for (let at = 0; at < points.length; at += 2) {
        placed[at] = (points[at] as number) + x;
        placed[at + 1] = (points[at + 1] as number) + y;
      }
      return placed;
    });
    look.size = { width: shape.rect.width, height: shape.rect.height };
  }
  return look;
}

/** The part of a 2D context a glide draws with, so that tests can record it. */
export type GlideContext = Pick<
  CanvasRenderingContext2D,
  | 'setTransform'
  | 'fillRect'
  | 'beginPath'
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'fill'
  | 'stroke'
  | 'fillText'
  | 'measureText'
> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
};

/** How much taller than a name a shape must be on screen to write it, in pixels. */
const NAME_ROOM_OVER = 4;
/** Names are written in the canvas's own Roboto, with the system's fonts after it until it loads. */
export const NAME_FAMILY = cssFontFamily(SANS_FAMILY);
/** How shapes that name no drawing glide: as the base draws them. */
const BASE_TYPE = glideTypeOf(BASE_DRAWING);

/**
 * Draws one frame of a glide, a part of the way from 0 to 1 already eased: the background over the
 * whole screen, then each shape at its place between before and after, simply, as its drawing draws
 * it (`GlideType`).
 */
export function drawGlideFrame(
  context: GlideContext,
  items: readonly GlideItem[],
  part: number,
  surface: Pick<GlideSurface, 'background' | 'resolution'> & { size: Size; dark?: boolean },
): void {
  const { resolution, size } = surface;
  context.setTransform(resolution, 0, 0, resolution, 0, 0);
  context.fillStyle = surface.background;
  context.fillRect(0, 0, size.width, size.height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  let typed: GlideType | undefined;
  for (const item of items) {
    const at = between(item.from, item.to, part);
    const { look } = item;
    const type = look.type ?? BASE_TYPE;
    if (type !== typed) {
      // Set once for each drawing, which is once a frame: every shape of a glide shares one.
      context.lineWidth = type.border;
      context.font = type.font;
      typed = type;
    }
    const colors = surface.dark === true && look.dark ? look.dark : look;
    context.beginPath();
    traceShape(context, look, at, type);
    context.fillStyle = colors.fill;
    context.fill();
    context.strokeStyle = colors.stroke;
    context.stroke();
    const room = type.nameSize + NAME_ROOM_OVER;
    if (at.height >= room && at.width >= room * 2) {
      context.fillStyle = readableOn(colors.fill);
      context.fillText(
        cut(context, look.name, at.width - 8),
        at.x + at.width / 2,
        at.y + at.height / 2,
      );
    }
  }
}

function between(from: GlideRect, to: GlideRect, part: number): GlideRect {
  return {
    x: from.x + (to.x - from.x) * part,
    y: from.y + (to.y - from.y) * part,
    width: from.width + (to.width - from.width) * part,
    height: from.height + (to.height - from.height) * part,
  };
}

function traceShape(context: GlideContext, look: GlideLook, at: GlideRect, type: GlideType): void {
  const { x, y, width, height } = at;
  if (look.contours && look.size && look.size.width > 0 && look.size.height > 0) {
    const sx = width / look.size.width;
    const sy = height / look.size.height;
    for (const points of look.contours) {
      for (let each = 0; each < points.length; each += 2) {
        const px = x + (points[each] as number) * sx;
        const py = y + (points[each + 1] as number) * sy;
        if (each === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
    }
    return;
  }
  switch (look.kind) {
    case 'ellipse':
    case 'person':
      context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      return;
    case 'rounded-rectangle':
      context.roundRect(x, y, width, height, Math.min(type.radius, width / 4, height / 4));
      return;
    case 'cylinder':
      context.roundRect(x, y, width, height, [Math.min(width / 2, height / 6)]);
      return;
    default:
      context.rect(x, y, width, height);
  }
}

/** A name cut with "…" to fit a width, by its measure once and its share of characters. */
function cut(context: GlideContext, name: string, room: number): string {
  const width = context.measureText(name).width;
  if (width <= room) return name;
  const keep = Math.max(0, Math.floor((name.length * room) / width) - 1);
  return keep === 0 ? '' : `${name.slice(0, keep)}…`;
}

/** Dark text on a light fill, white on a dark one. */
export function readableOn(fill: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(fill.trim());
  if (!match) return '#1b1b1f';
  const value = Number.parseInt(match[1] as string, 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.4 ? '#1b1b1f' : '#ffffff';
}

/** The clock a glide moves by: the browser's frames by default. */
export interface GlideClock {
  now(): number;
  request(run: (time: number) => void): number;
  cancel(handle: number): void;
}

const BROWSER_CLOCK: GlideClock = {
  now: () => performance.now(),
  request: (run) => requestAnimationFrame(run),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * A glide on screen: drawn at its start at once, it moves its shapes over `duration` milliseconds
 * from `start`, on the tour's sinusoidal ease, then fades out when asked, and goes.
 */
export class GlideLayer {
  #frame: number | undefined;
  #gone = false;
  readonly #context: GlideContext | null;

  constructor(
    private readonly surface: GlideSurface,
    private readonly items: readonly GlideItem[],
    private readonly size: Size,
    private readonly clock: GlideClock = BROWSER_CLOCK,
  ) {
    surface.element.setAttribute('aria-hidden', 'true');
    this.#context = surface.element.getContext('2d');
    this.#draw(0);
  }

  get gone(): boolean {
    return this.#gone;
  }

  /** Moves the shapes from `start`, on the clock, over `duration` milliseconds. */
  move(start: number, duration: number): void {
    this.#stop();
    const step = (time: number) => {
      this.#frame = undefined;
      const part = duration > 0 ? (time - start) / duration : 1;
      this.#draw(tourEase(Math.max(0, Math.min(1, part))));
      if (part < 1) this.#frame = this.clock.request(step);
    };
    this.#frame = this.clock.request(step);
  }

  /** Fades out over `duration` milliseconds from `start`, the shapes where they arrived, then goes. */
  fadeOut(start: number, duration: number): void {
    this.#stop();
    this.#draw(1);
    if (!(duration > 0)) {
      this.drop();
      return;
    }
    const step = (time: number) => {
      this.#frame = undefined;
      const part = (time - start) / duration;
      if (!(part < 1)) {
        this.drop();
        return;
      }
      this.surface.element.style.opacity = String(1 - Math.max(0, part));
      this.#frame = this.clock.request(step);
    };
    this.#frame = this.clock.request(step);
  }

  /** Goes at once, letting its canvas go. */
  drop(): void {
    if (this.#gone) return;
    this.#stop();
    this.#gone = true;
    const { element } = this.surface;
    element.remove();
    element.width = 0;
    element.height = 0;
  }

  #draw(part: number): void {
    if (!this.#context || this.#gone) return;
    drawGlideFrame(this.#context, this.items, part, { ...this.surface, size: this.size });
  }

  #stop(): void {
    if (this.#frame !== undefined) this.clock.cancel(this.#frame);
    this.#frame = undefined;
  }
}
