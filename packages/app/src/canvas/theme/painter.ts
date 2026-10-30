/**
 * Draws a scene's items in one theme: `draw.ts`'s drawings of their painted copies, the casings under
 * lines, and labels recorded with what their tint follows, so that a theme switch or a recolor tints
 * them again instead of writing them again (ADR-0033).
 *
 * A casing is the line's route stroked wider, solid even under a dashed line, under the lines: it
 * keeps a line readable where it crosses a fill, such as a light stored fill on the dark canvas. The
 * casings of relations are drawn in white, in a drawing of their own, and tinted to the canvas, so that
 * a theme switch only tints them; those of free arrows are drawn in the canvas color with the arrows.
 */
import type { ThemeName } from '@visual-anything/core';
import type { Color, Id } from '@visual-anything/schema';
import type { Container, Graphics, GraphicsContext } from 'pixi.js';
import { THEMES, type CanvasTheme } from '../../theme/themes';
import { readableTextColors } from '../colors';
import {
  drawFreeShapes,
  drawPieceCasings,
  drawPieceLines,
  drawRelationLines,
  drawRelationRoutes,
  drawRoutePieces,
  drawShapeBlocks,
  drawShapeOutlines,
  writeNoteTexts,
  writeRelationLabels,
  writeShapeLabels,
  type TextFactory,
} from '../draw';
import type { Arrowhead } from '../geometry';
import { tintLabel } from '../emphasisLabels';
import { RelationLabel } from '../labels';
import { rowColorsOf } from '../rowsDraw';
import {
  ARROW_WIDTH,
  type ArrowShape,
  type ElementShape,
  type NoteShape,
  type RelationLine,
} from '../scene';
import { nameBandOf } from '../shape-images';
import type { RoutePiece } from '../tiles';
import {
  noteColors,
  paintedArrow,
  paintedLine,
  paintedNote,
  paintedPiece,
  paintedShape,
  shapeColors,
} from './paint';

/** A label written, with what its tint follows: its shape's fill, the theme, or its note's fill. */
export type LabelPaint =
  | { label: Container; role: 'name' | 'detail'; shape: string }
  | { label: Container; role: 'relation' }
  | { label: Container; role: 'note'; note: Id };

/** Where the items a retint looks up are now, as the scene shown holds them. */
export interface PaintLookups {
  shape(key: string): ElementShape | undefined;
  note(id: Id): NoteShape | undefined;
}

/** How much wider than its line a casing is, in canvas units. */
export const CASING_EXTRA = 2;
const CASING = '#FFFFFF';

export class Painter {
  constructor(readonly theme: CanvasTheme) {}

  get name(): ThemeName {
    return this.theme.name;
  }

  /** Element shapes as plain blocks. */
  shapeBlocks(graphics: Graphics, shapes: readonly ElementShape[], inOrder = false): void {
    drawShapeBlocks(graphics, this.shapes(shapes), inOrder, rowColorsOf(this.theme));
  }

  /** Element shapes in full; rows and the shapes that draw them in the theme's row colors. */
  shapeOutlines(graphics: Graphics, shapes: readonly ElementShape[]): void {
    drawShapeOutlines(graphics, this.shapes(shapes), rowColorsOf(this.theme));
  }

  /** Relations as plain lines. */
  relationLines(graphics: Graphics, lines: readonly RelationLine[]): void {
    drawRelationLines(graphics, this.lines(lines));
  }

  /** Relations along their routes, with their arrowheads. */
  relationRoutes(graphics: Graphics, lines: readonly RelationLine[]): void {
    drawRelationRoutes(graphics, this.lines(lines));
  }

  /** The pieces of routes in one tile, and the arrowheads of `ends`. */
  routePieces(
    graphics: Graphics,
    pieces: readonly RoutePiece[],
    ends: readonly RelationLine[],
  ): void {
    drawRoutePieces(graphics, this.pieces(pieces), this.lines(ends));
  }

  /** The pieces of routes in one tile as plain lines. */
  pieceLines(graphics: Graphics, pieces: readonly RoutePiece[]): void {
    drawPieceLines(graphics, this.pieces(pieces));
  }

  /** Notes, then the casings of free arrows in the canvas color, then the arrows. */
  freeShapes(graphics: Graphics, notes: readonly NoteShape[], arrows: readonly ArrowShape[]): void {
    const theme = this.theme;
    drawFreeShapes(
      graphics,
      notes.map((note) => paintedNote(note, theme)),
      [],
    );
    for (const arrow of arrows) {
      const { from, to, arrowhead } = arrow;
      graphics
        .moveTo(from.x, from.y)
        .lineTo(to.x, to.y)
        .stroke({ color: theme.background, width: ARROW_WIDTH + CASING_EXTRA, cap: 'butt' });
      arrowheadCasing(graphics, arrowhead, theme.background);
    }
    drawFreeShapes(
      graphics,
      [],
      arrows.map((arrow) => paintedArrow(arrow, theme)),
    );
  }

  /**
   * The casings of the pieces of routes in one tile and of the arrowheads of `ends`, in white: the
   * drawing they are in is tinted to the canvas. They depend on no theme.
   */
  casings(graphics: Graphics, pieces: readonly RoutePiece[], ends: readonly RelationLine[]): void {
    // All in one color: a path for each width, and one for every arrowhead, in any order.
    drawPieceCasings(graphics, pieces, CASING, CASING_EXTRA);
    let any = false;
    for (const line of ends) {
      if (!line.arrowhead) continue;
      const { tip, left, right } = line.arrowhead;
      graphics.poly([tip.x, tip.y, left.x, left.y, right.x, right.y]);
      any = true;
    }
    if (any) graphics.fill(CASING).stroke({ color: CASING, width: CASING_EXTRA, join: 'round' });
  }

  /**
   * Each shape's name and, with `details`, its detail, tinted to read on the fill it is drawn in;
   * `records` gets each label with the shape it is on. A shape drawn by its picture writes its name
   * under the picture, on what the shape sits on, which `lookups` finds; a shape whose own outline
   * cannot hold its name whole writes it in its name tag, on its own fill.
   */
  shapeLabels(
    shapes: readonly ElementShape[],
    details: boolean,
    make: TextFactory,
    records?: LabelPaint[],
    lookups?: PaintLookups,
  ): Container[] {
    let current = '';
    const recording: TextFactory | undefined = records
      ? Object.assign(
          (...args: Parameters<TextFactory>) => {
            const label = make(...args);
            const kind = args[1];
            if (label)
              records.push({ label, role: kind === 'detail' ? 'detail' : 'name', shape: current });
            return label;
          },
          // It measures as `make` does, so that shapes place their text as it draws.
          {
            ...(make.measure ? { measure: make.measure } : {}),
            ...(make.measureName ? { measureName: make.measureName } : {}),
          },
        )
      : undefined;
    const written: Container[] = [];
    for (const shape of shapes) {
      current = shape.key;
      written.push(
        ...writeShapeLabels([paintedShape(shape, this.name)], details, recording ?? make, () =>
          this.backdropOf(shape, lookups),
        ),
      );
    }
    return written;
  }

  /** The names of relations, in the theme's text over the theme's canvas. */
  relationLabels(
    lines: readonly RelationLine[],
    make: TextFactory,
    records?: LabelPaint[],
  ): Container[] {
    const { relationLabelText: text, relationLabelBack: back } = this.theme;
    const written = writeRelationLabels(lines, make, { text, back });
    if (records) for (const label of written) records.push({ label, role: 'relation' });
    return written;
  }

  /** The text of notes, tinted to read on the fill each note is drawn in. */
  noteTexts(notes: readonly NoteShape[], records?: LabelPaint[], make?: TextFactory): Container[] {
    const texts = writeNoteTexts(notes, make);
    texts.forEach((text, at) => {
      const note = notes[at] as NoteShape;
      tintLabel(text, noteColors(note, this.theme).text);
      records?.push({ label: text, role: 'note', note: note.id });
    });
    return texts;
  }

  /** Tints labels again for this theme and the items as they are now. */
  retint(records: readonly LabelPaint[], lookups: PaintLookups): void {
    const theme = this.theme;
    for (const record of records) {
      const { label } = record;
      if (label.destroyed) continue;
      if (record.role === 'relation') {
        if (label instanceof RelationLabel)
          label.paint(theme.relationLabelText, theme.relationLabelBack);
        else tintLabel(label, theme.relationLabelText);
        continue;
      }
      if (record.role === 'note') {
        const note = lookups.note(record.note);
        if (note) tintLabel(label, noteColors(note, theme).text);
        continue;
      }
      const shape = lookups.shape(record.shape);
      if (!shape) continue;
      // A name tag is drawn in its shape's fill, which its name reads on (ADR 0066's clarifications).
      const under = nameBandOf(shape) ? this.backdropOf(shape, lookups) : undefined;
      // A shape drawn as a named part writes on its part's main color (ADR 0067).
      const colors = readableTextColors(
        under ?? shape.part?.color ?? shapeColors(shape, this.name).fill,
      );
      tintLabel(label, record.role === 'name' ? colors.name : colors.detail);
    }
  }

  /**
   * What a shape sits on, in this theme: its container's fill, or the canvas. The name of a shape
   * drawn by its picture is written there, under the picture.
   */
  private backdropOf(shape: ElementShape, lookups: PaintLookups | undefined): Color {
    const holder =
      shape.containerShape === undefined ? undefined : lookups?.shape(shape.containerShape);
    return holder ? shapeColors(holder, this.name).fill : this.theme.background;
  }

  private shapes(shapes: readonly ElementShape[]): readonly ElementShape[] {
    return this.name === 'light' ? shapes : shapes.map((shape) => paintedShape(shape, this.name));
  }

  private lines(lines: readonly RelationLine[]): readonly RelationLine[] {
    return this.name === 'light' ? lines : lines.map((line) => paintedLine(line, this.name));
  }

  private pieces(pieces: readonly RoutePiece[]): readonly RoutePiece[] {
    return this.name === 'light' ? pieces : pieces.map((piece) => paintedPiece(piece, this.name));
  }
}

/** An arrowhead filled one unit wider all round. */
function arrowheadCasing(graphics: Graphics, arrowhead: Arrowhead, color: string): void {
  const { tip, left, right } = arrowhead;
  graphics
    .poly([tip.x, tip.y, left.x, left.y, right.x, right.y])
    .fill(color)
    .stroke({ color, width: CASING_EXTRA, join: 'round' });
}

const PAINTERS: Readonly<Record<ThemeName, Painter>> = {
  light: new Painter(THEMES.light.canvas),
  dark: new Painter(THEMES.dark.canvas),
};

/** The painter of a theme: one for each of the app's themes. */
export function painterOf(theme: CanvasTheme): Painter {
  const known = PAINTERS[theme.name];
  return known.theme === theme ? known : new Painter(theme);
}

/** What builds a drawing's geometry before it is shown: PixiJS's graphics context system. */
export interface GeometryBuilder {
  updateGpuContext(context: GraphicsContext): { isBatchable: boolean };
  getContextRenderData(context: GraphicsContext): unknown;
}

/**
 * Builds a drawing's geometry now, inside the frame's clock, rather than when it is first rendered:
 * its tessellation, and the buffers of one drawn on its own.
 */
export function buildGeometry(
  builder: GeometryBuilder | undefined,
  context: GraphicsContext,
): void {
  if (!builder) return;
  if (!builder.updateGpuContext(context).isBatchable) builder.getContextRenderData(context);
}
