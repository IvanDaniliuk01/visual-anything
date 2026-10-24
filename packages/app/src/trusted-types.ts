/**
 * The page's Trusted Types policy, installed before anything else runs. Where the browser enforces
 * Trusted Types, as the built app's content security policy asks, every string that would become HTML,
 * a script or a script's address goes through this policy first: HTML only as the empty string, which
 * PixiJS uses to empty an element, scripts only from the page's own origin, which its workers need, and
 * no script made from text. A dependency that turns text into HTML then throws instead, backing up the
 * lint rules that keep the app's own code from doing so.
 */

/** What the policy lets through. */
export interface TrustedTypesRules {
  createHTML(input: string): string;
  createScriptURL(input: string): string;
  createScript(input: string): string;
}

/** Where the page comes from. */
export interface PageLocation {
  origin: string;
  href: string;
}

/** The rules of the policy for a page. */
export function trustedTypesRules(location: PageLocation): TrustedTypesRules {
  return {
    createHTML: (input) => {
      if (input === '') return input;
      throw new TypeError('Visual Anything turns no text into HTML.');
    },
    createScriptURL: (input) => {
      let url: URL;
      try {
        url = new URL(input, location.href);
      } catch {
        throw new TypeError(`Visual Anything loads no script from "${input}".`);
      }
      if (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        url.origin === location.origin
      ) {
        return input;
      }
      throw new TypeError(
        `Visual Anything loads scripts only from its own origin, not from "${input}".`,
      );
    },
    createScript: () => {
      throw new TypeError('Visual Anything runs no script made from text.');
    },
  };
}

/** The part of a window that installing the policy needs. */
export interface TrustedTypesHost {
  trustedTypes?: { createPolicy(name: string, rules: TrustedTypesRules): unknown };
  location: PageLocation;
}

/**
 * Installs the policy as the page's `default` policy where the browser has Trusted Types, and says
 * whether it did. When a default policy already exists, it stays: the browser then refuses every
 * string that policy refuses, so the page still fails closed.
 */
export function installTrustedTypes(host: TrustedTypesHost): boolean {
  if (host.trustedTypes === undefined) return false;
  try {
    host.trustedTypes.createPolicy('default', trustedTypesRules(host.location));
    return true;
  } catch {
    return false;
  }
}

installTrustedTypes(window);
