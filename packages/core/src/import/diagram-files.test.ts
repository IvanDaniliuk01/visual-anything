/**
 * Telling a Structurizr workspace, a LikeC4 model and a draw.io diagram apart by what they hold, and
 * leaving every other file to the other readers.
 */
import { describe, expect, it } from 'vitest';
import { diagramFormatOf, readDiagramFile } from './diagram-files';
import workspace from './fixtures/big-bank.structurizr.json';
import compressed from './fixtures/checkout-compressed.drawio?raw';
import plain from './fixtures/checkout.drawio?raw';
import png from './fixtures/checkout.drawio.png?inline';
import svg from './fixtures/checkout.drawio.svg?raw';
import bareModel from './fixtures/ops.xml?raw';
import model from './fixtures/shop.likec4.json';
import { bytesOfDataUrl } from './test/apply';
import { utf8 } from './test/deflate';

describe('readDiagramFile', () => {
  it('tells each format apart by what the file holds, whatever its name', () => {
    const cases: [string | Uint8Array, string][] = [
      [plain, 'drawio'],
      [compressed, 'drawio'],
      [svg, 'drawio-svg'],
      [bytesOfDataUrl(png), 'drawio-png'],
      [bareModel, 'drawio'],
      [utf8(plain), 'drawio'],
      [JSON.stringify(workspace), 'structurizr'],
      [utf8(JSON.stringify(workspace)), 'structurizr'],
      [JSON.stringify(model), 'likec4'],
      [JSON.stringify([model]), 'likec4'],
    ];
    for (const [content, format] of cases) {
      const read = readDiagramFile('file.txt', content);
      expect(read?.ok && read.plan.format).toBe(format);
      expect(diagramFormatOf(content)).toBe(format.replace(/-(svg|png)$/, ''));
    }
  });

  it('leaves to the other readers what none of these reads', () => {
    for (const content of [
      'flowchart LR\n  A --> B',
      'name,component\nA,Service',
      '{"elements": [], "relations": []}',
      '{"schemaVersion": 1}',
      '{ not json',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
      '<html></html>',
      Uint8Array.from([0xff, 0xd8, 0xff]),
    ]) {
      expect(readDiagramFile('file', content)).toBeUndefined();
      expect(diagramFormatOf(content)).toBeUndefined();
    }
  });

  it('gives a format it tells but cannot read as refused, with why', () => {
    const read = readDiagramFile('x.drawio', '<mxfile><diagram>%%%</diagram></mxfile>');
    expect(read).toEqual({
      ok: false,
      problems: ['The compressed content is not valid URI-encoded text.'],
    });
  });
});
