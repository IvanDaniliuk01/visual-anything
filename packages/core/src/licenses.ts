/**
 * The licenses under which what ships with Visual Anything may be shared (ADR 0047), and the check
 * that every built-in package and every image in it says which one it is under. A project's own
 * packages are the person's: Visual Anything never checks their licenses.
 */
import type { PackageFile } from '@visual-anything/schema';

/**
 * The licenses content that ships may be under, by SPDX identifier: redistributable whatever license
 * Visual Anything itself takes. Share-alike, non-commercial and no-derivatives terms are not among
 * them, nor are icon sets whose terms differ from their code's.
 */
export const SHIPPABLE_LICENSES = [
  'CC0-1.0',
  'CC-BY-4.0',
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  // The public domain, marked or dedicated (ADR 0079).
  'CC-PDM-1.0',
  'LicenseRef-public-domain',
] as const;

/** How a license is written in files: an SPDX identifier, as the schema's `LicenseId` says. */
export const LICENSE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/;

/** How a package's version is written: a semantic version, as the schema's `PackageVersion` says. */
export const VERSION_PATTERN =
  /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})(-[0-9A-Za-z-]{1,32}(\.[0-9A-Za-z-]{1,32}){0,7})?$/;

/** The longest attribution a package may have, in characters. */
export const MAX_ATTRIBUTION = 2000;

/** Whether a value is a license written as files write one. */
export function isLicenseId(value: unknown): value is string {
  return typeof value === 'string' && LICENSE_PATTERN.test(value);
}

/** Whether a value is a package's version written as files write one. */
export function isPackageVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION_PATTERN.test(value);
}

/** A license content that ships may be under. */
export type ShippableLicense = (typeof SHIPPABLE_LICENSES)[number];

const SHIPPABLE: ReadonlySet<string> = new Set(SHIPPABLE_LICENSES);

/** Whether content under this license, written as its SPDX identifier, may ship. */
export function isShippableLicense(license: string | undefined): license is ShippableLicense {
  return license !== undefined && SHIPPABLE.has(license);
}

/**
 * What keeps a package from shipping with Visual Anything, in words; empty when nothing does. The
 * package needs a license that lets it ship and an attribution, and each of its images a source and
 * a license that lets it ship, and each of its solids a source, such a license and a description.
 */
export function shippingProblems(file: PackageFile): string[] {
  const problems: string[] = [];
  const licensed = (what: string, license: string | undefined) => {
    if (license === undefined) problems.push(`${what} has no license.`);
    else if (!isShippableLicense(license)) {
      problems.push(`${what} is under ${license}, which is not a license that lets it ship.`);
    }
  };
  licensed(`The package "${file.id}"`, file.license);
  if ((file.attribution ?? '').trim() === '') {
    problems.push(
      `The package "${file.id}" says nothing about whom to credit: it needs an attribution.`,
    );
  }
  for (const image of file.images ?? []) {
    if ((image.source ?? '').trim() === '') {
      problems.push(
        `The image "${image.id}" says nothing about where it comes from: it needs a source.`,
      );
    }
    licensed(`The image "${image.id}"`, image.license);
  }
  // A solid's description is its text alternative, which every solid that ships has (ADR 0075).
  for (const solid of file.solids ?? []) {
    if ((solid.source ?? '').trim() === '') {
      problems.push(
        `The solid "${solid.id}" says nothing about where it comes from: it needs a source.`,
      );
    }
    licensed(`The solid "${solid.id}"`, solid.license);
    if ((solid.description ?? '').trim() === '') {
      problems.push(`The solid "${solid.id}" has no description, which is its text alternative.`);
    }
  }
  return problems;
}
