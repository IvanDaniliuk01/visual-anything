/**
 * Projects for the export tests: the sample with something of every kind the canvas draws, and
 * helpers that read an exported SVG back.
 */
import { cleanSvg, type ProjectSnapshot } from '@visual-anything/core';
import type { Element as ModelElement, PackageFile, ViewFile } from '@visual-anything/schema';
import { base64Of, png, svgIcon } from '../bench/pictures';
import type { Rect } from '../canvas/geometry';
import { loadSample } from './sample';

export const SAMPLE_VIEW = 'system-overview';

/** A cleaned SVG picture. */
export function cleanedSvg(svg: string): { svg: string; width: number; height: number } {
  const result = cleanSvg(svg);
  if (!result.ok) throw new Error('Cleaning refused the picture.');
  return result.value;
}

/** A package of pictures: an SVG icon and a PNG. */
export function picturesPackage(): PackageFile {
  const icon = cleanedSvg(svgIcon(3));
  return {
    id: 'pictures',
    name: 'Pictures',
    components: [],
    relationTypes: [],
    images: [
      { kind: 'svg', id: 'pictures.icon', name: 'Icon', ...icon },
      {
        kind: 'bitmap',
        id: 'pictures.photo',
        name: 'Photo',
        format: 'png',
        width: 4,
        height: 3,
        data: base64Of(png(4, 3, (x, y) => [x * 60, y * 80, 200])),
      },
    ],
  };
}

/** A view of the sample, changed. */
function withView(project: ProjectSnapshot, change: (view: ViewFile) => ViewFile): ProjectSnapshot {
  return {
    ...project,
    views: project.views.map((view) => (view.id === SAMPLE_VIEW ? change(view) : view)),
  };
}

/**
 * The sample with pictures (an icon, a tinted icon, a bitmap drawn as the whole shape), a free arrow,
 * a curved route and a name too long for its shape.
 */
export function richSample(): ProjectSnapshot {
  const sample = loadSample();
  const shows: Record<string, ModelElement['appearance']> = {
    'booking-agent': { image: { image: 'pictures.icon' } },
    whatsapp: { image: { image: 'pictures.icon', tint: '#B42318' } },
    'reminder-service': { image: { image: 'pictures.photo', placement: 'drawing' } },
  };
  const elements = sample.model.elements.map((element) => {
    const appearance = shows[element.id];
    const named =
      element.id === 'appointments-api'
        ? { ...element, name: 'The appointments API that books, moves and cancels every slot' }
        : element;
    return appearance ? { ...named, appearance } : named;
  });
  const project: ProjectSnapshot = {
    ...sample,
    project: { ...sample.project, packages: [...sample.project.packages, 'pictures'] },
    packages: [...sample.packages, picturesPackage()],
    model: { ...sample.model, elements },
  };
  return withView(project, (view) => ({
    ...view,
    freeShapes: [
      ...view.freeShapes,
      { kind: 'arrow', id: 'pointer', from: { x: 760, y: 600 }, to: { x: 700, y: 560 } },
    ],
    routes: { 'agent-to-api': { style: 'curved' } },
  }));
}

/** The sample with one container collapsed. */
export function collapsedSample(container = 'scheduling'): ProjectSnapshot {
  return withView(loadSample(), (view) => ({ ...view, collapsed: [container] }));
}

/** The points a path's data passes through, its curves sampled along their way. */
export function pathPoints(d: string): { x: number; y: number }[] {
  const tokens = d.match(/[MLHVCZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const points: { x: number; y: number }[] = [];
  let at = 0;
  let current = { x: 0, y: 0 };
  let start = current;
  let command = '';
  const number = () => Number(tokens[at++]);
  while (at < tokens.length) {
    const token = tokens[at] as string;
    if (/^[A-Z]$/i.test(token)) {
      command = token;
      at += 1;
      if (command === 'Z' || command === 'z') {
        current = start;
        continue;
      }
    }
    switch (command) {
      case 'M':
        current = { x: number(), y: number() };
        start = current;
        points.push(current);
        command = 'L';
        break;
      case 'L':
        current = { x: number(), y: number() };
        points.push(current);
        break;
      case 'H':
        current = { x: number(), y: current.y };
        points.push(current);
        break;
      case 'V':
        current = { x: current.x, y: number() };
        points.push(current);
        break;
      case 'C': {
        const c1 = { x: number(), y: number() };
        const c2 = { x: number(), y: number() };
        const to = { x: number(), y: number() };
        const from = current;
        for (let step = 1; step <= 32; step++) {
          const t = step / 32;
          const u = 1 - t;
          points.push({
            x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
            y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
          });
        }
        current = to;
        break;
      }
      default:
        throw new Error(`A path command the exports do not write: ${command}`);
    }
  }
  return points;
}

/**
 * The bounds of what a drawing draws, from its geometry alone: every rectangle, ellipse, path and use
 * of a picture, but its background, its texts and the backs of relations' names, which the scene's
 * bounds leave out too, and without the width of strokes.
 */
export function drawnBounds(document: Document): Rect | undefined {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  const take = (x: number, y: number) => {
    x1 = Math.min(x1, x);
    y1 = Math.min(y1, y);
    x2 = Math.max(x2, x);
    y2 = Math.max(y2, y);
  };
  const number = (element: Element, name: string) => Number(element.getAttribute(name) ?? 0);
  const parts = ['shapes', 'casings', 'relations', 'free-shapes'].flatMap((part) => [
    ...document.querySelectorAll(`svg > g[data-part="${part}"] *`),
  ]);
  for (const element of parts) {
    if (element.closest('text')) continue;
    switch (element.tagName) {
      case 'rect':
      case 'use':
        take(number(element, 'x'), number(element, 'y'));
        take(
          number(element, 'x') + number(element, 'width'),
          number(element, 'y') + number(element, 'height'),
        );
        break;
      case 'ellipse':
      case 'circle': {
        const rx = number(element, element.tagName === 'circle' ? 'r' : 'rx');
        const ry = number(element, element.tagName === 'circle' ? 'r' : 'ry');
        take(number(element, 'cx') - rx, number(element, 'cy') - ry);
        take(number(element, 'cx') + rx, number(element, 'cy') + ry);
        break;
      }
      case 'path':
        for (const point of pathPoints(element.getAttribute('d') ?? '')) take(point.x, point.y);
        break;
    }
  }
  return x1 > x2 ? undefined : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
