/**
 * What opening a project says about its faces (ADR 0083). As for images, opening only warns: a face
 * the subset refuses or past its caps is drawn as the shape's name, and the warning says where it is.
 * Faces are checked where they are set, on the component or the element that sets a part of one, as
 * that component's shapes would show it.
 */
import type { Appearance, Id, PackageFile } from '@visual-anything/schema';
import { utf8 } from '../code/hash';
import { resolveAppearance, type ResolvedAppearance } from '../appearance';
import type { Definitions, ResolvedComponent } from '../definitions';
import { problem, type Problem } from '../problems';
import { projectAppearanceOf } from '../project-appearances';
import type { ProjectSnapshot } from '../snapshot';
import { faceProblems } from './check';
import { FACE_CAPS } from './limits';
import { facePalette } from './palette';
import { faceProblemOf } from './problems';

/** The most warnings one face gives, so that a broken face does not bury the rest. */
const MAX_WARNINGS_PER_FACE = 10;

export function faceWarnings(state: ProjectSnapshot, definitions: Definitions): Problem[] {
  const warnings: Problem[] = [];
  const check = (
    appearance: ResolvedAppearance,
    component: ResolvedComponent,
    attributes: ReadonlySet<string>,
    of: string,
    subject: Id,
  ) => {
    const face = appearance.face;
    if (face === undefined) return;
    const problems = faceProblems(face, {
      attributes,
      palettes: {
        light: facePalette('light', appearance.fill, appearance.stroke),
        dark: facePalette(
          'dark',
          appearance.fill === component.appearance.fill
            ? component.darkColors.fill
            : appearance.fill,
          appearance.stroke === component.appearance.stroke
            ? component.darkColors.stroke
            : appearance.stroke,
        ),
      },
    });
    for (const found of problems.slice(0, MAX_WARNINGS_PER_FACE)) {
      warnings.push(faceProblemOf(found, of, [subject]));
    }
    if (problems.length > MAX_WARNINGS_PER_FACE) {
      warnings.push(
        problem(
          problems[MAX_WARNINGS_PER_FACE]!.code,
          `The face of ${of} has ${problems.length - MAX_WARNINGS_PER_FACE} more problems.`,
          [subject],
        ),
      );
    }
  };
  const setsFace = (appearance: Appearance | undefined) =>
    appearance?.face !== undefined && appearance.face !== null && appearance.face !== 'none';

  for (const [id, defined] of definitions.components) {
    const sets =
      setsFace(defined.definition.appearance) ||
      setsFace(projectAppearanceOf(state, 'component', id));
    const component = definitions.component(id);
    if (!sets || component === undefined) continue;
    check(
      component.appearance,
      component,
      new Set(component.attributes.map((each) => each.name)),
      `the component "${component.name}"`,
      id,
    );
  }
  for (const element of state.model.elements) {
    if (!setsFace(element.appearance)) continue;
    const component = definitions.component(element.component);
    if (component === undefined) continue;
    const attributes = new Set([
      ...component.attributes.map((each) => each.name),
      ...Object.keys(element.attributes ?? {}),
    ]);
    check(
      resolveAppearance([element.appearance], component.appearance),
      component,
      attributes,
      `the element "${element.name}"`,
      element.id,
    );
  }
  for (const file of state.packages) {
    const bytes = packageFaceBytes(file);
    if (bytes > FACE_CAPS.packageBytes) {
      warnings.push(
        problem(
          'face-too-large',
          `The package "${file.name}" holds ${Math.ceil(bytes / 1024)} KiB of faces, past the 512 KiB a package may hold.`,
          [file.id],
        ),
      );
    }
  }
  return warnings;
}

/** The bytes of the faces a package's components hold: their markup and style. */
function packageFaceBytes(file: PackageFile): number {
  let bytes = 0;
  for (const component of file.components) {
    const face = component.appearance?.face;
    if (face === undefined || face === 'none') continue;
    const lines = [
      ...(face.markup ?? []),
      ...(face.style ?? []),
      ...(face.variants ?? []).flatMap((variant) => variant.markup),
    ];
    for (const line of lines) bytes += utf8(line).length + 1;
  }
  return bytes;
}
