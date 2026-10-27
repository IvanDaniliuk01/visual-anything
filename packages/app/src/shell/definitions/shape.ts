/**
 * What the Shape section of the component editor and the element inspector send (ADR 0066, ADR
 * 0067): free geometry read from path data typed in, from the shapes of an SVG file or copied from a
 * named part of a picture of the project, and the named part shapes are drawn as. Pure, so that what
 * each gesture sends can be tested without the panels; every reading goes through the core, whose
 * cleaner, reader and caps are the ones the commands check.
 */
import {
  GEOMETRY_CAPS,
  cleanSvg,
  cleanedImage,
  fitOutline,
  geometryOf,
  imagesIn,
  outlineLabelArea,
  partsOf,
  readGeometry,
  type Box,
  type CleanedImage,
  type Command,
  type GeometryInput,
  type NamedPart,
  type Outline,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { FreeGeometry, GeometryContour, Id, PartReference } from '@visual-anything/schema';
import { LEAST_LABEL_HEIGHT, labelAreaOn } from '../../canvas/outlined';
import { geometrySource, outlineIn } from '../../canvas/outlines';

/** Free geometry read from what the person gave, or why it cannot be used, in the core's words. */
export type GeometryReading =
  { ok: true; geometry: FreeGeometry; outline: Outline } | { ok: false; message: string };

/** A box typed beside path data: its width and height, each left out to fit the path. */
export interface TypedBox {
  width?: number;
  height?: number;
}

/** The box a typed number gives, rounded up a little so that the curves' extremes stay inside it. */
function roundedUp(value: number): number {
  return Math.ceil(value * 100 - 1e-6) / 100;
}

/** Free geometry as the person gave it, read by the core: its outline, or the core's reason. */
function read(geometry: FreeGeometry): GeometryReading {
  const reading = readGeometry(geometry);
  return reading.ok
    ? { ok: true, geometry, outline: reading.outline }
    : { ok: false, message: reading.message };
}

/**
 * Free geometry from path data typed in: one path contour, each of its subpaths a contour, in a box
 * from 0, 0. A side of the box left out ends where the path's curves do, so that path data pasted from
 * a drawing keeps its numbers as written. `keep` carries over what the geometry shown sets besides
 * its outline: whether it keeps its proportions, and its label area while it still fits the box.
 */
export function geometryFromPathData(
  d: string,
  box: TypedBox = {},
  keep: Pick<FreeGeometry, 'keepProportions' | 'label'> = {},
): GeometryReading {
  const text = d.trim();
  if (text === '') return { ok: false, message: 'The path data is empty.' };
  const outline: GeometryContour[] = [{ kind: 'path', d: text }];
  let { width, height } = box;
  if (width === undefined || height === undefined) {
    // Read once in the largest box there is, to find where the curves end.
    const wide = readGeometry({ width: GEOMETRY_CAPS.box, height: GEOMETRY_CAPS.box, outline });
    if (!wide.ok) return { ok: false, message: wide.message };
    const { bounds } = wide.outline;
    width ??= Math.min(GEOMETRY_CAPS.box, Math.max(0.01, roundedUp(bounds.x + bounds.width)));
    height ??= Math.min(GEOMETRY_CAPS.box, Math.max(0.01, roundedUp(bounds.y + bounds.height)));
  }
  const geometry: FreeGeometry = {
    width,
    height,
    outline,
    ...(keep.keepProportions === true ? { keepProportions: true } : {}),
  };
  if (keep.label !== undefined) {
    const labelled = read({ ...geometry, label: keep.label });
    // A label area the new box no longer holds is left out, and the label goes back to automatic.
    if (labelled.ok) return labelled;
  }
  return read(geometry);
}

/** The core's free geometry, written as an appearance stores it. */
function asFreeGeometry(geometry: GeometryInput): FreeGeometry {
  return {
    width: geometry.width,
    height: geometry.height,
    outline: geometry.outline.map((contour) => ({ ...contour })),
    ...(geometry.keepProportions === true ? { keepProportions: true } : {}),
    ...(geometry.label === undefined ? {} : { label: { ...geometry.label } }),
  };
}

/**
 * Free geometry from the shapes of an SVG file: the file cleaned by the core's cleaner, as any
 * picture is, and the outline of all it draws taken by `geometryOf` within free geometry's caps.
 */
export function geometryFromSvg(text: string): GeometryReading {
  const cleaned = cleanSvg(text);
  if (!cleaned.ok) return { ok: false, message: cleaned.problem.message };
  const { svg, width, height } = cleaned.value;
  const picture = cleanedImage({ kind: 'svg', id: 'file', name: 'file', svg, width, height });
  const geometry = picture === undefined ? undefined : geometryOf(picture);
  if (geometry === undefined) {
    return { ok: false, message: 'The picture draws nothing to take an outline from.' };
  }
  return read(asFreeGeometry(geometry));
}

/** Free geometry copied from a named part of a picture: the part's outline, as `geometryOf` writes it. */
export function geometryFromPart(picture: CleanedImage, part: string): GeometryReading {
  const geometry = geometryOf(picture, part);
  if (geometry === undefined) {
    return { ok: false, message: 'The part draws nothing to take an outline from.' };
  }
  return read(asFreeGeometry(geometry));
}

/** Numbers as path data writes them: at most four decimals, without trailing zeros. */
function number(value: number): string {
  return String(Math.round(value * 10_000) / 10_000);
}

/**
 * Free geometry's contours as the path data the editor shows, one contour a line: a path as written,
 * a polygon as lines through its points, and an ellipse as two arcs.
 */
export function pathDataOf(geometry: FreeGeometry | undefined): string {
  if (geometry === undefined) return '';
  return geometry.outline
    .map((contour) => {
      switch (contour.kind) {
        case 'path':
          return contour.d;
        case 'polygon': {
          const values = contour.points.trim().split(/[\s,]+/);
          const pairs: string[] = [];
          for (let at = 0; at + 1 < values.length; at += 2) {
            pairs.push(`${values[at] ?? ''} ${values[at + 1] ?? ''}`);
          }
          return pairs.length === 0 ? '' : `M${pairs.join(' L')} Z`;
        }
        case 'ellipse': {
          const { cx, cy, rx, ry } = contour;
          const left = `${number(cx - rx)} ${number(cy)}`;
          const right = `${number(cx + rx)} ${number(cy)}`;
          const arc = `A${number(rx)} ${number(ry)} 0 1 0`;
          return `M${left} ${arc} ${right} ${arc} ${left} Z`;
        }
      }
    })
    .filter((line) => line !== '')
    .join('\n');
}

/** Free geometry with Keep proportions on or off: off leaves the key out, so it is stretched. */
export function withKeepProportions(geometry: FreeGeometry, on: boolean): FreeGeometry {
  const next: FreeGeometry = { ...geometry };
  if (on) next.keepProportions = true;
  else delete next.keepProportions;
  return next;
}

/** Free geometry with a label area of its own, or with none, so that it is worked out. */
export function withLabel(geometry: FreeGeometry, label: Box | undefined): FreeGeometry {
  const next: FreeGeometry = { ...geometry };
  if (label === undefined) delete next.label;
  else next.label = { x: label.x, y: label.y, width: label.width, height: label.height };
  return next;
}

/**
 * The label area free geometry writes the name and detail in, in its box's coordinates: its own, or
 * the one the canvas works out around a point well inside the outline.
 */
export function labelAreaOf(outline: Outline): Box {
  return outlineLabelArea(fitOutline(outline, outline.width, outline.height));
}

/**
 * Whether a shape of this size, one that shows no contents, has room inside its outline for a name:
 * a label area at least a line tall. A name that does not fit there whole is written under the
 * shape, as the canvas decides it (`writesNameBelow`, ADR 0066).
 */
export function roomForNameInside(outline: Outline, width: number, height: number): boolean {
  const area = labelAreaOn({
    rect: { x: 0, y: 0, width, height },
    outline: outlineIn(geometrySource(outline), width, height),
  });
  return area.height >= LEAST_LABEL_HEIGHT;
}

/** The command that sets a component's free geometry at the level the project can change. */
export function componentGeometryCommand(
  component: Id,
  geometry: FreeGeometry | 'none' | null,
): Command {
  return { type: 'set-component-appearance', component, appearanceTraits: { geometry } };
}

/** The command that sets the named part a component's shapes are drawn as, at that level too. */
export function componentPartCommand(component: Id, part: PartReference | 'none' | null): Command {
  return { type: 'set-component-appearance', component, appearanceTraits: { part } };
}

/** The command that sets the named part one element's shapes are drawn as, as a particularity. */
export function elementPartCommand(element: Id, part: PartReference | 'none' | null): Command {
  return { type: 'update-element', id: element, changes: { appearanceTraits: { part } } };
}

/** A picture of the project that can have named parts: an SVG image a package in use defines. */
export interface PartPicture {
  id: Id;
  name: string;
  picture: CleanedImage;
}

/** The SVG pictures of the project, in the order their packages define them. */
export function svgPicturesIn(project: ProjectSnapshot): PartPicture[] {
  const catalog = imagesIn(project);
  return [...catalog.images.values()].flatMap(({ definition }) => {
    const picture = catalog.shown(definition.id);
    return picture?.kind === 'svg' ? [{ id: definition.id, name: definition.name, picture }] : [];
  });
}

/** The named parts of a picture, read once by the core and cached by its cleaned view. */
export function namedPartsOf(picture: CleanedImage | undefined): readonly NamedPart[] {
  return picture?.kind === 'svg' ? partsOf(picture) : [];
}

/** Whether a text is a part's id as a picture names it, which an appearance names it by. */
export function isPartId(text: string): boolean {
  return /^[A-Za-z_][\w.-]{0,63}$/.test(text);
}
