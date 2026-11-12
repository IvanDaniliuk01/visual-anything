---
status: accepted
---

<!-- Decided with the user on 2026-11-10 in the wayfinder map docs/wayfinder/explorables-and-math/ (Q7, Q8, Q21), from its research and its proof on branch prototype/math-layout. The details the user did not decide were decided by Claude under the user's standing delegation. -->

# Math is TeX notation, parsed and measured by KaTeX, laid out by the core and drawn alike everywhere text takes emphasis

The user explains mathematical modules with Visual Anything and asked for "un compilador de LaTeX … más que nada para las fórmulas". Text takes emphasis as a small Markdown subset (ADR 0082), and faces lay out what their shapes show (ADR 0083), but nothing can write $\frac{1}{n}\sum_i (y_i - \hat y_i)^2$. The map's research compared KaTeX and MathJax 4 (`research/math-typesetting`), and a prototype proved that the core can lay out KaTeX's tree as Chrome lays out KaTeX's HTML (`prototype/math-layout`).

## Decision

### What Math is, and where it is written

- **Math is TeX notation in a text:** `$…$` within a line and `$$…$$` as a block of its own, typeset wherever the text shows. Only the notation is typeset; nothing compiles a document, and there is no TeX engine (the user's Q7).
- **It is read inside ADR 0082's reader, before emphasis, as a code span is,** by Pandoc's `tex_math_dollars` rule: an opening `$` has a non-space character right after it, and a closing `$` a non-space character right before it and no digit right after it. So `$20,000 and $30,000` stays text, an unmatched `$` stays text, and `\$` is a dollar sign, as the reader already escapes ASCII punctuation.
  - Its content is literal: no emphasis inside it.
  - `$$…$$` on lines of its own is a block in texts that take blocks; elsewhere it is inline, in display style.
  - GitHub's forms read the same, so that pasted Markdown keeps its formulas: `` $`…`$ `` inline, and a fenced block whose language is `math` as a block.
- **Math goes where emphasis goes,** and nowhere else: notes, captions, reveals, speaker notes, descriptions and tour texts always; a text attribute only when its definition's format is `emphasis`; never names or identifiers.
- **Nothing in the files changes.** Texts are strings, as before; a project written with Math opens in older versions, which show the TeX as typed. The protocol's version does not change.
- **What leaves as text keeps the TeX as written:** `plainText` writes `$tex$`, so search, screen readers on the canvas, `read_view`, `get_item` and Mermaid or Structurizr exports read and write the notation itself. `escapeEmphasis` and `escapeText` escape `$`, so imported text, such as SQL's `$1`, keeps reading as typed.

### How it is typeset

- **KaTeX parses and measures; the core lays out.** `core/src/math/` holds `typesetMath(tex, { display })`, pure and synchronous, which calls `katex.__renderToHTMLTree` and lays the tree out into one **math drawing** in ems: glyphs (font, character, x, baseline), rules, KaTeX's SVG paths for surds, stretchy delimiters, braces and accents, and a box (width, height, depth). It runs alike in Node and the browser, so the app, the command line, Claude's tools and the read-only page get the same drawing, as faces do (ADR 0083). Drawings are kept by `(tex, display)`; size is a scale.
- **Horizontal placement uses the fonts' own advance widths,** read from KaTeX's TTF fonts into a generated table (`core/src/math/advances.json`, about 30 KB), not KaTeX's metric widths, which differ for 25 glyphs. The layout is in ems and does not copy the browser's pixel snapping, so the canvas does not depend on zoom; array column separators sit up to about 1 px from where a browser at 100 % puts them.
- **KaTeX is the core's first runtime dependency** besides the schema. It does no input or output on this path, so the core stays pure. It is pinned to one exact version, since the layout leans on the double-underscore `__renderToHTMLTree` and on about a hundred of KaTeX's CSS class names, which change between versions (`.base` became `.katex-base` between 0.16.47 and 0.19.1).
- **A golden test holds it:** the prototype's two corpora (86 formulas) with Chrome's recorded measurements of KaTeX's own HTML at four sizes, every glyph within 0.5 px at 16 px a KaTeX em, every rule and every SVG piece in its place. The test needs no browser. Upgrading KaTeX regenerates the measurements with a script that drives a headless Chrome on the developer's machine, and the upgrade lands only when the test passes.
- **Settings.** KaTeX runs with `trust: false`, `throwOnError: true` and its own expansion limits. `\color`, `\textcolor`, `\colorbox` and `\href` are refused, since ADR 0082 keeps colors to the theme and links to their own syntax. A formula is at most 2,000 characters, and a text holds at most 200 formulas; past either, the rest is drawn as its TeX.
- **A formula that fails** (a TeX error, a refused command, or a construct the layout does not know) is drawn as its TeX in Roboto Mono with a warning mark, and the Checks panel lists it as `math-error` with KaTeX's message. A text that holds Math is listed once as `reads-as-math`, a notice and not a warning, so that a text whose `$` pairs were not meant as Math can be escaped with `\$`.

### Where it is drawn

- **The canvas** draws a drawing's glyphs as tinted quads from bitmap fonts made from KaTeX's woff2 fonts, loaded from bytes as Roboto is (`robotoFonts.ts`), its rules as bands and its paths as shared `Graphics` contexts. Everything is drawn white and tinted, so **a theme switch only tints again**, as for text. A family is installed when a project that holds Math opens, never on the first frame that needs it. Nothing is typeset during a frame.
- **Lines that hold Math are as tall as their tallest formula:** text layout stops assuming one line height, and a detail's `lines` and a face's `line-clamp` cut by height. A display block is centered on its own lines. A formula wider than its line is never broken: it is shrunk to 70 %, then cut, and the hover card shows it whole.
- **Faces** measure Math through their slots: a slot that takes emphasis gives math runs, measured by the drawing's box, so a face of size `content` knows its size before layout. A face's own markup holds no formula; a formula reaches a face through an attribute.
- **Panels** (the inspector, tours, the hover card, the outline) draw a formula with `katex.render`, output `htmlAndMathml`, into an element of their own: same fonts and metrics as the canvas, MathML for screen readers, selectable for copying. KaTeX builds its nodes with `createElement` and sets styles through the CSSOM, so the Trusted Types policies do not change.
- **SVG** writes a drawing's glyphs as outlines, one `<path>` per glyph in `<defs>` and `<use>` for each occurrence, from a generated outline table, so an SVG opened elsewhere needs no KaTeX font. **The PDF** follows through SVG-to-PDFKit. **PNG and Claude's captures** (ADR 0081) draw what the canvas draws, with nothing new.
- **The read-only page** bundles KaTeX and the font families its project uses, as bytes in its script, as Roboto's are (ADR 0041). Its content security policy does not change.
- **Both generated tables,** the advances in the core and the outlines for exports, are written by `pnpm exec tsx packages/core/src/math/generate.ts` from KaTeX's fonts and committed; a test fails while they differ from the pinned KaTeX, as `tokens.css` is held (CLAUDE.md).

### Claude

- Claude writes Math as TeX in any text that takes emphasis, and reads it back as written. The guidance Claude reads says how, with Pandoc's dollar rule and `\$`.
- A capture shows formulas typeset, as the canvas draws them.

## Considered options

- **MathJax 4's SVG output:** rejected. It lays out without a browser, so we would write less, but it is about three times the bytes (about 2.3 MB against 0.8 MB), slower, and its default font loads in pieces on demand, which breaks the synchronous calls faces and layout need. It stays the fallback if a KaTeX upgrade ever breaks the golden test beyond repair; choosing it then needs the user (Q7).
- **KaTeX's HTML everywhere, drawn by the browser:** rejected. The canvas is WebGL (ADR 0014) and the core has no DOM; HTML would mean a picture per formula, blurred when zooming, and no exports from the command line.
- **KaTeX in the panels and MathJax elsewhere:** rejected: two engines and two sets of metrics.
- **A full TeX engine (compiled documents, PDF):** out of scope (Q7).
- **Copying the browser's pixel snapping:** rejected; it would tie the canvas to the zoom for a gap of about 1 px on array separators.

## Consequences

- The core gains a runtime dependency, pinned, with a golden test whose regeneration needs Chrome; CI never needs a browser.
- The app and the executable grow by about 0.3 MB of KaTeX and 0.26 MB of woff2 fonts, plus the outline table; a read-only page with Math grows by about 0.3 MB and the families it uses.
- Text layout gains lines of their own height, which touches the arithmetic of `lines`, `line-clamp` and text insets.
- Not proven yet, and left to the milestone: SVG paths fitted pixel by pixel inside their boxes; Firefox and Safari in the panels; `\raisebox`, `\vcenter`, `\begin{CD}` and `\tag`, which draw as their TeX with `math-error` until the layout knows them.

## Clarifications

- **2026-11-10, A9's reader.** Decided while building, under the user's delegation:
  - A code span and a formula are both atomic: whichever opens first holds what follows, as CommonMark treats a code span against an autolink. Both win over emphasis markers.
  - A `$` right before a backtick opens only GitHub's `` $`…`$ ``; if that fails, the `$` is text.
  - A formula within a line never crosses a line break in a text that takes blocks, and its TeX is never blank.
  - A math block is a line `$$` alone up to the next line `$$` alone, a line that is exactly one `$$…$$`, or a fence whose language's first word is `math`; each interrupts a paragraph, as a fence does. An unclosed `$$` stays text, unlike an unclosed fence, so that a stray `$$` never turns the rest of a note into TeX.
  - Past 200 formulas in a text, the rest read as typed: a formula within a line as plain text, a `$$` block as a paragraph, a math fence as code.
  - `escapeEmphasis` escapes a `$` only when a character other than a space or a line break follows it, which is enough for no formula to open.
  - The Markdown export writes a formula as typed and escapes the other dollars, so GitHub reads the same Math.
- **2026-11-10, A9's layout.** Decided while building, under the user's delegation:
  - The golden test holds every glyph within 0.5 px of Chrome at four sizes with the browser's snapping emulated, and the em layout the app draws within 1.15 px: only an array with three separators and `\hline`s gathers about 0.38 px a separator. A separator keeps KaTeX's least width of 1/16 em.
  - KaTeX runs with `maxExpand: 1000` (its default), `maxSize: 100` ems and `strict: 'ignore'`, shared as `MATH_KATEX_OPTIONS` so that the panels typeset with the same settings.
  - Besides the four refused commands, these draw as their TeX with `math-error` until the layout knows them: `\raisebox`, `\vcenter`, `\tag`, the `CD` environment and numbered environments (their starred forms draw), `\includegraphics`, `\url`, `\htmlStyle`, `\htmlClass`, `\htmlId`, `\htmlData`, and any character KaTeX's fonts lack.
  - The outline table is about 1.3 MB (about 370 KB compressed), larger than first thought, so it lives behind its own entry, `@visual-anything/core/math-outlines`, and never reaches the canvas's bundle; exports load it when they write Math.
- **2026-11-10, A9's panels and checks.** Decided while building, under the user's delegation:
  - `reads-as-math` is a notice: a project's check gains `notices`, apart from its errors and warnings, so that a project with Math is not flagged as having problems each time it opens. The editors' preview shows a text's Math as it will draw, which tells the person where their dollars read as Math.
  - The check reads only texts that hold a `$` or a `math` fence, typesets each distinct piece once and at most 1,000 in all, and lists 20 of each kind before "and N more".
  - KaTeX's stylesheet is split by `packages/app/src/text/generate-katex-css.ts` into its layout rules and its woff2 fonts, served as files under `font-src 'self'`; neither policy changes. The read-only page carries KaTeX's code and rules, about 0.33 MB, and the families it bundles are A9.3's.
- **2026-11-10, A9's canvas.** Decided while building, under the user's delegation:
  - A formula is drawn at 1.21 times its text's size, KaTeX's own `.katex` size, so that the canvas and the panels match; a line holding Math is as tall as its tallest formula plus 0.15 em.
  - Each of KaTeX's twenty fonts is a family of its own, loaded from bytes and installed one per task when a scene holds Math; until a family is installed a formula draws its rules and paths, then repaints.
  - A formula that fails is its TeX in Roboto Mono over a dotted underline in the text's color, since a label is tinted one color; a cut formula ends in "…", as cut text does.
  - A path fitted with `slice` is held in its box by clamping its points rather than by a mask, which would break batching; one shared context is kept per piece, size and cut, up to 4,000.
  - A detail's first line taller than its room is not drawn, and the shape counts as cut so that the hover card shows it.
- **2026-11-10, A9's exports and the page.** Decided while building, under the user's delegation:
  - The SVG keeps each glyph's outline once, as a `<path>` in `<defs>` named by its font and code point (`va-math-Main-Regular-31`), and each of KaTeX's paths once, numbered in the order the document first needs it; a glyph is a `<use>` placed and scaled by a transform, and a path a `<use>` in an `<svg>` of its box with KaTeX's `viewBox` and `preserveAspectRatio`, clipped to it only when it is fitted with `slice`, as the canvas holds it. A formula is a group in its text's color holding its TeX as `data-tex`; a face's writes its rules too, a text's are among its bands. A formula cut to its line is clipped by a rectangle at the cut, so a glyph across the cut shows in part, where the canvas leaves it out.
  - An export that writes Math loads the outline table first: a drawing written before it is loaded writes its glyphs as characters in KaTeX's families and says so, and the SVG, PDF and comparison exports, the app's and the command line's, write it again once loaded. A drawing without Math never loads it.
  - A read-only page holds the families its project's Math uses as data beside the project, `mathFonts`, KaTeX's own woff2 files in base64 by family, as it holds media files, rather than in its script: the script is the viewer's, built once, and holds none, which takes 0.35 MB off it (4.81 MB to 4.46 MB). The viewer's build writes the twenty files beside it, `viewer/fonts/KaTeX_<family>.woff2`, for the app and the command line to take. The families are found by typesetting every formula in every text of the project's files, so a name that reads as Math may add a family, never miss one. Opening, the viewer reads them strictly (each one of KaTeX's families, a woff2 file within 256 KiB, or the page is refused) and installs them from their bytes with `FontFace`, for the canvas's bitmap fonts and under KaTeX's own family names for the panels; `FontFace` from bytes fetches nothing, so the page's policy names no font source and does not change.
  - Mermaid and Structurizr write a formula as `plainText` does, its TeX with its delimiters as typed, and a text whose only markup is Math does not make them say that emphasis was written as plain text. Structurizr keeps writing a backslash as "∖", as it does in every text, so that nothing in a formula ends its string.
- **2026-11-10, A9's Claude and sample.** Decided while building, under the user's delegation: the person gets a project's notices as one info notice when the app connects or reloads; Claude gets `reads-as-math` and `math-error` in the answer of each write that sets a text with `$` or a `math` fence, counting only the texts that write changed; the command line prints no notices. The sample `examples/spam-filter`, "Machine learning: the math of a spam filter", explains a logistic regression with Math. KaTeX's fonts ship under the SIL Open Font License, which ADR 0108 admits.
- **2026-11-12, A9's measures.** Decided while building, under the user's delegation: the PNG export and Claude's captures wait for KaTeX's families still on their way before they draw, and draw again, three times at most, when drawing asked for families not installed yet, such as those of formulas past the 200 a scene's opening scans; each wait ends after 10 s, and a family that fails is not waited for. A comparison's SVG from the versions panel loads the outline table first, as the other exports do. A panel's title for Math that cannot be typeset reads in the app's language: the core's refusals translated, KaTeX's own message as KaTeX writes it. `bench.html?math` measures Math against the same project with plain text in its details and notes, and `packages/app/src/bench/math-typeset.ts` times typesetting in Node.
