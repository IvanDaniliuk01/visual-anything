/**
 * What the packages a project uses say of themselves for attribution (ADR 0047): their version,
 * license and attribution where their files give them, and where their images come from and under
 * which license. A read-only page shows them in its About panel, so that attribution travels with
 * what is shared.
 */
import { builtinPackage, type ProjectSnapshot } from '@visual-anything/core';

/** What a package says of itself for attribution. */
export interface PackageCredit {
  id: string;
  name: string;
  builtIn: boolean;
  version?: string;
  license?: string;
  attribution?: string;
  /** Where its images come from and the licenses they give, each said once. */
  imageSources: string[];
}

/** The credits of the packages a project uses, in its order. */
export function creditsOf(project: ProjectSnapshot): PackageCredit[] {
  return project.packages.map((pkg) => {
    const sources = new Set<string>();
    for (const image of pkg.images ?? []) {
      const said = [image.source, image.license]
        .filter((part): part is string => typeof part === 'string' && part !== '')
        .join(', ');
      if (said !== '') sources.add(said);
    }
    return {
      id: pkg.id,
      name: pkg.name,
      builtIn: builtinPackage(pkg.id) !== undefined,
      ...(typeof pkg.version === 'string' ? { version: pkg.version } : {}),
      ...(typeof pkg.license === 'string' ? { license: pkg.license } : {}),
      ...(typeof pkg.attribution === 'string' ? { attribution: pkg.attribution } : {}),
      imageSources: [...sources],
    };
  });
}
