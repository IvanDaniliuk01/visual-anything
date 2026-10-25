# Second benchmark: what Visual Anything still lacks to represent anything complex

Date: 2026-10-24. Read on branch `develop`, commit `3a459f9`. This document is for deciding: nothing it proposes is approved or implemented. Its recommendations continue the first benchmark's numbering, from R25.

**How it was made**
- I read the repository: `CLAUDE.md`, `CONTEXT.md`, `docs/spec-v0.1.md`, every ADR title and the ADRs this document leans on, `docs/designs/`, and the source tree where a status needed checking.
- Five research passes ran in parallel over eight categories of tools: diagramming and whiteboards, AI-native diagramming, architecture modeling, data and ML, graphs and networks, knowledge canvases, science and anatomy, and explorable and zoomable interfaces. Two cross-cutting passes covered import, export, version comparison, accessibility and addresses that open a chosen view.
- I checked four of their claims again on the primary page myself: tldraw offline, Mermaid 12, draw.io's Explore viewer and IcePanel's model import. One was corrected.

**Markers**
- A source ID alone, such as [D2], means the claim was read on that primary page.
- [S …]: search snippet only.
- [NV]: could not be verified.
- [C]: corrected after a second reading.
- [R]: read in this repository. [FB §n]: the first benchmark, `docs/designs/benchmark.md`, section n, which lists its own sources.
- No marker: my own synthesis or recommendation.

**Limits**
- The search quota ran out in every pass.
- G2, Capterra, TrustRadius and Reddit refused direct fetches, so what users value and complain about comes from vendor forums, GitHub issues sorted by reactions, Hacker News, App Store reviews, institutional pages and review pages read through snippets.
- Opinions are thin for Eraser, Ilograph, Cytoscape, Graphistry and the brain atlases.
- In the matrix, "?" means not verified, never "no".

**Terms.** I use `CONTEXT.md`'s terms for the project's own concepts, and each tool's own words for that tool (board, node, edge, layer, template, plugin). Where this document needs a word the glossary lacks, section 5.4 proposes one with its Avoid list: *scope*, *view state*, *view address*, *read-only page*, *destination*, *element list*, *live value*, *comment*, *comparison* and *proposal*. As in the first benchmark, *free geometry* means arbitrary contours, because a *free shape* is a drawing outside the model. "Presentation" is in the Avoid list of *Tour*, so for Visual Anything I write "playing a tour full screen".

---

## 1. Summary

### 1.1 What changed since the first benchmark

The first benchmark was written on 2026-10-23, on `m2-fixes` at `e983c0b`, when M2 was closing. Since then [R]:
- **M4 and M5 are complete.** Claude has 57 MCP tools (`packages/server/src/claude/`), including live guidance, scenarios from steps or a log, images, filters, focus and routes. Scenarios record, play with a travelling marker, aggregate inside collapsed containers and keep broken steps.
- **M3 and M3b are more than half done.** Views and perspectives, several containers, filters and focus, appearance traits, the Data modeling package, the component editor, and images in the core are checked off. Open, by the spec's checkboxes: the scene's budget work, collapse with aggregated relations, ELK layout, connection points on the canvas, routes by hand on the canvas, tables on the canvas, and images on the canvas with their benchmark.
- **Tracks A, L and D run beside them.** Themes (ADR 0033), colors (ADR 0034 and 0035), English and Spanish (ADR 0038) and single executables (ADR 0037) are each partly built.
- **The first benchmark's recommendations:** 5 are done, 5 are partly done, 13 are open and 1 stays not planned (section 2).
- **Images took another route than R9 proposed.** ADR 0027 keeps them inside package files, cleaned by an allow-list in the core, instead of an assets folder. Routes by hand, curves included, went into v0.1 (ADR 0039).

The market moved too:
- **MCP is now common.** draw.io [D16], Excalidraw [E5], Miro [M8], Lucid [L16], FigJam [F1], Whimsical [W1], IcePanel [A3], Structurizr [A16], LikeC4 [A34], Sparx EA [A45], Heptabase [H1] and Allume [AL1] all ship MCP servers. "Claude edits it through MCP" is no longer distinctive on its own.
- **What still is distinctive:** Claude's edits are commands on a typed model, each one undoable action labelled Claude, together with live guidance and scenarios built from logs. Of the servers reviewed, only Whimsical's desktop server exposes undo and redo [AI9] and only Sparx's add-in logs AI edits, to a CSV file [A45]. None documents a shared history labelled by author.
- **The closest new rival is tldraw offline** (16 Jul 2026): a free desktop app over local files, with no accounts and no server, which local agents such as Claude Code edit [T7]. It holds shapes, not a typed model. Its files carry scripts that run when the file opens [T7], and the project is source-available, not open source [T8].
- **Model-first tools caught up on drawing.** LikeC4 added a manual layout editor with orthogonal routing (v1.60, 15 Oct 2026) and walkthroughs (v1.59) [A35]. Mermaid 12 bundles ELK as its default layout (10 Sep 2026) [A53]. Archi 5.8 added dynamic legends [A40].
- **Drawing tools moved toward exploring.** draw.io's Explore viewer centres a shape and adds up to six levels of neighbours as you zoom out [D11], and draw.io added animations to presentation mode [D10].
- **Some doors closed.** Structurizr's cloud service reached end of life with "no replacement" [A15]. Kosmik shut down on 31 May 2026 [KO1]. Distill stays on hiatus [DI1].

### 1.2 The five biggest gaps now

1. **Nothing leaves the app.** There is no image, PDF or text export, no page to share or embed, and nothing to read on a phone. Every tool in the matrix whose export could be checked exports something. The spec plans "SVG and PNG first" only in M11 [R].
2. **A large model cannot be cut down or searched.**
   - ADR 0025 says "In v0.1 every view shows the whole model" [R]. Filters are not saved, and the app has no search box [R].
   - Model-first tools scope views by rules (LikeC4, Structurizr, SysML v2 [FB §2.2]) and graph tools by perspectives [N1].
   - The human body's ontology alone has 104,721 terms [FB §6.1].
3. **Nothing comes in.**
   - There is no import from Mermaid, draw.io, Structurizr, spreadsheets or JSON. There are two built-in packages and one sample project, so every project starts empty.
   - Mermaid has become the exchange format the others accept [S L6, AI19, T3, F1, D8].
   - D2's most-wanted feature is draw.io import and export [A61].
4. **Explaining stops at scenarios.**
   - There are no tours, no full-screen playback, no addresses that open a view at a chosen state, and no comments.
   - Most of the tools reviewed have a presentation or walkthrough mode (Lucid, Whimsical, Kumu [L8, W6, K2]), and several added one in 2026: draw.io's animations, Excalidraw+'s step reveal, Miro's new presentation mode and LikeC4's walkthrough [D10, E2, S M3, A35].
5. **Shapes and data are still box-shaped.**
   - Free geometry, SVG with named parts, semantic zoom, overlays by attribute with a legend, and external identifiers are all still open (R8 to R13, M8).
   - All five graph tools checked style by attribute with legends [K12, N2, G4, Y3, GR3]. No way exists to show values from a running system.

The runner-up is comparing versions (4.10). Stable ids and JSON in git give Visual Anything an advantage that no reviewed tool has fully used.

### 1.3 The recommendation

- **Before v0.1, add five small items to M6:**
  - search and jump (R25);
  - view addresses built on one *view state* (R26);
  - PNG export (R27);
  - a history panel that shows each action's author (R28);
  - recipes so Claude builds a model from Mermaid, draw.io, SQL, OpenAPI, Terraform or logs with the tools it already has (R29).
  
  Each is S.
- **Right after v0.1, before package code, run two milestones side by side:**
  - **M6b · Out:** SVG and PDF from the app and the command line, a read-only page, and text exports.
  - **M6c · In:** scoped views first, then imports and starter packages.
- **Reorder the rest:**
  - Move tours forward, and give them full-screen playback and comments (M11).
  - Split M8 into *detail and data* (M8) and *beyond boxes* (M8b).
  - Add **M11b · Versions**.
  - Keep the order of physical space (M9, M10), and the first benchmark's "do not do" list.
- **26 recommendations, R25 to R50.** Do first: R25, R26, R27, R28, R29, R30, R32 and R45 (section 5.3).

---

## 2. The baseline: R1 to R24

| # | Recommendation of the first benchmark | Status | Where it stands [R] |
|---|---|---|---|
| R1 | Connection points, in a format that foresees free geometry | Partly done | ADR 0022 defines them in the appearance; ELK takes them as ports (`packages/app/src/canvas/layout/ports.ts`); the M3 task "relations attach to them, and ELK takes them as ports" is still open; no contour field yet |
| R2 | Focus by degrees and direction; isolate | Done | ADR 0025; M3 task checked; `packages/app/src/canvas/explore.ts`, `focus.ts`; Claude's `focus_view` and `filter_view` |
| R3 | Context menu | Done | The shape menu (M2, ADR 0021): `canvas/ShapeMenu.tsx`, `canvas/RelationMenu.tsx` |
| R4 | Stacking order | Done | ADR 0021; `packages/core/src/stacking.ts`; Claude's `restack` |
| R5 | Dropping a shape into a container | Done | ADR 0021; `canvas/drop.ts`, `canvas/ContainerChooser.tsx`; Claude's `change_container` |
| R6 | Grid, rulers and snapping | Open, designed | Track A3, every task open; `docs/designs/look-and-feel.md` §5 |
| R7 | Themes and colors with transparency | Partly done | Themes: ADR 0033, A1 with "The canvas follows the theme" open. Colors: ADR 0034 and 0035, A2's core done, inspector open. Transparency and gradients are "Later"; `Color` is `^#[0-9a-fA-F]{6}$` in `packages/schema/src/files.ts` |
| R8 | Free 2D geometry in the appearance | Open | M8 |
| R9 | Assets: sanitized images and SVG | Partly done, by another route | ADR 0027: images are package data inside `.vapackage`, cleaned by an allow-list in `packages/core/src/images/`, with no assets folder and no new file kind. Core, page policy and MCP tools done; images on the canvas, in the editor and their benchmark open (M3b). Large photos as files are "Later" |
| R10 | SVG with named parts as anchored shapes | Open | M8 |
| R11 | Declarative semantic zoom | Open | M8 |
| R12 | Overlays by attribute with a legend | Open | M8; "colors that depend on an attribute's value" is in the scope table's "Later" |
| R13 | External identifiers and crosswalks | Open | M8; possible today only as text attributes |
| R14 | Table component | Partly done | ADR 0023; the Data modeling package (Table, Column, is column of, references) done; "Tables on the canvas" and pasting `CREATE TABLE` open (M3) |
| R15 | Component editor | Done | M3b task checked; `packages/app/src/shell/definitions/`, `ComponentsTab.tsx`; images in the editor still open |
| R16 | Static HTML as a drawing | Open | M8 |
| R17 | Tours and an animated camera | Open | M11; the scope table says "v0.2". Guidance already has the parts: highlight, focus, pan to, caption, filter and play a scenario (protocol 4, commit `0707892`) |
| R18 | Curved routes | Partly done | Curves chosen by hand are in v0.1: ADR 0039, the core, its property tests and Claude's `set_route` are done, the canvas task is open. Curves drawn by layout are in M8 |
| R19 | SVG and PNG export | Open | M11. R27 and R31 propose moving it forward |
| R20 | Physical space inside components | Open | M9 |
| R21 | A linked physical-space panel | Open | M10. The draft in FB §7.3 calls itself ADR-0021, a number that ADR 0021 (stacking order) now holds, so it takes the next free number when it is written |
| R22 | Programmable components | Open, designed | M7, then M12; design in `docs/designs/components.md` §6, whose draft ADR numbers (0025 to 0027) are also taken now |
| R23 | Anatomy package and ontology import | Open | M13 |
| R24 | Live HTML in one isolated iframe | Not planned | The spec's "Not planned" list |

The first benchmark's list of changes needing agreement (FB §9) also moved [R]:
- **The assets ADR** became ADR 0027, which adds no new file kind.
- **Format version 2 was not needed.** New keys are optional and the format stays at version 1, as ADR 0039's consequences note.
- **New terms in CONTEXT.md:** *Connection point*, *Theme*, *Stacking order* and *Image*.
- **Still missing:** *External identifier*, *Crosswalk*, *Attribute overlay*, *Physical-space panel* and the data license policy.

---

## 3. The market in 2026

### 3.1 What each category values and complains about

**Diagramming and whiteboards** (draw.io, Lucidchart, Miro, tldraw, Excalidraw, FigJam, Whimsical)
- **Users value:**
  - free use with no account, and broad import. draw.io scores 4.6 from 771 Capterra reviews [S D19] and imports Visio, Gliffy, Lucid, SQL, CSV and Mermaid [D8];
  - real-time editing, which gets 97% positive mentions for Lucid [S L19];
  - templates: Miro claims more than 7,000 [M15];
  - presenting frames or paths [L8, W6].
- **Complaints, on scale:**
  - Miro lags from about 2,000 objects [S M12] and is "extremely poor" above 5,000, in a user's words [M11];
  - Lucid is slow on large diagrams [L18];
  - FigJam reports memory errors [F7];
  - Excalidraw slows with "hundreds of elements" [S E9].
- **Complaints, on structure:**
  - Lucid has no collapsible containers [L3];
  - Excalidraw has no layers, auto layout or data [S E8];
  - draw.io gives each cell one parent [D2], and joins connectors only through a waypoint shape [D3].
- **Complaints, on git:**
  - draw.io's compressed files defeat `git diff` [S D14];
  - tldraw offline does not merge edits made outside it, so you close the file before a git operation [T8];
  - Excalidraw's version history is still "in progress" [E3].
- **Complaints, on lock-in and price:**
  - Miro's seat pricing [S M13];
  - Lucid's free plan stops at 60 objects [S L11];
  - tldraw's SDK needs a license key in production [T1];
  - no offline use in Miro [S M5], Whimsical [W4] or Lucid, which has no desktop app [S L12].
- **Complaints, on search:** Lucid users ask to jump to and highlight shape data from search [S L22].
- **2026 moves:**
  - draw.io's official MCP server [D16] and Generate tool [S D17];
  - Explore and animations in draw.io [D10, D11];
  - tldraw offline [T7], and comments in tldraw SDK 5.3, licensed separately [T5];
  - step-by-step reveal in Excalidraw+ (30 Sep 2026) [E2];
  - Miro's Sidekicks and MCP server (May 2026) [M8, M9];
  - in June 2026 Lucid started turning Claude's SVGs into editable diagrams [L17].

**AI-native diagramming** (Eraser, Napkin, Whimsical AI, tldraw's agents, Miro AI, Lucid AI, Mermaid Chart, draw.io and Excalidraw MCP, FigJam AI)
- **What the AI does:**
  - generates from text or code: Eraser builds diagrams from text and from repositories [AI1];
  - keeps the output editable: Napkin [AI6];
  - looks and acts: tldraw's agent kit sees screenshots plus structured shape data and acts through create, update and delete actions [AI10].
- **Users value:**
  - speed to a first draft [AI17];
  - output they can edit instead of a picture [AI6];
  - text underneath for git: the draw.io VS Code extension edits `.drawio.svg` files that embed in READMEs [X14];
  - working from their own agent;
  - automatic clean-up: Whimsical's `auto_layout` [AI8], Lucid's one-pass clean-up [AI15].
- **Complaints, on invented content:**
  - Napkin "invented pros and cons" when given vague text [AI7];
  - in IcePanel's test of four models, the best still confused C4's component and code views [AI25].
- **Complaints, on layout:**
  - tldraw's team found spatial layout harder for agents than meaning [AI11];
  - draw.io warns that output may not match intent on the first attempt [AI18];
  - Miro says MCP layouts "may need several refinement passes" [M7].
- **Complaints, on regenerating:** the AI makes a new artifact instead of editing the current one, in Miro AI [AI14] and FigJam AI [AI20].
- **Complaints, on cloud and cost:**
  - Eraser's AI quotas [AI3];
  - draw.io's hosted MCP server unless you host your own [D16];
  - Miro's MCP server must be switched on by Enterprise admins [AI12].
- **The closest pattern to Visual Anything:** Structurizr's MCP replaces a workspace from DSL but keeps the layout already on the server [A16], much as pinned positions survive layout here.

**Architecture modeling** (IcePanel, Structurizr and C4, Ilograph, LikeC4, Archi, Sparx EA, CATIA Magic and SysON, Mermaid, D2)
- **Users value:**
  - one model with many views (IcePanel [A13], Structurizr [A14]);
  - models as code in git (Structurizr [A14], LikeC4 [A33]);
  - flows with alternate and parallel paths (IcePanel [A2]);
  - local or air-gapped use (Structurizr local [A14], Ilograph Desktop [A28]).
- **Complaints, on scale and layout:**
  - LikeC4's most-voted issue is "Larger systems render poorly" [A37];
  - Structurizr depends on Graphviz and locks views that use automatic layout against manual edits [A18];
  - Mermaid is hard to read beyond a few dozen nodes, and many hosts offer no zoom [S A57].
- **Complaints, on modeling:**
  - D2 cannot connect to connections (#423, in its top five) [A61];
  - LikeC4 cannot reuse one element inside two components (#1705, second most voted) [A38];
  - Archi users ask for bulk property editing and virtual views [A43];
  - Sparx EA has a steep learning curve and a dated interface [S A48].
- **Complaints, on hosting:** IcePanel is cloud only [A2] and is not models as code [A13]; Structurizr's cloud reached end of life [A15].
- **2026 moves:**
  - Mermaid 12 with ELK [A53];
  - LikeC4's manual layout editor and walkthrough [A35];
  - D2's TALA layout bundled and open source (v0.9.0) [A58];
  - Archi 5.8's legends [A40];
  - IcePanel's JSON and YAML model import (11 Mar 2026) [X6];
  - Structurizr vNext merging its local and server editions [A15].

**Data and ML** (dbdiagram, DrawSQL, ChartDB, drawDB, Netron, TensorBoard, Google's Model Explorer)
- **Users value:**
  - pasting `CREATE TABLE`, and 200+ templates in DrawSQL [A63];
  - comparing versions in dbdiagram [A62];
  - seeing the AI's changes as a diff before applying them, in DrawSQL [A63];
  - scale: Model Explorer renders 50,000 nodes and 5,000 edges at 60 fps on a 2019 laptop, laying out a layer only when it is opened [A69], and compares two models side by side [A70];
  - breadth: Netron reads 14 formats plus 8 experimental ones [A66].
- **Complaints:**
  - drawDB's top issue is collaboration (#58), and users ask it for an MCP server (#992) [A65];
  - ChartDB users ask for sharing by link [A64];
  - Netron is read-only [A66];
  - tensorboard.dev was shut down [A68].

**Graphs and networks** (Kumu, yEd and yFiles, Gephi and Gephi Lite, Cytoscape, Neo4j Bloom, Graphistry)
- **Users value:**
  - styling by attribute with legends: Kumu builds legends automatically [K12], Bloom has rule-based styles and a legend panel [N2], Gephi Lite has captions [G4], yEd its Properties Mapper [Y3], Graphistry its histograms [GR3];
  - focus by degree and direction (Kumu [K13]);
  - scale: Gephi claims 1 million nodes and 5 million edges [G2]; Graphistry "millions of edges" [GR2];
  - building a map from a spreadsheet: Kumu takes Excel, CSV or a live Google Sheet [K14, K15];
  - time: Bloom's Slicer plays back ranges of dates or numbers [N3].
- **Complaints, Gephi:** crashes, no undo, an unfriendly interface [S G5], and a desktop app in beta for over a decade [G2].
- **Complaints, Kumu:**
  - empty spreadsheet rows break imports [S K16];
  - large maps lag [S K19];
  - there is no public API [K5];
  - edges cannot end on edges, so its FAQ suggests a hidden connector element [K3].
- **Complaints, others:**
  - Cytoscape.js's WebGL preview reaches only about 10 fps at 3,200 nodes and 68,000 edges, "not truly smooth" [CJ2];
  - yEd will probably never get a dark mode [Y4].
- **2026 moves:**
  - Gephi 0.11's new OpenGL engine [G2];
  - map backgrounds in Gephi Lite 1.1 [G1];
  - yFiles lists an MCP server in its documentation [Y8].

**Knowledge canvases** (Obsidian Canvas and JSON Canvas, Heptabase, Scrintal, Kosmik, Allume (formerly Muse), Kinopio)
- **Users value:**
  - the open, MIT-licensed JSON Canvas format [O2, S O3];
  - cards reused on several boards and whiteboards inside whiteboards, in Heptabase [S H9, H1];
  - local-first apps: Allume [AL1], and Kinopio, which works offline and has open client code [KI1];
  - MCP in Heptabase [H1] and Allume [AL1].
- **Complaints:**
  - Obsidian Canvas stutters at 100 to 200 cards [O4];
  - Obsidian users have asked since December 2022 to link to a card inside another canvas [O6];
  - the features people want arrive through a plugin: Advanced Canvas, downloaded 937,000 times, adds collapsible groups, presenting and canvases inside canvases [O7];
  - Kosmik, local-first, closed in 2026 [KO1], a reminder that a project's files must outlive its tool.

**Science and anatomy** (BioRender, BioDigital Human, Zygote Body, Complete Anatomy, Visible Body, Allen atlases, siibra-explorer, Neuroglancer, brainrender)
- **Users value:**
  - libraries and templates: BioRender advertises "50K+" icons and templates together [B1], and an AI agent whose output stays editable [B4];
  - tours, quizzes and embedding: BioDigital offers tours, more than 200 quizzes, LMS embedding and 8 languages [BD1], and tours others can embed [BD2];
  - links that keep a view: the ABC Atlas share link "saves the state of all views" [AB2]; Neuroglancer's whole view is one JSON state you can share [NG2]; Complete Anatomy shares through deep links [CA1];
  - course systems: Visible Body supports LTI 1.3 with five learning systems [VB1];
  - zooming deep: siibra-explorer goes from a brain region down to cortical layers and cells [SI2].
- **Complaints, BioRender:**
  - cost: Caltech cites $420 a year at retail [B7];
  - free figures cannot be published, and figures are lost when a subscription ends [B3];
  - a library weak for specific views, according to a competitor [B8].
- **Complaints, other tools:**
  - BioDigital's free tier allows 10 model views a month [BD5] and works poorly on touch [BD6];
  - in Complete Anatomy, undo fires on every rotation [CA2];
  - Neuroglancer is heavy on modifier keys and counts in voxels [NG2];
  - relations such as blood supply stay outside the model in every anatomy tool [FB §2.4].

**Explorable explanations and zoomable interfaces** (Distill, Bret Victor's explorables, Observable, Idyll, Polypad, Prezi, Kinopio, Closeread)
- **Users value:**
  - engagement and an overview that "anchors the audience" in Prezi [PR3, PR4];
  - storytelling without programming, with scenes, annotations and coordinated views (Ellipsis [RE3]).
- **What research found:**
  - interactive articles engage more and can improve recall, and slideshow layouts beat scrolling for comprehension (Hohman et al., citing Zhi et al.) [DI2];
  - animated transitions "can significantly improve graphical perception" [RE1];
  - people structure visualization sequences hierarchically [RE4].
- **Complaints:**
  - authoring cost: Distill paused after articles needed 50 or more hours of help [DI1]; Idyll's repository shows no releases [ID1];
  - Observable's lock-in, and its desktop app runs only on Apple Silicon Macs [OB1, OB2];
  - Prezi's motion sickness, called its "number one complaint" [PR2], and a steep learning curve [PR2];
  - a Prezi-funded study found it rated better than slides but with no gain in memory or comprehension [RE5].

### 3.2 Capability matrix

Sixteen tools, chosen to cover every category, against 26 capabilities in four tables. Cells: ● yes, ◐ partly, ○ no, ? not verified, – does not apply, plus a few words. The last column lists the sources behind the row. "VA today" is the repository at `3a459f9` [R]; "VA proposed" adds what section 5 recommends.

**Table A · Modeling and exploration**

| Tool | Model depth | Several containers | Relations on relations | Views of one model | Semantic zoom | Collapse, aggregation | Filters, focus | Sources |
|---|---|---|---|---|---|---|---|---|
| draw.io | ◐ untyped properties | ○ one parent | ◐ through a waypoint shape | ◐ pages are separate drawings | ◐ Explore, 6 levels | ◐ collapse, no aggregation | ● layers, Explore | D1 D2 D3 S D6 D10 D11 |
| Lucidchart | ● typed data, data linking | ? | ◐ fiddly | ◐ tabs | ? | ○ no collapsible containers | ◐ layers | L1 L3 S L4 L9 L18, FB §2.1 |
| Miro | ◐ shape metadata | ? | ? | ◐ diagram layers | ? | ◐ smart containers | ◐ layers, focus | M1 S M2 |
| tldraw | ◐ custom records, SDK only | ? | ◐ bindings | ◐ pages | ? | ? | ? | T3 T8 S T12 |
| Excalidraw | ○ no data | ? | ? | ◐ scenes (Plus) | ? | ○ | ○ no layers | S E8 S E10 |
| Eraser | ◐ its own diagram code | ? | ? | ? | ? | ? | ? | AI1 |
| IcePanel | ● shared model | ○ fixed hierarchy | ? | ● levels, many diagrams | ◐ zoom between C4 levels | ? | ◐ tags | A1 A5 A13, FB §2.2 |
| Structurizr | ● model as code | ? | ? | ● many view kinds | ◐ C4 levels as separate views | ● implied relationships | ◐ filtered views | A14 A17 A19 A20 |
| Ilograph | ● resources and perspectives | ◐ contexts, one parent in each | ? | ● perspectives | ◐ detail slider | ? | ● focus hides the rest | A26 A27, FB §2.2 |
| LikeC4 | ● kinds in a specification | ○ asked in #1705 | ? | ● views at any level | ◐ drill-down | ? | ● include, exclude, where | A33 A38, FB §2.2 |
| Mermaid | ○ each diagram is its own text | ? | ? | ○ | ○ hosts often lack zoom | ? | ○ | S A57 |
| Kumu | ◐ project data, positions per map | ◐ clusters by field values | ○ hidden connector element | ● maps and views | ? | ◐ cluster hubs | ● degrees, direction | K3 K6 K8 K13 |
| Cytoscape | ◐ attribute mappings | ● desktop groups; one parent in .js | ○ | ? | ● detail thresholds | ● meta-edges (desktop) | ? | CJ1 S C4 C5, FB §2.3 |
| Obsidian Canvas | ○ free cards | ? | ○ | ? | ? | ◐ plugin only | ? | O1 O2 O7 |
| Model Explorer | ◐ read-only model graph | ? | ? | ◐ split view | ● layers laid out when opened | ● nested layers | ● regex search, bookmarks | A69 A70 |
| BioDigital Human | ◐ structures with ids | ? | ○ relations in text cards | ? | ? | ? | ● hide, isolate, X-ray | BD4, FB §2.4 |
| **VA today** | ● components derived up to Essence | ● one copy per container | ● | ◐ one perspective each, but every view shows the whole model | ◐ fixed thresholds in the renderer | ◐ ADR 0024; M3 task open | ● degrees, direction, isolate | [R] |
| **VA proposed** | ● | ● | ● | ● scopes (R30) | ● (R11) | ● | ● with saved scopes (R30) | |

**Table B · Drawing**

| Tool | Hand routing | Automatic layout | Styles, themes | Images, icons | Tables | 3D | Scenarios, animation, presenting | Sources |
|---|---|---|---|---|---|---|---|---|
| draw.io | ● waypoints | ● ELK-based layouts | ● adaptive dark colors | ● 10,000+ shapes | ● from SQL | ○ isometric only | ◐ page animations, presentation mode | S D4 D5 S D7 D8 D10 D16, FB §2.1 |
| Lucidchart | ? | ? | ? | ? | ● ERD from SQL | ? | ● Presentation Builder, Paths | L7 L8 |
| Miro | ? | ◐ mind maps only | ? | ● shape packs | ● tables, ERD | ? | ● frames as slides, Talktrack | M1 S M2 S M3 M7 M9 |
| tldraw | ◐ elbow arrows | ◐ pack and stack | ● themes | ● images with alt text | ? | ? | ? | T3 T6 T10 S T12 |
| Excalidraw | ? | ○ | ● dark mode | ● libraries | ◐ Mermaid ER | ? | ● step reveal (Plus) | E1 E2 E6 S E8 |
| Eraser | ? | ? | ? | ? | ? | ? | ? | – |
| IcePanel | ? | ? | ◐ light or dark exports | ? | ? | ? | ● flows, alternate and parallel paths | A2 A6 |
| Structurizr | ● manual layout | ● Graphviz | ● themes | ● cloud icon themes | ? | ○ | ● dynamic views, animation, presenting | A14 A17 A18, FB §2.2 |
| Ilograph | ? | ? | ● dark mode | ● cloud and custom icons | ? | ? | ● walkthroughs, sequences | A25 A28 |
| LikeC4 | ● manual, orthogonal (Oct 2026) | ● Graphviz | ● light, dark, auto | ● local SVG icons | ? | ? | ● dynamic views, walkthrough | A33 A35 |
| Mermaid | ? | ● ELK by default (12.0) | ● themes, dark | ● 200k+ Iconify icons | ● ER diagrams | ○ | ? | A53 A54, FB §2.2 |
| Kumu | ? | ● force, scatter, snap | ● data-driven, legends | ◐ images, hidden for speed | ? | ? | ● presentations; years only | K1 K2 K7 K12 S K19 |
| Cytoscape | ? | ● many layouts | ● mappings | ? | ? | ◐ Cy3D app | ? | CJ1, FB §2.3 |
| Obsidian Canvas | ◐ plugin edge paths | ? | ? | ● media cards | ◐ base cards | ? | ◐ plugin | O1 O7 |
| Model Explorer | ? | ● its own, per layer | ? | ? | ? | ? | ? | A69 |
| BioDigital Human | – | – | ? | – | – | ● 14,000+ structures | ● tours, quizzes | BD1 BD2 |
| **VA today** | ◐ ADR 0039: core done, canvas open | ◐ ELK in a worker with ports; task open | ◐ light and dark, any #RRGGBB; canvas and inspector tasks open | ◐ cleaned package images; canvas task open | ◐ rows; tables on the canvas open | ○ M9, M10 | ◐ scenarios with a travelling marker; no tours | [R] |
| **VA proposed** | ● | ● | ● | ● with starter icon sets (R38) | ● | ● (R20, R21) | ● tours played full screen (R45) | |

**Table C · Sharing and AI**

| Tool | Collaboration | Versions, diffs | Import | Export | Embedding, sharing | AI | Sources |
|---|---|---|---|---|---|---|---|
| draw.io | ◐ real time only on cloud stores | ◐ XML, compressed by default | ● Visio, Gliffy, Lucid, SQL, CSV, Mermaid | ● PNG, SVG, PDF, HTML, editable inside | ● Confluence, VS Code | ● Generate, official MCP | D8 S D9 D12 S D13 S D14 D16 X14 |
| Lucidchart | ● real time, comments | ? | ● Visio, Gliffy, draw.io, BPMN; Mermaid (paid) | ◐ SQL; Mermaid through MCP (Oct 2026) | ◐ Notion | ● AI, MCP | L5 S L6 L7 L8 L16 S L19 S L20 AI15 |
| Miro | ● | ◐ hourly history, 90 days | ◐ Visio; Mermaid, PlantUML through apps | ● | ● live embed, view-only | ● Sidekicks, MCP read and write | M1 S M4 M6 M7 M8 |
| tldraw | ● sync; comments sold apart; LAN | ◐ outside edits not merged | ◐ Mermaid | ◐ images, snapshots | ? | ● MCP app, agent kit | T1 T3 T5 T8 T9 T13 S T14 S T16 |
| Excalidraw | ● end-to-end encrypted; comments (Plus) | ○ in progress | ◐ Mermaid flowcharts | ● PNG, SVG; PDF, PPTX (Plus) | ● read-only links, VS Code | ● text to diagram, MCP | E1 E2 E3 E4 E5 AI19 |
| Eraser | ? | ? | ◐ from code and repositories | ● PNG, SVG, PDF | ? | ● DiagramGPT, MCP | AI1 AI2 |
| IcePanel | ● comments, live links | ◐ snapshots, no diff | ◐ JSON, YAML (Mar 2026) | ● SVG, PNG; summaries as PDF, MD, HTML | ● iframes; links keep zoom, selection, flow | ● MCP read, opt-in write | A3 A4 A6 A9 X6 |
| Structurizr | ◐ server only | ● DSL in git; versions without compare | ? | ● PlantUML, Mermaid, static site, PNG, SVG | ● iframes | ● MCP that keeps manual layout | A14 A16 A19 A21 X16 |
| Ilograph | ? | ? | ? | ● self-contained HTML (paid API) | ● Confluence app | ○ none in release notes | A25 A29 A30 |
| LikeC4 | ? | ● git; `element-diff` | ? | ● static site, one HTML file, drawio, Mermaid, D2, PlantUML | ● VS Code, web components | ◐ MCP read only | A33 A34 A35 X12 |
| Mermaid | ◐ Mermaid Chart (paid) | ● text in git | – | ● SVG | ● native in GitHub | ● Mermaid Chart AI, MCP | AI16 X13 |
| Kumu | ◐ commenting (Pro) | ◐ activity feed, backups | ● Excel, CSV, Google Sheets | ◐ PNG, PDF, XLSX, JSON | ● share links, iframes | ? | K4 K9 K11 K14 K15 |
| Cytoscape | ◐ Cytoscape Web through NDEx | ? | ● many formats, databases | ● GraphML, CX, SVG, PDF, web page | ◐ as a library | ◐ Gene Set AI | C2 C3 S C6 S C7 |
| Obsidian Canvas | ? | ? | ? | ◐ PNG, desktop only | ◐ inside notes | ? | O1 |
| Model Explorer | ? | ◐ side-by-side compare | ● ML formats, adapters | ◐ PNG | ◐ Colab | ? | A70 A71 |
| BioDigital Human | ? | ? | ? | ? | ● iframe, LMS, SDKs | ○ none mentioned | BD1 BD3 |
| **VA today** | ◐ git only | ◐ JSON in a stable key order; no compare | ○ pasting SQL, in progress | ○ | ○ | ● 57 MCP tools, undo labelled Claude, live guidance | [R] |
| **VA proposed** | ◐ git, comments (R46), merge driver (R49) | ● comparisons (R47) | ● R29, R34 to R37 | ● R27, R31, R33 | ● R26, R32 | ● with proposals (R48) | |

**Table D · Reach**

| Tool | Scale | Offline, local-first | Open format | Accessibility | Languages | Extending with code | Sources |
|---|---|---|---|---|---|---|---|
| draw.io | ◐ slows on large diagrams | ● desktop app | ● open XML, Apache-2.0 | ? | ? | ◐ unsupported plugin examples | D15 S D18 S D20 |
| Lucidchart | ◐ lags when large; free plan 60 objects | ○ no desktop app | ? | ● WCAG 2.1 AA, VPAT, keyboard canvas | ? | ● Extension API | L10 S L11 S L12 L13 S L15 L18 X23 |
| Miro | ◐ lag from 2,000 to 5,000 objects | ○ no offline | ? | ● WCAG 2.2 audit, VPAT | ? | ● REST, Web SDK, marketplace | S M5 M6 M10 M11 S M12 |
| tldraw | ◐ culling and an index; 4,000 shapes a page by default | ● tldraw offline | ◐ files run scripts; source-available | ● claims WCAG 2.2 AA | ● about 40 | ● SDK with a license key | T1 T2 T7 T8 T10 T11 S T14, FB §2.1 |
| Excalidraw | ◐ hundreds of elements can slow it | ● offline web app | ● MIT, JSON | ? | ● translated | ◐ React component, API beta | E1 E4 S E9 |
| Eraser | ? | ○ cloud | ◐ its own syntax, hard to move | ? | ? | ? | AI1 S AI4 |
| IcePanel | ◐ free plan 100 objects | ○ cloud | ○ JSON export only | ? | ? | ● REST API, SDK, webhooks | A2 A6 |
| Structurizr | ? | ● local edition, open source | ● DSL, JSON | ? | ? | ● Java API, scripts | A14 |
| Ilograph | ◐ large-diagram fixes (2026) | ● desktop, air-gapped | ◐ documented IDL | ? | ? | ◐ export API | A25 A28 A29, FB §2.2 |
| LikeC4 | ○ large systems render poorly | ● local CLI | ● MIT DSL | ◐ keyboard, APCA contrast | ? | ● SDK | A33 A35 A37 |
| Mermaid | ○ 500 edges by default | ● a library | ● MIT text | ◐ accTitle, accDescr | ? | ◐ a library | X21, FB §2.2 |
| Kumu | ◐ large maps lag | ? | ◐ JSON export | ? | ? | ○ no public API | K1 K5 S K19 |
| Cytoscape | ◐ .js WebGL: about 10 fps at 3,200 nodes, 68,000 edges | ● desktop | ● CX, GraphML | ? | ? | ● apps, JS library | C1 C2 CJ2, FB §2.3 |
| Obsidian Canvas | ○ stutters at 100–200 cards | ● local vault | ● JSON Canvas, MIT | ? | ? | ● community plugins | O2 S O3 O4 O7 |
| Model Explorer | ● 50,000 nodes at 60 fps | ● runs locally | ◐ Apache-2.0 tool | ? | ? | ● adapters | A69 A70 A71 |
| BioDigital Human | ● thousands of structures | ◐ mobile, after a download | ○ closed | ? | ● 8 | ● JS API, mobile SDKs | BD1 BD2 BD3 S BD7, FB §2.4 |
| **VA today** | ● 10,000 elements at the 60 fps target, benchmarked | ● local program, single executables | ● JSON with a published schema | ● outline, keys along relations, contrast, reduced motion | ◐ English and Spanish; L1 open | ○ JSON packages; code in M7 | [R] |
| **VA proposed** | ● reading 100,000 (R44) | ● | ● | ● text alternatives in exports (R31, R33) | ● more (R50) | ● M7 | |

### 3.3 What the matrix says

- **Still unique.** No other tool puts several containers per element, relations on relations, views by perspective and scenarios together, the first benchmark's finding [FB §1]. People ask other tools for these pieces one at a time:
  - D2's "connect to connections" is in its top five issues [A61];
  - LikeC4's request to reuse one element inside two components is its second most voted [A38];
  - Kumu's FAQ explains how to fake a connection to a connection [K3].
- **Also unique:** an undo history labelled by author, in which Claude's edits sit [R].
- **Behind where nearly every other tool is ahead:**
  - export, embedding and import, which nearly every other row has in some form;
  - presenting, which nearly every row has;
  - templates and starter content;
  - collaboration, which Visual Anything leaves to git by design.
- **Scale sits in the middle.**
  - Visual Anything's 10,000-element target is above every whiteboard: Miro lags from 2,000 to 5,000 [S M12, M11], tldraw caps at 4,000 by default [FB §2.1], Obsidian Canvas stutters at 100 to 200 [O4].
  - It is below graph and ML viewers: Model Explorer renders 50,000 nodes [A69] and Gephi claims 1 million [G2].
- **Local-first is no longer rare.** Structurizr local, Ilograph Desktop, tldraw offline, Obsidian, Kinopio and Allume all qualify. What stays rare is local-first *and* an open, validated, git-friendly format *and* no code running from files.

---

## 4. New gaps

Each gap gives the evidence, the effort (the first benchmark's scale: **S** up to a few days, **M** one or two weeks, **L** several weeks, **XL** a milestone or more), the impact, and whether it fits the accepted ADRs. Section 5 turns them into recommendations.

### 4.1 Views that show part of the model
- **Today.** ADR 0025: "In v0.1 every view shows the whole model". It foresaw that "a saved filter can come later as an optional key of the view file" [R]. A view stores a perspective, nesting relation types, positions, free shapes, stacking, collapse and routes, and nothing that limits which elements it shows (`ViewFile`, `packages/schema/src/files.ts`) [R].
- **Evidence.**
  - Rule-based views: LikeC4's `include`, `exclude` and `where`, Structurizr's views and SysML v2's `expose` [FB §2.2]; Structurizr's filtered views [A17].
  - Views that keep their own selection and decoration: Kumu views store decorations and filters [K8]; Bloom's perspectives are lenses over one database [N1].
  - Demand: Archi users ask for "virtual views" [A43].
  - Size: the human body's ontology has 104,721 terms [FB §6.1]. Imports (4.6) will make large models routine.
- **Effort** M–L. **Impact** very high. **Fit:** a new ADR, superseding the "whole model" line of ADR 0025 and using its foreseen optional key. Format version 1 is kept.

### 4.2 Search and jump
- **Today.** No search control in the app [R: none in `packages/app/src/shell`]. Claude has `find_elements` and `find_relations` [R].
- **Evidence.**
  - Lucid users ask search to jump to and highlight shape data [S L22].
  - Model Explorer has regex search and bookmarks [A70]; Bloom has search in near-natural language [N1]; Heptabase added find on whiteboards [H1].
  - Search on large Obsidian canvases works poorly [S O12].
  - Anatomy apps search by name or by id [FB §2.4].
- **Effort** S. **Impact** very high. **Fit:** ADR 0025, since exploring belongs to the open app and leaves no trace.

### 4.3 Addresses for a view, and destinations between views and projects
- **Today.** A launch address opens a project once (ADR 0030) [R]. There is no address for a view, a selection or a scenario step, and no way for an element to lead to a view.
- **Evidence, addresses that keep a view:**
  - IcePanel's links keep position, zoom, selection, tag groups and the open flow, and can be locked to a version [A9];
  - Whimsical's link to an object survives moving it [W11];
  - Structurizr diagrams can be bookmarked [X11] and its embeds take a perspective parameter [A19];
  - the ABC Atlas link saves views, filters, colors and camera [AB2];
  - Neuroglancer shares its whole state as JSON [NG2];
  - Complete Anatomy shares through deep links [CA1].
- **Evidence, links between canvases:**
  - Obsidian's request to link to a card in another canvas has been open since 2022 [O6];
  - Advanced Canvas adds canvases inside canvases [O7];
  - Allume links boards [AL1];
  - draw.io's custom links show, hide, highlight and pan [X25].
- **Effort.** S for addresses; M for an attribute that opens a view; M for opening another project. **Impact** high.
- **Fit.**
  - Addresses: a dated addendum to ADR 0030. The address fragment never carries the session token.
  - Opening a view of the same project: fits ADR 0019 as an optional attribute type.
  - Opening another project: a new ADR.

### 4.4 Export: images, PDF and text
- **Today.** Nothing. The spec plans "SVG and PNG first (after v0.1)", in M11 [R].
- **Evidence, images:**
  - every tool in Table C whose export could be checked exports something;
  - draw.io embeds the diagram inside its PNG, SVG and PDF so they stay editable [S D9];
  - D2 exports SVG, PNG, GIF, PDF and PPTX [X10];
  - Confluence pages with embedded draw.io diagrams load slowly, and users ask for SVG [S D21].
- **Evidence, text formats:**
  - LikeC4 exports to draw.io, Mermaid, D2, PlantUML and Dot [X12];
  - Lucid users asked for Mermaid export [S L21], which arrived through its MCP server in October 2026 [AI15];
  - IcePanel exports model summaries as Markdown and LLMs.txt [A6];
  - GitHub renders Mermaid in Markdown [X13].
- **Evidence, accessibility:** the W3C asks complex images for a short and a long description [X22].
- **Effort.** PNG S; SVG and PDF M; text formats M. **Impact** high.
- **Fit.**
  - PNG fits as a browser download, with nothing stored in the project.
  - An SVG written from the scene needs a dated clarification of ADR 0014: it is an output, not a second renderer.

### 4.5 A read-only page: share, embed, read on a phone
- **Today.** Reading needs the local program, and the scope table says "Mobile out of scope" [R]. Yet the spec's architecture already says the core runs in the browser alone, "so a read-only demo can run in the browser alone" [R].
- **Evidence, static and self-hosted pages:**
  - Structurizr's static site [X11];
  - LikeC4's static site, single-file HTML and web components [X12, A33];
  - Ilograph's self-contained HTML [A29];
  - Gephi Lite's permalinks and iframes [G1, G3];
  - Structurizr's cloud ended with "no replacement" [A15], so self-hosted pages matter.
- **Evidence, shared and embedded links:**
  - IcePanel's read-only links, embedded in Confluence, Notion, Miro and SharePoint [A9];
  - Kumu's share links and iframes [K11].
- **Evidence, phones:**
  - draw.io users complain it has no mobile app [S D19];
  - Prezi offers mobile share views [PR1];
  - mobile reading of interactive articles is understudied [DI2].
- **Effort** L. **Impact** very high.
- **Fit:** a new ADR covering what the page holds, its content security policy, and that it carries no token and never reaches the local program. The scope table's "Mobile out of scope" also changes, to "mobile reading through the read-only page".

### 4.6 Import
- **Today.**
  - Pasting `CREATE TABLE` is an open M3 task [R].
  - The spec says "draw.io import: Not planned" and leaves "Import real traces through a package" for later [R].
  - The local program never fetches a URL for Claude [R].
- **Evidence, Mermaid and draw.io:**
  - Mermaid is the common exchange format: Lucid imports it [S L6] and exports it [AI15]; Excalidraw [AI19], tldraw [T3], FigJam's MCP server [F1] and draw.io [D8] read it.
  - draw.io import and export is D2's most-wanted feature (#743) [A61].
  - The draw.io VS Code extension has 4.2 million installs [X14].
- **Evidence, spreadsheets and JSON:**
  - Kumu maps start from a spreadsheet [K14, K15]; draw.io inserts from CSV [X1].
  - IcePanel imports objects and connections from JSON or YAML, and suggests an LLM to write the file [X6].
- **Evidence, code and traces:**
  - repositories become diagrams in GitDiagram [X8] and Eraser [AI1];
  - OpenTelemetry's service graph connector pairs client and server spans into edges [X9].
- **Evidence, other formats:**
  - Structurizr cloud users have to move somewhere [A15];
  - no architecture tool reviewed imports OpenAPI or Terraform natively; IcePanel points to an LLM instead [X6].
- **Effort.** Claude recipes S; Mermaid M; spreadsheets and JSON M; Structurizr and LikeC4 M; draw.io L. **Impact** high.
- **Fit:** a new ADR on imports. It says:
  - imports are read by a strict reader;
  - nothing in them runs;
  - HTML labels become plain text, since an unsanitized label path was draw.io's CVE-2026-46642 [FB §2.1];
  - an import is one batch command, so one undoable action;
  - what matches nothing is reported.
  
  draw.io import also needs the spec's "Not planned" line changed.

### 4.7 Starter packages and sample projects
- **Today.** Two built-in packages, Systems and Data modeling, and one sample project, `examples/my-systems` [R].
- **Evidence, templates:**
  - Miro claims more than 7,000 templates [M15];
  - DrawSQL has more than 200 [A63];
  - IcePanel ships 10 starter landscapes [A5];
  - BioRender has thousands of templates [B1].
- **Evidence, icons:**
  - Mermaid's architecture diagrams use more than 200,000 Iconify icons [A54];
  - Ilograph bundles cloud icons [A28];
  - Excalidraw's libraries are MIT [E6];
  - Structurizr ships cloud themes [A14].
- **Effort** M per package. **Impact** high.
- **Fit:**
  - Built-in packages fit ADR 0018.
  - Icons and data need the license policy that FB §9 proposed, which could be an ADR. Icon sets' own terms were not checked here [NV].

### 4.8 Tours played full screen (extends R17)
- **Today.** *Tour* is in CONTEXT.md and the spec places tours in v0.2 and M11 [R]. Guidance already highlights, focuses, pans, captions, filters and plays scenarios [R].
- **Evidence, other tools:**
  - draw.io's page animations in presentation mode [D10];
  - Excalidraw+'s step-by-step reveal [E2];
  - Lucid's Presentation Builder and Paths [L8];
  - Miro's 2026 presentation mode [S M3] and Talktrack [M9];
  - Whimsical's sections as slides [W6];
  - Kumu's presentations with focus and filter per slide [K2];
  - LikeC4's walkthrough [A35];
  - Ilograph's walkthroughs [A25];
  - IcePanel's flows [A2];
  - BioDigital's tours of chapters [BD2];
  - Prezi's narrated video [PR1].
- **Evidence, research:**
  - Ellipsis's scenes with annotations [RE3];
  - slideshows beat scrolling for comprehension [DI2];
  - sequences read best as hierarchies [RE4];
  - smooth transitions help perception [RE1].
- **Evidence, risks:** Prezi's motion sickness [PR2, PR3].
- **Effort** M, because guidance does most of the work. **Impact** very high.
- **Fit:** a new ADR for tour files. CLAUDE.md lists five file extensions, so a `.vatour` file changes that rule too.

### 4.9 Comments
- **Today.** Notes are free shapes: they are drawing only, attached to no element [R].
- **Evidence, comments in other tools:**
  - tldraw added comments in 5.3 (Aug 2026) [T5];
  - Excalidraw+ has guest comments [E2];
  - DrawSQL threads comments on tables [A63];
  - IcePanel [A1] and Kumu Pro [K9] have comments.
- **Evidence, AI agents and comments:** the Lucid and Miro MCP servers read and reply to comments [L17, M7].
- **Evidence, pins in anatomy:** Zygote [Z1], BioDigital through its API [BD4] and Neuroglancer's annotation layers [NG2].
- **Effort** M. **Impact** high.
- **Fit:** a new ADR, settling:
  - where comments live;
  - that they are commands in the history;
  - how a person's name is known: a preference, under ADR 0032;
  - that Claude reads and answers them.

### 4.10 Comparing versions, and the history
- **Today.**
  - The local program keeps the undo history, labelled by author (ADR 0028) [R].
  - Files are JSON in a stable key order [R].
  - The *Time* dimension's "versions" are "After v0.1" [R].
- **Evidence, the gap:**
  - INNOQ found nothing that showed what changed between two draw.io revisions, and built a pixel diff [D14];
  - Structurizr keeps versions without a compare [X16];
  - IcePanel keeps snapshots without a diff [A4].
- **Evidence, new tools in 2025–26:**
  - the c4-diff skill draws before, after and a coloured diff [X19];
  - Architecto shows changes between versions [X20];
  - LikeC4's MCP has `element-diff` [A34].
- **Evidence, elsewhere:**
  - dbdiagram compares versions [A62];
  - DrawSQL previews AI changes as a diff [A63];
  - Model Explorer compares models side by side [A70];
  - Whimsical plays back version history [W8].
- **Effort.** History panel S; comparison L; merge driver M. **Impact** high.
- **Fit:** a new ADR. The local program reads git history read-only, through git's plumbing, with no network. Comparing works without git too, against the last saved state.

### 4.11 Live values and measurement
- **Today.** "Claude refreshes the model through its other MCPs"; "packages that request network permission" come later [R]. Every such refresh is an edit in the history.
- **Evidence, live values:**
  - Cloudcraft draws live cloud diagrams with cost, security and observability overlays [A73];
  - IcePanel markets drift indicators, but its docs only show import [A1, A7];
  - Lucid links Google Sheets about every 30 s and Excel both ways [X3];
  - OpenTelemetry's service graph emits metrics per edge [X9].
- **Evidence, measurement:** no anatomy tool reviewed documents a measuring tool [NV].
- **Effort** M. **Impact** high.
- **Fit:** a new ADR. Live values are derived, like scenario playback (ADR 0031) and guidance: never stored and never in the history.

### 4.12 An element list
- **Evidence:**
  - Archi users ask for bulk property editing [A43];
  - Gephi has its Data Laboratory and Gephi Lite a data table [G2, G1];
  - Heptabase has tag databases [H11];
  - Obsidian puts Bases in canvases [O1];
  - CATIA Magic generates tabular views [A49].
- **Effort** M. **Impact** medium to high. **Fit:** fits; edits are commands.

### 4.13 Reading beyond 10,000 elements
- **Evidence:**
  - Model Explorer: 50,000 nodes at 60 fps, with layout only for opened layers [A69];
  - Gephi: 1 million nodes and 5 million edges [G2];
  - yFiles with WebGL: "hundreds of thousands" [S Y10];
  - Graphistry: millions [GR2];
  - Cloudcraft asks for filtering above 10,000 resources [A73].
- **Today.** The budget is 10,000 elements per view [R CLAUDE.md].
- **Effort** L. **Impact** medium to high, for anatomy and ML graphs.
- **Fit:** CLAUDE.md's budget gains a reading line. It fits ADR 0014.

### 4.14 Time ranges
- **Evidence:**
  - Bloom's Slicer with playback [N3];
  - Gephi's timeline [G2];
  - Graphistry's timebars [GR1];
  - Gephi Lite's date range filter [G4];
  - Kumu only filters by tagged years [K7].
- **Effort** M. **Impact** medium. **Fit:** ADR 0025.

### 4.15 Sharing packages; plugins
- **Today.** Packages are JSON, and package code comes in M7 [R].
- **Evidence:**
  - Miro's marketplace [M6];
  - Lucid's Extension API [S L15];
  - draw.io's plugins are unsupported examples [S D18];
  - Advanced Canvas shows wanted features arriving as plugins [O7];
  - Excalidraw's shared libraries [E6].
- **Effort.** Sharing packages S–M; a marketplace XL. **Impact** medium.
- **Fit:** sharing fits ADR 0018 and 0019; a marketplace is not for now (section 6).

### 4.16 Real-time collaboration
- **Evidence:**
  - Lucid gets 97% positive mentions for real-time editing [S L19];
  - Excalidraw encrypts real-time editing end to end [E1];
  - tldraw offline added LAN multiplayer [S T16];
  - drawDB's top issue is collaboration [A65];
  - ChartDB users ask for sharing by link [A64].
- **Effort** XL. **Impact** high for teams.
- **Fit:** none. It contradicts the spec ("No real-time editing"), ADR 0016's single owner and ADR 0013's absence of a hosted server. Section 6.

### 4.17 More languages
- **Evidence.** tldraw has about 40 [S T14], Polypad 26 [PO1], BioDigital 8 [BD1] and FigJam 5 [S F6]; Visual Anything has 2 [R].
- **Effort** S per language. **Impact** low to medium. **Fit:** ADR 0038 already leaves more languages for later.

### 4.18 Accessibility of what leaves the app
- **Evidence:**
  - the W3C's short and long descriptions [X22];
  - Mermaid's `accTitle` and `accDescr`, a work it says has only "started" [X21];
  - Lucid's keyboard canvas enters containers with Enter but does not describe following connectors [X23];
  - research's Data Navigator moves through diagrams as graphs [X24].
- **Today.** Visual Anything already moves along relations from the keyboard and mirrors views in the outline [R], which is ahead of every tool checked.
- **Effort** S on top of exports. **Impact** medium. **Fit:** fits.

### 4.19 Where AI help still differs
- **Evidence.** The complaints in 3.1:
  - invented content [AI7, AI25];
  - messy layout [AI11, M7];
  - regenerating instead of editing [AI14, AI20];
  - edits that cannot be undone or attributed [AI9, A45].
- **What answers it.** Visual Anything already answers the last two by design. What it lacks:
  - a visible history, which only Whimsical approaches with version playback [W8];
  - a way to review Claude's changes before they apply, as DrawSQL does [A63].
- **Effort.** History panel S; review M. **Impact** high, because trust in Claude is the product's edge.

---

## 5. Recommendations

### 5.1 The list

"v0.1" means inside M6, the current spec's last milestone. **M6b**, **M6c**, **M8b** and **M11b** are new milestones (5.3), named like M3b so that no existing number changes.

| # | Recommendation | Effort | Impact | Where | ADR fit |
|---|---|---|---|---|---|
| R25 | Search and jump | S | very high | v0.1 (M6) | fits ADR 0025 |
| R26 | View addresses, built on one view state | S | high | v0.1 (M6) | dated addendum to ADR 0030 |
| R27 | PNG export of the open view | S | high | v0.1 (M6) | fits |
| R28 | A history panel with each action's author | S | high | v0.1 (M6) | fits ADR 0028; protocol version up |
| R29 | Recipes for Claude to build from what exists | S | high | v0.1 (M6) | fits ADR 0029 |
| R30 | Views that show part of the model: a scope | M–L | very high | M6c, first | new ADR, superseding part of ADR 0025 |
| R31 | SVG and PDF export, from the app and the command line | M | high | M6b | dated clarification of ADR 0014 |
| R32 | A read-only page, to share, embed and read on a phone | L | very high | M6b | new ADR; spec change |
| R33 | Text exports: outline in Markdown, Mermaid, Structurizr DSL | M | medium–high | M6b | fits |
| R34 | Mermaid import | M | high | M6c | new import ADR |
| R35 | Spreadsheet and JSON import | M | high | M6c | import ADR |
| R36 | Structurizr and LikeC4 import | M | medium | M6c | import ADR |
| R37 | draw.io import | L | medium–high | M6c | import ADR; spec change |
| R38 | Starter packages and sample projects per domain | M each | high | M6c, then each case | fits ADR 0018; license ADR |
| R39 | Sharing packages between projects | S–M | medium | M6c | fits ADR 0018, 0019 |
| R40 | Destinations: attributes that open a view, a project or a web address | M | high | M8 | new ADR for projects and addresses |
| R41 | Live values: a channel for values from running systems | M | high | M8 | new ADR |
| R42 | An element list, edited in bulk | M | medium–high | M8 | fits |
| R43 | Time ranges with playback | M | medium | M8 | fits ADR 0025 |
| R44 | A reading benchmark at 100,000 elements | L | medium–high | M8 | CLAUDE.md budget line |
| R45 | Tours as recorded guidance, played full screen | M | very high | M11, moved before M9 | new ADR; CLAUDE.md file kinds |
| R46 | Comments kept in the project | M | high | M11 | new ADR; CONTEXT terms |
| R47 | Comparing versions, in the app and for pull requests | L | high | M11b | new ADR |
| R48 | Proposals: reviewing Claude's changes before they apply | M | medium–high | M11b | new ADR or addendum to ADR 0029 |
| R49 | A git merge driver for project files | M | medium | M11b | new ADR |
| R50 | More languages, Portuguese first | S each | low–medium | Track L (L2) | fits ADR 0038 |

### 5.2 Each recommendation

**R25 · Search and jump**
- **What.**
  - A find field on Ctrl+F or Cmd+F while the canvas or a panel has focus. It matches names, ids, components and attribute values (after R13, external identifiers too) across the project.
  - Results are grouped by the views that draw them. Enter selects the element, pans to it (a jump under reduced motion) and announces it; another key lists every view that draws it.
- **Why.** 4.2.
- **Risks.** The browser's own find must still work outside the canvas. Matching must stay within the frame budget at 10,000 elements; an index in the app suffices.
- **Where.** v0.1, M6, as part of "fix what dogfooding surfaces".

**R26 · View addresses, built on one view state**
- **What.**
  - The core defines one typed *view state*: the view, the camera, the selection, filters, focus, and the scenario and step being played.
  - The app keeps it in the address's fragment (`#view=…&select=…&step=…`) and offers *Copy address*.
  - `visual-anything open <folder> --view <id>` prints a launch address carrying it.
  - Tours (R45), comments (R46) and the read-only page (R32) reuse the same value.
- **Why.** 4.3. Neuroglancer [NG2] and the ABC Atlas [AB2] show that one state value serves bookmarks, sharing and tours alike.
- **Risks.**
  - The fragment must never carry the token. It never reaches the server, and is applied only after the launch address is redeemed.
  - Ids are stable, so addresses survive renames, as Whimsical's links survive moves [W11].
- **Where.** v0.1, M6; a dated addendum to ADR 0030; the term *view state* (CONTEXT.md's *Tour* already uses the phrase).

**R27 · PNG export of the open view**
- **What.**
  - *Export → PNG* of what is visible or of the whole view, at 1× or 2×, in the current theme. It is drawn by the renderer and saved through the browser, so nothing is written by the local program.
  - The image's size is capped.
- **Why.** 4.4: every tool has it, and it is what people paste into documents and chats.
- **Where.** v0.1, M6.

**R28 · A history panel**
- **What.**
  - A panel listing the history the local program keeps (ADR 0028): each action's label, author (you or Claude) and time, with Claude's actions marked.
  - *Undo to here* runs undo until that action.
- **Why.** The spec's success criterion says every edit "undoes one action at a time, with Claude's actions labelled as such". Today that label is invisible, and it is the one AI feature nobody else documents (4.19).
- **Risks.** The protocol needs a message that lists the history, so its version goes up.
- **Where.** v0.1, M6.

**R29 · Recipes for Claude to build from what exists**
- **What.** Worked recipes in the tool descriptions and the README, and as MCP prompts if the entry point offers them. Each one turns something into a model, views and scenarios with the existing tools (`run_commands`, `add_to_model`, `create_view`, `create_scenario_from_steps`), asking about anything that matches nothing. The inputs:
  - Mermaid, PlantUML, draw.io XML, Structurizr DSL and SQL DDL;
  - OpenAPI, Terraform, Kubernetes manifests and docker-compose;
  - a repository's tree;
  - logs and OpenTelemetry traces.
- **Why.** It brings import for the price of documentation: IcePanel itself tells users to have an LLM write its import file [X6].
- **Risks.**
  - Invented content [AI25]. The recipes therefore require reporting what matched nothing, calling `preview_delete` before any delete, and one undoable action per call.
  - Claude reads the files itself; the local program still fetches nothing.
- **Where.** v0.1, M6.

**R30 · Views that show part of the model: a scope**
- **What.**
  - A view gains an optional `scope`, made of rules plus elements added or left out by hand. The rules:
    - include or exclude by component (with or without what derives from it);
    - include or exclude by relation type;
    - include or exclude by a container's contents to some depth;
    - include or exclude by attribute condition, with the same tests as filters.
  - New elements that meet the rules appear in the view.
  - *Add to this view* and *Leave out of this view* never delete from the model. A relation shows while both its ends are in scope, and a shape shows how many relations leave the view.
  - Layout only sees what is in scope. The perspective switcher lists the views over the same part, as ADR 0025 foresaw. Claude gets tools for it.
- **Why.** 4.1. It comes before imports and anatomy, which make models too large for one view.
- **Risks.**
  - Its interplay with collapse, aggregated relations and the delete preview.
  - A scenario step whose relation is out of scope is "outside the view", which is not a broken step.
  - Property tests for both.
- **Where.** M6c, first task, in the core. It needs a new ADR, and the term *scope*.

**R31 · SVG and PDF export, from the app and the command line**
- **What.**
  - An SVG writer in pure TypeScript, without the DOM, that writes the same scene the renderer draws: shapes, rows, routes, labels and cleaned images as data.
  - It adds `<title>` and `<desc>` from the view's name and description, and the ids of elements and relations as `data-` attributes.
  - PDF comes from that SVG; how is chosen when M6b is planned [NV].
  - `visual-anything export <folder> --view <id> --format svg|pdf` serves CI, READMEs and pull requests.
- **Why.** 4.4 and 4.18. It supersedes R19 and moves it out of M11.
- **Risks.**
  - Two drawings of one scene can drift apart; a test should compare the SVG's bounds with the scene's.
  - Fonts.
- **Where.** M6b; a dated clarification of ADR 0014: an SVG written from the scene is an output, not a rendering engine.

**R32 · A read-only page**
- **What.**
  - *Export → Read-only page* writes one HTML file. It holds the app's viewer, a copy of the project (model, views, scenarios, tours, cleaned images) and a strict content security policy with `connect-src 'none'`.
  - It opens in any browser, offline, and lets the reader explore: filters, focus, collapse and search.
  - It plays scenarios and tours, follows view addresses (R26), and pans and zooms by touch on phones and tablets. It cannot edit.
  - It can be embedded in an iframe, or published on any static host.
- **Why.** 4.5. It also covers embedding and mobile reading.
- **Risks.**
  - Size, to be measured.
  - The page must never accept a token or reach the local program.
  - It runs only the product's own code; no project content runs.
  - Packages' attribution must travel with it.
  - Performance on phones at 10,000 elements.
- **Where.** M6b. It needs a new ADR, the spec's mobile line changed to "reading through the read-only page", and the term *read-only page*.

**R33 · Text exports**
- **What.**
  - **An outline in Markdown:** what sits in each container, the relations and the steps of each scenario. It serves as the view's long description [X22] and as context for language models, as IcePanel's LLMs.txt export does [A6].
  - **Mermaid:** containers become subgraphs, using an element's first container, and relation types become labels. The export says what it lost.
  - **Structurizr DSL,** for views built from Systems components.
- **Why.** 4.4 and 4.18. GitHub renders Mermaid [X13].
- **Where.** M6b.

**R34 · Mermaid import**
- **What.**
  - Paste or open a Mermaid flowchart, C4, ER or class diagram.
  - Node shapes and classes map to components in a dialog. Subgraphs become containers through the view's nesting relation type, and edges become relations.
  - The import is one batch command, and the importer reports what matched nothing.
- **Why.** 4.6.
- **Risks.** Mermaid's own parser package may not cover every diagram type [NV]; a small reader of our own for the supported subsets may be simpler. Mermaid labels can hold HTML, which becomes plain text.
- **Where.** M6c; the import ADR.

**R35 · Spreadsheet and JSON import**
- **What.**
  - CSV or TSV, pasted or opened, with element columns (name, component, container, attributes) and relation columns (from, to, relation type, attributes), as Kumu does [K14]. A preview lists the problems before anything is applied.
  - Importing again updates by id or by a chosen key column and never duplicates. It changes only values: Lucid's CSV re-upload overwrites manual edits [X3], and this one keeps positions.
  - JSON import is checked against the published schema, the pattern IcePanel adopted [X6]. [C]: IcePanel's page offers its JSON Schema for checking files in an editor; whether the app checks imports is not stated.
- **Where.** M6c; the import ADR.

**R36 · Structurizr and LikeC4 import**
- **What.**
  - A Structurizr workspace in JSON becomes elements of the C4 package (R38), relations and views with their scopes (R30), with the manual layout's positions.
  - DSL comes in through the Structurizr CLI the person runs, which is never bundled.
  - LikeC4 comes in through its exported model, whose format is to be checked when M6c is planned [NV].
- **Why.** Structurizr's cloud users have "no replacement" [A15], and they already think in a model with views.
- **Where.** M6c, after R30 and R38.

**R37 · draw.io import**
- **What.** `.drawio` files, compressed or not, and `.drawio.svg` or `.drawio.png` with the diagram inside.
  - **Shapes:** become elements of a component chosen per style in a mapping dialog.
  - **Containers:** become nesting, with one container each, since draw.io has one parent [D2].
  - **Edges:** become relations, and their waypoints become bend points; ADR 0039 was designed "as in draw.io".
  - **Edges joined through a waypoint shape** [D3]: become relations on relations where the meaning is clear.
  - **Labels:** become plain text.
  - **Pages:** become views.
  - **Stencil images:** are left out, because draw.io's icon terms differ from its code license [FB §2.1].
- **Why.** It is the most used free tool, and D2's top request [A61].
- **Risks.**
  - Mapping styles to components is messy.
  - Untrusted XML: read it with a strict reader that refuses entities, as ADR 0027's SVG cleaner does.
- **Where.** M6c, after R34. The import ADR, and the spec's "draw.io import: Not planned" changed.

**R38 · Starter packages and sample projects per domain**
- **What.** Built-in packages, each with cleaned icons under a recorded license, a sample project, a scenario and, after R45, a tour:
  - **Architecture (C4):** Person, Software system, Container, Component, Deployment node, in M6c.
  - **Data science pipelines:** Source, Transform, Feature store, Model, Dashboard, in M6c.
  - **Machine learning:** Dataset, Layer, Tensor, Model, Metric, with case 3.
  - **Physical AI and robotics:** Link, Joint, Sensor, Actuator, Controller, Topic, with M9.
  - **Neuroscience and anatomy:** Region, Nucleus, Neuron population, Pathway, with M13.
  
  *New project from a sample* starts from any of them.
- **Why.** 4.7.
- **Risks.**
  - Icon licenses [NV].
  - Built-in names are translated (ADR 0038), so each package costs translation too.
- **Where.** M6c, then with each case. A data and icon license ADR, as FB §9 proposed.

**R39 · Sharing packages between projects**
- **What.**
  - *Add a package from another project* copies a `.vapackage`, with its images, keeping its ids.
  - Updating from the source shows what changed before applying it.
  - Packages gain optional version and attribution fields.
- **Why.** 4.15. Shared libraries are how notations spread in other tools [E6].
- **Risks.** Id clashes, which reserved ids (ADR 0018) partly prevent; two copies drifting apart.
- **Where.** M6c.

**R40 · Destinations**
- **What.** An attribute type whose value opens something, and stays valid across renames because it is kept by id:
  - a view of this project, opened focused on the element, as Structurizr opens a view on double-click [X11];
  - a view of another project, by relative path, opened through the local program;
  - a web address, shown as text and opened only on a click with confirmation, in a new tab without access to the app.
- **Why.** 4.3.
- **Where.** M8. A new ADR covers other projects and web addresses; the term *destination*.

**R41 · Live values**
- **What.**
  - A channel through which Claude now, and packages with network permission after M7, send attribute values for elements and relations.
  - Live values are kept only while the app is open: never saved, never in the history.
  - They are shown by overlays (R12) and the detail, with a mark and the time each value arrived.
  - *Keep as attribute* turns a live value into an ordinary, undoable edit.
- **Why.** 4.11. It lets Claude show latency, cost or firing rates without filling the history.
- **Risks.**
  - Confusing live and stored values; the mark guards against it.
  - The live connection needs a rate limit.
- **Where.** M8, with R12. A new ADR, modelled on ADR 0031; the term *live value*.

**R42 · An element list**
- **What.**
  - A panel listing a component's elements, or a view's scope, with their attributes as columns: sorted, filtered, edited in place.
  - A pasted block of cells is one undoable action.
  - Its selection follows the canvas, and the canvas follows it.
- **Why.** 4.12.
- **Where.** M8. The term *element list*.

**R43 · Time ranges**
- **What.** A range filter on a date, time or number attribute, such as an epoch or a validity period, with a slider and a playback that moves the range. The app keeps it, as ADR 0025 does for filters. Later it links to versions (R47).
- **Why.** 4.14, and the *Time* dimension's "epochs".
- **Where.** M8.

**R44 · A reading benchmark at 100,000 elements**
- **What.**
  - A synthetic project of 100,000 elements and 200,000 relations, opened with containers collapsed.
  - Targets to fix in the plan, for example:
    - 60 fps while fewer than 10,000 shapes show;
    - expanding a container of 1,000 under 100 ms;
    - a search under 50 ms.
  - Instanced drawing when zoomed out, and layout only for what is opened, as Model Explorer does [A69].
- **Why.** 4.13, before anatomy (M13).
- **Where.** M8; a reading line in CLAUDE.md's budget.

**R45 · Tours as recorded guidance, played full screen**
- **What.**
  - A tour file of steps. Each step is a view state (R26), a caption, guidance marks and, optionally, a scenario to play.
  - **Recording:** *Add step* takes the current view state, or Claude writes the tour.
  - **Playing full screen:** panels hide; keys go forward and back; a progress line and speaker notes show.
  - **The camera:** moves are short and eased, and under reduced motion each step is a cut.
  - **Missing elements:** a step that names an element that no longer exists is kept and flagged, as broken steps are.
  - Tours play in the read-only page (R32).
- **Why.** 4.8. The building blocks already exist in guidance, which makes this the cheapest high-impact item after v0.1.
- **Risks.** Long zoom flights cause motion sickness [PR2]: cap the camera's travel per step.
- **Where.** M11, moved to run right after M6b. It needs a new ADR, the `.vatour` extension in CLAUDE.md's file rule, and the term *full-screen playback* if it is wanted as a name.

**R46 · Comments kept in the project**
- **What.**
  - Threads anchored to an element, a relation, a view or a point of a view, kept in project files so they travel with git.
  - Each comment has an author (a preference, under ADR 0032), a time and a resolved state.
  - On the canvas they show as pins, and a panel lists them.
  - Claude reads and answers them, and can be asked to work through the open ones.
- **Why.** 4.9.
- **Where.** M11. It needs a new ADR, a file kind or keys in view files, and the term *comment*, distinct from *note*.

**R47 · Comparing versions**
- **What.**
  - *Compare with…* takes a commit, a branch or the last saved state.
  - The local program reads the older files through git's plumbing (`git cat-file`), read-only.
  - The core works out the differences by id: elements, relations, attributes, definitions, positions and routes.
  - The canvas draws the view with what was added, removed or changed marked, with a legend safe for color-blind readers, a list of changes, and keys to step through them.
  - The command line writes a Markdown summary and SVGs before, after and of the comparison (R31), for pull requests.
- **Why.** 4.10. Stable ids make this exact, where others resort to pixel diffs [D14].
- **Risks.**
  - Some git settings start programs, such as `core.fsmonitor`, external diff drivers and textconv filters. Plumbing commands avoid diff drivers, and such settings should be overridden on the command line.
  - Large histories.
  - Renamed files.
- **Where.** M11b. A new ADR; the term *comparison*.

**R48 · Proposals**
- **What.**
  - An optional preference under which Claude's write calls become proposals.
  - A proposal is drawn as a comparison (R47's drawing) and the person accepts or rejects it. Once accepted, it becomes one undoable action labelled Claude.
  - Direct application stays the default.
- **Why.** 4.19. DrawSQL shows the AI's changes as a diff before applying them [A63], and AI content is often ungrounded [AI7, AI25].
- **Risks.** How an MCP call reports "pending" while it waits for the person.
- **Where.** M11b. A new ADR or an addendum to ADR 0029; the term *proposal*.

**R49 · A git merge driver**
- **What.**
  - `visual-anything merge-driver`, named in `.gitattributes` for the five file kinds.
  - It merges by id, joining independent changes.
  - It leaves conflicts as data that the app shows when the project opens, never as markers that break the JSON.
  - It is never installed automatically: git requires each clone's own configuration to name the driver.
- **Why.** Git is the spec's answer to collaboration. draw.io's compressed files [D14] and tldraw offline's refusal to merge outside edits [T8] show how easily that answer fails.
- **Where.** M11b; a new ADR.

**R50 · More languages**
- **What.** Brazilian Portuguese next, then others, through the existing catalog, with its tests.
- **Where.** Track L, as a new stage L2.

### 5.3 What to do first, and in what order

**Do first (8):**
1. **R25 · Search and jump** (v0.1, S).
2. **R26 · View addresses on one view state** (v0.1, S). The same value serves R32, R45 and R46.
3. **R27 · PNG export** (v0.1, S).
4. **R28 · The history panel** (v0.1, S). It makes a success criterion visible.
5. **R29 · Recipes for Claude** (v0.1, S). Import for the price of documentation.
6. **R30 · Scopes** (M6c, first). Everything large depends on it.
7. **R32 · The read-only page** (M6b). Sharing, embedding and phones in one piece.
8. **R45 · Tours played full screen** (M11, moved forward). Mostly built from guidance.

**The milestones after v0.1, in the order I recommend.** The user's practice is to run milestones in parallel waves, so the dependencies matter more than the order:

| Wave | Milestone | Holds | Needs |
|---|---|---|---|
| 0 | M6 · Dogfooding and v0.1 | today's tasks, plus R25 to R29 | — |
| 1 | **M6b · Out** (new) | R31, R32, R33; R19 moves here from M11 | v0.1; R26's view state |
| 1 | **M6c · In** (new) | R30 first, in the core; then R34 to R39 | v0.1; the import ADR; R30 before any importer |
| 2 | M7 · Package code | unchanged | v0.1 |
| 2 | M8 · Detail and data (narrowed) | R11, R12, R13, R40, R41, R42, R43, R44 | R30 for R42's scope list |
| 2 | M11 · Tours and comments (moved before M9; export leaves it) | R17 as R45, R46 | R26; R32 to play tours in the page |
| 3 | **M8b · Beyond boxes** (new; the rest of M8) | R8, R10, R16, curves drawn by layout (R18) | M8 |
| 3 | **M11b · Versions** (new) | R47, R48, R49 | R31's SVG writer for reports |
| 4 | M9, M10, M12, M13 | unchanged; M13 also uses R38's license ADR and R44's benchmark | as in the spec |
| beside | Track L, stage L2 | R50 | L1 |

**How R1 to R24 move:**
- **R19** is superseded by R27 (v0.1) and R31 (M6b), and leaves M11.
- **R17** is extended by R45, and M11 runs before M9.
- **R12** goes first in M8, beside R41.
- **R11 and R13** stay in M8.
- **R8, R10 and R16, and curves drawn by layout (R18),** move to M8b.
- **R21's draft ADR** takes the next free number (section 2).
- **R6 and R7** stay in Track A.
- **R20 to R23** keep their milestones.

### 5.4 Decisions these need

- **New ADRs:**
  - scopes (R30), superseding ADR 0025's "every view shows the whole model";
  - the read-only page (R32);
  - imports (R34 to R37);
  - data and icon licenses (R38);
  - destinations to other projects and web addresses (R40);
  - live values (R41);
  - tour files (R45);
  - comments (R46);
  - comparing versions through git (R47);
  - proposals (R48);
  - the merge driver (R49).
- **Dated addenda:** ADR 0030 for view addresses (R26); ADR 0014 for the SVG writer (R31).
- **Spec changes:**
  - R25 to R29 in M6;
  - the new milestones M6b, M6c, M8b and M11b;
  - M11 moved forward and without export;
  - "draw.io import: Not planned" changed (R37);
  - "Mobile out of scope" changed to "mobile reading through the read-only page" (R32);
  - "Tours: v0.2" moved to M11's new place.
- **CLAUDE.md:**
  - the file rule gains `.vatour`, and a comments file if R46 chooses one;
  - the performance budget gains a reading line (R44);
  - a security line: an exported page never carries a token and connects nowhere.
- **CONTEXT.md, proposed entries,** each with its Avoid list:

  | Term | Proposed definition | Avoid |
  |---|---|---|
  | **Scope** | The part of the model a view shows, given by rules and by elements added or left out by hand | subset, query, filter (a filter hides shapes of what the scope shows) |
  | **View state** | The view, camera, selection, filters, focus and playing step that a view address, a tour step and a read-only page restore | snapshot, bookmark |
  | **View address** | An address that opens a project at a view state | deep link, permalink |
  | **Read-only page** | One HTML file made from a project that shows its views, scenarios and tours in any browser without the local program, and changes nothing | static site, viewer, export (alone) |
  | **Destination** | An attribute value that names a view of this project, a view of another project or a web address, and opens it | link, hyperlink, reference |
  | **Element list** | A panel listing elements with their attributes as columns, edited in place | spreadsheet, data table, grid |
  | **Live value** | An attribute's value that comes from outside while the app is open and is never stored | telemetry, metric, live data |
  | **Comment** | A remark with an author, anchored to an element, a relation or a place in a view, kept in the project until resolved | note (a free shape), annotation |
  | **Comparison** | A view drawn with what changed between two versions of the project marked | diff (in the app's text), delta |
  | **Proposal** | A change Claude asks to make, which the person accepts or rejects before it is applied | suggestion, draft |

---

## 6. What not to do

- **Real-time co-editing, now.**
  - It needs a merging engine and a server or peer network. It contradicts the spec ("No real-time editing"), ADR 0016's single owner and ADR 0013's absence of a hosted server.
  - Comments (R46), the merge driver (R49), the read-only page (R32) and view addresses (R26) cover the asynchronous case teams actually have.
- **Accounts or a hosted sharing service.** ADR 0013 rules out a hosted server. The read-only page lets people publish wherever they already do, and Structurizr's cloud end of life [A15] shows the cost of running one.
- **Scripts that run from project files.** tldraw offline runs a file's scripts when it opens [T7]. That is exactly the "code that runs" CLAUDE.md forbids. Package code waits for M7's sandbox and approvals.
- **A marketplace of packages before M7.** Trust, approval and updates must exist first. R39's copying covers sharing until then.
- **Native importers for every infrastructure format, or a local program that calls cloud APIs.** Claude already reads Terraform, Kubernetes manifests, OpenAPI and traces through recipes (R29). The local program fetches nothing for Claude [R]. Package code with network permission comes after M7.
- **An AI that regenerates a view from scratch.** That is the most common AI complaint [AI14, AI20]. Every change of Claude's stays a command on what exists.
- **Pixel diffs between versions.** Compare by id (R47). Images compared pixel by pixel miss moves and renames and flag antialiasing.
- **Long zoom flights in tours.** Motion sickness is Prezi's most cited complaint [PR2, PR3]. Use short, eased moves and cuts under reduced motion.
- **A mobile editing app.** Phones read through the read-only page. Editing on touch is a second interface to keep accessible and fast.
- **Importing draw.io's HTML labels or stencil images as they are.** HTML becomes text, given CVE-2026-46642 [FB §2.1]. The icons have their own terms [FB §2.1].
- **Measuring tools on the 2D canvas.** No tool reviewed documents one, and no case asks for it [NV]. Measurement belongs to physical space (M10), if a case needs it.
- **Becoming a slide tool.** Playing tours full screen is enough. Polls, transitions, themes for slides and video editing are Prezi's and Miro's products, not this one.
- **An embedded chat inside the app before tours and proposals.** The spec already makes it an optional package. Claude through MCP is the product's choice.
- **Still, from the first benchmark** [FB §5]: a 2D/3D toggle per view, an iframe per element, HTML with scripts or glTF with behavior in a project, requiring WebGPU, and tldraw as a base.

---

## 7. Sources

Sections 1, 3.2, 3.3 and 5 summarize sources listed here. A source used only through the first benchmark is cited as [FB §n], and its link is in `docs/designs/benchmark.md` §10.

**Repository** (read on 2026-10-24, `develop` at `3a459f9`)
- `CLAUDE.md`, `CONTEXT.md`, `docs/spec-v0.1.md`, `docs/playbook.md`
- `docs/adr/0003`, `0014`, `0016`, `0018`, `0019`, `0021`, `0022`, `0023`, `0024`, `0025`, `0027`, `0028`, `0029`, `0030`, `0031`, `0032`, `0033`, `0034`, `0035`, `0037`, `0038`, `0039`, and every ADR's title and status
- `docs/designs/README.md`, `benchmark.md`, `components.md` §7, and the headings of `look-and-feel.md`, `relation-routing.md`, `stacking-and-nesting.md`
- `packages/schema/src/files.ts` (`ViewFile`, `Color`); `packages/server/src/claude/*.ts` (tool names); `packages/app/src/canvas/`, `packages/app/src/canvas/layout/`, `packages/app/src/shell/`, `packages/core/src/`
- Git history: `3a459f9`, `0707892` and the merges listed by `git log`

**Diagramming and whiteboards**
- D1 https://www.drawio.com/doc/faq/shape-metadata
- D2 https://www.drawio.com/docs/manual/layers/how-layers-work/
- D3 https://www.drawio.com/docs/manual/connectors/connectors-join/
- D4 https://drawio.com/doc/faq/add-remove-waypoints
- D5 https://www.drawio.com/docs/manual/layouts/
- D6 https://drawio.com/doc/faq/collapse-expand-enable-disable
- D7 https://www.drawio.com/docs/manual/editor/appearance/adaptive-colours/
- D8 https://www.drawio.com/docs/manual/import/import-formats/
- D9 https://www.drawio.com/docs/manual/export/export-diagram/
- D10 https://www.drawio.com/blog/tags/animation/
- D11 https://drawio.com/blog/explore-diagrams
- D12 https://www.drawio.com/docs/manual/collaboration/concurrent-editing/
- D13 https://drawio.com/doc/faq/confluence-comments
- D14 https://www.innoq.com/en/blog/draw-the-diff
- D15 https://github.com/jgraph/drawio
- D16 https://cdn.jsdelivr.net/gh/jgraph/drawio-mcp@main/README.md
- D17 https://www.drawio.com/docs/manual/generate/generated-diagrams-examples/
- D18 https://www.drawio.com/docs/reference/plugins/
- D19 https://capterra.com/p/166985/draw-io/reviews/
- D20 https://www.softwareadvice.com/diagram/draw-io-profile/reviews/
- D21 https://community.atlassian.com/forums/Confluence-questions/Embed-draw-io-diagram-as-SVG-to-speed-up-loading-time-and-keep/qaq-p/2106601
- L1 https://lucid.co/techblog/unlocking-the-power-of-data-driven-diagrams
- L3 https://community.lucid.co/product-questions-3/how-can-i-add-collapsible-containers-in-lucid-4816
- L4 https://community.lucid.co/product-questions-3/connecting-lines-to-lines-in-lucidchart-2344
- L5 https://help.lucid.co/hc/en-us/articles/16389149809428
- L6 https://help.lucid.co/hc/en-us/articles/29549366940948
- L7 https://help.lucid.co/hc/en-us/articles/16471565238292
- L8 https://help.lucid.co/hc/en-us/articles/15994195704596-Create-a-presentation-in-Lucid
- L9 https://community.lucid.co/product-questions-3/how-to-show-layers-one-at-a-time-in-presentation-mode-763
- L10 https://community.lucid.co/product-questions-3/is-there-a-limit-to-shapes-or-conditional-formatting-rules-on-a-diagram-in-lucidchart-12548
- L11 https://community.lucid.co/product-questions-3/lucidchart-free-plan-60-shape-restriction-122
- L12 https://community.lucid.co/ideas/is-there-a-desktop-version-windows-for-lucidchart-so-i-can-work-offiline-814
- L13 https://lucid.co/accessibility
- L15 https://developer.lucid.co/extension-api/
- L16 https://community.lucid.co/community-news-and-announcements-9/introducing-the-lucid-model-context-protocol-mcp-server-12230
- L17 https://community.lucid.co/product-updates/lucid-suite-release-notes-june-2026-13650
- L18 https://community.lucid.co/product-questions-3/my-lucid-diagram-is-very-slow-14031
- L19 https://www.capterra.com/p/146136/Lucidchart/reviews/6037685/
- L20 https://app.lucid.co/blog/developer-tools-for-partners
- L21 https://community.lucid.co/ideas/export-lucidchart-diagrams-to-mermaid-code-2677
- L22 https://community.lucid.co/ideas/search-jump-to-and-highlight-shape-data-in-a-document-12125
- M1 https://miro.com/compare/miro-vs-lucidchart/diagramming
- M2 https://community.miro.com/ideas/auto-layouting-diagrams-with-layer-support-20865
- M3 https://help.miro.com/hc/articles/34307373858450
- M4 https://help.miro.com/hc/articles/360021668819
- M5 https://community.miro.com/ideas/offline-mode-925
- M6 https://developers.miro.com/docs
- M7 https://developers.miro.com/docs/miro-mcp-server-frequently-asked-questions
- M8 https://miro.com/newsroom/miro-takes-aim-at-the-gap-between-ai-potential-and-organizational-reality
- M9 https://miro.com/blog/whats-new-may-2026/
- M10 https://miro.com/accessibility/changelog/
- M11 https://community.miro.com/ideas/board-size-and-performance-27329
- M12 https://community.miro.com/ask-the-community-45/miro-boards-starting-slowly-18141
- M13 https://community.miro.com/miro-for-work-48/feeling-ripped-off-by-miro-billing-plans-5923
- M15 https://miro.com/templates/
- T1 https://tldraw.dev/blog/tldraw-sdk-4-0
- T2 https://tldraw.dev/sdk-features/license-key
- T3 https://tldraw.dev/blog/tldraw-sdk-5-0
- T5 https://tldraw.dev/blog/tldraw-sdk-5-3
- T6 https://tldraw.dev/blog/tldraw-sdk-5-4
- T7 https://tldraw.dev/blog/tldraw-offline
- T8 https://github.com/tldraw/tldraw-offline
- T9 https://tldraw.dev/blog/tldraw-mcp-app
- T10 https://tldraw.dev/sdk-features/accessibility
- T11 https://tldraw.dev/sdk-features/culling
- T12 https://tldraw.dev/sdk-features/bindings and https://tldraw.dev/releases/v3.13.0
- T13 https://tldraw.dev/docs/sync
- T14 https://tldraw.dev/blog/whats-new-2025
- T16 https://tldraw.dev/blog/introducing-tldraw-offline-multiplayer
- E1 https://github.com/excalidraw/excalidraw
- E2 https://plus.excalidraw.com/changelog
- E3 https://plus.excalidraw.com/roadmap
- E4 https://plus.excalidraw.com/plus
- E5 https://github.com/excalidraw/excalidraw-mcp
- E6 https://libraries.excalidraw.com/
- E8 https://us.fitgap.com/products/excalidraw
- E9 https://freetier.co/alternatives/excalidraw
- E10 https://plus.excalidraw.com/de/pricing
- F1 https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts
- F6 https://help.figma.com/hc/en-us/articles/6956360971415
- F7 https://forum.figma.com/report-a-problem-6/figjam-memory-issues-asking-to-open-in-recovery-mode-only-46108
- W1 https://whimsical.com/learn/integrations/remote-mcp
- W4 https://whimsical.com/learn/faqs/offline
- W6 https://whimsical.com/learn/boards/presenting
- W8 https://whimsical.com/learn/faqs/version-history
- W11 https://whimsical.com/learn/boards/sections-and-objects

**AI-native diagramming**
- AI1 https://eraser.io/ai
- AI2 https://docs.eraser.io/docs/mcp
- AI3 https://makerstack.co/reviews/eraser-review/
- AI4 https://lucid.co/alternative/best-eraser-alternatives
- AI6 https://www.napkin.ai/blog/napkin-launches-editing/
- AI7 https://techcrunch.com/2024/08/07/napkin-turns-text-into-visuals-with-a-bit-of-generative-ai
- AI8 https://whimsical.com/learn/ai/mcp-tools
- AI9 https://whimsical.com/learn/integrations/desktop-mcp
- AI10 https://tldraw.dev/starter-kits/agent
- AI11 https://ai.engineer/talks/sPUjIBH5Cwg-agents-on-canvas-in-tldraw
- AI12 https://developers.miro.com/docs/mcp-intro
- AI14 https://community.miro.com/ideas/allow-free-form-miro-ai-requests-or-at-least-the-ability-for-to-ask-miro-ai-to-edit-existing-diagrams-25943
- AI15 https://community.lucid.co/community-news-and-announcements-9/new-capabilities-for-the-lucid-mcp-server-generate-mermaid-diagrams-timelines-and-link-data-with-ai-14121
- AI16 https://mermaid.js.org/ecosystem/mermaid-chart
- AI17 https://hn.svelte.dev/item/47823460
- AI18 https://www.drawio.com/docs/manual/generate/ai-models/
- AI19 https://docs.excalidraw.com/docs/@excalidraw/mermaid-to-excalidraw/api
- AI20 https://help.figma.com/hc/en-us/articles/18706554628119
- AI25 https://icepanel.io/blog/comparison-llms-for-creating-software-architecture-diagrams

**Import, export, versions, accessibility and addresses**
- X1 https://www.drawio.com/docs/manual/insert/insert-from-csv/
- X3 https://help.lucid.co/hc/en-us/articles/16493391394068
- X6 https://icepanel.io/blog/new-model-as-code-import-json-yaml
- X8 https://github.com/ahmedkhaleel2004/gitdiagram
- X9 https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/connector/servicegraphconnector/README.md
- X10 https://d2lang.com/tour/exports/
- X11 https://docs.structurizr.com/export/static-site
- X12 https://likec4.dev/tooling/cli/
- X13 https://github.blog/2022-02-14-include-diagrams-markdown-files-mermaid
- X14 https://marketplace.visualstudio.com/items?itemName=hediet.vscode-drawio
- X16 https://docs.structurizr.com/server/workspace-versions
- X19 https://www.skills.sh/jovaneyck/skills/c4-diff
- X20 https://architecto.dev/features/architecture-diff
- X21 https://mermaid.js.org/config/accessibility.html
- X22 https://www.w3.org/WAI/tutorials/images/complex/
- X23 https://help.lucid.co/hc/en-us/articles/30939569926164
- X24 https://content.ieeevis.org/year/2023/paper_v-full-1580.html
- X25 https://www.drawio.com/doc/faq/custom-links

**Architecture modeling, data and ML**
- A1 https://icepanel.io/
- A2 https://icepanel.io/pricing
- A3 https://docs.icepanel.io/experiments/mcp-server-beta
- A4 https://developer.icepanel.io/core-concepts/versions
- A5 https://docs.icepanel.io/llms.txt
- A6 https://docs.icepanel.io/core-features/export.md
- A7 https://docs.icepanel.io/core-features/model-imports.md
- A9 https://docs.icepanel.io/collaboration/sharing.md
- A13 https://www.thoughtworks.com/en-ca/radar/platforms/icepanel
- A14 https://docs.structurizr.com/
- A15 https://docs.structurizr.com/eol
- A16 https://docs.structurizr.com/ai/mcp
- A17 https://docs.structurizr.com/ui/diagrams
- A18 https://docs.structurizr.com/ui/diagrams/automatic-layout
- A19 https://docs.structurizr.com/ui/diagrams/perspectives
- A20 https://docs.structurizr.com/dsl/implied-relationships
- A21 https://docs.structurizr.com/local
- A25 https://www.ilograph.com/desktop/releaseNotes.txt
- A26 https://www.ilograph.com/docs/editing/contexts/
- A27 https://www.ilograph.com/docs/editing/perspectives/
- A28 https://www.ilograph.com/desktop/
- A29 https://www.ilograph.com/docs/cli-and-export-api/
- A30 https://www.ilograph.com/docs/
- A33 https://likec4.dev/
- A34 https://likec4.dev/tooling/mcp/
- A35 https://github.com/likec4/likec4/releases
- A37 https://github.com/likec4/likec4/issues/751
- A38 https://github.com/likec4/likec4/issues/1705
- A40 https://www.archimatetool.com/?p=3447
- A43 https://github.com/archimatetool/archi/issues?q=is%3Aissue+is%3Aopen+sort%3Areactions-%2B1-desc
- A45 https://www.sparxsystems.jp/en/MCP/
- A48 https://g2.com/products/enterprise-architect/reviews
- A49 https://www.3ds.com/products/catia/catia-magic/sysmlv2.md
- A53 https://github.com/mermaid-js/mermaid/releases/tag/mermaid@12.0.0
- A54 https://mermaid.js.org/syntax/architecture.html
- A57 https://forum.obsidian.md/t/mermaid-js-diagram-unreadable-due-to-large-size/23769 and https://gitlab.com/gitlab-org/gitlab/-/issues/352452
- A58 https://github.com/terrastruct/d2/releases/tag/v0.9.0
- A61 https://github.com/terrastruct/d2/issues?q=is%3Aissue+is%3Aopen+sort%3Areactions-%2B1-desc
- A62 https://dbdiagram.io/home
- A63 https://drawsql.app/
- A64 https://github.com/chartdb/chartdb
- A65 https://github.com/drawdb-io/drawdb
- A66 https://github.com/lutzroeder/netron
- A68 https://github.com/tensorflow/tensorboard/releases
- A69 https://research.google/blog/model-explorer/
- A70 https://developers.google.com/edge/model-explorer
- A71 https://github.com/google-ai-edge/model-explorer
- A73 https://docs.datadoghq.com/datadog_cloudcraft/

**Graphs and networks**
- K1 https://docs.kumu.io/llms.txt
- K2 https://docs.kumu.io/guides/presentations.md
- K3 https://docs.kumu.io/frequently-asked-questions/how-do-i-connect-a-connection-to-another-connection-split-or-branching-connections.md
- K4 https://docs.kumu.io/guides/export.md
- K5 https://docs.kumu.io/frequently-asked-questions/does-kumu-have-a-public-api.md
- K6 https://docs.kumu.io/guides/clustering.md
- K7 https://docs.kumu.io/guides/controls/tagged-timeline-control.md
- K8 https://docs.kumu.io/guides/views.md
- K9 https://docs.kumu.io/frequently-asked-questions/what-pricing-plans-does-kumu-have.md
- K11 https://docs.kumu.io/guides/share-and-embed.md
- K12 https://docs.kumu.io/guides/legends.md
- K13 https://docs.kumu.io/guides/focus.md
- K14 https://docs.kumu.io/guides/import/excel-csv.md
- K15 https://docs.kumu.io/guides/import/google-sheets.md
- K16 https://www.undp.org/node/417111
- K19 https://docs.kumu.io/frequently-asked-questions/how-much-data-can-kumu-handle
- Y3 https://yed.yworks.com/support/manual/
- Y4 https://yed.yworks.com/support/qa/22442/add-a-dark-mode
- Y8 https://www.yfiles.com/the-yfiles-sdk/web/yfiles-for-html/release-notes
- Y10 https://www.yworks.com/blog/yfileshtml24
- G1 https://gephi.wordpress.com/
- G2 http://gephi.org/desktop/
- G3 https://gephi.org/lite/
- G4 http://docs.gephi.org/lite/user-manual/differences-with-gephi/
- G5 https://www.capterra.com/p/233118/Gephi/
- C1 https://cytoscape.org/releasenotes.html
- C2 https://manual.cytoscape.org/en/stable/Export_Your_Data.html
- C3 https://manual.cytoscape.org/en/stable/Creating_Networks.html
- C4 https://chianti.ucsd.edu/cytoscape-3.1.1/API/org/cytoscape/group/CyGroup.html
- C5 https://cytoscape.org/cytoscape-tutorials/protocols/group-nodes/
- C6 https://cytoscape-web.readthedocs.io/en/latest/Introduction.html
- C7 https://idekerlab.ucsd.edu/wp-content/uploads/2025/05/Ono-NucleicAcidsRes-2025.pdf
- CJ1 https://js.cytoscape.org/
- CJ2 https://blog.js.cytoscape.org/2025/01/13/webgl-preview/
- N1 https://neo4j.com/docs/aura/explore/introduction/
- N2 https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/bloom-overview/
- N3 https://neo4j.com/docs/bloom-user-guide/current/bloom-tutorial/slicer/
- GR1 https://www.graphistry.com/
- GR2 https://github.com/graphistry/pygraphistry
- GR3 https://hub.graphistry.com/docs/ui/index

**Knowledge canvases**
- O1 https://obsidian.md/help/plugins/canvas
- O2 https://jsoncanvas.org/spec/1.0/
- O3 https://obsidian.md/blog/json-canvas/
- O4 https://forum.obsidian.md/t/canvas-sluggish-performance-issue-when-multiple-nodes-enter-exit-the-view/68609
- O6 https://forum.obsidian.md/t/canvas-ability-to-link-to-a-specific-group-a-selected-section-a-card-of-a-canvas/49779
- O7 https://community.obsidian.md/plugins/advanced-canvas
- O12 https://forum.obsidian.md/t/is-there-a-way-to-link-between-nodes-cards-of-different-canvases/73618
- H1 https://wiki.heptabase.com/roadmap
- H9 https://toolguide.io/en/tool/heptabase/
- H11 https://wiki.heptabase.com/
- KO1 https://www.kosmik.app/
- AL1 https://allume.com/
- KI1 https://kinopio.club/

**Science and anatomy**
- B1 https://www.biorender.com/
- B3 https://www.biorender.com/terms-of-service
- B4 https://biorender.com/ai-tools
- B7 https://www.imss.caltech.edu/news/biorender
- B8 https://conceptviz.app/blog/biorender-pricing-2026
- BD1 https://www.biodigital.com/product/the-biodigital-human
- BD2 https://www.biodigital.com/3d-human-studio
- BD3 https://developer.biodigital.com/pages/documentation/1/getting-started/intro.html
- BD4 https://developer.biodigital.com/pages/documentation/1/integration/map-annotations.html
- BD5 https://apps.apple.com/us/app/biodigital-3d-human-anatomy/id771825569
- BD6 https://www.commonsensemedia.org/website-reviews/biodigital
- BD7 https://support.biodigital.com/hc/en-us/articles/360021316214
- Z1 https://www.zygotebody.com/
- CA1 https://www.elsevier.com/products/complete-anatomy
- CA2 https://apps.apple.com/us/app/complete-anatomy-platform/id1141323850
- VB1 https://www.visiblebody.com/mycourse
- AB2 https://brain-map.org/support/documentation/abc-atlas-user-guide
- SI2 https://ebrains.eu/news-and-events/2023/siibra-explorer-tutorial-zooming-into-a-brain-region-of-interest-to-the-level
- NG2 https://tutorial.microns-explorer.org/neuroglancer-basic.html

**Explorable explanations, zoomable interfaces and research**
- DI1 https://distill.pub/2021/distill-hiatus/
- DI2 https://distill.pub/2020/communicating-with-interactive-articles/
- ID1 https://github.com/idyll-lang/idyll
- OB1 https://macwright.com/2025/07/31/observable-notebooks-2
- OB2 https://hn.svelte.dev/item/45200642
- PO1 https://polypad.amplify.com/faqs
- PR1 https://prezi.com/blog/whats-new-in-prezi-ai-2026-features/
- PR2 https://dupple.com/reviews/prezi
- PR3 https://blogs.lse.ac.uk/impactofsocialsciences/2013/06/07/prezi-in-the-academic-environment
- PR4 https://checkthat.ai/brands/prezi-inc/reviews
- RE1 https://idl.uw.edu/papers/animated-transitions
- RE3 https://idl.uw.edu/papers/ellipsis
- RE4 https://idl.uw.edu/papers/sequence-structure
- RE5 https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0178774
