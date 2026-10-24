/**
 * The PixiJS side of the canvas area: one `Application` drawing one scene into a host element, kept
 * fitted to the host's size. It renders only when something changes, since the view is static in M0.
 *
 * `Application.init` is asynchronous, so the canvas can be destroyed before it is ready, as React's
 * StrictMode does on purpose; the Application is then destroyed as soon as its start finishes.
 */
import { Application } from 'pixi.js';
import { drawScene, type DrawnScene } from './draw';
import { fitTransform } from './geometry';
import { CANVAS_BACKGROUND } from './palette';
import type { Scene } from './scene';

/** The room kept free around the scene, in screen pixels. */
const FIT_MARGIN = 24;

type Status = 'starting' | 'ready' | 'failed' | 'destroyed';

export class SceneCanvas {
  private readonly app = new Application();
  private readonly host: HTMLElement;
  private readonly onFailure: (error: unknown) => void;
  private status: Status = 'starting';
  private scene: Scene | undefined;
  private drawn: DrawnScene | undefined;
  private observer: ResizeObserver | undefined;

  /** Starts a canvas in `host`; `onFailure` hears about it when the canvas cannot start. */
  constructor(host: HTMLElement, onFailure: (error: unknown) => void) {
    this.host = host;
    this.onFailure = onFailure;
    void this.start();
  }

  /** Draws this scene from now on, in place of the previous one. */
  show(scene: Scene): void {
    this.scene = scene;
    if (this.status === 'ready') this.draw();
  }

  /** Releases the Application and removes its canvas, now or as soon as its start finishes. */
  destroy(): void {
    if (this.status === 'ready') {
      this.observer?.disconnect();
      this.app.destroy(true, { children: true });
    }
    this.status = 'destroyed';
  }

  private async start(): Promise<void> {
    try {
      await this.app.init({
        preference: 'webgl',
        background: CANVAS_BACKGROUND,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        autoStart: false,
        width: Math.max(1, this.host.clientWidth),
        height: Math.max(1, this.host.clientHeight),
      });
    } catch (error) {
      if (this.status === 'destroyed') return;
      this.status = 'failed';
      this.onFailure(error);
      return;
    }
    if (this.status === 'destroyed') {
      this.app.destroy(true, { children: true });
      return;
    }
    this.status = 'ready';
    this.app.canvas.style.display = 'block';
    this.host.appendChild(this.app.canvas);
    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(this.host);
    this.draw();
  }

  /**
   * Replaces what is drawn with the current scene. A scene that cannot be drawn is reported like a
   * canvas that cannot start, so that the rest of the app keeps working.
   */
  private draw(): void {
    const previous = this.drawn;
    this.drawn = undefined;
    previous?.content.destroy({ children: true });
    try {
      if (this.scene) {
        this.drawn = drawScene(this.scene);
        this.app.stage.addChild(this.drawn.content);
      }
      this.fit();
    } catch (error) {
      this.onFailure(error);
    }
  }

  /** Sizes the renderer to the host, scales and centers the scene in it, and renders. */
  private fit(): void {
    if (this.status !== 'ready') return;
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    // A host with no size is not on screen; it is fitted when the observer sees it get a size.
    if (width === 0 || height === 0) return;
    const { renderer } = this.app;
    if (renderer.screen.width !== width || renderer.screen.height !== height) {
      renderer.resize(width, height);
    }
    if (this.drawn && this.scene) {
      const { scale, x, y } = fitTransform(this.scene.bounds, { width, height }, FIT_MARGIN);
      this.drawn.content.scale.set(scale);
      this.drawn.content.position.set(x, y);
      // Text is rasterized: draw it at the resolution it is shown at, so that it stays sharp.
      const resolution = Math.max(0.5, Math.ceil(renderer.resolution * scale * 4) / 4);
      for (const text of this.drawn.texts) {
        if (text.resolution !== resolution) text.resolution = resolution;
      }
    }
    this.app.render();
  }
}
