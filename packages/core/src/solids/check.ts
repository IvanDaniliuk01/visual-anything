/**
 * Checking a project's solids as read from its files (ADR 0075). The core sees only definitions:
 * whether each solid's file is there, and whether its bytes are its name's, the local program checks,
 * since only it reads `solids/` (`solid-file-missing`, `solid-not-clean`). Opening never rewrites a
 * file, and nothing here keeps a project from opening but a solid defined twice.
 */
import type { Appearance, Element } from '@visual-anything/schema';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { LARGE_PACKAGE_SOLID_BYTES } from './caps';
import { partSolidId, solidIdOf, solidsIn } from './catalog';

/** What is wrong with a project's solids: errors keep it from opening, warnings do not. */
export function checkSolids(state: ProjectSnapshot): { errors: Problem[]; warnings: Problem[] } {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const catalog = solidsIn(state);
  for (const each of catalog.problems) {
    (each.code === 'defined-twice' ? errors : warnings).push(each);
  }

  // Past 128 MiB of files a package warns; past 256 MiB, or the project's 512 MiB, the later solids,
  // in file order, are drawn as their placeholders.
  for (const file of state.packages) {
    const total = (file.solids ?? []).reduce((sum, solid) => sum + solid.bytes, 0);
    const past = (file.solids ?? []).filter((solid) => catalog.pastTotal.has(solid.id));
    if (total < LARGE_PACKAGE_SOLID_BYTES && past.length === 0) continue;
    const size = `${(total / (1024 * 1024)).toFixed(1)} MiB`;
    warnings.push(
      problem(
        'large-solids',
        past.length === 0
          ? `The solids of the package "${file.name}" name ${size} of files; past 256 MiB they are drawn as placeholders.`
          : `The solids of the package "${file.name}" name ${size} of files; these are drawn as placeholders: ${past.map((solid) => `"${solid.name}"`).join(', ')}.`,
        [file.id, ...past.map((solid) => solid.id)],
      ),
    );
  }

  const checkNamed = (appearance: Appearance | undefined, owner: string, what: string) => {
    const id = solidIdOf(appearance);
    if (id !== undefined && !catalog.solid(id)) {
      warnings.push(
        problem(
          'unknown-solid',
          `${what} shows the solid "${id}", which no package in use defines; it shows none.`,
          [owner],
        ),
      );
    }
    const part = partSolidId(appearance?.part);
    if (part !== undefined) {
      const defined = catalog.solid(part);
      const name = typeof appearance?.part === 'object' ? appearance.part.part : '';
      if (!defined) {
        warnings.push(
          problem(
            'unknown-solid',
            `${what} is drawn as a part of the solid "${part}", which no package in use defines; it is drawn as an ordinary shape.`,
            [owner],
          ),
        );
      } else if (!defined.definition.parts.some((each) => each.name === name)) {
        warnings.push(
          problem(
            'unknown-part',
            `${what} is drawn as the part "${name}" of the solid "${defined.definition.name}", which has no such part; it is drawn as an ordinary shape.`,
            [owner],
          ),
        );
      }
    }
  };
  for (const file of state.packages) {
    for (const component of file.components) {
      checkNamed(component.appearance, component.id, `The component "${component.name}"`);
    }
  }
  for (const [owner, appearance] of Object.entries(state.project.appearances?.components ?? {})) {
    checkNamed(appearance, owner, `The project appearance of "${owner}"`);
  }
  for (const element of [state.model.world, ...state.model.elements] as Element[]) {
    checkNamed(element.appearance, element.id, `The element "${element.name}"`);
  }
  return { errors, warnings };
}
