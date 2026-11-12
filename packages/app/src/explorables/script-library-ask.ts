/**
 * What the person typed to ask for a script library (ADR 0107), read as the program's ask, or what is
 * wrong with it, in English sentences the form shows through the Spanish catalog: the npm package as
 * the registry writes it, one exact version, and the file and global when given, as the schema takes
 * them.
 */
import type { ScriptLibraryAsk } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** An npm package's name, as the schema takes it. */
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
/** An exact version, as the schema takes it. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
/** A global's name, as the schema takes it. */
const GLOBAL = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;

/** What the person typed, read as an ask, or what is wrong with it, in the words the form shows. */
export function readScriptLibraryAsk(form: {
  package: Id | undefined;
  npm: string;
  version: string;
  path: string;
  global: string;
}): { ok: true; ask: ScriptLibraryAsk } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const npm = form.npm.trim();
  const version = form.version.trim();
  const path = form.path.trim();
  const global = form.global.trim();
  if (form.package === undefined)
    problems.push('The project has no package of its own to keep it in.');
  if (npm.length === 0 || npm.length > 214 || !NPM_NAME.test(npm)) {
    problems.push('Name an npm package as the registry writes it, such as d3 or @scope/name.');
  }
  if (version.length > 100 || !EXACT_VERSION.test(version)) {
    problems.push('Give one exact version, such as 7.9.0: not a range, and not “latest”.');
  }
  if (path.length > 500) problems.push('The file’s path takes at most 500 characters.');
  if (global !== '' && !GLOBAL.test(global)) {
    problems.push('A global is a JavaScript name, such as d3 or Plotly.');
  }
  if (problems.length > 0 || form.package === undefined) return { ok: false, problems };
  return {
    ok: true,
    ask: {
      package: form.package,
      npm,
      version,
      ...(path === '' ? {} : { path }),
      ...(global === '' ? {} : { global }),
    },
  };
}
