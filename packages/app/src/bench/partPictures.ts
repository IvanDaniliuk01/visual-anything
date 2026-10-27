/**
 * The pictures of the benchmark's drawings with parts (ADR 0067): 20 distinct SVG pictures whose
 * pieces are named parts, stored as the core cleans them, in a package of the project's own.
 * - Two are at the cap on parts: 1,024 named parts each, small boxes in 32 rows of 32.
 * - The other 18 have 72 named parts: 8 rows, each a named part that holds 8 cells, which are named
 *   parts too, drawn as discs, rings, rounded boxes and diamonds in an order of their own.
 * Each sits on a background that is not a part. Every picture is 640 by 480 units, so that a drawing
 * with parts shows it at one canvas unit per unit of the image.
 */
import { PART_CAPS, cleanSvg } from '@visual-anything/core';
import type { ImageDefinition, PackageFile } from '@visual-anything/schema';

/** How many pictures there are, how many sit at the cap on parts, and their size. */
export const BENCH_PARTS = {
  pictures: 20,
  atCap: 2,
  width: 640,
  height: 480,
  /** Rows and columns of cells: at the cap, and in the other pictures. */
  atCapSide: 32,
  side: 8,
} as const;

/** The package that holds the pictures. */
export const PART_PACKAGE = 'bench-parts';

/** The id of a picture. */
export function partPictureId(at: number): string {
  return `${PART_PACKAGE}.picture-${at}`;
}

/** The name of the cell in a row and a column of a picture, which is its named part's id. */
export function cellPart(row: number, column: number): string {
  return `c${row}-${column}`;
}

/** The cells of a picture, which contents are anchored to, in the picture's order. */
export function cellsOf(at: number): string[] {
  const side = at < BENCH_PARTS.atCap ? BENCH_PARTS.atCapSide : BENCH_PARTS.side;
  const cells: string[] = [];
  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) cells.push(cellPart(row, column));
  }
  return cells;
}

const NS = 'xmlns="http://www.w3.org/2000/svg"';

/** Colors that tell rows apart, the same every time. */
const COLORS = [
  '#C0392B',
  '#2980B9',
  '#27AE60',
  '#8E44AD',
  '#D35400',
  '#16A085',
  '#F39C12',
  '#2C3E50',
];

/** A picture at the cap on parts: 1,024 boxes, a row of 32 in each color in turn. */
function atCap(at: number): string {
  const side = BENCH_PARTS.atCapSide;
  const cell = { width: BENCH_PARTS.width / side, height: BENCH_PARTS.height / side };
  const rows: string[] = [];
  for (let row = 0; row < side; row++) {
    const boxes: string[] = [];
    for (let column = 0; column < side; column++) {
      const x = column * cell.width + 1;
      const y = row * cell.height + 1;
      boxes.push(
        `<path id="${cellPart(row, column)}" d="M${x} ${y}h${cell.width - 2}v${cell.height - 2}h-${cell.width - 2}z"/>`,
      );
    }
    rows.push(`<g fill="${COLORS[(row + at) % COLORS.length] as string}">${boxes.join('')}</g>`);
  }
  return `<svg viewBox="0 0 ${BENCH_PARTS.width} ${BENCH_PARTS.height}" ${NS}><rect width="${BENCH_PARTS.width}" height="${BENCH_PARTS.height}" fill="#F5EFE6"/>${rows.join('')}</svg>`;
}

/** A picture of 8 rows of 8 cells, its cells' shapes and colors in an order that follows `at`. */
function ordinary(at: number): string {
  const side = BENCH_PARTS.side;
  const cell = { width: BENCH_PARTS.width / side, height: BENCH_PARTS.height / side };
  const rows: string[] = [];
  for (let row = 0; row < side; row++) {
    const cells: string[] = [];
    for (let column = 0; column < side; column++) {
      const id = cellPart(row, column);
      const x = column * cell.width;
      const y = row * cell.height;
      const cx = x + cell.width / 2;
      const cy = y + cell.height / 2;
      switch ((row * 3 + column + at) % 4) {
        case 0:
          cells.push(`<circle id="${id}" cx="${cx}" cy="${cy}" r="${24 - (at % 3)}"/>`);
          break;
        case 1:
          cells.push(
            `<path id="${id}" fill-rule="evenodd" d="M${x + 6} ${y + 6}h68v48h-68z M${x + 24} ${y + 18}h32v24h-32z"/>`,
          );
          break;
        case 2:
          cells.push(
            `<rect id="${id}" x="${x + 8}" y="${y + 8}" width="64" height="44" rx="${6 + (at % 5)}"/>`,
          );
          break;
        default:
          cells.push(
            `<polygon id="${id}" points="${cx},${y + 4} ${x + 76},${cy} ${cx},${y + 56} ${x + 4},${cy}" stroke="#1B2631" stroke-width="2"/>`,
          );
      }
    }
    rows.push(
      `<g id="row-${row}" fill="${COLORS[(row + at) % COLORS.length] as string}">${cells.join('')}</g>`,
    );
  }
  return `<svg viewBox="0 0 ${BENCH_PARTS.width} ${BENCH_PARTS.height}" ${NS}><rect width="${BENCH_PARTS.width}" height="${BENCH_PARTS.height}" fill="#FBF7F0"/>${rows.join('')}</svg>`;
}

let made: PackageFile | undefined;

/** The package of the pictures, made once: it is the same every time. */
export function partPicturePackage(): PackageFile {
  made ??= makePackage();
  return made;
}

function makePackage(): PackageFile {
  if (BENCH_PARTS.atCapSide ** 2 !== PART_CAPS.parts) {
    throw new Error('The benchmark pictures at the cap no longer reach the cap on parts.');
  }
  const images: ImageDefinition[] = [];
  for (let at = 0; at < BENCH_PARTS.pictures; at++) {
    const cleaned = cleanSvg(at < BENCH_PARTS.atCap ? atCap(at) : ordinary(at));
    if (!cleaned.ok) {
      throw new Error(`Benchmark picture ${at} does not clean: ${cleaned.problem.message}`);
    }
    images.push({
      kind: 'svg',
      id: partPictureId(at),
      name: at < BENCH_PARTS.atCap ? `Picture ${at} at the cap on parts` : `Picture ${at}`,
      ...cleaned.value,
    });
  }
  return {
    id: PART_PACKAGE,
    name: 'Benchmark pictures with parts',
    components: [],
    relationTypes: [],
    images,
  };
}
