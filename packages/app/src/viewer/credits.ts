/**
 * What the packages a project uses say of themselves for attribution (ADR 0047): their version,
 * license and attribution where their files give them, and where their images come from. A read-only
 * page shows them in its About panel, so that attribution travels with what is shared.
 */
import { builtinPackage, type ProjectSnapshot } from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';

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

/** The fields a package file may give for attribution, read only when they are text. */
type Attributed = PackageFile & Partial<Record<'version' | 'license' | 'attribution', unknown>>;

/** The credits of the packages a project uses, in its order. */
export function creditsOf(project: ProjectSnapshot): PackageCredit[] {
  return project.packages.map((pkg) => {
    const extra = pkg as Attributed;
    const sources = new Set<string>();
    for (const image of pkg.images ?? []) {
      const license = (image as { license?: unknown }).license;
      const said = [image.source, typeof license === 'string' ? license : undefined]
        .filter((part): part is string => typeof part === 'string' && part !== '')
        .join(', ');
      if (said !== '') sources.add(said);
    }
    return {
      id: pkg.id,
      name: pkg.name,
      builtIn: builtinPackage(pkg.id) !== undefined,
      ...(typeof extra.version === 'string' ? { version: extra.version } : {}),
      ...(typeof extra.license === 'string' ? { license: extra.license } : {}),
      ...(typeof extra.attribution === 'string' ? { attribution: extra.attribution } : {}),
      imageSources: [...sources],
    };
  });
}
