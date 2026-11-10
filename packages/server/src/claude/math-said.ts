/**
 * What a change of Claude's says of the Math it wrote (ADR 0106): each text it set that holds Math, as
 * a `reads-as-math` notice, and each piece of Math in them that cannot be typeset, as a `math-error`
 * warning, with the core's own messages. Only the texts the change wrote or changed are read, so that
 * an answer tells of its own and never of the rest of the project.
 */
import {
  definitionsIn,
  emphasisTexts,
  mathFindingsIn,
  type Command,
  type EmphasisTextOf,
  type ProjectSnapshot,
} from '@visual-anything/core';

/** What the answer of a change adds about its Math. */
export interface MathSaid {
  /** `math-error`: Math the change wrote that is drawn as its TeX. */
  warnings: string[];
  /** `reads-as-math`: the texts the change wrote that hold Math. */
  notices: string[];
}

/**
 * Whether a command can write Math: it holds a dollar sign, a `math` fence, or makes an attribute take
 * text emphasis, which can turn the dollars of its values into Math. Any other command is not read.
 */
export function mayWriteMath(command: Command): boolean {
  return /\$|math|emphasis/.test(JSON.stringify(command));
}

/** A text by what it belongs to and what it says, so that renaming its item does not make it new. */
function keyOf(each: EmphasisTextOf): string {
  return `${each.subject ?? ''}\n${each.blocks ? 'b' : 'l'}\n${each.text}`;
}

/**
 * What the change from `before` to `after` says of its Math: the texts of `after` that take text
 * emphasis and that `before` did not hold as they are, checked as the core checks a project's. Without
 * `before`, every text of `after` is read.
 */
export function mathSaid(before: ProjectSnapshot | undefined, after: ProjectSnapshot): MathSaid {
  const held = new Set<string>();
  if (before !== undefined) {
    for (const each of emphasisTexts(before, definitionsIn(before))) held.add(keyOf(each));
  }
  const written = function* () {
    for (const each of emphasisTexts(after, definitionsIn(after))) {
      if (!held.has(keyOf(each))) yield each;
    }
  };
  const found = mathFindingsIn(written());
  return {
    warnings: found.warnings.map((each) => each.message),
    notices: found.notices.map((each) => each.message),
  };
}
