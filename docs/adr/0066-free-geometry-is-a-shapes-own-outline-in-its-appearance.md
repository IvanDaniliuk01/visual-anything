---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# Free geometry is a shape's own outline, kept in its appearance and read by everything that points at the shape

An appearance draws one of five kinds: rectangle, rounded rectangle, ellipse, cylinder or person. Organs, bones, a robot's silhouette and any notation that is not made of boxes need outlines of their own (first benchmark, R8). ADR 0022 gave connection points a format that leaves room for this. M8b adds it, and named parts (ADR 0067) are drawn by it.

## Decision

### The format

- **An appearance gains `geometry`**: its shapes' own outline, drawn in place of their kind, or `none`, which takes an inherited one away so that the kind is drawn again. It inherits as every trait does, whole, up to Essence, which sets none. An element's own is a particularity, and a project appearance can give one to a built-in component (ADR 0034).
- **A geometry has:**
  - `width` and `height`: the box its coordinates are written in, like an SVG view box with its origin at the top left, each above 0 and at most 100,000;
  - `outline`: 1 to 64 closed contours, each one of:
    - `{ "kind": "path", "d": "…" }`: SVG path data, with `M`, `L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A` and `Z`, absolute or relative. Each subpath is one contour, and it closes whether or not it ends with `Z`;
    - `{ "kind": "polygon", "points": "x,y x,y …" }`: three points or more, written as SVG writes a polygon's points;
    - `{ "kind": "ellipse", "cx": …, "cy": …, "rx": …, "ry": … }`;
  - `keepProportions`, optional: `true` fits the box into the shape's rectangle, centred, keeping its proportions. Left out, the box is stretched to the rectangle, as the five kinds are;
  - `label`, optional: a rectangle of the box (`x`, `y`, `width`, `height`) that its shapes write the name and the detail in.
- **Holes go by nesting.** A point is inside the outline when an odd number of contours hold it, which is SVG's even-odd rule. So a contour inside another is a hole, whichever way either runs.
- **Path data and points are text**, so each contour is one line of a diff, and its numbers are kept as written. For example, a component's appearance in a `.vapackage`:

  ```json
  "appearance": {
    "fill": "#F4C7C3",
    "stroke": "#A23B2E",
    "width": 120,
    "height": 110,
    "geometry": {
      "width": 120,
      "height": 110,
      "keepProportions": true,
      "outline": [
        { "kind": "path", "d": "M60 104 C20 76 0 52 0 30 C0 12 14 0 30 0 C44 0 54 8 60 20 C66 8 76 0 90 0 C106 0 120 12 120 30 C120 52 100 76 60 104 Z" }
      ],
      "label": { "x": 24, "y": 30, "width": 72, "height": 36 }
    }
  }
  ```

### What the core checks

As ADR 0022 says of every trait, commands refuse what breaks a rule, and opening only warns.

- **Path data is read by a strict reader of SVG's path grammar.** It refuses (`invalid-geometry`):
  - anything outside the grammar;
  - a contour that draws nothing;
  - a number that is not finite;
  - an outline or a label that leaves its box by more than 1/1000 of the box's diagonal. This is measured on the curves themselves, not on the points that shape them.
- **Caps** (`geometry-too-large`), each a named constant in the core:
  - 64 contours;
  - 2,000 segments, counted as the image cleaner counts path commands (implicit repeats included), with a polygon's points and four for an ellipse;
  - 32 KiB of path data and points.
- **Caps on files**, so that saving stays light (ADR 0027 reasons the same way for images):
  - a package holds at most 1 MiB of geometry text. Opening warns from 512 KiB (`large-geometry`), and geometries past 1 MiB, in file order, are drawn as their kind;
  - a model holds at most 2 MiB of elements' own geometry, treated the same way.
- **A geometry is data only.** It holds numbers and path data, refers to nothing and runs nothing.

### The outline maths, in the core

`core/src/geometry/` reads a geometry once into a normalized outline. The outline holds:

- absolute moves, lines and cubic Bézier segments only: quadratics are raised to cubics, an arc becomes at most four cubics (one for each quarter turn), and an ellipse becomes four;
- its bounds;
- its contours, each classed as a fill or a hole.

Pure functions take that outline and a shape's rectangle, and give:

- the outline fitted to the rectangle;
- the outline flattened to within a quarter of a canvas unit at that size, at most 24 pieces a segment;
- the outline simplified for drawing far out;
- whether it holds a point;
- where a line from inside it last leaves it;
- where a place on a side of its box, carried straight in, first meets it;
- a point well inside it;
- the largest label rectangle around that point.

Each result is cached by the outline object and the size, so the canvas, layout's input, the exports and the checks share one reading. Named parts (ADR 0067) are read into the same outline type, which can also hold stroked lines.

### How the canvas draws it

- **Drawing.** Tiles draw the normalized outline with PixiJS's line and Bézier calls, filled and stroked in the shape's colors, with holes cut out. It is never drawn through PixiJS's SVG parsing, which ADR 0027 rules out.
- **Containers.** A collapsed container draws its sheet as its outline, offset as the sheet is today. A shape with free geometry can hold contents, placed in its rectangle as in any container, with no grid drawn inside it.
- **Where it does not apply.** Shapes that draw their contents as rows, and rows themselves, ignore it, as they ignore every kind but the rounded rectangle.
- **Levels of detail** (ADR 0055). Far out, where the canvas draws plain blocks, a shape with free geometry draws its outline, simplified to at most 32 points a contour and filled, without its holes. That is also its silhouette level. From the scale names show at, it draws its outline in full.
- **Name and detail.** They are written in `label` when it is given. Otherwise they go in the largest rectangle, at most four times as wide as it is tall, that is centred on a point well inside the outline. When that rectangle is less than 14 canvas units tall at the shape's size, the shape writes no name inside itself; the hover and selection marks write it beside the shape, and the outline, the inspector and announcements give it as for any shape.
- **Images.** An image shows only as an icon, in the label area beside the name, whatever its placement asks.
- **Selection and hover marks** follow the outline, not the box.

### Pointing, selecting and dropping

- **Exact hit testing.** The spatial index finds the box first. The shape then holds a point only inside its outline, or within half its stroke's width outside it. A point in a hole, or one inside the box but outside the outline, falls to whatever lies behind. This is exact to within the flattening's quarter of a canvas unit.
- **Box selection** takes a shape whose outline's bounds lie inside the dragged box.
- **Dropping into a container** with free geometry goes by its outline too.
- **Snapping** is unchanged: the stored position, the top left of the rectangle, snaps to 8 canvas units, and the outline does not.

### Relations and connection points

- **Connection points keep their format**, `side` and `at`, read on the box as it is drawn. Each sits where its place on its side, carried straight in from that side, first meets the outline. When that line misses the outline, it sits at the outline's point nearest that place. A line leaves it in the side's outward direction.
- **Automatic ends.** An end without a connection point attaches where the line from the point well inside the outline toward its other end last leaves the outline, so the line never crosses its own shape after it attaches. An orthogonal route's end is its last segment carried on until it meets the outline, so the route stays orthogonal.
- **Routes chosen by hand** (ADR 0039). A border attachment, `{ side, at }`, is carried in to the outline as connection points are.

### Layout

ELK sees a shape with free geometry by its rectangle, and its connection points as ports on their sides of that box, as it sees any shape (ADR 0015). Layout spaces boxes, so neither free geometry nor a change to it ever moves a shape.

### Who sets it

- **The component editor.** Its Shape section offers Free geometry, made in one of three ways:
  - from SVG path data pasted in;
  - from the shapes of an SVG file, their outline taken by the core and capped;
  - copied from a picture's named part (ADR 0067), which is not the same as being drawn as that part.

  It also offers Keep proportions and the label area, all with a preview. Each change is one undoable action, at the level the project can change, as colors are.
- **Claude**, through `set_appearance`, whose description shows path data with an example.

## Considered options

- **A list of segments in JSON, such as `{ "kind": "cubic", … }`**: rejected. Every number would sit on its own line of the file, and it is hard for people and Claude to read and write, while both write SVG path data fluently.
- **An SVG picture as the outline**: rejected. Pointing and attaching go by the outline, so it should be numbers read by a grammar, not markup. Images stay pictures (ADR 0027).
- **Coordinates from 0 to 1, as connection points' `at`**: rejected. A box of the author's own keeps proportions readable, and path data can be pasted from a drawing as it is.
- **SVG's default nonzero rule for holes**: rejected for outlines people write. Holes would then depend on the direction each contour runs, while even-odd makes a contour inside another a hole.
- **Union, difference and intersection of contours, as Lucid has**: rejected for now. Holes by nesting cover the cases the benchmark found, and these operations would need a dependency that has not been researched.
- **Hit testing by the box, as before**: rejected. Selecting the shape behind through an empty corner of an organ's box is what "exact" asks for.
- **A shared `GraphicsContext` per geometry, drawn by its own display object for each shape**: rejected. It means thousands of display objects, and stretched contexts stretch their strokes too. Tiles that draw outlines into their own graphics keep the frame budget the canvas already meets.
- **Connection points as places along the outline, by contour and fraction of its length**: rejected for now. It is a second spelling, and a side and a place carried in to the outline keep their meaning when an appearance switches between a kind and free geometry.
- **Layout by outline**: rejected. ELK lays out boxes and ports (ADR 0015).

## Consequences

- The schema gains `Appearance.geometry` and its types; the schemas are regenerated and committed. A build without them refuses files that use them, and the format stays at version 1. The live protocol's version goes up.
- The core gains `core/src/geometry/`, its checks, and the problem codes `invalid-geometry`, `geometry-too-large` and `large-geometry`. ADR 0022's compile-time list of traits grows by one, with its resolution and its check.
- The canvas's tests for pointing at a shape and finding its border take its outline into account wherever they took its kind.
- The SVG and PDF exports write the outline as a `path` with `fill-rule="evenodd"`, and the read-only page draws it as the canvas does.
- The benchmark gains a `?geometry` variant.
- CONTEXT.md gains **Free geometry**, and **Appearance** and **Connection point** say how free geometry changes them.

## Clarifications

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (M8b, Seam 2): **the outline type holds stroked lines, several fills and the nonzero rule**, for named parts (ADR 0067), and stays one type. Free geometry sets none of what follows, so its reading is unchanged: even-odd over all its contours, whether they cross or not.
  - **A line has a `width`**, its stroke's width. It holds a band of half that width on each side of it, with round ends, and `distanceToEdges` measures from that band. Fitting an outline to a rectangle scales a line's width by the root of the area it is stretched by.
  - **A closed contour has a `group`**: the fill it belongs to, one for each shape a part fills. The contours of one fill hold by its rule among themselves, and the outline holds what any of its fills holds. A shape drawn over another, wholly or partly, is therefore never a hole in it, as even-odd over all the contours would make it.
  - **A fill read by the nonzero rule is marked `nonzero`, and read by winding numbers per contour**, rather than by contours merged. Holding a point adds up the winding numbers of the fill's contours, which is exact whether they cross or not; merging would need a union of every part's shapes at every reading. Its contours are classed by winding: a fill where the side a contour holds is filled, a hole otherwise. Drawing fills and cutting holes then paints what the rule fills wherever no two of its contours cross.
  - **What draws an outline draws it fill by fill.** The canvas fills each fill and cuts its holes. The SVG writer writes one `path` for each fill: `fill-rule="nonzero"` for a nonzero one, whose contours keep the way they run, and `evenodd` otherwise. It draws lines as strokes of their width.
  - **Contours are merged in one place only**: writing a part's outline as free geometry (`geometryOf`, ADR 0067).
  - **Classing contours is bounded.** Each contour is tried against the others of its fill only when their bounds hold the point tried, and each of those is read at most 128 points, every so many kept. The work still grows with the square of the contours, so every caller caps them before classing: free geometry by its 2,000 segments, and a named part shape by shape (ADR 0067).
  - **`outlineHolds` with a margin** holds only what lies within that margin of the outline. It held every point before, since its search for the nearest edge stopped at the margin itself.
- 2026-10-26 (M8b, Seam 2): **a picture's path data is read up to its first error.** Free geometry's reader stays strict and refuses anything outside the grammar. Reading a picture's shapes for its named parts, the same reader keeps what comes before the first error, as SVG draws it.
- 2026-10-26 (M8b, Seam 3): **the scene's outline.**
  - Each shape that has one carries `outline`: the core's outline fitted to its rectangle, or to its body for a collapsed container, with where it sits from the rectangle's top left and what it was fitted from. One object stands for each source and size, so a move keeps it and the tiles can tell by identity that it did not change.
  - Rows and shapes that draw rows have none, and neither has a drawing with parts, which is drawn as its kind with its header.
  - An overlay's size fits it again to the size it gives.
  - Pointing and attaching read it through `shapeHolds` and `shapeBorderPoint`, and drawing through `drawOutline`, which cuts each hole from the smallest fill around it.

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions, building W52. -->

- 2026-10-26 (M8b, W52): **free geometry on the canvas.** What follows holds for every shape with an outline of its own: free geometry, an anchored part and a part drawn on its own.
  - **Plain blocks and silhouettes** draw the simplified outline (`simplifyOutline`), filled in the shape's fill without its holes, never its box. Where a block is outlined, as a container is and a fill that would not stand out from the canvas, the outline is a rim inside the polygon, as wide as a block's (6 units), with the device pixel line along it. The lines a named part strokes are drawn far out at their width, simplified to 1/200 of the outline's size.
  - **The full drawing** is `drawOutline`, with the device pixel line along every contour. A collapsed container first draws its sheet: its outline moved 5 units right and down, as a box's sheet is, and none when its body leaves no room for one.
  - **Named parts.** A shape drawn as a named part is filled in its part's main color, far out and in full, under its own picture once that shows; its name is written in the colors that read on that color. An anchored part draws no body of its own in full, since its drawing's picture shows it: what changes how it looks is drawn over it (ADR 0067).
  - **Name and detail in the label area.** The label area is used when it is at least 14 units tall, the geometry's own `label` as much as the largest rectangle found. At least two lines tall (40 units), the name is written above its middle and the detail below, as on every shape; lower, the name alone in its middle, given a line's room (20 units) at least. The text wraps to the area's width, which already lies inside the outline. A collapsed container writes its count first on the detail's line, `4 inside · Organ`, as its header does when the count has no line of its own (ADR 0024).
  - **An expanded container** writes its name and detail in its header, as any container does, since its contents fill its rectangle under it: along the longest stretch of its header line, from 6 to 28 units below its top, between 6 units in from its sides and 4 left of its toggle, that its outline holds whole, tried at up to 96 places. A stretch under 40 units wide, as at the apex of a triangle, writes no name. Its icon goes at the stretch's start when the stretch is wide enough for it and a name.
  - **Names beside the shape.** A shape that writes no name inside itself is named beside itself: under its outline's bounds, centred, 4 pixels below, 12 pixels tall on screen whatever the zoom, in the text and halo the theme writes relations' names in. The hover mark always does this. The selection's marks do it while the selection marks at most 64 shapes, since past that a few names would tell nothing apart; what a drag carries is named once it lands.
  - **Icons** go in the label area, whatever the placement asks. With a name, the icon sits 8 units in (or half its side, when that is less), centred down the area, its side 20 units less than the area's height, from 16 to 32, but at most the area's height and a quarter of its width. Without one, it is centred in the area, at most 32 units and the area's size. An icon under 8 units a side is not shown.
  - **Pointing.** Where the shape is drawn in full, it holds a point inside its outline or within 0.75 units of it, half the 1.5-unit stroke it is drawn with (`OUTLINE_REACH`). Where it is drawn as a plain block, it holds by its simplified outline, holes filled, as it is drawn there, and by its lines within the same 0.75, as a box drawn as a plain block holds by its rectangle. Dropping goes by the same rule, for a container with an outline as for a leaf; a container without one still takes a drop anywhere in its rectangle.
  - **Marks** follow the outline: the hover mark, the selection's marks and the emphasis's halo and ring are traced along each fill grown by their gap and each hole shrunk by it, leaving out a hole no wider than twice the gap, and around each line's band. Corners are mitred up to three times the gap, and the traced contours are simplified to a sixth of the gap, half a pixel on screen, so that a mark costs few points far out. The emphasis's corner marks stay around the box, as the sign of a highlight that needs no color.
  - **Tiles** tell a change of outline by the outline it was read from, the size it is fitted to and where it sits, and a change of part by its main color and whether it is anchored, in their signatures.
  - **The budget** is checked by a test on 2,000 shapes with free geometry in 20 geometries, 4 of them at the caps: a pointer along their outlines and over their boxes finds what is under it within 1 ms at the 95th percentile, bounded by the mean, in CPU time, of the slowest 5%.
- 2026-10-26 (M8b, W53): **lines on outlines** (`canvas/routing/outline-ends.ts`), for free geometry and for named parts (ADR 0067) alike.
  - **An orthogonal end is carried on** from where its last segment crosses the box until it first meets the outline, so the route stays orthogonal. Where that segment, carried in, meets nothing, the route goes on from the box to the outline's point nearest there, the one piece that is not orthogonal. Where the outline lies past the route's next point, as for a container whose content a line leaves from, the end keeps its place on the box.
  - **A place carried in from a side**, for a connection point or a border attachment, meets a stroked line at the edge of its stroke. A line attached there leaves it by the usual stub of 12, from the point on the outline.
  - **A part of lines alone**, such as a nerve, is attached at the point of its lines nearest the other end's aim, on the edge of its stroke, in every style. An orthogonal route leaves it as it leaves a point: along the axis that faces the other end.
  - **Routing around shapes** (ADR 0039, W49) works on boxes: the avoider is given a line's stand-in route between its ends' boxes, and the route it gives back is carried on to their outlines as the stand-in is. A part of lines alone, attached at a point, is not routed around.
  - **Kept while nothing it depends on changes.** A line's route depends on its ends' outlines by identity, so the incremental scene routes again only the lines whose ends moved, changed outline or changed style. Moving a shape with free geometry and 50 relations, a third straight and a third curved, takes about 16 ms of CPU time on the shared development machine, within the 50 ms an edit may take.
