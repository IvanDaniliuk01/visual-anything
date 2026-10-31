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
 */
import {
  DirectionalLight,
  NearestFilter,
  NeutralToneMapping,
  NoBlending,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
  type Side,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SOLID_BUCKETS, type SolidPartBuffer, type SolidView } from '../protocol';
import type { BuiltSolid } from './build';
import type { DrawnPicture, SolidGpu } from './host';
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

/** The worker's GPU, on a canvas of its own; throws when there is no WebGL to draw with. */
export function createThreeGpu(canvas: OffscreenCanvas): SolidGpu {
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

  const listeners: ((state: 'lost' | 'restored') => void)[] = [];
  let lost = false;
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
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
  };
}
