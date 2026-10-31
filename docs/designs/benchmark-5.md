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
