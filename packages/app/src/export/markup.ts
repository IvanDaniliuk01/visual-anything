/**
 * Writing XML for the exports: text and attribute values escaped, characters XML cannot hold
 * replaced, and numbers written short. Pure, with no DOM, so that the command line and Claude's tools
 * write the same files the app does.
 */

/**
 * Characters XML 1.0 cannot hold, which a name read from a project may still carry: control
 * characters but tab, line feed and carriage return, lone surrogates, and U+FFFE and U+FFFF.
 */
const NOT_IN_XML =
  // eslint-disable-next-line no-control-regex -- the control characters are what this finds
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** What stands in for a character XML cannot hold. */
const REPLACEMENT = '\uFFFD';

/** A text as XML can hold it: every character it cannot hold replaced by U+FFFD. */
export function xmlSafe(text: string): string {
  return text.replace(NOT_IN_XML, REPLACEMENT);
}

/** A text escaped for XML content or a double-quoted attribute value. */
export function escapeXml(text: string): string {
  return xmlSafe(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** A number as the files write it: at most two decimals, without trailing zeros, never `-0`. */
export function num(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** An attribute's value: a text, a number, or nothing, which leaves the attribute out. */
export type AttributeValue = string | number | undefined;

/** The attributes of an element, written in the order given; those without a value are left out. */
export function attributes(values: Readonly<Record<string, AttributeValue>>): string {
  let written = '';
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue;
    written += ` ${name}="${typeof value === 'number' ? num(value) : escapeXml(value)}"`;
  }
  return written;
}

/** An element with no content. */
export function empty(name: string, values: Readonly<Record<string, AttributeValue>> = {}): string {
  return `<${name}${attributes(values)}/>`;
}

/** An element around content already written as XML. */
export function element(
  name: string,
  values: Readonly<Record<string, AttributeValue>>,
  content: string,
): string {
  return `<${name}${attributes(values)}>${content}</${name}>`;
}

/** An element holding a text, escaped. */
export function textElement(
  name: string,
  values: Readonly<Record<string, AttributeValue>>,
  text: string,
): string {
  return element(name, values, escapeXml(text));
}
