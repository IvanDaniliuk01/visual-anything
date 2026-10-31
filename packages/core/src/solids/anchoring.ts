/**
 * Anchor parts… for solids (ADR 0075): ADR 0067's matching, with a solid where it had an image. A
 * drawing with parts that shows a solid has the solid's named parts, in depth-first order, each with
 * the content drawn as it now; matching pairs them with its contents by name, by id or by an external
 * identifier through a crosswalk, and creates elements for the parts that match nothing when asked,
 * as images' anchoring does (`images/anchoring.ts`), in one action.
 *
 * A content is drawn as a solid's part when its appearance names the part with this solid, or with
 * neither a solid nor an image, as the canvas places it; the action names the part alone, so that it
 * follows the solid its drawing shows, replaced or not.
 */
import type { Element, Id, ViewFile } from '@visual-anything/schema';
import { appearanceOf } from '../definitions';
import {
  contentsOf,
  planDrawnParts,
  type AnchorContent,
  type AnchorRequest,
  type PartAnchor,
  type PlannedParts,
} from '../images/anchoring';
import type { Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import { solidShownBy, solidsIn } from './catalog';

/** A named part of a solid, as Anchor parts… pairs it: its name is its id. */
export interface SolidPartToAnchor {
  /** Its name, which is its id. */
  readonly id: string;
  /** Its index in the solid's parts, in depth-first order. */
  readonly index: number;
  /** The index of the part that holds it, if one does. */
  readonly parent?: number;
}

/** A part of a solid, with what it is drawn as. */
export interface PlannedSolidPart {
  readonly part: SolidPartToAnchor;
  readonly anchor: PartAnchor;
}

/** The parts of a drawing with parts that shows a solid, and the contents each is drawn as. */
export interface SolidDrawingParts {
  readonly drawing: AnchorContent;
  readonly solid: { readonly id: Id; readonly name: string };
  /** The solid's named parts, in depth-first order, each `kept` or `unmatched`. */
  readonly parts: readonly PlannedSolidPart[];
  /** The drawing's contents, in the model's order. */
  readonly contents: readonly AnchorContent[];
  /** The contents that name a part another content is drawn as, by the part they name. */
  readonly twins: ReadonlyMap<Id, string>;
}

/** What Anchor parts… would do to a solid's parts, which the dialog shows before it applies. */
export type SolidAnchorPlan = SolidDrawingParts & PlannedParts;

export type SolidAnchorPlanning =
  | { readonly ok: true; readonly plan: SolidAnchorPlan }
  | { readonly ok: false; readonly problem: Problem };

/**
 * The parts of a drawing with parts that shows a solid, each with the content drawn as it now, and
 * its contents, through the view's nesting relation types or, without one, every one. `undefined`
 * when the element is not one, or shows no solid with its parts that a package defines.
 */
export function solidDrawingPartsOf(
  state: ProjectSnapshot,
  drawing: Id,
  view?: ViewFile,
): SolidDrawingParts | undefined {
  const element = modelIndexOf(state).element(drawing);
  if (!element || element.id === state.model.world.id) return undefined;
  const definitions = definitionsIn(state);
  const shown = solidShownBy(element, definitions);
  if (shown?.placement !== 'parts') return undefined;
  const solid = solidsIn(state).solid(shown.solid)?.definition;
  if (!solid) return undefined;
  const contents = contentsOf(state, drawing, view);
  const names = new Set(solid.parts.map((part) => part.name));
  const drawnAs = new Map<string, AnchorContent>();
  const twins = new Map<Id, string>();
  for (const content of contents) {
    const reference = appearanceOf(content, definitions).part;
    if (!reference || reference.image !== undefined) continue;
    if (reference.solid !== undefined && reference.solid !== solid.id) continue;
    if (!names.has(reference.part)) continue;
    if (drawnAs.has(reference.part)) twins.set(content.id, reference.part);
    else drawnAs.set(reference.part, { id: content.id, name: content.name });
  }
  return {
    drawing: { id: element.id, name: element.name },
    solid: { id: solid.id, name: solid.name },
    parts: solid.parts.map((part, index): PlannedSolidPart => {
      const anchored = drawnAs.get(part.name);
      return {
        part: {
          id: part.name,
          index,
          ...(part.parent === undefined ? {} : { parent: part.parent }),
        },
        anchor: anchored ? { kind: 'kept', element: anchored } : { kind: 'unmatched' },
      };
    }),
    contents: contents.map((each) => ({ id: each.id, name: each.name })),
    twins,
  };
}

/**
 * Plans Anchor parts… for a drawing that shows a solid with its parts: which content each of the
 * solid's parts is matched to, and which get an element of their own, as `anchoringCommand` then does
 * in one action, `Anchor 6 parts of "Arm"`.
 */
export function planSolidAnchoring(
  state: ProjectSnapshot,
  request: AnchorRequest,
): SolidAnchorPlanning {
  return planDrawnParts(state, request, {
    drawn: (element: Element, view) => solidDrawingPartsOf(state, element.id, view),
    notDrawing: (element) =>
      `The element "${element.name}" is no drawing with parts: it does not show a solid with its parts.`,
    noPart: (element, id) => `The solid of "${element.name}" has no part "${id}".`,
  });
}
