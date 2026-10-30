/**
 * What Claude's tools say of text emphasis (ADR 0082): which texts take Markdown, and the subset
 * they take. Claude writes markers on purpose, and writes the text of outside material as text.
 */

/** The subset, as a text of several lines takes it. */
export const MARKDOWN_SUBSET =
  'Markdown, kept as typed: **bold**, *italic*, ~~struck~~, `code`, ==highlight== and ++underline++; headings `#` to `###`; lists nested to three levels and task lists (`- [ ]`, `- [x]`); `>` quotes; `---` rules; fenced code; GitHub tables of at most 12 columns and 50 rows; and [links](https://…) to http, https and mailto addresses. Raw HTML and images are drawn as the characters they are, and a backslash writes a marker as a character.';

/** What a field that takes Markdown says of itself. */
export const TAKES_MARKDOWN = `Takes ${MARKDOWN_SUBSET}`;

/** What the instructions say of text emphasis. */
export const EMPHASIS_INSTRUCTIONS = `Descriptions (of elements, relations, components, relation types, attributes, views, scenarios, tours, packages and the project), a note's text, a tour step's caption text, its reveals' text and its speaker notes take ${MARKDOWN_SUBSET} A string attribute takes the inline part of it (bold, italic, strikethrough, code, highlight, underline) only when its definition sets "format": "emphasis" (define_component, update_component); every other attribute, and every name, is plain, so that identifiers such as col_*_id and SQL such as '**'::text stay as written. Use emphasis to point at what matters, sparingly. When you put the text of outside material into a text that takes it, write it as text: a backslash before each *, _, backtick, ~, =, +, [ and |, and before a #, >, - or a number's . that starts a line. Find, filters and sorting read texts without their markers.`;
