/**
 * A small project beyond boxes, for the scene's tests (M8b, ADR 0066, ADR 0067): a body drawn with
 * its parts, contents anchored to its picture's parts and others not, and in World a part drawn on
 * its own and a shape drawn by its free geometry.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Element, FreeGeometry, PackageFile, Relation } from '@visual-anything/schema';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

/** The picture's id, which defines three named parts: `left`, `right` and `ring`. */
export const ORGANS_ID = 'anatomy.organs';

/** Two squares side by side, and a ring with a hole, each a named part. */
const ORGANS = `<svg viewBox="0 0 300 100" ${NS}><path id="left" d="M10 10h80v80h-80z" fill="#C0392B"/><path id="right" d="M110 10h80v80h-80z" fill="#2980B9"/><path id="ring" fill-rule="evenodd" fill="#27AE60" d="M210 10h80v80h-80z M230 30h40v40h-40z"/></svg>`;

/** A square with a square hole, as free geometry. */
export const FRAME: FreeGeometry = {
  width: 100,
  height: 100,
  outline: [{ kind: 'path', d: 'M0 0H100V100H0Z M25 25H75V75H25Z' }],
};

/** A triangle, as free geometry that keeps its proportions. */
export const TRIANGLE: FreeGeometry = {
  width: 100,
  height: 80,
  keepProportions: true,
  outline: [{ kind: 'polygon', points: '50,0 100,80 0,80' }],
};

function anatomy(): PackageFile {
  return {
    id: 'anatomy',
    name: 'Anatomy',
    components: [
      {
        id: 'anatomy.organ',
        name: 'Organ',
        derivesFrom: 'essence',
        appearance: { image: { image: ORGANS_ID, placement: 'parts' } },
      },
      { id: 'anatomy.chamber', name: 'Chamber', derivesFrom: 'essence' },
    ],
    relationTypes: [
      { id: 'anatomy.is-part-of', name: 'is part of', derivesFrom: 'relates-to', nests: true },
      { id: 'anatomy.flows', name: 'flows to', derivesFrom: 'relates-to', direction: 'directed' },
    ],
    images: [{ kind: 'svg', id: ORGANS_ID, name: 'Organs', width: 300, height: 100, svg: ORGANS }],
  };
}

const chamber = (id: string, appearance?: Element['appearance']): Element => ({
  id,
  component: 'anatomy.chamber',
  name: id,
  ...(appearance ? { appearance } : {}),
});

const inside = (from: string, to: string): Relation => ({
  id: `${from}-in-${to}`,
  relationType: 'anatomy.is-part-of',
  from,
  to,
});

/**
 * A body drawn with its parts: `left` and `right` anchored to its picture's parts, `twin` naming
 * `left` again and `extra` naming none, both placed below the picture, and `inner` inside `left`,
 * which an anchored part does not draw. In World, `loose` is drawn as the ring on its own, and
 * `framed` by its free geometry.
 */
export function beyondBoxes(view = 'anatomy'): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Anatomy', packages: ['anatomy'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'body', component: 'anatomy.organ', name: 'Body' },
        chamber('right', { part: { part: 'right' } }),
        chamber('left', { part: { part: 'left', image: ORGANS_ID } }),
        chamber('twin', { part: { part: 'left' } }),
        chamber('extra'),
        chamber('inner'),
        chamber('loose', { part: { part: 'ring', image: ORGANS_ID } }),
        chamber('framed', { geometry: FRAME, width: 200, height: 100 }),
      ],
      relations: [
        inside('right', 'body'),
        inside('left', 'body'),
        inside('twin', 'body'),
        inside('extra', 'body'),
        inside('inner', 'left'),
        { id: 'flow', relationType: 'anatomy.flows', from: 'left', to: 'right' },
        { id: 'tie', relationType: 'anatomy.flows', from: 'loose', to: 'framed' },
        { id: 'deep', relationType: 'anatomy.flows', from: 'inner', to: 'framed' },
      ],
    },
    packages: [anatomy()],
    views: [
      {
        id: view,
        name: 'Anatomy',
        perspective: { name: 'Parts' },
        nestingRelationTypes: ['anatomy.is-part-of'],
        positions: [
          { element: 'body', x: 0, y: 0 },
          // An anchored part's own position is not used.
          { element: 'left', container: 'body', x: 999, y: 999 },
          { element: 'loose', x: 800, y: 0 },
          { element: 'framed', x: 800, y: 300 },
        ],
        freeShapes: [],
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}
