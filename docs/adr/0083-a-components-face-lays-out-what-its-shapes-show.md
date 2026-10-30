---
status: accepted
---

<!-- Decided by Claude on 2026-10-29 under the user's standing delegation of design decisions, from the research on component templates (item 13 of the notes the user's modeling session kept). The research's open choices were settled as it recommended: the term Face, underline and highlight in the subset, emphasis opt-in for attributes, `middle` placement changing how shapes with a detail look, and canvas labels moving to Roboto with faces. -->

# A component's face lays out what its shapes show, written in a subset of HTML and CSS, and laid out and drawn by Visual Anything itself

The user asked that each component could design its own look as an HTML and CSS template (note 13):

- slots filled from the element's attributes, with conditions and simple lists;
- CSS of its own: type, sizes, colors, borders, grids, wrapping and vertical placement;
- optional code in package code's sandbox (ADR 0054), only to work out what is shown;
- edited in the app and through MCP, with a preview on a real element;
- inherited by derived components;
- different per level of detail (ADR 0055), and for collapsed and expanded containers.

Today a shape can only say what `appearance` offers: its kind, colors, size, `detail.attributes` and badges. The `draw` hook answers primitives, in the lower half of the shape, and nothing on shapes that hold others or draw rows.

CONTEXT.md lists "template" among the words to avoid for a component, so this ADR names the thing a **face**.

## The measurements that decided it

A prototype of 10,000 shapes, each a table drawn from one face:

- its name in bold;
- a status badge, shown on a condition;
- a description of 10 to 40 words with emphasis, clamped to 3 lines;
- 3 to 6 rows of a column name in monospace and a type in italics.

That is 24.6 drawing operations per shape, 17.6 of them text runs. It ran in Chrome 155 on the reference laptop (Iris Xe), with vsync off, through three routes:
- **(a)** the face compiled to the canvas's own drawing: boxes in each tile's graphic, and text as glyph quads from bitmap fonts in one graphic per tile;
- **(b)** each face rendered to a texture through SVG `foreignObject`;
- **(c)** an HTML layer over the canvas for the shapes on screen.

Frames are average / 95th percentile / worst, in ms, best of two runs:

| Phase | (a) | (b) | (c) |
| --- | --- | --- | --- |
| Pan at 30% zoom, about 220 faces on screen | 6.1 / 10.7 / 62 | 20.4 / 46.2 / 68, and 56% of frames with faces still blank | 18.2 / 47.2 / 100 (3.6 ms of it ours, the rest the browser's style, layout and paint of 4,900 nodes) |
| Pan at 50%, about 84 faces | 5.7 / 7.7 / 28 | 8.3 / 23.9 / 40, 17% blank | 8.2 / 17.5 / 26 |
| Zoom from 20% to 120% and back | 4.7 / 6.1 / 52 | 7.0 / 18.1 / 40, 7% blank | 7.5 / 18.3 / 85 |
| The whole view, far out | 3.7 / 6.1 / 30 | 5.1 / 6.7 / 24 | 4.0 / 4.9 / 21 |

Beyond frames:

- **Memory.** (b) took 175 KB of texture per face at one pixel per unit, and 694 KB at two, which a zoom past 100% needs. For 10,000 faces that is 1.7 GiB and 6.8 GiB. (a) took one atlas for all text, 32 MiB for eight font variants at resolution 2, whatever the number of shapes.
- **Time to draw.** (b) rasterized a face 41 to 68 ms after asking for it, eight at a time. (a) built a face's text in 0.18 to 0.29 ms. Laying a face out with the prototype's own engine took 0.05 to 0.09 ms.
- **Agreement.** In (b) and (c), the browser's layout and the scene's sizes disagreed: faces were clipped or overflowed their shapes. Layout, pointing and where relations attach need sizes before any pixel is drawn, so a browser cannot be the layout engine.
- **ADR 0068's engine.** satori took 13.9 ms and wrote 106 KB of SVG per face: 139 s and about 1 GB for 10,000 faces.

## Decision

### What a face is

- **A face lays out what a component's shapes show inside their body:** boxes, texts filled from the element's name and attributes, the element's detail and badges, an image of its package, and the places where its rows, its contents and its package code's drawing go.
- **It is data, read and laid out by the core and drawn by the program.** No browser parses it, lays it out or runs it. The shape's body (its kind or free geometry, fill and stroke, ADR 0066) is still drawn by the appearance, and the face is drawn inside it, so overlays, selection, focus and themes act on shapes as they do today.
- **`Appearance.face`** holds it, or `none`, which takes an inherited face away. It is inherited as every trait is, and each of its parts on its own: `markup`, `style`, `variants`, `collapsed` and `size`. A derived component can restyle a face and keep its markup, or the other way round. A component's face lives in its package, a project appearance can give one to a built-in component (ADR 0034), and an element's own is a particularity.

```json
"appearance": {
  "face": {
    "size": "content",
    "markup": [
      "<div class=\"head\">",
      "  <b>{{name}}</b>",
      "  <span class=\"badge status-{{status}}\" if=\"status\">{{status}}</span>",
      "</div>",
      "<p class=\"desc\" if=\"descripcion\">{{descripcion}}</p>",
      "<rows/>"
    ],
    "style": [
      ".head { display: flex; gap: 6px; padding: 8px; background: var(--fill); }",
      ".head b { flex: 1; font-size: 14px; line-clamp: 1; }",
      ".badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; background: var(--highlight); }",
      ".status-frozen { background: #9DC3E6; }",
      ".desc { padding: 0 8px 8px; font-size: 11px; color: var(--text-muted); line-clamp: 3; }"
    ],
    "variants": [{ "id": "far", "markup": ["<b class=\"far\">{{name}}</b>"] }]
  },
  "levels": [{ "from": 0.25, "shows": ["face"], "face": "far" }, { "from": 0.6, "shows": ["face"] }]
}
```

- **Markup and style are lists of lines,** as package code is (ADR 0060), so that git shows the lines a change touched. Each line holds at most 2,000 characters.

### The markup

- **XHTML: well formed, every element closed** (`<br/>`), attributes quoted. It is read by a strict reader of the core's own, the kind the SVG cleaner already uses. Entities are `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;` and numeric ones only.
- **Elements:**
  - boxes: `div`, `span`, `p`, `header`, `footer`, `section`, `ul`, `ol` and `li`;
  - text: `b`, `strong`, `i`, `em`, `u`, `s`, `code`, `small`, `mark`, `sub`, `sup`, `br` and `hr`;
  - the face's own, each at most once except `image`:
    - `<rows/>`: the rows (ADR 0023);
    - `<contents/>`: an expanded container's body;
    - `<detail/>`: the detail, as `appearance.detail` makes it;
    - `<badges/>`: the badges and an overlay's badge;
    - `<drawing/>`: the `draw` hook's drawing;
    - `<icon/>`: the appearance's image;
    - `<image ref="…"/>`: an image of the component's package, by id;
  - `<each of="…">`, which repeats its content for each item of a list attribute (a `json` array of strings or numbers), at most 32 times, with `{{item}}` inside.
- **Attributes:** `class`, `style`, `if` and `else`. Every other attribute is refused (`invalid-face`), handlers and addresses among them. So are every element not listed, `script`, `style`, `img`, `a`, `svg`, `iframe` and `template` among them.
- **Slots, `{{…}}`, in text and in `class`:**
  - `{{name}}`, `{{component}}`, and `{{count}}` (what a collapsed container holds);
  - an attribute by its name, `{{descripcion}}`, or `{{attr "Fecha de alta"}}` for any name;
  - `{{x ?? "—"}}` gives text to show when there is no value.
  - **What a slot writes.** A slot inserts text, never markup. It takes emphasis when the attribute's definition says `format: emphasis` (ADR 0082); `{{x | plain}}` forces plain text. Numbers are written with their `unit`, and a destination with its label.
  - **In `class`**, a slot's value is reduced to `[a-z0-9-]`, so `class="status-{{status}}"` picks a rule by value with no code.
- **Conditions,** in `if`: an attribute that has a value (not empty, not false); `not x`; one comparison, `x = 'live'`, `x != 'live'`, `x in 'live' 'frozen'`, or `<`, `<=`, `>` and `>=` for numbers, compared as filters compare (ADR 0055). `else` on the next sibling shows when the `if` before it does not.

### The style

- **Selectors:** an element, a class, or a comma list of these, as ADR 0068 folds them, and inline `style`. Rules apply in the cascade's order: element, class, then inline. There are no `@` rules, no `url()` and no `!important`.
- **Layout:**
  - `display` (`block`, `flex`, `grid` or `none`);
  - `flex-direction`, `flex-wrap`, `flex`, `flex-grow`, `flex-shrink` and `flex-basis`;
  - `gap`, `align-items`, `align-self` and `justify-content`;
  - `grid-template-columns`, in `px`, `fr` and `auto`;
  - `width`, `height` and their `min-` and `max-`, in `px` or `%`;
  - `padding` and `margin`, in `px`;
  - `position: absolute` with its offsets, inside the root only, for a badge in a corner.

  Boxes size as `border-box`. `justify-content` on the root places the face inside a shape taller than it, which is a face's vertical placement.
- **Box:** `background-color`, `border` and its sides (width in `px`, `solid` or `dashed`, a color), `border-radius`, and `overflow: hidden`.
- **Text:**
  - `color`, `font-size` (8 to 32 px), `font-weight` (600 and above draw bold), `font-style`;
  - `font-family`, `sans` or `mono` only;
  - `line-height`, `text-align`, `text-decoration` (`underline`, `line-through`), `text-transform`;
  - `white-space` (`normal`, `nowrap`), and `line-clamp`, which cuts a text to that many lines with "…".
- **Colors** are `#RRGGBB` or the theme's tokens, so that a face follows the light and dark themes (ADR 0033):
  - `var(--fill)`, `var(--stroke)`;
  - `var(--text)`, `var(--text-muted)`;
  - `var(--highlight)`, `var(--code-back)`;
  - `var(--row-separator)`, `var(--canvas)`.

  The core checks every text's color against the background it is drawn on, in both themes, and warns under 4.5:1, or 3:1 for large text, as stored colors are checked.
- **Anything else is dropped and reported** with its line and column, as ADR 0068 reports what it drops. Values must belong to the narrow class of characters ADR 0068 allows.

### Size, variants and levels

- **`size`:**
  - `content`: the face's height is the shape's height, as rows give a table its height (ADR 0023). The scene works it out before layout, and layout reads it like any size;
  - `shape` (the default): the face is laid out in the shape's size, from the view or the appearance, and cut where it overflows, its last text line ending in "…". The hover card of ADR 0082 shows the whole.

  The width is always the shape's, or its free geometry's `label` rectangle.
- **`variants`,** at most 8, are other markups, each with an `id`, sharing the face's style.
  - `collapsed` names the variant a collapsed container shows on its sheet.
  - A level of detail (ADR 0055) gains `face` among what it `shows`, and can name a variant.
  - Without levels, the face shows from the scale the canvas writes names at, and below it the shape is a block, as today.
  - Levels and variants change by tile, with ADR 0055's hysteresis, so the budget holds.

### How the core reads, lays out and checks it

`core/src/faces/` holds four pieces:
- the strict reader;
- the style subset;
- `compileFace`, cached by the face's hash;
- `layOutFace(compiled, element, width, height?)`, which answers a **face drawing**:
  - boxes;
  - text runs, each with its font, size, color or token, position and bands;
  - images by id;
  - the regions of `<rows/>`, `<contents/>` and `<drawing/>`;
  - its height, and whether anything was cut.

The layout is block, flex and a simple grid: a small engine, not a browser's.
- **Text is measured in Roboto's widths,** which the core holds, regular, bold, italic, bold italic and mono, so that the app, the command line, Claude's tools and the page get the same drawing to the unit.
- **The canvas draws face text in Roboto too,** as bitmap fonts made from the font files the app already ships, loaded with `FontFace` from bytes, which needs no fetch. The read-only page does the same.
- **Caps** (`face-too-large`):
  - 200 lines and 16 KiB of markup, and 128 rules and 16 KiB of style;
  - 8 variants, 16 levels deep;
  - 256 boxes and 256 text runs per face once laid out;
  - 2,000 characters per slot;
  - 512 KiB of faces per package.

  As for images, opening only warns, and a face past its caps is drawn as the shape's name.
- **Problems** have stable codes (`invalid-face`, `face-too-large`, `unknown-face-attribute`, `face-contrast`) and are messages of the core, in English and Spanish, with their line and column.

### Drawing it everywhere

- **The canvas** draws a face drawing in the shape's tile: boxes in the tile's graphic, runs as glyph quads in the tile's text graphic (route (a) above), images as the pictures they already are, and bands for emphasis.
  - A tile lays out only the faces it draws, so a view of 10,000 shapes lays out only what is near the screen, at about 0.07 ms a face.
  - Faces of size `content` are laid out for the whole view before layout, in the layout worker, and again only for elements that changed.
- **Pointing** goes by the shape, as now. Rows stay targets of their own, and the contents of `<contents/>` are shapes.
- **SVG and PDF** write the same face drawing:
  - `<rect>`s, `<text>` with a `<tspan>` per run placed by its own `x`, and pictures as symbols;
  - Roboto, Roboto Mono and their styles, embedded in the PDF;
  - nothing re-flows, so the export's bounds test (ADR 0014's clarification) holds for faces too.
- **The read-only page** draws them with the app's code. **Mermaid, Structurizr and the outline** say among what they lost: "faces are drawn only in the canvas, the SVG, the PDF and the page".

### How faces meet the rest

- **Rows (ADR 0023).** In a component that draws rows, `<rows/>` is the root's last child: the face is the header, and the rows are drawn under it as bands, as now, with their ports at each row's middle. A row draws its own component's face, if it has one, in its band on one line: for example a Column's `<code>{{name}}</code> <i>{{type}}</i> <badges/>`.
- **Containers.** In an expanded container, `<contents/>` is the root's last child, and what is above it is the header, whose height ELK reads. A collapsed container draws its `collapsed` variant, or the face without `<contents/>`.
- **Free geometry (ADR 0066)** lays the face out in its `label` rectangle. The name tag is not used while a face writes `{{name}}`.
- **Parts (ADR 0067).** Anchored parts draw no face, only their name as now. A drawing with parts can have a face for its header.
- **The `draw` hook (ADR 0054)** draws into `<drawing/>` where a face places it, and in the lower half of the shape where none does.
- **Overlays (ADR 0055)** color the shape's body as now. Their badge joins `<badges/>`, and opacity fades the face's colors as it fades the shape's.

### Optional code works out values, not the drawing

- **No new hook.** A slot reads computed values, from package code's `attributes` hook, as the detail already does (ADR 0054's clarifications): `{{tamano_legible}}` can be a formatted number, and `class="status-{{estado_calculado}}"` a color chosen by the code. The hook runs in QuickJS in its worker, approved by its hash, within its 50 ms and 32 MiB, and answers strings and numbers that the core checks again.
- **The drawing stays data.** Code never answers markup or style.
- **Without approval, and in the read-only page,** which runs no package code (ADR 0041), computed values are missing. Their slots write their `??` text and their `if` is false.

### Editing, in the app and through MCP

- **The component editor gains a Face section,** at the level the project can change, as levels have:
  - the markup and the style, with line numbers and the problems listed at their lines;
  - the variants and the size;
  - **Preview with**, which picks an element of the component, the selected one first, and draws it as the canvas does, at a level, collapsed or not, in either theme;
  - **Start from**, which copies the inherited face, or a built-in face that writes what the canvas writes today.

  **Apply** sends one `set-component-appearance` changing only the face's parts that changed (ADR 0022), one undoable action. Keystrokes send nothing.
- **Claude:**
  - `set_face` sets a component's face, part by part, `null` to inherit;
  - `get_item` shows the face and where each part is inherited from;
  - `preview_face(component, element?, level?, collapsed?, theme?)` answers the problems, the face drawing as text (boxes, lines as laid out, what was cut), and, when an app is open, a picture through `capture_view`'s path (ADR 0081). The picture's name starts with a read verb, and changes nothing.

  Claude's instructions say to use the theme's tokens, and to check a face with `preview_face` on a real element.

### Safety

- Nothing in a face runs, and nothing in it is fetched: no address is read anywhere, and images are named by id.
- No face is ever turned into HTML or put in the page. The Trusted Types policy and the content security policies of the app and the page stay as they are. The page needs no new source, since fonts load from bytes.
- What a slot writes is text, and a class made from a value is reduced to a narrow alphabet.
- The caps bound reading and layout, as ADR 0027's bound the cleaner.

### Accessibility

- A face's texts, in reading order, are the shape's description in the outline and in announcements (ADR 0014's parallel representation).
- Contrast is checked in both themes.
- The hover card shows what the face cut.

## Considered options

- **(b) Rendering each face to a texture, through SVG `foreignObject` or PixiJS's `HTMLText`:** rejected, by the measurements above:
  - it took up to 694 KB of texture per face, and 41 to 68 ms to draw one;
  - at 220 faces on screen, more than half the frames had blank faces;
  - the browser's layout disagreed with the scene's sizes;
  - `HTMLText` writes through `innerHTML`, which the Trusted Types policy refuses;
  - SVG `foreignObject` is what the image cleaner removes, and the PDF cannot draw it.
- **(c) An HTML layer over the canvas:** rejected, by the measurements above:
  - at 220 faces the browser's own work took a frame of 18 ms on average and 47 ms at the 95th percentile;
  - HTML over WebGL cannot be drawn between shapes and relations, so relations would pass under faces, against the stacking order (ADR 0021);
  - exports would need a second drawing;
  - the layout disagreed with the scene's.

  The HTML layer stays for editing text and for the hover card (ADR 0014).
- **ADR 0068's satori for every element:** rejected, at 13.9 ms and 106 KB of glyph outlines per face. Its allow-list of elements and properties, and its way of reporting what it drops, are reused.
- **A full CSS engine, Yoga or Taffy in WebAssembly:** rejected for now. The subset needs block, flex and a fixed grid, and a WebAssembly engine would weigh on the app and the page. It is the way forward if faces need more than the subset.
- **Templates as code, through React or Vue components, as yFiles' newer styles take, or Handlebars helpers:** rejected. They are code to run, and the drawing must stay data (ADR 0012, ADR 0054).
- **SVG templates with bindings, as yFiles' `StringTemplateNodeStyle` does:** rejected. SVG text does not wrap, and people asked for HTML and CSS.
- **A box tree in JSON in place of markup:** rejected. Markup and CSS are what people and Claude already write, and lines of them diff well.
- **Faces in files of their own (`.vaface`, `.css`):** rejected, as code in a `.js` file was (ADR 0060): the project's files are JSON its loader checks.
- **A new hook that answers markup:** rejected. Computed values already work out what is shown, and answering markup would make the drawing code.

## Consequences

- The schema gains `Appearance.face` (`Face`, `FaceVariant`, `FaceLine`) and `face` in `LevelOfDetail.shows` and `LevelOfDetail.face`, and the schemas are regenerated.
- The core gains `core/src/faces/` (reader, style, compile, layout, contrast) and Roboto's width tables. The export's `fonts/widths.ts` moves there. Property tests check that:
  - a face never draws outside its width;
  - laying out is deterministic in Node and in the browser;
  - every refused input is refused with its code;
  - caps hold on hostile faces.
- The app gains face drawing by tile, faces' sizes before layout, the Face section with its preview, and Roboto bitmap fonts.
  - **Labels change font.** The canvas's names and details move to Roboto as well, so that everything on the canvas and in exports breaks lines alike. This supersedes ADR 0082's measuring in the system fonts, and changes how every label looks a little.
- The exports write face drawings, and the text exports say what they lost.
- Claude gains `set_face` and `preview_face`, and its recipes give built-in faces as examples.
- Built-in packages can ship faces. Data modeling's Table gains one that shows the description under the name, and Column one with its type and badges.
- The benchmark gains a phase of 10,000 shapes with faces.
- CONTEXT.md gains **Face** and **Face drawing**, with "template", "card" and "skin" to avoid.
- **What it supersedes in ADR 0082:**
  - its run drawing becomes the drawing of face text, kept as it is;
  - measuring labels in the system fonts gives way to Roboto everywhere;
  - `textPlacement` and `detail.lines` become what Essence's built-in face reads. They stay as traits, and no file changes.

  The subset, its storage, its escaping and what the text exports keep stand.
- **Building it is a milestone of its own,** after text emphasis, staged as the research report plans.

<!-- Decided by Claude on 2026-10-29 under the user's standing delegation of design decisions, after the user confirmed what they need: "mientras que yo pueda injectar HTML y css para que las figuras sean propias y pueda poner los N atributos que quiera". -->

- 2026-10-29: **a face can list the element's attributes without naming each one.**
  - `<each of="attributes">` repeats its content for every attribute the element has, with `{{key}}`, the attribute's name, and `{{value}}`, its value, written as a slot writes it.
  - **Order:** the attributes come in the component's order of definition, then the element's own particularities in the order they were added.
  - **Filters:** `only="a b c"` keeps those attributes, in that order; `except="a b"` leaves them out; `if` and `else` work inside, as anywhere.
  - **Limits:** it repeats at most 64 times, and says how many more there are through `{{more}}` after the loop.
  - `each` is the one element that takes attributes beyond `class`, `style`, `if` and `else`: its `of`, `only` and `except`.

  Naming attributes one by one with `{{…}}` stays as it is, with no limit on how many a face names but the face's caps.

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, while building F0's core half and F1 of M3e. -->

- 2026-10-30 (M3e, F0's core half and F1): **how the core reads, lays out and checks faces.**
  - **Roboto's widths in the core** (`core/src/text/roboto-widths.ts`, `robotoWidth`).
    - Regular and Bold are the exports' tables, moved unchanged. Italic and Bold Italic are read with fontkit from the fonts the PDF embeds (Roboto 2.137), about 2% narrower than upright. Roboto Mono is 0.6 em for every character.
    - The exports' `measure.ts` reads the core's tables, so SVG and PDF write the same bytes as before. The canvas still measures emphasis with italic as upright (`canvas/textBlock.ts`); it moves to the core's tables with F2, when labels move to Roboto.
  - **The schema holds the format, the core holds the caps.** `FaceLine` is at most 2,000 characters with no line break, and a variant's id is `[a-z][a-z0-9-]{0,31}`. The caps on lines, bytes, variants and depth are the core's, so that a command refuses past them and opening only warns, as the ADR says.
    - The caps on markup count the variants' markup with the face's: 200 lines and 16 KiB in all.
    - Filling a face is bounded as well: at most 4,096 parts of its markup, repetitions counted, and 1,024 pieces of text before layout. Past them, as past 256 boxes or runs, the face is drawn as the shape's name.
  - **Levels wait for F2.** `LevelOfDetail.face` and `face` in `shows` are added with F2, which draws variants by level: the app's levels editor lists every part a level shows, and nothing draws a face before F2.
  - **The style subset, as the ADR's own example writes it.**
    - Selectors take an element, classes, both (`b.far`), and those joined by spaces for descendants (`.head b`), at most 4 parts and 16 selectors a rule. Rules apply by specificity (classes, then elements), then by place, and inline style last.
    - The face's own box is styled by the selector `face`: `face { justify-content: center; }` places a face in a taller shape.
    - Accepted as well: `background` with one color, `sans-serif` and `monospace`, `-webkit-line-clamp`, `font-weight: bold`, `row-gap` and `column-gap`, and `flex-start`, `flex-end` and the like. Colors are `#RRGGBB` or tokens only: no `#RGB`, no names.
  - **The engine** (`faces/layout.ts`):
    - a block lays its children out as a column, `flex-direction` is `row` by default, margins never collapse, and no element has margins of its own but `hr`;
    - nothing is wider than its container: a width past it is cut to it, a flex item shrinks down to its `min-width` (0 unless set), and a word longer than its line breaks between characters;
    - inline elements in a flex or grid container become boxes, as CSS does;
    - `position: absolute` places a box against the face's own box from anywhere in the markup, and it is drawn after the flow;
    - `<icon/>` is 20 px square and `<image/>` 24 px unless styled, and `<drawing/>` grows into the room left in a face of size `shape`;
    - text is 11 px at 1.3 lines in the theme's text color; `small` is 0.85 of its parent's size, `sub` and `sup` 0.75 and shifted; `code` and `mark` draw their backs as bands; list items take "•" or their number;
    - when lines are left out under the face's height or a box's `overflow: hidden`, the lowest line kept ends in "…".
  - **Markup.**
    - `else` takes a condition, to chain them, or an empty value, and follows an element with `if` or `else`, spaces between.
    - `<each>` makes no box of its own: it takes `of`, `only`, `except`, `if` and `else`, and `class` or `style` on it is refused, to be put on what it repeats. `{{more}}` is read by the elements after it in the same parent, and has no value when nothing is left out.
    - `<rows/>` and `<contents/>` take no condition, and a markup holds one or the other.
    - `<detail/>` writes the detail without its badges, and `<badges/>` the badges that hold and an overlay's, a space between each.
  - **Slots.**
    - A value is missing when it is absent, empty, false or an empty list.
    - A boolean writes its attribute's name while it is true, as the detail does. A list of texts and numbers is written with commas; a destination by its label (the view's name, the project's folder, or the address's host); other JSON compactly.
    - The words of slots (`name`, `component`, `count`, `item`, `key`, `value`, `more`, `not`, `in`, `plain`, `attr`) name attributes only through `attr "…"`.
    - A class made from a value is reduced by taking accents off, writing it in lowercase and turning every other run of characters into "-", at most 64 characters.
  - **Theme tokens.** `--text` and `--text-muted` are the colors that read on the shape's fill, as names and details are written today; `--highlight` and `--code-back` follow that text. A box of a fixed color must set the color of its text: the contrast check warns otherwise. The ADR's own example does, in the dark theme, for its `#9DC3E6` badge, so F4's built-in faces set a color wherever they set a fixed background.
  - **Problems.**
    - Each has its part (the markup, the style or a variant), line, column and severity. A command refuses with the first error. Style the subset drops is a warning, and so are unknown attributes and contrast.
    - Opening checks a face where one of its parts is set, on the component or the element that sets it, at most 10 warnings a face and a count of the rest.
    - The contrast check reads the compiled face: every branch of a condition, and a class made from a value without a rule and with each rule it could pick. Since those choices multiply through nested elements, it takes at most 4,096 steps, every element visited with each of its choices and every text counted, and past them it warns that it checked the face only in part. Whether a rule's class is one a slot could write is matched in linear time: the texts between slots in order, and what the slots write made of `[a-z0-9-]`, with no regular expression built from a face.
    - The messages are the core's, in English. Their Spanish templates come with F4, which first shows them in the app.
  - **The face drawing:**
    - boxes;
    - runs, each with its line and paragraph;
    - bands, of kind `back`, `underline` or `strike`, with their color;
    - images by id, and the regions of `<rows/>`, `<contents/>` and `<drawing/>`;
    - its height, whether anything was cut, and `fallback` when it is the shape's name instead: bold, 14 px, centred, on at most 2 lines.

    `faceDrawingText` reads it in order, a paragraph a line. Compiled faces are kept by their text, 512 at most, each with the SHA-256 of its parts.
- 2026-10-30 (M3e, after merging F0's core half and F1): **what F1 asked.** Decided by Claude under the user's standing delegation.
  - **`LevelOfDetail.face` and `shows: "face"`** come with F2, which first draws a face. Adding them before would break the levels editor for no use.
  - **`--text` keeps following the shape's fill.** A box with a background of its own sets its own text color, and the contrast check warns when it does not. This holds for the built-in faces of F4 too. Following the nearest background instead would hide a dark badge's unreadable text in one theme.

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, while building F2 and F0's canvas half of M3e. -->

- 2026-10-30 (M3e, F2 and F0's canvas half): **how the canvas loads Roboto and draws faces.**
  - **Roboto on the canvas.**
    - Roboto Regular, Bold, Italic, Bold Italic and Roboto Mono load with `FontFace` from the bytes the PDF already embeds (`export/fonts/`), while PixiJS starts, under families of their own (`Visual Anything Roboto`, `Visual Anything Roboto Mono`), so that a Roboto installed on the computer, of other widths, never stands in. The label fonts are drawn once they are loaded; loading never fails the canvas, and the system's fonts stand in.
    - The canvas measures every text in the core's tables, exactly (`canvasMeasure`), and places each glyph of text emphasis and of faces by them, so that what is measured is what is drawn, before the fonts load too. The exports keep their margin of 6% for the system fonts a reader may draw an SVG in (`robotoMeasure`), and now take the real italic widths. No snapshot changed.
  - **Where a face is drawn:** in its shape's label area (the rectangle a person's head, a cylinder's caps or an ellipse leave), in its free geometry's `label` rectangle, over a row's band, on a collapsed container's sheet, or in the header of a shape that draws rows or holds contents. Its boxes, bands and runs are one drawing a shape among its tile's labels, drawn in its tokens' colors on the shape's fill and drawn again for another theme or fill. Images, `<icon/>`, `<drawing/>` and dashed borders are not drawn yet (borders draw solid); the exports (F3) and the next stages take them up.
  - **Laid out once.** The scene keeps a face, compiled, with what fills it, per element and detail; an equal one read again keeps the one before. Its drawings are kept per size, variant and collapsed state, eight a face. Nothing is laid out while the canvas pans or zooms.
  - **Sizes before layout, in the scene.** Faces of size `content` are laid out where the scene measures shapes, not in the layout worker: the scene feeds the worker its sizes, and keeping a face's drawing per element makes a scene built again lay out only the faces that changed. The benchmark (F5) measures the first build.
    - A face of size `content` gives a shape of its own its height, which the stored and the appearance's heights give way to, as rows give a table its height; for an ellipse, a cylinder or a person, tall enough that its label area holds the face. A shape with free geometry keeps its size.
    - **Headers.** What a face lays out before its `<rows/>` or `<contents/>`, or the whole face without either, is the header of a shape that draws rows or holds contents, never lower than the canvas's own (32 for rows, 48 for containers), so that the toggle, the name the far view writes and the relations that attach beside it keep their room. Rows stack under it, relations attach at its middle, drops count from it, and layout lays contents out under it, with the room the canvas keeps under its own header.
  - **Levels.** A level that shows `face` draws the face, in the variant it names; one that shows a name or a detail but not the face writes those. Without levels, a face shows wherever names are written. A row draws its own component's face at its container's contents level, whatever variant that level names. A face whose variant the face lacks draws its own markup.
  - **Values.** A face is filled from what the canvas reads: live and computed values over stored ones, as the detail is, and an overlay's badge after its own badges. They change what the face writes, never the size the scene gave its shape.
  - **Speaking.** A shape with a face is announced by what its face says, in reading order, its paragraphs joined by commas, less its name and its component's name, which are said already. Its hover card shows when the canvas cut the face, with the whole face, a paragraph a line.
  - **Words.** A face is «cara» in Spanish.
  - **The read-only page** draws faces with the canvas's own code, Roboto included, so its script holds the fonts' bytes.
  - **Left for later:** the outline's text of a face comes with F3, which writes faces in the exports.
- 2026-10-30 (M3e, after merging F2): **what F2 asked.** Decided by Claude under the user's standing delegation.
  - **The read-only page embeds the fonts' bytes,** about 490 KB of base64. A page that draws as the canvas does needs them, and a single self-contained file is what the read-only page is for.
  - **No `font-src` is needed.** Fonts made from bytes with `FontFace` fetch nothing. Checked in headless Chrome against the app's policy: the canvas drew in Roboto, and no policy violation or error was logged.

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, while building F3 of M3e. -->

- 2026-10-30 (M3e, F3): **how the exports draw faces.**
  - **The SVG draws what the canvas draws, from the canvas's own code.** It takes the face drawing the canvas lays out (`shapeFaceDrawing`, where `faceRect` places it) and writes it in place of the shape's name and detail, wherever the canvas does: a shape of its own, a table's header, a row's band, a collapsed container's sheet, a container's header and free geometry's `label` rectangle. A face that draws neither runs nor boxes is not drawn, and the shape writes its name and detail, on the canvas and in the exports alike (`facePaints`). The PDF is made from that SVG, so it draws the same faces, and the read-only page draws them with the canvas's code.
  - **Boxes are pieces both draw.** `faceBoxPieces` turns a box into what is painted: its background with its radius; a ring, half its width inside, for a rounded box whose four sides are alike and solid; a band for each other solid side; and dashes for a dashed side. The canvas fills and strokes those pieces, and the SVG writes each as a `<rect>`, so that the two never draw a box differently.
  - **Dashed borders are drawn,** on the canvas and in the exports: dashes three times the border's width long and at least two widths apart, the gaps spread so that the first and the last meet the side's ends, one in the middle when only one fits, at most 64 a side (longer then). A rounded box's dashed sides are dashed along their straight stretches, its corners left open.
  - **Runs** are a `<text>` a line, with a `<tspan>` a run at its own `x` and baseline, in its weight (700 for bold), style and family, so that nothing re-flows. A face's group names Roboto first (`Roboto, system-ui, …`), since it was laid out in Roboto's widths; the PDF embeds Roboto, Italic, Bold Italic and Roboto Mono as text emphasis does. Spaces at a run's start are moved past by their Roboto width, as text emphasis does, since readers of SVG fold them.
  - **Which variant.** An export draws every detail, so it draws a shape's face as the canvas does at the most detailed level the shape declares: the variant that level names, or none when that level shows no face, where the export writes the name and detail as before. Without levels, the face's own markup; a row its own face; a collapsed container its `collapsed` variant, as on the canvas.
  - **A table's header band** is as tall as its face makes it (`ElementShape.header`), in the SVG as on the canvas.
  - **Pictures in a face are drawn in the exports,** as symbols, fitted in their boxes with their proportions kept: `<icon/>` is the shape's own image, which is then not drawn again where the shape shows its icon (an icon, or a header's icon; a drawing's picture stays); `<image ref="…"/>` is an image of the package the element's component comes from, named by its id or by its id within the package (`ref="photo"` for `pictures.photo`). An image the package does not hold draws nothing.
  - **`<drawing/>`.** On the canvas, package code's drawing goes where a face places `<drawing/>` (laid out in the face's own markup), inset by 6 units as any drawing is, and nowhere when that leaves less than 12 units either way; a face that places none leaves it under the name, as before. The exports draw no package code's drawing, with a face or without.
  - **The text exports.** Mermaid and Structurizr say how many of the shapes they write lose their faces, which only the canvas, the SVG, the PDF and the read-only page draw. The outline in Markdown writes what a face says after the shape's name and component, as announcements say it: its plain text in reading order, its paragraphs joined by commas, less the name and the component's name, escaped as everything people wrote; and says that it writes what faces say, not how they look.
  - **The export's bounds test** covers faces: a container's, a table's over its rows', a face of size `content`, and a collapsed container's; and every rectangle, picture and run of a face lies within where the canvas lays it out, its runs measured in Roboto.
  - **Left for later.**
    - **Pictures in a face on the canvas.** The canvas draws pictures in an image layer under its labels, so a face's boxes would cover them; drawing them over the face needs the image store's textures in the face's own drawing. Until then, the canvas draws a shape's icon where it always does, and the exports draw a face's pictures.
    - **A name tag with a face.** A shape whose name goes under it in a name tag (free geometry or a picture whose name does not fit) still draws the tag's box, now empty, since the face takes the place of its text; the exports draw it so too. The ADR says the tag is not used while a face writes `{{name}}`; leaving it out changes the shape's bounds, its hits and its layout, which is the canvas's change to make.
- 2026-10-30 (M3e, after merging F3): **what F3 asked.** Decided by Claude under the user's standing delegation.
  - **No name tag under a shape whose face writes its name.** The ADR already says so: the tag would draw an empty box. The canvas and the exports drop it, and the shape's bounds, hit-testing and layout no longer count it. This is built with F5.
  - **Pictures inside a face on the canvas** (`<image ref>`, `<icon/>`) are drawn within the face's own label, over its background boxes, so that the canvas matches the exports. This is built with F5.
<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, while building F4 of M3e. -->

- 2026-10-30 (M3e, F4): **how faces are edited, in the app and by Claude, and Data modeling's faces.**
  - **The Face section** sits in the component editor after the levels, and changes at the level the project can change, as levels do: a built-in component's face goes into the project file.
    - Its draft starts from the face the shapes show, inherited parts included, so that starting from the inherited face needs no button of its own. **Start from** offers, while the markup is empty, a face that writes the name, the detail and the badges, as the canvas writes them without one.
    - The markup is one text area, with a choice of the face itself or one of its variants; the style another; then the size and the variant a collapsed container shows. A new variant starts as a copy of the face's markup. Each text area has its line numbers beside it.
    - The problems are listed under them, errors first, each in the core's words at its line and column (`faceMessage`), and a press on one moves the caret there. Apply is off while there are errors, since the core would refuse them.
    - **Apply** sends one command with only the parts that changed; an emptied markup is taken out, so that it is inherited again. **Show no face** stores `none`, and **Use the inherited value** takes out every part this level sets. Typing sends nothing.
    - **An element's own face** is a trait of its appearance in the inspector, under "Only this element", with the same editor and `update-element`; **Use the component's face** takes it out.
  - **The preview** paints the core's face drawing on a 2D canvas (`facePainter.ts`): the shape's body, the boxes, bands and runs where the core placed them, in Roboto under the canvas's own families, and the regions of rows and contents dashed. It is neither PixiJS nor the DOM, so it needs no renderer of its own and lays out nothing; it paints what the canvas paints. It is filled from an element of the component, the selected one first, or a stand-in when nothing is made from it, at the size its shape has in the open view (a row's band, a header, a label area) or else by its appearance, in either theme, a variant, and collapsed or not. Stored values fill it: computed and live values show on the canvas. Its text alternative is what the face says, in reading order.
  - **`set_face`** takes the face's parts, each a list of lines or one text that its line breaks part, `null` to inherit a part, `"none"`, or `null` for every part; or `variant`, `{ id, markup }`, which sets or, with `markup: null`, takes away one variant over the variants the component or element shows now. Its answer says where the face is kept, where each part comes from, and the warnings (unknown attributes, contrast); a refusal keeps the core's line and column and points at `preview_face`.
  - **`preview_face`** lays out the face a component or an element has, or a face to try over it, on an element (the one named, or the first made from the component, or a stand-in); a column in a table is laid out on its row, 24 units tall and as wide as the table. It answers the lines as laid out, the text in reading order, the width and height, what was cut, the regions and every problem, and does not lay out a face with errors.
    - **It answers no picture.** `capture_view` with the element as its region shows the face the project has, drawn by the open app. Drawing a face only tried would need the app to draw a face it does not hold, a new message of the protocol; it waits until a session needs it.
    - `get_item` shows a stored face as it shows any appearance; `preview_face` and `set_face` say where each part comes from.
  - **Data modeling's faces.**
    - **Table** writes its name in bold on the left, as the canvas does, and its schema on the right, left of the toggle, in a header of 32 units, the canvas's own, then `<rows/>`. A face reads the element's own attributes only, not its container's name, so **Table gains a `schema` attribute** (text, no default): an addition, which the SQL recipe sets on each table when the material has schemas.
    - **Column** writes on its row its name, its type in monospace, the detail's badges (PK, and FK while it references a column) as one key badge, since FK comes from a relation and a face's conditions read attributes only, then NOT NULL and UNIQUE from its attributes. Keys are drawn on the theme's highlight and the other flags on its code back, so both pass the contrast check in both themes.
    - **Nothing changed size, and no snapshot changed.** The header is the canvas's 32 units and a row's face fits its band, so layouts and the tests of the package and its samples hold as they were (518 test files related to the package passed).
  - **Spanish.** Every face message and problem, F1's included, has a template in `es.ts`. «Ranura» is a slot. Where a problem is reads by three templates («En…», «Línea {n} de…», «Línea {n}, columna {m} de…»), whose part and reason are translated in turn, so that the editor's list and the core's refusals share them.
- 2026-10-30 (M3e, after merging F4): **what F4 asked.** Decided by Claude under the user's standing delegation.
  - **Table's `schema` attribute stays.** It is optional, and the face writes the schema only when it is set; the SQL recipe sets it. A slot that reads the container's name would remove the need to repeat it, and is left for later under this ADR.
  - **Controls that change nothing may stay live in a read-only project.** The face preview's choices are marked `data-changes-nothing`, and the inspector's read-only guard skips them.
