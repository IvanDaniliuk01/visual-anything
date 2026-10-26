---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# Imported HTML is a drawing: read from an allow-list and laid out by the local program, cleaned as SVG, never run

People keep cards, small tables, legends, status panels and slides as HTML, and want them on the canvas. The spec plans "static HTML imported as a cleaned drawing". HTML that runs is not planned, and neither is an iframe for each element (spec, Not planned; ADR 0012). The first benchmark's R16 and §8.3 proposed the route taken here: clean the HTML, turn it into SVG, and send that through the SVG pipeline.

## Decision

### What comes in, and where it lands

- **Where it comes from.** An HTML file or fragment, at most 512 KiB of UTF-8 text, from any of:
  - Import… in the header, with a `.html` or `.htm` file, or HTML pasted into it;
  - `visual-anything import <folder> <file.html> [--width <px>]`, through the running program (ADR 0049);
  - Claude's `import_drawing`.
- **What it becomes.** An imported drawing: an ordinary SVG image (ADR 0027).
  - It is stored in one of the project's own packages, where an element's own picture goes, with its `source` naming the file.
  - It is shown as its drawing by one element: either the element selected, or a new element named after the file, of a component the person picks (Box by default), sized to the drawing's proportions.
- **One action.** Making the image and showing it is one undoable action: `Import "pricing.html" as a drawing`, by the person or by Claude.
- **From then on it is a picture like any other.** It can be an icon or a drawing, and it is exported and goes into the read-only page as a cleaned picture. It has no named parts, since the layout step writes no ids.

### How it is made, in the local program

1. **Read** with parse5 8, which parses as the HTML standard says, into a tree of data. Nothing runs: parse5 is a parser, with no DOM, no scripts, no network and no browser.
2. **Clean** from an allow-list, in code of our own (`server/src/drawings/`), as the SVG cleaner is written (ADR 0027):
   - **Elements kept:**
     - structure: `html`, `body`, `div`, `span`, `p`, `section`, `article`, `header`, `footer`, `main`, `aside`, `nav`, `figure`, `figcaption`, `blockquote` and `pre`;
     - headings and lists: `h1` to `h6`, `ul`, `ol`, `li`, `dl`, `dt` and `dd`;
     - text: `code`, `strong`, `em`, `b`, `i`, `u`, `s`, `small`, `sub`, `sup`, `mark`, `br` and `hr`;
     - tables: `table`, `caption`, `thead`, `tbody`, `tfoot`, `tr`, `th` and `td`.
   - **`a` is unwrapped**: its text is kept and its address dropped.
   - **Every other element is dropped with its content and reported.** That includes `script`, `noscript`, `template`, `iframe`, `frame`, `object`, `embed`, `form` and its controls, `link`, `meta`, `base`, `img`, `picture`, `video`, `audio`, `canvas`, `svg` and `math`.
   - **Attributes.** Only `style`, `class` and `id` are read, and only to fold styles; then they are dropped. Every `on…` handler and every address (`href`, `src`, `srcset`, `action` and the rest) is dropped.
   - **Style rules.** `<style>` rules whose selectors are an element name, a class, an id or a comma list of these are folded onto the elements, together with `style` attributes, in the cascade's order: element, class, id, then attribute. Every other rule, and every `@` rule (`@import`, `@font-face`, `@media` and the rest), is dropped and reported.
   - **Properties** come from an allow-list of what the layout step lays out and the SVG cleaner keeps:
     - `display` (`flex`, `block`, `grid` or `none`) and the flex and grid properties;
     - sizes, `margin`, `padding` and `gap`;
     - `border` and its parts, and `border-radius`;
     - `background-color`, and backgrounds that are linear or radial gradients;
     - `color`, `font-size`, `font-weight`, `font-style`, `line-height`, `letter-spacing`, `text-align`, `text-decoration`, `text-transform`, `white-space` and `word-break`;
     - `opacity`, `position` with its offsets, `overflow: hidden` and `transform`.
   - **Values** must belong to a narrow class of characters, as the SVG cleaner's do, and `url(…)` is never kept. `box-shadow`, `filter` and background images are dropped, since the SVG cleaner would drop the filters and pictures they need.
   - **Tables.** The layout step does not lay out tables, so a table becomes rows and columns of flex boxes, and the report says so.
   - **Caps:** 5,000 elements kept, nesting 64 deep, 256 style rules and 100,000 folding steps, so that, as in ADR 0027, no product of capped factors makes cleaning slow.
3. **Lay out and draw** with satori 0.63:
   - at a width the person picks, from 64 to 2,000 CSS pixels, 800 by default, and the height the content needs, up to 4,000;
   - with text drawn as the outlines of its glyphs, in Roboto 2.137 Regular and Bold, which the PDF export already embeds (ADR 0014), whatever font the page names;
   - characters Roboto lacks, emoji included, are left out and reported;
   - satori is given no way to load anything, so no font or picture is ever fetched.
4. **Clean** the SVG that satori writes with the core's `cleanSvg`, as every image is (ADR 0027), within its caps: 64 KiB and 20,000 path commands. A drawing therefore holds a card, a legend or a short table, not a long page. Past the caps the import is refused with `image-too-large`, and the message says to shorten the HTML or make it narrower.
5. **Report** what each step dropped, in the core's words, in English and Spanish (ADR 0038).

**Its limits.** It runs in a worker thread of the local program, limited to 256 MiB and stopped after 10 seconds, so a hostile page cannot stall the program. parse5 and satori are loaded only when a drawing is made, and are in neither the app's page nor the read-only page.

### Why the local program does it

- The command line and Claude already go through the program.
- satori is large: about 675 KB gzipped, with its layout engine and its text shaping in WebAssembly (benchmark R16). In the page it would weigh on every load and on the page's policy.
- The app sends the HTML text over the live connection, within its 4 MiB, and gets back the cleaned SVG and the report. It shows them as a preview, with the drawing drawn as a picture into a canvas, before anything changes, and then sends one command.

### Licenses, checked on the npm registry on 2026-10-26

- **parse5 8.0.1** is MIT. Its one dependency, entities 8, is BSD-2-Clause.
- **satori 0.63.2** is MPL-2.0.
  - MPL-2.0 is a copyleft that covers satori's own files, not Visual Anything's, and it is compatible with the GPL and the AGPL.
  - Its dependencies are MIT: harfbuzzjs 0.10.0, fflate, linebreak, escape-html, css-box-shadow, emoji-regex-xs, parse-css-color, css-gradient-parser, css-to-react-native, @shuding/opentype.js, postcss-value-parser and css-background-parser.
  - Through them come base64-js, unicode-trie, pako, tiny-inflate, string.prototype.codepointat, camelize, hex-rgb and color-name, which are MIT, and css-color-keywords, which is ISC.
- **Roboto** is Apache-2.0, and already ships (ADR 0047).
- **What MPL-2.0 asks.** It asks those who ship an executable to say where satori's source can be had. The single executables (ADR 0037) carry no notice of the code they bundle today; they gain one, listing that code and its licenses, which says where satori's source is.

## Considered options

- **Running the HTML in an iframe or a sandboxed page, then capturing it**: rejected. HTML that runs and iframes are not planned (spec), and ADR 0012 rejects them.
- **A headless browser, such as Chromium driven by Playwright or Puppeteer, printing the page to SVG or PDF**: rejected. It is an engine of over 100 MB, running untrusted pages, scripts included unless switched off, on the person's computer.
- **html-to-image or modern-screenshot, both MIT and the benchmark's fallback**: rejected. They draw the page inside the app's own page through `foreignObject`. That applies the page's styles in the app, and both the page's policy and the cleaner refuse it.
- **Rasterizing the page into a bitmap**: rejected. It needs a browser engine too, and the picture would be blurry text.
- **satori in the app**: rejected. Its size and its WebAssembly would be in the page, and the command line and Claude would need the app open.
- **satori-html to turn HTML into satori's input**: rejected. It was last published in 2022 (benchmark), and our own allow-list has to stand between the file and satori anyway.
- **A layout engine of our own**: rejected. It is months of work.
- **Keeping text as SVG text**: rejected. The cleaner drops text on purpose (ADR 0027): fonts differ between computers, and text is a channel for instructions aimed at Claude.
- **HTML elements' ids becoming named parts (ADR 0067)**: left for later. satori writes no ids.

## Consequences

- The local program gains `server/src/drawings/`: the reader, the cleaner, the conversion into satori's input, the worker and its limits. Their hostile-input tests cover:
  - scripts in every place HTML allows one;
  - handlers, and `javascript:` and `data:` addresses;
  - `@import`, `url()`, `<base>`, `<meta http-equiv>` and `srcset`;
  - SVG and MathML inside HTML;
  - entities, deep nesting, huge files and style bombs.
- The live protocol gains a request to make a drawing and its answer, and its version goes up.
- Import… accepts HTML, `visual-anything import` accepts `.html`, and Claude gains `import_drawing`.
- The bundle tests check that parse5 and satori are in neither the app's page nor the read-only page.
- The single executables carry satori and its WebAssembly, and gain the notice of the code they bundle; their smoke test makes a drawing.
- ADR 0042 gains a clarification: HTML is imported as a drawing, not mapped into the model.
- CONTEXT.md gains **Imported drawing**.
