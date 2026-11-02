/**
 * The grid's dots as PixiJS draws them (ADR 0086, A5.6): each family's dots are quads of one mesh,
 * written straight into vertex buffers that are kept from one drawing to the next, white, tinted in
 * the theme's grid color and drawn at the family's alpha. A `Graphics` of thousands of rectangles
 * cost a path of shapes and their triangles each time the grid was drawn again, as a zoom does every
 * few frames, which took the dot grid over A3's 0.5 ms a frame at the median; writing eight numbers a
 * dot costs a few hundredths of that, and draws the same pixels, so snapping and the dots' places are
 * as before.
 */
import { Container, Mesh, MeshGeometry, Texture, type ColorSource } from 'pixi.js';

/** What dots are drawn into: a dot at a time, and each family's alpha once its dots are given. */
export interface DotSink {
  /** A dot: a rectangle, in the grid's own space. */
  dot(x: number, y: number, width: number, height: number): void;
  /** Closes the family of the dots given since the last, drawn at this alpha. */
  fill(alpha: number): void;
}

/** One family's mesh and how many dots its buffers hold and draw. */
interface Layer {
  mesh: Mesh<MeshGeometry>;
  geometry: MeshGeometry;
  /** How many dots its buffers have room for. */
  capacity: number;
  /** How many of them were drawn last; those after are folded to a point. */
  used: number;
}

/** How many dots a family's buffers have room for at first. */
const FIRST_CAPACITY = 256;

/** The grid's dots, a mesh for each family, in `container`. */
export class GridDots implements DotSink {
  readonly container = new Container({ label: 'grid dots' });
  private readonly layers: Layer[] = [];
  private tint: ColorSource = 0xffffff;
  /** The family being written, and how many of its dots are written. */
  private family = 0;
  private count = 0;
  /** How many dots were drawn in all, since `begin`. */
  drawn = 0;

  /** Starts drawing the dots again: what is not given until `end` draws nothing. */
  begin(): void {
    this.family = 0;
    this.count = 0;
    this.drawn = 0;
  }

  dot(x: number, y: number, width: number, height: number): void {
    const layer = this.room(this.family, this.count + 1);
    const positions = layer.geometry.positions;
    const at = this.count * 8;
    const right = x + width;
    const bottom = y + height;
    positions[at] = x;
    positions[at + 1] = y;
    positions[at + 2] = right;
    positions[at + 3] = y;
    positions[at + 4] = right;
    positions[at + 5] = bottom;
    positions[at + 6] = x;
    positions[at + 7] = bottom;
    this.count += 1;
  }

  fill(alpha: number): void {
    if (this.count === 0) return;
    const layer = this.room(this.family, this.count);
    this.close(layer, this.count);
    layer.mesh.alpha = alpha;
    layer.mesh.visible = true;
    this.drawn += this.count;
    this.family += 1;
    this.count = 0;
  }

  /** Ends a drawing: the families not drawn this time hide. */
  end(): void {
    this.count = 0;
    for (let at = this.family; at < this.layers.length; at++) {
      const layer = this.layers[at] as Layer;
      if (layer.used > 0) this.close(layer, 0);
      layer.mesh.visible = false;
    }
  }

  /** Hides every dot. */
  clear(): void {
    this.begin();
    this.end();
  }

  /** Tints the dots, which are white: a theme switch only retints them. */
  setTint(tint: ColorSource): void {
    this.tint = tint;
    for (const { mesh } of this.layers) mesh.tint = tint;
  }

  /** How many dots each family drew last, for tests. */
  get families(): { count: number; alpha: number; positions: Float32Array }[] {
    return this.layers
      .filter((layer) => layer.mesh.visible)
      .map((layer) => ({
        count: layer.used,
        alpha: layer.mesh.alpha,
        positions: layer.geometry.positions.subarray(0, layer.used * 8),
      }));
  }

  /** The layer of a family, with room for `dots` dots, made or grown as it needs. */
  private room(family: number, dots: number): Layer {
    let layer = this.layers[family];
    if (!layer) {
      layer = makeLayer(FIRST_CAPACITY, this.tint);
      this.layers.push(layer);
      this.container.addChild(layer.mesh);
    }
    if (dots > layer.capacity) {
      const capacity = Math.max(dots, layer.capacity * 2);
      const positions = new Float32Array(capacity * 8);
      positions.set(layer.geometry.positions);
      layer.geometry.positions = positions;
      layer.geometry.uvs = new Float32Array(capacity * 8);
      layer.geometry.indices = quadIndices(capacity);
      layer.capacity = capacity;
      // Every dot past those drawn is folded to a point until drawn.
      layer.used = capacity;
    }
    return layer;
  }

  /**
   * Draws the first `count` dots of a layer: those past them, up to the last drawing's, are folded
   * to a point, so that they draw nothing, and only what changed of the buffer is sent again: a
   * family's buffer keeps the room its most dots needed, far more than the whole view draws.
   */
  private close(layer: Layer, count: number): void {
    const positions = layer.geometry.positions;
    const changed = Math.max(layer.used, count);
    if (layer.used > count) positions.fill(0, count * 8, layer.used * 8);
    layer.used = count;
    layer.geometry.getBuffer('aPosition').update(changed * 8 * Float32Array.BYTES_PER_ELEMENT);
  }
}

function makeLayer(capacity: number, tint: ColorSource): Layer {
  const geometry = new MeshGeometry({
    positions: new Float32Array(capacity * 8),
    uvs: new Float32Array(capacity * 8),
    indices: quadIndices(capacity),
  });
  // Never batched: its buffers are its own, sent again only when the grid is drawn again.
  geometry.batchMode = 'no-batch';
  const mesh = new Mesh({ geometry, texture: Texture.WHITE });
  mesh.tint = tint;
  mesh.visible = false;
  return { mesh, geometry, capacity, used: 0 };
}

/** Two triangles for each of `count` quads, their corners in order around them. */
function quadIndices(count: number): Uint32Array {
  const indices = new Uint32Array(count * 6);
  for (let quad = 0; quad < count; quad++) {
    const corner = quad * 4;
    const at = quad * 6;
    indices[at] = corner;
    indices[at + 1] = corner + 1;
    indices[at + 2] = corner + 2;
    indices[at + 3] = corner;
    indices[at + 4] = corner + 2;
    indices[at + 5] = corner + 3;
  }
  return indices;
}
