/**
 * An explorable's still picture, drawn by its own frame (ADR 0107): the page as it shows, turned into
 * an SVG whose `foreignObject` holds a copy of the page with every element's computed style written
 * on it, then drawn on a canvas at the width asked for and read as a PNG. It follows html-to-image's
 * way (MIT), kept to what a frame needs, since the frame's policy fetches nothing: the fonts are the
 * page's own `@font-face` rules, whose sources are `data:` addresses; a canvas, a video and a picture
 * that is not a `data:` address are copied as `data:` pictures; and pseudo-elements become rules of
 * the SVG's own style sheet. Nothing is fetched, and no string becomes code.
 */

/** The most elements copied; past it, the rest of the page is left out of the picture. */
const MAX_ELEMENTS = 10_000;
/** The tallest a still is, as a multiple of its width. */
const MAX_ASPECT = 4;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Escapes text for an XML element's content or a double-quoted attribute. */
function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Writes an element's computed style on its copy, property by property. */
function copyStyle(from: Element, to: Element, win: Window): void {
  const style = (to as HTMLElement | SVGElement).style as CSSStyleDeclaration | undefined;
  if (!style) return;
  const computed = win.getComputedStyle(from);
  for (let i = 0; i < computed.length; i += 1) {
    const name = computed.item(i);
    style.setProperty(name, computed.getPropertyValue(name), computed.getPropertyPriority(name));
  }
}

/** A pseudo-element's rule, for the copy's class, when the page draws one. */
function pseudoRule(from: Element, className: string, pseudo: string, win: Window): string {
  const computed = win.getComputedStyle(from, pseudo);
  const content = computed.getPropertyValue('content');
  if (content === '' || content === 'none' || content === 'normal') return '';
  const declarations: string[] = [];
  for (let i = 0; i < computed.length; i += 1) {
    const name = computed.item(i);
    declarations.push(`${name}:${computed.getPropertyValue(name)}`);
  }
  return `.${className}${pseudo}{${declarations.join(';')}}`;
}

/** A canvas, video or picture as a `data:` picture, or undefined when the browser will not read it. */
function asDataPicture(element: Element, doc: Document): string | undefined {
  try {
    if (element instanceof HTMLCanvasElement) return element.toDataURL('image/png');
    const canvas = doc.createElement('canvas');
    let width = 0;
    let height = 0;
    if (element instanceof HTMLVideoElement) {
      width = element.videoWidth;
      height = element.videoHeight;
    } else if (element instanceof HTMLImageElement) {
      width = element.naturalWidth;
      height = element.naturalHeight;
    }
    if (width === 0 || height === 0) return undefined;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(element as CanvasImageSource, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return undefined;
  }
}

interface Copying {
  win: Window;
  doc: Document;
  rules: string[];
  count: number;
}

/** A copy of a node for the picture, with the computed style of each element written on it. */
function copyNode(node: Node, copying: Copying): Node | undefined {
  const { win, doc } = copying;
  if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(false);
  if (node.nodeType !== Node.ELEMENT_NODE) return undefined;
  const element = node as Element;
  const tag = element.localName;
  if (tag === 'script' || tag === 'noscript' || tag === 'template') return undefined;
  if (copying.count >= MAX_ELEMENTS) return undefined;
  copying.count += 1;
  let copy: Element;
  const replaced =
    element instanceof HTMLCanvasElement ||
    element instanceof HTMLVideoElement ||
    (element instanceof HTMLImageElement && !element.currentSrc.startsWith('data:'));
  if (replaced) {
    const picture = doc.createElement('img');
    const source = asDataPicture(element, doc);
    if (source) picture.src = source;
    copy = picture;
  } else {
    copy = element.cloneNode(false) as Element;
    if (element instanceof HTMLInputElement) {
      if (element.type === 'checkbox' || element.type === 'radio') {
        (copy as HTMLInputElement).toggleAttribute('checked', element.checked);
      } else {
        copy.setAttribute('value', element.value);
      }
    } else if (element instanceof HTMLSelectElement) {
      const chosen = element.selectedIndex;
      Array.from(element.options).forEach((option, index) => {
        if (index === chosen) option.setAttribute('selected', '');
      });
    }
  }
  // No attribute that names code or a style the policy would refuse travels into the picture.
  for (const attribute of Array.from(copy.attributes)) {
    if (/^on/i.test(attribute.name) || attribute.name === 'style')
      copy.removeAttribute(attribute.name);
  }
  copyStyle(element, copy, win);
  const className = `va-still-${copying.count}`;
  const before = pseudoRule(element, className, '::before', win);
  const after = pseudoRule(element, className, '::after', win);
  if (before || after) {
    copy.classList.add(className);
    copying.rules.push(before, after);
  }
  if (element instanceof HTMLTextAreaElement) {
    copy.textContent = element.value;
    return copy;
  }
  if (replaced) return copy;
  for (const child of Array.from(element.childNodes)) {
    const each = copyNode(child, copying);
    if (each) copy.appendChild(each);
  }
  return copy;
}

/** The page's own `@font-face` rules, whose sources are `data:` addresses in an explorable. */
function fontRules(doc: Document): string[] {
  const rules: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(list)) {
      if (rule.cssText.startsWith('@font-face')) rules.push(rule.cssText);
    }
  }
  return rules;
}

/** The page as it shows, as the text of an SVG of its size. */
export function pageAsSvg(doc: Document, width: number, height: number): string {
  const win = doc.defaultView;
  if (!win) throw new Error('The page has no window.');
  const copying: Copying = { win, doc, rules: [], count: 0 };
  const body = copyNode(doc.body, copying) as HTMLElement | undefined;
  if (!body) throw new Error('The page has no body to draw.');
  body.style.setProperty('margin', '0');
  body.style.setProperty('width', `${width}px`);
  body.style.setProperty('height', `${height}px`);
  body.style.setProperty('overflow', 'hidden');
  const html = win.getComputedStyle(doc.documentElement);
  const background =
    html.backgroundColor && html.backgroundColor !== 'rgba(0, 0, 0, 0)'
      ? html.backgroundColor
      : undefined;
  const serialized = new XMLSerializer().serializeToString(body);
  const style = [...fontRules(doc), ...copying.rules.filter((rule) => rule !== '')].join('\n');
  return (
    `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    (style === '' ? '' : `<style>${xml(style)}</style>`) +
    (background ? `<rect width="100%" height="100%" fill="${xml(background)}"/>` : '') +
    `<foreignObject x="0" y="0" width="100%" height="100%">${serialized}</foreignObject></svg>`
  );
}

function loadPicture(doc: Document, source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const picture = doc.createElement('img');
    picture.decoding = 'sync';
    picture.onload = () => resolve(picture);
    picture.onerror = () => reject(new Error('The browser could not draw the page as a picture.'));
    picture.src = source;
  });
}

/**
 * The page as a PNG `width` pixels wide, as tall as what shows at that scale up to four times its
 * width: the bytes in a fresh buffer of their own, which the frame transfers to the app.
 */
export async function takeStill(doc: Document, width: number): Promise<Uint8Array> {
  const win = doc.defaultView;
  if (!win) throw new Error('The page has no window.');
  const root = doc.documentElement;
  const pageWidth = Math.max(1, root.clientWidth || win.innerWidth);
  const pageHeight = Math.max(1, root.clientHeight || win.innerHeight);
  const svg = pageAsSvg(doc, pageWidth, pageHeight);
  const picture = await loadPicture(
    doc,
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  );
  const scale = width / pageWidth;
  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(1, Math.min(Math.round(pageHeight * scale), width * MAX_ASPECT));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser gave no canvas to draw the picture on.');
  context.drawImage(picture, 0, 0, pageWidth * scale, pageHeight * scale);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The browser could not write the picture as a PNG.');
  return new Uint8Array(await blob.arrayBuffer());
}
