/**
 * Use this view (ADR 0075): turning changes nothing stored, and Use this view keeps where the solid is
 * seen from, its camera, in the appearance that shows the solid, at the level the project can change,
 * in one undoable action:
 *
 * - the element's own appearance, when it names the solid itself (`update-element`);
 * - otherwise its component's appearance, as the project can change it (`set-component-appearance`,
 *   ADR 0034): the project appearance for a built-in component, the component itself for one of the
 *   project's own. The solid its shapes show is set there whole, with the new camera, so that a solid
 *   inherited from further up is kept as it is shown.
 */
import {
  definitionsIn,
  editableAppearanceOf,
  solidShownBy,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { AppearanceSolid, Id, SolidCamera } from '@visual-anything/schema';
import { sameTurnCamera } from './turning';

/** The camera as it is stored: with what it leaves out at its defaults left out. */
export function storedCamera(camera: SolidCamera): SolidCamera {
  const stored: SolidCamera = { azimuth: camera.azimuth, elevation: camera.elevation };
  if (camera.zoom !== undefined && camera.zoom !== 1) stored.zoom = camera.zoom;
  if (camera.target !== undefined) stored.target = camera.target;
  if (camera.projection !== undefined && camera.projection !== 'perspective') {
    stored.projection = camera.projection;
  }
  return stored;
}

/**
 * The command Use this view sends for an element's solid seen from `camera`; none when the element
 * shows no solid, shows another one than `solid`, or already shows it from this camera.
 */
export function commandForThisView(
  state: ProjectSnapshot,
  elementId: Id,
  solid: Id,
  camera: SolidCamera,
): Command | undefined {
  const element =
    state.model.world.id === elementId
      ? state.model.world
      : state.model.elements.find((each) => each.id === elementId);
  if (!element) return undefined;
  const definitions = definitionsIn(state);
  const shown = solidShownBy(element, definitions);
  if (!shown || shown.solid !== solid) return undefined;
  const stored = storedCamera(camera);
  // The camera it is seen from now: its appearance's, or else the solid's own.
  const own = state.packages
    .flatMap((file) => file.solids ?? [])
    .find((each) => each.id === solid)?.camera;
  const current = shown.camera ?? own;
  if (current && sameTurnCamera(storedCamera(current), stored)) return undefined;
  const next: AppearanceSolid = { ...shown, camera: stored };
  const ownSolid = element.appearance?.solid;
  if (ownSolid !== undefined && ownSolid !== 'none') {
    return {
      type: 'update-element',
      id: element.id,
      changes: { appearance: { ...element.appearance, solid: next } },
    };
  }
  const editable = editableAppearanceOf(state, 'component', element.component);
  if (!editable) return undefined;
  return {
    type: 'set-component-appearance',
    component: element.component,
    appearance: { ...editable.appearance, solid: next },
  };
}
