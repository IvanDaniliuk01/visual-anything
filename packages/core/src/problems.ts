import type { Id } from '@visual-anything/schema';

/** What kind of problem a command or a project has. Stable, so programs and Claude can act on it. */
export type ProblemCode =
  | 'invalid-command'
  | 'invalid-id'
  | 'id-taken'
  | 'empty-name'
  | 'unknown-element'
  | 'unknown-relation'
  | 'unknown-end'
  | 'unknown-component'
  | 'unknown-relation-type'
  | 'unknown-package'
  | 'unknown-view'
  | 'unknown-scenario'
  | 'unknown-free-shape'
  | 'unknown-position'
  | 'unknown-step-relation'
  | 'world-not-allowed'
  | 'containment-cycle'
  | 'nesting-end-not-element'
  | 'not-nesting'
  | 'limit-broken'
  | 'unknown-parent'
  | 'derivation-cycle'
  | 'id-outside-package'
  | 'defined-twice'
  | 'built-in-package'
  | 'in-use'
  // Images: refused, changed by cleaning, or warned about on open.
  | 'invalid-image'
  | 'image-too-large'
  | 'image-cleaned'
  | 'image-not-clean'
  | 'unknown-image'
  | 'large-images'
  // Refusals of the local program, which keeps the history and the files.
  | 'nothing-to-undo'
  | 'nothing-to-redo'
  | 'project-closed'
  | 'invalid-file'
  | 'changed-on-disk'
  | 'not-saved'
  | 'program-failed';

/** Something wrong with a command or a project, in words, with the ids it concerns. */
export interface Problem {
  code: ProblemCode;
  message: string;
  /** The elements, relations, definitions, views or scenarios the problem is about. */
  subjects?: Id[];
}

/** Makes a problem. */
export function problem(code: ProblemCode, message: string, subjects?: readonly Id[]): Problem {
  return subjects && subjects.length > 0
    ? { code, message, subjects: [...subjects] }
    : { code, message };
}
