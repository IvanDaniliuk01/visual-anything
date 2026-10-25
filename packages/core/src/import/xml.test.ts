/**
 * The strict XML reader the draw.io reader uses (ADR-0042): it reads well-formed XML, refuses a DTD of
 * its own and every entity but XML's five, and stays within its caps.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ReadRefusal } from './reading';
import { XML_CAPS, readXml, type XmlElement } from './xml';

function refusal(text: string): string {
  try {
    readXml(text);
  } catch (error) {
    if (error instanceof ReadRefusal) return error.message;
    throw error;
  }
  throw new Error('It was read.');
}

describe('readXml', () => {
  it('reads elements, attributes, text and CDATA, with XML’s own references decoded', () => {
    const root = readXml(
      '\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<!-- a draw.io file -->\n' +
        '<mxfile host="app.diagrams.net"><diagram name="A &amp; B" id=\'x\'>' +
        'abc&#x41;&#66;<![CDATA[<raw>]]></diagram><empty/></mxfile>',
    );
    expect(root.name).toBe('mxfile');
    expect(root.attributes.get('host')).toBe('app.diagrams.net');
    const [diagram, empty] = root.children as [XmlElement, XmlElement];
    expect(diagram.attributes.get('name')).toBe('A & B');
    expect(diagram.attributes.get('id')).toBe('x');
    expect(diagram.text).toBe('abcAB<raw>');
    expect(empty.name).toBe('empty');
    expect(empty.children).toEqual([]);
  });

  it('turns tabs and line breaks in an attribute into spaces, but keeps those written as references', () => {
    const root = readXml('<a v="1\n2\t3&#10;4"/>');
    expect(root.attributes.get('v')).toBe('1 2 3\n4');
  });

  it('skips a DOCTYPE that only names an outside DTD, which is never fetched', () => {
    const root = readXml(
      '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg content="x"/>',
    );
    expect(root.attributes.get('content')).toBe('x');
  });

  it('refuses a billion laughs, and any DTD of its own or entity of its own', () => {
    const laughs =
      '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">' +
      Array.from(
        { length: 9 },
        (_, at) => `<!ENTITY lol${at + 1} "${`&lol${at === 0 ? '' : at};`.repeat(10)}">`,
      ).join('') +
      ']><lolz>&lol9;</lolz>';
    expect(refusal(laughs)).toBe(
      'The XML has a DOCTYPE with declarations of its own, which is not read.',
    );
    expect(refusal('<!DOCTYPE a SYSTEM "file:///etc/passwd" [ ]><a/>')).toBe(
      'The XML has a DOCTYPE with declarations of its own, which is not read.',
    );
    expect(refusal('<a>&xxe;</a>')).toBe('The XML uses the entity "&xxe;", which is not read.');
    expect(refusal('<a b="&nbsp;"/>')).toBe('The XML uses the entity "&nbsp;", which is not read.');
    expect(refusal('<!ENTITY a "b"><a/>')).toBe(
      'The XML has a declaration, such as an ENTITY, outside a DOCTYPE; it is not read.',
    );
    expect(refusal('<a/><!DOCTYPE a>')).toBe('The XML has a DOCTYPE out of place.');
  });

  it('refuses what is not well formed', () => {
    expect(refusal('')).toBe('The XML has no element.');
    expect(refusal('<a><b></a>')).toBe('The XML closes "a" out of order.');
    expect(refusal('<a>')).toBe('The XML leaves "a" open.');
    expect(refusal('<a/><b/>')).toBe('The XML has more than one outermost element.');
    expect(refusal('text<a/>')).toBe('The XML has text outside its outermost element.');
    expect(refusal('<a b=c/>')).toBe('The attribute "b" of "a" has an unquoted value.');
    expect(refusal('<a b="1" b="2"/>')).toBe('The tag "a" has the attribute "b" twice.');
    expect(refusal('<a b="1"c="2"/>')).toBe('The tag "a" runs its attributes together.');
    expect(refusal('<a b="x<y"/>')).toBe('The attribute "b" of "a" holds "<".');
    expect(refusal('<a>&</a>')).toBe('The XML has an "&" that starts no reference.');
    expect(refusal('<a>&#0;</a>')).toBe('The XML refers to a character XML does not allow (&#0;).');
    expect(refusal('<a><!-- </a>')).toBe('The XML has an unfinished comment.');
    expect(refusal('<a><![CDATA[ </a>')).toBe('The XML has an unfinished CDATA section.');
    expect(refusal('<a><?pi </a>')).toBe('The XML has an unfinished processing instruction.');
    expect(refusal('<a></a')).toBe('The XML has an unfinished end tag.');
    expect(refusal('<a b="1"')).toBe('The XML leaves the tag "a" unfinished.');
    expect(refusal('< a/>')).toBe('The XML has a malformed tag.');
    expect(refusal('<a/><?xml version="1.0"?>')).toBe('The XML declaration is out of place.');
  });

  it('stays within its caps', () => {
    expect(
      refusal('<a>' + '<b>'.repeat(XML_CAPS.depth) + '</b>'.repeat(XML_CAPS.depth) + '</a>'),
    ).toBe(`The XML nests elements over ${XML_CAPS.depth} deep.`);
    expect(refusal(`<a>${'<b/>'.repeat(XML_CAPS.elements)}</a>`)).toBe(
      `The XML has over ${XML_CAPS.elements.toLocaleString('en')} elements.`,
    );
    const attributes = Array.from({ length: XML_CAPS.attributes + 1 }, (_, at) => `a${at}="1"`);
    expect(refusal(`<a ${attributes.join(' ')}/>`)).toBe(
      `The tag "a" has over ${XML_CAPS.attributes.toLocaleString('en')} attributes.`,
    );
    expect(refusal(`<a>${' '.repeat(XML_CAPS.characters)}</a>`)).toBe(
      'The file is over 32 MiB, the most an import reads.',
    );
  });

  it('never throws anything but a refusal, whatever it is given', () => {
    const pieces = fc.constantFrom(
      '<a>',
      '</a>',
      '<b x="1">',
      '</b>',
      '<c/>',
      '&amp;',
      '&lt;',
      '&#65;',
      '&bad;',
      '<!--',
      '-->',
      '<![CDATA[',
      ']]>',
      '<?',
      '?>',
      '<!DOCTYPE a>',
      '<!DOCTYPE a [',
      ']>',
      '"',
      "'",
      '=',
      ' ',
      'text',
      '<',
      '>',
      '&',
    );
    fc.assert(
      fc.property(fc.array(pieces, { maxLength: 30 }), (parts) => {
        try {
          const root = readXml(parts.join(''));
          expect(typeof root.name).toBe('string');
        } catch (error) {
          expect(error).toBeInstanceOf(ReadRefusal);
        }
      }),
      { numRuns: 3000 },
    );
  });
});
