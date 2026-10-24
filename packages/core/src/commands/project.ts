/** Commands on the project itself: its name, description and the packages it uses. */
import { builtinPackage } from '../builtin';
import { packageUsers } from '../rules';
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
    const wanted = requireList(changes.packages, 'packages');
    if (new Set(wanted).size !== wanted.length) {
      reject('invalid-command', 'A package is listed twice.');
    }
    const current = new Set(draft.state.project.packages);
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
