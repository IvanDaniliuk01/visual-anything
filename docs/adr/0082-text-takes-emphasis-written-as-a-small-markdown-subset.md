---
status: accepted
---

<!-- Decided by Claude on 2026-10-29 under the user's standing delegation of design decisions, from the research on text emphasis and faces (items 11 and 12 of the notes the user's modeling session kept). The research's open choices were settled as it recommended: the term Face, underline and highlight in the subset, emphasis opt-in for attributes, `middle` placement changing how shapes with a detail look, and canvas labels moving to Roboto with faces. -->

# Text takes emphasis written as a small Markdown subset, kept as typed and drawn by the program; a detail wraps, and a shape places its text block

While building a real data model, the user found that every text on the canvas is plain (notes 11 and 12):

- notes, tour captions, descriptions and text attributes take no bold, italic, underline or strikethrough, so a long note has no way to point at what matters, such as the name of a table or the `status` that changes;
- a text attribute shown as detail is cut to the room left under the name, often one line ("Una corrida de a…");
- `writeShapeText` anchors the name's bottom at the vertical centre and starts the detail just under it, so a tall shape such as "Nota de paso" (320 × 96) leaves its top half empty.

M3d's task "Text that takes emphasis" asks for an ADR first. Component faces, which also answer note 13, are decided apart (ADR 0083), and this decision says what they later take over.

## Decision

### Where text takes emphasis

- **Always:** a note's text; a tour caption's text, a reveal's sentence and a step's speaker notes (the title stays plain, and is drawn bold already); every `description` (elements, relations, components, relation types, attributes, views, scenarios, tours, packages).
- **When its definition says so:** a string attribute whose `AttributeDefinition` has `"format": "emphasis"`. Its values take emphasis wherever they are drawn: in the detail, in the inspector, in the element list and in exports. Every other attribute stays plain, so that column names such as `col_*_id`, SQL defaults such as `'**'::text` and identifiers never change their look. Left out, `format` is `plain`.
- **Never:** names of elements, definitions, views and anything else that is also an identifier people search for, sort by and see in Mermaid or Structurizr; and badges.

**Text emphasis** is the term (CONTEXT.md). "Emphasis" alone stays the canvas's emphasis of ADR 0024 and playback.

### The subset

Inline, in the order a reader meets them:

| Written | Drawn | Notes |
| --- | --- | --- |
| `**bold**` | bold | |
| `*italic*` or `_italic_` | italic | `_` never opens or closes inside a word, so `col_0_del` stays as written |
| `~~strikethrough~~` | struck through | GFM's form |
| `` `code` `` | monospace, on a faint back | its content is literal; a run of n backticks closes on n |
| `==highlight==` | on the theme's highlight color | Obsidian's and many editors' form; for "the `status` that changes" |
| `++underline++` | underlined | markdown-it-ins's form; Markdown has no underline |

- **Delimiters follow CommonMark's flanking rules, simplified:** an opener is followed by a character that is not a space, a closer is preceded by one, and for `_` the outer side is not a letter or a digit. So `C++ and C++`, `a * b * c` and `2 ~~ 3` stay as written. A closer matches the nearest open delimiter of its kind; delimiters left unmatched are literal text. Emphasis nests (`**bold _and italic_**`), except inside code.
- **Escapes.** A backslash before any of `\ * _ ~ ` = +` writes that character; any other backslash is itself.
- **Blocks, in texts that hold several lines** (notes, captions, reveals, speaker notes, descriptions): as captions already read them (ADR 0058), a blank line starts a paragraph, lines that start with `- `, or a number and `. `, make a list, and any other line break is kept as a line break. In a detail, which is one paragraph, line breaks are spaces.
- **Not in the subset:** links and addresses, images, headings, block quotes, tables, raw HTML (a `<u>` is drawn as the four characters it is), and a color, font or size for part of a text.
  - Colors per part would bypass the theme and the contrast checks (ADR 0033); a highlight takes the theme's color, checked in both themes.
  - Sizes and fonts per part would make a label's height depend on its markup, and the PDF embeds only the fonts it ships (ADR 0047). Sizes, fonts and colors belong to faces, by slot.
  - Destinations (ADR 0056) are how something on the canvas opens something; a link in a text would be a second way, with no allow-list.

### How it is stored

- **As typed.** A text that takes emphasis is the same JSON string as today, with the markers in it. A file read in an editor, in git or in a pull request shows `the **orders** table`, which reads as plain text and as Markdown. Nothing else is stored: no runs, no offsets, no HTML.
- **The format does not change.** Version 1 stays, and every new key is optional (ADR 0022). An older build shows the markers literally; it refuses only files that use the new keys.
- **The core reads it** (`core/src/text/emphasis.ts`, pure TypeScript, no dependency):
  - `parseEmphasis(text, { blocks })` answers paragraphs and list items of runs, each run `{ text, bold, italic, strike, underline, code, highlight }`. It never throws, runs in linear time, and stops at 4,000 runs, the rest one plain run;
  - `plainText(text)` answers the text without markers, for search, find, filters on text, sorting, the outline's accessible text and announcements;
  - `escapeEmphasis(text)` writes text so that it is read back exactly as written.
- **Imports write text as text.** A recipe or import that puts outside text (an SQL `COMMENT`, a CSV cell, a Mermaid label) into a description or an attribute that takes emphasis writes it through `escapeEmphasis`. Claude writes markers on purpose, and its tools' descriptions name the subset.

### How it is drawn

- **On the canvas.** A label with no markers is drawn as today. A label with emphasis is laid out by the app's own line breaker over the bitmap fonts' advances, and its glyphs are drawn as textured quads in one graphic per tile, beside the tile's other labels. The prototype of this research measured that path at 10,000 shapes of 17.6 runs each: with 220 of them on screen, panning took 6.1 ms a frame on average and 10.7 ms at the 95th percentile on the reference laptop.
  - **Fonts.** The name's font (14, semibold) and the detail's (11) each gain bold, italic, bold italic and monospace variants. Each is installed the first time a text needs it: about 180 ms and one atlas page each, measured. A highlight is a band behind its run in the theme's `highlight` color, a code run has a band in the theme's `codeBack`, and underline and strikethrough are bands in the run's color. All of them are tinted, so a theme switch only tints again.
  - **Notes** are drawn the same way, no longer as canvas text.
- **In panels** (the inspector, the element list, captions, speaker notes, the outline, hover cards): the runs become React elements (`strong`, `em`, `s`, `u`, `code`, `mark`). Text is never turned into HTML, so the Trusted Types policy stays as it is.
- **In the read-only page,** by the same code, with no new dependency.

### A detail that wraps, and the whole text on hover

- **`DetailRules.lines`**, from 1 to 6, with 3 by default, says how many lines a shape's detail may take. It is inherited on its own, as the other parts of a detail are. The detail wraps within the label area, and its last line ends with "…" when the text is longer.
- **The room** is shared out in order: the name first, wrapped as today, then the detail's lines, up to `lines` and up to what the label area holds. Today's split of the area in halves goes.
- **Containers.** A collapsed container's header writes its detail on up to `lines` lines under its name, and its collapsed height grows by those lines; the scene works it out, and layout reads it like any size. An expanded container's header and a row write one line, as today.
- **The whole text on hover.** Hovering a shape whose name or detail was cut, or focusing it from the keyboard, shows a hover card after 400 ms: its name and its whole detail, with emphasis, in the HTML layer the app already places over the canvas. The card is built with text nodes only. The announcement for screen readers says the whole detail. The read-only page shows the same card.

### Where a shape places its text

- **`Appearance.textPlacement`**, `top`, `middle` or `bottom`, places the block made of the name and the detail inside the label area, with an inset of 8 units: from its top, centred, or ending at its bottom. It inherits as every trait does; Essence sets `middle`.
- **`middle` centres the whole block.** A shape with no detail draws as it does today. A shape with a detail moves its name up by half the detail's height: "Nota de paso" fills its middle rather than its lower half. This changes how existing views look, on purpose, and the release notes say so.
- **Containers and rows** write their header at the top whatever the trait says. **Free geometry** places the block in its `label` rectangle (ADR 0066). **Name tags** are unchanged.

### What the exports keep

- **SVG and PDF draw what the canvas draws.** Each line is a `<text>` with a `<tspan>` for each run, its `font-weight`, `font-style` and family (Roboto, Roboto Mono), each run placed by its own `x` so that no reader re-flows it. Bands for highlight, code, underline and strikethrough are `<rect>`s, so that SVG-to-PDFKit draws them exactly. The exports break lines with Roboto's widths, as they do today (`export/text-layout.ts`). The PDF embeds Roboto Italic, Bold Italic and Roboto Mono, all Apache-2.0 (ADR 0047), only when a text uses them.
- **The outline in Markdown** writes runs as CommonMark and GFM: `**`, `*`, `~~` and backticks, highlight as `<mark>` and underline as `<ins>`, both of which GitHub keeps. Everything else is escaped, as the outline escapes every text of the project today. The source text is never passed through.
- **Mermaid** writes labels as plain text (`plainText`), escaped as today. Mermaid's markdown strings are not used: they take bold and italic only, wrap on their own, and draw differently in each host. While any label it writes had emphasis, the export says among what it lost: "text emphasis (bold, italic and the rest) is written as plain text".
- **Structurizr DSL** writes names and descriptions as plain text, and says the same.
- **The read-only page** carries the texts as stored and draws them as the app does.

### Editing

- **The inline editor** (the HTML layer, ADR 0014) edits the source, markers and all. Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+X (strikethrough), Ctrl+E (code) and Ctrl+Shift+H (highlight), with ⌘ on a Mac, wrap the selection in markers or take them away. The canvas draws the result once the edit is committed.
- **Description fields** in the inspector, and the caption fields of the tour editor, show the source with the drawn text under it.
- **Commands do not change.** A text is a string, set by the commands that set it today, by the person or by Claude.

## Considered options

- **CommonMark or GFM in full, through markdown-it or micromark:** rejected. Links, images, headings and raw HTML are not wanted on a canvas, each needs an allow-list of its own, and the libraries are large for what is used. The subset's reader is about 250 lines in the core, with property tests.
- **Runs stored as JSON** (`[{ "text": "orders", "bold": true }]`, as Figma and tldraw's TipTap documents do): rejected. Files would stop being readable plain text, and a one-word change would rewrite a structure in git.
- **An HTML subset** (`<b>`, `<i>`, `<u>`, `<s>`, as Miro's sticky notes take): rejected. It reads worse in a file, it invites the next tag, and every reader must clean it again.
- **PixiJS's `tagStyles`:** rejected. It has no escaping, so a tag the style names in someone's text would be read as markup; it styles canvas text, which is slow to make by the thousand; and `SplitBitmapText` ignores it.
- **PixiJS's `HTMLText`:** rejected. It writes its text through `innerHTML`, which the app's Trusted Types policy refuses, and it draws a frame late. ADR 0083 measures the same route, through `foreignObject`.
- **Emphasis on every string attribute:** rejected. Identifiers and SQL would change their look; `format` makes it a choice of the definition.
- **Leaving underline out,** since an underline reads as a link: considered. The user asked for it, and Visual Anything's destinations are not drawn as underlined text, so it stays, written `++…++`.
- **Color and size per part:** rejected for text emphasis (see "Not in the subset"). Faces give them by slot.
- **Mermaid's markdown strings:** rejected (see "What the exports keep").

## Consequences

- The schema gains `AttributeDefinition.format`, `DetailRules.lines` and `Appearance.textPlacement`, with their checks, and the schemas are regenerated.
- The core gains `parseEmphasis`, `plainText` and `escapeEmphasis`, with property tests:
  - `parseEmphasis(escapeEmphasis(s))` is one plain run equal to `s`;
  - `plainText(s)` never holds a marker that was matched;
  - parsing never throws, and its time grows linearly with the text.
- The app gains the run line breaker, glyph-quad labels by tile, the lazy font variants, the bands, the hover card and the editor's keys. The benchmark gains a phase with emphasis in every detail.
- The exports gain tspans and bands, the PDF's three fonts, the outline's writer of runs, and what Mermaid and Structurizr say they lost.
- Imports and Claude's recipes escape outside text; Claude's tool descriptions name the subset and the attributes that take it.
- CONTEXT.md gains **Text emphasis**, and **Detail** says it wraps to its lines.
- **Faces take over part of this** once they are built (ADR 0083):
  - the canvas's run drawing becomes the drawing of a face's text, and is kept;
  - labels are then measured and drawn in Roboto, so that the canvas and the exports break lines alike;
  - `textPlacement` and `lines` become what Essence's built-in face reads.

  The subset, its storage, its escaping and what the text exports keep are not superseded.

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, after the user asked: "el texto con formato me gustaría que soporte markdown". -->

- 2026-10-30: **texts that hold several lines take Markdown, not only inline emphasis.** This supersedes part of "Not in the subset".
  - **Which texts:** notes, descriptions, tour captions' texts, reveals' sentences and speaker notes, written as CommonMark with GitHub's tables, strikethrough and task lists, plus this ADR's `==highlight==` and `++underline++`.
  - **What they take, besides the inline emphasis above:**
    - headings `#` to `###`, drawn at three sizes from the text's own;
    - bulleted and numbered lists, nested up to three levels, and task lists (`- [ ]`, `- [x]`), drawn as boxes that never change the file when clicked;
    - block quotes, drawn with a bar;
    - horizontal rules;
    - fenced code blocks in the monospace font, never highlighted as a language and never run;
    - GitHub tables of at most 12 columns and 50 rows, laid out by the program;
    - links `[label](address)`, for `http:`, `https:` and `mailto:` only. On the canvas and in exports a link is drawn as its label, underlined, and never fetched. In the panels, the hover card and the read-only page, it opens in a new tab with `rel="noopener noreferrer"` after the person clicks it. Any other address is drawn as plain text.
  - **Still not taken:** images, which would fetch; raw HTML, which is drawn as the characters it is; footnotes; and a color, font or size for part of a text. Faces give those by slot (ADR 0083).
  - **Detail, names and one-line texts** keep the inline subset only. A heading or a list there is written as the characters it is.
  - **The reader stays the core's own, now with blocks.** It is CommonMark's block structure, simplified, plus the inline rules above, with no dependency, linear in time, never throwing, and capped at 4,000 runs and 500 blocks. Its property tests gain blocks, and a conformance subset of CommonMark's spec examples for what it takes.
  - **Exports:**
    - SVG and PDF draw what the canvas draws;
    - the outline in Markdown writes the blocks as CommonMark, escaped as before;
    - Mermaid and Structurizr write plain text and say what they lost.

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, while building part A of "Text that takes emphasis": the reader, the schema, the panels, the text exports, imports and Claude. -->

- 2026-10-30: **how part A reads, shows and writes text emphasis.** Part B draws it on the canvas and in SVG and PDF, and wraps and places the detail.
  - **The reader follows CommonMark more closely than "simplified" said.**
    - Delimiters take CommonMark's flanking rules whole, punctuation and the rule of three included. `~~`, `==` and `++` take the same rules, as runs of exactly two.
    - A backslash before any ASCII punctuation writes that character, as in CommonMark, not only before the subset's markers.
    - Entity references (`&copy;`) are drawn as the characters they are.
    - Its conformance tests are 350 examples of CommonMark's specification (0.31.2) and of GitHub's (tables, strikethrough, task lists), copied into the core's tests under their CC BY-SA 4.0 licence.
  - **What it leaves out of CommonMark's blocks:**
    - setext headings, so a `---` under a paragraph is a rule;
    - indented code, so indented lines are a paragraph's text;
    - lazy continuation lines: a line without its quote's `>` or its item's indent starts a paragraph of its own, as captions already read it (ADR 0058);
    - reference links and autolinks;
    - headings 4 to 6, and lists and quotes nested deeper than three levels: these are written as the characters they are.

    As captions already do, a list started with any number interrupts a paragraph.
  - **Limits.**
    - A table of more than 12 columns is not read as a table. The rows after its 50th are read as a paragraph.
    - Past 4,000 runs, the rest of each text is one plain run of its text, its markers read. Past 500 blocks, the rest of the text is one plain paragraph of its source.
    - A link to an address other than `http:`, `https:` or `mailto:` is drawn as its label, as plain text.
  - **`plainText`** writes:
    - blocks a line each;
    - list items without their markers;
    - a link as its label;
    - a table's cells with a tab between them.
  - **`escapeEmphasis` escapes as little as it can:**
    - `*`, the backtick, `[` and `|` always;
    - `_` unless it stands between letters or digits, so `user_id` stays as it is;
    - `~`, `=` and `+` only when doubled;
    - `\` before punctuation or at a line's end;
    - `#`, `>`, `-`, `+`, a number's `.` or `)` and `~~~` at a line's start.

    Blank lines and the spaces at a line's ends cannot be escaped: a text of several lines keeps its lines, trimmed, and its paragraphs.
  - **The schema and the core.**
    - `format` is only for string attributes.
    - `lines` and `textPlacement` are worked out along the chain in the core (`ResolvedDetail.lines`, `ResolvedAppearance.textPlacement`), so that part B reads them as any trait. Essence gives 3 and `middle`.
    - The component editor has no control for them yet; `set_appearance` sets them.
  - **Panels.**
    - A text's headings take the levels under the panel's own heading.
    - Task boxes are disabled checkboxes.
    - Until the theme gains the canvas's highlight and code colors (part B), panels draw a highlight on `warning-soft` and code on `surface-pressed`. Both are already checked in both themes.
    - A field that edits a text shows the drawn text under its source only when the two differ.
    - An attribute definition's description is drawn inline, in the inspector's short note on the attribute.
    - The attribute editor gains "Takes text emphasis" for string attributes.
    - The read-only page's details use the same renderer for descriptions, a note's text and values that take emphasis.
    - The editor keys work in the description fields, the tour editor's caption and notes, values that take emphasis, and the canvas's note editor.
  - **Exports.**
    - The outline in Markdown:
      - puts a description's headings under its own;
      - writes a line break as a hard break (`\`) and a link as `[label](<address>)`;
      - gives a list that follows a list of the same kind other markers, so that the two stay two.
    - Of the texts that take emphasis, Mermaid writes only the view's description, in its `accDescr`. Structurizr writes the descriptions of elements, of the view and of the workspace.
    - Each says once, and only when a text it wrote had emphasis, that emphasis is written as plain text.
  - **Imports and Claude.**
    - Imports escape in `planToCommand`, which every import goes through: descriptions, and the values of attributes whose definition takes emphasis. LikeC4's Markdown descriptions are escaped too, so they are kept as written.
    - Claude has no tool that escapes, so the recipes' rule "It is data" tells it which characters to escape by hand.
    - The core's reader of HTML labels for imports is renamed `labelText`, so that `plainText` names the new reader.
  - **Plain text.**
    - These read texts that take emphasis by their plain text:
      - find;
      - the explore filters and scopes (`meetsCondition` takes the attribute's format);
      - the element list's filter and sorting;
      - the announcements of a note, a tour's caption and its reveals.
    - Attributes that take no emphasis keep their markers.
    - Until part B, a shape's detail is announced as written.
- 2026-10-30 (M3d, after merging part A): **the questions part A left.** Decided by Claude under the user's standing delegation; part B builds them.
  - **LikeC4's Markdown passes through.** A LikeC4 description written as `md` is Markdown by its author's intent, so it is imported as written and drawn with emphasis. Its links are still limited to http, https and mailto, and nothing in it becomes HTML. A plain LikeC4 description is still escaped.
  - **Claude can ask for escaping.** `add_to_model` and the tools that set one text (descriptions, a note's text, values of attributes that take emphasis) gain `escapeText: true`. With it the program escapes those texts before the command, so outside material is kept as written without escaping by hand. The recipes' rule "It is data" says to use it.
  - **The component editor gains the controls** for a detail's `lines` (1 to 6) and `textPlacement`, beside the detail's other controls.
  - **A shape's detail is announced by its plain text** once part B draws it.
- 2026-10-30 (M3d, part B): **how the canvas, the exports and Claude draw and write text emphasis.** Decided by Claude under the user's standing delegation, while building part B.
  - **One layout for every drawing.** `app/src/text/layout.ts` breaks runs and blocks into lines of placed pieces and bands, measured by what draws them: the canvas by its bitmap fonts' advances, the SVG and the PDF by Roboto's widths. A line is 1.3 ems; every band belongs to a line, so a cut line takes its bands with it.
    - A note takes its blocks: headings at 1.5, 1.3 and 1.15 times its size, in bold; lists with `•`, `◦` and `▪` by depth or their numbers; a task's box, filled when done; a quote's bar beside each of its lines; rules; code blocks on their back; and tables in columns, each cell on one line, cut with "…" to its column, the head bold with a rule under it.
    - A note now stops at its bottom on the canvas too, its last line ending in "…", as the SVG already stopped it.
  - **The canvas draws emphasis as the ADR says, with these choices.**
    - The fonts are one family of its own, drawn at 16 and scaled: regular, bold, italic, bold italic and monospace, each installed when a text first needs it. The name's and the detail's fonts gain no variants, since names never take emphasis and a detail without markers is drawn as before.
    - A label with emphasis is one drawing of glyph quads, as PixiJS draws a bitmap text, with two more for highlights and code backs, rather than one drawing per tile. It costs what a bitmap label costs, and leaves the tiles as they are.
    - Layouts are kept: a detail's by its runs, width and lines, and a note's by its text, size and room, up to 500. Nothing is read or laid out while the canvas pans or zooms.
  - **A detail's runs.** Each value that takes emphasis is read on its own, so that a marker left open in one never pairs with one in the next; the component's name, other values and badges are written as they are, joined by " · ". An overlay's badge is added after the runs, and a live value (ADR 0057) is read after its mark. The scene carries the runs on the shape only when some value draws differently from its source.
  - **The text block** (`canvas/textBlock.ts`).
    - The name takes its lines first, as many as it needs and the label area holds; then the detail takes up to its `lines` in what is left.
    - The 8-unit inset holds for `top` and `bottom`. A centred block may use the whole label area but 2 units at each end, so that low shapes, such as a cylinder's label area, still hold a name and a detail.
    - A shape with its own outline places its block in its label area by `textPlacement` too.
    - **Left for later:** a collapsed container's header still writes its detail on one line, and its collapsed height does not grow by the detail's lines. Both live in the collapse and layout code, which M3c's routing work was changing at the same time.
  - **Theme tokens.** The theme already names `highlight` for guidance and playback, so the new tokens are `emphasisHighlight` and `emphasisCode`. Every text color of the panels reads on both at 4.5:1 in both themes.
    - On the canvas a label's text follows its shape's fill, not the theme. A highlight and a code back are drawn in the light theme's colors behind dark text and in the dark theme's behind light text, whichever theme the canvas is in.
    - The panels' highlight and code moved from `warning-soft` and `surface-pressed` to the new tokens.
  - **The hover card.**
    - It shows only when the canvas cut the shape's name or detail, 400 ms after the pointer rests on the shape or the keys reach it, under the shape.
    - It is hidden from screen readers. The announcement says the whole detail by its plain text, for every shape whose detail says more than its component's name; until now only rows said their detail.
    - The read-only page shows the same card.
  - **The SVG and the PDF.**
    - A detail without emphasis is written as before. A detail with emphasis and a note whose text draws differently are written from the layout, each piece a `tspan` with its own `x`. Spaces at a piece's start are moved past, since readers of SVG fold them away.
    - Italic is measured as upright, and code at 0.6 ems, which Roboto Mono's advance is.
    - The PDF embeds Roboto Italic and Bold Italic 2.137, from `roboto-fontface` 0.10.0 as Regular and Bold are, and Roboto Mono 3.000's Latin subset, from `typeface-roboto-mono` 1.1.13. All are Apache-2.0 by their own name tables, and kept unchanged in `fonts/roboto-emphasis.json`. They are loaded and embedded only when the drawing writes italic or monospace text.
  - **Claude's `escapeText`.**
    - It is on `add_to_model`, `update_element`, `update_relation`, the package, component, relation type, view, free shape and project tools, the scenario and tour tools for their descriptions, and `run_commands`, which the recipes send re-imports through.
    - It escapes descriptions, a note's text, attribute definitions' descriptions, and the values of attributes whose definition takes emphasis, by the definitions before the call. Defaults and choices are not escaped, and `null` still removes a text.
    - Tour captions, reveals and speaker notes are not escaped by it. The rule "It is data" still says to escape those by hand.
  - **LikeC4.** An `md` description keeps its indents and inner spaces, so that nested lists and code survive; a `txt` one is read as before and escaped. A plan marks a description that is Markdown already with `descriptionIsMarkdown`. An image in it is drawn as `!` and a link, and never fetched.
  - **The component editor.** "Lines, at most" (a choice of 1 to 6) and "Where its text sits" (at the top, in the middle, at the bottom) sit in the Detail section after Badges, each showing what it inherits and able to go back to it. A component that draws rows says that it writes its name at the top while it does.
  - **Not done in part B:** the benchmark's phase with emphasis in every detail, left for its next run; the benchmark never holds a milestone.
