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
