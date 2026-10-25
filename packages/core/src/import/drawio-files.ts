/**
 * The files a draw.io diagram comes in (ADR-0042), taken apart down to its pages: a `.drawio` or
 * `.xml` file, plain or with compressed pages; a `.drawio.svg`, which keeps the diagram in its root's
 * `content` attribute; and a `.drawio.png`, which keeps it in a `tEXt` or `zTXt` chunk. Every XML is
 * read by the strict reader, and everything compressed inflates within one budget for the whole file.
 */
import { decodeBase64 } from '../images/base64';
import { crc32 } from '../images/bitmap';
import { IMPORT_LIMITS } from './plan';
import { decodeUtf8, inflate, InflateBudget } from './inflate';
import { MAX_READ_CHARACTERS, refuse } from './reading';
import { readXml, type XmlElement } from './xml';

/** The container a diagram came in. */
export type DrawioContainer = 'drawio' | 'drawio-svg' | 'drawio-png';

/** One page of a diagram: its name, as the file writes it, and its `mxGraphModel`. */
export interface DrawioPage {
  name: string | undefined;
  model: XmlElement;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Whether bytes start as a PNG picture does. */
export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, at) => bytes[at] === byte);
}

/** The pages of a draw.io diagram in any of its files, and which file it came in. */
export function drawioPages(content: string | Uint8Array): {
  container: DrawioContainer;
  pages: DrawioPage[];
} {
  const budget = new InflateBudget(IMPORT_LIMITS.inflatedBytes);
  let container: DrawioContainer = 'drawio';
  let text: string;
  if (typeof content === 'string') text = content;
  else if (isPng(content)) {
    container = 'drawio-png';
    text = diagramInPng(content, budget);
  } else {
    if (content.length > MAX_READ_CHARACTERS) tooLarge();
    text = decodeUtf8(content);
  }
  let root = readXml(text);
  if (localName(root.name) === 'svg') {
    container = 'drawio-svg';
    const inside = root.attributes.get('content');
    if (inside === undefined || inside.trim() === '') {
      refuse('The SVG picture holds no draw.io diagram: its outermost element has no content.');
    }
    root = readXml(diagramText(inside, budget));
  }
  return { container, pages: pagesOf(root, budget) };
}

function tooLarge(): never {
  refuse(`The file is over ${MAX_READ_CHARACTERS / (1024 * 1024)} MiB, the most an import reads.`);
}

function localName(name: string): string {
  return name.slice(name.indexOf(':') + 1);
}

/** The pages of an `mxfile`, or the one page of a bare `mxGraphModel`. */
function pagesOf(root: XmlElement, budget: InflateBudget): DrawioPage[] {
  if (root.name === 'mxGraphModel') return [{ name: undefined, model: root }];
  if (root.name !== 'mxfile') {
    refuse(
      `The file is not a draw.io diagram: its outermost element is "${root.name}", not "mxfile".`,
    );
  }
  const diagrams = root.children.filter((child) => child.name === 'diagram');
  if (diagrams.length === 0) refuse('The draw.io file has no page.');
  return diagrams.map((diagram) => {
    const name = diagram.attributes.get('name');
    const plain = diagram.children.find((child) => child.name === 'mxGraphModel');
    if (plain) return { name, model: plain };
    const compressed = diagram.text.trim();
    if (compressed === '') return { name, model: emptyModel() };
    const model = readXml(diagramText(compressed, budget));
    if (model.name !== 'mxGraphModel') {
      refuse(`A page of the draw.io file holds "${model.name}", not "mxGraphModel".`);
    }
    return { name, model };
  });
}

function emptyModel(): XmlElement {
  return { name: 'mxGraphModel', attributes: new Map(), children: [], text: '' };
}

/**
 * The XML a page or a `content` attribute holds: as it is, URI-encoded, or compressed as draw.io
 * compresses it: the URI-encoded XML deflated and written in base64.
 */
function diagramText(text: string, budget: InflateBudget): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) return trimmed;
  if (trimmed.startsWith('%')) return uriDecoded(trimmed);
  const bytes = decodeBase64(trimmed.replace(/\s+/g, ''));
  if (bytes === undefined) refuse('The compressed content is not valid base64.');
  const inflated = decodeUtf8(inflate(bytes, budget)).replace(/^\uFEFF/, '');
  return inflated.startsWith('<') ? inflated : uriDecoded(inflated);
}

function uriDecoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return refuse('The compressed content is not valid URI-encoded text.');
  }
}

/**
 * The diagram a `.drawio.png` keeps: a `tEXt` chunk named `mxfile` or `mxGraphModel` with the
 * URI-encoded XML, or, as older versions wrote, a `zTXt` chunk named `mxGraphModel` with it deflated.
 * Every chunk's checksum is checked, and nothing but those chunks is read.
 */
function diagramInPng(bytes: Uint8Array, budget: InflateBudget): string {
  if (bytes.length > MAX_READ_CHARACTERS) tooLarge();
  let at = PNG_SIGNATURE.length;
  while (at < bytes.length) {
    if (at + 12 > bytes.length) damagedPng();
    const length =
      (((bytes[at] as number) << 24) |
        ((bytes[at + 1] as number) << 16) |
        ((bytes[at + 2] as number) << 8) |
        (bytes[at + 3] as number)) >>>
      0;
    const end = at + 12 + length;
    if (end > bytes.length) damagedPng();
    const stored =
      (((bytes[end - 4] as number) << 24) |
        ((bytes[end - 3] as number) << 16) |
        ((bytes[end - 2] as number) << 8) |
        (bytes[end - 1] as number)) >>>
      0;
    if (crc32(bytes, at + 4, end - 4) !== stored) damagedPng();
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const data = bytes.subarray(at + 8, end - 4);
    if (type === 'tEXt' || type === 'zTXt') {
      const nul = data.indexOf(0);
      const keyword = nul === -1 ? '' : latin1(data.subarray(0, nul));
      if (keyword === 'mxfile' || keyword === 'mxGraphModel') {
        if (type === 'tEXt') return diagramText(latin1(data.subarray(nul + 1)), budget);
        if (data[nul + 1] !== 0) damagedPng();
        // Java's URL encoder, which wrote these, writes a space as "+".
        const inflated = decodeUtf8(inflate(data.subarray(nul + 2), budget)).replace(/\+/g, ' ');
        return inflated.startsWith('<') ? inflated : uriDecoded(inflated);
      }
    }
    if (type === 'IEND') break;
    at = end;
  }
  return refuse('The PNG picture holds no draw.io diagram.');
}

function damagedPng(): never {
  refuse('A chunk of the PNG picture is damaged.');
}

function latin1(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let at = 0; at < bytes.length; at += 8192) {
    parts.push(String.fromCharCode(...bytes.subarray(at, at + 8192)));
  }
  return parts.join('');
}
