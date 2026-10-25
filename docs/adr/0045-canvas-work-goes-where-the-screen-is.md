---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# The canvas does first what the screen shows, and the rest while the camera rests

ADR 0014's clarifications spread new drawings, labels and marks over frames within budgets. The performance pass (`docs/designs/benchmark-3.md`) found the frames and actions that still missed the budget at 10,000 elements on the reference laptop, and in each the time went to work for what the screen did not show: a layout planned and drew every tile of the view; a theme switch at the whole view gathered every region of plain drawings again in the frame that showed it; a recolor and a switch drew again, in the frames the person was using, tiles far off screen; and tiles off screen showed the theme before the switch when they came near. This settles how the canvas orders its work, so that the cost of a frame goes with what shows.

## What a change plans at once

- A change that touches most of a view's shapes or relations, such as a layout, plans at once only the cells near the screen: those that meet the screen grown as far as the frame draws ahead of the camera, and at least half a cell; those of the shapes and of the pieces of routes that reach into it from outside; and those of the tiles drawn before that reach into it. Every other cell keeps, off screen, the tiles it had.
- A cell not planned is planned from the scene as it is before any frame draws it: the frame that brings it near plans it first. While the camera rests, the others are planned a region at a time, the nearest the middle of the screen first.
- Once every cell is planned, the tiles are exactly those a plan of the whole view makes, which a test checks. The whole view near the screen, as fitted, plans every cell at once, as before. An image plans every cell it shows before it draws.
- A cell that holds many shapes of one band, or many relations, is drawn in several tiles: at most 64 shapes, or 256 relations, to a tile, the first keeping the cell's key. No tile then costs a frame more than a few milliseconds to draw again.

## What the camera's rest is for

- Planning the cells left and drawing again what a switch or a recolor left off screen are done only while the camera rests and nothing else happens on the canvas: a selection, a gesture's marks, a drag or an edit starts the same wait of 180 ms again, since the frames they ask for are the person's. Then they take only what a frame's own work leaves of 5 ms from its start, and each changes one region a frame at most, since every region changed makes PixiJS gather that region's drawings again after the frame's clock.
- What a switch or a recolor left off screen is drawn again a region at a time and kept until the whole region is, then shown together, so that PixiJS gathers the region once. A tile that comes near the screen first is shown, or drawn again, before it shows, whatever the clock says: no tile ever shows a theme or colors no longer current.

## What a switch shows in one frame

- Far out, where plain drawings show, each region whose plain drawings are all drawn again for the switch is copied behind the one that shows, hidden, as soon as it is ready, and its geometry is sent to the GPU in that frame. The switch then shows each copy in place of its region, in one frame that sends and gathers nothing more.
- How long drawing a tile again takes is learned from the drawings made so far, by kind of tile and drawing, so that a frame stops before a drawing that would overrun its clock rather than after it. Drawings in full are drawn on the same kind of clock, 4 ms a frame and 40 shapes at least, with their geometry built ahead.
- Drawings no frame shows any more are destroyed between frames, a few milliseconds at a time, never inside one.

## How the budget is measured

- The canvas benchmark runs in work mode, each frame timed with the GPU's work through a one-pixel read back (ADR 0014), in a Chrome tab kept in front. A dedicated profile is used, with a small window of its own that clears a 16-pixel WebGL canvas every few milliseconds: on a locked laptop with its display off, the GPU otherwise sleeps after about 60 ms without work and takes about 500 ms to wake, which the first frame after every pause then waits for. That window adds no measurable time to a frame.
- The laptop is not quiet: its antivirus and its virtual machine took about 40% and 20% of its processors through the pass, logged every ten seconds. Before and After are therefore compared in pairs, the two builds served one after the other on the same port, round after round, so that each pair ran under the same load.

We chose this because what shows is what the person waits for: work for the rest of the view can wait for the camera to rest, as long as nothing stale ever shows; because PixiJS gathers a region's drawings whenever any of them changes, so changing a region once costs less than changing it tile by tile; and because a measurement under a load that varies is only worth something against another taken under the same load.

## Considered options

- **Lower the marks to what the laptop reaches**: rejected. The spec's numbers are meant for this laptop; the marks still missed are listed in `docs/designs/benchmark-3.md` with what they would take.
- **Building the scene in a worker**: not now. It would take the scene's 100 ms of a layout off the main thread, but hit testing, the inspector and every command read the scene there; it needs its own decision.
- **Drawing far off screen tiles again in place, tile by tile, as before**: rejected. Each one made PixiJS gather its region again, in frames the person was using.
- **Showing tiles of the scene before a change until their cells are planned**: rejected. A stale tile on screen is what A1 and A2 forbid.

## Consequences

- Tiles off screen can draw the scene before a change until they come near or the camera rests. Hit testing and the selection's marks read the scene, never tiles, and an image plans what it shows first, so nothing the person points at, sees or exports comes from them.
- A switch far out shows a frame later than its last drawing, for the copies to be put together.
- The renderer's tests cover planning near the screen, the rest while the camera rests, a pan that brings cells near, crowded cells, the copies a switch shows, and catching up in what a frame leaves.
