/**
 * Plain text with paragraphs and lists (ADR 0058), as a caption or speaker notes hold it: never HTML.
 * Whatever the text holds, markup included, is written as text, so nothing in it can run.
 */
import { textBlocks } from '@visual-anything/core';
import { useMemo } from 'react';

export function TourText({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => textBlocks(text), [text]);
  return (
    <div className={className}>
      {blocks.map((block, at) => {
        if (block.kind === 'paragraph') return <p key={at}>{block.text}</p>;
        const items = block.items.map((item, index) => <li key={index}>{item}</li>);
        return block.ordered ? (
          <ol key={at} start={block.start}>
            {items}
          </ol>
        ) : (
          <ul key={at}>{items}</ul>
        );
      })}
    </div>
  );
}
