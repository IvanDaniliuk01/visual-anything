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
