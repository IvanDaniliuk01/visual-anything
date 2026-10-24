# Benchmark: what Visual Anything needs to represent anything complex

Translated from the Spanish original written on 2026-10-23 for the project's owner.

Date: 2026-10-24. This document is for deciding: nothing it proposes is approved or implemented.

It rests on seven lines of research, each followed by a verification: diagramming, systems modeling, graphs, 3D anatomy, web rendering engines, research on how to represent complexity, and the state of Visual Anything. I also read the repository directly, on branch `m2-fixes`, commit `e983c0b`.

**Verification markers**
- **[V]** verified: a second pass confirmed it in the primary source.
- **[C]** corrected: the verification found an error and the corrected figure is given here.
- **[P]** primary source read during the research, no second pass.
- **[R]** I read it myself in the repository.
- **[NV]** could not be verified.
- No marker: my own synthesis or recommendation.

**Terms.** I use those of `CONTEXT.md`, with one clarification. In Visual Anything, a *free shape* is a drawing that is not in the model, such as a note or an arrow. So I call the arbitrary contours the user asked for *free geometry* (strokes and polygons). *Physical space* is the concept; I use "3D" only for the render technique, as the glossary asks.

**The repo moved on after the research** [R]. The Visual Anything line said M2 still lacked keyboard navigation and the outline. That is no longer true:
- Keyboard navigation and the outline are done (`001be51`, `f9690b2`).
- The M2 tasks are checked off (`03ed1d9`).
- The M2 review is in `m2-fixes` (`e983c0b`). There the inspector accepts colors written as code (`#rrggbb`, `#rgb`, `rgb(r, g, b)`), and the spec schedules connection points for M3 ("relations attach to them, and ELK takes them as ports").
- The `m2` tag is still missing.

**Corrections from the verification that change conclusions**
- HRA: the figures attributed to v2.2 were wrong. The current version is v2.5: 4,807 anatomical structures and 81 reference 3D objects with 1,392 structures [C].
- BodyParts3D: it is CC BY 4.0 only since 2025-02-27. Before that, version 4.0 included, it was CC BY-SA 2.1 Japan, and the OBJ files still say so in their header [C].
- Z-Anatomy: the Blender add-ons are GPL-3.0, and some pieces are CC BY-NC or unlicensed [C].
- Allen CCFv3: it has 329 subcortical structures, not 314 [C].
- WebGPU in Firefox for macOS: only on Apple Silicon. On Intel Macs and on Linux, only in Nightly [C].
- HTML-in-Canvas: it is only behind Chromium flags, and the API was renamed in September 2026 [C].
- Tory et al. (2006): only the abstract could be verified, and the phrase "standard practice in radiology" does not appear there [C].
- Pad++'s license is not open source [C].
- Cytoscape: some level-of-detail thresholds count nodes and others count edges [C].
- OpenUSD: `purpose` is not a level-of-detail mechanism, and the current version is v26.11.1 [C].

---

## 1. Executive summary

Representing the human body with all its parts does not depend on how many things fit on a canvas. The tools that best solve this kind of problem agree on four things:
- a model with stable identities;
- groupings that overlap;
- several representations linked to each other;
- each representation with just the right level of detail.

The body has tens of thousands of named parts (FMA 5.1.0 has 104,721 terms [V]). It also has relations that containment does not capture, such as blood supply, innervation, or the origin and insertion of a muscle, and a real physical arrangement. No single view can show all of that together. What is needed is to go up and down in abstraction level, filter, focus, and move from a 2D schematic to the physical arrangement without losing the identity of each part.

Visual Anything already has what is hardest to add later:
- a typed model;
- several containers per element (ADR-0007);
- relations that end on relations (ADR-0010);
- views with a single perspective;
- scenarios with broken steps;
- commands that can be undone and record their author.

None of the more than 60 tools and datasets reviewed brings all of that together. In diagramming tools the shape is the model. Systems modeling tools have fixed lists of shapes. Graph tools do not nest with multiple membership. Anatomy tools keep relations in text cards.

To represent "anything," four blocks are missing:
1. **Appearance beyond five boxes.** Free 2D geometry with exact selection and connection points; images and SVG as the component's image; and parts of an imported drawing anchored to elements.
2. **Control of detail.** Semantic zoom declared as data, overlays by attribute with a legend, and external identifiers (FMA, Uberon) so that Claude and importers do not confuse parts.
3. **Physical space where the arrangement is the data.** glTF meshes inside components and, later, a physical space panel linked to the 2D views.
4. **Safe import.** SVG, HTML and glTF are sanitized in the local program, and nothing imported is ever executed.

**On 3D.** The evidence supports the core of ADR-0003: text and relations are harder to read in 3D, 3D helps in understanding shape and physical arrangement, and linked 2D and 3D, side by side, perform as well as or better than either one alone. So I do not recommend a 2D/3D toggle per view, which ADR-0003 already rejected. I recommend physical space inside components first and a linked panel after. The panel does change ADR-0003. Section 7 has the draft of an ADR that replaces it, and it needs the user's agreement before any code is written.

**On HTML.** Static HTML can come in as a drawing, sanitized and converted to SVG, without touching any ADR. HTML with scripts is code that runs: it clashes with "never store code that runs" and with ADR-0012, and for now I do not recommend it.

**Main recommendations, in order**
1. **In v0.1 (M3, already in the spec):**
   - connection points, with an appearance format that leaves room for free geometry;
   - focus by degrees and by direction.
2. **In v0.1 only if the spec grows; if not, in v0.2:** context menu, stacking order, dropping a shape into a container, and a grid with snap. They are small changes and touch the model very little.
3. **In v0.2, "beyond the boxes":**
   - free 2D geometry;
   - sanitized images and SVG;
   - SVG with named parts;
   - semantic zoom;
   - overlays with a legend;
   - external identifiers;
   - table component;
   - component editor;
   - themes;
   - static HTML.
4. **After v0.1 (case 5):**
   - physical space inside components, with three.js r186 loaded on demand and a glTF pipeline in the local program;
   - then, the linked panel, with a new ADR.
5. **Do not do:**
   - a 2D/3D toggle per view;
   - an iframe per element;
   - saving HTML with scripts or glTF with behavior in the project.

---

## 2. What each category of tools does

### 2.1 Diagramming and whiteboards
Tools reviewed: draw.io, Lucidchart, Microsoft Visio, Miro, FigJam, Excalidraw, tldraw, Whimsical and OmniGraffle.

**What they do best**
- **Real free geometry, in the professional tools.**
  - Visio: Geometry sections with 15 row types (among them NURBSTo and SplineKnot), several sections per shape, driven by ShapeSheet formulas [V].
  - Lucid: SVG paths in relative coordinates, boolean operations (union, intersection, difference, xor) and geometry repeated by formula with ForRepeat and MapRepeat [V].
  - OmniGraffle: Bézier pen and non-destructive combinations, in the Pro version [V]. Tables are Pro too [C].
  - draw.io: XML stencils (move, line, quad, curve, arc) with named connection points [V].
- **tldraw separates what is painted from what is selected.** Each shape paints any React/HTML and returns a Geometry2d separately (Polygon2d, CubicBezier2d and others). That geometry is used to select, snap, anchor arrows and compute bounds [V]. It is the right pattern for free geometry. Its bindings, with lifecycle hooks, are the best model of a relation with behavior [V].
- **Data on shapes.**
  - Visio links data from Excel, Access, SharePoint, SQL Server and OLEDB/ODBC sources [V]. Linking requires the desktop app (Plan 2): Visio in Microsoft 365 and Plan 1 only view the data [C].
  - Lucid has typed data (number, string, color, date, boolean, array, object, formula, picklist) and conditional formatting [V].
- **Multiple membership, only in Visio.** A shape can be in several containers (`Shape.MemberOfContainers` returns an array) and in several layers [V].
- **Safe HTML.** draw.io runs HTML labels through a sanitizer based on DOMPurify [V]. tldraw and Excalidraw put live web content in isolated iframes, with lists of allowed sites [V].
- **Isolated code.** FigJam widgets run in the same sandbox as plugins [V], which has been QuickJS compiled to WebAssembly since 2019 [P]. It is the direct precedent of ADR-0012.

**Where they fall short**
- **The shape is the model.** There is no element identity separate from the shape, no typed relations, no perspectives. None documents relations that end on relations.
- **Containment is a tree, except in Visio.** In draw.io, moving a shape to another layer takes it out of its container [V].
- **There is no real 3D.**
  - Visio has perspective and isometric templates, drawn with 2D lines [P].
  - draw.io has a 3D AWS shape set; the isometric grid is still requested in issue #1562 [P].
  - Microsoft 365 lets users insert rotatable 3D models in Word, Excel, PowerPoint and Outlook, not in Visio [P].
- **The scale they promise is modest.**
  - Miro recommends fewer than 5,000 objects and warns of slowness from 1,000 [NV: I read it in search snippets, because the page returned 403].
  - tldraw draws in the DOM and has a default cap of 4,000 shapes per page [P].
  - Visio for the web considers a diagram of more than 1,000 shapes "large" [P].
  - Visual Anything's goal, 10,000 elements at 60 fps, is above all of them.
- **A security lesson.** In draw.io, up to 29.7.11, an unsanitized `innerHTML` in the text format panel was enough for a crafted file to run JavaScript. It is CVE-2026-46642, fixed in 29.7.12 [P].
- **Licenses.**
  - draw.io is Apache-2.0 and does not accept pull requests [V]. Its icons and stencil libraries have separate terms that exclude Atlassian products [C: the restriction names the icons and the stencil libraries].
  - mxGraph reached end of life on 2020-11-09 and GitHub archived it on 2021-03-31 [C]. Its successor, maxGraph, is Apache-2.0 and is at v0.25.1 [V].
  - tldraw requires a license key in production; without one, the editor stops rendering after five seconds [V]. It is not suitable as the base of an AGPL project.
  - Excalidraw is MIT (version 0.18.1) [V].

### 2.2 Systems modeling
Tools reviewed: Structurizr, IcePanel, Ilograph, LikeC4, Archi, Sparx Enterprise Architect, Cameo/CATIA Magic, SysML v2 with Eclipse SysON, Eclipse Capella, D2, Mermaid, PlantUML and Cloudcraft.

**What they do best**
- **One model with many views that are projections.** Editing in one view changes all of them (Structurizr, IcePanel, Ilograph, CATIA Magic) [V].
- **Views defined by rules.**
  - LikeC4: `include` and `exclude`, predicates on relations, `where` by type, tag or metadata, and views that inherit from others [V].
  - SysML v2: `expose`, `filter` and `render`, with viewpoints as checks [V].
- **Derived relations.** Structurizr's implied relationships and Capella's computed links are the same idea as Visual Anything's aggregated relations [V].
- **Exploration: Ilograph is the reference.** It offers:
  - contexts, which put the same resources in another tree with the same arrows;
  - a level-of-detail slider;
  - a focus that hides what is unrelated;
  - walkthroughs [V].
- **Stories over the structure.**
  - IcePanel Flows: 8 step types, among them alternative and parallel paths [V].
  - LikeC4: dynamic views with par/opt/loop/alt blocks [V].
  - D2: steps and scenarios that export as animated SVG, GIF, PDF or PPTX [V].
- **Overlays by attribute.**
  - Structurizr's perspectives with per-value styles [V]. In its viewer, '.' moves forward and ',' moves back [C].
  - IcePanel's tags [V].
  - Cloudcraft's overlays [V].
- **Executable behavior, only in MBSE tools.** Cameo Simulation Toolkit (fUML and SCXML) [V], the SysML v2 simulation plugin of CATIA Magic 2026x Refresh1 [V], and EA's JavaScript simulation in the Corporate, Unified and Ultimate editions [C].
- **Geometry as typed data.**
  - The SysML v2 ShapeItems library defines Polygon, Polyhedron, Cylinder, Sphere and others. `Box` is an alias of RectangularCuboid and `Wedge` of RightTriangularPrism [C].
  - SpatialItems adds 3D coordinate frames [V].
  - The Geometry View ("two or three dimensions") is in the standard library StandardViewDefinitions.sysml, and SysON lists it as "planned" [C].
- **MCP.**
  - Structurizr validates and exports DSL and does CRUD of workspaces [P].
  - LikeC4 has 20 tools, all read-only [P].
  - IcePanel writes objects, connections and ADRs, and only on paid plans [P].
  - None writes with undo labeled by author, which is what Visual Anything proposes.

**Where they fall short**
- **Fixed lists of shapes.** Structurizr has 19, D2 has 18, LikeC4 has 11, and Mermaid added 30 new ones since 11.3.0 [P]. The exception is EA: its Shape Scripts draw arbitrary geometry by stereotype [C: confirmed in the Sparx guide].
- **A single tree.** Ilograph allows a single parent within each context [V], and IcePanel has a fixed hierarchy [V]. ADR-0007, with one copy per container in the same view, goes further than all of them.
- **Everything is 2D.** D2's `3d` style is cosmetic and only applies to rectangles and squares [P]. Cloudcraft switches between isometric 3D and top-down 2D, but only for cloud infrastructure [V].
- **Text tools do not scale.** Mermaid ships with `maxEdges` 500 by default [P].
- **Licenses.**
  - SysON is EPL-2.0, but it includes the KerML and SysML v2 libraries under LGPL-3.0-only [C].
  - D2 and TALA are MPL-2.0 since v0.9.0 [V]. The company behind D2 shut down, and the project continues as a nonprofit, sponsored by Hack Club [P].

### 2.3 Graphs and networks
Tools reviewed: Kumu, Gephi and Gephi Lite, desktop Cytoscape, Cytoscape.js, yEd with yFiles, Neo4j Bloom, Graphistry, Obsidian (graph view, Canvas and JSON Canvas), Sigma.js, the 3d-force-graph family, Linkurious with Ogma, and cosmos.gl.

**What they do best**
- **GPU rendering with level of detail.**
  - Sigma.js 4.0 (2026-10-08) uses only WebGL 2, draws labels with signed distance fields and uses one program for all nodes and another for all edges [V].
  - Cytoscape.js's WebGL mode went from about 20 fps to more than 100 with about 1,200 nodes and 16,000 edges, on an M1 [V].
  - Graphistry and cosmos.gl handle hundreds of thousands or millions of points [V].
  - Obsidian replaced d3 on SVG with PixiJS because "the performance was subpar for thousands of notes" [V].
- **Explicit detail thresholds in desktop Cytoscape.** Each feature turns off when the amount drawn reaches the threshold [C]:
  - node labels: 200 nodes;
  - node borders: 400 nodes;
  - edge labels: 200 edges;
  - arrows: 600 edges;
  - coarse mode: 4,000 nodes plus edges.
- **Containers that collapse into meta-edges and expand again without losing the mental map.** Cytoscape groups do this [V], and so do cytoscape.js-expand-collapse (groups parallel edges by type, can be undone, and is no longer maintained) [V], yEd group nodes [V] and Linkurious groups with a counter [V].
- **Focus by degrees and direction.** Kumu allows `#jack out 2` and a mode that starts with an empty screen. Bloom expands neighbors by relation type and direction. Obsidian has the local graph [V]. Kumu also distinguishes filtering (hiding) from highlighting (dimming the rest) [V].
- **Style by attribute.**
  - Cytoscape: passthrough, discrete and continuous mappings [V].
  - yEd: Properties Mapper [V].
  - Bloom: style rules [V].
  - Sigma: declarative styles that react to hover and selection [V].
- **Time.** Bloom's Slicer filters up to five ranges, with three playback modes [V]. Linkurious has a timeline [V].
- **Stacking order.** JSON Canvas (MIT) solves it with array order: the first node is drawn below the others [V].

**Where they fall short**
- **Multiple membership, only in desktop Cytoscape.** `getGroupsForNode` returns all the groups of a node [V]. Cytoscape.js compound nodes have a single parent and only a rectangular shape [V].
- **Key pieces are missing.** They have no relations on relations, no semantic zoom that turns an element into its parts, and no scenarios.
- **3D is always an add-on.**
  - Cytoscape has the Cy3D 1.2.0 app [V].
  - Gephi has Force Atlas 3D 1.2.1 (Apache-2.0) and also Network Splitter 3D 1.0.0 (GPL v3) [C].
  - The 3d-force-graph family (MIT; 3d-force-graph 1.80.1) is the only one with 2D, 3D, VR and AR under the same interface, and it accepts any three.js mesh or HTML as a node [V]. Its largest official example is around 4,000 elements [P].
- **The evidence in favor of 3D in networks is real but limited** (details in section 7). The studies use graphs with a median of 120 nodes and a maximum of 7,885 [P].

### 2.4 3D anatomy
Tools and data reviewed: BioDigital Human, ZygoteBody, Visible Body Human Anatomy Atlas, Complete Anatomy, Z-Anatomy, BodyParts3D, AnatomyTOOL, Open Anatomy (with 3D Slicer), Sketchfab, Allen Brain Atlas, Human Reference Atlas (HRA), Human-Atlas, EBI anatomograms and Servier Medical Art.

**What they do best**
- **Each part is a mesh with a stable ontology ID.**
  - BodyParts3D uses FMA IDs and separates the concept, the representation and the file [C].
  - HRA joins its GLBs to the ontologies through crosswalk tables; for example, `VH_M_mitral_valve` corresponds to `UBERON:0002135` [V].
  - Allen shares one structure ID among the ontology, the OBJ meshes and the SVG paths [C].
- **Overlapping groupings of the same parts.**
  - BodyParts3D publishes an IS-A tree and a PART-OF tree separately [C].
  - Visible Body combines a systems tray, a filter by region, a breadcrumb with all the groups and systems of a structure, and P+click to select the parent and the siblings [V].
- **Composite parts have no mesh of their own.** In BodyParts3D, a COMPOUND organ is the sum of its elements [C]. It is exactly a container without geometry of its own.
- **They share a visualization vocabulary** [V in BioDigital, Visible Body, Complete Anatomy and Sketchfab]:
  - selecting a part, its parent or its siblings;
  - hiding, dimming or X-ray view;
  - isolating, hiding the rest or dimming the rest;
  - dissecting (removing with a click, with undo) and peeling layers;
  - cutting planes and exploded views;
  - labels anchored to a point, with the camera saved;
  - search by name or ID;
  - saved views and tours.
  - In BioDigital the API changes by platform: `setLayers` only exists on iOS, and on the web, dissecting is a toolbar button [C].
- **2D panels linked to the 3D.** Complete Anatomy and Visible Body show radiology or cadaver images next to the model [V]. Open Anatomy Browser brings together 3D models, labeled slices, radiology and a text hierarchy [C].
- **2D plates as data with IDs.** Allen's SVGs carry `structure_id` and `parent_id` on each path [C]. EBI anatomograms use ontology IDs as `id` and reuse shapes with `<use>` [V].

**Where they fall short**
- **Relations stay outside the model.** Blood supply, innervation, origin and insertion live in text cards or in a tool for following branches; they cannot be queried or drawn. This is exactly where a tool that starts from the model adds the most.
- **Commercial ones are closed.** BioDigital, Zygote, Visible Body and Complete Anatomy have closed data and formats: they serve as an interaction reference, not as a source.
- **Allen** uses a single-parent tree and noncommercial terms of use [V].
- **Marketing figures do not match between pages.** BioDigital says "over 14,000 individual anatomical structures" on the product page and "over 8,000 individually selectable structures" on the schools page. It also mentions more than 600 conditions on one page and more than 1,000 on another [C].

### 2.5 Scientific visualization and digital twins
Tools reviewed: Neuroglancer, 3D Slicer, Mol*, the HRA apps, Azure Digital Twins (DTDL v4 and 3D Scenes Studio), Autodesk Tandem, NVIDIA Omniverse with OpenUSD, iTwin.js, and CesiumJS with 3D Tiles.

**What they do best**
- **Coordinated 2D and 3D views.** Neuroglancer shows three orthogonal slices and a 3D view that share the same center [V]. In 3D Slicer, Shift with the mouse places the crosshair cursor in all 2D and 3D views [V].
- **Multiresolution detail.** Neuroglancer stores each mesh at several levels of an octree, in Draco fragments with vertices quantized to 10 or 16 bits [V]. 3D Tiles streams a spatial hierarchy [V]; its specification is CC BY 4.0 [C].
- **Meshes linked to a model.** In Azure 3D Scenes Studio, which is in preview, "Elements are user-defined 3D meshes that are linked to digital twins", with visual rules and layers by role [P].
- **View state as data.** MolViewSpec, from Mol*, describes scenes, and MolViewStories builds narratives from those states [V]. Mol* renders cellular models with tens of millions of atoms [V].
- **Typed twin models.** DTDL v4 separates Property, Telemetry, Command, Relationship and Component, with explicit limits: 12 levels of inheritance and 100,000 elements [P].
- **Composition at scale in OpenUSD.** References, payloads loaded on demand and native instancing [V]. `purpose` is not a level-of-detail mechanism: that is done with variant sets. The current version is v26.11.1, from 2026-10-21 [C].

**Where they fall short**
- Each belongs to its own domain (volumes, molecules, buildings, geospatial) and does not model systems in general.
- Azure and Tandem are cloud services, far from the local-first approach. Omniverse is under NVIDIA's EULA [V].

### 2.6 Interactive explanations and zoomable interfaces
References reviewed:
- Systems and tools: Pad and Pad++, MapLibre as a declarative zoom model, Tangle, Idyll, Distill, LOOPY and Bartosz Ciechanowski's articles.
- Research frameworks: Shneiderman, Furnas, Cockburn et al., Baldonado et al., van Wijk and Nuij, Heer and Robertson, Segel and Heer, Moody, and Green and Petre.

**What they do best**
- **Semantic zoom.** Pad (1993) defined it: a small document shows the title; when enlarged, a summary; at the end, the full text [C].
- **Declarative zoom.** MapLibre only allows `['zoom']` as the input of a `step` or an `interpolate` [P]. Its `flyTo` uses the 1.42 curve that comes from van Wijk's study, and skips the animation when the system asks for reduced motion [P].
- **Parameters and simple simulation.**
  - Tangle lets the reader change parameters and see the result instantly [P].
  - LOOPY simulates causal loops and is CC0 [P].
  - Ciechanowski builds figures with sliders on hand-written WebGL [P].
- **Frameworks that organize the problem** [P]:
  - Shneiderman: "overview first, zoom and filter, then details-on-demand".
  - Furnas: degree of interest is a priori importance minus distance from the focus.
  - Baldonado: eight rules for multiple views, among them that selection be consistent across views.
  - Heer and Robertson: transitions in simple stages, of about one second each.
  - Moody: nine principles of notation, among them perceptual discriminability.

**Where they fall short**
- **They are very costly to make** [P]:
  - Distill paused on 2021-07-02 because of burnout; some articles had received more than 50 hours of editorial help.
  - Idyll has received no changes since 2023-02-04.
  - Tangle dates from 2011.
  - Having Claude write scenarios and tours attacks exactly that bottleneck.
- There is no model behind them: each piece is handcrafted and is not reused.
- Pad++ is not open source. Its license only allows using it for free without combining it with any product, and distributing it requires a negotiated license [C].

---

## 3. Capability matrix

Cells: yes, partial or no, plus a word. "VA" is Visual Anything. Each cell sums up what section 2 says and what the repository shows [R]. In the last column, the R and the number refer to the recommendations in section 5. The first row is called "free geometry" because of the clarification of terms at the start.

| Capability | Diagramming | Systems modeling | Graphs | 3D anatomy | Scientific visualization and twins | Interactive explanations | VA today | VA with what is proposed |
|---|---|---|---|---|---|---|---|---|
| Free 2D geometry and curves | yes: Visio, Lucid | partial: EA only | partial: polygon | partial: plates | no: not its focus | yes: by hand | no: 5 shapes | yes: R8 |
| SVG | partial: uneven | yes: as icon | partial: as background | yes: plates with IDs | partial: HRA FTU | yes: web | no | yes: sanitized, R9 and R10 |
| Images | yes | yes: icons | yes | yes: radiology | yes: volumes | yes | no | yes: assets, R9 |
| HTML | partial: labels, iframes | partial: Markdown | partial: overlaid | no: limited text | no | yes: they are HTML | no: only for editing | partial: static, R16 |
| 3D per component | no | no | partial: mesh per node | yes: mesh per part | yes: linked mesh | partial: by hand | no: Later | yes: glTF, R20 |
| Full 3D view | no: isometric | partial: SysML v2, Cloudcraft | partial: add-ons | yes: it is their base | yes | partial: by hand | no: ADR-0003 | partial: linked panel, R21 |
| Levels of detail and semantic zoom | no: culling only | yes: Ilograph, C4 | yes: thresholds | partial: layers | yes: multiresolution | yes: Pad, MapLibre | partial: fixed LOD | yes: declarative, R11 |
| Multiple containment | partial: Visio only | partial: contexts | partial: Cytoscape only | yes: systems and regions | partial: groups | no | yes: model; M3 | yes |
| Relations on relations | no | not documented | no | no | no | no | yes | yes |
| Perspectives | no: layers, pages | yes: n views | partial: Bloom | partial: per system | partial: per role | no | partial: format; M3 | yes |
| Filters and focus | partial: layers, tags | yes: predicates | yes: degrees, dimming | yes: hide, isolate | yes | partial | no: M3 | yes: degrees, R2 |
| Coordinated 2D-3D views | no | no | no | partial: radiology | yes: 4 panels | partial | no | yes: R21 |
| Time and scenarios | no | yes: flows, steps | partial: timeline | partial: tours | partial: stories | yes: sliders | partial: files; M5 | yes: M5 and tours, R17 |
| Simulation | partial: widgets | yes: MBSE | no: layout physics only | partial: motion | partial: physics, rules | yes: Tangle, LOOPY | no: Later | partial: R22 |
| Data and attributes | yes: almost untyped | yes: typed | yes: mappings | partial: IDs, cards | yes: telemetry | partial: parameters | yes: typed | yes: overlays, R12 |
| Import | yes: draw.io | partial: own formats | yes: CSV, databases | partial: Slicer | yes: DICOM, IFC | no | no | yes: SVG, glTF, ontologies |
| Export | yes | yes: Mermaid, PPTX | yes: image | partial: mostly closed | yes: glTF, STL | yes: web page | no: after v0.1 | yes: SVG, PNG, R19 |
| Scale | partial: 1,000–5,000 | partial: derive relations | yes: GPU | yes: thousands of parts | yes: streaming | no: handcrafted | yes: 10,000 benchmark | yes: with LOD |
| Collaboration | yes: real time | yes: SaaS or Git | partial: server | partial: shared sessions | partial: cloud | no | partial: Git | partial: Git (spec decision) |
| Extensibility | yes: SDK, plugins | yes: scripts | yes: apps | partial: SDK | yes | partial: code | partial: JSON packages | yes: programmable, R22 |
| AI | partial: draw.io MCP | partial: MCP mostly read-only | partial: Copilot beta | partial: optional WebMCP | partial | no | not yet: M4 | yes: MCP with undo |

---

## 4. Visual Anything gaps against the request

| Request | Today in the repo [R] | What is missing | What it clashes with |
|---|---|---|---|
| Shapes that are not boxes | `Appearance.shape` accepts five values: rectangle, rounded-rectangle, ellipse, cylinder, person. Selection, routes and the size of containers work with rectangles | Strokes and polygons with holes, exact selection, anchoring on the real edge and non-rectangular containers | Nothing; it extends the ADR-0019 format |
| Free 3D polygons | No file stores 3D data | glTF meshes as a component's drawing | ADR-0003 allows it inside components; the spec leaves it for case 5 (Later) |
| View in 3D or in 2D | It does not exist | Linked physical space panel | ADR-0003 rejects the per-view toggle: a new ADR is needed |
| SVG as the component's image | There is no image field | Component image or drawing, sanitized | CLAUDE.md allows only five JSON file types; ADR-0012 requires removing scripts and external references |
| Images | Same as SVG. The watcher ignores other paths (`isProjectPath`) and the server only serves the app and the WebSocket | Assets folder, served with strict headers | CLAUDE.md |
| Import HTML | HTML only as a layer for editing text (ADR-0014) | Static HTML is converted to SVG; live HTML would need an isolated iframe | Live HTML clashes with ADR-0012 and with "never store code that runs" |
| Own themes and colors | Only `#rrggbb`, no alpha. The `#FFFFFF` background and the colors of notes, arrows and labels are constants. The inspector already accepts `#rgb` and `rgb()` | Alpha, theme tokens, dark mode, per project or per view | It changes the format |
| Grid, rulers, snap | They do not exist; moving rounds to whole units | Per-person settings | Nothing |
| Bring to front or send to back | Fixed order: element shapes by nesting depth, then relations, then free shapes | Order per view and commands to change it | It changes the format |
| Drop into a container | Moving leaves each shape in its container | Command that changes the nesting relation | Nothing; it respects the core's cycle rule |
| Context menu | The canvas does not listen to `contextmenu` | Menu with the actions that already exist, and a keyboard equivalent | Nothing |
| Table component | A shape shows its name and its component's name | Row layout, with rows that are elements | It changes the format |
| Component editor | The core has `define-component`, but the app never sends it | Interface to create and edit them | The spec leaves "Created from the canvas" for Later |
| Functions in code | They do not exist | Programmable components | The spec leaves it for case 4 (Later); ADR-0012 already says how |
| Detail by zoom | Fixed renderer levels: blocks below scale 0.25, names from 0.45, labels limited to 6 ms and 32 per frame | Rules per component | Nothing |
| Routes that follow the anatomy | Provisional orthogonal ones until ELK routes, in M3 | Curves by relation type | The spec asks for orthogonal routing by default |
| Ontology IDs | Possible today as a `string` attribute | Own field and crosswalk tables | Nothing |
| Export | It does not exist | SVG and PNG | The spec leaves it for after v0.1 |
| Accessibility of what is new | Outline and keyboard navigation are done | Alt text for images and a description of the physical space | ADR-0014 requires it |

---

## 5. Prioritized recommendations

Effort scale:
- **S**: up to a few days.
- **M**: one or two weeks.
- **L**: several weeks.
- **XL**: a whole milestone or more.

"v0.1" means within M3 to M6 of the current spec.

| # | Recommendation | Effort | Impact | Where |
|---|---|---|---|---|
| R1 | Connection points, with a format that already foresees free geometry | M | high | v0.1 (M3, already in the spec) |
| R2 | Focus by degrees and direction, and an isolate option | S | medium | v0.1 (M3) |
| R3 | Context menu | S | medium | v0.1 if the spec grows; if not, v0.2 |
| R4 | Stacking order | S–M | medium | same |
| R5 | Dropping a shape into a container | M | high | same |
| R6 | Grid, rulers and snap | S–M | medium | same |
| R7 | Themes and colors with transparency | M | medium | v0.2 |
| R8 | Free 2D geometry in the appearance | L | very high | v0.2 |
| R9 | Assets: sanitized images and SVG | L | very high | v0.2 (the spec's icon needs a decision) |
| R10 | SVG with named parts turned into anchored shapes | L | high | v0.2 |
| R11 | Declarative semantic zoom | M | high | v0.2 |
| R12 | Overlays by attribute with a legend | M | high | v0.2 |
| R13 | External identifiers and crosswalks | S | high | today as a convention; v0.2 as a field |
| R14 | Table component with rows that are elements | M–L | high | v0.2 |
| R15 | Component editor in the app | L | high | v0.2 |
| R16 | Static HTML as a drawing | M | medium | v0.2 |
| R17 | Tours and animated camera | M | high | v0.2 (already planned) |
| R18 | Curved routes | M | medium | v0.2 |
| R19 | Export SVG and PNG | M | medium | after v0.1 |
| R20 | Physical space inside components | XL | very high | after v0.1 (case 5) |
| R21 | Linked physical space panel | XL | very high | after R20, with a new ADR |
| R22 | Programmable components | XL | high | after v0.1 (case 4) |
| R23 | Anatomy package and ontology import | L–XL | high | after R8 to R13 |
| R24 | Live HTML in a single isolated iframe | L | low | only with a new ADR; I do not recommend it now |

### R1. Connection points, with free geometry in mind
- **What.** Do the M3 task: relations hook onto points that the component defines, and ELK takes them as ports.
  - Each point is written in coordinates relative to the shape's box (0 to 1), with an optional name and side, like the `<constraint>` entries in draw.io stencils [V].
  - Points are inherited by derivation, like the rest of the component [R].
  - The `Appearance` change should be defined now, so that a contour field can come in later without migrating what is stored (ADR-0019 foresees extensions [R]).
- **Why.** Anatomy needs fixed points, such as the origin and insertion of a muscle or the entry of a nerve. Tables need a point per row. ADR-0015 already passes connection points to ELK [R].
- **Risks.** Routes and selection today are rectangular [R].
  - Open question for M3: where to store which point each relation uses. I propose storing it in the view, like positions.
  - What is semantic, such as the origin of a muscle on a bone, is better modeled as a "reference point" element.
- **Technology.** PixiJS 8.22.0 (MIT), already installed [R]. elkjs (EPL-2.0 or GPL-3.0-or-later), which is not yet a dependency [R].
- **Where.** v0.1, M3 [R].

### R2. Focus by degrees and direction; isolate
- **What.** The M3 focus mode with 1, 2 or n hops, and incoming, outgoing or both directions, like Kumu (`#jack out 2`) and Bloom [V]. Also, an option to isolate (hide what is not in focus) next to the one to dim. The spec already distinguishes filtering, which hides, from focusing, which dims [R].
- **Why.** A large model is read little by little. Furnas's degree of interest and its graph version by van Ham and Perer support this way of showing it [P].
- **Risks.** It must be defined how hops count when a relation ends on another relation.
- **Technology.** Core queries; no libraries required.
- **Where.** v0.1, M3.

### R3. Context menu
- **What.** Right click, the menu key or Shift+F10 on a shape, a relation or the empty canvas. It offers rename, delete with preview, relate, bring to front or send to back (R4), collapse or expand (M3) and open in the inspector. It only sends commands that already exist.
- **Why.** The user asked for it, and it makes discoverable actions that today live on keys and in the toolbar.
- **Risks.** It must be operable from the keyboard and have ARIA menu roles.
- **Technology.** The federated `contextmenu` event of PixiJS 8.22.0 [P; it appears in `EventBoundary` in the installed package, R] and a React menu.
- **Where.** v0.1 if it is added to the spec; if not, v0.2.

### R4. Stacking order
- **What.** An `order` field per anchored position and per free shape, inside each view, plus the commands bring to front, send to back, raise and lower.
  - Bring to front assigns the maximum plus one, so the diff changes a single line.
  - A container always stays below its contents.
  - Selection follows the same order.
- **Why.** The user asked for it, and overlapping irregular parts, like organs, need an explicit order. JSON Canvas uses array order [V]; an explicit field diffs better because positions are identified by element and container.
- **Risks.** The renderer draws by nesting depth and in tiles [R]; the order must be applied within each depth.
- **Technology.** PixiJS 8.22.0 `zIndex` and `RenderLayer` [R].
- **Where.** v0.1 if the spec grows; if not, v0.2.

### R5. Dropping a shape into a container
- **What.** When dragging over a container, it is marked as the target. On drop, a single batch command does three things:
  1. deletes the old nesting relation of the type that the view uses;
  2. creates the new one;
  3. sets the position relative to the new container.
  With a modifier, a container is added instead of moving (ADR-0007). The core already blocks cycles [R].
- **Why.** The user asked for it. Containment is a relation (ADR-0019), so the gesture edits the model.
- **Risks.**
  - It changes all the views that nest by that relation type, so it needs a preview.
  - If the view nests by several types, the user must be asked which one to use. The toolbar uses the first one today [R].
  - ADR-0019 says a position is kept when the element leaves the container [R].
- **Technology.** The `create-relation`, `delete` and `set-positions` commands inside a `batch` [R].
- **Where.** v0.1 if the spec grows (it fits the M3 task on several containers); if not, v0.2.

### R6. Grid, rulers and snap
- **What.** A grid drawn with level of detail according to zoom, snap to the grid and to edges and centers of other shapes, alignment guides and rulers in screen coordinates. These are per-person settings, outside the model; if they are to be shared, there can be an optional field in the view.
- **Why.** The user asked for it, and it helps draw with precision.
- **Risks.** Performance at zoom 0.02 [R]: the grid should be a repeated texture, not thousands of lines. Snap with 10,000 shapes has to use the spatial index that already exists [R].
- **Technology.** PixiJS Graphics and TilingSprite [P].
- **Where.** v0.1 if the spec grows; if not, v0.2.

### R7. Fully custom themes and colors
- **What.**
  - Colors with alpha (`#rrggbbaa`).
  - Theme tokens per project: background, notes, arrows, relation labels and selection; in light and dark, with the option to change them per view.
  - Keep the automatic text contrast, which today looks for 4.5:1 [P].
  - Warn when two components become indistinguishable, based on Moody's perceptual discriminability [P].
  - Gradients, later: Pixi has `FillGradient` [P].
- **Why.** The user asked for it, and it also serves per-domain palettes, such as one color per body system.
- **Risks.** It changes the `Color` pattern in the schema [R]. With transparency, text contrast gets complicated.
- **Technology.** PixiJS 8.22.0, no new libraries.
- **Where.** v0.2. Writing the color as code is already in `m2-fixes` [R].

### R8. Free 2D geometry in the appearance
- **What.** `Appearance` adds a contour: one or more closed strokes written in SVG path syntax (M, L, C, Q, A, Z), in coordinates relative to the box, like Lucid's paths [V].
  - It allows holes and an optional area for the label.
  - It works for components and as a particularity of an element.
  - Selection looks first in the box index and then tests the point against the contour.
  - Relations anchor at the intersection with the contour or at a connection point.
- **Why.** The user asked for it: organs, bones, robot silhouettes and any notation that is not made of boxes. The right model is tldraw's, which separates what is painted from the selection geometry [V].
- **Risks.**
  - PixiJS only batches Graphics of up to 100 points [P]. The fix is a shared `GraphicsContext` per component and `cacheAsTexture` when zoomed out [P].
  - earcut can triangulate complex holes badly [P].
  - Orthogonal routes toward irregular edges look odd: connection points should be preferred.
  - ELK only sees the box and the ports.
- **Technology.** Graphics, `GraphicsContext` and the path parser that PixiJS 8.22.0 (MIT) includes [R]. Boolean operations, as in Lucid, would be done on import, with a 2D library that I did not research.
- **Where.** v0.2. The spec's "More shapes" refers to free shapes, not to this [R].

### R9. Assets: sanitized images and SVG
- **What.** An `assets/` folder in the project with sanitized SVG and PNG, JPEG or WebP.
  - Names are the content hash and are referenced from the component's appearance: as an icon, as a background or as the full drawing.
  - A free shape "image" is added.
  - Import goes through the local program, and everything is validated again when the project opens.
- **Why.** The user asked for it, and the spec already promises an icon in the look of each shape, although no task schedules it [R]. Putting the images in base64 inside the JSON would break the diffs.
- **Risks.**
  - Security (section 8).
  - The CLAUDE.md rule on file types and `isProjectPath` [R]: it needs an ADR.
  - Binaries do not diff, but the hash makes clear what changed.
  - Performance: one texture per component, not per element, with a limit of 4096×4096 [P].
  - Pixi's SVG parser only understands path, circle, rect, ellipse, line, polygon, polyline, g and svg, plus gradients [R]. The rest (text, use, clipPath, filter) has to be flattened on import or rasterized.
- **Technology.**
  - DOMPurify 3.4.17, license (MPL-2.0 OR Apache-2.0), which in Node runs through isomorphic-dompurify 4.6.0 (MIT) [P].
  - SVGO 4.1.0 (MIT) [P].
  - PixiJS `loadSvg`, as a texture or as a `GraphicsContext` [R].
- **Where.** v0.2. If the icon is wanted in v0.1, the assets ADR is needed first.

### R10. SVG with named parts turned into anchored shapes
- **What.** Import an SVG, for example an atlas plate, whose `id`s are mapped to elements with a crosswalk table.
  - Each part becomes an anchored shape with its own contour (R8), inside a "plate" container.
  - `id`s with no match are reported, just as Claude asks about log lines that find no match.
  - HRA's crosswalk maps the `id` of individual SVG elements, together with the `g` that contains them [C]. Allen and EBI already bring IDs in their SVGs [C][V].
- **Why.** It turns illustrations that already exist into shapes anchored to the model. It is HRA's pattern.
- **Risks.**
  - A single HRA nephron has 9,016 paths [P]: it has to be simplified and cached.
  - `<use>` has to be resolved on import [R].
  - Licenses: CC BY requires attribution.
- **Technology.** The same as R9, plus a CSV reader.
- **Where.** v0.2, after R8 and R9.

### R11. Declarative semantic zoom
- **What.** The appearance declares, as data, what is shown according to the on-screen scale, in the style of `step` and `interpolate` over `['zoom']` in MapLibre [P]. For example:
  - below 0.3: only silhouette and color;
  - between 0.3 and 0.9: the name;
  - from 0.9: attributes and inner parts.
  It links with the abstraction level of M3: zooming far into a container can expand it, along the lines of Pad's semantic zoom [C].
- **Why.** The body does not fit in a single level of detail. Declaring it as data keeps it within ADR-0012, with no code.
- **Risks.** Flicker at the edges of each range, which is avoided with hysteresis. Coexistence with the renderer's fixed thresholds and with its label budget per frame [R].
- **Technology.** A small evaluator of our own. PixiJS BitmapText with MSDF fonts, which supports tens of thousands of texts [P].
- **Where.** v0.2.

### R12. Overlays by attribute with a legend
- **What.** A view maps an attribute to color, size, badge or opacity, with discrete, continuous or passthrough mapping, like Cytoscape [V]. The legend is generated automatically, like Structurizr's key and the legends of Archi 5.8 [P]. The rules can react to the selection, like Sigma's `whenState` [V].
- **Why.** It answers questions without creating new views, such as "which organs does this condition affect". It is what IcePanel's tags and Cloudcraft's overlays do.
- **Risks.** Color discriminability and contrast. It has to be stored in the view, which changes the schema.
- **Technology.** Nothing new is needed.
- **Where.** v0.2.

### R13. External identifiers and crosswalks
- **What.**
  - Today: a convention of `string` attributes (`fma`, `uberon`, `ta2`).
  - In v0.2: a map of external identifiers on elements, components and relation types, search by ID, and crosswalk tables for the importers.
  - glTF does not guarantee unique names [P], so node names do not work as IDs.
- **Why.** Claude and the importers resolve "mitral valve" without ambiguity: `UBERON:0002135` in HRA's crosswalk [V].
- **Risks.** Low.
- **Technology.** Nothing new is needed.
- **Where.** Today as a convention; the field, in v0.2.

### R14. Table component
- **What.** A container layout mode as "list or table".
  - The container draws as rows what it contains through a nesting relation type, for example the columns of a database table.
  - Cells come from attributes: name, type, PK, FK.
  - Each row is an element, so a "references" relation ends exactly on the row. This is what D2 does with `sql_table` [V].
  - Later, a matrix view of the model, like SysML v2's `asElementTable` [V].
- **Why.** The user asked for it, and data modeling needs relations that point to a row. It fits the model without inventing a special shape type.
- **Risks.** Ports per row in ELK. Aggregated relations when the table is collapsed. Many rows, which is what BitmapText is for.
- **Technology.** @pixi/layout 3.2.1 (MIT, on top of Yoga) [P], or a row layout of our own.
- **Where.** v0.2.

### R15. Component editor in the app
- **What.** An interface to create and derive components and relation types, with a live preview:
  - name and the component it derives from;
  - attributes with type and default value;
  - appearance: shape or contour, image, colors, connection points and zoom rules.
  It sends `define-component` and `define-relation-type`, which the core already has and the app does not use [R]. It also checks the notation: two components that look the same, or insufficient contrast [P].
- **Why.** The user asked for it, and ADR-0002 promises declarative components "creatable from the canvas" [R].
- **Risks.** Editing a component affects all its elements, so it needs a preview of the impact.
- **Technology.** React and PixiJS.
- **Where.** v0.2. It requires taking "Created from the canvas" out of Later [R].

### R16. Static HTML as a drawing
- **What.** HTML is imported this way:
  1. It is sanitized in the local program: without `script`, `iframe`, `object`, `embed`, `form` or `link`, and without external URLs.
  2. It is converted to vector SVG with satori.
  3. It follows the same pipeline as the SVG in R9.
  If it uses CSS that satori does not support, it is rasterized via `foreignObject`.
- **Why.** The user asked for it. This way it comes in without anything running (ADR-0012) and is drawn on the GPU (ADR-0014).
- **Risks.**
  - satori supports a subset: Flexbox, Grid and block; it fails with subgrid, does not support masonry, and needs the fonts [P].
  - Raw HTML has to be parsed first; satori-html was last published in 2022 [P].
  - satori weighs about 675 KB gzip, so it runs on the server [P].
- **Technology.**
  - satori 0.63.2 (MPL-2.0) and parse5 8.0.1 (MIT) [P].
  - DOMPurify.
  - html-to-image 1.11.13 or modern-screenshot 4.7.0, both MIT, as plan B [P].
- **Where.** v0.2.

### R17. Tours and animated camera
- **What.** The tours that v0.2 already foresees [R]: each step is a view state with its explanation, and it can play a scenario.
  - The camera flies between states along the optimal path of van Wijk and Nuij (MapLibre's 1.42 curve) [P] and respects reduced motion [R].
  - Transitions go in simple stages [P].
- **Why.** Explaining the body step by step. Also, having Claude write them attacks the authoring cost that held Distill back.
- **Risks.** A tour's state will have to include the physical space camera.
- **Technology.** Nothing new is needed.
- **Where.** v0.2.

### R18. Curved routes
- **What.** Per relation type, an orthogonal or curved route style: Bézier through ELK's bend points, or a smoothing of our own.
- **Why.** Nerves and vessels follow curves.
- **Risks.** I did not verify that ELK routes splines. Selection today measures distance to segments [R].
- **Technology.** The Bézier curves of PixiJS Graphics [R].
- **Where.** v0.2.

### R19. Export SVG and PNG
- **What.** Vector output with `graphicsContextToSvg`, which exists since PixiJS 8.18 [V]. It does not export textures [P], so images are rasterized. The PNG comes from the renderer.
- **Where.** After v0.1 [R].

### R20. Physical space inside components
- **What.** A component's appearance can be a physical space drawing: a glTF 2.0 GLB.
  - On the canvas it shows as a cached image of the model.
  - When the shape is in focus or expanded, it is drawn in live 3D inside its shape: rotate, hide, dim, isolate, cutting plane, exploded view and labels.
  - Each part of the drawing is mapped to an element by crosswalk.
  - This also covers the "free 3D polygons" as the component's shape (option D of section 7).
- **Why.** ADR-0003 already allows it. It is the basis of case 5 (robotic arm) and of anatomy.
- **Risks.**
  - Browsers keep about 8 WebGL contexts [P], so never one canvas per element. There are two documented ways:
    - share Pixi's WebGL context with three.js, following the official guide: WebGL only, with `resetState()` on every change and no shared textures [P];
    - a single three.js renderer with a screen clip (scissor and viewport) per visible component [P].
  - WebGPU still has limited availability [C], so WebGL 2 is the baseline. Pixi already prioritizes WebGL [V], and three's WebGPURenderer falls back to WebGL 2 on its own [V].
  - three weighs about 185 KB gzip in the WebGL entry [P] and has to be loaded on demand.
- **Technology.**
  - three 0.186.1 (r186, MIT) [V].
  - three-mesh-bvh 0.9.16 (MIT) to select parts [V].
  - meshoptimizer 1.3.0 (MIT), whose decoder weighs about 7.7 KB gzip [V][P].
  - @gltf-transform/core and cli 4.5.1 (MIT), in the local program [V].
  - For labels: three-msdf-text-utils 1.5.0 (ISC), which works in WebGL and WebGPU [V], or project anchors to 2D and use BitmapText.
  - Cutting planes with the cut surface filled, following the three.js stencil example [P].
  - urdf-loader 0.13.1 (Apache-2.0) for robotic arms [P].
- **Avoid.**
  - Babylon.js, which weighs about 1.8 MB gzip [P].
  - @google/model-viewer 4.4.0, because it asks for three ^0.183.0 and would bring in a second copy [P].
  - troika-three-text under WebGPU [P].
  - @three.ez/instanced-mesh, which in practice only works with WebGL [C].
- **Where.** After v0.1 (case 5) [R].

### R21. Linked physical space panel
- **What.** Open a component with physical space in a panel next to the canvas, at full size. Selection, focus, filters and scenario playback are mirrored on both sides through the identity of each element. The outline covers it too.
- **Why.** It is the strongest result of the research: linked 2D and 3D (section 7).
- **Risks.** ADR-0003 has to change. On the canvas, ADR-0007 draws one copy per container; in physical space, the element occupies a single place. Accessibility and the cost of two renderers also have to be resolved.
- **Technology.** The same as R20.
- **Where.** After R20, with ADR-0021 (draft in section 7).

### R22. Programmable components
- **What.** ADR-0012 as written: the code runs in QuickJS inside a Worker, with approved capabilities, and returns what to draw.
  - That "what to draw" should be the same format as the declarative appearance (R8, R9, R11), plus mesh buffers for physical space.
  - This way, code and declarative appearance share a single renderer, and the code never touches the DOM.
- **Why.** The simulate interaction and the functions in code that the user asked for.
- **Risks.** Interpreted code is slower (ADR-0012 says so [R]). Also, the experience of approving capabilities has to be clear.
- **Technology.** quickjs-emscripten 0.32.0 (MIT) [P].
- **Where.** After v0.1 (case 4) [R].

### R23. Anatomy package and ontology import
- **What.** A "Human anatomy" package (section 6) and importers for:
  - an ontology subset (OBO or OWL, or via OLS4);
  - crosswalk tables;
  - BodyParts3D or HRA meshes;
  - EBI or HRA SVG.
  Each package carries its attribution metadata.
- **Why.** It is the user's example, and it is the best demonstration of "anything complex".
- **Risks.** Licenses (section 6) and scale.
- **Technology.** glTF-Transform, DOMPurify, SVGO and CSV.
- **Where.** After R8 to R13. Physical space, after R20.

### R24. Live HTML in a single isolated iframe
- **What.** Only if it is ever needed: a single iframe over the element in focus.
  - With `sandbox="allow-scripts"` and without `allow-same-origin`.
  - With `srcdoc` and a meta CSP `default-src 'none'`.
  - With content from an approved package and no network.
- **Why.** Interactive widgets or notebooks.
- **Risks.** It clashes with "never store code that runs" and with ADR-0012's rejection of iframes [R]. The local program rejects `Origin: null` [R], so the iframe could not talk to it, which in this case is good.
- **Where.** Only with a new ADR. I prefer programmable components.

### What not to do
- **A 2D/3D toggle per view:** ADR-0003 rejected it, the evidence goes against it and it is the most expensive (section 7).
- **An iframe per element:** ADR-0005 and ADR-0012 reject it [R].
- **Saving HTML with scripts or glTF with `KHR_interactivity` in the project.**
- **Using tldraw as the base:** it requires a license key in production [V].
- **Adopting HTML-in-Canvas now:** it is only behind Chromium flags and the API keeps changing [C].
- **Requiring WebGPU** [C].
- **Using Draco by default:** its decoder weighs about 100 KB gzip and only pays off with geometry of more than 1 MB [P]; meshopt is enough.

---

## 6. The human body, end to end

### 6.1 The scale
- **Terms in ontologies** [V]: FMA 5.1.0 has 104,721; Uberon (version of 2026-10-01), 26,735; Cell Ontology, 19,167.
- **HRA v2.5** has 36 ASCT+B tables with 4,807 structures, 2,215 cell types and 1,347 biomarkers, and 81 3D objects with 1,392 structures [C].
- **BodyParts3D geometry**, male version: 2,234 structures and 2,288,268 triangles, about 34 MB, according to the Human-Atlas project [V].
- **A single HRA heart** has 164,119 triangles in 14 meshes, uncompressed [P].
- **No view shows the whole body.** Containers have to be left collapsed by default, with aggregated relations, and the work has to start from a subset: for example, the cardiovascular system plus the thorax, a few hundred elements.

### 6.2 The model
Almost all of this already fits today's format [R]. This is an example of a project's own package; a built-in package would be in English:

```json
{
  "id": "anatomia",
  "name": "Anatomía humana",
  "components": [
    { "id": "anatomia.estructura", "name": "Estructura anatómica", "derivesFrom": "essence",
      "attributes": [
        { "name": "fma", "type": "string", "description": "ID de FMA, como FMA:7264" },
        { "name": "uberon", "type": "string", "description": "ID de Uberon, como UBERON:0002135" },
        { "name": "nombreLatino", "type": "string" },
        { "name": "lateralidad", "type": "string", "default": "media" }
      ] },
    { "id": "anatomia.organo", "name": "Órgano", "derivesFrom": "anatomia.estructura" },
    { "id": "anatomia.arteria", "name": "Arteria", "derivesFrom": "anatomia.estructura" },
    { "id": "anatomia.nervio", "name": "Nervio", "derivesFrom": "anatomia.estructura" },
    { "id": "anatomia.region", "name": "Región", "derivesFrom": "essence" },
    { "id": "anatomia.sistema", "name": "Sistema", "derivesFrom": "essence" }
  ],
  "relationTypes": [
    { "id": "anatomia.parte-regional", "name": "es parte regional de", "derivesFrom": "relates-to",
      "direction": "directed", "nests": true },
    { "id": "anatomia.parte-sistemica", "name": "es parte sistémica de", "derivesFrom": "relates-to",
      "direction": "directed", "nests": true },
    { "id": "anatomia.irriga", "name": "irriga", "derivesFrom": "relates-to", "direction": "directed",
      "limits": { "from": ["anatomia.arteria"] } },
    { "id": "anatomia.inerva", "name": "inerva", "derivesFrom": "relates-to", "direction": "directed",
      "limits": { "from": ["anatomia.nervio"] } },
    { "id": "anatomia.fluye-hacia", "name": "fluye hacia", "derivesFrom": "relates-to", "direction": "directed" },
    { "id": "anatomia.regula", "name": "regula", "derivesFrom": "relates-to", "direction": "directed" }
  ]
}
```

- **Components.** The taxonomy is turned into components only where inheritance is simple; for example, Bone → Long bone. The rest of the taxonomy stays as an attribute. Components are missing for spaces and surfaces, which FMA treats as non-material entities [P]. Examples: a cavity, or the reference point where a muscle inserts.
- **Overlapping containment.** The heart "is a regional part of" the mediastinum and "is a systemic part of" the cardiovascular system. The "Regions" view nests by the first type and the "Systems" view by the second. A view that uses both shows a copy of the heart in each container, and selecting one selects both (ADR-0007 and the spec [R]).
- **Relations that are not containment:**
  - supplies blood to;
  - drains into;
  - innervates;
  - originates at and inserts into (toward a reference point);
  - articulates with (undirected);
  - flows to.
  Limits only warn [R].
- **Relations on relations.** "Mitral valve regulates [left atrium flows to left ventricle]". Or "Infarction interrupts [coronary artery supplies blood to anterior wall]". No tool reviewed can express this.
- **Identifiers.** `fma` and `uberon` attributes today (R13), and crosswalks for meshes and SVG.

### 6.3 2D views on the canvas
- **"Systems"**, with the functional organization perspective. If the nervous system is collapsed, an aggregated relation "innervates ×N" toward the muscular system is shown.
- **"Regions"**, with the topographic perspective.
- **"Blood supply" and "Innervation"**, filtered by relation type, with focus by degrees to follow a branch (R2).
- **"Heart plate"**: an SVG with named parts (R10), free contours (R8) and flow along curves (R18).
- **Overlays (R12)**, for example coloring by what a condition affects, with a generated legend.
- **Semantic zoom (R11)**: from far away, the heart is a silhouette; closer, it shows cavities and valves; up close, the attributes too.

### 6.4 Physical space
- **The component.** "Human body" has as its drawing a GLB built with glTF-Transform in the local program, from the BodyParts3D OBJ files or the HRA GLB files, with its crosswalk from nodes to elements (R20).
- **Composite parts.** Composite organs have no mesh of their own: they are drawn as the union of their parts, as in BodyParts3D [C]. Hiding a container hides everything it contains, as `KHR_node_visibility` does in glTF [P].
- **Interactions inside the drawing:**
  - rotate and zoom in;
  - hide, dim or X-ray view, isolate;
  - peel layers, as a filter by a "layer" attribute with a slider;
  - cutting plane;
  - exploded view;
  - labels anchored to a point on the surface.
- **Performance.** Geometry batched with each part's state in textures, as Human-Atlas does [V]; selection with BVH; simplification with meshoptimizer; draw only when something changes.
- **Linked panel (R21).** Touching the heart mesh selects the "Heart" element in all its 2D copies and in the outline. 2D focus dims the unrelated meshes in the panel.

### 6.5 Scenarios
- **"Circulation".** Steps over "flows to" relations: right atrium → right ventricle → pulmonary trunk → lungs → pulmonary veins → left atrium → left ventricle → aorta.
  - Systole can be a step with two relations at once (right ventricle → pulmonary trunk and left ventricle → aorta), which the spec allows [R].
  - Each step carries input and output data in JSON, such as oxygen saturation before and after the lungs.
  - With the heart collapsed, the internal steps are played as an aggregated step.
  - A shunt, an alternative path, goes as another scenario.
  - If a relation is deleted, its step is marked as broken.
- **"Patellar reflex arc".** Receptor → afferent pathway → spinal cord → efferent pathway → quadriceps.
- **Tours (v0.2).** Sequences that play these scenarios.
- **Claude through MCP.** It builds the subset from the ontology and asks about whatever it cannot match; proposes views; writes scenarios and tours; guides live (M4 and M5).

### 6.6 Open data and their licenses
This is not legal advice. For packages that will be distributed, the practical choice is CC BY, CC0, public domain or BSD, with attribution inside the package. Avoid NC and anything without a license. CC BY-SA works only if it is acceptable for derived data to stay under that license; the FSF considers CC BY-SA 4.0 one-way compatible with GPLv3 [P].

| Source | What it provides | Exact license | Obligations and notes |
|---|---|---|---|
| BodyParts3D 4.0 (DBCLS) | OBJ meshes per part, FMA IDs, IS-A and PART-OF trees | CC BY 4.0; the license page was updated on 2025-02-27 [C] | Literal attribution: "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International" [V]. The OBJ files still say CC BY-SA 2.1 JP in their header: keep a dated copy of the license page [C] |
| Human Reference Atlas (HuBMAP) | GLB per organ with crosswalk, SVG of functional units (FTU) with crosswalk, ASCT+B tables; v2.5 current | Data CC BY 4.0, code MIT [V] | Attribution. The brain, derived from Allen, has contradictory license statements: verify it or exclude it [P] |
| FMA 5.1.0 | Ontology with about 75,000 classes and more than 168 relation types | CC BY 4.0 according to its repository [C] | OBO Foundry marks it inactive and with a "CUSTOM" license; Bioregistry marks it obsolete [C] |
| Uberon | Cross-species ontology | CC BY 3.0 Unported [V] | Attribution |
| Cell Ontology | Cell types | CC BY 4.0 [C] | Attribution |
| EBI anatomograms | 2D SVG with ontology IDs | Images CC BY 4.0, code Apache-2.0 [V] | Attribution. Keep the internal `<use>` references |
| Servier Medical Art | More than 3,000 illustrations | CC BY 4.0 [V] | Attribution. No ontology IDs |
| Visible Human Project (NLM) | CT, MRI and slices of a man and a woman | "As of 2019, a license is no longer required" [V] | They are raw images: they have to be segmented |
| Open Anatomy | Atlases, for example the SPL/NAC brain | 3D Slicer License, section B (BSD-style) [C] | OABrowser declares MIT in `package.json` [C] |
| Z-Anatomy | Full-body models derived from BodyParts3D | CC BY-SA 4.0; the Blender add-ons are GPL-3.0 [C] | Inner ear CC BY-NC-SA 4.0, kidney CC BY-NC 4.0, and unlicensed pieces [C]: do not include it whole |
| AnatomyTOOL Open 3D Model | Educational submodels | CC BY-SA [NV] | The site did not respond |
| Allen CCF and its ontology | Mouse brain | Allen Terms of Use: noncommercial use; commercial redistribution requires permission [V] | Do not include it in a built-in package |
| TotalSegmentator | CT and MR segmentation | Code Apache-2.0; some subtasks are noncommercial only [P] | Check each model |
| TA2 (Terminologia Anatomica 2) | Official names | No license found [NV] | Link through Wikidata (property P7173) instead of copying the terms [P] |
| Sketchfab | Various models | Each model has its own [V] | KitBash bought the platform (announced 2026-08-10) [P] |

---

## 7. 3D: options against ADR-0003

### 7.1 What the evidence says
- **In favor of 3D when shape is the data.**
  - St. John et al. (2001): 3D makes it easier to understand shapes and harder to judge relative positions [P].
  - In anatomy learning, a meta-analysis found d = 0.50 in spatial knowledge [P]. Stereo helps only if the 3D is interactive (ES 0.53) [P], and the result depends on each person's spatial ability [P].
  - In graphs, Ware and Mitchell found that with stereo and motion, on very high-resolution displays, paths in graphs of up to 1,000 nodes are followed with less than 10% error [P].
- **Against, for abstract networks, text and precise comparisons.**
  - Munzner: "No unjustified 3D". Depth performs worse than length, angle and area, and tilted text cannot be read [P].
  - Cockburn and McKenzie (2002): performance worsens as freedom in the third dimension increases [P].
  - The evidence does not cover our scale: graphs with a median of 120 nodes and a maximum of 7,885 [P].
- **What works best: linked 2D and 3D.**
  - Tory et al. (2006): combined displays had "as good or better performance", inspired more confidence and allowed integrated navigation; 3D alone is no good for precise positioning [C: only the abstract was verified].
  - According to the full text that the research read, cutting planes seen one at a time worked poorly [P, no second pass].
  - Roberts et al. (2021): "3D visualisations should not be used alone" [P].
  - This is how Neuroglancer, 3D Slicer, Open Anatomy Browser and the commercial atlases work [V].
  - No architecture tool that starts from the model draws relation-heavy views in 3D; Cloudcraft switches projection only for infrastructure [V].

### 7.2 Options

| Option | What it is | In favor | Against | Cost | Does it change ADRs? |
|---|---|---|---|---|---|
| A. 3D only inside components | ADR-0003 as written (R20) | Changes no decisions; the canvas stays readable; fits the performance budget | The drawing stays small; a 2D view cannot be read next to its physical arrangement | XL | No |
| B. Linked physical space panel | A, plus a panel beside the canvas with shared selection, focus and scenarios (R21) | It is what the evidence best supports; the model makes the link possible | Second renderer; ADR-0007 in physical space; accessibility | XL on top of A | Yes: replaces ADR-0003 |
| C. 2D/3D toggle per view | What the user literally asked for | A single surface | It needs a 3D layout (ELK is 2D [R]), routes, text and selection in 3D for everything, and a second set of interactions; saved positions are 2D [R]; it shows only one representation at a time | Several XL | Yes, and it contradicts the explicit rejection in ADR-0003 |
| D1. Free 3D polygons as the component's shape | A mesh as the look of a component on the canvas, drawn as a cached image and live only in focus | It answers "free 3D polygons" within ADR-0003 | Several thousand live meshes do not fit in the budget, so they go as images | Included in A | No |
| D2. Pseudo-3D look | Extrusion or isometry of 2D contours drawn in Pixi, like D2's `3d` style or Cloudcraft | Cheap; needs no new engine | It is cosmetic: it adds no information | S–M | No |

**Recommendation.** First R8, free 2D geometry, which solves the "not only boxes" request. After v0.1, A with D1 as the basis of case 5. Then B, with the ADR below. D2 only if it is of interest as a style. Not C.

### 7.3 Draft of ADR-0021 (needs the user's agreement; nothing is implemented before)
I write it in English because the repo is in English. If it is accepted:
- `status` becomes `accepted`;
- ADR-0003 becomes `status: superseded by ADR-0021`;
- the `CONTEXT.md` entries below are updated.

```markdown
---
status: proposed
supersedes: ADR-0003
---

# 2D canvas; physical space inside components and in a linked panel

The canvas stays two-dimensional, with abstraction levels. Physical space is drawn by the components that need it, such as a human body, a brain or a robotic arm: inside their shapes on the canvas and, when someone opens one, at full size in a physical-space panel beside the canvas. The panel and the canvas share the selection, focus, filters and scenario playback through element identity, so selecting a part in either selects the same element in both and in the outline. A view never switches between 2D and 3D. We chose this because text and relations read worse in 3D while shape and physical arrangement read better in it, because studies and practice (radiology, CAD, Neuroglancer, 3D Slicer) show that linked 2D and 3D displays do as well as or better than either one alone, and because a physical arrangement drawn only inside a shape is too small to explore.

This decision is complemented by: a physical-space drawing is either a declarative asset, a self-contained glTF 2.0 binary with no external references and no behavior extensions such as KHR_interactivity, or what programmable code returns (ADR-0012); each part of a drawing maps to an element through a crosswalk kept with the component, because glTF does not guarantee unique node names; positions in physical space come from the drawing, are not stored in view files and are not computed by ELK; the 3D engine loads only when a project uses physical space, and drawings out of focus are shown as cached images so the 60 fps budget holds.

## Considered options

- **Physical space only inside components** (ADR-0003): superseded. Keeps one surface, but a body or a brain drawn inside a shape is too small to explore, and a 2D view and its physical arrangement cannot be read side by side.
- **Fully 3D canvas**: rejected. Makes every view harder to read to benefit a few.
- **2D/3D toggle per view**: rejected. Doubles the rendering engine and interaction, needs a 3D layout and 3D routes for relations, and shows only one representation at a time.
- **Physical space in a separate window or app**: rejected. Loses the shared selection and the single undo history.

## Consequences

The app gains a second renderer (three.js) next to PixiJS, and the local program gains a glTF import path that strips external references and behavior. An element with several containers has one place in physical space: in the panel its containers act as groups that can be shown, faded or isolated, not as copies, while the canvas keeps one copy per container (ADR-0007). Keyboard navigation and the outline must reach the panel. CONTEXT.md changes the definition of physical space and defines the physical-space panel.
```

Proposed entries for `CONTEXT.md`:

```markdown
**Physical space**:
The real three-dimensional arrangement of something: a robotic arm, a brain region. It is drawn inside the components that need it and, at full size, in the physical-space panel; never on the canvas itself.
_Avoid_: 3D (as a generic synonym)

**Physical-space panel**:
A panel beside the canvas that shows the physical space of one element at full size and shares the selection, focus, filters and scenario playback with the canvas.
_Avoid_: 3D view, 3D mode
```

---

## 8. HTML and SVG: safe import

### 8.1 Principle
What is imported is data and is never executed. It is sanitized once in the local program, only the clean result is stored, and it is validated again when the project opens, because files can change from outside, for example with a `git pull` (CLAUDE.md requires validating on open [R]). Nothing from the model or from imports goes through `innerHTML` or `dangerouslySetInnerHTML`: draw.io's CVE-2026-46642 shows that a single unsanitized path is enough [P].

### 8.2 SVG
1. **Receive the file in the local program**, never in the browser straight into the project.
2. **Run it through DOMPurify with `USE_PROFILES: { svg: true, svgFilters: true }`.** By default it removes `script`, `use`, `foreignObject`, `animate` and `set`, and event handlers [P].
3. **Add hooks, because by default DOMPurify keeps** `image`, `style`, `a`, `pattern`, `filter` and `feImage`, http(s) URLs and CSS [P]. The hooks have to:
   - remove every `href` or `xlink:href` that is not a `#fragment`;
   - remove `url(...)` except `url(#id)`, and remove `@import`;
   - remove `<a>`;
   - allow `<use>` only with a fragment, because anatomograms use it [V];
   - accept embedded images only as `data:` PNG, JPEG or WebP.
   This meets ADR-0012's "stripped of scripts and external references" [R].
4. **Optimize with SVGO 4.1.0.** Its `removeScripts` plugin also removes handlers and script URIs; in version 4, `viewBox` and `title` are no longer removed by default [P]. SVGO goes after DOMPurify, not in its place, because it is an optimizer and not a sanitizer [P].
5. **Normalize for the canvas.** `<use>` becomes copies; text becomes paths or separate labels; the `id`s are kept for the crosswalk. Pixi's parser understands path, circle, rect, ellipse, line, polygon, polyline, g and svg, and warns on any other element [R]. If the drawing does not fit that, it goes as a texture of up to 4096 px [P].
6. **Store** in `assets/` with the hash as the name, recording the origin and the license.
7. **On open**, sanitize again. If the result differs from the file, reject it and warn.
8. **Serve it** with `Content-Type: image/svg+xml` and `nosniff`, which the server already sends [R]. I propose adding a strict CSP on those responses and `Cross-Origin-Resource-Policy: same-origin`. Today the only CSP directive is `frame-ancestors 'none'` [R].
9. **Extra defense.** When an SVG is used as an image (`img`, CSS background or `drawImage` onto a canvas), browsers disable scripts and the loading of external resources. MDN says that "may apply" in some browsers, so it is one more layer and not the only one [P].

### 8.3 HTML, by levels

| Level | What it is | How it comes in | What runs | ADR |
|---|---|---|---|---|
| 1. Text with limited formatting | Labels and descriptions | Limited Markdown, drawn with BitmapText; HTML only for editing (ADR-0014) | Nothing | None |
| 2. Static HTML as a drawing | A page or a fragment without scripts | DOMPurify, then satori to SVG or rasterized, then the SVG pipeline (R16) | Nothing | None; needs the assets ADR |
| 3. Live HTML | A widget with scripts, a notebook, a map | A single isolated iframe over the element in focus (R24) | The package's JS, in an opaque origin and without network | New ADR: contradicts ADR-0012 and "never store code that runs" |

The references for these levels:
- Mermaid's `securityLevel`: `strict` encodes the HTML, `antiscript` only removes the scripts and `sandbox` uses an isolated iframe [P].
- D2 0.9.0 stopped drawing Markdown with `foreignObject` and moved to native SVG [V].
- HTML-in-Canvas, later and only if the browser supports it. Today it is behind Chromium flags, its API was renamed and it does not paint cross-origin iframes, so it would not work for untrusted HTML either [C].

### 8.4 glTF and images
- **glTF.** glTF-Transform in the local program [V] builds a self-contained GLB:
  - without external URIs;
  - without `KHR_interactivity`, which is a ratified extension that stores behavior inside the file [V];
  - with meshopt compression [V];
  - with a crosswalk from nodes to elements.
  OBJ, STL and PLY are converted to glTF on import.
- **Images.** Validate the type by content, not by extension. I also propose re-encoding them to remove metadata.

### 8.5 Relation to ADR-0012
- **Declarative drawings.** Sanitized SVG, HTML converted to SVG, images and glTF without behavior meet "declarative components are data only and their drawing is stripped of scripts and external references" [R].
- **Functions in code.** They run only in the WebAssembly interpreter inside a Worker, with approved capabilities, and "computes and returns what to draw" [R].
- **HTML with scripts.** It is neither one thing nor the other. It cannot run in the interpreter, because there is no DOM, and an iframe per element was already rejected [R]. So it would need an ADR of its own.
- **What is never executed:** anything imported. No scripts, no handlers, no CSS that loads resources, no glTF behavior.
- **What is executed, after v0.1:** the code of programmable components, only in QuickJS.

---

## 9. Changes that need the user's agreement

1. **ADR-0021, which replaces ADR-0003** (draft in section 7.3). It implies marking ADR-0003 as superseded, redefining *Physical space* and adding *Physical-space panel* to `CONTEXT.md`. In the spec, physical space stays in Later (case 5).
2. **New ADR, "Project assets".**
   - What it adds: an `assets/` folder with sanitized SVG, PNG, JPEG, WebP and GLB, named by hash, referenced by id from the JSON and validated on open. The local program serves them with strict headers.
   - What it changes: the CLAUDE.md rule "Project files are JSON with the extensions…" and the server's `isProjectPath` function [R].
3. **File format version 2**, which extends ADR-0019 or goes in a new ADR. It adds to the appearance:
   - contour;
   - connection points (M3);
   - image;
   - stacking order in positions and free shapes;
   - color with alpha;
   - theme;
   - semantic zoom rules;
   - external identifiers;
   - license and attribution metadata in packages.
   Today `schemaVersion` is 1 [R], and ADR-0018 says v0.1 has no versions or migrations [R], so the migration has to be defined.
4. **New ADR, "Imported HTML".** Static HTML is a drawing and HTML with scripts is not imported. If live HTML is ever wanted, another ADR is needed that revisits the rejection of iframes in ADR-0012 and ADR-0005.
5. **Spec v0.1:**
   - decide whether the context menu, stacking order, dropping into a container and the grid go into M3 or move to v0.2;
   - decide what happens with the icon that the spec promises and no task schedules [R];
   - confirm that free geometry, assets, the component editor ("Created from the canvas") and "More shapes" leave Later and go to v0.2;
   - create `docs/spec-v0.2.md`, which does not exist today [R].
6. **CONTEXT.md:** new terms, each with its "Avoid" list:
   - *Connection point*: the glossary names it but does not define it [R];
   - *Physical-space panel*;
   - *Asset*;
   - *External identifier* and *Crosswalk*;
   - *Theme*;
   - *Stacking order*;
   - *Attribute overlay*.
   Also, decide whether *semantic zoom* is a product term, since the glossary asks not to say "zoom" when talking about the model [R].
7. **CLAUDE.md:**
   - the files rule, because of the assets;
   - the performance budget, to include physical space: engine loaded on demand and out-of-focus drawings as cached images;
   - a security rule: nothing from the model or from imports goes to `innerHTML` or `dangerouslySetInnerHTML` without passing through the sanitizer.
8. **ADR-0014, dated clarification** (like the one ADR-0019 received [R]): drawing an imported SVG as GPU geometry or as a texture does not contradict the rejection of SVG as the render engine, and the HTML layer remains only for editing text.
9. **ADR-0015, clarification:** ELK receives the box and the ports of shapes with free geometry, and the physical space panel does not use ELK.
10. **Data license policy** for built-in packages, as an ADR or a document: only CC BY, CC0, public domain or BSD; nothing NC or unlicensed; attribution inside the package.

---

## 10. Sources

Sections 1, 3, 4 and 9 summarize sources that already appear below.

**Repository** (branch `m2-fixes`, commit `e983c0b`; read on 2026-10-24)
- `CLAUDE.md`, `CONTEXT.md`, `docs/spec-v0.1.md`
- `docs/adr/0001`, `0002`, `0003`, `0005`, `0007`, `0009`, `0010`, `0012`, `0014`, `0015`, `0018`, `0019`
- `packages/schema/src/files.ts`, `packages/core/src/commands/types.ts`, `packages/core/src/builtin/systems.ts`
- `packages/app/src/canvas/renderer.ts`, `palette.ts`, `hit.ts`, `route.ts`, `camera.ts`, and `packages/app/src/color.ts`
- `packages/server/src/responses.ts`, `security.ts`, `layout.ts`
- `node_modules/.pnpm/pixi.js@8.22.0/.../svg/SVGParser.mjs`, `SVGExporter.mjs`, `events/EventBoundary.mjs`
- Git history: `001be51`, `f9690b2`, `03ed1d9`, `ea4e6fa`, `e983c0b`

**Section 2.1, diagramming**
- https://raw.githubusercontent.com/jgraph/drawio/dev/README.md · https://raw.githubusercontent.com/jgraph/drawio/dev/VERSION · https://github.com/jgraph/drawio/releases
- https://www.drawio.com/docs/manual/shapes/shape-complex-create-edit/ · https://www.drawio.com/docs/manual/styles/svg-edit-colours/ · https://www.drawio.com/docs/manual/styles/svg-css-variables/ · https://www.drawio.com/docs/manual/advanced/placeholder-scope/ · https://www.drawio.com/docs/manual/layers/how-layers-work/ · https://www.drawio.com/docs/manual/import/ · https://www.drawio.com/docs/reference/plugins/
- https://github.com/jgraph/drawio-mcp · https://github.com/jgraph/drawio/security/advisories/GHSA-fqhg-287p-c6vf · https://github.com/jgraph/drawio/issues/1562 · https://github.com/maxGraph/maxGraph · https://github.com/jgraph/mxgraph
- https://lucid.readme.io/docs/geometry.md · https://lucid.readme.io/docs/custom-shapes-path.md · https://lucid.readme.io/docs/custom-shapes-boolean-operation.md · https://lucid.readme.io/docs/shape-data-properties.md
- https://learn.microsoft.com/en-us/office/client-developer/visio/geometry-section · https://learn.microsoft.com/en-us/office/vba/api/visio.shape.memberofcontainers · https://support.microsoft.com/en-US/Visio/use-layers-to-set-properties-for-multiple-shapes · https://support.microsoft.com/en-us/visio/limitations-to-file-editing-in-visio-for-the-web · https://support.microsoft.com/en-us/visio/isometric-drawings · https://support.microsoft.com/en-us/office/get-creative-with-3d-models-ec5feb79-b0af-47f6-a885-151fcc88ac0a · https://www.microsoft.com/en-us/microsoft-365/visio/microsoft-visio-plans-and-pricing-compare-visio-options
- https://help.miro.com/hc/articles/360013588560 · https://help.miro.com/hc/en-us/articles/20352896814866-Custom-Shapes-for-Diagramming · https://developers.miro.com/docs/websdk-reference-shape
- https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/ · https://developers.figma.com/docs/widgets/how-widgets-run/ · https://madebyevan.com/figma/an-update-on-plugin-security/
- https://github.com/excalidraw/excalidraw · https://registry.npmjs.org/@excalidraw/excalidraw/latest · https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/
- https://tldraw.dev/sdk-features/geometry · https://tldraw.dev/sdk-features/bindings · https://tldraw.dev/sdk-features/performance · https://tldraw.dev/sdk-features/embed-shape · https://tldraw.dev/sdk-features/license-key · https://tldraw.dev/blog/20-things-i-wish-ai-chatbots-knew-about-tldraw
- https://whimsical.com/learn/boards/customize-shapes · https://www.omnigroup.com/omnigraffle/features/ · https://www.omnigroup.com/omnigraffle/buy/ · https://www.omnigroup.com/releasenotes/omnigraffle

**Section 2.2, systems modeling**
- https://docs.structurizr.com/ · https://docs.structurizr.com/dsl/language · https://docs.structurizr.com/dsl/implied-relationships · https://docs.structurizr.com/server/diagrams/viewer · https://docs.structurizr.com/dsl/cookbook/perspectives-static/ · https://docs.structurizr.com/ai/mcp
- https://docs.icepanel.io/visual-storytelling/flows · https://docs.icepanel.io/visual-storytelling/perspective-tags · https://docs.icepanel.io/experiments/mcp-server-beta
- https://www.ilograph.com/docs/editing/contexts/ · https://ilograph.com/docs/spec/ · https://ilograph.com/blog/posts/idl-3
- https://likec4.dev/dsl/views/predicates/ · https://likec4.dev/dsl/views/dynamic/ · https://likec4.dev/tooling/mcp/
- https://www.archimatetool.com/?p=2058 · https://sparxsystems.com/products/ea/ · https://sparxsystems.com/enterprise_architect_user_guide/17.2/the_model_repository/shape_scripts.html
- https://docs.nomagic.com/SYSML2P/latest/views-304004791.html · https://docs.nomagic.com/VN/latest/2026x-refresh1-version-news-314179593.html · https://www.3ds.com/products/catia/no-magic/cameo-simulation-toolkit
- https://github.com/Systems-Modeling/SysML-v2-Release · https://raw.githubusercontent.com/Systems-Modeling/SysML-v2-Release/master/sysml.library/Domain%20Libraries/Geometry/ShapeItems.sysml · https://raw.githubusercontent.com/Systems-Modeling/SysML-v2-Release/master/sysml.library/Domain%20Libraries/Geometry/SpatialItems.sysml · https://raw.githubusercontent.com/Systems-Modeling/SysML-v2-Release/master/sysml.library/Systems%20Library/Views.sysml
- https://doc.mbse-syson.org/syson/v2026.9.0/user-manual/features/other-views.html · https://github.com/eclipse-syson/syson
- https://mbse-capella.org/features.html
- https://github.com/terrastruct/d2/releases/tag/v0.9.0 · https://d2lang.com/blog/tala-is-open-source/ · https://d2lang.com/blog/d2-non-profit/ · https://d2lang.com/tour/sql-tables/ · https://d2lang.com/tour/style/
- https://mermaid.js.org/config/schema-docs/config.html · https://mermaid.js.org/syntax/flowchart.html · https://docs.datadoghq.com/datadog_cloudcraft/

**Section 2.3, graphs**
- https://docs.kumu.io/guides/focus · https://docs.kumu.io/guides/showcase
- https://gephi.org/desktop/plugins/force-atlas-3d/ · https://gephi.org/desktop/plugins/network-splitter-3d/
- https://manual.cytoscape.org/en/stable/Rendering_Engine.html · https://manual.cytoscape.org/en/stable/Styles.html · https://cytoscape.org/javadoc/3.9.0/org/cytoscape/group/package-summary.html · https://apps.cytoscape.org/apps/cy3d
- https://blog.js.cytoscape.org/2025/01/13/webgl-preview/ · https://js.cytoscape.org/ · https://unpkg.com/cytoscape-expand-collapse@4.1.1/README.md
- https://yed.yworks.com/support/manual/hierarchy.html · https://neo4j.com/docs/bloom-user-guide/current/bloom-tutorial/slicer/ · https://forum.obsidian.md/t/what-is-the-tech-stack-currently/833 · https://jsoncanvas.org/spec/1.0/
- https://github.com/jacomyal/sigma.js/releases/tag/sigma@4.0.0 · https://www.sigmajs.org/concepts/styles-and-primitives/
- https://github.com/vasturiano/3d-force-graph · https://github.com/vasturiano/react-force-graph · https://doc.linkurious.com/user-manual/latest/nodegrouping/ · https://github.com/cosmograph-org/cosmos
- https://doi.org/10.1109/TVCG.2009.108

**Section 2.4, 3D anatomy**
- https://www.biodigital.com/product/the-biodigital-human · https://www.biodigital.com/customers/for-schools · https://developer.biodigital.com/pages/documentation/2/api/scene.html · https://developer.biodigital.com/pages/documentation/2/ios-sdk-docs/165.5.1/Classes/HKScene.html
- https://www.visiblebody.com/blog/6-tips-to-help-you-become-a-human-anatomy-atlas-super-user · https://apps.apple.com/us/app/complete-anatomy-for-ipad/id1054948424
- https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html · https://www.frontiersin.org/articles/10.3389/fninf.2017.00022/full
- https://brain-map.org/support/tutorials/atlas-drawing-and-ontologies · http://api.brain-map.org/api/v2/svg_download/100960061?groups=28 · https://doi.org/10.1016/j.cell.2020.04.007
- https://github.com/ebi-gene-expression-group/anatomogram/blob/master/src/svg/README.md · https://github.com/slorksmo/Human-Atlas

**Section 2.5, scientific visualization and twins**
- https://github.com/google/neuroglancer · https://github.com/google/neuroglancer/blob/master/src/datasource/precomputed/meshes.md · https://slicer.readthedocs.io/en/latest/user_guide/user_interface.html
- https://molstar.org/ · https://learn.microsoft.com/en-us/azure/digital-twins/concepts-3d-scenes-studio · https://github.com/Azure/opendigitaltwins-dtdl/blob/master/DTDL/v4/DTDL.v4.md
- https://openusd.org/release/intro.html · https://openusd.org/release/glossary.html · https://github.com/PixarAnimationStudios/OpenUSD/releases
- https://github.com/CesiumGS/3d-tiles/blob/main/specification/LICENSE.adoc · https://www.nvidia.com/en-us/omniverse/

**Section 2.6, interactive explanations and research**
- http://www.cs.umd.edu/hcil/pad++/papers/siggraph-93-origpad/siggraph-93-origpad.pdf · http://www.cs.umd.edu/hcil/pad++/license_terms.html
- https://maplibre.org/maplibre-style-spec/expressions/ · https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/FlyToOptions/ · https://www.win.tue.nl/~vanwijk/zoompan.pdf
- https://webspace.science.uu.nl/~telea001/uploads/VACourse/Shneiderman96.pdf · https://cspages.ucalgary.ca/~saul/581/exer.eps/4furnas86.pdf · https://courses.ischool.berkeley.edu/i247/f05/readings/Baldonado_MultipleViews_AVI00.pdf · https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf
- https://doi.org/10.1109/TSE.2009.67 · https://arxiv.org/pdf/2304.08654
- http://worrydream.com/Tangle/ · https://github.com/ncase/loopy · https://github.com/idyll-lang/idyll · https://distill.pub/2021/distill-hiatus/ · https://ciechanow.ski/archives/

**Section 5, technologies**
- PixiJS: https://registry.npmjs.org/pixi.js · https://pixijs.com/8.x/guides/third-party/mixing-three-and-pixi · https://pixijs.com/8.x/guides/components/assets/svg · https://pixijs.com/8.x/guides/concepts/performance-tips · https://pixijs.com/8.x/guides/components/scene-objects/text/bitmap · https://pixijs.com/blog/june-2026 · https://github.com/pixijs/pixijs/releases
- three.js: https://registry.npmjs.org/three · https://bundlephobia.com/api/size?package=three@0.186.1 · https://threejs.org/docs/pages/WebGPURenderer.html · https://threejs.org/manual/pages/multiple-scenes.html · https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_clipping_stencil.html
- Other engines: https://bundlephobia.com/api/size?package=@babylonjs/core@9.32.0 · https://registry.npmjs.org/@google/model-viewer
- Libraries around three.js: https://github.com/gkjohnson/three-mesh-bvh · https://github.com/three-ez/instanced-mesh/blob/master/README.md · https://github.com/leochocolat/three-msdf-text-utils · https://discourse.threejs.org/t/troika-three-text-and-webgpu/55737 · https://registry.npmjs.org/urdf-loader
- glTF and compression: https://gltf-transform.dev/cli · https://gltf-transform.dev/modules/extensions/classes/KHRDracoMeshCompression · https://gltf-transform.dev/modules/extensions/classes/EXTMeshoptCompression · https://github.com/zeux/meshoptimizer
- WebGPU availability: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status · https://www.firefox.com/en-US/firefox/147.0/releasenotes/
- Other libraries: https://registry.npmjs.org/quickjs-emscripten · https://github.com/pixijs/layout · https://www.gnu.org/licenses/license-list.html

**Section 6, data and licenses**
- BodyParts3D: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html · https://dbarchive.biosciencedbc.jp/en/bodyparts3d/update.html
- HRA: https://github.com/hubmapconsortium/hra-kg · https://github.com/hubmapconsortium/hra-ui/blob/main/apps/humanatlas.io/public/assets/content/release-notes-page/v2.5.yaml · https://github.com/hubmapconsortium/hra-ui/blob/main/apps/humanatlas.io/public/assets/content/release-notes-page/v2.2.yaml · https://github.com/hubmapconsortium/hra-kg/blob/main/digital-objects/ref-organ/heart-male/v1.3/raw/crosswalk.csv · https://github.com/hubmapconsortium/hra-kg/blob/main/digital-objects/2d-ftu/kidney-nephron/v1.3/raw/crosswalk.csv · https://3d.nih.gov/entries/3DPX-020959
- Ontologies: https://github.com/uw-sig/FMA/blob/main/LICENSE · https://bioregistry.io/registry/fma · https://github.com/obophenotype/uberon/blob/master/LICENSE · https://github.com/obophenotype/cell-ontology/blob/master/LICENSE · https://www.ebi.ac.uk/ols4/api/ontologies/fma · https://www.ebi.ac.uk/ols4/api/ontologies/uberon · https://www.ebi.ac.uk/ols4/api/ontologies/cl
- Illustrations and images: https://github.com/ebi-gene-expression-group/anatomogram · https://smart.servier.com/ · https://www.nlm.nih.gov/research/visible/visible_human.html
- Open Anatomy and 3D Slicer: https://www.openanatomy.org/atlas-pages/atlas-spl-nac-brain.html · https://github.com/mhalle/oabrowser/blob/master/package.json · https://github.com/Slicer/Slicer/blob/main/License.txt
- Z-Anatomy and AnatomyTOOL: https://github.com/Z-Anatomy/Models-of-human-anatomy · https://github.com/Z-Anatomy/Blender-addons · https://anatomytool.org/node/63904
- Others: https://alleninstitute.org/legal/terms-of-use · https://github.com/wasserth/TotalSegmentator · https://en.wikipedia.org/wiki/Terminologia_Anatomica · https://help.sketchfab.com/en/articles/16152328-annotations · https://digitalproduction.com/2026/08/12/kitbash-buys-artstation-and-sketchfab/
- glTF specifications: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html · https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_node_visibility/README.md

**Section 7, evidence on 3D and 2D**
- https://cs.ubc.ca/~tmm/talks/vad/VAD-rules.pdf · https://www.students.cs.ubc.ca/~cs-436v/21Jan/slides/rulesofthumb-async.pdf
- https://pubmed.ncbi.nlm.nih.gov/11482314/ · https://doi.org/10.1109/TVCG.2006.17 · https://www2.cs.sfu.ca/~stella/papers/2006/TVCG2006.pdf
- http://www.cosc.canterbury.ac.nz/~andy/papers/chi02DM.pdf · https://scholars.unh.edu/ccom/467 · https://scholars.unh.edu/ccom/355 · https://scholars.unh.edu/ccom/939
- https://arxiv.org/abs/2501.08500 · https://arxiv.org/abs/2108.04680
- https://doi.org/10.1002/ase.1510 · https://doi.org/10.1111/medu.14352 · https://doi.org/10.1016/S0140-6736(00)03649-7 · https://doi.org/10.1111/medu.14993
- https://docs.datadoghq.com/datadog_cloudcraft/ · https://www.khronos.org/gltf/

**Section 8, HTML and SVG**
- DOMPurify: https://github.com/cure53/DOMPurify · https://raw.githubusercontent.com/cure53/DOMPurify/main/src/tags.ts · https://raw.githubusercontent.com/cure53/DOMPurify/main/src/regexp.ts · https://registry.npmjs.org/isomorphic-dompurify
- SVGO: https://svgo.dev/docs/plugins/removeScripts/ · https://svgo.dev/docs/migrations/migration-from-v3-to-v4/
- Browser behavior: https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image · https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- HTML conversion: https://github.com/vercel/satori · https://registry.npmjs.org/parse5 · https://registry.npmjs.org/satori-html · https://github.com/bubkoo/html-to-image · https://github.com/qq15725/modern-screenshot
- HTML-in-Canvas: https://github.com/WICG/html-in-canvas · https://github.com/WICG/html-in-canvas/commit/3bc1653828ff354a1ffc10bc7c010dffa6e2405e · https://github.com/w3ctag/design-reviews/issues/1204
- glTF: https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_interactivity/Specification.adoc
- Background: https://mermaid.js.org/config/schema-docs/config.html · https://github.com/jgraph/drawio/security/advisories/GHSA-fqhg-287p-c6vf
