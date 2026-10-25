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
  // A value a command sets that is outside what its trait or attribute allows.
  | 'invalid-appearance'
  | 'invalid-attribute'
  | 'unknown-attribute'
  | 'name-taken'
  | 'position-of-row'
  // A value outside the choices of its attribute: only a warning.
  | 'choice-broken'
  // A project appearance for a definition the project defines itself, or that no package defines,
  // which has no effect: only a warning.
  | 'appearance-not-used'
  // A project saved by a newer Visual Anything.
  | 'newer-format'
  // Routes chosen by hand (ADR 0039): a connection point the end does not have, an end that takes no
  // attachment, and a relation the view draws as containment rather than as a line.
  | 'unknown-connection-point'
  | 'end-does-not-fit'
  | 'not-drawn-as-line'
  // Images (M3b), which a package defines and appearances show.
  | 'unknown-image'
  | 'invalid-image'
  | 'image-not-clean'
  | 'image-too-large'
  | 'image-cleaned'
  | 'large-images'
  // Package code (ADR 0054): code a command refuses or a project holds that cannot run, and what
  // its hooks do that only warns.
  | 'invalid-code'
  | 'code-not-approved'
  | 'code-failed'
  | 'code-stopped'
  | 'code-off'
  | 'code-answer-dropped'
  | 'code-check'
  // Comments (ADR 0059): a thread or comment that is not there, a comment whose author is missing
  // or not the one who writes, text a comment cannot hold, and, only a warning, a mention of what
  // the model does not hold.
  | 'unknown-thread'
  | 'unknown-comment'
  | 'no-comment-author'
  | 'invalid-author'
  | 'not-your-comment'
  | 'invalid-comment'
  | 'unknown-mention'
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
