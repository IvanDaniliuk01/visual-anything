/**
 * The spaces the worker's GPU draws (ADR 0076), each kept by its number with its placement, its
 * layout, its scene and its last picture, so that each change costs only what it changes:
 *
 * - **where things are** (`placeOut`) is worked out again when its entries, the solids loaded or the
 *   exploded view change;
 * - **how they look** (`layOut`) when that, their states or the solids drawn as boxes change;
 * - **the scene** follows a new layout in place, writing its tables of looks and its places, and is
 *   made again only when what it is made of changes (which solid each entry draws, which are
 *   markers), or the cut's axis or side, or the theme; a change of camera only places it again;
 * - **the picture** of its solids is drawn again only when the scene, the camera, the cut, the size or
 *   the pixel ratio changed: relation lines, names and handles alone are written again over the
 *   picture kept.
 *
 * A pick reads the same layout the frame was drawn from. Relation lines are drawn and picked with
 * their ends where the exploded view moves what they end on (`explodedLines`).
 */
import type { Id } from '@visual-anything/schema';
import type { BuiltSolid } from '../build';
import type { SpaceLine } from '../../protocol';
import type { SpacePicked, SpaceToDraw } from '../host';
import { explodedLines, layOut, placeOut, type PlacedLayout, type SpacePlacement } from './layout';
import { forgetMerged } from './merge';
import { pickInSpace } from './pick';
import { SpaceScene } from './scene';

/** A picture of a space's solids, which closes when let go of: an `ImageBitmap` in the worker. */
export interface KeptPicture {
  close(): void;
}

interface Kept {
  entries: SpaceToDraw['entries'];
  placementKey: string;
  placement: SpacePlacement;
  states: SpaceToDraw['states'];
  boxedKey: string;
  layout: PlacedLayout;
  sceneKey?: string;
  scene?: SpaceScene;
  /** The lines last asked for, and where the layout's exploded view moves them. */
  lines?: { given: readonly SpaceLine[]; drawn: readonly SpaceLine[] };
  /** The last picture of its solids, and what it was drawn from. */
  picture?: { key: string; bitmap: KeptPicture };
}

/** Each space's placement, layout, scene and picture, by its number. */
export class SpaceDrawings {
  private readonly kept = new Map<number, Kept>();

  /** Where a space's things are now. */
  placementOf(space: SpaceToDraw): SpacePlacement {
    return this.keptOf(space).placement;
  }

  /** A space's layout as it draws now. */
  layoutOf(space: SpaceToDraw): PlacedLayout {
    return this.keptOf(space).layout;
  }

  /** A space's relation lines, their ends moved with what they end on in the exploded view. */
  linesOf(space: SpaceToDraw): readonly SpaceLine[] {
    const known = this.keptOf(space);
    if (known.lines?.given === space.lines) return known.lines.drawn;
    const drawn = explodedLines(space.lines, known.layout.shifts);
    known.lines = { given: space.lines, drawn };
    return drawn;
  }

  /** A space's scene, following its layout, made again only when what it is made of changed. */
  sceneOf(space: SpaceToDraw): SpaceScene {
    const known = this.keptOf(space);
    const sceneKey = `${space.cut ? `${space.cut.axis}:${space.cut.keep}` : '-'}:${space.theme}`;
    if (known.scene && known.sceneKey === sceneKey && known.scene.show(known.layout)) {
      return known.scene;
    }
    known.scene?.dispose();
    known.scene = new SpaceScene(known.layout, {
      cut: space.cut && { axis: space.cut.axis, keep: space.cut.keep },
      theme: space.theme,
    });
    known.sceneKey = sceneKey;
    return known.scene;
  }

  /**
   * The picture of a space's solids kept from its last frame, when nothing it shows changed since:
   * its scene, the camera, the cut, the size and the pixel ratio.
   */
  pictureOf(space: SpaceToDraw): KeptPicture | undefined {
    const known = this.kept.get(space.space);
    const scene = known?.scene;
    if (!known?.picture || !scene) return undefined;
    return known.picture.key === pictureKey(space, scene) ? known.picture.bitmap : undefined;
  }

  /** Keeps the picture of a space's solids just drawn from its scene, letting go of the one before. */
  keepPicture(space: SpaceToDraw, bitmap: KeptPicture): void {
    const known = this.kept.get(space.space);
    if (!known?.scene) {
      bitmap.close();
      return;
    }
    if (known.picture?.bitmap !== bitmap) known.picture?.bitmap.close();
    known.picture = { key: pictureKey(space, known.scene), bitmap };
  }

  /** What lies under a pixel of a space, as its last frame drew it. */
  pick(space: SpaceToDraw, x: number, y: number): SpacePicked {
    return pickInSpace(
      {
        layout: this.layoutOf(space),
        camera: space.camera,
        size: space.size,
        pixelRatio: space.pixelRatio,
        lines: this.linesOf(space),
        cut: space.cut,
      },
      x,
      y,
    );
  }

  /** Forgets a space that ended. */
  end(space: number): void {
    const known = this.kept.get(space);
    known?.scene?.dispose();
    known?.picture?.bitmap.close();
    this.kept.delete(space);
  }

  /**
   * Forgets every space that draws a solid let go of, so that none draws its geometry again, and the
   * pieces merged for it.
   */
  forget(solid: BuiltSolid): void {
    for (const [number, known] of this.kept) {
      if (known.placement.solids.some((placed) => placed.solid === solid)) this.end(number);
    }
    forgetMerged(solid);
  }

  /** Forgets every space, as when the context is lost. */
  clear(): void {
    for (const number of [...this.kept.keys()]) this.end(number);
  }

  /** Whether a scene is one a space kept draws now. */
  holds(scene: SpaceScene): boolean {
    for (const known of this.kept.values()) if (known.scene === scene) return true;
    return false;
  }

  /** The spaces kept, by number. */
  get spaces(): number[] {
    return [...this.kept.keys()];
  }

  /** What is kept of a space, its placement and layout worked out again as what they read changed. */
  private keptOf(space: SpaceToDraw): Kept {
    const placementKey = placementKeyOf(space);
    const boxedKey = boxedKeyOf(space);
    const known = this.kept.get(space.space);
    if (known && known.entries === space.entries && known.placementKey === placementKey) {
      if (known.states === space.states && known.boxedKey === boxedKey) return known;
      known.states = space.states;
      known.boxedKey = boxedKey;
      known.layout = layOut(space, known.placement);
      return known;
    }
    const placement = placeOut(space);
    const layout = layOut(space, placement);
    if (known) {
      Object.assign(known, {
        entries: space.entries,
        placementKey,
        placement,
        states: space.states,
        boxedKey,
        layout,
      });
      known.lines = undefined;
      return known;
    }
    const made: Kept = {
      entries: space.entries,
      placementKey,
      placement,
      states: space.states,
      boxedKey,
      layout,
    };
    this.kept.set(space.space, made);
    return made;
  }
}

function placementKeyOf(space: SpaceToDraw): string {
  return `${space.explode}|${[...space.solids.keys()].sort().join(',')}`;
}

function boxedKeyOf(space: SpaceToDraw): string {
  return [...space.boxed].sort((a: Id, b: Id) => (a < b ? -1 : a > b ? 1 : 0)).join(',');
}

/** What a picture of a space's solids is drawn from. */
function pictureKey(space: SpaceToDraw, scene: SpaceScene): string {
  const { target, azimuth, elevation, distance } = space.camera;
  const cut = space.cut ? `${space.cut.axis}:${space.cut.at}:${space.cut.keep}` : '-';
  return [
    scene.version,
    target.x,
    target.y,
    target.z,
    azimuth,
    elevation,
    distance,
    cut,
    space.size.width,
    space.size.height,
    space.pixelRatio,
    space.theme,
  ].join('|');
}
