/**
 * How the built-in packages say what they are shared under (ADR 0047, ADR 0051). What Visual Anything
 * writes and draws itself, its packages and their icons, is dedicated to the public domain, so that
 * every view, export and read-only page made with them can be shared without any notice.
 */

/** The license of everything Visual Anything writes and draws itself. */
export const OWN_LICENSE = 'CC0-1.0';

/** Whom the built-in packages credit. */
export const OWN_ATTRIBUTION = 'Visual Anything contributors';

/** Where the icons Visual Anything draws itself come from. */
export const OWN_SOURCE = 'Drawn for Visual Anything';

/** What every built-in package written by Visual Anything says about its license. */
export const OWN_CREDITS = { license: OWN_LICENSE, attribution: OWN_ATTRIBUTION } as const;
