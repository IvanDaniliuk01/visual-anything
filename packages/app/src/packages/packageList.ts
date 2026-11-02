/**
 * What "Packages…" lists (ADR 0089): each package the project uses, built in or its own, in the
 * order the project lists them, with what it adds and where its code stands.
 */
import { builtinPackage, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, PackageFile } from '@visual-anything/schema';
import type { PackageCodeView } from '../code/context';

/**
 * Where a package's code stands, as the dialog says it: no code; over 256 KiB; waiting for the
 * person's approval; approved, and running or about to; off after its calls stopped; failed to
 * load; or turned off on this computer, which says before anything else.
 */
export type CodeStanding =
  'none' | 'too-large' | 'waiting' | 'approved' | 'running' | 'off' | 'failed' | 'turned-off';

/** One package of the list. */
export interface PackageRow {
  file: PackageFile;
  builtIn: boolean;
  /** Its code, where it has some. */
  view?: PackageCodeView;
  standing: CodeStanding;
}

/** Every package the project uses, with where its code stands. */
export function packageRowsOf(
  project: ProjectSnapshot,
  code: ReadonlyMap<Id, PackageCodeView>,
): PackageRow[] {
  return project.packages.map((file) => {
    const view = code.get(file.id);
    return {
      file,
      builtIn: builtinPackage(file.id) !== undefined,
      ...(view === undefined ? {} : { view }),
      standing: standingOf(view),
    };
  });
}

/** Where a package's code stands. */
export function standingOf(view: PackageCodeView | undefined): CodeStanding {
  if (view === undefined) return 'none';
  if (view.turnedOff === true) return 'turned-off';
  switch (view.status.state) {
    case 'too-large':
      return 'too-large';
    case 'unapproved':
      return 'waiting';
    case 'approved':
      if (view.run?.state === 'off') return 'off';
      if (view.run?.state === 'failed') return 'failed';
      return view.run?.state === 'running' ? 'running' : 'approved';
  }
}
