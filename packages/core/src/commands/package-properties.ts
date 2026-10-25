/**
 * The checks on what a package says about itself beyond its definitions (ADR 0047): its description,
 * its version, its license and its attribution, each optional, as every command that sets them does
 * them.
 */
import type { PackageFile } from '@visual-anything/schema';
import { MAX_ATTRIBUTION, isLicenseId, isPackageVersion } from '../licenses';
import { reject } from './draft';

/** What a package may say about itself, each checked; `undefined` where it says nothing. */
export type PackageAbout = Pick<PackageFile, 'description' | 'version' | 'license' | 'attribution'>;

export function checkedPackageDescription(value: unknown): string | undefined {
  if (value !== undefined && typeof value !== 'string') {
    reject('invalid-command', 'A package’s description is text.');
  }
  return value;
}

export function checkedVersion(value: unknown): string | undefined {
  if (value !== undefined && !isPackageVersion(value)) {
    reject('invalid-command', 'A package’s version is a semantic version, such as 1.2.0.');
  }
  return value;
}

export function checkedLicense(value: unknown): string | undefined {
  if (value !== undefined && !isLicenseId(value)) {
    reject(
      'invalid-command',
      'A package’s license is an SPDX license identifier, such as CC0-1.0 or MIT.',
    );
  }
  return value;
}

export function checkedAttribution(value: unknown): string | undefined {
  if (
    value !== undefined &&
    (typeof value !== 'string' || value.length === 0 || value.length > MAX_ATTRIBUTION)
  ) {
    reject('invalid-command', 'A package’s attribution is text of 1 to 2,000 characters.');
  }
  return value;
}

/** Checks everything a package says about itself besides its id, name and definitions. */
export function checkedPackageAbout(
  given: Partial<Record<keyof PackageAbout, unknown>>,
): PackageAbout {
  return {
    description: checkedPackageDescription(given.description),
    version: checkedVersion(given.version),
    license: checkedLicense(given.license),
    attribution: checkedAttribution(given.attribution),
  };
}
