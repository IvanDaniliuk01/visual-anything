/**
 * What cleaning an image removed, in Spanish (ADR-0038): the core counts each kind in English, as in
 * "1 script element" and "3 event handler attributes", and the catalog's templates read each one, alone
 * and in the lists the core's messages and the image picker hold.
 */
import { cleanSvg } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { translateMessage, untranslatedParts } from './translate';

/** One report of each kind the core's cleaners write, singular and plural. */
const REPORTS = [
  '1 processing instruction',
  '2 processing instructions',
  '1 @ rule',
  '3 @ rules',
  '1 style rule that selects by more than a class or an element name',
  '2 style rules that select by more than a class or an element name',
  '1 script element',
  '2 foreignObject elements',
  '1 sodipodi:namedview element',
  '1 a element unwrapped, its contents kept',
  '2 switch elements unwrapped, their contents kept',
  '1 text element (turn text into paths to keep it)',
  '4 text elements (turn text into paths to keep it)',
  '1 attribute of another namespace',
  '2 attributes of other namespaces',
  '1 event handler attribute',
  '3 event handler attributes',
  '1 other attribute',
  '2 other attributes',
  '1 style declaration that is not paint',
  '5 style declarations that are not paint',
  '1 outside reference',
  '3 outside references',
  '1 id that is not allowed',
  '2 ids that are not allowed',
  '1 repeated id',
  '2 repeated ids',
  '1 value that is not allowed',
  '2 values that are not allowed',
  '1 stroke dash pattern finer than the picture can show',
  '3000 stroke dash patterns finer than the picture can show',
  '1 stroke width wider than the picture',
  '2 stroke widths wider than the picture',
  '1 tEXt chunk',
  '2 ICCP chunks',
  '1 byte after the end',
  '16 bytes after the end',
  '1 EXIF or XMP segment',
  '2 EXIF or XMP segments',
  '1 colour profile segment',
  '1 comment',
  '2 comments',
  '1 APP12 segment',
  '1 other segment',
  '1 more kind of thing',
  '10 more kinds of thing',
];

describe('what cleaning removed, in Spanish', () => {
  it.each(REPORTS)('reads %j', (report) => {
    expect(untranslatedParts('es', report)).toEqual([]);
  });

  it('keeps the names of elements and chunks as the file has them', () => {
    expect(translateMessage('es', '2 foreignObject elements')).toBe('2 elementos foreignObject');
    expect(translateMessage('es', '1 tEXt chunk')).toBe('1 bloque tEXt');
  });

  it('reads the lists the core’s messages hold, also with "or" inside an item', () => {
    expect(
      translateMessage(
        'es',
        'Cleaning the image "Logo" removed: 1 EXIF or XMP segment, 2 comments.',
      ),
    ).toBe('La limpieza de la imagen "Logo" quitó: 1 segmento EXIF o XMP, 2 comentarios.');
  });

  it('reads what the core really reports for a picture full of what it removes', () => {
    const result = cleanSvg(
      [
        '<?xml-stylesheet href="a.css"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="urn:x" viewBox="0 0 10 10" onload="go()">',
        '<script>go()</script><title>Logo</title><a href="https://example.com"><rect width="4" height="4" x:id="1"/></a>',
        '<text>Hi</text><image href="https://example.com/a.png"/>',
        '</svg>',
      ].join(''),
    );
    expect(result.ok).toBe(true);
    const removed = result.ok ? result.removed : [];
    expect(removed.length).toBeGreaterThan(3);
    const message = `The image "Logo" (shop.logo) holds what cleaning removes: ${removed.join(', ')}. It is shown cleaned; clean it to store it so.`;
    expect(untranslatedParts('es', message)).toEqual([]);
  });
});
