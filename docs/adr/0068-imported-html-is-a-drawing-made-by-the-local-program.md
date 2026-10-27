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

## Clarifications

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions, building W56. -->

- 2026-10-26 (W56): **the versions.** satori is 0.47.1, not 0.63.2: the task asks for versions at least two weeks old, and 0.63.2 was published on 2026-10-20. 0.47.1 (2026-10-09) has the same dependencies at the same versions and the same license, so the licenses above hold. parse5 is 8.0.1, and its `entities` resolves to 8.1.0, BSD-2-Clause. satori's own files hold, compiled, harfbuzzjs 0.10.0 (MIT) and its layout engine, Taffy (MIT). The lockfile stays frozen-clean.
- 2026-10-26 (W56): **reading within caps** (`server/src/drawings/read.ts`, `caps.ts`). parse5's tree building scans the open elements for many tags, and its tokenizer compares each attribute of a tag with those before it: a 512 KiB file of nested `<div>`s took 214 s, and one tag of 65,000 attributes 38 s. So the reader caps both as it goes, through parse5's own hooks:
  - a tag keeps its first 256 attributes, which is all the cleaner reads; the rest are dropped as the tokenizer reads them, and reported. This goes through the tokenizer's method that keeps an attribute, which parse5 does not document: parse5 is pinned, and the hostile tests fail if it no longer holds;
  - more than 128 elements open at once, or more than 25,000 elements, texts and comments made, and the HTML is refused with `image-too-large`.

  Every hostile file of 512 KiB is then read or refused within 1.5 s of CPU time, measured with `cpuNow()`.
- 2026-10-26 (W56): **cleaning** (`clean.ts`, `styles.ts`).
  - Past the caps on style rules (256), selectors in a rule (16) and folding steps (100,000), the HTML is refused, as the SVG cleaner refuses; past 5,000 elements kept, or 64 levels deep with `html` at 1, what is left is dropped with its contents, and reported.
  - Text is capped at 4,000 characters, not more: text is drawn as the outlines of its glyphs, about 230 bytes a character, so even that is past what a cleaned picture holds (64 KiB), and 20,000 characters took 8 s to lay out.
  - `head`, which the parser always makes, is left out quietly, and what it holds is reported. `<style>` is read wherever HTML puts it, never inside a template or SVG. Comments, attributes of other namespaces, handlers, addresses and other attributes are each counted in the report, in the SVG cleaner's own words where it has them.
  - `html` and `body` are drawn as boxes, without a browser's 8-pixel margin on `body`. A table's parts become boxes: the table and its groups columns, each row a row, each cell `flex: 1 1 0` with 1 pixel of padding, header cells bold and centred. `sub` and `sup` are raised or lowered and smaller.
  - Properties are those listed above, with `box-sizing`, `aspect-ratio`, `inset`, the `place-` shorthands and the longhands of `text-decoration`. `display` keeps only `flex`, `block`, `grid` and `none`; `overflow` only `hidden`; `position` only `static`, `relative` and `absolute`. Values are made of `[-+.,%#()*/\w\s]`, with quotes only in `grid-template-areas`; every parenthesis opens a function named right before it, one of the colour, gradient, size and transform functions. `!important` is ignored.
- 2026-10-26 (W56): **what satori cannot draw as the SVG cleaner keeps it.**
  - **Gradients are dropped, and reported.** satori 0.47 paints a gradient background through an SVG pattern, which the cleaner drops (ADR 0027), so the drawing would lose it with a report in the cleaner's words; the allow-list drops it first, in words of its own.
  - **Only the outermost box that hides its overflow keeps hiding it.** satori clips with masks, and one inside another refers to the other's, which the cleaner refuses.
  - **satori's unused masks are left out.** satori writes a mask for every element, used or not, and the cleaner counts them all against its 16, so a card of twenty elements would be refused; those nothing refers to are removed from satori's own output before the core cleans it (`svg-output.ts`). They draw nothing.
  - **The page is cut at 4,000 pixels by its size,** not by a box that hides its overflow, which would make satori write masks within masks: satori's root `svg` gets that height and view box, and the report says it was cut.
  - **No font is named.** satori writes every text in the fonts it is given, and satori 0.47's list markers fail on a family named at the top.
  - **Characters Roboto lacks are left out before satori sees them,** since satori would draw them as empty boxes. They are read from the character maps of Roboto Regular and Bold, both (`glyphs.ts`); spacing and line breaks are kept.
  - Style values satori cannot read are counted, from its error callback and the warnings it writes, and reported as "style values the layout could not read". What the cleaner removes from satori's output, such as a dash pattern finer than the picture, is reported as "Cleaning the picture removed: …".
- 2026-10-26 (W56): **the worker** (`make.ts`, `worker.ts`, `network.ts`, `queue.ts`).
  - One worker a drawing, stopped after 10 s, with a V8 heap of 240 MiB old and 16 MiB young, 256 MiB in all. WebAssembly's memory is not counted by those limits; satori's is bounded by the caps on what reaches it.
  - The worker takes away every way to the network before parse5 and satori load: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, HTTP, HTTPS, HTTP/2, sockets, TLS and DNS. Each attempt is refused and counted, and a drawing made after any attempt is refused. The tests assert the count is 0 for every hostile file.
  - The program makes the drawings asked for one at a time, and refuses a fifth while four wait.
  - The worker runs one script: the executable holds it as the asset `drawings/worker.cjs` and runs it as text; the server's bundle finds it beside itself as `drawing-worker.cjs`; the sources build it once a process with esbuild (`drawings/bundle.ts`), so the tests and `pnpm dev` start the worker the executable starts. The server's bundle leaves esbuild out.
- 2026-10-26 (W56): **the live request** is `drawing/make` (`name`, `html`, `width`), answered with `drawing/made` (`svg`, `width`, `height`, `report`) or `command/rejected`, in the live protocol's version 7, since no build of 7 shipped (`core/src/import/drawing-messages.ts`). It changes nothing and never waits behind the project's work.
- 2026-10-26 (W56): **the action** is the core's `prepareDrawingImport` (`core/src/import/drawing.ts`), which the app, the command line, the program and Claude all send.
  - The image is named after the file without its `.html` or `.htm` ("Drawing" when nothing is left), with the file's name as its `source`; it goes where the image picker puts an element's own picture, and content the package holds already is shown by its id.
  - A new element is named as its image, of the component asked for, Box by default, whose built-in package the project starts using in the same action. Its own appearance gives its size: the picture at half its CSS pixels, from 48 to 480 units wide, its proportions kept, on its plate of 4 units, above the name band of 20 (ADR 0027). It gets no position: automatic layout places it, and that placement joins the action (ADR 0065). The app makes it in the open view.
  - An element asked for keeps its size, and shows the drawing as its drawing.
- 2026-10-26 (W56): **Import…** opens the drawing step for a file ending `.html` or `.htm`, or text read as "HTML, as a drawing", which the format list offers. The step shows the drawing drawn into a canvas from its cleaned view, its size, the width to lay it out at (64 to 2,000), who shows it (the selected element, when one element is selected, or a new element of a component) and what making it dropped, before anything changes.
- 2026-10-26 (W56): **the command line** takes `--width`, `--component`, `--element` and `--view` for HTML, and `--format html`, and refuses the diagrams' options with an HTML file, and these with any other. It makes the drawing itself first, to say what it drops and for `--dry-run`. Through a running program, ADR 0049's `import` message carries the file and these choices, never a command, and the program makes the drawing again of that file and runs the action as the person's, in one turn of its queue.
- 2026-10-26 (W56): **Claude's `import_drawing`** makes the drawing in the MCP entry point's own worker, as the program would, and sends the action as Claude's. It refuses an address in place of HTML, and an element given with a component or a view.
- 2026-10-26 (W56): **the notice** of the code the executables bundle is written by `pnpm package` from the bundles' metafiles: every npm package, its version, its license and where its source is, satori's under MPL-2.0 among them, then Node.js and Roboto. It is `THIRD-PARTY-NOTICES.txt` beside the executable, `visual-anything-THIRD-PARTY-NOTICES.txt` in each release, the asset `NOTICES.txt` inside it, and what `visual-anything notices` prints.
- 2026-10-26 (W56): **the bundle tests.** `app/src/import/page-bundle.test.ts` bundles the app's page, its workers and the read-only page's script with esbuild and finds no parse5, satori, harfbuzzjs or server code; the read-only page's own bundle test lists them, and the import dialog, among what its build must not hold. The server's bundle holds none of them either: only the worker's does.
- 2026-10-26 (W56): **Roboto** is a copy of the PDF export's files in `server/src/drawings/fonts/`, with its license, so that the worker holds its own; a test keeps the two copies the same.
- 2026-10-26 (W56): **the limits live in a module of their own** (`core/src/import/drawing-limits.ts`), which imports nothing: the live protocol reads its drawing messages with them, and loading the drawing's action from the protocol would have Node.js evaluate a module of the commands before what it imports.
- 2026-10-26 (W56): **the sample's card** (`examples/beyond-boxes/sources/card.html`) is imported at 360 pixels wide, shown in the Heart view by "The heart at rest", of the component Card. Its picture is credited as the heart's is, drawn for Visual Anything under CC0-1.0 (ADR 0047's clarification of W59), since a picture a sample ships records its license.
