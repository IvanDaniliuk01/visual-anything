# A10's benchmark: an explorable live beside the 10,000-element view

Date: 2026-11-12. Measured by a builder for A10.5 (ADR 0107). By the user's decision of 2026-10-27, benchmark marks do not hold a milestone back: this is a record, and nothing was optimized.

## The machine

- The user's laptop: Windows 10 Pro 10.0.19045, an Intel Core i5-1135G7 (8 logical processors) with Intel Iris Xe graphics, 31.7 GiB of memory (4.9 and 8.4 GiB free at the start of the two runs), Node v22.16.0. Not quiet: the editor, the user's own Chrome and another builder's session were open.
- **The browser:** Chrome 157 headless (`--headless=new`) with `--site-per-process`, a window of 1600 by 900 pixels (a canvas of 1232 by 805) at a pixel ratio of 1, on the GPU through ANGLE and Direct3D 11 (`ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)`). Headless frames were paced at 60 Hz (16.7 ms at rest). No window was visible.
- **The build:** the bench Vite config's production build, served by the script on a port from 47800, **not cross-origin isolated** (a cross-origin isolated page may frame only documents that send the headers it requires, which the listener's frames do not): the clock reads to 0.1 ms.

## How it was measured

`pnpm exec tsx packages/server/scripts/explorables-bench.ts [--skip-build] [--modes=frames,work] [--json]` builds the pages, starts the program's frame listener serving the quadratic sample's explorable, and opens `/bench.html?elements=10000&explorable&listener=…&nonce=…&id=…&hash=…` once per mode (`packages/app/src/bench/explorable.ts`). The page pans and zooms the synthetic 10,000-element view (9,599 relations) for 180 frames each at four scales (the whole view, where names show, where details show, and 1:1) with no explorable, then makes the explorable live over a 320 by 240 spot in the middle of the scene, laid and moved as `LiveExplorable` lays it (a frame from the listener under a fresh label, so in a process of its own, scaled and moved through its style at every camera move), and runs the same phases. Frames mode times frames as shown, which is where a frame laid over the canvas costs what it costs; work mode times the canvas's own work, GPU included, which the frame over it does not enter.

The 10,000-element marks: work mode 10 ms on average, 13 ms at p95, 33.3 ms at worst; frames mode 18.1, 25 and 33.3 ms.

## Frames mode, two runs

Times in milliseconds: average, p95, worst. Run 1 built the pages; run 2 reused the build.

| Phase | No explorable, run 1 | Live, run 1 | No explorable, run 2 | Live, run 2 |
| --- | --- | --- | --- | --- |
| Pan, whole view | 16.7 / 16.8 / 16.8 | 16.7 / 16.8 / 17.4 | 16.8 / 16.8 / 33.3 | 16.7 / 16.8 / 17.0 |
| Zoom, whole view | 16.7 / 16.8 / 17.0 | 17.3 / 16.8 / 50.1 | 16.9 / 16.8 / 33.5 | 16.9 / 16.8 / 50.2 |
| Pan, names shown | 17.1 / 16.8 / 33.5 | 16.7 / 16.8 / 17.7 | 16.8 / 16.8 / 33.5 | 17.2 / 16.8 / 83.6 |
| Zoom, names shown | 16.7 / 16.8 / 17.0 | 18.3 / 33.4 / 66.7 | 16.7 / 16.8 / 18.1 | 17.0 / 16.9 / 33.5 |
| Pan, details shown | 16.7 / 16.8 / 16.9 | 16.7 / 16.8 / 17.0 | 17.1 / 16.8 / 83.6 | 16.7 / 16.8 / 17.6 |
| Zoom, details shown | 16.7 / 16.8 / 16.9 | 22.0 / 50.1 / 66.9 | 16.7 / 16.8 / 16.8 | 20.4 / 34.0 / 83.7 |
| Pan, at 1:1 | 16.8 / 16.8 / 33.3 | 18.2 / 16.8 / 283.9 | 16.7 / 16.8 / 16.9 | 16.7 / 16.8 / 16.8 |
| Zoom, at 1:1 | 16.8 / 16.8 / 33.3 | 20.6 / 33.6 / 66.7 | 17.4 / 16.8 / 117.0 | 21.6 / 33.6 / 50.2 |

The explorable was ready 502 and 403 ms after its frame was made, and answered the watchdog throughout both runs.

## Work mode, one run

| Phase | No explorable | Live |
| --- | --- | --- |
| Pan, whole view | 11.7 / 16.9 / 131.2 | 11.8 / 14.2 / 25.9 |
| Zoom, whole view | 12.0 / 21.5 / 40.9 | 12.5 / 27.4 / 33.0 |
| Pan, names shown | 13.0 / 25.6 / 39.8 | 11.9 / 14.8 / 23.6 |
| Zoom, names shown | 7.8 / 12.2 / 14.2 | 8.0 / 12.4 / 13.5 |
| Pan, details shown | 7.1 / 9.8 / 33.5 | 8.3 / 11.2 / 44.9 |
| Zoom, details shown | 6.8 / 9.6 / 29.6 | 6.9 / 9.5 / 14.0 |
| Pan, at 1:1 | 7.2 / 10.2 / 12.8 | 7.5 / 10.5 / 15.9 |
| Zoom, at 1:1 | 6.8 / 9.9 / 18.5 | 7.2 / 10.4 / 25.0 |

## What it says

- **Panning with an explorable live keeps the frame budget,** as without one: 16.7 ms on average and 16.8 ms at p95 at every scale, in both runs. Moving the frame through its style costs the canvas nothing it measures (work mode within noise of the same phases without it). One frame of 284 ms in run 1's pan at 1:1 did not come back in run 2.
- **Zooming with an explorable live misses at p95 where its frame is large:** where names and details show and at 1:1, frames as shown average 17 to 22 ms with p95 at 33 to 50 ms (two or three frames), against 16.8 ms without it. Each zoom step scales the frame, so its process draws its page again at the new scale every frame; the canvas's own work does not change. It misses the frames-mode marks (p95 25 ms, worst 33.3 ms) in those phases, and keeps them at the whole view, where the frame is small.
- The work-mode phases at the whole view and where names show miss the 10 ms average with or without the explorable, as on this laptop before (`benchmark-a9.md`, `benchmark-12.md`); the explorable does not change them.

## What to watch

- If zooming with an explorable live is felt, the frame could stay at its last scale while a zoom runs (drawn scaled as a picture, or hidden behind its still) and take the new scale once the zoom rests.
- Not measured: the app benchmark (`app-bench.html`) with the explorable panel open, an explorable that draws every frame (an animation) rather than once per change, Firefox, and the reference build's cross-origin isolated serving.

## After the frame keeps its scale through a zoom (2026-11-12)

Measured by the builder of several live explorables (ADR 0107's clarification of that day), once, with the same script and machine, Chrome 157 headless with `--site-per-process`, the other builder's session gone. The page now lays its frame through `LiveFollower`, as `LiveExplorable` does: its corner follows every camera move and its scale only once the camera has kept one for 180 ms. Times in milliseconds: average, p95, worst.

| Phase | Frames mode, no explorable | Frames mode, live | Work mode, no explorable | Work mode, live |
| --- | --- | --- | --- | --- |
| Pan, whole view | 17.0 / 16.8 / 66.8 | 16.7 / 16.8 / 17.3 | 8.5 / 11.4 / 14.3 | 7.4 / 10.3 / 12.1 |
| Zoom, whole view | 16.7 / 16.8 / 17.4 | 16.7 / 16.8 / 16.9 | 7.7 / 15.3 / 27.4 | 8.0 / 16.4 / 23.5 |
| Pan, names shown | 16.7 / 16.8 / 17.7 | 16.9 / 16.9 / 50.2 | 9.8 / 19.0 / 25.2 | 8.6 / 13.2 / 25.0 |
| Zoom, names shown | 16.7 / 16.9 / 17.5 | 16.7 / 16.8 / 16.9 | 5.1 / 8.3 / 11.7 | 6.1 / 8.6 / 11.2 |
| Pan, details shown | 17.1 / 16.9 / 83.5 | 16.7 / 16.9 / 17.6 | 5.2 / 6.0 / 7.9 | 5.4 / 6.4 / 12.1 |
| Zoom, details shown | 16.7 / 16.8 / 18.0 | 16.7 / 16.8 / 17.0 | 4.1 / 5.2 / 6.0 | 5.7 / 7.6 / 10.3 |
| Pan, at 1:1 | 16.7 / 16.8 / 17.5 | 16.7 / 17.1 / 22.7 | 4.8 / 5.9 / 6.4 | 4.6 / 5.6 / 6.1 |
| Zoom, at 1:1 | 16.9 / 16.8 / 50.0 | 16.7 / 16.8 / 18.8 | 4.7 / 5.5 / 6.5 | 5.2 / 6.3 / 7.3 |

- **Zooming with an explorable live now keeps the frame budget:** 16.7 ms on average and 16.8 ms at p95 at every scale, against 17 to 22 ms and 33 to 50 ms before, and within the frames-mode marks. While a zoom runs, the frame keeps its last scale with its corner on its spot's, so it shows larger or smaller than its shape until the zoom rests, about 180 ms later.
- Panning is as before. A hidden kept frame is not moved at all, so up to four live frames off screen and the frames kept hidden cost a pan nothing; up to four live on screen were not measured.
