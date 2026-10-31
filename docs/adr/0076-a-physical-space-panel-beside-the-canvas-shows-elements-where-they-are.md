---
status: accepted
supersedes: ADR-0003
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# The canvas stays two-dimensional; a physical-space panel beside it shows the same elements where they really are

ADR 0003 kept the canvas two-dimensional and physical space inside the components that need it, because text and relations read worse in three dimensions, and three dimensions help only when the physical arrangement is the data itself. The first benchmark (§7) found that this holds, and also that linked displays, two dimensions and three side by side, do as well as or better than either alone; radiology, CAD, Neuroglancer, 3D Slicer and the anatomical atlases work this way. A body or an arm drawn inside a shape, as ADR 0075 draws solids, is too small to explore, and a view cannot be read beside the arrangement it describes. This decision supersedes ADR 0003: it keeps its two-dimensional canvas and its physical space inside components, which ADR 0075 draws as solids, and adds a panel beside the canvas, linked to it, for M10.

## Decision

### The canvas stays two-dimensional

- **Views are projections onto the canvas,** as before: one perspective, positions of their own, abstraction by collapsing (CONTEXT.md, View). A view never switches between two and three dimensions, and nothing on the canvas is drawn in perspective but the pictures of solids.
- **Physical space shows in two places:** inside the shapes of the components that need it, as solids (ADR 0075), and in the physical-space panel, which shows the elements of the open view where they really are.

### The physical-space panel

- **Where it is.** Beside the canvas, between it and the inspector, opened and closed from Physical space in the canvas toolbar and by a key that the keyboard help lists. It can be resized, down to 280 pixels, and the canvas keeps the rest. A tab keeps, for each view, whether the panel is open, its root and where it looks, as it keeps the canvas's camera; nothing of it is written to a file but in a tour step.
- **What it shows.** The elements that the open view shows and that are in physical space under the panel's root, each where it is: their solids, the named parts anchored in them, and markers for what has a place but no solid.
- **Its root** is World, or one element:
  - World shows everything posed in World and what is posed or anchored in that, at any depth;
  - an element shows itself at the origin, with its solid if it has one, and what is posed or anchored in it, at any depth. Show in physical space, in a shape's menu, opens the panel with that element as its root, unless the element is in physical space under World, which is then framed. So a heart with its chambers anchored to its solid's parts is explored without posing anything.
  - When the panel opens with nothing chosen, its root is World if something the view shows is in physical space through World; otherwise the selected element, or the first in the model's order, that shows a solid. When the view holds nothing either way, the panel says how to put something in it.
- **It is not a view.** It has no perspective, scope, positions or stacking order of its own: it reads the open view's.

### Where things are: a pose, kept in the model

- **An element can have a pose**: where it is in physical space and which way it faces, measured from one of its containers, or from World. CONTEXT.md gains **Pose**.

  ```json
  {
    "id": "wrist-camera-8d2k1q",
    "component": "robotics.camera",
    "name": "Wrist camera",
    "pose": {
      "in": "wrist-x81k2p",
      "at": { "x": 0, "y": 0.04, "z": 0.03 },
      "rotation": { "x": 0, "y": 0, "z": 0.7071068, "w": 0.7071068 }
    }
  }
  ```

  - `in`: the container it is posed in, one of its containers under any nesting relation type; World when left out.
  - `at`: where its origin is, in meters, in that container's coordinates.
  - `rotation`: which way it is turned, a unit quaternion as glTF writes rotations; not turned when left out.
- **Why in the model, and not in a view.** A shape's position in a view is presentation: each view lays the same elements out its own way, so positions live in view files and moving a shape never touches the model. Where a camera is mounted on a wrist, where a machine stands in a hall, or where the hippocampus lies is the data itself, the reason ADR 0003 gave for physical space at all. So a pose is part of what the model describes:
  - one pose per element, whatever its containers: on the canvas an element is drawn once in each of its containers (ADR 0007), and in space it is one thing in one place;
  - moving it in the panel changes where it is, which is an edit of the model, undoable like any other;
  - comparisons (ADR 0070), merges (ADR 0072), proposals (ADR 0073), the history, the read-only page and Claude's reads cover it as one more key of an element, without a new kind of file.
- **Other arrangements** of the same things, as built and as designed, are versions of the project (ADR 0071) or another project. An exploded view is a way of reading, below, not an arrangement.
- **Commands.** `create-element` and `update-element` take `pose`, `null` taking it out, and `set-poses` sets several at once, as a gesture on several elements needs. Commands refuse (`invalid-pose`) a pose whose numbers are not finite, a coordinate past 1,000 km either way, a rotation more than a millionth from unit length, which they otherwise store normalized, and an `in` that is not one of the element's containers. Opening only warns.
- **When `in` stops being a container,** because the containment that made it one is gone, the pose is kept and not used, and the element is not in physical space; opening and the action's answer warn with `pose-not-in-container`. When the containment comes back, so does the place, as positions stay when an element leaves its container (ADR 0019). The inspector offers to pose it again in World, where it was.

### Units and coordinates

- **Meters, right-handed, with +Y up and +Z toward the front,** as glTF writes, so that a solid's own coordinates, which ADR 0075's cleaner turns into these, and poses agree.
- **What a pose is measured from:**
  - World: the origin of physical space;
  - a posed container: its own origin and axes, wherever its pose puts them;
  - an anchored part: its node's place in its solid, wherever the solid's element is;
  - an element that shows a solid: its origin is its solid's origin.
- **Rotations** are stored as quaternions, which have no order of axes to agree on. The inspector and Claude's tools also take degrees about X, then Y, then Z, about fixed axes, and turn them into one.
- **Lengths** are shown in the inspector in mm, cm, m or km, whichever keeps the number between 1 and 1,000, and are read in any of those or in inches.
- **Precision.** The panel draws everything relative to the point its camera turns around, so that places far from the origin keep their precision on the GPU.
- **The ground** is a grid on the root's plane y = 0, its cells of a power of ten meters that follows the camera's distance, with a scale that says how long one cell is.

### How containment maps to space

- **What is in physical space.** Under the panel's root, an element is in physical space when:
  - it is the root;
  - it has a pose whose `in` is an element in physical space, or which has no `in` while the root is World;
  - or it is an anchored part of a solid drawn for an element in physical space (ADR 0075). It is drawn as its node there, and a pose it has is kept and not used, as a position is for an anchored part on the canvas (ADR 0067).

  An element that is none of these is not in physical space, even if it shows a solid; Place in physical space poses it.
- **Poses never form a cycle,** since `in` is always a container and containment never forms one (ADR 0019).
- **Several containers, one place.** An element is in physical space at most once, posed in one container, while the canvas draws it in each of them.
- **A container without a solid** is drawn as what is in it: its contents in physical space are drawn where they are, and selecting it marks them all, as a composite organ in BodyParts3D is the sum of its parts.
- **A collapsed container** of the open view is drawn whole: what is inside it in physical space is still drawn, since a body keeps its organs when its diagram folds them, but it is pointed at, selected, colored and played through as the container, in the container's state. This is what aggregation is on the canvas (ADR 0024, ADR 0031).
- **The open view decides what is drawn.** Its scope, its filters and focus apply (ADR 0025, ADR 0040). The containers through which a shown element is in physical space are drawn faintly when the view does not show them, as a container of what a filter shows stays, drawn faintly. The nodes of a drawn solid that no element stands for are drawn in its element's state.

### What the panel draws

- **Solids** of the elements in physical space, whatever their appearance's placement, with their named parts; repeated solids are drawn as instances of one.
- **Markers** for elements in physical space without a solid: a pin of a fixed size on the screen, in the element's fill.
- **Relations are not drawn,** with two exceptions, each drawn as straight lines between their ends' points, over the solids, with arrowheads facing the screen:
  - the relations of the scenario step being played, with their travelling markers (ADR 0031);
  - the relations of the selection, while Relations of the selection is on.

  An end's point is its anchored part's point (ADR 0075), or else the middle of its solid's bounds, or else its origin; the ends inside a collapsed container are its point. A relation that ends on a relation ends at the middle of that relation's line when it is drawn, and is not drawn otherwise. Everything else about relations, their routes, names, styles and aggregation, is the canvas's.
- **Names face the screen,** never tilted in space: they are written for what is hovered, selected or in the step played, and, while Names is on, for at most 64 parts nearest the camera.
- **Ways of reading,** kept by the tab and carried by view states, never written to a file but in a tour step:
  - a cutting plane across the root's X, Y or Z axis, at a place moved with a slider, keeping one side, the cut drawn filled in each solid's colors;
  - an exploded view, which moves each part away from the middle of the part or solid holding it, by a factor from 0 to 2;
  - Relations of the selection, and Names.
- **The camera** turns around a point, at a distance, from an azimuth and an elevation, in perspective with a vertical field of view of 45°. Fit shows all that the panel draws; double-clicking a part, or Enter on it in the panel's list, frames it.

### Linked to the canvas

- **One selection.** Selecting in the panel selects the element: every copy of its shape on the canvas, its row in the outline and the inspector. Selecting on the canvas, in the outline or in the element list marks it in the panel. Hovering in either marks it in both.
- **One emphasis** (ADR 0025). The panel draws the canvas's emphasis by element id: what any source hides is hidden, what is faint is faint, and what playback, guidance and a tour highlight is highlighted. Focus and isolation follow the selection, wherever it was made.
- **Overlays** (ADR 0055) color the panel's solids and parts by their fill and their opacity, read through the attribute lookup, live and computed values included; the legend shows in the panel when an overlay colors something in it. Stroke, size and badges are the canvas's.
- **Scenario playback** (ADR 0031) plays in both: the step's ends are highlighted and its relations drawn with their markers, and the panel brings the step into view as the canvas does, with the camera move of a tour, unless the person moved the panel's camera while it played.
- **Guidance** (ADR 0029) shows in both. Guidance can also open the panel, choose its root, move its camera and frame elements, and the person can close it.
- **What is not drawn in the panel:** comment pins (ADR 0059), comparisons and proposals (ADR 0070, ADR 0073), and notes and free arrows, which belong to a view.

### View states, addresses and tours

- **A view state gains `space`**: `{ root?, camera?, cut?, explode?, relations?, names? }`, whose presence means the panel is open. Its camera is `{ target, azimuth, elevation, distance }` in the root's coordinates, in meters and degrees. View addresses carry it as a `space=` clause, and so do Copy address, `open_app`, `get_view_address` and tour steps (ADR 0044, ADR 0058). An address without it reads as before.
- **Tours.** When a step's view state opens the panel, full-screen playback shows the canvas and the panel side by side, half each. The panel's camera moves as a tour's does: its travel is counted in quarter turns of its direction, doublings or halvings of its distance, and moves of its target by that distance; up to three, it eases over 250 ms plus 150 ms each, at most 700 ms, and past three, from no camera, into another root, or under reduced motion, it cuts.
- **Reading changes nothing.** Moving the panel's camera, cutting and exploding are never commands and never enter the history.

### Editing in the panel, and what stays on the canvas

- **The panel edits poses, and nothing else:**
  - Place in physical space, for a selected element that is not in it: poses it in its first container in physical space, else in World, at the point the panel's camera turns around;
  - moving and rotating posed elements with handles, snapped to 1 cm and 15° unless Alt is held, sent as one `set-poses` when the gesture ends, as a drag on the canvas sends one command;
  - Take out of physical space, which takes the pose away.

  Anchored parts cannot be moved: their place is their solid's, as ADR 0067 keeps an anchored part in its drawing.
- **Everything else stays on the canvas, the outline and the inspector:** creating, connecting, deleting, renaming, changing containers, the stacking order, routes, collapsing and expanding, layout, notes and arrows, comments, recording scenarios, and overlays' stroke, size and badges. The panel's menu on an element offers what reads, Show on the canvas and Frame, and what poses.

### How it is drawn

- **By the solid worker** (ADR 0075), with its one renderer: the panel's frames are handed to the panel's canvas as `ImageBitmap`s through a `bitmaprenderer` context, so that the page's thread does no work in three dimensions, and a solid drawn both on the canvas and in the panel sits on the GPU once.
- **It draws only when something changes:** its camera, what it shows, their states or its size. While it rests it costs the canvas nothing.
- **Picking** runs in the worker, on bounding volume hierarchies of the solids (three-mesh-bvh), and answers the page by message.
- **The budget.** The panel keeps the 60 frames per second target while a frame draws up to 2,000,000 triangles, and at least 30 up to 6,000,000. Past that, while the camera moves, the solids farthest from it are drawn as their boxes, and the whole is drawn again once it rests, as the canvas leaves for its rest what the screen does not need (ADR 0045).

### Accessibility

- **The panel adds; it never holds alone.** Everything it shows is on the canvas, in the outline and in the inspector too, and closing it loses nothing. The outline marks the shapes whose elements are in physical space.
- **Its list** gives what it shows as a tree, by what each is posed or anchored in, follows the selection, and is moved through from the keyboard: the arrows, Enter to frame, and keys to turn, zoom and fit the camera, which the keyboard help lists.
- **Announcements** say where a selected element is: "Wrist camera, posed in Wrist, 5 cm from it".
- **Reduced motion.** The panel's camera cuts rather than moves, the exploded view changes at once, and travelling markers stand still at the end they travel to, as on the canvas.
- **Contrast.** Selection and hover marks are drawn with a casing that keeps 3:1 against any solid, in both themes.

### The read-only page

The page (ADR 0041) has the panel when it holds solids or poses: linked as in the app, with touch, one finger turning, two panning and a pinch zooming, under the policy ADR 0075 gives a page that holds the solid worker. A page made with pictures only has no panel.

### Claude

- `get_space`: what is in physical space for a view and a root, each element with its pose, what it is posed or anchored in, its place in meters in the root's coordinates, and its solid; at most 500 a call, with an offset.
- `set_pose`, for one element or several, with `at` in meters, `rotation` as a quaternion or as `degrees`, and `in`; and `clear_pose`. Each call is one action of Claude's.
- The guidance `space` opens the panel, chooses its root, moves its camera and frames elements. `open_app`, `get_view_address` and the tour tools take `space` in their view states.

## Considered options

- **A switch between two and three dimensions for each view**: rejected, as ADR 0003 and the spec's Not planned rejected it. Every view would need a layout in three dimensions, which ELK does not do, routes, text and selection in three dimensions, and a second set of gestures; positions are kept in two; and a view would show one representation at a time, where the evidence favors two side by side.
- **A fully three-dimensional canvas**: rejected, as ADR 0003 rejected it. It makes every view harder to read to benefit a few.
- **Physical space only inside components** (ADR 0003 as written, M9 alone): superseded. It keeps one surface, but a body or an arm drawn inside a shape is too small to explore, and a view cannot be read beside its arrangement.
- **The panel in a window of its own**: rejected for now. The selection, the keys and full-screen playback would cross windows; tours' speaker notes take a second window only because the audience never sees it.
- **Poses in a file kind of their own, such as `.vaspace`**: rejected. It would be an eighth kind for the loader, the watcher, the merge driver, comparisons, the page and CLAUDE.md; and two such files could put one element in two places with nothing saying which is real.
- **A kind of view whose positions have three coordinates**: rejected. It is the switch per view under another name; a view keeps a position for each copy of an element in each container, while in space an element has one place; and scenarios play over one view.
- **Poses as attributes, such as `x`, `y` and `z`**: rejected. Their names and units would be conventions, three angles are ambiguous about their order, and nothing would check them.
- **Places only from solids**, as the first benchmark's draft had it: rejected as the only way. It covers organs in a body, not a camera mounted on a wrist or machines in a hall.
- **A scale in each pose**: rejected. Physical space shows things at their real size; a solid's units are fixed when it is imported (ADR 0075).
- **Laying out what has no pose in three dimensions**: rejected. A place in space is a fact, not a layout, so what has none is not in physical space.
- **Relations always drawn in space, as lines or tubes**: rejected. Lines crossing in depth read worse than on the canvas, which is ADR 0003's reason, and through solids they hide what the panel is for.
- **Names written in space on every part**: rejected. Tilted and crowded text cannot be read; names face the screen, for what matters at the time.
- **Editing the model's structure in the panel**: rejected. Relations, containers and names are read and changed better on the canvas, in the outline and in the inspector.
- **A WebGL context of its own for the panel**: rejected. Every solid drawn on the canvas and in the panel would sit on the GPU twice.

## Consequences

- ADR 0003 is superseded by this decision; its two-dimensional canvas stands, and so does its physical space inside components, which ADR 0075 draws as solids.
- The schema gains `Element.pose` (`Pose`, `Rotation`) and `SavedViewState.space` (`SavedSpace`, `SpaceCamera`, `SpaceCut`). The schemas are regenerated, and the format stays at version 1.
- The core gains `core/src/space/`: `spaceOf(project, view, root)`, which works out what is in physical space under a root with each element's place, how it is there and what it is drawn as; the maths of poses; `pose` in `create-element` and `update-element`, and `set-poses`; the checks `invalid-pose` and `pose-not-in-container`; and `space` in view states and addresses. Its property tests: an element is in physical space at most once; poses never form a cycle; after random commands, `spaceOf` equals working it out afresh; posing an element in another container where it was keeps its place.
- The app gains the panel, its list and its handles, the link with the canvas's selection and emphasis, the solid worker's drawing of a space, the inspector's Pose section, Show in physical space, the outline's mark, and their texts in English and Spanish.
- Full-screen playback, view addresses, guidance and Claude's tools gain `space`, and the read-only page gains the panel.
- A changed pose shows in comparisons as a change of its element, and merges as one key of it.
- CONTEXT.md changes **Physical space**, gains **Pose** and **Physical-space panel**, and **View state** says that it carries where the panel looks.

## Clarifications

<!-- Decided by Claude on 2026-10-31 under the user's standing delegation of design decisions, while building M10's first seam. -->

- 2026-10-31 (M10, Seam 1): **how the first seam builds the schema and the core.**
  - **Where a pose's numbers may go.** A solid's `SpacePoint` stops at 100 km, so a pose's `at` is a `PosePoint` of its own, at most 1,000 km either way, as the commands refuse past it. The panel's camera looks at a `SpaceTarget` in the root's coordinates, at most 100,000 km away, as far as its distance and a cut may reach, since nested poses add up.
  - **What a pose in an anchored part is measured from.** A solid's definition keeps each part's point, not its node's turn, which only the solid's file holds and the core never reads. So an anchored part's origin is its part's point, with its solid's axes, and a part that draws nothing of its own has its solid's origin. A camera posed on a wrist sits where the wrist's point is, turned as the arm is.
  - **World by its id.** A pose whose `in` names World is stored with `in` left out. World has no pose: commands refuse one with `world-not-allowed`.
  - **What a command stores.** A rotation within a millionth of unit length is stored divided by its length, and a negative zero as 0. `set-poses` refuses an empty list and an element named twice, and changes nothing for a pose given as it is.
  - **What opening and actions warn of.** Opening warns with `invalid-pose` for a pose whose values a command would refuse, and with `pose-not-in-container` for one whose `in` is not a container. An action warns with `pose-not-in-container` only for the poses it leaves unusable, not for those that already were.
  - **The view state.** The address writes the panel as `space=root:<id>;camera:<x>,<y>,<z>,<azimuth>,<elevation>,<distance>;cut:<axis>,<at>,<keep>;explode:<factor>;relations;names`, each clause only when it says something, and `space=open` when none does. Checking leaves out an explosion of 0 and relations or names that are off, so an address and a tour step keep the same value. A root that is not an element is a problem of the view state, and of a tour step as `unknown-element`.
  - **Words.** The glossary avoids "root" for World, so what people read never calls the panel's element its root: the panel "shows" it. `root` stays as the name of the view state's field, as this decision gives it. In Spanish a pose is "ubicación", and posing is "ubicar".
  - **The core's exports.** `spaceOf`, `poseIn` and `pointInSpace` are exported with the checks of poses. The maths are exported under `spaceMath`, so that names such as `multiply` do not stand alone beside the canvas's. Only `rotationFromDegrees`, `degreesOfRotation` and `NO_ROTATION` are exported by name.
- 2026-10-31 (M10, Claude's tools): **how Claude reads and poses physical space, and moves the panel.**
  - **`get_space {view?, root?, offset?, limit?}`** lists what is in physical space as `spaceOf` works it out: each element's id and name, how it is there (`shown` for the element the panel shows, so that no answer calls it a root; `posed`; `anchored`), what it is posed or anchored in, its stored pose (an anchored part's marked as kept and not used), its place in meters to the micrometer, its rotation as a quaternion to seven places and as degrees about X, then Y, then Z, its solid and part, the collapsed container it is drawn as, and the faint containers after the rest. It names the poses whose `in` is not a container. The local program does not know which view a tab shows, so with no view named it reads the whole model, and says so. At most 500 a call.
  - **`set_pose {poses: [{element, in?, at?, rotation? | degrees?}]}`** sends one `set-poses`, whatever the count, and the core refuses and warns in its own words. A rotation of no turn is left out. Without `at`, the element keeps its place under World, measured from `in` now (`poseIn`), turned as it is unless a rotation is given; one not in physical space under World is refused, since there is no place to keep. **`clear_pose {elements}`** sends one `set-poses` of `null`s; the core labels taking several out "Take <n> elements out of physical space", rather than "Pose <n> elements".
  - **The guidance `space`** is `{ root?, camera?, frame?, view? }`, or `{ close: true }` alone: it opens the panel, or keeps it open, on `root` or on what it shows, then moves its camera, a `SpaceCamera` read as a view state's is, or frames one to 500 elements, never both. It came in protocol 7, as the other additions did. Claude sends it with **`show_space`**, which refuses a frame outside the space under the `root` it names, and warns of one outside World's when it names none. The app keeps the last request as `GuidanceState.space`; the panel's tasks act on it.
  - **View states.** `get_view_address`, `open_app` and the tour tools take `space` as the view state's checks do, with an example each.
- 2026-10-31 (M10, Seam 2): **the panel's seam, which the next tasks build on as it is.** Built by a builder rather than the main session, as the solid worker's seam of M9 was (ADR 0075's clarification).
  - **The worker's messages** (`app/src/solids/protocol.ts`, read strictly both ways). A space is drawn by its number. From the app: `space/show` with what it shows (`SpaceShown`: `size`, `entries`, `states`, and `camera`, `cut`, `explode`, `names` and `lines` when given); `space/update` with what changed (`SpaceChange`, where `null` takes a camera or a cut away); `space/framing` with an `id` and the `elements` to frame, or none for everything; `space/pick` with an `id` and a pixel; `space/end`. From the worker: `space/frame` (`serial` from 1, the `camera` it was drawn from, the bitmap), `space/framed` (a camera), `space/picked` (`element` or `null`, and the `point` in the coordinates of the element the panel shows), `space/gesture-ended` (`gesture`, `move` or `rotate`, and `moved`, each element with its matrix, from which the app sends one `set-poses`; what starts a gesture is the interaction task's), and `refused` naming a drawing by `space`.
  - **An entry** (`SpaceDrawnEntry`) is an element with its name, at most 200 characters, and its matrix, 16 numbers column by column in the coordinates of the element the panel shows; with `solid`, its file's hash, and that solid's `bounds`; with `part`, the element whose drawn solid holds it and the part's index; or `marker`, for an element posed with no solid that nothing in the space is posed or anchored in, since a container without a solid is drawn as what is in it. The faint containers come after the rest. `space/entries.ts` makes them from `spaceOf`.
  - **What the worker does.** A space whose camera the app has not given is framed whole, again each time what it shows changes; framing works from the entries' bounds, their solids' and their parts', without the GPU, from the camera's own direction. Spaces are drawn once a frame and only after a change, a solid they draw loading, or the context coming back. They go through `SpaceGpu` (`drawSpace`, `pickSpace`), beside `SolidGpu` on the same renderer; without one, a space is refused as `unavailable`. Its first drawing draws each entry's solid at its matrix, lit as studio, relative to the camera's target, one solid after another into one depth buffer; a pick finds nothing yet. Everything else is "Drawing a space"'s. Frames are at most the worker's largest picture a side, 2,048 pixels, and the panel's canvas stretches them.
  - **The client.** `SolidClient.showSpace(shown, { onFrame, onGesture, onProblem })` answers a `SpaceDrawing`: `update(change)`, `fit(elements?)`, `pick(x, y)`, `end()`, its newest `frame` and its `problem`. It loads the solids the entries draw, again after the worker lets go of one, and shows the space again in a worker started anew. A read-only page of pictures answers a drawing whose problem is `unavailable`.
  - **States** (`spaceStates` in `space/states.ts`, with `shapeEmphasisOf` and `spaceStateList`): an element is hidden when every one of its shapes is, highlighted when any is, which wins over faint, faint when every shape not hidden is dimmed, selected and hovered by its id, with its overlay's fill and its opacity below 1; an entry drawn as a collapsed container takes that container's state whole, and a faint container is faint.
  - **Hover by element id** (`editor/hover.ts`): `HoverStore`, provided by the shell as `HoverContext`, holds the element hovered and where (`canvas`, `space`, `outline` or `list`); a place stops hovering only what it hovered. The canvas writes it as it hovers a shape; `useHover()` reads it. The selection was shared by id already.
  - **The panel's place** (`space/`): `SpacePanelStore`, provided as `SpacePanelContext` and read with `useSpacePanel()` and `useSpacePanelState(store, viewId)`, keeps for each view in memory the panel closed or its `ViewSpace`, through `state(viewId)`, `open(viewId, space?)`, `close(viewId)`, `set(viewId, space)` and `toggle(viewId)`; addresses, tours and guidance will call these. Opening with nothing chosen writes what `chosenSpace` picks then: `{}` for World, or `{ root }`. Its width is the tab's, not the person's preference: 480 pixels at first, from 280 to half the window. The shell has a fourth column, `space`, between the canvas and the inspector, of no width but while the open view's panel is open, which the store marks with `data-space-panel` and `--space-panel-width`; the scenario panel and the element list keep their places beside it, and full-screen playback hides it with the other panels until the tours task shows it.
  - **Words and keys.** Physical space in the toolbar, in More's group `space`, pressed while the panel is open, and Alt+Shift+P (⌥⇧P on macOS) open and close it; the keyboard help lists them and the edge's keys. The panel's bar says "Shows “Arm”" (in Spanish "Muestra"), never its root. In Spanish the panel is "panel del espacio físico".
- 2026-10-31 (M10, after Seam 2): **handles are driven by the page.** The interaction task moves and rotates posed elements from the page, which projects with `space/camera.ts` (`spaceProjection`, `spaceEye`) as the worker does: it asks the worker to draw the handles with the space's next update, hit-tests them itself, and sends one `set-poses` when the gesture ends. `space/gesture-ended` stays for a gesture the worker ends, such as one cut short by a lost context. The panel's width is kept by the tab, not as a preference, and its choice of what it shows on opening is kept until the person or a view state changes it.
