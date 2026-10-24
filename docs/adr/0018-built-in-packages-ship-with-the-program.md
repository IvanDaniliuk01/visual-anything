---
status: accepted
---

# Built-in packages ship with Visual Anything; projects use them by id

The packages built into Visual Anything, starting with Systems, live in the program, in `core`. A project uses one by listing its id in its `.vaproject` file; the package is never copied into the project folder. The folder's `packages/` holds only the packages the project defines itself, and none of them may take the id of a built-in one. Essence and "relates to", the roots every definition derives from, are built into `core` as well and belong to no package. We chose this so that a new project starts with the Systems package without carrying a copy of it, so that improving a built-in package improves every project that uses it, and so that a project's own definitions are clearly the ones in its folder.

## Considered options

- **Copy each built-in package into the projects that use it**: rejected. Every project would carry a copy that drifts from the program's, and git diffs would show changes nobody made.
- **Let a project's package override a built-in one with the same id**: rejected. Two packages with one id make it unclear which definitions a project uses.

## Consequences

Sharing a project assumes the recipient's Visual Anything has the built-in packages it lists. Changing a built-in package in a way that breaks projects needs a version and a migration, which v0.1 does not have.
