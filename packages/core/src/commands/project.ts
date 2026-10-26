/** Commands on the project itself: its name, description and the packages it uses. */
import type { Id } from '@visual-anything/schema';
import { builtinPackage } from '../builtin';
import { packageNeeds } from '../package-sharing';
import { packageUsers } from '../rules';
import type { ProjectSnapshot } from '../snapshot';
import { withoutEntries } from './appearance';
import { reject, requireList, requireName, sameJson, type Draft } from './draft';
import type { UpdateProjectCommand } from './types';

export function updateProject(draft: Draft, command: UpdateProjectCommand): string {
  const { changes } = command;
  const next = { ...draft.state.project };
  if (changes.name !== undefined) next.name = requireName(changes.name, 'A project');
  if (changes.description === null) delete next.description;
  else if (changes.description !== undefined) next.description = changes.description;

  if (changes.packages !== undefined) {
    const listed = requireList(changes.packages, 'packages');
    if (new Set(listed).size !== listed.length) {
      reject('invalid-command', 'A package is listed twice.');
    }
    const current = new Set(draft.state.project.packages);
    const wanted = withBuiltInNeeds(draft, listed, current);
    // The project appearances of the definitions of a package it stops using go with it.
    const leaving = draft.state.packages.filter(
      (file) => current.has(file.id) && !wanted.includes(file.id),
    );
    const appearances = withoutEntries(
      next.appearances,
      new Set(leaving.flatMap((file) => file.components.map((each) => each.id))),
      new Set(leaving.flatMap((file) => file.relationTypes.map((each) => each.id))),
    );
    if (appearances === undefined) delete next.appearances;
    else if (!sameJson(appearances, next.appearances)) next.appearances = appearances;
    for (const id of draft.state.project.packages) {
      if (wanted.includes(id)) continue;
      const users = packageUsers(draft.state, id);
      if (users.length > 0) {
        reject(
          'in-use',
          `The project cannot stop using the package "${id}": ${users.length} of its elements, relations or definitions come from it.`,
          users,
        );
      }
      draft.apply({ op: 'remove', collection: { name: 'packages' }, key: id });
    }
    for (const id of wanted) {
      if (current.has(id)) continue;
      const builtin = builtinPackage(id);
      if (!builtin) {
        reject('unknown-package', `There is no built-in package "${id}" to use.`, [id]);
      }
      draft.apply({
        op: 'insert',
        collection: { name: 'packages' },
        index: draft.state.packages.length,
        item: builtin,
      });
    }
    next.packages = [...wanted];
  }
  draft.apply({ op: 'set-project', project: next });
  return changes.packages !== undefined
    ? 'Change the packages in use'
    : `Edit the project "${next.name}"`;
}

/**
 * The packages listed, with the built-in packages that a built-in package starting to be used needs
 * and the list leaves out, each just before the first that needs it, as `add-package` starts using
 * them (ADR 0051): Machine learning's Model derives from Data science pipelines' (ADR 0079). What a
 * built-in package needs is read from it alone, so that a list that drops what it needs keeps it.
 */
function withBuiltInNeeds(draft: Draft, listed: readonly Id[], current: ReadonlySet<Id>): Id[] {
  let alone: ProjectSnapshot | undefined;
  const wanted: Id[] = [];
  for (const id of listed) {
    const builtin = current.has(id) ? undefined : builtinPackage(id);
    if (builtin) {
      alone ??= {
        ...draft.state,
        project: { ...draft.state.project, packages: [] },
        packages: [],
      };
      for (const need of packageNeeds(alone, builtin).builtIn) {
        if (!listed.includes(need) && !wanted.includes(need)) wanted.push(need);
      }
    }
    wanted.push(id);
  }
  return wanted;
}
