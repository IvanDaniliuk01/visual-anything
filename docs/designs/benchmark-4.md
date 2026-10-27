# Fourth benchmark: the canvas beyond boxes, at 10,000 elements

Date: 2026-10-27. Measured on `develop` at `819115a`, the commit after M8b's review. This document records what the beyond-boxes benchmark measured once, and which marks it missed. On the same day the user decided that benchmark marks do not hold back a milestone, since the reference laptop is slow. The misses are follow-ups in the spec; nothing here was optimized.

## How it was measured

- **The machine.** The reference laptop from `benchmark-3.md`: a Dell Latitude 3420 with an Intel Core i5-1135G7 and Intel Iris Xe Graphics. Nothing else of the project ran beside the benchmark except the user's two idle app instances. The user's other tools kept their MCP servers running.
- **The browser.** Chrome 155.0.8059.85, in a profile of its own, started with `--disable-background-timer-throttling`, `--disable-renderer-backgrounding` and `--disable-backgrounding-occluded-windows`, maximized. Each run had its own tab, brought to the front every 15 seconds through the DevTools protocol.
- **The pages.** Built and served by `pnpm bench` on 127.0.0.1:47707, cross-origin isolated, so the clock ticked every 0.005 ms.
- **The runs.** Each variant ran once: `?geometry`, `?geometry&mode=frames`, `?geometry&curves` and `?geometry&curves&mode=frames`.
- **The project.** 10,000 elements and 8,619 relations; 2,000 shapes with free geometry and 1,000 anchored parts, as W60's harness builds them.
- **The marks.**
  - Frames: average ≤ 10 ms, p95 ≤ 13 ms and worst ≤ 33.3 ms.
  - A theme switch: 95% of frames within 16.7 ms and every frame within 33 ms (A1).
  - Pointing: ≤ 1 ms at the 95th percentile.
  - A drop and a resize's let go: ≤ 50 ms at the 95th percentile.

Cells are "average / p95 / worst" for frames and "p50 / p95 / worst" for timed actions, in milliseconds; ✗ marks a miss.

## Frames

| Phase | `?geometry` | `&mode=frames` | `&curves` | `&curves&mode=frames` |
| --- | --- | --- | --- | --- |
| Pan, whole view | 6.5 / 8.0 / 45.2 ✗ | 6.6 / 8.7 / 11.6 | 6.1 / 7.8 / 9.3 | 6.1 / 7.7 / 8.7 |
| Zoom, whole view | 8.4 / 22.4 / 105.2 ✗ | 8.1 / 18.6 / 30.8 ✗ | 9.0 / 22.6 / 32.6 ✗ | 8.0 / 18.9 / 35.7 ✗ |
| Select, whole view | 7.2 / 9.0 / 11.7 | 6.7 / 8.4 / 9.5 | 15.3 / 17.4 / 18.3 ✗ | 6.5 / 7.9 / 8.6 |
| Pan, names shown | 7.7 / 14.4 / 20.0 ✗ | 9.3 / 17.6 / 52.4 ✗ | 8.6 / 13.8 / 19.8 ✗ | 8.3 / 11.7 / 20.2 |
| Zoom, names shown | 4.1 / 5.8 / 7.2 | 5.8 / 9.1 / 11.0 | 5.7 / 9.0 / 19.3 | 5.4 / 8.1 / 11.5 |
| Select, names shown | 9.7 / 22.9 / 58.9 ✗ | 9.4 / 15.6 / 20.5 ✗ | 9.3 / 15.8 / 18.4 ✗ | 8.2 / 13.1 / 17.8 ✗ |
| Point along outlines | 8.0 / 11.7 / 13.5 | 9.4 / 12.3 / 14.5 | 7.9 / 10.1 / 15.3 | 8.0 / 9.4 / 11.1 |
| Drag the hub | 15.6 / 27.9 / 214.6 ✗ | 17.1 / 27.1 / 188.9 ✗ | 14.9 / 22.6 / 293.7 ✗ | 13.2 / 22.4 / 161.4 ✗ |
| Resize the hub, guides shown | 10.3 / 16.5 / 80.9 ✗ | 10.0 / 17.3 / 29.3 ✗ | 9.3 / 15.4 / 25.5 ✗ | 8.8 / 14.0 / 34.3 ✗ |
| Pan, drawings with parts, images cold | 16.1 / 19.0 / 32.4 ✗ | 6.6 / 8.7 / 27.7 | 14.1 / 18.0 / 33.5 ✗ | 6.1 / 7.9 / 10.0 |
| Pan, pictures far out, images cold | 10.4 / 16.7 / 31.0 ✗ | 7.9 / 10.9 / 29.4 | 10.3 / 22.4 / 75.1 ✗ | 7.8 / 10.8 / 28.7 |
| Zoom, images cold | 11.7 / 17.2 / 33.1 ✗ | 4.6 / 6.5 / 8.3 | 4.5 / 6.8 / 62.8 ✗ | 11.6 / 17.5 / 33.2 ✗ |
| Switch theme, whole view | 17.4 / 29.1 / 73.9 ✗ | 16.4 / 28.3 / 40.0 ✗ | 16.3 / 26.7 / 36.0 ✗ | 18.8 / 31.9 / 182.0 ✗ |
| Switch theme, names shown | 15.6 / 34.6 / 41.2 ✗ | 17.3 / 38.8 / 76.3 ✗ | 19.8 / 50.1 / 77.9 ✗ | 15.0 / 31.1 / 37.9 ✗ |

## Timed actions

| Action | `?geometry` | `&mode=frames` | `&curves` | `&curves&mode=frames` |
| --- | --- | --- | --- | --- |
| Find what is under the pointer, along outlines | 0.01 / 0.03 / 0.35 | 0.00 / 0.02 / 0.10 | 0.00 / 0.02 / 0.09 | 0.01 / 0.03 / 0.17 |
| Drop the hub | 87 / 209 / 209 ✗ | 88 / 166 / 166 ✗ | 69 / 101 / 101 ✗ | 65 / 94 / 94 ✗ |
| Resize the hub: let go | 79 / 125 / 125 ✗ | 85 / 122 / 122 ✗ | 72 / 101 / 101 ✗ | 67 / 78 / 78 ✗ |

- **Pointing** meets its mark by far, at every point of 868 along the outlines of 75 shapes.
- **Pictures** stayed within their budget, at about 37 MiB of GPU memory.
- **A theme switch** showed no stale tile, but every run missed A1.
- **Dropping or letting go of the hub** spends most of its time redrawing tiles: 55–82 ms on average, against 6–13 ms for the scene, 1–4 ms for the index and 1–4 ms for the core's command. Redrawing only the tiles the hub's 50 relations cross is where to start if the mark is pursued.

## What it decided

M8b is tagged with these marks missed. The spec lists them as a follow-up:

- dropping and letting go of a shape with 50 relations;
- the theme switch;
- the worst frames of zooming and dragging;
- selecting and panning with names shown.

They are taken up when the user finds the app slow, or on a faster machine.
