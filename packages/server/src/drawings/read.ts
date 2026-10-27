/**
 * Reading HTML (ADR 0068) with parse5, which parses as the HTML standard says into a tree of data:
 * no DOM, no scripts, no network and no browser. Nothing in the text runs.
 *
 * The standard's tree building scans the open elements for many tags, and its tokenizer compares each
 * attribute of a tag with those before it, so a small file of nested `<div>`s, or of one tag with
 * thousands of attributes, would take minutes. The reader caps both as it goes, through parse5's own
 * hooks, so that reading costs no more than a constant times the text:
 *
 * - each tag keeps its first {@link HTML_CAPS.attributesPerTag} attributes, which is all the cleaner
 *   reads anyway; the rest are dropped as the tokenizer reads them, and reported;
 * - more than {@link HTML_CAPS.parseDepth} elements open at once, or more than
 *   {@link HTML_CAPS.parseNodes} nodes made, and the HTML is refused.
 *
 * The first works through the tokenizer's method that keeps an attribute, which is not part of
 * parse5's documented interface: parse5 is pinned to one version, and the hostile tests fail if it no
 * longer holds.
 */
import type { Problem } from '@visual-anything/core';
import {
  Tokenizer,
  defaultTreeAdapter,
  parse,
  type DefaultTreeAdapterMap,
  type DefaultTreeAdapterTypes,
  type TreeAdapter,
} from 'parse5';
import { HTML_CAPS } from './caps';
import type { DrawingReport } from './report';

export type HtmlDocument = DefaultTreeAdapterTypes.Document;
export type HtmlElement = DefaultTreeAdapterTypes.Element;
export type HtmlNode = DefaultTreeAdapterTypes.ChildNode;
export type HtmlText = DefaultTreeAdapterTypes.TextNode;

/** Thrown to refuse the HTML, with the problem that says why. */
export class DrawingRefusal extends Error {
  override name = 'DrawingRefusal';
  constructor(readonly problem: Problem) {
    super(problem.message);
  }
}

/** Refuses HTML past a cap. */
export function tooLarge(message: string): never {
  throw new DrawingRefusal({ code: 'image-too-large', message });
}

/** The tokenizer's own state, which the cap on attributes reads. */
interface TokenizerInside {
  currentToken: { attrs: unknown[] } | null;
  _leaveAttrName: (this: TokenizerInside) => void;
}

/** The read under way: what the tokenizer drops counts here. Reads are synchronous, one at a time. */
let reading: { attributesDropped: number } | undefined;

const tokenizer = Tokenizer.prototype as unknown as TokenizerInside;
const keepAttribute = tokenizer._leaveAttrName;
tokenizer._leaveAttrName = function (this: TokenizerInside) {
  const attributes = this.currentToken?.attrs;
  if (attributes !== undefined && attributes.length >= HTML_CAPS.attributesPerTag) {
    // Neither kept nor compared with the others, so that one tag never costs more than the cap squared.
    if (reading) reading.attributesDropped += 1;
    return;
  }
  keepAttribute.call(this);
};

/** Reads HTML text into parse5's tree, within the caps, or refuses it. */
export function readHtml(text: string, report: DrawingReport): HtmlDocument {
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > HTML_CAPS.input) {
    tooLarge(
      `The HTML is over ${HTML_CAPS.input / 1024} KiB: shorten it, or import a part of the page.`,
    );
  }
  let open = 0;
  let made = 0;
  const count = () => {
    made += 1;
    if (made > HTML_CAPS.parseNodes) {
      tooLarge(`The HTML makes over ${HTML_CAPS.parseNodes} elements, texts and comments.`);
    }
  };
  const adapter: TreeAdapter<DefaultTreeAdapterMap> = {
    ...defaultTreeAdapter,
    createElement(tagName, namespaceURI, attrs) {
      count();
      return defaultTreeAdapter.createElement(tagName, namespaceURI, attrs);
    },
    createCommentNode(data) {
      count();
      return defaultTreeAdapter.createCommentNode(data);
    },
    // Text joins the text before it when there is one; only a new text node counts.
    insertText(parentNode, text) {
      if (parentNode.childNodes.at(-1)?.nodeName !== '#text') count();
      defaultTreeAdapter.insertText(parentNode, text);
    },
    insertTextBefore(parentNode, text, referenceNode) {
      count();
      defaultTreeAdapter.insertTextBefore(parentNode, text, referenceNode);
    },
    // A second `<html>` or `<body>` gives the first the attributes it lacks: within the cap too.
    adoptAttributes(recipient, attrs) {
      const room = Math.max(0, HTML_CAPS.attributesPerTag - recipient.attrs.length);
      if (attrs.length > room) {
        if (reading) reading.attributesDropped += attrs.length - room;
      }
      defaultTreeAdapter.adoptAttributes(recipient, attrs.slice(0, room));
    },
    onItemPush() {
      open += 1;
      if (open > HTML_CAPS.parseDepth) {
        tooLarge(`The HTML nests elements over ${HTML_CAPS.parseDepth} deep.`);
      }
    },
    onItemPop() {
      open -= 1;
    },
  };
  reading = { attributesDropped: 0 };
  try {
    const document = parse(text, { treeAdapter: adapter, scriptingEnabled: true });
    if (reading.attributesDropped > 0) {
      report.add(
        `attribute past the ${HTML_CAPS.attributesPerTag} a tag keeps`,
        `attributes past the ${HTML_CAPS.attributesPerTag} a tag keeps`,
        reading.attributesDropped,
      );
    }
    return document;
  } finally {
    reading = undefined;
  }
}
