# Tenth benchmark: the physical-space panel at 10,000 elements (M10)

Date: 2026-10-31. Measured on the branch that builds M10's benchmark and the exploded view's follow-ups, on the reference laptop from `benchmark-3.md` (Intel Core i5-1135G7, Intel Iris Xe Graphics), once in Node and once in Chrome 155 run headless (`--headless=new`) on the laptop's own GPU through ANGLE and Direct3D 11, with a profile of its own, at 1600 by 900 pixels and a pixel ratio of 1. It records the space benchmark's numbers (ADR 0076). By the user's decision of 2026-10-27, benchmark marks do not hold a milestone back; nothing here was optimized but one thing the run found (below).

## How it was measured

- **The project** (`bench/spaceProject.ts`): 10,000 elements laid out on the canvas as `?solids` lays them out, of which 200 show solids and are posed in World, 12 m apart, from 20 distinct solids (`spaceSolidFiles`), 2 of them at the caps: the solid at every cap at once (4,096 parts, each a mesh of its own, 991,232 triangles), which the holder nearest the middle shows, and the one at the cap on triangles (999,698), which two posed elements show. Twenty holders, drawings with parts, hold 100 anchored parts each, 2,000 in all. The others show a surface of 199,712 triangles three times, four surfaces of 7,000 to 28,000 triangles thirty times each, and small solids. At rest the space draws 5.64 million triangles; while its camera moves, the worker draws the farthest solids as their boxes, which leaves 1.88 million a frame at the whole space and 1.97 million close in. Twenty relations, ten between posed elements and ten to anchored parts, are the step played.
- **In Node** (`pnpm exec tsx packages/app/src/bench/space-timing.ts 10000 3`): what needs no GPU, on the page and in the worker.
- **In the browser** (`pnpm bench`'s build, served on 127.0.0.1 at another port, `bench.html?space` in work mode, then `&mode=frames`): the canvas and, beside it, the panel's drawing, 480 by 900 pixels, through the solid worker; the panel's component is not mounted, the page working out what it shows as the panel does (ADR 0076's clarification of the benchmark). Work mode times each change to the panel's frame, and each canvas frame's work, GPU included; frames mode the time between the frames that come.
- **The machine was not quiet:** another builder worked beside the runs. Chrome ran headless, which draws on the GPU but may pace frames as it likes.

## In Node

Times in milliseconds: median, 95th percentile and worst.

| Step | Median | 95th percentile | Worst | Runs |
| --- | --- | --- | --- | --- |
| Making the twenty canonical files, 40.8 MiB | 563 | 719 | 719 | 3 |
| Making them again, hashed, described, with the project | 8,333 | 8,333 | 8,333 | 1 |
| `spaceOf`, from nothing, 2,201 entries | 81 | 87 | 87 | 3 |
| The entries the worker draws | 3.3 | 3.5 | 3.5 | 3 |
| The panel's states after a selection, from the emphasis | 3.3 | 9.4 | 19.1 | 50 |
| The canvas's emphasis of a change of focus, for the panel | 4.9 | 12.4 | 12.4 | 20 |
| Building each solid with three.js | 24 | 4,275 | 4,275 | 20 |
| Laying the space out, 200 solids, 6,674 pieces | 38 | 120 | 120 | 3 |
| Laying it out exploded, at a factor of 1 | 19 | 261 | 261 | 3 |
| The exploded view's moves | 2.3 | 9.7 | 9.7 | 20 |
| The farthest solids boxed while the camera moves, 134 of 200 | 0.10 | 0.20 | 0.80 | 50 |
| A pick, whole space | 2.2 to 3.4 | 3.1 to 5.7 | 4.9 to 80 | 200 × 3 |
| A pick, close in on the holder at every cap | 1.8 to 2.0 | 3.4 to 4.3 | 13 to 22 | 200 × 3 |

## In the browser, work mode

The frame budget for a phase of frames is 10 ms on average, 13 ms at the 95th percentile and 33 ms at worst.

| Phase | Average | 95th percentile | Worst | Verdict |
| --- | --- | --- | --- | --- |
| Panel: turn the camera, whole space | 297 | 493 | 1,981 | misses |
| Panel: turn the camera, close in | 990 | 2,828 | 3,237 | misses |
| Panel: zoom in and out, close in | 382 | 2,612 | 2,918 | misses |
| Canvas, panel at rest: pan, whole view | 5.4 | 6.4 | 16.4 | meets |
| Canvas, panel at rest: zoom, whole view | 7.6 | 13.2 | 61.2 | misses, its worst frame |
| Canvas, panel at rest: select by clicking, whole view | 8.1 | 12.8 | 14.1 | meets |
| Canvas, panel at rest: pan, names shown | 23.1 | 26.9 | 2,734 | misses |
| Canvas, panel at rest: zoom, names shown | 4.3 | 6.1 | 9.9 | meets |
| Canvas, panel at rest: select by clicking, names shown | 6.7 | 10.2 | 11.9 | meets |
| Panel: play a step, its relations drawn in space | 241 | 270 | 2,771 | misses |
| Canvas: play a step, its relations drawn in space | 17.5 | 52.7 | 77.0 | misses |

| Change | Median | 95th percentile | Worst | Mark |
| --- | --- | --- | --- | --- |
| Panel: the whole space drawn again at rest, 5.64 million triangles | 3,025 | 3,454 | 3,555 | 33 ms, misses |
| A selection on the canvas, until the panel shows it | 2,878 | 3,319 | 3,364 | 33 ms, misses |
| A change of focus on the canvas, until the panel shows it | 2,105 | 2,625 | 2,876 | 33 ms, misses |
| A pick in the panel, answered | 2 | 3 | 2,024 | 16 ms, meets |

Of the 200 picks, 4 found an element: at the whole space, the solids fill little of the frame. The page's own work for a selection, the panel's states included, was 6.5 ms at the median, and for a change of focus 17.5 ms; the rest is the worker's. The panel drew no frame while the canvas's phases ran, so at rest it cost the canvas nothing.

## In the browser, frames mode

Frames as shown may run a little late, 18.1 ms on average and 25 ms at the 95th percentile, never past 33 ms. Headless Chrome offered frames at 60 a second.

| Phase | Average | 95th percentile | Worst | Verdict |
| --- | --- | --- | --- | --- |
| Panel: turn the camera, whole space | 788 | 1,128 | 1,128 | misses |
| Panel: turn the camera, close in | 2,435 | 2,435 | 2,435 | misses |
| Panel: zoom in and out, close in | 1,304 | 1,338 | 1,338 | misses |
| Canvas, panel at rest: pan, whole view | 16.7 | 16.8 | 16.8 | meets |
| Canvas, panel at rest: zoom, whole view | 16.8 | 16.7 | 33.3 | misses, one frame |
| Canvas, panel at rest: select by clicking, whole view | 16.7 | 16.7 | 16.7 | meets |
| Canvas, panel at rest: pan, names shown | 16.7 | 16.7 | 16.8 | meets |
| Canvas, panel at rest: zoom, names shown | 16.7 | 16.8 | 16.9 | meets |
| Canvas, panel at rest: select by clicking, names shown | 16.7 | 16.8 | 16.8 | meets |
| Panel: play a step, its relations drawn in space | 2,851 | 2,851 | 2,851 | misses |
| Canvas: play a step, its relations drawn in space | 16.7 | 16.7 | 16.8 | meets |

| Change | Median | 95th percentile | Worst | Mark |
| --- | --- | --- | --- | --- |
| Panel: the whole space drawn again at rest | 2,806 | 3,206 | 3,257 | 33 ms, misses |
| A selection on the canvas, until the panel shows it | 2,710 | 3,502 | 3,683 | 33 ms, misses |
| A change of focus on the canvas, until the panel shows it | 2,069 | 2,505 | 2,772 | 33 ms, misses |
| A pick in the panel, answered | 2 | 3 | 1,933 | 16 ms, meets |

The panel's phases of frames went one change a frame for 180 frames, three seconds, while the worker draws once a frame at most and takes every change waiting in its next: it drew 2 or 3 frames in each, so each of those rows holds one or two intervals between frames. The canvas kept its 60 frames per second while the step played, the panel drawing it beside the canvas.

## What it says

- **Picking meets its mark** with room, about 3 ms at the 95th percentile against 16 ms, in Node and in the browser alike; its worst, 2 s, came while the worker was still drawing.
- **The canvas with the panel at rest** meets the 10,000-element marks in four of its six phases in work mode and five in frames mode, where every frame but one of zooming the whole view came at 60 a second; in work mode panning with names shown and the worst frame of zooming the whole view miss them, as such phases did on this laptop in `benchmark-3.md` and `benchmark-4.md` without the panel, while the canvas also draws the 200 solids' pictures. Playing the step, the canvas keeps 60 frames a second as shown, but its work misses the budget at the 95th percentile (53 ms), the panel's lines being sent each frame.
- **The panel's frames are far from the marks**: about 3 frames a second turning at the whole space and 1 close in, against 60, though while the camera moves each frame draws fewer than 2 million triangles; the whole space drawn at rest, about 0.3 a second, against 30. A selection or a focus made on the canvas shows in the panel after about 2 to 3 s, against two frames.
- **What it points at**, for whoever takes it up: every change of states makes the worker lay the space out and build its three.js scene again (`SpaceDrawings`: the states are part of the layout's key), about 40 to 120 ms of layout in Node and then the scene and its materials, so a hover or a selection costs a whole scene; and each of the 6,674 pieces is a draw of its own, twice when something is marked, the cap's 4,096 meshes among them, which is what a moving camera pays. Drawing marks and looks from a table of states, as the canvas's parts' shader does, and merging the pieces of a solid that draw alike would be where to start.
- **What the run changed:** the worker worked out the exploded view's moves again for every frame, 2 to 10 ms at this size; it now keeps them until the entries, the factor or the solids loaded change.
