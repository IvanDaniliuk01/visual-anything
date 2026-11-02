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

## After the panel's speed work

Date: 2026-10-31, the same day, on the same laptop and in the same way, on the branch that makes the panel fast enough to use (ADR 0076's clarification "the panel's speed"); no other builder ran beside it. Chrome 155 again, headless on the laptop's GPU, served on another port. "Before" is the run above.

**What the profile found.** Timed inside the worker, frame by frame: every change of states, and every change of which solids are boxed while the camera moves (most frames of a turn), laid the space out again (50 to 130 ms boxed, about 1 s whole) and made its scene again, whose first frame then prepared its new materials, 5,000 of them whole: 0.2 s boxed, 1.3 to 4.6 s whole. A frame drawn from a kept scene took 5 to 10 ms boxed (500 to 700 draws) but 150 to 230 ms whole (5,100 draws), the draws costing more than the 5.6 million triangles.

**What changed:** where things are is kept apart from how they look, and a scene follows a change of looks, boxes or the exploded view by writing tables and places, never making a material again; pieces that draw alike are merged once for each solid, so a frame takes 15 to 23 draws; a frame in which only lines, names or handles change draws them over the picture of the solids kept; and the programs a scene may need later are compiled once its first frame is sent.

### In Node, after

| Step | Before, median | After, median | After, 95th percentile |
| --- | --- | --- | --- |
| Laying the space out from nothing, now placing it and looking | 38 | 76 | 132 |
| Placing it, from nothing | n/a | 39 | 52 |
| Looking again after a selection, from the placement kept | 38 (laid out again) | 2.1 | 9.4 |
| Merging each solid's pieces that draw alike, once: 26.8 MiB, a second copy | n/a | 148 | 148 |
| Making the space's scene, 22 batches (20 of pieces) for 200 solids | n/a | 9.7 | 37 |
| The scene following a change of looks, in place | n/a (made again) | 1.2 | 2.1 |

The machine ran slower than for the first run (making the files took 10.4 s against 8.3 s), which the first row shows too.

### In the browser, work mode, after

| Phase | Before, average | After, average | After, 95th percentile | After, worst | Verdict |
| --- | --- | --- | --- | --- | --- |
| Panel: turn the camera, whole space | 297 | 18.1 | 20.1 | 264 | misses |
| Panel: turn the camera, close in | 990 | 16.7 | 19.7 | 34.3 | misses |
| Panel: zoom in and out, close in | 382 | 17.1 | 19.4 | 111 | misses |
| Canvas, panel at rest: pan, whole view | 5.4 | 4.8 | 5.7 | 6.2 | meets |
| Canvas, panel at rest: zoom, whole view | 7.6 | 7.1 | 12.0 | 48.5 | misses, its worst frame |
| Canvas, panel at rest: select by clicking, whole view | 8.1 | 6.7 | 7.6 | 8.8 | meets |
| Canvas, panel at rest: pan, names shown | 23.1 | 11.4 | 19.9 | 653 | misses |
| Canvas, panel at rest: zoom, names shown | 4.3 | 4.5 | 7.1 | 21.7 | meets |
| Canvas, panel at rest: select by clicking, names shown | 6.7 | 6.4 | 8.1 | 9.4 | meets |
| Panel: play a step, its relations drawn in space | 241 | 21.4 | 33.5 | 36.8 | misses |
| Canvas: play a step, its relations drawn in space | 17.5 | 12.9 | 16.9 | 19.0 | misses |

| Change | Before, median | After, median | After, 95th percentile | After, worst | Mark |
| --- | --- | --- | --- | --- | --- |
| Panel: the whole space drawn again at rest, 5.64 million triangles | 3,025 | 11 | 19 | 29 | 33 ms, meets |
| A selection on the canvas, until the panel shows it | 2,878 | 14 | 50 | 95 | 33 ms, misses at the 95th percentile |
| A change of focus on the canvas, until the panel shows it | 2,105 | 31 | 55 | 173 | 33 ms, misses at the 95th percentile |
| A pick in the panel, answered | 2 | 1.4 | 3.7 | 43 | 16 ms, meets |

A panel's phase in work mode times each change to its frame, and the worker draws at most once a frame, so about 16.7 ms is its floor: the panel's camera now moves at the frame rate, which the work budget of 10 ms on average cannot show. The page's own work for a selection was 5.1 ms at the median and for a change of focus 20.9 ms (the canvas's emphasis over 10,000 shapes and the panel's states), so most of what is left of a focus is the page's, not the worker's.

### In the browser, frames mode, after

| Phase | Before, average | After, average | After, 95th percentile | After, worst | Verdict |
| --- | --- | --- | --- | --- | --- |
| Panel: turn the camera, whole space | 788 | 16.7 | 19.8 | 31.6 | meets |
| Panel: turn the camera, close in | 2,435 | 16.8 | 19.2 | 33.5 | misses, by 0.2 ms at its worst |
| Panel: zoom in and out, close in | 1,304 | 16.7 | 19.4 | 20.5 | meets |
| Canvas, panel at rest: pan, whole view | 16.7 | 16.7 | 16.7 | 17.2 | meets |
| Canvas, panel at rest: zoom, whole view | 16.8 | 16.9 | 16.7 | 50.0 | misses, one frame |
| Canvas, panel at rest: select by clicking, whole view | 16.7 | 16.7 | 16.7 | 16.8 | meets |
| Canvas, panel at rest: pan, names shown | 16.7 | 20.7 | 16.8 | 717 | misses, one frame |
| Canvas, panel at rest: zoom, names shown | 16.7 | 16.7 | 16.7 | 16.8 | meets |
| Canvas, panel at rest: select by clicking, names shown | 16.7 | 18.3 | 16.8 | 117 | misses, one frame |
| Panel: play a step, its relations drawn in space | 2,851 | 16.7 | 18.0 | 35.6 | misses, one frame |
| Canvas: play a step, its relations drawn in space | 16.7 | 16.7 | 16.7 | 16.8 | meets |

| Change | Before, median | After, median | After, 95th percentile | After, worst | Mark |
| --- | --- | --- | --- | --- | --- |
| Panel: the whole space drawn again at rest | 2,806 | 14 | 20 | 32 | 33 ms, meets |
| A selection on the canvas, until the panel shows it | 2,710 | 12 | 28 | 29 | 33 ms, meets |
| A change of focus on the canvas, until the panel shows it | 2,069 | 29 | 58 | 180 | 33 ms, misses at the 95th percentile |
| A pick in the panel, answered | 2 | 1.5 | 3.0 | 45 | 16 ms, meets |

The panel's phases of frames now draw a frame for every change, 180 in three seconds, where they drew 2 or 3.

### What it says now

- **The panel's camera moves at 60 frames per second** as shown, at the whole space and close in, against 1 to 3 frames a second before; the whole space drawn again at rest, 5.64 million triangles, takes 11 to 14 ms against 3 s, within the 30 frames per second mark.
- **A selection made on the canvas shows in the panel within a frame at the median**, and within two at the 95th percentile in frames mode (28 ms); a change of focus within two frames at the median (29 to 31 ms) and 55 to 58 ms at the 95th percentile, about 20 ms of it the page's own work.
- **A step's lines** cost the worker 1 to 2 ms a frame, its solids not drawn again; the panel keeps 60 frames a second as shown while the step plays, and the canvas beside it too.
- **The single slow frames left** (264 ms turning the whole space, 111 ms zooming, 653 to 717 ms panning the canvas with names shown) came once each, as in the first run; they are not chased here.
- **The cost:** the merged copy of small pieces, 26.8 MiB for this space, kept once for each solid and let go of with it; opening the panel still takes about 1.3 s for its first frame, which builds, merges, uploads and compiles.

## Measured again (A4)

Date: 2026-11-01. Measured by a builder, on `develop` at `98ceb85` with every other A4 task merged, the last task of A4, recorded and not held; nothing was optimized.

- **Not the reference laptop:** the runs above were on the i5-1135G7; these are on an Intel Core i9-14900HX (32 logical processors, 32 GB) with an NVIDIA GeForce RTX 4060 Laptop GPU, Windows 11, on mains power in the balanced plan, the machine `benchmark-5.md` and `benchmark-12.md` measured A4 on. So "After the panel's speed work" above does not compare with these numbers; to read them against the code before A4's last merges, the build of `cf6c8d7` (A4's "The main thread") was measured again in work mode in the same hour.
- **In Node:** `pnpm exec tsx packages/app/src/bench/space-timing.ts 10000 3`, Node 24.22.
- **In the browser:** Chrome 156.0.8078.74 headless (`--headless=new`) on the RTX 4060 through ANGLE and Direct3D 11, a profile of its own on debugging port 9347, with `--disable-background-timer-throttling`, `--disable-renderer-backgrounding` and `--disable-backgrounding-occluded-windows`, 1600 by 900 pixels (1578 by 802 inside) at a pixel ratio of 1, cross-origin isolated; `pnpm bench`'s build served on 127.0.0.1:47721; `bench.html?space`, then `&mode=frames`. No browser window was visible. Headless Chrome offered frames every 4.2 ms, about 240 a second, so frames mode and the panel's phases time frames at that rate, not at 60 Hz, and the panel's floor of 16.7 ms in work mode above is 4.2 ms here.
- **Alongside:** the OneDrive sync service (about one processor), the antivirus, Windows Update in the first minutes, and the person's own idle programs (their Visual Anything server on 52927, their browser, their editor). No test run, benchmark or other builder's work.
- **What is not measured:** the panel's legend, which A4 added (`space/legend.ts`, ADR 0076's clarification "what M10 left"): the benchmark works out what the panel shows without mounting its component, and its view has no overlay that colors what the panel draws.

### In Node, measured again

| Step | After the speed work, reference laptop, median | Now, median | Now, 95th percentile |
| --- | --- | --- | --- |
| Making the twenty canonical files, 40.8 MiB | 563 (first run) | 218 | 270 |
| Making them again, hashed, described, with the project | 10,400 | 3,207 | 3,207 |
| `spaceOf`, from nothing, 2,201 entries | 81 (first run) | 19.7 | 26.4 |
| The panel's states after a selection, from the emphasis | 3.3 (first run) | 1.5 | 5.1 |
| The canvas's emphasis of a change of focus, for the panel | 4.9 (first run) | 1.7 | 5.1 |
| Laying the space out from nothing, placing it and looking | 76 | 18.8 | 19.2 |
| Placing it, from nothing | 39 | 14.8 | 15.6 |
| Looking again after a selection, from the placement kept | 2.1 | 0.84 | 1.8 |
| Merging each solid's pieces that draw alike, once, 26.8 MiB | 148 | 78 | 78 |
| Making the space's scene, 22 batches for 200 solids | 9.7 | 4.3 | 12.9 |
| The scene following a change of looks, in place | 1.2 | 0.30 | 0.63 |
| The exploded view's moves, as a frame sends them | 2.3 (first run) | 1.2 | 2.7 |
| The farthest solids boxed while the camera moves, 134 of 200 | 0.10 (first run) | 0.04 | 0.10 |
| A pick, whole space, 4 of 200 found an element | 2.2 to 3.4 (first run) | 0.94 to 1.02 | 1.2 to 1.5, worst 1.8 to 45 |
| A pick, close in on the holder at every cap, 40 of 200 found | 1.8 to 2.0 (first run) | 0.71 to 0.92 | 0.91 to 1.2, worst 4.9 to 25 |

"First run" marks the rows the speed work did not measure again, read from the first table above.

### In the browser, work mode, measured again

| Phase, average / 95th percentile / worst | After the speed work, reference laptop | `cf6c8d7`, this machine, today | Now | Verdict now |
| --- | --- | --- | --- | --- |
| Panel: turn the camera, whole space | 18.1 / 20.1 / 264 | 4.5 / 6.2 / 35.4 | 4.4 / 5.3 / 29.7 | meets |
| Panel: turn the camera, close in | 16.7 / 19.7 / 34.3 | 4.3 / 5.8 / 9.5 | 4.2 / 5.6 / 7.9 | meets |
| Panel: zoom in and out, close in | 17.1 / 19.4 / 111 | 4.2 / 5.1 / 6.5 | 4.2 / 5.2 / 6.0 | meets |
| Canvas, panel at rest: pan, whole view | 4.8 / 5.7 / 6.2 | 2.9 / 6.8 / 13.7 | 3.9 / 7.6 / 11.6 | meets |
| Canvas, panel at rest: zoom, whole view | 7.1 / 12.0 / 48.5 | 1.9 / 3.6 / 17.8 | 3.7 / 7.9 / 20.7 | meets |
| Canvas, panel at rest: select by clicking, whole view | 6.7 / 7.6 / 8.8 | 1.8 / 2.2 / 2.6 | 1.9 / 2.2 / 2.7 | meets |
| Canvas, panel at rest: pan, names shown | 11.4 / 19.9 / 653 | 2.5 / 5.8 / 10.7 | 1.9 / 6.0 / 8.8 | meets |
| Canvas, panel at rest: zoom, names shown | 4.5 / 7.1 / 21.7 | 2.0 / 3.7 / 8.6 | 1.1 / 2.3 / 4.1 | meets |
| Canvas, panel at rest: select by clicking, names shown | 6.4 / 8.1 / 9.4 | 3.7 / 8.5 / 9.8 | 3.4 / 6.5 / 14.5 | meets |
| Panel: play a step, its relations drawn in space | 21.4 / 33.5 / 36.8 | 5.5 / 10.3 / 20.5 | 6.5 / 11.1 / 17.4 | meets |
| Canvas: play a step, its relations drawn in space | 12.9 / 16.9 / 19.0 | 1.9 / 2.5 / 2.9 | 1.9 / 2.6 / 2.7 | meets |

| Change, median / 95th percentile / worst | After the speed work, reference laptop | `cf6c8d7`, today | Now | Mark |
| --- | --- | --- | --- | --- |
| Panel: the whole space drawn again at rest, 5.64 million triangles | 11 / 19 / 29 | 4 / 10 / 15 | 4 / 8 / 16 | 33 ms, meets |
| A selection on the canvas, until the panel shows it | 14 / 50 / 95 | 5 / 8 / 8 | 5 / 7 / 8 | 33 ms, meets |
| A change of focus on the canvas, until the panel shows it | 31 / 55 / 173 | 11 / 19 / 39 | 13 / 22 / 34 | 33 ms, meets |
| A pick in the panel, answered | 1.4 / 3.7 / 43 | 1 / 2 / 20 | 1 / 1 / 19 | 16 ms, meets |

The page's own work for a selection was 1.9 ms at the median now (2.3 at `cf6c8d7`, 5.1 on the reference laptop), and for a change of focus 8.3 ms (7.7, 20.9). The panel drew no frame while the canvas's phases ran.

### In the browser, frames mode, measured again

| Phase, average / 95th percentile / worst | After the speed work, reference laptop | Now | Verdict now |
| --- | --- | --- | --- |
| Panel: turn the camera, whole space | 16.7 / 19.8 / 31.6 | 4.4 / 6.1 / 23.9 | meets |
| Panel: turn the camera, close in | 16.8 / 19.2 / 33.5 | 4.2 / 5.6 / 7.1 | meets |
| Panel: zoom in and out, close in | 16.7 / 19.4 / 20.5 | 4.2 / 5.2 / 7.1 | meets |
| Canvas, panel at rest: pan, whole view | 16.7 / 16.7 / 17.2 | 4.2 / 5.0 / 5.7 | meets |
| Canvas, panel at rest: zoom, whole view | 16.9 / 16.7 / 50.0 | 4.2 / 4.4 / 17.7 | meets |
| Canvas, panel at rest: select by clicking, whole view | 16.7 / 16.7 / 16.8 | 4.2 / 4.3 / 4.3 | meets |
| Canvas, panel at rest: pan, names shown | 20.7 / 16.8 / 717 | 4.2 / 4.3 / 8.4 | meets |
| Canvas, panel at rest: zoom, names shown | 16.7 / 16.7 / 16.8 | 4.2 / 4.2 / 4.4 | meets |
| Canvas, panel at rest: select by clicking, names shown | 18.3 / 16.8 / 117 | 4.2 / 4.2 / 4.3 | meets |
| Panel: play a step, its relations drawn in space | 16.7 / 18.0 / 35.6 | 4.2 / 4.4 / 8.3 | meets |
| Canvas: play a step, its relations drawn in space | 16.7 / 16.7 / 16.8 | 4.2 / 4.9 / 6.1 | meets |

| Change, median / 95th percentile / worst | After the speed work, reference laptop | Now | Mark |
| --- | --- | --- | --- |
| Panel: the whole space drawn again at rest | 14 / 20 / 32 | 5 / 8 / 11 | 33 ms, meets |
| A selection on the canvas, until the panel shows it | 12 / 28 / 29 | 6 / 8 / 11 | 33 ms, meets |
| A change of focus on the canvas, until the panel shows it | 29 / 58 / 180 | 13 / 20 / 39 | 33 ms, meets |
| A pick in the panel, answered | 1.5 / 3.0 / 45 | 1 / 1 / 20 | 16 ms, meets |

Turning the camera, 4 of the 180 changes at the whole space and 2 close in drew no frame of their own, the worker taking them in its next.

### What it says, measured again

- **On this machine every phase and every change meets its mark,** in work mode and frames mode, the panel's camera moving at the frame rate headless Chrome offers, about 240 a second, and a change of focus showing within two frames at the 95th percentile (20 to 22 ms), which missed on the reference laptop (55 to 58 ms).
- **No regression from A4:** now and `cf6c8d7` measured in the same hour are within each other's spread in every row; the only miss of `cf6c8d7`'s run, one frame of 35 ms turning the whole space, did not come back now. A4 changed the panel's legend, its follower and its words for where an element is (`space/`), none of which the benchmark's phases draw or run.
- **Against the reference laptop,** the numbers fell by three to five times, which is the machine, not A4; the reference laptop was not measured again in this task.
