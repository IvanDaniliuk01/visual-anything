/** Commands on the project itself: its name, description and the packages it uses. */
import { builtinPackage } from '../builtin';
import { packageUsers } from '../rules';
import { reject, requireList, requireName, type Draft } from './draft';
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
