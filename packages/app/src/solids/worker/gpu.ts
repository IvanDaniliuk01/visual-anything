/**
 * The solid worker's GPU (ADR 0075): one three.js renderer on one `OffscreenCanvas` of its own,
 * which draws every picture and every turning frame, so that a solid's geometry and textures sit on
 * the GPU once. Nothing here loads a file: studio lighting's environment is three.js's generated room,
 * made from boxes and lights.
 *
 * - **A picture** is drawn into the canvas with its background transparent and handed over with
 *   `transferToImageBitmap`. Studio lighting is the room's image-based light, a key light from above
 *   the camera's left and neutral tone mapping; flat lighting draws base colors without light.
 * - **Its part buffer** is drawn after it into a render target without smoothing, each piece in a
 *   material that writes its part's index plus one and nothing else, without light, then read back.
 *   Pieces of no part write 0 and still hide what lies behind them.
 * - **A lost context** is followed: three.js gets it back and uploads again what it draws next, the
 *   room's light is made again, and the host is told both times.
 * - **A space** (ADR 0076) is drawn from its scene (`space/scene.ts`), placed relative to its
 *   camera's target, in three passes and a fourth on a 2D canvas: the bits of what is marked, into a
 *   render target without smoothing; the solids, markers and ground, lit as studio, the cut and
 *   explosion as the scene has them; the marks along the edges of what is marked
 *   (`space/marks.ts`); then relation lines, names, the ground's scale and the handles, facing the
 *   screen (`space/overlay.ts`). Picks are answered from the layout the frame was drawn from.
 */
import type { Color } from '@visual-anything/schema';
import {
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  Mesh,
  NearestFilter,
  NeutralToneMapping,
  NoBlending,
  NormalBlending,
  OrthographicCamera,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Side,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { rgbOf } from '../../canvas/solids/states';
import { SOLID_BUCKETS, type SolidPartBuffer, type SolidView } from '../protocol';
import type { BuiltSolid } from './build';
import type { DrawnPicture, SolidGpu, SpaceGpu, SpaceToDraw } from './host';
import { SpaceDrawings } from './space/drawings';
import { MARKS_FRAGMENT, MARKS_VERTEX, markColorsOf } from './space/marks';
import { overlayFont, overlayOf, paintOverlay } from './space/overlay';
import { keyLightPosition, partBufferFrom, partBytes, stageView } from './stage';

/** The key light's strength, beside the room's light. */
const KEY_LIGHT = 1.6;

const PART_VERTEX = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const PART_FRAGMENT = /* glsl */ `
uniform vec2 part;
void main() {
  gl_FragColor = vec4(part, 0.0, 1.0);
}`;

/** The largest bucket at most `pixels`, or none below the smallest. */
function largestBucket(pixels: number): number | undefined {
  return [...SOLID_BUCKETS].reverse().find((bucket) => bucket <= pixels);
}

/**
 * The worker's GPU, on a canvas of its own, which draws solids' pictures and spaces alike; throws when
 * there is no WebGL to draw with.
 */
export function createThreeGpu(canvas: OffscreenCanvas): SolidGpu & SpaceGpu {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'default',
  });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  const gl = renderer.getContext();
  const largest = largestBucket(
    Math.min(
      renderer.capabilities.maxTextureSize,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
      ...(gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array),
    ),
  );
  if (largest === undefined) throw new Error('The GPU draws too small a picture.');

  const scene = new Scene();
  const key = new DirectionalLight(0xffffff, KEY_LIGHT);
  scene.add(key, key.target);
  let environment: Texture | undefined;
  const roomLight = (): Texture => {
    if (environment) return environment;
    const generator = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    environment = generator.fromScene(room, 0.04).texture;
    room.dispose();
    generator.dispose();
    return environment;
  };

  const target = new WebGLRenderTarget(1, 1, {
    type: UnsignedByteType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
    samples: 0,
  });
  let pixels = new Uint8Array(4);
  const partMaterials = new Map<string, ShaderMaterial>();
  const partMaterial = (part: number, side: Side): ShaderMaterial => {
    const known = partMaterials.get(`${part}:${side}`);
    if (known) return known;
    const [high, low] = partBytes(part);
    const material = new ShaderMaterial({
      uniforms: { part: { value: new Vector2(high / 255, low / 255) } },
      vertexShader: PART_VERTEX,
      fragmentShader: PART_FRAGMENT,
      side,
      blending: NoBlending,
      transparent: false,
      depthTest: true,
      depthWrite: true,
    });
    partMaterials.set(`${part}:${side}`, material);
    return material;
  };

  // Spaces: their scenes, the bits of what is marked, the marks' pass and the 2D canvas over them.
  const drawings = new SpaceDrawings();
  const bitsTarget = new WebGLRenderTarget(1, 1, {
    type: UnsignedByteType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
    samples: 0,
  });
  const marksMaterial = new ShaderMaterial({
    uniforms: {
      bitsPass: { value: bitsTarget.texture },
      size: { value: new Vector2(1, 1) },
      selected: { value: new Vector3() },
      selectedCasing: { value: new Vector3() },
      highlight: { value: new Vector3() },
      highlightCasing: { value: new Vector3() },
      scale: { value: 1 },
    },
    vertexShader: MARKS_VERTEX,
    fragmentShader: MARKS_FRAGMENT,
    transparent: true,
    blending: NormalBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const fullFrame = new BufferGeometry();
  fullFrame.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const marksScene = new Scene();
  const marksQuad = new Mesh(fullFrame, marksMaterial);
  marksQuad.frustumCulled = false;
  marksScene.add(marksQuad);
  const marksCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let overlay: OffscreenCanvas | undefined;
  const overlayContext = (width: number, height: number) => {
    overlay ??= new OffscreenCanvas(width, height);
    if (overlay.width !== width) overlay.width = width;
    if (overlay.height !== height) overlay.height = height;
    const context = overlay.getContext('2d');
    if (!context) throw new Error('The worker has no 2D canvas to write names on.');
    return context;
  };
  /** A color as three numbers from 0 to 1, as written: the marks' pass writes them unconverted. */
  const rgb = (color: Color) => {
    const [r, g, b] = rgbOf(color);
    return new Vector3(r / 255, g / 255, b / 255);
  };

  const listeners: ((state: 'lost' | 'restored') => void)[] = [];
  let lost = false;
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    // The spaces' scenes are made again from what the host still holds once it is back.
    drawings.clear();
    for (const listener of listeners) listener('lost');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    // What the GPU held is gone: the room's light is made again when next drawn.
    environment?.dispose();
    environment = undefined;
    for (const listener of listeners) listener('restored');
  });

  const partPass = (solid: BuiltSolid, view: SolidView, staged: ReturnType<typeof stageView>) => {
    const { width, height } = view.size;
    target.setSize(width, height);
    for (const piece of staged.drawn) piece.mesh.material = partMaterial(piece.part, piece.side);
    scene.environment = null;
    key.visible = false;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, staged.camera);
    if (pixels.length < width * height * 4) pixels = new Uint8Array(width * height * 4);
    const read = pixels.subarray(0, width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, read);
    renderer.setRenderTarget(null);
    const buffer: SolidPartBuffer = {
      width,
      height,
      data: partBufferFrom(read, width, height, solid.description.parts.length),
    };
    return buffer;
  };

  return {
    largestPicture: largest,
    get lost() {
      return lost || gl.isContextLost();
    },
    onContext(listener) {
      listeners.push(listener);
    },
    forget(solid) {
      scene.remove(solid.root);
      drawings.forget(solid);
    },
    draw(solid, view): DrawnPicture {
      if (lost || gl.isContextLost()) throw new Error('The context is lost.');
      const staged = stageView(solid, view);
      const studio = view.lighting === 'studio';
      for (const piece of solid.pieces) piece.mesh.material = studio ? piece.studio : piece.flat;
      scene.add(solid.root);
      try {
        if (studio) {
          scene.environment = roomLight();
          key.visible = true;
          key.position.copy(keyLightPosition(staged.fitted));
          key.target.position.set(...staged.fitted.target);
          key.updateMatrixWorld();
          key.target.updateMatrixWorld();
        } else {
          scene.environment = null;
          key.visible = false;
        }
        renderer.setRenderTarget(null);
        renderer.setSize(view.size.width, view.size.height, false);
        renderer.clear();
        renderer.render(scene, staged.camera);
        if (gl.isContextLost()) throw new Error('The context was lost while drawing.');
        const bitmap = canvas.transferToImageBitmap();
        if (!view.parts) return { bitmap };
        const partBuffer = partPass(solid, view, staged);
        if (gl.isContextLost()) {
          bitmap.close();
          throw new Error('The context was lost while drawing.');
        }
        return { bitmap, partBuffer };
      } finally {
        scene.remove(solid.root);
      }
    },
    drawSpace(space: SpaceToDraw): ImageBitmap {
      if (lost || gl.isContextLost()) throw new Error('The context is lost.');
      const { width, height } = space.size;
      const drawn = drawings.sceneOf(space);
      const camera = drawn.place(space.camera, space.size, space.pixelRatio, space.cut);
      const clipping = renderer.localClippingEnabled;
      renderer.localClippingEnabled = space.cut !== undefined;
      renderer.setSize(width, height, false);
      try {
        // The bits of what is marked, for the marks' pass.
        if (drawn.marked) {
          bitsTarget.setSize(width, height);
          drawn.scene.environment = null;
          drawn.key.visible = false;
          renderer.setRenderTarget(bitsTarget);
          renderer.clear();
          drawn.withBits(() => renderer.render(drawn.scene, camera));
        }
        // The solids, markers and ground.
        renderer.setRenderTarget(null);
        drawn.scene.environment = roomLight();
        drawn.key.visible = true;
        renderer.clear();
        renderer.render(drawn.scene, camera);
        // The marks, over them.
        if (drawn.marked) {
          const colors = markColorsOf(space.theme);
          const uniforms = marksMaterial.uniforms as Record<string, { value: unknown }>;
          (uniforms.size?.value as Vector2).set(width, height);
          (uniforms.selected as { value: Vector3 }).value = rgb(colors.selected);
          (uniforms.selectedCasing as { value: Vector3 }).value = rgb(colors.selectedCasing);
          (uniforms.highlight as { value: Vector3 }).value = rgb(colors.highlight);
          (uniforms.highlightCasing as { value: Vector3 }).value = rgb(colors.highlightCasing);
          (uniforms.scale as { value: number }).value = space.pixelRatio;
          renderer.autoClear = false;
          try {
            renderer.render(marksScene, marksCamera);
          } finally {
            renderer.autoClear = true;
          }
        }
      } finally {
        renderer.setRenderTarget(null);
        renderer.localClippingEnabled = clipping;
      }
      if (gl.isContextLost()) throw new Error('The context was lost while drawing.');
      const picture = canvas.transferToImageBitmap();

      // What faces the screen, over the picture.
      let context: OffscreenCanvasRenderingContext2D;
      try {
        context = overlayContext(width, height);
      } catch (error) {
        picture.close();
        throw error;
      }
      const marks = overlayOf({
        layout: drawn.layout,
        camera: space.camera,
        size: space.size,
        pixelRatio: space.pixelRatio,
        theme: space.theme,
        names: space.names,
        lines: drawings.linesOf(space),
        cut: space.cut,
        handles: space.handles,
        measure: (text, size) => {
          context.font = overlayFont(size);
          return context.measureText(text).width;
        },
      });
      context.clearRect(0, 0, width, height);
      context.drawImage(picture, 0, 0);
      picture.close();
      paintOverlay(context, marks);
      return (overlay as OffscreenCanvas).transferToImageBitmap();
    },
    pickSpace(space: SpaceToDraw, x: number, y: number) {
      return drawings.pick(space, x, y);
    },
    endSpace(space: number) {
      drawings.end(space);
    },
  };
}
