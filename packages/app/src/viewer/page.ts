/**
 * Writing a read-only page (ADR 0041): one HTML file holding the viewer's script and stylesheet
 * inline, the project as data in a `<script type="application/json">` element, which the browser
 * never runs, and a content security policy in a `<meta>` element that lets the page run only its own
 * two inline scripts and use only its own stylesheet, by their hashes, and connect nowhere.
 *
 * A page whose views show solids and holds their files (ADR 0075) also holds the solid worker, with
 * three.js, as the text of a `<script type="text/plain">`, which the browser never runs, and a third
 * inline script that starts it from a `blob:` address of that text, through a Trusted Types policy of
 * its own that lets that one address through. Its policy then allows workers from `blob:` addresses and
 * that Trusted Types policy; a page without solids, or with their pictures only, holds none of it and
 * keeps its policy.
 *
 * A page whose project holds Math (ADR 0106) holds the KaTeX fonts its formulas use, and only those,
 * in its data (`math-families.ts`), which the viewer installs from their bytes: its policy does not
 * change.
 *
 * Pure TypeScript with Web Crypto, so that the app writes a page in the browser and the command line
 * writes the same page in Node.
 */
import type { MathFont } from '@visual-anything/core';
import { PAGE_DATA_ID, type PageData } from './data';
import { mathFontsOfFiles, pageMathFonts } from './math-families';
import { PAGE_THEME_KEY } from './keys';
import { SOLID_WORKER_START } from './solids';

/** The viewer as built: one module script, which loads nothing, and one stylesheet. */
export interface ViewerAssets {
  script: string;
  style: string;
  /**
   * The solid worker as the viewer's build holds it (`solid-worker.js`): one classic script with
   * three.js, which a page holds only when its views show solids whose files it holds.
   */
  solidWorker?: string;
  /**
   * KaTeX's fonts, by family, as the viewer's build writes them beside it (`viewer/fonts/`): a page
   * holds those its project's Math uses (ADR 0106). Without them, a page holds none, and its
   * formulas draw without their glyphs.
   */
  mathFonts?: Partial<Record<MathFont, Uint8Array>>;
}

/** Why a page that holds solids' files cannot be written: the build holds no solid worker. */
export class SolidWorkerMissing extends Error {
  override name = 'SolidWorkerMissing';
}

/** The id of the element that holds the solid worker's text in a page that holds solids' files. */
export const SOLID_WORKER_ID = 'visual-anything-solid-worker';

/** The name of the Trusted Types policy that lets the page start its solid worker, and nothing else. */
export const SOLID_WORKER_POLICY = 'visual-anything-solids';

export { SOLID_WORKER_START };

/**
 * The script that makes the solid worker startable, in a page that holds one: it makes a `blob:`
 * address of the worker's text, a Trusted Types policy that lets that one address through and refuses
 * every other, and the function the viewer starts the worker with. It fetches nothing.
 */
export const SOLID_WORKER_SCRIPT = `(function(){var e=document.getElementById(${JSON.stringify(SOLID_WORKER_ID)});if(!e)return;var u=URL.createObjectURL(new Blob([e.textContent||""],{type:"text/javascript"}));var t=window.trustedTypes,p=t&&t.createPolicy(${JSON.stringify(SOLID_WORKER_POLICY)},{createScriptURL:function(a){if(a===u)return a;throw new TypeError("This page starts no other worker.")}});window[${JSON.stringify(SOLID_WORKER_START)}]=function(){return new Worker(p?p.createScriptURL(u):u,{name:"solids"})}})();`;

/** What a page is made of. */
export interface PageInput {
  assets: ViewerAssets;
  data: PageData;
  /** What the browser's tab says: {@link pageTitle} of the project's name. */
  title: string;
}

/** A page as written. */
export interface WrittenPage {
  html: string;
  /** Its size, in bytes of UTF-8. */
  bytes: number;
  /** Its content security policy, as its `<meta>` element gives it. */
  policy: string;
  /** Whether it is larger than {@link LARGE_PAGE}, which the export says before writing. */
  large: boolean;
  /**
   * How many of its bytes its solids take (ADR 0075): their files or pictures, and the solid worker
   * with three.js when it holds one; 0 for a page without solids.
   */
  solidBytes: number;
}

/** The size past which the export says, before writing, that a page is large: 25 MB. */
export const LARGE_PAGE = 25_000_000;

/**
 * The script that applies the theme the reader chose before the first paint; without one, the
 * stylesheet follows the system's. It only reads, and accepts only the two names.
 */
export const FIRST_PAINT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(PAGE_THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

/**
 * The policy's directives, in order, with the values each takes; `{scripts}` and `{styles}` stand for
 * the hashes of the page's own scripts and stylesheet. Nothing is fetched, framed or posted, no worker
 * starts, and strings become HTML only through the viewer's Trusted Types policy.
 */
export const PAGE_POLICY_RULES: readonly (readonly [directive: string, value: string])[] = [
  ['default-src', "'none'"],
  ['script-src', '{scripts}'],
  ['style-src', '{styles}'],
  ['img-src', 'data: blob:'],
  // A video plays from a `blob:` address of its file (ADR 0098, stage 2).
  ['media-src', 'blob:'],
  ['connect-src', "'none'"],
  ['worker-src', "'none'"],
  ['base-uri', "'none'"],
  ['form-action', "'none'"],
  ['require-trusted-types-for', "'script'"],
  ['trusted-types', 'default'],
];

/**
 * The policy of a page whose scripts and stylesheet have these hashes, as `sha256-…`. A page that holds
 * a solid worker (ADR 0075) allows workers from `blob:` addresses, and the Trusted Types policy that
 * starts it.
 */
export function pagePolicy(
  scripts: readonly string[],
  styles: readonly string[],
  { solidWorker = false }: { solidWorker?: boolean } = {},
): string {
  const quoted = (hashes: readonly string[]) => hashes.map((hash) => `'${hash}'`).join(' ');
  return PAGE_POLICY_RULES.map(([directive, value]) => {
    let filled = value.replace('{scripts}', quoted(scripts)).replace('{styles}', quoted(styles));
    if (solidWorker && directive === 'worker-src') filled = 'blob:';
    if (solidWorker && directive === 'trusted-types') filled = `default ${SOLID_WORKER_POLICY}`;
    return `${directive} ${filled}`;
  }).join('; ');
}

/** What a page's tab says for a project's name. */
export function pageTitle(projectName: string): string {
  return `${projectName} · Visual Anything`;
}

/** Writes a page. */
export async function writePage({ assets, data: given, title }: PageInput): Promise<WrittenPage> {
  const script = scriptText(assets.script);
  const data = withMathFonts(given, assets);
  if (/<\/style/i.test(assets.style)) {
    throw new Error('The viewer’s stylesheet holds "</style", which would end it early.');
  }
  // Solids' files are drawn by the solid worker, which the page then holds (ADR 0075).
  const holdsWorker = data.solids?.form === 'files';
  if (holdsWorker && assets.solidWorker === undefined) {
    throw new SolidWorkerMissing(
      'The page holds solids’ files, but no solid worker came with the viewer.',
    );
  }
  const worker = holdsWorker ? scriptText(assets.solidWorker ?? '') : undefined;
  const [firstPaint, viewer, style, starter] = await Promise.all([
    sha256(FIRST_PAINT_SCRIPT),
    sha256(script),
    sha256(assets.style),
    holdsWorker ? sha256(SOLID_WORKER_SCRIPT) : Promise.resolve(undefined),
  ]);
  const policy = pagePolicy(
    starter === undefined ? [firstPaint, viewer] : [firstPaint, starter, viewer],
    [style],
    { solidWorker: holdsWorker },
  );
  const held = dataText(data);
  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    '<meta name="referrer" content="no-referrer">',
    '<meta name="generator" content="Visual Anything">',
    `<title>${escapeText(title)}</title>`,
    `<script>${FIRST_PAINT_SCRIPT}</script>`,
    `<style>${assets.style}</style>`,
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<script type="application/json" id="${PAGE_DATA_ID}">${held}</script>`,
    ...(worker === undefined
      ? []
      : [
          `<script type="text/plain" id="${SOLID_WORKER_ID}">${worker}</script>`,
          `<script>${SOLID_WORKER_SCRIPT}</script>`,
        ]),
    `<script type="module">${script}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
  const encoder = new TextEncoder();
  const bytes = encoder.encode(html).length;
  let solidBytes = 0;
  if (data.solids !== undefined) {
    const without: PageData = { ...data };
    delete without.solids;
    solidBytes =
      encoder.encode(held).length -
      encoder.encode(dataText(without)).length +
      (worker === undefined ? 0 : encoder.encode(worker).length + SOLID_WORKER_SCRIPT.length);
  }
  return { html, bytes, policy, large: bytes > LARGE_PAGE, solidBytes };
}

/**
 * The data with the fonts its project's Math uses (ADR 0106), from those the viewer came with: the
 * data as it is when it holds fonts already, or when its project uses none.
 */
function withMathFonts(data: PageData, assets: ViewerAssets): PageData {
  if (data.mathFonts !== undefined || assets.mathFonts === undefined) return data;
  const files = {
    project: data.project,
    model: data.model,
    packages: data.packages,
    views: data.views,
    scenarios: data.scenarios,
    tours: data.tours,
  };
  const fonts = pageMathFonts(mathFontsOfFiles(files), assets.mathFonts);
  return fonts === undefined ? data : { ...data, mathFonts: fonts };
}

/**
 * The page's data as the text of its element: JSON whose `<`, `>`, `&` and line separators are
 * written as escapes, which JSON reads the same, so that no text in the project can end the element
 * or be read as markup.
 */
export function dataText(data: PageData): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (character) => {
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}

/**
 * The viewer's script as the text of an inline script, which the browser reads exactly as written,
 * so that its hash matches:
 * - `</script` and `<!--`, which would end it or change how the browser finds its end, are written
 *   `<\/script` and `<\x21--`;
 * - a NUL, which the browser reads as U+FFFD, and a carriage return, which it reads as a line feed,
 *   are written `\x00` and `\r`.
 * These read the same in strings, templates and regular expressions, the only places a built script
 * holds them.
 */
export function scriptText(script: string): string {
  return script
    .replace(/<\/(script)/gi, '<\\/$1')
    .replace(/<!--/g, '<\\x21--')
    .replace(/\0/g, '\\x00')
    .replace(/\r/g, '\\r');
}

function escapeText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** The SHA-256 of a text's UTF-8, as a policy names it: `sha256-` and the digest in base64. */
async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return `sha256-${btoa(binary)}`;
}
