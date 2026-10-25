/**
 * Writing a read-only page (ADR 0041): one HTML file holding the viewer's script and stylesheet
 * inline, the project as data in a `<script type="application/json">` element, which the browser
 * never runs, and a content security policy in a `<meta>` element that lets the page run only its own
 * two inline scripts and use only its own stylesheet, by their hashes, and connect nowhere.
 *
 * Pure TypeScript with Web Crypto, so that the app writes a page in the browser and the command line
 * writes the same page in Node.
 */
import { PAGE_DATA_ID, type PageData } from './data';
import { PAGE_THEME_KEY } from './keys';

/** The viewer as built: one module script, which loads nothing, and one stylesheet. */
export interface ViewerAssets {
  script: string;
  style: string;
}

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
  ['connect-src', "'none'"],
  ['worker-src', "'none'"],
  ['base-uri', "'none'"],
  ['form-action', "'none'"],
  ['require-trusted-types-for', "'script'"],
  ['trusted-types', 'default'],
];

/** The policy of a page whose scripts and stylesheet have these hashes, as `sha256-…`. */
export function pagePolicy(scripts: readonly string[], styles: readonly string[]): string {
  const quoted = (hashes: readonly string[]) => hashes.map((hash) => `'${hash}'`).join(' ');
  return PAGE_POLICY_RULES.map(([directive, value]) => {
    const filled = value.replace('{scripts}', quoted(scripts)).replace('{styles}', quoted(styles));
    return `${directive} ${filled}`;
  }).join('; ');
}

/** What a page's tab says for a project's name. */
export function pageTitle(projectName: string): string {
  return `${projectName} · Visual Anything`;
}

/** Writes a page. */
export async function writePage({ assets, data, title }: PageInput): Promise<WrittenPage> {
  const script = scriptText(assets.script);
  if (/<\/style/i.test(assets.style)) {
    throw new Error('The viewer’s stylesheet holds "</style", which would end it early.');
  }
  const [firstPaint, viewer, style] = await Promise.all([
    sha256(FIRST_PAINT_SCRIPT),
    sha256(script),
    sha256(assets.style),
  ]);
  const policy = pagePolicy([firstPaint, viewer], [style]);
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
    `<script type="application/json" id="${PAGE_DATA_ID}">${dataText(data)}</script>`,
    `<script type="module">${script}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
  const bytes = new TextEncoder().encode(html).length;
  return { html, bytes, policy, large: bytes > LARGE_PAGE };
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
