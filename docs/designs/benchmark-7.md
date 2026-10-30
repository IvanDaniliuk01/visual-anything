# Seventh benchmark: a tour step's glide at 10,000 elements (M11d)

Date: 2026-10-30. Measured on the branch that fixes the spec review of M3e and M11d, after M11d was merged, in Node 22.16 on the reference laptop from `benchmark-3.md`. It records, once, what a tour step that glides costs the stage on the 10,000-element view (ADR 0084). By the user's decision of 2026-10-27, benchmark marks do not hold a milestone back; nothing here was optimized.

## How it was measured

- **The script.** `pnpm exec tsx packages/app/src/bench/glide-timing.ts 10000 <boxes|tables> 20`, in one Node thread. It builds the scene of the benchmark's own project (`syntheticProject`) and takes the cameras of the benchmark's glide phase (`packages/app/src/bench/glide.ts`): the zoom where shapes draw in full (`COARSE_BELOW * 1.04`) looking at the view's middle, toward a camera twice as near and half a screen over. It times:
  - `glideSideOf` for the step before and the step after: the shapes on screen with each camera, and how each is drawn simply;
  - `planGlide`: the first 400 of the step before matched against the step after, and again with no cap on the step before;
  - `drawGlideFrame`: 96 frames, the longest glide of 800 ms at 60 frames a second twice over, after the same 96 to warm the code, for the pairs the plan glides and again for all 400 shapes the step before keeps, each moving to where the camera after puts it, on the screen or off it.
- **The 2D context records.** Node has no canvas, so each frame is drawn on a context that keeps every call and its arguments and paints nothing, and measures names in Roboto's widths at 12 px (`robotoWidth`), as the canvas measures them. The frames therefore time the layer's own work: placing each shape between its places, cutting its name to fit and making its calls. What a browser's 2D canvas spends painting them is not in them.
- **The screen** is the reference laptop's 1,366 × 768 display less the browser's bars: 1,366 × 650 CSS pixels, at one device pixel each.
- **The machine was not quiet:** another builder's tests and this branch's own ran beside the script. The medians say more than the worst runs, which hold the JIT's first passes and the other work.
- **The frames on a real canvas** are not measured here: the benchmark's phase (`pnpm bench`) draws them in the browser beside the canvas's own frame, and this session opened no browser. They are measured with the next browser run.

## The numbers

Times in milliseconds, median and worst of the runs. Three runs of the script on `boxes`, one on `tables`.

| Step | `boxes`, run 1 | `boxes`, run 2 | `boxes`, run 3 | `tables` |
| --- | --- | --- | --- | --- |
| Shapes in the scene | 10,000 | 10,000 | 10,000 | 10,301 |
| Shapes on screen before / after | 441 / 122 | 441 / 122 | 441 / 122 | 56 / 14 |
| `glideSideOf`, the step before (20 runs) | 0.92 / 10.3 | 1.16 / 35.9 | 1.66 / 19.9 | 0.81 / 1.11 |
| `glideSideOf`, the step after (20 runs) | 0.96 / 1.76 | 1.36 / 17.3 | 0.70 / 15.2 | 0.42 / 7.65 |
| `planGlide`, 400 (or all) before against the step after (20 runs) | 0.51 / 1.51 | 0.48 / 15.3 | 0.52 / 1.57 | 0.07 / 0.26 |
| `planGlide`, every shape before, no cap (20 runs) | 0.43 / 1.95 | 0.21 / 0.32 | 0.46 / 0.72 | 0.08 / 0.10 |
| What the plan glides | 122 shapes over 449 ms | 122 over 449 ms | 122 over 449 ms | 14 over 438 ms |
| `drawGlideFrame`, the plan's pairs (96 frames) | 0.55 / 6.47 | 0.48 / 3.74 | 0.51 / 8.82 | 0.08 / 0.17 |
| 95th percentile of those frames | 1.82 | 1.38 | 1.60 | 0.11 |
| `drawGlideFrame`, all 400 shapes before (96 frames) | 1.84 / 8.59 | 1.69 / 11.8 | 1.90 / 13.0 | 0.22 / 1.12 (56 shapes) |
| 95th percentile of those frames | 5.01 | 4.03 | 3.70 | 0.33 |
| Calls a frame, at most | 2,402 for 400 shapes | 2,402 | 2,402 | 338 for 56 |

Two earlier runs of the script, on a screen of 1,536 × 730 at 1.25 device pixels, gave the same shape: 564 shapes on screen before and 142 after, `planGlide` at 0.50 to 0.62 ms, and the plan's 142 shapes drawn at 0.60 to 0.71 ms a frame at the median, all 400 at 1.64 to 1.99 ms.

## What it says

- **Working out a glide costs about 2 to 3 ms on the main thread,** once, when a step starts: both sides by `glideSideOf` over every shape of the scene, then `planGlide`'s match. It runs while the frame before is held (ADR 0084's clarification), so nothing moves during it.
- **A frame of the layer's own work stays under 2 ms at the median for 400 shapes,** 6 calls a shape: a path, a fill, a stroke and the name. That leaves most of a 16.7 ms frame to painting them and to the canvas's own frame under the layer, which the browser run measures.
- **Fewer than 400 shapes glide in this phase.** Twice as near and half a screen over, the camera after shows 122 of the 400 the step before keeps, so the plan glides 122, and the frames with all 400 moving stand for a step that keeps them all on screen. A phase that keeps 400 on both sides would need a camera after that frames them; it is left as it is, since the frames with all 400 already say what 400 cost.
- **The worst runs are the JIT's and the busy machine's:** each first pass, and runs beside the other tests, reach 6 to 36 ms, about ten times their medians.
