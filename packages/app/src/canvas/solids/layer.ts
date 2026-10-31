/**
 * The solid layer (ADR 0075): what the canvas draws for drawings with parts that show a solid, and for
 * the solid being turned, above the element shapes and under what is drawn over image parts.
 *
 * - **A drawing with parts** that shows a solid draws its picture with the parts' shader
 *   (`shader.ts`): the picture, its part buffer and the table of its parts' states (`states.ts`) in one
 *   pass, over the drawing's fill. A change of selection, hover, highlight, focus or overlay rewrites
 *   the table, and no picture.
 * - **Hidden parts.** A part a filter or isolation hides is drawn again without, by asking for the
 *   picture with every part it hides listed (`withHiddenParts`); the old picture shows until the new
 *   one arrives.
 * - **Levels of detail.** Its picture shows from the scale its shape's level shows images (ADR 0055):
 *   below it, and until any picture arrives, the tiles draw its kind and its placeholder, and the
 *   marks of its parts are rings around their points.
 * - **Turning.** The shape being turned shows the newest frame the worker drew for it, with that
 *   frame's part buffer, uploaded at most once a frame.
 * - **Pointing.** It says which part buffer each drawing shows now, and where (`placedBuffer`), so
 *   that the pixel under the pointer finds the part.
 *
 * Textures of pictures come from the image store, through the canvas's solids' pictures; this layer
 * makes only the part buffers', the tables' and the turning frames'.
 */
import { CANVAS_BACKGROUNDS, fadedColor, type ThemeName } from '@visual-anything/core';
import type { Color, Id, SolidPart } from '@visual-anything/schema';
import {
  BufferImageSource,
  Container,
  Graphics,
  ImageSource,
  Mesh,
  MeshGeometry,
  Shader,
  Texture,
  UniformGroup,
} from 'pixi.js';
import type { SolidFrameReply, SolidPartBuffer } from '../../solids/protocol';
import { DIMMED_ALPHA } from '../colors';
import type { Rect } from '../geometry';
import { readyTextureKey } from '../images';
import { pictureShows } from '../partsDraw';
import { overlayLookOfPart } from '../overlays/decorate';
import type { ElementShape, Scene } from '../scene';
import { SOLID_POINT_RADIUS, withHiddenParts, type ShapeSolid } from '../shape-solids';
import { meets } from '../spatial';
import { shapeColors } from '../theme/paint';
import type { SolidPictures } from './pictures';
import { anchoredByIndex, type PlacedPartBuffer } from './pointing';
import { PART_FRAGMENT, PART_VERTEX, casingFor } from './shader';
import { partStatesOf, sameTable, type PartElementState, type PartStates } from './states';

/** The name the image store knows the layer's pictures by, which are always within reach. */
export const SOLID_LAYER = 'solid-layer';

/** What the layer needs to know of how the canvas is seen this frame. */
export interface SolidLayerView {
  scale: number;
  shown: Rect;
  resolution: number;
  settled: boolean;
}

/** What the canvas marks: the elements selected, the shape hovered and the shapes highlighted. */
export interface SolidMarks {
  selected: ReadonlySet<Id>;
  hovered: string | undefined;
  highlighted: ReadonlySet<string>;
}

/** The colors the layer draws its marks in. */
export interface SolidLayerColors {
  selected: Color;
  highlight: Color;
}

/** A turning shown: the shape turned, and its newest frame. */
export interface SolidTurningShown {
  key: string;
  frame: SolidFrameReply | undefined;
}

const NO_MARKS: SolidMarks = { selected: new Set(), hovered: undefined, highlighted: new Set() };

/** What the layer draws for one shape. */
interface Entry {
  shape: ElementShape;
  solid: ShapeSolid;
  holder: ElementShape | undefined;
  parts: readonly SolidPart[];
  anchored: Map<number, ElementShape>;
  faint: boolean;
  states: PartStates;
  /** Whether it is the shape being turned, rather than a drawing with parts. */
  turned: boolean;
  /** What it shows now: a texture, its part buffer and where on the canvas. */
  shown?: { texture: Texture; key?: string; buffer: SolidPartBuffer | undefined };
  mesh?: Mesh<MeshGeometry, Shader>;
  uniforms?: UniformGroup;
  partsTexture?: { buffer: SolidPartBuffer | undefined; texture: Texture };
  statesTexture?: { states: PartStates; texture: Texture };
  visible: boolean;
}

/** An empty part buffer, for a picture drawn without one. */
const NO_PARTS: SolidPartBuffer = { width: 1, height: 1, data: new Uint16Array(1) };

/** The solid layer of a canvas. */
export class SolidLayer {
  readonly container = new Container();
  /** Rings around the points of marked parts whose picture does not show. */
  private readonly rings = new Graphics();
  private entries: Entry[] = [];
  private byKey = new Map<string, Entry>();
  private from: { scene: Scene | undefined; hidden: unknown; dimmed: unknown; parts: unknown } = {
    scene: undefined,
    hidden: undefined,
    dimmed: undefined,
    parts: undefined,
  };
  private marks: SolidMarks = NO_MARKS;
  private theme: ThemeName = 'light';
  private colors: SolidLayerColors = { selected: '#2563EB', highlight: '#C2410C' };
  private scale = 1;
  private partsOf: (solid: Id) => readonly SolidPart[] | undefined = () => undefined;
  private turning: SolidTurningShown | undefined;
  private turningTexture: { texture: Texture; bitmap: ImageBitmap } | undefined;
  private hiddenParts: ReadonlySet<string> = new Set();

  constructor(
    private readonly pictures: () => SolidPictures<Texture, unknown> | undefined,
    private readonly changed: () => void = () => {},
  ) {
    this.container.addChild(this.rings);
  }

  /** How many shapes it draws, for the tests. */
  get drawn(): number {
    return this.entries.length;
  }

  /** Says where the named parts of each solid are found, by the solid's id. */
  setParts(partsOf: (solid: Id) => readonly SolidPart[] | undefined): void {
    this.partsOf = partsOf;
    this.from = { ...this.from, parts: partsOf };
    this.build();
  }

  /**
   * Draws the drawings with parts of this scene that show a solid, as the emphasis and a drag leave
   * them: `hidden` is what neither draws, `dimmed` what the emphasis draws faintly, and `hiddenParts`
   * the anchored parts a filter or isolation hides, which the pictures are drawn again without.
   */
  setScene(
    scene: Scene | undefined,
    hidden: ReadonlySet<string>,
    dimmed: ReadonlySet<string>,
    hiddenParts: ReadonlySet<string> = hidden,
  ): void {
    const from = this.from;
    if (
      from.scene === scene &&
      from.hidden === hidden &&
      from.dimmed === dimmed &&
      this.hiddenParts === hiddenParts
    ) {
      return;
    }
    this.from = { ...from, scene, hidden, dimmed };
    this.hiddenParts = hiddenParts;
    this.build();
  }

  /** Marks the selection, the hovered shape and what the emphasis highlights on parts. */
  setMarks(marks: SolidMarks): void {
    if (
      marks.selected === this.marks.selected &&
      marks.hovered === this.marks.hovered &&
      marks.highlighted === this.marks.highlighted
    ) {
      return;
    }
    this.marks = marks;
    for (const entry of this.entries) this.restate(entry);
    this.drawRings();
    this.changed();
  }

  /** Draws in a theme's fills and marks from now on, in the frame the switch shows. */
  setTheme(theme: ThemeName, colors: SolidLayerColors): void {
    if (theme === this.theme && colors.selected === this.colors.selected) return;
    this.theme = theme;
    this.colors = colors;
    for (const entry of this.entries) this.paint(entry);
    this.drawRings();
  }

  setScale(scale: number): void {
    if (scale === this.scale) return;
    this.scale = scale;
    this.drawRings();
  }

  /** Shows the shape being turned with its newest frame, or none once turning ends. */
  setTurning(turning: SolidTurningShown | undefined): void {
    const before = this.turning;
    this.turning = turning;
    if (before?.key !== turning?.key) this.build();
    else this.changed();
  }

  /**
   * The part buffer a shape draws now, and where, for pointing: none when its picture does not show
   * at this scale, or has not arrived.
   */
  placedBuffer(key: string): PlacedPartBuffer | undefined {
    const entry = this.turningEntry(key) ?? this.byKey.get(key);
    const buffer = entry?.shown?.buffer;
    if (!entry || !entry.visible || !buffer) return undefined;
    return { buffer, rect: entry.solid.rect };
  }

  /** The named parts of the solid a shape draws, and its anchored parts by index, for pointing. */
  partsAt(
    key: string,
  ): { parts: readonly SolidPart[]; anchored: ReadonlyMap<number, ElementShape> } | undefined {
    const entry = this.turningEntry(key) ?? this.byKey.get(key);
    return entry && { parts: entry.parts, anchored: entry.anchored };
  }

  /**
   * Draws this frame: the pictures the image store has for each drawing on screen, as its scale
   * shows it, and the newest turning frame. Says whether it waits for a picture.
   */
  frame(view: SolidLayerView): boolean {
    const pictures = this.pictures();
    const side = Math.max(view.shown.width, view.shown.height);
    const reach = {
      x: view.shown.x - side / 2,
      y: view.shown.y - side / 2,
      width: view.shown.width + side,
      height: view.shown.height + side,
    };
    const middle = {
      x: view.shown.x + view.shown.width / 2,
      y: view.shown.y + view.shown.height / 2,
    };
    const keys: string[] = [];
    let waiting = false;
    let ringsChanged = false;
    for (const entry of this.entries) {
      const { solid } = entry;
      const shows =
        (entry.turned || pictureShows(entry.shape, view.scale).shows) && meets(solid.rect, reach);
      if (!shows) {
        ringsChanged ||= this.show(entry, false);
        continue;
      }
      if (entry.turned && this.turning?.frame) {
        this.showFrame(entry, this.turning.frame);
        ringsChanged ||= this.show(entry, true);
        continue;
      }
      if (!pictures) {
        ringsChanged ||= this.show(entry, false);
        continue;
      }
      const asked =
        entry.states.hidden.length > 0
          ? withHiddenParts(entry.shape, entry.states.hidden)
          : entry.shape;
      const rect = solid.rect;
      const pixels = Math.max(rect.width, rect.height) * view.scale * view.resolution;
      const distance = Math.hypot(
        rect.x + rect.width / 2 - middle.x,
        rect.y + rect.height / 2 - middle.y,
      );
      const made = pictures.texture(asked, pixels, distance, SOLID_LAYER, view.settled);
      // Its texture waits for the store when the client has its picture: a frame makes it.
      if (
        made
          ? made.key !== readyTextureKey(made.picture.serial)
          : pictures.pictureOf(asked, pixels) !== undefined
      ) {
        waiting = true;
      }
      if (made && entry.shown?.key !== made.key) {
        entry.shown = {
          texture: made.texture,
          key: made.key,
          buffer: made.picture.partBuffer,
        };
        this.paint(entry);
      }
      // The old picture shows until the new one arrives.
      if (entry.shown?.key !== undefined) keys.push(entry.shown.key);
      ringsChanged ||= this.show(entry, entry.shown !== undefined);
    }
    pictures?.flush();
    pictures?.store.use(SOLID_LAYER, keys);
    if (ringsChanged) this.drawRings();
    return waiting;
  }

  /** Lets go of what it drew, as when the store let every texture go. */
  reset(): void {
    for (const entry of this.entries) delete entry.shown;
    this.build();
  }

  destroy(): void {
    this.pictures()?.store.release(SOLID_LAYER);
    for (const entry of this.entries) this.dispose(entry);
    this.turningTexture?.texture.destroy(true);
    this.turningTexture = undefined;
    this.entries = [];
    if (!this.container.destroyed) this.container.destroy({ children: true });
  }

  // Building ----------------------------------------------------------------------------------------

  private turningEntry(key: string): Entry | undefined {
    if (this.turning?.key !== key) return undefined;
    return this.entries.find((entry) => entry.turned && entry.shape.key === key);
  }

  private build(): void {
    const { scene, hidden, dimmed } = this.from as {
      scene: Scene | undefined;
      hidden: ReadonlySet<string> | undefined;
      dimmed: ReadonlySet<string> | undefined;
    };
    const kept = new Map<string, Entry>();
    for (const entry of this.entries)
      kept.set(`${entry.turned ? 't' : 'd'}${entry.shape.key}`, entry);
    const next: Entry[] = [];
    if (scene) {
      const byKey = new Map<string, ElementShape>();
      for (const shape of scene.shapes) byKey.set(shape.key, shape);
      const contents = new Map<string, ElementShape[]>();
      for (const shape of scene.shapes) {
        if (shape.part?.solid === undefined || !shape.part.inDrawing) continue;
        if (shape.containerShape === undefined) continue;
        const list = contents.get(shape.containerShape) ?? [];
        list.push(shape);
        contents.set(shape.containerShape, list);
      }
      for (const shape of scene.shapes) {
        const { solid } = shape;
        if (!solid || solid.placeholder) continue;
        const turned = this.turning?.key === shape.key;
        const drawing = solid.placement === 'parts' && shape.picture !== undefined;
        if (!drawing && !turned) continue;
        if (hidden?.has(shape.key) && !turned) continue;
        const parts = this.partsOf(solid.id) ?? [];
        const holder =
          shape.containerShape === undefined ? undefined : byKey.get(shape.containerShape);
        const entry = this.entryFor(kept.get(`${turned ? 't' : 'd'}${shape.key}`), {
          shape,
          solid,
          holder,
          parts,
          anchored: anchoredByIndex(contents.get(shape.key) ?? []),
          faint: dimmed?.has(shape.key) === true,
          turned,
        });
        kept.delete(`${turned ? 't' : 'd'}${shape.key}`);
        next.push(entry);
      }
    }
    for (const gone of kept.values()) this.dispose(gone);
    this.entries = next;
    this.byKey = new Map(
      next.filter((entry) => !entry.turned).map((each) => [each.shape.key, each]),
    );
    // Turned last, over the rest.
    this.container.removeChildren();
    for (const entry of [
      ...next.filter((each) => !each.turned),
      ...next.filter((each) => each.turned),
    ]) {
      if (entry.mesh) this.container.addChild(entry.mesh);
    }
    this.container.addChild(this.rings);
    this.drawRings();
    this.changed();
  }

  private entryFor(
    known: Entry | undefined,
    fields: Pick<Entry, 'shape' | 'solid' | 'holder' | 'parts' | 'anchored' | 'faint' | 'turned'>,
  ): Entry {
    const entry: Entry = known ?? {
      ...fields,
      states: partStatesOf([], new Map()),
      visible: false,
    };
    // A picture shown for another key, or another place, is asked for again.
    if (
      known &&
      (known.solid.rect !== fields.solid.rect || known.solid.hash !== fields.solid.hash)
    ) {
      delete entry.shown;
    }
    Object.assign(entry, fields);
    this.restate(entry);
    if (!entry.mesh) this.makeMesh(entry);
    else this.place(entry);
    this.paint(entry);
    return entry;
  }

  /**
   * A drawing's part states as an image of the canvas draws them (ADR 0075): as the emphasis and the
   * overlays leave them, without the marks of the selection, hover or highlights, which no image
   * draws. None for a shape the layer does not draw.
   */
  imageStates(key: string): PartStates | undefined {
    const entry = this.byKey.get(key);
    return entry && this.statesOf(entry, NO_MARKS);
  }

  /** Works out a drawing's part states from what the canvas marks. */
  private restate(entry: Entry): void {
    if (entry.turned && entry.solid.placement !== 'parts') {
      entry.states = partStatesOf([], new Map());
      return;
    }
    const states = this.statesOf(entry, this.marks);
    if (sameTable(entry.states, states) && entry.states.hidden.length === states.hidden.length) {
      return;
    }
    entry.states = states;
    if (entry.mesh) this.paint(entry);
  }

  /** A drawing's part states with these marks, as the emphasis and the overlays leave them. */
  private statesOf(entry: Entry, marks: SolidMarks): PartStates {
    const { selected, hovered, highlighted } = marks;
    const dimmed = this.from.dimmed as ReadonlySet<string> | undefined;
    const elements = new Map<number, PartElementState>();
    for (const [index, shape] of entry.anchored) {
      const look = overlayLookOfPart(shape);
      const state: PartElementState = {};
      if (selected.has(shape.element)) state.selected = true;
      if (hovered === shape.key) state.hovered = true;
      if (highlighted.has(shape.key)) state.highlighted = true;
      if (dimmed?.has(shape.key)) state.faint = true;
      if (this.hiddenParts.has(shape.key)) state.hidden = true;
      if (look?.fill !== undefined) state.fill = look.fill;
      if (look?.opacity !== undefined && look.opacity < 1) state.opacity = look.opacity;
      elements.set(index, state);
    }
    return partStatesOf(entry.parts, elements, entry.faint);
  }

  // Drawing -----------------------------------------------------------------------------------------

  private makeMesh(entry: Entry): void {
    const uniforms = new UniformGroup({
      uFrame: { value: new Float32Array([0, 0, 1, 1]), type: 'vec4<f32>' },
      uPartsSize: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
      uStatesSize: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
      uBackdrop: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
      uSelected: { value: new Float32Array(3), type: 'vec3<f32>' },
      uSelectedCasing: { value: new Float32Array(3), type: 'vec3<f32>' },
      uHighlight: { value: new Float32Array(3), type: 'vec3<f32>' },
      uHighlightCasing: { value: new Float32Array(3), type: 'vec3<f32>' },
      uScale: { value: 1, type: 'f32' },
      uMarks: { value: 0, type: 'f32' },
      uAlpha: { value: 1, type: 'f32' },
    });
    const parts = partsTextureOf(NO_PARTS);
    const states = statesTextureOf(entry.states);
    const shader = Shader.from({
      gl: { vertex: PART_VERTEX, fragment: PART_FRAGMENT, name: 'solid-parts' },
      resources: {
        uPicture: Texture.WHITE.source,
        uParts: parts.source,
        uStates: states.source,
        partUniforms: uniforms,
      },
    });
    const mesh = new Mesh({ geometry: quadOf(entry.solid.rect), shader });
    mesh.visible = false;
    entry.mesh = mesh;
    entry.uniforms = uniforms;
    entry.partsTexture = { buffer: NO_PARTS, texture: parts };
    entry.statesTexture = { states: entry.states, texture: states };
  }

  private place(entry: Entry): void {
    const mesh = entry.mesh;
    if (!mesh) return;
    const positions = positionsOf(entry.solid.rect);
    const geometry = mesh.geometry;
    const at = geometry.positions;
    if (at.length !== positions.length || at.some((value, index) => value !== positions[index])) {
      geometry.positions = positions;
    }
  }

  /** Gives a shape's shader its textures, its table and its colors. */
  private paint(entry: Entry): void {
    const { mesh, uniforms } = entry;
    if (!mesh || !uniforms) return;
    const shader = mesh.shader as Shader;
    const shown = entry.shown;
    if (shown) {
      const source = shown.texture.source;
      shader.resources.uPicture = source;
      const frame = shown.texture.frame;
      const width = source.width || 1;
      const height = source.height || 1;
      const value = uniforms.uniforms.uFrame as Float32Array;
      value.set([frame.x / width, frame.y / height, frame.width / width, frame.height / height]);
    }
    const buffer = shown?.buffer ?? NO_PARTS;
    if (entry.partsTexture?.buffer !== buffer) {
      entry.partsTexture?.texture.destroy(true);
      const texture = partsTextureOf(buffer);
      entry.partsTexture = { buffer, texture };
      shader.resources.uParts = texture.source;
    }
    (uniforms.uniforms.uPartsSize as Float32Array).set([buffer.width, buffer.height]);
    if (entry.statesTexture?.states !== entry.states) {
      const known = entry.statesTexture;
      if (
        known &&
        known.states.width === entry.states.width &&
        known.states.height === entry.states.height
      ) {
        const source = known.texture.source as BufferImageSource;
        source.resource = entry.states.table;
        source.update();
        known.states = entry.states;
      } else {
        known?.texture.destroy(true);
        const texture = statesTextureOf(entry.states);
        entry.statesTexture = { states: entry.states, texture };
        shader.resources.uStates = texture.source;
      }
    }
    (uniforms.uniforms.uStatesSize as Float32Array).set([entry.states.width, entry.states.height]);
    (uniforms.uniforms.uBackdrop as Float32Array).set(unit(this.backdropOf(entry)));
    const { selected, highlight } = this.colors;
    (uniforms.uniforms.uSelected as Float32Array).set(unit(selected));
    (uniforms.uniforms.uSelectedCasing as Float32Array).set(unit(casingFor(selected)));
    (uniforms.uniforms.uHighlight as Float32Array).set(unit(highlight));
    (uniforms.uniforms.uHighlightCasing as Float32Array).set(unit(casingFor(highlight)));
    uniforms.uniforms.uMarks = entry.states.parts.some(
      (part) => !part.hidden && (part.selected || part.hovered || part.highlighted),
    )
      ? 1
      : 0;
    uniforms.uniforms.uScale = buffer.width / Math.max(1e-6, entry.solid.rect.width * this.scale);
    uniforms.update();
  }

  /** The newest turning frame as a texture of its own, uploaded at most once a frame. */
  private showFrame(entry: Entry, frame: SolidFrameReply): void {
    const known = this.turningTexture;
    if (known?.bitmap !== frame.bitmap) {
      if (
        known &&
        known.texture.source.width === frame.width &&
        known.texture.source.height === frame.height
      ) {
        known.texture.source.resource = frame.bitmap;
        known.texture.source.update();
        known.bitmap = frame.bitmap;
      } else {
        known?.texture.destroy(true);
        const texture = new Texture({
          source: new ImageSource({ resource: frame.bitmap, scaleMode: 'linear' }),
        });
        this.turningTexture = { texture, bitmap: frame.bitmap };
      }
    }
    const texture = this.turningTexture?.texture;
    if (!texture) return;
    if (entry.shown?.texture !== texture || entry.shown.buffer !== frame.partBuffer) {
      entry.shown = { texture, buffer: frame.partBuffer };
    }
    this.paint(entry);
  }

  /** Shows or hides a shape's picture; says whether that changed which parts draw rings. */
  private show(entry: Entry, visible: boolean): boolean {
    if (entry.mesh && entry.mesh.visible !== visible) entry.mesh.visible = visible;
    if (entry.visible === visible) return false;
    entry.visible = visible;
    return true;
  }

  /** The drawing's fill, faded as the emphasis draws it, which shows behind its picture. */
  private backdropOf(entry: Entry): Color {
    const fill = shapeColors(entry.shape, this.theme).fill;
    if (!entry.faint) return fill;
    const behind = entry.holder
      ? shapeColors(entry.holder, this.theme).fill
      : CANVAS_BACKGROUNDS[this.theme];
    return fadedColor(fill, behind, DIMMED_ALPHA);
  }

  /** Rings around the points of the marked parts of drawings whose picture does not show. */
  private drawRings(): void {
    const rings = this.rings;
    rings.clear();
    const width = 2 / this.scale;
    let any = false;
    for (const entry of this.entries) {
      if (entry.visible || entry.turned) continue;
      entry.states.parts.forEach((state, index) => {
        if (state.hidden || !(state.selected || state.hovered || state.highlighted)) return;
        const shape = entry.anchored.get(index);
        const point = shape?.part?.point;
        if (!point) return;
        rings.circle(point.x, point.y, SOLID_POINT_RADIUS + 2 / this.scale);
        any = true;
      });
    }
    if (any) rings.stroke({ color: this.colors.selected, width });
  }

  private dispose(entry: Entry): void {
    entry.mesh?.destroy();
    entry.partsTexture?.texture.destroy(true);
    entry.statesTexture?.texture.destroy(true);
    delete entry.mesh;
  }
}

function positionsOf(rect: Rect): Float32Array {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return new Float32Array([rect.x, rect.y, right, rect.y, right, bottom, rect.x, bottom]);
}

function quadOf(rect: Rect): MeshGeometry {
  return new MeshGeometry({
    positions: positionsOf(rect),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
}

/** A part buffer as a texture: each pixel's number in its red and green bytes, read without smoothing. */
export function partBufferBytes(buffer: SolidPartBuffer): Uint8Array {
  const bytes = new Uint8Array(buffer.width * buffer.height * 4);
  const { data } = buffer;
  for (let at = 0; at < data.length; at++) {
    const value = data[at] ?? 0;
    bytes[at * 4] = value & 255;
    bytes[at * 4 + 1] = value >> 8;
    bytes[at * 4 + 3] = 255;
  }
  return bytes;
}

function partsTextureOf(buffer: SolidPartBuffer): Texture {
  return new Texture({
    source: new BufferImageSource({
      resource: partBufferBytes(buffer),
      width: buffer.width,
      height: buffer.height,
      format: 'rgba8unorm',
      scaleMode: 'nearest',
      autoGenerateMipmaps: false,
      alphaMode: 'no-premultiply-alpha',
    }),
  });
}

function statesTextureOf(states: PartStates): Texture {
  return new Texture({
    source: new BufferImageSource({
      resource: states.table,
      width: states.width,
      height: states.height,
      format: 'rgba8unorm',
      scaleMode: 'nearest',
      autoGenerateMipmaps: false,
      alphaMode: 'no-premultiply-alpha',
    }),
  });
}

/** A color's red, green and blue, from 0 to 1. */
function unit(color: Color): [number, number, number] {
  const value = Number.parseInt(color.slice(1, 7), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
