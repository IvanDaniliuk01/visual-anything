/**
 * A caption's text, a reveal's sentence or speaker notes (ADR 0058), with text emphasis and
 * Markdown's blocks (ADR 0082): paragraphs and lists as before, and headings, quotes, code, tables
 * and links. Never HTML: whatever the text holds is written as text nodes, so nothing in it can run.
 */
import { EmphasisBlocks } from '../text/EmphasisText';

export function TourText({
  text,
  className,
  headingLevel = 4,
}: {
  text: string;
  className?: string;
  /** The level a `#` heading takes, under the card's or the window's own title. */
  headingLevel?: number;
}) {
  return <EmphasisBlocks text={text} className={className} headingLevel={headingLevel} />;
}
