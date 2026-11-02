# Fifth benchmark: layout and routing at 10,000 elements (M3c Stage 3)

Date: 2026-10-30. Measured on the Stage 3 branch, after libavoid left the shipped app, in Node 22 on the reference laptop from `benchmark-3.md`. It records layout time, routing time and the quality measures of ADR 0080 at 10,000 elements once. By the user's decision of 2026-10-27, benchmark marks do not hold a milestone back; nothing here was optimized.

## How it was measured

- **The script.** `pnpm exec tsx packages/app/src/canvas/layout/timing.ts 10000 view <boxes|tables>`. It runs, in one thread, what the app runs in its layout worker and its routing worker. It also times the main thread's share: the input from the scene, the copies to and from the workers, the command, applying it, the scene after it, the routing request, and the routes applied.
- **Layout.** Layout of the whole view, with no time limit, so that ELK's whole cost shows; the app stops at ADR 0015's 20 s and packs what is left in rows.
- **Routing.** Every line of the view as drawn after the layout, routed at once by the program's router (`avoidRoutes`), as after a move, without ELK's kept routes. Then the channel pass (`channelledScene`: its input, the pass and its routes applied, in one thread).
- **Quality.** `measureScene` on the result, as the quality tests measure the fixture.
- **The projects.**
  - `tables`: `syntheticTables(10000)`, the view of tables ADR 0080 measured in Stage 0b: 10,301 shapes, 401 of them tables, and 997 references between rows. It is within the one-pass budget, so it goes in one pass.
  - `boxes`: `syntheticProject({ elements: 10000 })`, the benchmark's project: 10,000 shapes and 11,420 relations given to ELK. It is beyond the budget, so it goes container by container.

## Numbers

Times in milliseconds. ✗ marks a miss of ADR 0080's marks: layout within 20 s, every line routed in the worker within 3 s, and no main-thread task over 50 ms.

| Step | `tables` | `boxes` |
| --- | --- | --- |
| Main thread: input from the scene | 142.8 ✗ | 113.5 ✗ |
| Main thread: copy of the input to the worker | 68.6 ✗ | 66.4 ✗ |
| Worker: the whole layout | 31,651 ✗ | 26,356 ✗ |
| of which ELK | 18,355 in 2 runs | 26,026 in 38 runs |
| Main thread: copy of the result back | 11.3 | 22.9 |
| Main thread: the command | 17.2 | 39.8 |
| Core: applying the command | 12.1 | 124.5 ✗ |
| Main thread: the scene after it | 241.0 ✗ | 266.7 ✗ |
| Main thread: the routing request | 60.9 ✗ | 48.7 |
| Main thread: copy of the request to the worker | 13.5 | 50.7 ✗ |
| Worker: every line routed | 736 (997 lines, 54 given up) | 1,072 (9,599 lines, 1,691 given up) |
| Main thread: the routes applied | 8.2 | 25.4 |
| Channel pass: input, pass and routes applied | 443 | 3,277 |

- **Quality, `tables`** (997 lines, every line routed by the router): 15,273 crossings (15.32 a line), 75 shared segments, 52 lines through shapes, 1.95 bends a line, no overlapping siblings, every end on a row at its row's middle (1,994 of 1,994), fill 0.03, aspect 0.3. Measuring took 8.6 s.
- **Quality, `boxes`:** not measured. `measureScene` did not finish on 9,599 lines within the script's 20 minutes.

## What it says

- **Layout misses its 20 s at 10,000 elements.** On `tables`, ELK takes 18.4 s for the one pass, and the work around it (the plan, the placing and the routes carried) takes another 13 s. The app would stop at 20 s and pack what is left. On `boxes`, ELK's 38 runs take 26 s.
- **Routing keeps within its 3 s:** 0.74 s and 1.07 s. The channel pass adds 0.44 s and 3.3 s, which the app runs in the routing worker too.
- **The main thread's share is over 50 ms in several steps,** as the incremental scene's and the benchmark's earlier numbers were on this laptop. The largest are the scene built after the layout (241 and 267 ms) and the input from the scene (143 and 114 ms).
- **Stability** (Stage 3) is measured on the fixture and on random views by `stability.test.ts`; see ADR 0080's clarification of Stage 3.

## After A4

Date: 2026-10-31. Measured by a builder, on the branch that builds A4's "The main thread", recorded and not held. ADR 0015's and ADR 0080's clarifications of this date say what changed.

- **The machine:** not the reference laptop above, but an Intel Core i9-14900HX (32 logical processors), 32 GB of memory and an NVIDIA GeForce RTX 4060 Laptop GPU, on Windows 11, with Node 24.22 in Node and Chrome 156 headless in the browser. No test run, benchmark or other builder's work ran meanwhile; the OneDrive sync service, which the repository lives under, kept part of a processor busy. ELK's own time varies by a quarter from run to run on it.
- **The script:** the same, `timing.ts 10000 view <tables|boxes>`, with `no-measures` on `boxes`, whose measures took more than 20 minutes above. "Before" is the same script on this machine at the start of the task, so the two columns compare; the reference laptop's numbers above do not.
- **The browser:** the canvas benchmark's own "Apply a layout: every shape moves" (`bench.html?elements=10000`, `pnpm bench`'s build, served on 127.0.0.1:47721), which applies to the 10,000 boxes a layout that moves every shape with a position one step, as one task: the scene, its index, and the canvas's tiles and frame.

Times in milliseconds; ✗ marks a miss of ADR 0080's marks, as above.

| Step | `tables` before | `tables` after | `boxes` before | `boxes` after |
| --- | --- | --- | --- | --- |
| Main thread: input from the scene | 86.4 ✗ | 25.7 | 64.7 ✗ | 32.3 |
| Main thread: copy of the input to the worker | 28.9 | 15.2 | 18.5 | 35.1 |
| Worker: the whole layout | 18,202 | 10,679 | 17,279 | 15,812 |
| of which ELK | 13,288 in 2 runs | 10,453 in 2 runs | 17,167 in 38 runs | 15,701 in 38 runs |
| Worker: the rest, around ELK | 4,914 | 226 | 112 | 110 |
| Main thread: copy of the result back | 6.1 | 6.6 | 16.6 | 16.1 |
| Main thread: the command | 12.4 | 11.5 | 30.6 | 27.5 |
| Core: applying the command | 11.0 | 8.5 | 94.2 ✗ | 93.8 ✗ |
| Main thread: the scene after it | 167.9 ✗ | 63.2 ✗ | 244.4 ✗ | 193.1 ✗ |
| Main thread: the routing request | 13.6 | 15.9 | 32.5 | 27.8 |
| Main thread: copy of the request to the worker | 6.0 | 5.9 | 28.4 | 30.1 |
| Worker: every line routed | 371 (997 lines, 54 given up) | 371 (the same) | 558 (9,599 lines, 1,691 given up) | 540 (the same) |
| Main thread: the routes applied | 4.1 | 4.3 | 12.1 | 10.8 |
| Channel pass | 259 | 239 | 2,529 | 2,415 |
| The measures | 3,823 | 213 | not run | not run |

- **Quality, `tables`:** the same, line for line: 15,273 crossings (15.32 a line), 75 shared segments, 52 lines through shapes, 1.95 bends a line, no overlapping siblings, every end on a row at its row's middle (1,994 of 1,994), fill 0.03, aspect 0.3.
- **The scene after the layout, warm:** built again from the same scene before, as an undo and a layout again would, the view of tables takes 20 to 45 ms and the boxes 115 to 135 ms in Node (the first build after ELK's run, above, pays for what the run left to collect).
- **In the browser,** "Apply a layout: every shape moves" took 316 ms at the median and 349 at worst after, against 315 and 349 before (the mark is 150): the scene 85 ms against 88, its index 31 against 27, the canvas's tiles and frame 187 against 191. On the boxes, which store sizes for no shape and draw no rows, moving a shape kept little measuring: the scene's time there is the lines routed again between every shape that moved.

### What it says

- **The layout keeps within its 20 s at 10,000 elements on this machine,** on both views. On the view of tables the work around ELK fell from 4.9 s to 0.2 s: the routes carried after the pass checked every segment against every shape of the view, and now check those near it.
- **The input from the scene** is within its 50 ms after: what took the time was the first run of its code, which the app's first layout pays as this script does; built again it takes 2 to 5 ms.
- **The scene after a layout** is about a third as long on the view of tables, whose tables are moved with their rows rather than measured again, and still over 50 ms at its first build there; on the boxes it is still about 190 ms in Node and 85 ms in the browser, with the canvas's tiles after it, about 190 ms, in the same task. The core's applying the command is about 95 ms on the boxes. These are the steps over 50 ms that remain; splitting the scene's routing and the tiles over frames, or routing in the worker, is left for later.
- **What the earlier numbers counted:** in Node through `tsx`, which keeps functions' names, each closure made costs a property definition. The routes carried made four closures for each segment and shape, so part of the 13 s above was `tsx`'s, not the worker's.

## Measured again (A4)

Date: 2026-11-01. Measured by a builder, on `develop` at `98ceb85` with every other A4 task merged, recorded and not held, the last task of A4. Nothing was optimized.

- **The machine:** the same as "After A4" above (i9-14900HX, 32 logical processors, 32 GB, RTX 4060 Laptop GPU, Windows 11), on mains power in Windows' balanced plan, with Node 24.22 and Chrome 156.0.8078.74 headless. Alongside ran the OneDrive sync service (about one processor throughout), the antivirus (`bdservicehost`, under one processor), Windows Update for the first minutes, and the person's own idle programs: their Visual Anything server on 52927, their browser and editor. No test run, benchmark or other builder's work ran meanwhile. The total load before the runs was 7 to 17% of the 32 processors.
- **The machine ran faster than on 2026-10-31.** The same code measured both days took about half the time today: the layout of the view of tables 10.7 s on 2026-10-31 and 6.3 s today, before the last merge; "Apply a layout" 316 ms then and 123 ms today, at `cf6c8d7`, the commit "After A4" measured. So "After A4" above does not compare with today's numbers, and each step below is also measured today before the last merge, by checking out the layout's and routing's files of `cff572c` (the merge before "Layout that reads on a real model") into the same tree. "Before the merge" is that; "now" is `98ceb85`.
- **The script:** the same, `timing.ts 10000 view tables` and `timing.ts 10000 view boxes no-measures`, run twice before the merge and three times now, in turns; each cell gives the lowest and highest of those runs.
- **The browser:** the canvas benchmark's "Apply a layout: every shape moves" (`bench.html?elements=10000`, `pnpm bench`'s build served on 127.0.0.1:47721, work mode), three runs now and one of the `cf6c8d7` build, the "After A4" commit, in the same hour.

Times in milliseconds; ✗ marks a miss of ADR 0080's marks, as above.

| Step | `tables` before the merge | `tables` now | `boxes` before the merge | `boxes` now |
| --- | --- | --- | --- | --- |
| Main thread: input from the scene | 22.1–23.2 | 24.1–40.3 | 30.8–33.0 | 48.6–50.7 (✗ in one run) |
| Main thread: copy of the input to the worker | 14.0–14.5 | 13.4–14.9 | 19.6–20.3 | 33.0–37.8 |
| Worker: the whole layout | 6,261–6,313 | 5,927–6,191 | 8,683–8,748 | 8,729–8,949 |
| of which ELK | 6,129–6,154 in 2 runs | 5,822–6,039 in 2 runs | 8,554–8,634 in 38 runs | 8,634–8,855 in 38 runs |
| Worker: the rest, around ELK | 132–159 | 105–151 | 114–129 | 93–94 |
| Main thread: copy of the result back | 3.6–3.8 | 3.2–4.2 | 7.8–8.0 | 7.8–8.2 |
| Main thread: the command | 5.9–6.7 | 4.4–5.1 | 15.7–17.6 | 15.0–15.8 |
| Core: applying the command | 5.2–16.3 | 4.7–6.4 | 43.1–43.8 | 41.3–42.2 |
| Main thread: the scene after it | 30.1–38.3 | 27.0–34.4 | 90.1–94.4 ✗ | 93.0–97.4 ✗ |
| Main thread: the routing request | 5.6–6.7 | 5.3–8.3 | 13.9–15.3 | 12.9–15.4 |
| Main thread: copy of the request to the worker | 3.1–3.5 | 3.1–3.9 | 14.7 | 15.3–15.5 |
| Worker: every line routed | 193–204 (997 lines, 54 given up) | 159–173 (997 lines, 51 given up) | 313–333 (9,599 lines, 1,691 given up) | 307–329 (the same) |
| Main thread: the routes applied | 2.3–2.5 | 2.0–2.2 | 5.2–6.7 | 5.1–6.7 |
| Channel pass | 130–133 | 114–123 | 1,449–1,475 | 1,454–1,508 |
| The measures | 110–123 | 101–110 | not run | not run |

- **Quality, `tables`, now:** 15,423 crossings (15.47 a line, from 15,273), 26 shared segments (from 75), 48 lines through shapes (from 52), 1.9 bends a line (from 1.95), no overlapping siblings, every end on a row at its row's middle (1,994 of 1,994), fill 0.02 (from 0.03), aspect 0.32 (from 0.3). The shared segments and lines through shapes fell with ELK's kept routes that lay on another line going to the router (`sharedRuns.ts`).
- **On the boxes,** both before and after, ELK is given 11,420 relations and 1,762 are left out of the run, packed in the room left; nothing was packed for time.

| "Apply a layout: every shape moves", p50 / p95 / worst (mark: p95 ≤ 150) | `cf6c8d7`, the "After A4" commit | Now, run 1 | Now, run 2 | Now, run 3 |
| --- | --- | --- | --- | --- |
| The whole task | 123 / 141 / 141 | 119 / 254 / 254 ✗ | 159 / 193 / 193 ✗ | 142 / 178 / 178 ✗ |
| Of it, on average: the scene, its index, the tiles and frame | 32, 14, 79 | 54, 15, 84 | 44, 14, 98 | 38, 14, 91 |

### What it says

- **What the wider container spacing did to layout time: nothing these two views can show.** ADR 0080's clarification of 2026-10-31 gives every compound node of the one-pass graph (`wholeGraph`) section 1's spacings. The view of tables goes in one pass but has no compound nodes, its rows being ports, and the boxes go container by container, so neither view's ELK input changed: ELK took the same time before and after the merge on both, within the 5% the runs vary by (tables 6.1 s against 5.8 to 6.0; boxes 8.6 s against 8.6 to 8.9). On a view whose containers are laid out in one pass, as the person's own data model is, the boxes are larger and their corridors wider; its layout time was not measured here, since its copy never enters the repository.
- **The layout keeps within ADR 0015's 20 s** on both views, 6 and 9 s on this machine today, ELK nearly all of it.
- **Over 50 ms on the main thread, still:** on the boxes, the scene after the layout (about 95 ms in Node), and, at the edge of its 50 ms, the input from the scene, 49 to 51 ms against 31 to 33 before the merge in every run, with its copy to the worker, 33 to 38 ms against 20. The merge did not change the input's code (`layout/input.ts` and what it imports); it changed the modules loaded beside it (`engine.ts`, `keptRoutes.ts`, the new `sharedRuns.ts`), and the step is the first run of its code, which "After A4" found to take 2 to 5 ms warm. The likely cause is a collection of the larger heap the new modules leave falling in these two steps, not more work in them, since the input is the same size before and after; recorded, not chased.
- **In the browser,** "Apply a layout" has a median of 119 to 159 ms now against 123 at `cf6c8d7`, and a 95th percentile of 178 to 254 against 141, missing its 150 in each run now where the earlier build met it in its one run. The scene's share went from 32 to 38–54 ms. Nothing merged since `cf6c8d7` is on that path for this view: the one change to the scene's code, the check of a curve between the points of its flattening (`routing/rounded.ts`), runs only for automatic curved lines, and the benchmark's view draws none while it lays out. The task times four layouts, so its 95th percentile is the slowest of four; read as the run's spread, not as a regression, until more runs of both builds say otherwise. Recorded, not held.
