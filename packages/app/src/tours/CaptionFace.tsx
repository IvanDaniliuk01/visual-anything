/**
 * A tour's caption card drawn by its face (ADR 0096): laid out by the faces' engine (ADR 0083) in the
 * card's width, and its height when the step fixes one, and drawn in SVG as the SVG export draws a
 * shape's face: its boxes as the canvas paints them (`faceBoxPieces`), its bands, then its runs, each
 * line a `<text>` with a `<tspan>` per run at its own `x`, in the Roboto the program loads. It is
 * drawn as React elements, so no text
 * is ever turned into markup (ADR 0027). Its colors are the theme's, through the shell's custom
 * properties, so that it follows a theme switch with the rest of the card.
 */
import {
  captionFaceInput,
  compileCaptionFace,
  faceDrawingText,
  layOutFace,
  resolveFaceColor,
  robotoWidth,
  type FacePalette,
  type FaceRun,
} from '@visual-anything/core';
import type { CaptionFace, TourFile } from '@visual-anything/schema';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { faceBoxPieces } from '../canvas/faces';
import { MONO_FAMILY, SANS_FAMILY } from '../canvas/fontFamilies';
import { cssFontFamily, loadRobotoFonts, robotoLoaded } from '../canvas/robotoFonts';

/** The card's colors for a face's tokens: its own background and border, and the shell's text. */
const CARD_PALETTE: FacePalette = {
  fill: 'var(--surface-raised)',
  stroke: 'var(--border)',
  text: 'var(--text)',
  'text-muted': 'var(--text-muted)',
  highlight: 'var(--emphasis-highlight)',
  'code-back': 'var(--emphasis-code)',
  'row-separator': 'var(--border)',
  canvas: 'var(--canvas)',
};

const color = (each: string) => resolveFaceColor(each, CARD_PALETTE);

/**
 * The families its text is drawn in: the Roboto the program loads, which the face was laid out in, so
 * that each run fits the width the layout gave it; the system's only until it loads.
 */
const SANS = cssFontFamily(SANS_FAMILY);
const MONO = cssFontFamily(MONO_FAMILY);

export interface CaptionFaceDrawingProps {
  face: CaptionFace;
  tour: TourFile;
  /** The index of the step whose caption fills it. */
  step: number;
  /** The width it is laid out in, in pixels. */
  width: number;
  /** The height it is laid out in, when the step fixes the card's; else it takes its content's. */
  height?: number | undefined;
}

export function CaptionFaceDrawing({ face, tour, step, width, height }: CaptionFaceDrawingProps) {
  // Drawn again once Roboto is loaded, where the canvas has not loaded it yet.
  const [, setFonts] = useState(robotoLoaded);
  useEffect(() => {
    if (!robotoLoaded()) void loadRobotoFonts().then(setFonts);
  }, []);
  const drawing = useMemo(() => {
    const compiled = compileCaptionFace(face, height !== undefined);
    return layOutFace(compiled, captionFaceInput(tour, step), {
      width,
      ...(height === undefined ? {} : { height }),
    });
  }, [face, tour, step, width, height]);
  const shapes: ReactNode[] = [];
  drawing.boxes.forEach((box, at) => {
    faceBoxPieces(box, { x: 0, y: 0 }).forEach((piece, part) => {
      const rx = piece.radius > 0 ? piece.radius : undefined;
      shapes.push(
        piece.kind === 'fill' ? (
          <rect key={`box ${at} ${part}`} {...piece.rect} rx={rx} fill={color(piece.color)} />
        ) : (
          <rect
            key={`box ${at} ${part}`}
            {...piece.rect}
            rx={rx}
            fill="none"
            stroke={color(piece.color)}
            strokeWidth={piece.width}
          />
        ),
      );
    });
  });
  drawing.bands.forEach((band, at) => {
    if (!(band.width > 0) || !(band.height > 0)) return;
    shapes.push(
      <rect
        key={`band ${at}`}
        x={band.x}
        y={band.y}
        width={band.width}
        height={band.height}
        fill={color(band.color)}
      />,
    );
  });
  linesOf(drawing.runs).forEach((line, at) => {
    const fill = color((line[0] as FaceRun).color);
    const spans = line.flatMap((run, part) => {
      // Spaces at a run's start are moved past, as the SVG export does.
      const text = run.text.trimStart();
      if (text.trim() === '') return [];
      const lead = run.text.slice(0, run.text.length - text.length);
      const own = color(run.color);
      const { variant } = run;
      return [
        <tspan
          key={part}
          x={run.x + (lead === '' ? 0 : robotoWidth(lead, run.variant, run.size))}
          y={run.y}
          fontSize={run.size}
          fontWeight={variant === 'bold' || variant === 'boldItalic' ? 700 : undefined}
          fontStyle={variant === 'italic' || variant === 'boldItalic' ? 'italic' : undefined}
          fontFamily={variant === 'mono' ? MONO : undefined}
          fill={own === fill ? undefined : own}
        >
          {text.trimEnd()}
        </tspan>,
      ];
    });
    if (spans.length > 0) {
      shapes.push(
        <text key={`line ${at}`} fill={fill}>
          {spans}
        </text>,
      );
    }
  });
  return (
    <svg
      className="tour-card-face"
      width={drawing.width}
      height={drawing.height}
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      role="img"
      aria-label={faceDrawingText(drawing)}
      fontFamily={SANS}
    >
      {shapes}
    </svg>
  );
}

/** A face's runs by the line they are on, in their order. */
function linesOf(runs: readonly FaceRun[]): FaceRun[][] {
  const lines: FaceRun[][] = [];
  for (const run of runs) {
    const line = lines.at(-1);
    const last = line?.at(-1);
    if (line && last && last.line === run.line && last.paragraph === run.paragraph) line.push(run);
    else lines.push([run]);
  }
  return lines;
}
