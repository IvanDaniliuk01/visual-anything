/**
 * The spaces the worker's GPU draws (ADR 0076), each kept by its number with its layout and its
 * scene, so that a frame whose camera alone changed only places them again, and a pick reads the same
 * layout the frame was drawn from. A layout is worked out again when what the space shows changes:
 * its entries, their states, the solids loaded, the exploded view or the solids drawn as boxes; its
 * scene when the layout, the cut's axis or side, or the theme does. Relation lines are drawn and
 * picked with their ends where the exploded view moves what they end on (`explodedLines`).
 */
import type { Id } from '@visual-anything/schema';
import type { BuiltSolid } from '../build';
import type { SpaceLine } from '../../protocol';
import type { SpacePicked, SpaceToDraw } from '../host';
import { explodedLines, layOut, type SpaceLayout } from './layout';
import { pickInSpace } from './pick';
import { SpaceScene } from './scene';

interface Kept {
  entries: SpaceToDraw['entries'];
  states: SpaceToDraw['states'];
  layoutKey: string;
  layout: SpaceLayout;
  sceneKey?: string;
  scene?: SpaceScene;
  /** The lines last asked for, and where the layout's exploded view moves them. */
  lines?: { given: readonly SpaceLine[]; drawn: readonly SpaceLine[] };
}

/** Each space's layout and scene, by its number. */
export class SpaceDrawings {
  private readonly kept = new Map<number, Kept>();

  /** A space's layout as it draws now. */
  layoutOf(space: SpaceToDraw): SpaceLayout {
    const layoutKey = layoutKeyOf(space);
    const known = this.kept.get(space.space);
    if (
      known &&
      known.entries === space.entries &&
      known.states === space.states &&
      known.layoutKey === layoutKey
    ) {
      return known.layout;
    }
    known?.scene?.dispose();
    const layout = layOut(space);
    this.kept.set(space.space, {
      entries: space.entries,
      states: space.states,
      layoutKey,
      layout,
    });
    return layout;
  }

  /** A space's relation lines, their ends moved with what they end on in the exploded view. */
  linesOf(space: SpaceToDraw): readonly SpaceLine[] {
    const layout = this.layoutOf(space);
    const known = this.kept.get(space.space) as Kept;
    if (known.lines?.given === space.lines) return known.lines.drawn;
    const drawn = explodedLines(space.lines, layout.shifts);
    known.lines = { given: space.lines, drawn };
    return drawn;
  }

  /** A space's scene, made again only when what it draws changed. */
  sceneOf(space: SpaceToDraw): SpaceScene {
    const layout = this.layoutOf(space);
    const known = this.kept.get(space.space) as Kept;
    const sceneKey = `${space.cut ? `${space.cut.axis}:${space.cut.keep}` : '-'}:${space.theme}`;
    if (known.scene && known.sceneKey === sceneKey) return known.scene;
    known.scene?.dispose();
    known.scene = new SpaceScene(layout, {
      cut: space.cut && { axis: space.cut.axis, keep: space.cut.keep },
      theme: space.theme,
    });
    known.sceneKey = sceneKey;
    return known.scene;
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
    this.kept.get(space)?.scene?.dispose();
    this.kept.delete(space);
  }

  /** Forgets every space that draws a solid let go of, so that none draws its geometry again. */
  forget(solid: BuiltSolid): void {
    for (const [number, known] of this.kept) {
      if (known.layout.solids.some((laid) => laid.solid === solid)) this.end(number);
    }
  }

  /** Forgets every space, as when the context is lost. */
  clear(): void {
    for (const number of [...this.kept.keys()]) this.end(number);
  }

  /** The spaces kept, by number. */
  get spaces(): number[] {
    return [...this.kept.keys()];
  }
}

function layoutKeyOf(space: SpaceToDraw): string {
  const solids = [...space.solids.keys()].sort().join(',');
  const boxed = [...space.boxed].sort((a: Id, b: Id) => (a < b ? -1 : a > b ? 1 : 0)).join(',');
  return `${space.explode}|${solids}|${boxed}`;
}
