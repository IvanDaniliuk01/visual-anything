/**
 * Turning on the canvas (ADR 0075): one solid at a time, the selected shape's, drawn live by the
 * solid worker in its shape, with one `turn/*` session.
 *
 * - **Starting.** From the turn handle, shown on a selected shape whose picture is at least 96 pixels
 *   across, from the shape menu, or with T.
 * - **Turning.** Dragging over the picture turns the solid, the wheel over it zooms it rather than the
 *   canvas, and the keys turn and zoom it (`turning.ts`); each change sends the worker the camera,
 *   whose frames the canvas shows as they come. Where it is seen from is announced after each key, and
 *   once a drag ends.
 * - **Ending.** Escape, or selecting something else, ends turning, and the shape's picture comes back.
 *   Turning changes nothing stored: Use this view keeps the camera, in one undoable action.
 * - **Play.** A solid with animations offers Play while it turns, which plays the first in its
 *   frames, looping, until paused or turning ends; never under reduced motion, where nothing turns on
 *   its own and Play is not offered.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { SolidCamera, SolidDefinition } from '@visual-anything/schema';
import { t } from '../../i18n';
import type { SolidClient, SolidTurning } from '../../solids/client';
import type { SolidFrameReply } from '../../solids/protocol';
import type { Point, Rect } from '../geometry';
import type { ElementShape } from '../scene';
import {
  TURN_HANDLE_FROM,
  sameTurnCamera,
  turnAnnouncement,
  turnKey,
  turnedByDrag,
  zoomedByWheel,
} from './turning';
import { commandForThisView } from './useThisView';

/** What turning needs of the canvas around it. */
export interface TurnerHost {
  client(): SolidClient | undefined;
  /** The solid a package defines, by its id. */
  definition(id: string): SolidDefinition | undefined;
  project(): ProjectSnapshot | undefined;
  /** The scale the canvas is drawn at, and its device pixels to a screen pixel. */
  scale(): number;
  resolution(): number;
  /** Shows the shape turned with its newest frame, or nothing once turning ends. */
  show(turning: { key: string; frame: SolidFrameReply | undefined } | undefined): void;
  announce(text: string): void;
  command(command: Command): Promise<boolean>;
  reducedMotion(): boolean;
}

/** A turning under way. */
interface Turning {
  key: string;
  element: string;
  name: string;
  solid: string;
  /** The camera it started from, which 0 goes back to, and the one it has now. */
  start: SolidCamera;
  camera: SolidCamera;
  session: SolidTurning;
  playing: boolean;
  /** A drag under way: where it started on screen, and the camera then. */
  drag?: { from: Point; camera: SolidCamera };
}

/** The largest side a turning frame is drawn at. */
const LARGEST_FRAME = 2048;

/** Turning on one canvas. */
export class SolidTurner {
  private turning: Turning | undefined;

  constructor(private readonly host: TurnerHost) {}

  /** The shape turned now, by its key, if any. */
  get turned(): { key: string; element: string; camera: SolidCamera } | undefined {
    const turning = this.turning;
    return turning && { key: turning.key, element: turning.element, camera: turning.camera };
  }

  /** Whether a shape's solid can be turned: it shows one whose file can be drawn. */
  canTurn(shape: ElementShape | undefined): boolean {
    const solid = shape?.solid;
    const client = this.host.client();
    if (!solid || solid.placeholder || !client || client.unavailable) return false;
    return client.problem(solid.hash) === undefined;
  }

  /**
   * Where a selected shape's turn handle shows: at the top right of its picture, while that is at least
   * 96 pixels across on screen; none otherwise, or while it turns.
   */
  handleOf(shape: ElementShape | undefined): Point | undefined {
    if (!shape || !this.canTurn(shape) || this.turning?.key === shape.key) return undefined;
    const rect = shape.solid?.rect as Rect;
    const scale = this.host.scale();
    if (Math.min(rect.width, rect.height) * scale < TURN_HANDLE_FROM) return undefined;
    const inset = 12 / scale;
    return { x: rect.x + rect.width - inset, y: rect.y + inset };
  }

  /** How many animations the turned solid has that Play offers: none under reduced motion. */
  get animations(): number {
    const turning = this.turning;
    if (!turning || this.host.reducedMotion()) return 0;
    return this.host.definition(turning.solid)?.animations?.length ?? 0;
  }

  /** Whether the turned solid plays its animation now. */
  get playing(): boolean {
    return this.turning?.playing === true;
  }

  /** Starts turning a shape's solid; another turning ends first. Says whether it started. */
  start(shape: ElementShape): boolean {
    if (this.turning?.key === shape.key) return true;
    this.end(false);
    const client = this.host.client();
    const solid = shape.solid;
    if (!client || !solid || !this.canTurn(shape)) return false;
    const camera = solid.camera;
    const turning: Turning = {
      key: shape.key,
      element: shape.element,
      name: shape.name,
      solid: solid.id,
      start: camera,
      camera,
      playing: false,
      session: client.turn(
        {
          solid: solid.hash,
          size: this.frameSize(solid.rect),
          camera,
          lighting: solid.lighting,
          hidden: solid.hidden ?? [],
          parts: solid.placement === 'parts',
          ...(solid.only === undefined ? {} : { only: solid.only }),
        },
        (frame) => {
          if (this.turning === turning) this.host.show({ key: turning.key, frame });
        },
      ),
    };
    this.turning = turning;
    this.host.show({ key: shape.key, frame: undefined });
    this.host.announce(
      `${turnAnnouncement(shape.name, camera)}. ${t(
        'Drag or use the arrow keys to turn it, + and − to zoom, 0 to go back, and Escape to stop.',
      )}`,
    );
    return true;
  }

  /** Ends turning; the shape's picture comes back. */
  end(announce = true): void {
    const turning = this.turning;
    if (!turning) return;
    this.turning = undefined;
    turning.session.end();
    this.host.show(undefined);
    if (announce) this.host.announce(t('Stopped turning {name}.', { name: turning.name }));
  }

  /** Follows the scene: turning ends when its shape is gone, or no longer shows its solid. */
  follow(byKey: ReadonlyMap<string, ElementShape>): void {
    const turning = this.turning;
    if (!turning) return;
    const shape = byKey.get(turning.key);
    if (!shape?.solid || shape.solid.id !== turning.solid || shape.solid.placeholder) this.end();
  }

  /** Ends turning when the selection no longer holds the turned shape's element alone. */
  selectionChanged(elements: ReadonlySet<string>): void {
    const turning = this.turning;
    if (!turning) return;
    if (elements.size !== 1 || !elements.has(turning.element)) this.end();
  }

  /** Handles a key while a solid turns; says whether it did. */
  key(event: {
    key: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    preventDefault(): void;
  }): boolean {
    const turning = this.turning;
    if (!turning) return false;
    const done = turnKey(event, turning.camera, turning.start);
    if (done.kind === 'none') return false;
    event.preventDefault();
    if (done.kind === 'end') {
      this.end();
      return true;
    }
    // Under reduced motion as always: a key cuts to the view it asks for.
    this.setCamera(done.camera);
    this.host.announce(turnAnnouncement(turning.name, turning.camera));
    return true;
  }

  /** A press on the turned shape's picture starts a drag that turns it; says whether it did. */
  press(world: Point, screen: Point, shape: ElementShape | undefined): boolean {
    const turning = this.turning;
    if (!turning || shape?.key !== turning.key || !shape.solid) return false;
    const { rect } = shape.solid;
    const inside =
      world.x >= rect.x &&
      world.y >= rect.y &&
      world.x <= rect.x + rect.width &&
      world.y <= rect.y + rect.height;
    if (!inside) return false;
    turning.drag = { from: screen, camera: turning.camera };
    return true;
  }

  /** The pointer moved while dragging over the turned picture, `width` screen pixels across. */
  move(screen: Point, width: number): void {
    const turning = this.turning;
    const drag = turning?.drag;
    if (!turning || !drag) return;
    this.setCamera(
      turnedByDrag(drag.camera, screen.x - drag.from.x, screen.y - drag.from.y, width),
    );
  }

  /** The drag ended: where the solid is seen from is said once. */
  release(): void {
    const turning = this.turning;
    if (!turning?.drag) return;
    delete turning.drag;
    this.host.announce(turnAnnouncement(turning.name, turning.camera));
  }

  /** The wheel over the turned picture zooms it rather than the canvas; says whether it did. */
  wheel(world: Point, deltaY: number, shape: ElementShape | undefined): boolean {
    const turning = this.turning;
    const rect = shape?.key === turning?.key ? shape?.solid?.rect : undefined;
    if (!turning || !rect) return false;
    const inside =
      world.x >= rect.x &&
      world.y >= rect.y &&
      world.x <= rect.x + rect.width &&
      world.y <= rect.y + rect.height;
    if (!inside) return false;
    this.setCamera(zoomedByWheel(turning.camera, deltaY));
    return true;
  }

  /** Plays the turned solid's first animation, or pauses it; never under reduced motion. */
  play(on: boolean): void {
    const turning = this.turning;
    if (!turning || (on && this.animations === 0)) return;
    turning.playing = on;
    turning.session.play(on ? 0 : null);
  }

  /** Use this view: keeps the turned solid's camera, in one action. Says whether one was sent. */
  async useThisView(): Promise<boolean> {
    const turning = this.turning;
    const project = this.host.project();
    if (!turning || !project) return false;
    const command = commandForThisView(project, turning.element, turning.solid, turning.camera);
    if (!command) return false;
    const done = await this.host.command(command);
    if (done && this.turning === turning) {
      // The camera kept is where it now starts from.
      turning.start = turning.camera;
      this.host.announce(t('Kept this view of {name}.', { name: turning.name }));
    }
    return done;
  }

  /** The turned shape's frames are drawn at this size from now on. */
  resize(shape: ElementShape): void {
    const turning = this.turning;
    if (!turning || shape.key !== turning.key || !shape.solid) return;
    turning.session.camera(turning.camera, this.frameSize(shape.solid.rect));
  }

  private setCamera(camera: SolidCamera): void {
    const turning = this.turning;
    if (!turning || sameTurnCamera(camera, turning.camera)) return;
    turning.camera = camera;
    turning.session.camera(camera);
  }

  /** A frame's size: the picture's place on screen in device pixels, its longer side at most 2,048. */
  private frameSize(rect: Rect): { width: number; height: number } {
    const pixels = this.host.scale() * this.host.resolution();
    let width = Math.max(1, rect.width * pixels);
    let height = Math.max(1, rect.height * pixels);
    const most = Math.max(width, height);
    if (most > LARGEST_FRAME) {
      width = (width * LARGEST_FRAME) / most;
      height = (height * LARGEST_FRAME) / most;
    }
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
}
