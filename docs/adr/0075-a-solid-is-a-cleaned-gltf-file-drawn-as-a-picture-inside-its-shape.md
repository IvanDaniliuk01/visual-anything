---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# A solid is a cleaned glTF file beside the project, drawn as a picture inside its shape and turned live only when asked

Case 5, a robotic arm and the human body, needs the real shape of things: the links of an arm, the chambers of a heart, a brain region. ADR 0003 kept physical space inside the components that need it, and ADR 0076, which supersedes it, keeps that and adds a panel beside the canvas (M10). The first benchmark's R20 proposed glTF meshes drawn inside shapes, as cached pictures while panning and live when explored, with a pipeline in the local program that cleans them. M9 builds it. This decision says what such a form in three dimensions is, where it is kept, how it is cleaned, how the canvas draws it within the budget, and how elements are anchored to its pieces as they are to an SVG image's named parts (ADR 0067).

## Decision

### What a solid is

- **A solid** is the form of something in three dimensions, which a package defines as it defines images (ADR 0027): a glTF 2.0 file that the local program cleaned into a canonical form, with an id that starts with its package's id, a name, a description, its source and license (ADR 0047), and the camera its pictures are drawn from.
- **It is data only.** Its file holds geometry, materials, embedded textures, a tree of nodes and, optionally, animations made of keyframes. Nothing in it runs, and nothing in it names anything outside it.
- **The word.** "Model" names the project's model, and "mesh" names one piece of geometry inside glTF and three.js, so neither can name the file as a whole. CONTEXT.md gains **Solid**, and avoids "3D model" for it.

### Where solids are kept

- **The file sits beside the project, named by its hash.** A solid's cleaned file is `solids/<hash>.glb`, where the hash is the SHA-256 of its bytes in lowercase hexadecimal. The file is written once, atomically, and never changed: a replaced solid is a new file. So undo and redo never write binary data, two branches that add solids never touch the same file, and the same solid imported twice is one file.
- **What the package keeps.** `PackageFile.solids` lists `SolidDefinition`s, which are JSON like everything else in a package:

  ```json
  "solids": [
    {
      "id": "robotics.arm-k3f9q2",
      "name": "Six-axis arm",
      "description": "A six-axis arm on a round base, its gripper open, seen from the front left.",
      "source": "Drawn for Visual Anything",
      "license": "CC0-1.0",
      "hash": "3f6c…e01a",
      "bytes": 412816,
      "bounds": { "min": { "x": -0.21, "y": 0, "z": -0.21 }, "max": { "x": 0.21, "y": 1.18, "z": 0.62 } },
      "counts": { "triangles": 38412, "vertices": 21880, "nodes": 14, "textures": 0 },
      "parts": [
        { "name": "base", "point": { "x": 0, "y": 0.06, "z": 0.2 } },
        { "name": "shoulder", "parent": 0, "point": { "x": 0, "y": 0.31, "z": 0.12 } }
      ],
      "camera": { "azimuth": 30, "elevation": 20 },
      "animations": [{ "duration": 4.5 }]
    }
  ]
  ```

  - `hash` names its file, `solids/<hash>.glb`, and `bytes` is the file's size.
  - `bounds`, `counts`, `parts` and `animations` are its description: what the core reads from the file. They are kept in the package so that the canvas, layout, the outline, comparisons, the read-only page and Claude know a solid's parts without its bytes. The program works the description out again when it first reads a file, and a file whose description differs is drawn as it is and warned about (`solid-not-clean`), as ADR 0027 warns about an image that cleaning would change.
  - A part's `parent` is the index of the part that holds it, and its `point` is the vertex of its own geometry nearest the middle of its bounds: a point on its surface where relations end and names are written. Numbers are written in meters, rounded to a tenth of a millimetre.
- **Why not in the package file, as bitmaps are.** A useful solid weighs from a few hundred kilobytes to tens of megabytes. In base64 it would be one line of a diff that changes whole, push packages past their 8 MiB cap (ADR 0030) and the live connection's 4 MiB message, and make every change to a package rewrite it. ADR 0027 named "files beside the project" as the path for large pictures; solids take it.
- **The files are project files of their own kind.** `solids/` must be a real folder, and each file a regular file within its cap, read as ADR 0030 reads project files. The file rule in CLAUDE.md gains them: binary glTF files that the local program cleaned, named by their hash, validated when first read and never run.
- **Checking a file.** Opening a project only looks at each file that a package names: it must exist, as a regular file of the size the definition says, or the solid is drawn as its placeholder and opening warns (`solid-file-missing`). A file is read, hashed and checked against its canonical form and its description the first time something needs its bytes. A file whose hash is not its name is never served, and its solid is drawn as its placeholder with `solid-not-clean`.
- **Nothing deletes a file on its own.** Undoing an import, or replacing a solid, leaves its file in place, since redo, a branch or a version may name it again. The Components tab lists the files in `solids/` that no package names, and Remove deletes them, saying that this cannot be undone; opening says how many there are. Repositories with many solids are better kept with Git LFS, which the README says; nothing depends on it.
- **Caps on a package and a project,** as ADR 0027 caps images: a package holds at most 64 solids, 4 MiB of their definitions' text and 256 MiB of their files. Opening warns from 128 MiB (`large-solids`), and the solids past 256 MiB, in file order, are drawn as their placeholders. A project holds at most 512 MiB of solid files, counted the same way in the order of its packages.

### How the local program cleans a file

- **What comes in.** A `.glb` file, or a `.gltf` file whose buffers and images are all `data:` addresses of the types below, at most 256 MiB, from any of:
  - Import… in the header, the app sending the file in pieces over the live connection;
  - `visual-anything import <folder> <file> [--units m|cm|mm|in] [--up y|z] [--simplify]`, through the running program (ADR 0049);
  - Claude's `import_solid`, which names a regular file inside the project folder.

  A file that refers to anything outside itself, an external buffer or image, is refused with `invalid-solid`, saying to bundle it as `.glb`. Nothing it names is ever read or fetched.
- **It is read, then written anew from an allow-list,** as images are (ADR 0027), in `server/src/solids/`:
  1. **Read** with `@gltf-transform/core` and `@gltf-transform/extensions` 4.5.1 (MIT), from bytes only: the program refuses every address before the reader sees the file, and gives it no network and no file access. A file compressed with `EXT_meshopt_compression` is decoded with meshoptimizer 1.3.0 (MIT); one compressed with Draco is refused, saying to export it without compression.
  2. **Keep** only:
     - the default scene, or else the first, with its nodes, each with its name, its children, its mesh, and its translation, rotation and scale, a matrix being split into these;
     - triangles, from primitives of mode 4, 5 or 6, as indexed triangle lists, with `POSITION`, `NORMAL`, `TANGENT`, `TEXCOORD_0`, `TEXCOORD_1` and `COLOR_0`;
     - materials of the core metallic-roughness model: base color, metallic and roughness, normal, occlusion and emissive, each with its factor and texture, `alphaMode`, `alphaCutoff` and `doubleSided`;
     - the extensions `KHR_materials_unlit`, `KHR_materials_emissive_strength`, `KHR_texture_transform`, `KHR_mesh_quantization` and `EXT_texture_webp`, which are numbers and nothing else;
     - textures that are PNG, JPEG or WebP, each rebuilt by the core's bitmap cleaner (ADR 0027), which drops their text, EXIF with its position, color profiles and times;
     - animations whose channels move nodes, by translation, rotation and scale, with linear, step or cubic-spline keyframes.
  3. **Drop, and report:**
     - `KHR_interactivity`, `KHR_animation_pointer` and every other extension, since some are behavior and the rest are not needed;
     - cameras and lights, since the app chooses its own;
     - skins and morph targets, which deform geometry (later, if a case needs them);
     - points and lines;
     - `extras`, every name but nodes', and `asset.copyright` and `generator`. A copyright is offered to the person as the solid's source in the import dialog, and goes nowhere else;
     - textures in any other format, KTX2 included, and those past their caps, the material keeping its factors;
     - nodes that draw nothing, with nothing below them that does.
  4. **Units and the up axis.** glTF is in meters with +Y up, but many files are not: a CAD export in millimetres reads a thousand times too large, and robotics tools put +Z up. The import dialog shows the solid's size in the unit chosen, meters by default, and the up axis, Y by default; the program scales and turns the geometry so that the stored file is in meters with +Y up.
  5. **Names.** A node keeps its name when it is of the form `[A-Za-z_][\w.-]{0,63}`, the class ADR 0027 keeps for ids, and no earlier node has it. Otherwise each character outside `[\w.-]` becomes `_`, a name that does not start with a letter or `_` gains a leading `_`, it is cut to 64 characters, and a name already taken gains `-2`, `-3` and so on, in depth-first order. The report lists every name it changed.
  6. **Simplify, when asked.** Past the cap on triangles, the import dialog offers to simplify the solid to fit, with meshoptimizer's simplifier, which keeps each node's own geometry; `--simplify` and `import_solid`'s `simplify` ask the same. Without it, such a file is refused.
  7. **Write** the canonical file: GLB, one JSON chunk and one binary chunk, keys and buffers in a fixed order, positions quantized to 16 bits and normals to 8 when `KHR_mesh_quantization` keeps them within a tenth of a millimetre, so that the same input always gives the same bytes and the same hash.
  8. **Describe and report:** the description above, worked out by the core, and what each step dropped or changed, in the core's words, in English and Spanish (ADR 0038).
- **The caps** (`solid-too-large`), each a named constant in the core (`SOLID_CAPS`):
  - the cleaned file: 32 MiB, under the 100 MiB that GitHub takes in one file, and its JSON chunk 8 MiB;
  - 1,000,000 triangles and 1,000,000 vertices;
  - 8,192 nodes, of which at most 4,096 are named parts; past 4,096, later named nodes in depth-first order lose their names, are drawn as part of the part holding them, and the report and opening warn with `too-many-parts`;
  - 4,096 meshes, 8,192 primitives and 256 materials;
  - 32 textures, each at most 2,048 pixels a side, 16 megapixels and 16 MiB of texture bytes in all;
  - 16 animations, each at most 60 s long, with at most 256 channels and 200,000 keyframes in all;
  - bounds of at most 100 km a side, and at least a micrometre across.
- **The work is bounded.** The program cleans in a worker thread, limited to 1 GiB and stopped after 30 s, so that a hostile file cannot stall it. The reader and meshoptimizer are loaded only when a solid is cleaned, and are in neither the app's page nor the read-only page. `@gltf-transform/functions` is not used: it brings `sharp`, a native module under libvips's LGPL that the single executables cannot carry (ADR 0037).
- **One action.** The program keeps a prepared file in memory, at most two at a time for ten minutes, while the person reads the preview and the report. Accepting it writes the file to `solids/` and then runs `define-solid`, one undoable action, `Import "arm.glb" as a solid`, by the person or by Claude. The program takes `define-solid` only for a file it holds, prepared or read, with the description it worked out; an app or Claude cannot define a solid it did not clean. `define-solid` on an existing id replaces its file.

### The canonical form and the core's reader

- **The core reads only the canonical form.** `core/src/solids/` holds `readSolid(bytes)`, a strict reader of exactly what the cleaner writes: the GLB container, the JSON chunk's keys and the allowed extensions, every buffer view and accessor within its chunk, `POSITION` bounds that match the data, triangle lists, texture headers read by the bitmap reader, node names of the class above, and the caps. It answers the description, or the problems that make the file not canonical. It is pure TypeScript and needs no GPU, so the program, the solid worker and the tests read files the same way.
- **The core works out the description** (`describeSolid`) from the geometry: bounds, counts, the named parts in depth-first order with their parents and points, and the animations' durations. `solidHash` is synchronous, as `codeHash` is (ADR 0060).
- **Checks.** `invalid-solid` and `solid-too-large` are refused by commands; opening warns with `large-solids`, `solid-file-missing`, `solid-not-clean`, and `unknown-solid` for an appearance that shows a solid no package defines. A solid that an appearance shows, or that a `part` names, cannot be removed (`in-use`, as ADR 0027 refuses for images).

### Named parts

- **A solid's named parts are its named nodes**, read from the cleaned file: CONTEXT.md's **Named part** now covers both an SVG image's pieces with an id and a solid's nodes with a name. A part holds its node's own geometry and everything below it that is not a named part of its own, so parts nest, as SVG parts do. Its name is its id.
- **Anchoring is ADR 0067's,** with a solid where it had an image:
  - `PartReference` gains `solid`, beside `image`, and holds one or the other: `{ "part": "elbow", "solid": "robotics.arm-k3f9q2" }`. Without either, the part is looked for in what the element's container shows with its parts, image or solid.
  - Anchor parts… matches a solid's parts to a drawing's contents by name, by id or by an external identifier through a crosswalk (ADR 0056), and creates elements for the parts that match nothing when asked, in one action. HRA's crosswalks map node names such as `VH_M_mitral_valve` to Uberon this way.
  - One content per part, the first in the model's order; a part a solid lacks warns `unknown-part`; replacing a solid keeps the anchors of the parts it still has, and says first which it loses (`solidPartsLostByReplacing`), as ADR 0067 says of images.

### Showing a solid

- **An appearance gains `solid`**: `{ "solid": "<id>", "placement": "drawing", "camera": { … }, "lighting": "studio" }`, or `none`, which takes an inherited one away. It inherits whole, as every trait does, and a project appearance can give one to a built-in component (ADR 0034).
  - `placement` is `icon`, `drawing`, the default, or `parts`, placed on the shape as an image of that placement is (ADR 0027, ADR 0067): beside the name, on a plate above a name band, or under the header of a drawing with parts, with no plate.
  - `camera` replaces the solid's own; `lighting` is `studio`, the default, or `flat`.
  - When an appearance shows both an image and a solid, the solid is drawn, and the inspector says that the image is not.
- **The camera** (`SolidCamera`) looks at the solid from a direction and fits it:
  - `azimuth`, in degrees from −180 to 180 around +Y, 0 looking from +Z, glTF's front, toward −Z;
  - `elevation`, in degrees from −89 to 89;
  - `zoom`, from 0.25 to 16, 1 fitting the solid's bounds with a margin of 4%;
  - `target`, the point it turns around, the middle of the bounds by default;
  - `projection`, `perspective` with a vertical field of view of 30°, the default, or `orthographic`.

  A solid's own camera starts as a three-quarter view, `azimuth` 30 and `elevation` 20. The fitting and the projection are pure functions in the core (`fitSolidCamera`, `projectSolidPoint`), which the scene and the solid worker both use, so that the points the scene places lie exactly where the picture draws them.
- **Lighting** is the app's, the same for every solid and in both themes, as stored colors are (ADR 0033):
  - `studio`: image-based light from three.js's generated room environment, which loads no file, and one key light from above the camera's left, with neutral tone mapping;
  - `flat`: base colors without light, for schematic solids.

  The picture's background is transparent, so the shape's fill shows behind it.

### Pictures, and turning

- **three.js runs only in the solid worker.** three 0.186.1 and three-mesh-bvh 0.9.16, both MIT, are pinned and imported only by the solid worker's module, which the app starts the first time the open view draws a solid or the physical-space panel opens (ADR 0076). The page's own thread never loads three.js. The worker keeps the policy every worker has, which allows no connection (ADR 0027): it is handed bytes and gives back pictures.
- **A reader of our own, not three.js's GLTFLoader.** The worker reads the canonical file with the core's reader and builds three.js objects from it: geometry, materials, textures decoded with `createImageBitmap`, nodes and animations. GLTFLoader resolves addresses and fetches embedded images through addresses of their own, which the worker's policy forbids and which nothing should ever do with a project's file.
- **Bytes reach the worker over the live connection,** never through an HTTP route, as images do (ADR 0027). The app asks the program for a file by its hash (`solid/get`), receives it in pieces of at most 1 MiB in base64 within the connection's 4 MiB, and hands it to the worker without keeping a copy. The live protocol takes the next free version.
- **Pictures.** The worker draws a solid's picture from its camera, in its lighting, at a bucket of 128, 256, 512, 1,024 or 2,048 pixels on its longer side, and hands it to the page as an `ImageBitmap`. The canvas draws pictures through ADR 0027's image store and its budgets: those of 256 pixels or fewer in the atlas, larger ones as textures of their own, at most one made a frame, those nearest the middle of the screen first, none while the canvas is zoomed out past every picture's scale. Pictures are kept for the session by the solid, the camera, the lighting, the parts hidden and the bucket. Until a picture arrives, its shape draws its placeholder, as an image's does.
- **The part buffer.** A picture of a drawing with parts comes with its part buffer: for each pixel, the index of the innermost named part drawn there, or none, drawn by the worker without light or smoothing. The page keeps it as numbers, for pointing, and as a texture, for drawing parts' states.
- **Turning.** CONTEXT.md gains **Turning**: drawing the selected shape's solid live in its shape so that the person can turn it, zoom into it and point at its parts. The roadmap's "live when you focus it" means this, since Focus reads a view from the selection (ADR 0025).
  - It starts from the shape's turn handle, shown on a selected shape whose picture is at least 96 pixels across, from the shape menu, or with T. Dragging turns the solid around its target, the wheel zooms it rather than the canvas, the arrows turn it by 15° and Shift with an arrow by 90°, + and − zoom, and 0 goes back to its camera. Escape, or selecting something else, ends it.
  - While it turns, the worker draws a frame, with its part buffer, whenever the camera changes, and the canvas shows the newest as the shape's picture, uploading at most one a frame. Relations that end on its parts follow their parts' points, routed again each frame as a drag routes them.
  - Turning changes nothing stored. Use this view, in the inspector and the turn handle's menu, stores the camera in the appearance, at the level the project can change, in one action.
  - A solid with animations shows Play while it turns: the animation plays in its frames, looping, until it is paused or turning ends. Animations never play on their own.
- **One WebGL context.** The worker draws everything, pictures, turning and the physical-space panel, with one three.js renderer on one canvas of its own, so that a solid's geometry and textures sit on the GPU once. It keeps the solids it drew lately within 768 MiB of estimated GPU memory, letting go of the least recently drawn first, and when the context is lost it gets it back and draws again what shows.

### Anchored parts of a solid on the canvas

- **A drawing with parts can show a solid.** Its header writes its name and its picture fills its body, at 320 canvas units on its longer side unless the view stores the shape's size, as ADR 0067 draws an image's at 1,600 at most. Its contents anchored to the solid's parts are drawn in the picture, as those parts, and have no positions of their own; its other contents sit below the picture.
- **Each part's state is drawn by one shader, without drawing the picture again.** The picture, its part buffer and a small table of states, one entry per part, are drawn together in one pass. The table gives each part:
  - a veil of the drawing's fill, for a part drawn faintly by focus or as the container of what a filter shows, or by an overlay's opacity;
  - an overlay's fill, laid over the part;
  - the marks of selection and hover, and the highlights of playback, guidance and a tour, drawn along the part's edges in the buffer, with a casing so that they keep 3:1 on any picture.

  A part's entry is worked out from the element it stands for and those of the parts holding it, so that selecting the heart marks its chambers too. A change of focus, selection, playback step or overlay rewrites the table and no picture.
- **Hidden parts are drawn again.** A part a filter or isolation hides must uncover what lies behind it, so the worker draws the picture again without it, and the old picture shows until the new one arrives.
- **Pointing.** The pixel of the part buffer under the pointer finds the part, exact to a pixel of the picture; before the picture arrives, the pointer finds the drawing. Box selection takes a part whose point lies inside the box. Keyboard navigation and the outline go through the parts in their solid's order.
- **Relations end at their parts' points**, the projection of each part's `point` by the camera, marked with a dot of 3 canvas units, since a picture gives no outline to attach on. Connection points and border attachments chosen by hand do not apply to them; bend points do. Layout treats the drawing as one block, with a port for each related part on the side nearest its point (ADR 0015's clarification).
- **Names.** A part writes its name beside its point in the hover and selection marks, and nowhere else on the canvas; the outline, the inspector and announcements give it as any shape's.
- **Levels of detail** (ADR 0055). A solid's picture shows from the scale its shape's level shows images; below it, the shape draws its kind and its parts are pointed at as the drawing.
- **A part drawn on its own,** outside a drawing with parts, is its solid's picture with only that part shown, fitted to the part's bounds from the same camera, as the drawing of its shape.

### The performance budget

The canvas keeps ADR 0014's budget with solids in it, because the page's thread never draws three dimensions: a solid costs it a picture.

- **The marks**, on the reference laptop, for a view of 10,000 elements of which 200 show solids, from 20 distinct solids, 4 of them at the caps, and 10 are drawings with parts holding 1,000 anchored parts:
  - pan, zoom and select at the 60 frames per second target;
  - with no picture made yet, the target holds while they arrive, and every picture on screen shows within 2 s of the solids' files reaching the app;
  - a change of focus, selection, playback step or overlay shows on parts in the frame that shows it;
  - a filter that hides parts shows the solid drawn again within 150 ms;
  - pointing at parts finds what is under the pointer within 1 ms at the 95th percentile;
  - turning keeps its frames at the target for a solid of 200,000 triangles, and at 30 frames per second at least at the caps, while the canvas's own frames keep the target;
  - a theme switch keeps A1's rule, since pictures do not change with the theme.
- The benchmark gains `?solids`, which makes canonical files of its own.

### Accessibility

- **A solid's description is its text alternative**, which the outline, the inspector and announcements give with its shape, such as "Arm, with a solid: a six-axis arm on a round base". The import dialog asks for one, the inspector says when a solid has none, and the license test asks one of every solid that ships.
- **Turning works from the keyboard,** as above, and announces where the solid is seen from, such as "Arm, seen from the front left, above".
- **Reduced motion.** Under reduced motion nothing turns on its own: a key or 0 cuts to the view it asks for, and animations do not play, so Play is not offered.
- **Contrast.** Marks on parts are drawn with a casing that keeps 3:1 against any picture, in both themes.

### Exports and the read-only page

- **From the app,** the PNG, the SVG and the PDF draw solids as the canvas does: the worker draws each picture at the export's scale with its parts' states, and the SVG holds it as a bitmap. The SVG also writes each anchored part as a transparent path traced from its part buffer, with its `data-` ids, so that a reader of the file can point at it.
- **From the command line and Claude's `export_view`,** which have no GPU, a solid is drawn as its placeholder: its shape's outline, its name and a mark, and what the export lost says so. Mermaid and Structurizr say they lost the solids, and the outline in Markdown lists them with their descriptions.
- **The read-only page** (ADR 0041) holds what its views draw:
  - by default, the files of the solids they show, three.js and the solid worker, which then turn in the page as in the app. The page's policy adds `worker-src blob:`, and its Trusted Types policy lets through that one worker's address;
  - or, when the Export dialog asks for pictures only, the pictures the app draws, and neither three.js nor the worker.

  A page whose views show no solid holds neither, and its policy stays as it is; the bundle and policy tests check both forms. The dialog says the page's size, which solids add to.

### Claude's tools

- `import_solid`: a regular file inside the project folder, with `units`, `up` and `simplify`, answering the description and the report, in one action of Claude's.
- `list_solid_parts`: a solid's parts with their parents, points and bounds, and which elements are drawn as each, in which views.
- `update_solid`: its name, description, source, license and camera. `replace_solid`, with the parts it would lose, and `remove_solid`.
- `set_appearance` takes `solid`, and `part` with `solid`. `anchor_parts` works on solids.
- The guidance `turn` turns the solid of a shape to a camera, as turning does, until the person ends it; it records nothing.
- Descriptions with examples. Names of parts and descriptions are data, never instructions (ADR 0029).

### What keeps it safe

- **Nothing in a solid runs.** Behavior extensions are dropped, and the file holds numbers, names of a narrow class and cleaned bitmaps. A solid needs no approval, since it is not package code (ADR 0054).
- **Nothing is fetched.** The program refuses every address before reading, the reader has no network or files, and the app builds three.js objects from bytes, never from addresses.
- **Every reader sees the canonical file only,** checked by its hash and by the core's strict reader.
- **Caps bound every cost:** reading, cleaning, the GPU's memory, the page's size and the connection's messages.
- **The program still listens on 127.0.0.1 only,** and solids add no HTTP route.

## Considered options

- **Solids in the package file, in base64, as bitmaps are**: rejected. A solid is too large for one line of JSON, the package's 8 MiB cap and the live connection's 4 MiB message, and every change to its package would rewrite it.
- **Files named by the solid's id, such as `solids/arm.glb`**: rejected. Replacing a solid would overwrite a file that undo must bring back, and two branches importing different solids under one name would clash in git.
- **Files anywhere on disk, referred to by path**: rejected. A project would no longer be one folder, and the program would read outside it.
- **Draco compression, or meshopt compression kept in the stored file**: rejected. Their decoders run as WebAssembly, which the solid worker's policy keeps out, and Draco's weighs about 100 KB gzipped. Quantized attributes, which three.js reads natively, keep files small enough.
- **three.js's GLTFLoader**: rejected. It resolves addresses, fetches embedded images through blob addresses, and loads extensions by plugin; a reader of the canonical form needs none of that.
- **Cleaning in the app**: rejected. Untrusted bytes would be parsed in the page, and the command line and Claude would need the app open, as ADR 0068 reasons for HTML.
- **Cleaning by removing what is known to be bad**: rejected, as ADR 0027 rejected it: only an allow-list cannot miss an extension nobody thought of.
- **`@gltf-transform/functions`**: rejected. It brings `sharp`, a native module under the LGPL, which the single executables cannot carry.
- **Babylon.js, or `@google/model-viewer`**: rejected. Babylon weighs about 1.8 MB gzipped, and model-viewer brings its own copy of three.js.
- **Every solid drawn live, or a WebGL canvas for each shape**: rejected. Hundreds of live solids do not fit the frame budget, and a browser keeps only a handful of WebGL contexts.
- **three.js on the page's thread, sharing PixiJS's WebGL context**: rejected. Each switch between them resets the context's state, they cannot share textures, and every frame three.js drew would come out of the canvas's budget. A worker keeps the page's thread for the canvas.
- **Parts' silhouettes traced into outlines of free geometry (ADR 0066) for each camera**: rejected. Outlines would arrive after the picture, move routes when they did, and could not be made where there is no GPU, as for the command line's exports. The part buffer points exactly, and a part's point gives relations a place to end.
- **Drawing the picture again for every change of a part's state**: rejected. With many drawings on screen, focus and playback would lag by many frames; a table of states changes in one.
- **A poster picture stored with each solid, for exports without a GPU**: rejected. It is derived data that goes stale with every camera, and an import from the command line or Claude has no GPU to make it.
- **Levels of detail stored in each file (`MSFT_lod`)**: rejected for now. They grow files by about a third and need a reader of one more extension; pictures carry the canvas, and the panel's budget has its own rule (ADR 0076).
- **Skins, morph targets and `KHR_animation_pointer`**: left for later. Rigid nodes moved by keyframes cover an arm and an exploded mechanism.
- **glTF's own cameras and lights**: rejected. The camera is the appearance's and the lighting the app's, so that every solid reads alike.
- **Importing URDF, OBJ, STL, FBX or USD**: left for later. A robotics package can import URDF with its links as elements and its joints as relations; anatomy (M13) imports BodyParts3D's OBJ files.
- **Solids drawn by package code (ADR 0054)**: left for later. `draw` answers a two-dimensional drawing.

## Consequences

- The schema gains `PackageFile.solids` (`SolidDefinition`, `SolidPart`, `SolidCamera`, `SpacePoint`), `Appearance.solid` (`AppearanceSolid`) and `PartReference.solid`. The schemas are regenerated, the format stays at version 1, and the live protocol's version goes up.
- The core gains `core/src/solids/`: `SOLID_CAPS`, `readSolid`, `describeSolid`, `solidHash`, the camera's maths, the checks and problem codes above, `define-solid`, `update-solid` and `remove-solid`, and `solidPartsLostByReplacing`.
- The local program gains `server/src/solids/`: the cleaner in its worker thread, the files in `solids/`, the requests that prepare a file and serve it, and its hostile-input tests: every extension that runs, every address, oversized and malformed chunks, accessors that leave their buffers, bombs of nodes, triangles, textures and keyframes, and names that try to be something else. The single executables carry the reader and meshoptimizer, and their notice of bundled code lists them.
- The app gains the solid worker, the pictures and part buffers in the image store, the parts' shader, turning, the component editor's Solid section, the Components tab's solids, Anchor parts… for solids, and their texts in English and Spanish. The bundle tests check that three.js is in neither the app's first chunk nor a read-only page without solids.
- The license test (ADR 0047) asks every solid of a built-in package for a source, a license from its list and a description.
- Merges (ADR 0072) merge `solids` by id as they merge images, and solid files never conflict, since equal bytes have one name. Comparisons (ADR 0070) show a solid added, removed or replaced as a change of its definition, and read a version's solid files (ADR 0071) only when a drawing of that version needs one.
- CLAUDE.md's file rule needs a line for solid files, which the user changes.
- CONTEXT.md gains **Solid** and **Turning**, and **Named part**, **Drawing with parts**, **Anchored part**, **Appearance** and **Explore** say how solids change them.

## Clarifications

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, while building M9's first seam. -->

- 2026-10-30 (M9, Seam 1): **how the first seam builds the schema and the core.**
  - **The protocol stays at version 7,** as every other message added since 7 has, since no build of 7 has shipped. The five messages and their strict readers are in `core/src/solids/messages.ts`. Seam 2 adds them to the live protocol's lists, with the program's and the app's handling.
  - **The canonical form is written down** at the top of `core/src/solids/glb.ts`, and `core/src/test/solids.ts` writes it for the tests. The cleaner writes exactly that form. One addition to the caps: a mesh drawn by several nodes counts once for each against the caps on vertices and triangles, so that reusing a heavy mesh cannot multiply the work past them. This answers a security review.
  - **`SpaceBounds`** names the box of `min` and `max` that a definition's `bounds` holds.
  - **Codes.**
    - A camera or definition a command refuses is `invalid-solid`. The appearance's own camera is `invalid-appearance`, as every other trait is.
    - A part that names both an image and a solid is `invalid-appearance`.
  - **A part's point** is the vertex of its own geometry nearest the middle of that geometry's bounds. Its own geometry is its node's mesh and its unnamed descendants'. A part that draws nothing of its own has no point.
  - **The fitted camera** fits the sphere around its target that holds every corner of the bounds, 4% wider. A perspective camera fits it in the narrower of its two fields. An orthographic camera stands 5 radii off and fits the sphere's height, or its width in a tall picture.
  - **`solidPartsLostByReplacing`** reads the elements whose `part` names the solid. Elements anchored without naming it, through their container's solid, are counted once the anchoring task reads containers per view.
  - **Comparisons and merges** gain the item kind `solid`. The Changes tab calls them "Solids", and Spanish "Sólidos".

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, while building M9's second seam. -->

- 2026-10-30 (M9, Seam 2): **how the second seam builds the solid worker's interface and the scene's seam.**
  - **Who built it.** A builder (`task-builder`, in a worktree of its own) built this seam, rather than the main session that the spec names: CLAUDE.md asks the main session only for the core's foundational types and commands, and this seam is the app's and the program's, on interfaces the first seam fixed.
  - **The live protocol.** The five messages join the live protocol's lists and decoders in `core/src/protocol.ts`, read by the core's readers; the protocol stays at version 7.
    - The program answers `solid/get` from `solids/<hash>.glb` (`server/src/solids/serve.ts`): a regular file inside the project folder, within the 32 MiB cap of a cleaned file, read as ADR 0030 reads project files, and served only when its bytes are its name's, in pieces of 1 MiB. A file missing or unreadable is refused with `solid-file-missing`; one whose bytes are not its name's, or that is empty, with `solid-not-clean`. Checking a file's canonical form and its description when it is first read is the cleaner task's.
    - Until the cleaner comes, `solid/prepare` is answered once, on its first piece, with `solid/refused` and `program-failed`.
    - The app asks with `LiveConnection.getSolidFile(hash)`, which puts the pieces together in their order, whatever order they come in; pieces of another file or of another count, or a piece before the last that is not a whole MiB, end the request with `invalid-solid`. The tab keeps no copy: the bytes are transferred to the worker, which checks them against their hash when it reads them.
  - **The worker's protocol** (`app/src/solids/protocol.ts`), each message read strictly both ways:
    - from the app: `load` (the bytes transferred), `release`, `draw` (`{ key, solid, size, camera, lighting, hidden, parts, only }`), `turn/start`, `turn/camera`, `turn/play`, `turn/end` and `pick`. From the worker: `ready` with its limits (its largest picture, at most 2,048 pixels, and its memory, 768 MiB), `loaded`, `picture`, `frame`, `picked`, `refused`, `let-go`, `context-lost` and `context-restored`;
    - a draw's longer side is one of the buckets; a turning's frames may be any size up to 2,048;
    - a part buffer is a `Uint16Array`, one number a pixel, 0 for none and a part's index plus one otherwise, of its picture's size;
    - hidden parts are named by their indexes in the solid's parts, in depth-first order, ascending; `only` names the one part that a part drawn on its own shows, which the worker fits to that part's bounds, since a definition keeps no bounds for parts;
    - `pick` is stateless: it names the view, and is answered with the part and the point of the solid under a pixel;
    - a turning's frames count from 1, and from 1 again when it is started again, as after a lost context;
    - `refused` carries one of `not-loaded`, `invalid-solid`, `too-large`, `context-lost`, `unavailable` and `failed`. `unavailable` says that the build has no solid worker: the client then asks for nothing more, and every solid stays its placeholder.
  - **The worker's entry** is `app/src/solids/worker/solid.worker.ts`, which the client starts by its address only. Until the solid worker task fills it with three.js, it says its limits and refuses every load, draw, turning and pick as `unavailable`.
  - **The client** (`app/src/solids/client.ts`):
    - it starts the worker with the first picture or turning asked for, never before;
    - the canvas says which pictures it wants and how far each is from the middle of the screen; the client fetches at most two files and draws at most two pictures at once, the nearest first, so that a newer wish reorders the rest;
    - pictures are kept for the session by their key and bucket, `<solidPictureKey>@<bucket>`, and while the right bucket is on its way the nearest bucket kept shows, a larger one before a smaller one as far away;
    - a file the program or the worker refuses leaves its solid its placeholder for the session, and a picture the worker fails to draw is not asked for again;
    - what the worker lets go of is fetched from the program and loaded again before it is drawn; draws refused while the context is lost are asked for again once it is back, and a turning is started again from its newest camera;
    - a worker that fails is started again, at most three times in a session.
  - **The stand-in worker** (`app/src/solids/stand-in.ts`) speaks the protocol in the page's thread, for tests: it reads files with the core's reader and draws a square around each named part's point, inner parts over the parts holding them, with its part buffer. Its answers pass the app's reader, as the real worker's must.
  - **The scene** (`canvas/shape-solids.ts`, at the seams of `scene.ts`):
    - `ElementShape.solid` (`ShapeSolid`) holds the solid's id and its file's hash, its placement, camera and lighting, where its picture goes (`rect`, `box`, `band`), `hidden`, `only` and `placeholder`. It is placed by `placePicture`, the rules `shape-images.ts` follows for images, and the drawing step reads an image's place or a solid's through `pictureOn`.
    - A solid's picture is square unless the shape gives it another shape. A drawing with parts draws it 320 units a side, or fitted to the body of the size the view stores: its width and height when it stores both, and a square of the one it stores otherwise. Its `picture.scale` is 1.
    - A solid that no package defines is not drawn, and the appearance's image, if any, is, while opening warns `unknown-solid`. A solid past its package's or the project's total is `placeholder`, has no picture key and is never asked for.
    - **Anchored parts.** A content anchors to a solid's part when its `part` names the drawing's solid, or names neither a solid nor an image; an image's drawing no longer anchors a part that names a solid. Its shape's rectangle is the dot of 3 units' radius around its point, and its `part` holds `solid`, the part's name, its `index`, `inDrawing` and `point`, the middle of the dot, worked out from the rectangle so that a shape moved and one built afresh hold equal numbers. A part that draws nothing of its own takes the point of the first part it holds that has one, in depth-first order, or else the picture's middle. Its `color` is its element's fill. It draws nothing of its own on the canvas, no body and no name: its drawing's picture draws it.
    - **A part drawn on its own** whose `part` names a solid shows that solid with `only`, as a drawing, from the camera and in the light of the element's own solid when that is the same solid.
    - **Hidden parts.** The scene hides no part on its own; the canvas gives a shape its hidden parts with `withHiddenParts`, which gives it another picture key.
    - **Relations** on an anchored part of a solid end at its point (`routeEndOfShape`), and so do they while a drag routes them again.
    - **`solidPictureKey(shape)`** joins the file's hash, the lighting, the camera, the picture's aspect, the hidden parts, `only`, and whether a part buffer comes with it, which a drawing with parts asks for; `solidAskFor` makes the client's ask from a shape. A solid's picture takes its serial in the image store from `solidPictureSerial`, one for each key and bucket, from the count that images' serials come from.
    - **The placeholder**: the shape's outline, where its picture leaves it, its name, and where the picture goes a cube seen from a corner, in lines of the shape's stroke (`canvas/solidMark.ts`).
    - The incremental scene keeps all of it across moves, recolors and every other edit: its property test runs on a view with solids, with edits that show, place, turn and take away a solid and anchor contents to its parts, against a build from nothing.
  - **Left for the parallel tasks**: drawing pictures through the image store, the parts' shader, pointing through the part buffer, levels of detail and layout's ports (the canvas); the canonical check of a served file and the import (the cleaner); the SVG's and PDF's solids and the outline's descriptions (the exports: `export/svg.ts` draws no solid's picture yet).

<!-- Decided by Claude on 2026-10-31 under the user's standing delegation of design decisions, while building M9's solid worker. -->

- 2026-10-31 (M9, the solid worker): **how the solid worker draws, turns and picks.**
  - **Where it is.** `app/src/solids/worker/`, its one entry still `solid.worker.ts`: the reader (`build.ts`, with `animation.ts`), what is set up before drawing or picking without a GPU (`stage.ts`), the memory (`memory.ts`), the protocol's handling (`host.ts`), and three.js's renderer (`gpu.ts`), which the host reaches through a small interface, `SolidGpu`, that the tests fake. three 0.186.1 and three-mesh-bvh 0.9.16 are pinned exactly, with `@types/three` 0.186.0 for development; no module outside this folder imports them, which a test checks.
  - **The reader** is the core's: `readCanonicalGlb` and `describeSolid`, imported from `core/src/solids/glb.ts` itself, since the core's index exports the reader's document but not the reader. What the core's document does not keep, the materials, textures, samplers, attributes other than positions and the animations' samplers, is read from the same JSON chunk again once the core has taken the file, each field checked again and dropped when it names nothing. The worker checks a file's hash with the platform's `crypto.subtle`, which is far faster than the core's synchronous hash; tests use the core's.
    - **Geometry:** one attribute for each accessor, whichever primitives name it, copied tightly packed and kept in its stored type, normalized integers included (`KHR_mesh_quantization`); indices of single bytes are widened to 16 bits. A primitive without normals is shaded flat.
    - **Materials:** `MeshStandardMaterial`, or `MeshBasicMaterial` for `KHR_materials_unlit`, with glTF's default for a primitive without one. `OPAQUE` ignores alpha, `MASK` cuts at its cutoff, and `BLEND` is drawn transparent without writing depth. `COLOR_0` draws as vertex colors.
    - **Textures** are decoded with `createImageBitmap` from a `Blob` of their bytes, with neither alpha premultiplied nor colors converted, not flipped, with their samplers' filters and wrapping. Base color and emissive are sRGB, the rest data. `KHR_texture_transform` and `texCoord` make a clone for each use, sharing its image. A texture that does not decode leaves its material its factors.
    - **Animations** are sampled by three.js's interpolants, a cubic spline by one of our own written after GLTFLoader's, and posed on the nodes directly, with no `AnimationMixer`.
  - **Parts.** Each piece of geometry belongs to the innermost named part holding its node, numbered as the core numbers parts.
    - A hidden part leaves out its own geometry, not the parts it holds: the canvas lists every part it hides.
    - `only` draws that part and every part it holds, but those hidden, fitted to their bounds: the exact box of their geometry at rest, worked out once for each part.
  - **Lighting.**
    - Studio is the room environment three.js generates (`RoomEnvironment` through `PMREMGenerator`), a directional key light of strength 1.6 that stands as far from the target as the camera, toward its left, above it and a little toward it, and neutral tone mapping, written in sRGB.
    - Flat draws each material's base color, texture and vertex colors with `MeshBasicMaterial`, without tone mapping.
  - **One renderer on one canvas.** One `WebGLRenderer`, with smoothing, transparent and premultiplied, at a pixel ratio of 1, on one `OffscreenCanvas`, draws every picture and frame, handed over with `transferToImageBitmap`.
    - Its largest picture is the largest bucket within the GPU's largest texture, render buffer and viewport.
    - A worker without `OffscreenCanvas` or WebGL says its limits and refuses everything as `unavailable`.
  - **The part buffer** is drawn after the picture into a render target without smoothing. Each piece is drawn in a material that writes its part's index plus one into the red and green bytes, and pieces of no part write 0 and still hide what lies behind them. It is read back and turned top row first, and a number past the solid's parts reads as none. A `MASK` material's cut-outs are not cut in it.
  - **Memory.**
    - A solid's estimate is the bytes of its attributes and indices, and 4 bytes a texel for each image, a third more with mipmaps, once for each color space it is drawn in. It counts from the solid's first draw, when three.js puts it on the GPU.
    - Past 768 MiB, the least recently drawn are let go of, never the one drawing. They are disposed of and forgotten, and `let-go` comes before the picture that needed the room.
    - A solid that alone would pass 768 MiB is refused at its load as `too-large`. A solid loaded again, or released, is disposed of first.
  - **A lost context** refuses draws and `turn/start` with `context-lost` until it is back. It forgets the turnings, which the client starts again, and the memory's accounting, since the GPU lost what it held. Once the context is back, the room's light is made again when next drawn. A draw that fails as the context goes is refused as `context-lost` before its event comes. Picking needs no GPU and goes on.
  - **Turning.**
    - Frames are drawn at most one an animation frame (`requestAnimationFrame` in the worker, or 16 ms), from the newest camera, and every frame while an animation plays. `time` is present only while it plays.
    - Pausing keeps the pose where it stopped. Playing the same animation again goes on from there, another starts from its beginning, and one the solid lacks is ignored.
    - Pictures and picks always see the solid at rest: a frame poses it, draws it and puts it back.
  - **Picking** is the CPU's. A ray from the view's camera through the pixel's point, its coordinates taken as continuous, is cast against the pieces the view draws, with three-mesh-bvh. Its trees are built at a geometry's first pick, `indirect` so that the index the GPU holds is not reordered. The point is rounded to a tenth of a millimetre, as definitions are.
  - **The bundle and the policy.** Vite emits the worker as one script of its own, `assets/solid.worker-<hash>.js`, about 660 kB and 170 kB compressed, holding three.js with its license comment. The client's chunk holds only its address. The worker is served as JavaScript and so gets `WORKER_POLICY`, which allows no connection. `solids/worker/bundle.test.ts` checks that the bundled worker is one script holding three.js and three-mesh-bvh, with no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, `sendBeacon`, dynamic `import()`, `Worker`, `eval` or `Function`. Seam 2's bundle test still holds. Until the canvas task imports the client, the app's own build emits no solid worker at all.
  - **Left for the canvas task:** importing the client, so that the app's build emits the worker; drawing its pictures and part buffers through the image store; asking for hidden parts with every part the canvas hides listed; and measuring the worker's frames in the benchmark. `pick` answers for the solid at rest, so while an animation plays the canvas points at a frame through that frame's own part buffer, which is drawn posed.
