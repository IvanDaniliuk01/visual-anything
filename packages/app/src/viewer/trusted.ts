/**
 * The read-only page's Trusted Types policy, installed before anything else of the viewer runs. The
 * page's content security policy requires it (ADR 0041), so every string that would become HTML, a
 * script or a script's address goes through it: HTML only as the empty string, which PixiJS uses to
 * empty an element, and no script and no script's address at all, since the page starts no worker
 * and loads nothing. A dependency that turns text into HTML then throws instead.
 */

/** What the policy lets through. */
export interface PageTrustedTypesRules {
  createHTML(input: string): string;
  createScriptURL(input: string): string;
  createScript(input: string): string;
}

export const PAGE_TRUSTED_TYPES: PageTrustedTypesRules = {
  createHTML: (input) => {
    if (input === '') return input;
    throw new TypeError('This page turns no text into HTML.');
  },
  createScriptURL: (input) => {
    throw new TypeError(`This page loads no script, so not "${input}".`);
  },
  createScript: () => {
    throw new TypeError('This page runs no script made from text.');
  },
};

/** The part of a window that installing the policy needs. */
export interface PageTrustedTypesHost {
  trustedTypes?: { createPolicy(name: string, rules: PageTrustedTypesRules): unknown };
}

/**
 * Installs the policy as the page's `default` policy where the browser has Trusted Types, and says
 * whether it did. When one already exists, it stays, and the browser refuses what it refuses.
 */
export function installPageTrustedTypes(host: PageTrustedTypesHost): boolean {
  if (host.trustedTypes === undefined) return false;
  try {
    host.trustedTypes.createPolicy('default', PAGE_TRUSTED_TYPES);
    return true;
  } catch {
    return false;
  }
}
