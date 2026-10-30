/**
 * Text emphasis in panels (ADR 0082): the core's blocks and runs written as React elements. A run is
 * `strong`, `em`, `s`, `u`, `code` and `mark` around its text; a link is an `a` that opens in a new
 * tab with no opener and no referrer. Nothing is ever turned into HTML: every character of the text
 * is a text node, so markup in it is drawn as the characters it is and the Trusted Types policy
 * stays as it is.
 */
import {
  parseEmphasis,
  type EmphasisBlock,
  type EmphasisItem,
  type EmphasisRun,
} from '@visual-anything/core';
import { Fragment, useMemo, type ReactNode } from 'react';
import { useT } from '../i18n/useT';
import { drawsDifferently } from './drawn';
import './text.css';

/** A text of one line, such as an attribute's value that takes emphasis: its runs, inline. */
export function EmphasisRuns({ text }: { text: string }) {
  const runs = useMemo(() => {
    const [first] = parseEmphasis(text, { blocks: false });
    return first?.kind === 'paragraph' ? first.runs : [];
  }, [text]);
  return <Runs runs={runs} />;
}

interface EmphasisBlocksProps {
  /** A text of several lines: a note's, a description, a caption, a reveal or speaker notes. */
  text: string;
  className?: string;
  /**
   * The heading level a `#` heading takes in the page, so that a text's headings sit under the
   * panel's own; `##` and `###` take the next ones, up to 6.
   */
  headingLevel?: number;
}

/** A text of several lines, its blocks drawn in a `div`. */
export function EmphasisBlocks({ text, className, headingLevel = 4 }: EmphasisBlocksProps) {
  const blocks = useMemo(() => parseEmphasis(text, { blocks: true }), [text]);
  return (
    <div className={className === undefined ? 'emphasis-text' : `emphasis-text ${className}`}>
      <Blocks blocks={blocks} level={headingLevel} />
    </div>
  );
}

/**
 * The drawn text under a field that edits its source, when it is drawn differently from how it is
 * written; nothing otherwise.
 */
export function EmphasisPreview({
  text,
  blocks = true,
  headingLevel = 5,
}: {
  text: string;
  blocks?: boolean;
  headingLevel?: number;
}) {
  const t = useT();
  const different = useMemo(() => drawsDifferently(text, blocks), [text, blocks]);
  if (!different) return null;
  return (
    <div className="emphasis-preview" role="group" aria-label={t('As it is drawn')}>
      {blocks ? (
        <EmphasisBlocks text={text} headingLevel={headingLevel} />
      ) : (
        <EmphasisRuns text={text} />
      )}
    </div>
  );
}

function Blocks({ blocks, level }: { blocks: readonly EmphasisBlock[]; level: number }) {
  return blocks.map((block, at) => <Block key={at} block={block} level={level} />);
}

function Block({ block, level }: { block: EmphasisBlock; level: number }): ReactNode {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p>
          <Runs runs={block.runs} />
        </p>
      );
    case 'heading': {
      const Heading = `h${Math.min(6, Math.max(1, level + block.level - 1))}` as 'h4';
      return (
        <Heading className={`emphasis-heading emphasis-heading-${block.level}`}>
          <Runs runs={block.runs} />
        </Heading>
      );
    }
    case 'list': {
      const items = block.items.map((item, at) => <Item key={at} item={item} level={level} />);
      return block.ordered ? (
        <ol start={block.start === 1 ? undefined : block.start}>{items}</ol>
      ) : (
        <ul>{items}</ul>
      );
    }
    case 'quote':
      return (
        <blockquote>
          <Blocks blocks={block.blocks} level={level} />
        </blockquote>
      );
    case 'rule':
      return <hr />;
    case 'code':
      return (
        <pre>
          <code>{block.text}</code>
        </pre>
      );
    case 'table': {
      const alignOf = (column: number) => {
        const align = block.align[column] ?? 'none';
        return align === 'none' ? undefined : `emphasis-align-${align}`;
      };
      return (
        <div className="emphasis-table">
          <table>
            <thead>
              <tr>
                {block.head.map((cell, column) => (
                  <th key={column} className={alignOf(column)} scope="col">
                    <Runs runs={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            {block.rows.length > 0 && (
              <tbody>
                {block.rows.map((row, at) => (
                  <tr key={at}>
                    {row.map((cell, column) => (
                      <td key={column} className={alignOf(column)}>
                        <Runs runs={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      );
    }
  }
}

/** A list item: a task item's box, which never changes the file, then its blocks. */
function Item({ item, level }: { item: EmphasisItem; level: number }) {
  const [first, ...rest] = item.blocks;
  // A tight item writes its first paragraph without a paragraph of its own, as Markdown does.
  const lead = first?.kind === 'paragraph' ? first : undefined;
  return (
    <li className={item.checked === undefined ? undefined : 'emphasis-task'}>
      {item.checked !== undefined && (
        <input type="checkbox" checked={item.checked} disabled readOnly />
      )}
      {lead && <Runs runs={lead.runs} />}
      <Blocks blocks={lead ? rest : item.blocks} level={level} />
    </li>
  );
}

/** Runs in order, the runs of one link together in one `a`. */
function Runs({ runs }: { runs: readonly EmphasisRun[] }) {
  const parts: ReactNode[] = [];
  for (let at = 0; at < runs.length;) {
    const link = runs[at]!.link;
    if (link === undefined) {
      parts.push(<Run key={at} run={runs[at]!} />);
      at++;
      continue;
    }
    const first = at;
    const inside: ReactNode[] = [];
    while (at < runs.length && runs[at]!.link === link) {
      inside.push(<Run key={at} run={runs[at]!} />);
      at++;
    }
    parts.push(
      <a key={first} href={link} target="_blank" rel="noopener noreferrer">
        {inside}
      </a>,
    );
  }
  return parts;
}

function Run({ run }: { run: EmphasisRun }) {
  let node: ReactNode = <Lines text={run.text} />;
  if (run.code) node = <code>{node}</code>;
  if (run.highlight) node = <mark>{node}</mark>;
  if (run.underline) node = <u>{node}</u>;
  if (run.strike) node = <s>{node}</s>;
  if (run.italic) node = <em>{node}</em>;
  if (run.bold) node = <strong>{node}</strong>;
  return node;
}

/** A run's text, each line break kept as one. */
function Lines({ text }: { text: string }) {
  if (!text.includes('\n')) return text;
  return text.split('\n').map((line, at) => (
    <Fragment key={at}>
      {at > 0 && <br />}
      {line}
    </Fragment>
  ));
}
