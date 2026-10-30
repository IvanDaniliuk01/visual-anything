/**
 * Reads the HTML that CommonMark's and GitHub's spec examples expect into the blocks and runs that
 * `parseEmphasis` answers, so that an example's expectation can be compared with what the reader
 * answers whatever order the tags nest in. It knows only the tags the reader's subset draws, and
 * throws on any other: such an example is not in the subset.
 */
import type { EmphasisBlock, EmphasisItem, EmphasisRun, TableAlign } from '../text/emphasis';

type Container =
  | { kind: 'root'; blocks: EmphasisBlock[] }
  | { kind: 'quote'; blocks: EmphasisBlock[] }
  | { kind: 'item'; blocks: EmphasisBlock[]; item: EmphasisItem }
  | { kind: 'list'; block: Extract<EmphasisBlock, { kind: 'list' }> };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"' };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      return String.fromCodePoint(parseInt(name.slice(2), 16));
    }
    if (name.startsWith('#')) return String.fromCodePoint(parseInt(name.slice(1), 10));
    const known = ENTITIES[name];
    if (known === undefined) throw new Error(`Unknown entity ${whole}`);
    return known;
  });
}

function attribute(attributes: string, name: string): string | undefined {
  const found = new RegExp(`${name}="([^"]*)"`).exec(attributes);
  return found ? decode(found[1]!) : undefined;
}

export function htmlBlocks(html: string): EmphasisBlock[] {
  const root: Container = { kind: 'root', blocks: [] };
  const containers: Container[] = [root];
  let target: { runs: EmphasisRun[]; implicit: boolean } | undefined;
  const marks = { bold: 0, italic: 0, strike: 0, code: 0 };
  const links: (string | undefined)[] = [];
  let pre: string | undefined;
  let table: Extract<EmphasisBlock, { kind: 'table' }> | undefined;
  let row: EmphasisRun[][] | undefined;
  let inHead = false;
  let skipBreak = false;
  /** A task item's checkbox is followed by a space that is not the item's text. */
  let skipSpace = false;

  const blocksOf = (): EmphasisBlock[] => {
    const container = containers.at(-1)!;
    if (container.kind === 'list') throw new Error('Text inside a list but outside its items');
    return container.blocks;
  };
  const endImplicit = () => {
    if (target?.implicit) {
      const last = target.runs.at(-1);
      if (last) {
        last.text = last.text.replace(/\n$/, '');
        if (last.text === '') target.runs.pop();
      }
      target = undefined;
    }
  };
  const emit = (text: string) => {
    if (text === '') return;
    const link = links.at(-1);
    const run: EmphasisRun = {
      text,
      bold: marks.bold > 0,
      italic: marks.italic > 0,
      strike: marks.strike > 0,
      underline: false,
      code: marks.code > 0,
      highlight: false,
    };
    if (link !== undefined) run.link = link;
    const runs = target!.runs;
    const last = runs.at(-1);
    if (last && JSON.stringify({ ...last, text: '' }) === JSON.stringify({ ...run, text: '' })) {
      last.text += text;
    } else runs.push(run);
  };

  const tokens = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  for (const token of html.matchAll(tokens)) {
    const [, closing, rawName, attributes = '', rawText] = token;
    if (rawText !== undefined) {
      let text = decode(rawText);
      if (skipBreak && text.startsWith('\n')) text = text.slice(1);
      if (skipSpace && text.startsWith(' ')) text = text.slice(1);
      skipBreak = false;
      skipSpace = false;
      if (text === '') continue;
      if (pre !== undefined) pre += text;
      else if (target) emit(text);
      else if (text.trim() === '') continue;
      else {
        const container = containers.at(-1)!;
        if (container.kind !== 'item') throw new Error(`Text outside a block: ${text}`);
        const paragraph: EmphasisBlock = { kind: 'paragraph', runs: [] };
        container.blocks.push(paragraph);
        target = { runs: paragraph.runs, implicit: true };
        emit(text);
      }
      continue;
    }
    skipBreak = false;
    if (rawName!.toLowerCase() !== 'input') skipSpace = false;
    const name = rawName!.toLowerCase();
    const open = closing !== '/';
    switch (name) {
      case 'p':
        if (open) {
          endImplicit();
          const paragraph: EmphasisBlock = { kind: 'paragraph', runs: [] };
          blocksOf().push(paragraph);
          target = { runs: paragraph.runs, implicit: false };
        } else target = undefined;
        break;
      case 'h1':
      case 'h2':
      case 'h3':
        if (open) {
          endImplicit();
          const heading: EmphasisBlock = {
            kind: 'heading',
            level: Number(name[1]) as 1 | 2 | 3,
            runs: [],
          };
          blocksOf().push(heading);
          target = { runs: heading.runs, implicit: false };
        } else target = undefined;
        break;
      case 'blockquote':
        endImplicit();
        if (open) {
          const quote: EmphasisBlock = { kind: 'quote', blocks: [] };
          blocksOf().push(quote);
          containers.push({ kind: 'quote', blocks: quote.blocks });
        } else containers.pop();
        break;
      case 'ul':
      case 'ol':
        endImplicit();
        if (open) {
          const start = attribute(attributes, 'start');
          const list: Extract<EmphasisBlock, { kind: 'list' }> =
            name === 'ol'
              ? {
                  kind: 'list',
                  ordered: true,
                  start: start === undefined ? 1 : Number(start),
                  items: [],
                }
              : { kind: 'list', ordered: false, items: [] };
          blocksOf().push(list);
          containers.push({ kind: 'list', block: list });
        } else containers.pop();
        break;
      case 'li':
        endImplicit();
        if (open) {
          const container = containers.at(-1)!;
          if (container.kind !== 'list') throw new Error('An item outside a list');
          const item: EmphasisItem = { blocks: [] };
          container.block.items.push(item);
          containers.push({ kind: 'item', blocks: item.blocks, item });
        } else containers.pop();
        break;
      case 'input': {
        const container = containers.at(-1)!;
        if (container.kind !== 'item') throw new Error('A checkbox outside an item');
        container.item.checked = /\bchecked\b/.test(attributes);
        skipSpace = true;
        break;
      }
      case 'hr':
        endImplicit();
        blocksOf().push({ kind: 'rule' });
        break;
      case 'pre':
        if (open) {
          endImplicit();
          pre = '';
        } else {
          blocksOf().push({ kind: 'code', text: pre!.replace(/\n$/, '') });
          pre = undefined;
        }
        break;
      case 'code':
        if (pre === undefined) marks.code += open ? 1 : -1;
        break;
      case 'strong':
        marks.bold += open ? 1 : -1;
        break;
      case 'em':
        marks.italic += open ? 1 : -1;
        break;
      case 'del':
        marks.strike += open ? 1 : -1;
        break;
      case 'a':
        if (open) {
          const href = attribute(attributes, 'href') ?? '';
          links.push(/^(?:https?|mailto):/i.test(href) ? href : undefined);
        } else links.pop();
        break;
      case 'br':
        emit('\n');
        skipBreak = true;
        break;
      case 'table':
        endImplicit();
        if (open) {
          table = { kind: 'table', align: [], head: [], rows: [] };
          blocksOf().push(table);
        } else table = undefined;
        break;
      case 'thead':
        inHead = open;
        break;
      case 'tbody':
        break;
      case 'tr':
        if (open) row = [];
        else if (inHead) table!.head = row!;
        else table!.rows.push(row!);
        break;
      case 'th':
      case 'td':
        if (open) {
          const cell: EmphasisRun[] = [];
          row!.push(cell);
          target = { runs: cell, implicit: false };
          if (inHead) {
            table!.align.push((attribute(attributes, 'align') ?? 'none') as TableAlign);
          }
        } else target = undefined;
        break;
      default:
        throw new Error(`A tag the subset does not draw: <${name}>`);
    }
  }
  endImplicit();
  return root.blocks;
}
