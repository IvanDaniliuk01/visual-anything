/**
 * The physical-space panel's legend (ADR 0076): the parts of the open view's legend (ADR 0055) whose
 * overlays color something the panel draws. The panel draws an overlay's fill and opacity on the
 * elements it shows, and not its stroke, size or badges, which are the canvas's; an overlay colors
 * something there when, for some element the panel draws, it is the one whose fill or opacity the
 * element takes, as the canvas's overlays take the first that maps its value for each channel.
 */
import { overlayApplies, overlayValue, type Legend, type Space } from '@visual-anything/core';
import type { Id, JsonValue, Overlay } from '@visual-anything/schema';

/** How an element's attribute is read, live and computed values included. */
export type SpaceAttributeValue = (element: Id, attribute: string) => JsonValue | undefined;

/** Whether the panel draws an overlay of this channel. */
function drawnInSpace(overlay: Overlay): boolean {
  return (
    overlayApplies(overlay, 'elements') &&
    (overlay.channel === 'fill' || overlay.channel === 'opacity')
  );
}

/**
 * The overlays, by id, that give some element the panel draws its fill or its opacity: each entry and
 * each container drawn faintly, as the collapsed container it is drawn as when there is one.
 */
export function overlaysColoringSpace(
  space: Pick<Space, 'entries' | 'faint'>,
  overlays: readonly Overlay[] | undefined,
  valueOf: SpaceAttributeValue,
): ReadonlySet<Id> {
  const coloring = new Set<Id>();
  const drawn = (overlays ?? []).filter(drawnInSpace);
  if (drawn.length === 0) return coloring;
  const seen = new Set<Id>();
  for (const entries of [space.entries, space.faint]) {
    for (const entry of entries.values()) {
      const element = entry.drawnAs ?? entry.element;
      if (seen.has(element)) continue;
      seen.add(element);
      const taken = new Set<Overlay['channel']>();
      for (const overlay of drawn) {
        if (taken.has(overlay.channel)) continue;
        if (overlayValue(overlay, valueOf(element, overlay.attribute)) === undefined) continue;
        taken.add(overlay.channel);
        coloring.add(overlay.id);
      }
      if (coloring.size === drawn.length) return coloring;
    }
  }
  return coloring;
}

/** The parts of a view's legend that the panel shows: those of the overlays coloring something in it. */
export function spaceLegendOf(legend: Legend, coloring: ReadonlySet<Id>): Legend {
  if (coloring.size === 0) return NO_LEGEND;
  const overlays = legend.overlays.filter((part) => coloring.has(part.id));
  return overlays.length === legend.overlays.length ? legend : { overlays };
}

const NO_LEGEND: Legend = { overlays: [] };
