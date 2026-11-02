# Third benchmark: the canvas at 10,000 elements, before and after the performance pass

Date: 2026-10-25. Before is `develop` at `ce4970a`; After is the branch of the performance pass (W27), whose commit is tagged `M3:`. This document records what the canvas benchmark and the app benchmark measured, what changed, and which marks are still missed. The decisions it led to are in ADR 0045.

## How it was measured

**The machine.** The reference laptop: a Dell Latitude 3420 with an Intel Core i5-1135G7 (4 cores, 8 threads, 2.4 GHz), Intel Iris Xe Graphics, 32 GB of memory and Windows 10 Pro, its display at 1366 × 768. The app benchmark found frames starting every 17.9–18.0 ms, about 56 Hz, and every 16.7 ms in its last run.

**The browser.** Chrome 155.0.8059.85, in a profile of its own, started with `--disable-background-timer-throttling`, `--disable-renderer-backgrounding` and `--disable-backgrounding-occluded-windows`, maximized, the benchmark's tab brought to the front every 15 seconds and never in the background. The pages were built by `vite build --config vite.bench.config.ts` and served by `vite preview` on 127.0.0.1:47707, as `pnpm bench` does.

**The runs.** Each variant ran once in its own tab: `bench.html` (twice: Default and Default, again), `?overlap=stairs`, `?overlap=grid`, `?overlap=cascade`, `?theme=dark`, `?grid=on`, `?images`, `?tables`, `?tables&images`, and `app-bench.html`. The routes phases are part of the default runs. Frames are timed in work mode, with the GPU's work included through a one-pixel read back (ADR 0014).

**The laptop's state.** The laptop was locked, its display off. On a locked laptop the GPU falls into an idle state after about 60 ms without work and takes about 500 ms to wake, which the first frame after every pause waited for: a window of the same Chrome clears a 16-pixel WebGL canvas every 8 ms to keep it awake, which adds no measurable time to a frame. Its own processes kept the laptop busy throughout: logged every ten seconds from 07:09, its processors were busy 87% of the time on average, of which its antivirus (`avp`) took 41% and its virtual machine (`vmmem`) 22%, before the benchmark's own work. Neither could be stopped from this session. When Chrome restarted, between about 09:05 and 10:04, the window was lost and single frames of 150–500 ms came back in Before and After alike; nothing measured then is in the tables below.

**Quiet, then under load.** Until 10:25 no other builder ran on the laptop: sections 1 and 2 were taken on a quiet machine in that sense, with the antivirus and the virtual machine above as the only other load. From 10:25 six builders of the next wave ran beside the benchmark; what was measured from then on is marked as taken under load, and is read only against a Before measured in the same blocks.

**Pairs.** Because the load varied, Before and After were compared in pairs: both builds served one after the other on the same port, every variant of Before and then every variant of After, within half an hour. The tables of section 2 are one such pair. Section 1 is the first measurement, made before anything changed.

Cells are "average / p95 / worst" for frames and "p50 / p95 / worst" for timed actions, in milliseconds; ✗ marks a miss. The marks: frames average ≤ 10, p95 ≤ 13 and worst ≤ 33.3; a theme switch or a recolor 95% of frames within 16.7 and every frame within 33 (A1, A2); one edit ≤ 50, an edit of a column ≤ 100, a layout ≤ 150, a restack ≤ 100 and a route edit ≤ 50, at the 95th percentile; the grid ≤ 0.5 ms a frame at the median (A3); pictures within 64 MiB.

## 1. Before: the first measurement

Measured from 05:57 to 06:10, before any change, with the keep-alive window; the load was not logged yet.

### The canvas benchmark

| Phase | Default | Default, again | Stairs | Grid | Cascade | Dark | Grid on | Images | Tables | Tables, images |
|---|---|---|---|---|---|---|---|---|---|---|
| Pan, whole view | 2.7 / 3.3 / 3.9 | 2.7 / 3.5 / 3.8 | 3.1 / 3.8 / 11.5 | 1.9 / 2.6 / 3.6 | 4.1 / 5.2 / 11.1 | 2.7 / 3.4 / 4.4 | 3.4 / 4.3 / 8.1 | 3.0 / 4.0 / 4.2 | 1.2 / 1.7 / 2.5 | 1.5 / 2.3 / 3.4 |
| Zoom, whole view | 2.6 / 3.3 / 8.5 | 2.6 / 3.3 / 6.3 | 3.4 / 4.4 / 24.5 | 7.9 / 22.8 / 41.5 ✗ | 3.3 / 5.1 / 5.9 | 2.6 / 3.2 / 10.4 | 3.3 / 4.6 / 7.8 | 2.9 / 3.8 / 7.8 | 1.6 / 2.1 / 2.8 | 1.7 / 2.5 / 3.0 |
| Pan with the grid | 3.1 / 3.9 / 5.0 | 2.8 / 3.3 / 4.0 | 3.3 / 3.8 / 5.3 | 3.3 / 4.1 / 4.9 | 4.0 / 4.9 / 6.0 | 2.8 / 3.2 / 3.8 | – | 3.1 / 3.8 / 4.6 | 1.6 / 2.0 / 2.6 | 1.7 / 2.4 / 2.8 |
| Zoom with the grid | 3.1 / 4.3 / 7.1 | 2.6 / 3.4 / 5.4 | 3.4 / 4.6 / 23.6 | 5.9 / 13.1 / 62.6 ✗ | 3.2 / 5.1 / 6.1 | 2.8 / 3.5 / 4.9 | – | 2.9 / 3.9 / 6.0 | 1.6 / 2.1 / 5.8 | 1.7 / 2.5 / 4.8 |
| Pan with the grid and rulers | 3.3 / 3.9 / 7.9 | 3.1 / 3.7 / 7.0 | 4.1 / 5.3 / 10.9 | 4.1 / 5.2 / 10.1 | 4.7 / 5.8 / 7.4 | 3.2 / 3.6 / 8.0 | – | 3.3 / 4.3 / 7.7 | 2.0 / 2.4 / 2.8 | 2.1 / 3.0 / 3.4 |
| Zoom with the grid and rulers | 3.2 / 4.4 / 7.4 | 3.3 / 4.3 / 10.0 | 3.9 / 5.8 / 16.2 | 5.8 / 10.4 / 55.0 ✗ | 4.1 / 5.7 / 8.2 | 3.2 / 4.5 / 7.0 | – | 3.3 / 4.5 / 5.7 | 2.0 / 2.6 / 6.2 | 2.3 / 3.0 / 5.5 |
| Pan, names shown | 4.4 / 7.4 / 15.6 | 4.5 / 8.0 / 15.1 | 6.3 / 10.8 / 15.3 | 4.8 / 8.4 / 12.1 | 2.1 / 2.7 / 4.6 | 4.3 / 7.6 / 13.9 | 4.9 / 9.2 / 15.7 | 5.4 / 9.5 / 17.3 | 2.2 / 2.9 / 5.2 | 3.5 / 5.2 / 7.5 |
| Pan, names shown, again | 3.4 / 3.9 / 8.3 | 3.6 / 4.4 / 7.0 | 5.0 / 6.0 / 8.6 | 4.1 / 5.2 / 11.0 | 2.2 / 2.6 / 3.5 | 3.5 / 4.1 / 8.0 | 4.2 / 5.2 / 8.2 | 4.3 / 5.5 / 9.3 | 2.1 / 2.6 / 3.0 | 3.4 / 4.6 / 6.3 |
| Zoom across the label threshold | 3.4 / 7.2 / 15.8 | 3.5 / 7.1 / 13.6 | 4.6 / 8.4 / 30.2 | 4.3 / 6.2 / 12.9 | 2.1 / 2.9 / 3.5 | 3.6 / 6.7 / 16.0 | 4.2 / 8.2 / 14.3 | 4.1 / 8.2 / 12.2 | 2.0 / 3.7 / 7.4 | 2.7 / 5.0 / 8.1 |
| Pan, details shown | 3.0 / 3.5 / 4.1 | 3.0 / 3.4 / 3.8 | 3.5 / 4.1 / 4.5 | 7.3 / 11.0 / 17.8 | 1.9 / 2.3 / 2.7 | 3.0 / 3.6 / 4.3 | 3.5 / 4.1 / 7.6 | 3.4 / 4.3 / 5.8 | 2.5 / 6.4 / 7.8 | 3.6 / 9.6 / 12.8 |
| Select by clicking | 3.6 / 4.9 / 5.0 | 3.3 / 3.8 / 4.0 | 4.1 / 5.1 / 5.3 | 3.8 / 4.8 / 5.0 | 4.2 / 5.1 / 5.3 | 3.3 / 3.9 / 3.9 | 3.6 / 4.2 / 4.9 | 3.7 / 4.8 / 5.2 | 1.9 / 2.5 / 2.6 | 2.2 / 2.7 / 3.3 |
| Select everything | 5.4 / 7.5 / 14.2 | 5.6 / 7.7 / 14.3 | 6.0 / 9.6 / 12.9 | 5.5 / 7.6 / 13.7 | 6.1 / 8.0 / 13.9 | 5.5 / 7.6 / 12.5 | 5.8 / 8.8 / 17.2 | 5.5 / 8.7 / 13.7 | 4.3 / 6.0 / 12.2 | 4.5 / 7.9 / 11.1 |
| Zoom, everything selected | 4.0 / 5.2 / 5.8 | 4.0 / 5.4 / 6.5 | 4.8 / 5.9 / 9.8 | 5.5 / 10.0 / 14.9 | 3.8 / 5.6 / 6.6 | 3.9 / 4.8 / 5.4 | 4.7 / 5.9 / 8.5 | 4.3 / 5.4 / 6.0 | 3.6 / 4.4 / 4.9 | 4.0 / 5.1 / 5.4 |
| Switch theme, whole view | 14.9 / 36.0 / 49.2 ✗ | 15.3 / 39.0 / 48.5 ✗ | 15.2 / 45.4 / 81.9 ✗ | 18.7 / 42.6 / 50.5 ✗ | 14.6 / 33.6 / 53.3 ✗ | 14.6 / 41.9 / 50.2 ✗ | 14.8 / 35.2 / 35.7 ✗ | 15.1 / 39.3 / 58.0 ✗ | 15.9 / 23.2 / 23.2 ✗ | 16.6 / 23.7 / 23.7 ✗ |
| Switch theme, shapes in full | 15.0 / 32.1 / 40.6 ✗ | 15.2 / 30.8 / 33.8 ✗ | 16.8 / 33.1 / 35.7 ✗ | 19.9 / 53.4 / 62.8 ✗ | 19.0 / 24.6 / 24.6 ✗ | 14.5 / 27.9 / 27.9 ✗ | 14.6 / 26.6 / 30.0 ✗ | 16.3 / 33.8 / 34.4 ✗ | 13.8 / 22.7 / 22.7 ✗ | 15.1 / 24.5 / 24.5 ✗ |
| Switch theme, names shown | 17.5 / 23.3 / 23.3 ✗ | 21.7 / 28.0 / 28.0 ✗ | 20.1 / 33.4 / 33.4 ✗ | 17.4 / 32.3 / 33.1 ✗ | 16.1 / 19.9 / 19.9 ✗ | 18.1 / 24.9 / 24.9 ✗ | 19.4 / 25.1 / 25.1 ✗ | 17.9 / 23.1 / 23.1 ✗ | 17.6 / 22.1 / 22.1 ✗ | 17.5 / 21.4 / 21.4 ✗ |
| Pan after a switch, names shown | 4.7 / 6.1 / 10.6 | 4.5 / 5.9 / 15.0 | 6.2 / 8.6 / 15.9 | 4.9 / 12.0 / 23.0 | 3.2 / 4.1 / 7.9 | 4.6 / 5.8 / 11.2 | 5.2 / 6.3 / 12.5 | 5.3 / 6.6 / 11.5 | 2.4 / 3.0 / 8.9 | 3.7 / 5.0 / 12.9 |
| Zoom in after a switch, to names shown | 4.0 / 5.3 / 13.0 | 3.8 / 4.6 / 11.5 | 4.9 / 7.1 / 21.8 | 5.3 / 8.5 / 42.5 ✗ | 3.0 / 4.7 / 6.1 | 4.0 / 5.1 / 13.2 | 4.7 / 6.2 / 16.2 | 4.5 / 6.5 / 13.2 | 2.3 / 2.9 / 8.5 | 2.9 / 5.2 / 9.2 |
| Select everything, dark theme | 6.1 / 8.3 / 12.9 | 6.1 / 8.1 / 11.5 | 6.7 / 10.2 / 14.5 | 6.1 / 8.2 / 11.6 | 6.1 / 8.1 / 11.9 | 6.0 / 7.9 / 10.2 | 6.3 / 9.2 / 15.4 | 6.2 / 8.4 / 13.6 | 4.6 / 6.2 / 9.1 | 5.0 / 7.7 / 11.6 |
| Zoom, everything selected, dark theme | 4.5 / 5.8 / 6.2 | 4.4 / 5.6 / 6.1 | 5.3 / 6.8 / 19.9 | 5.4 / 6.9 / 38.6 ✗ | 4.2 / 6.1 / 8.8 | 4.4 / 5.5 / 5.9 | 5.3 / 6.9 / 8.7 | 4.7 / 6.2 / 7.6 | 4.1 / 5.0 / 5.4 | 4.3 / 5.2 / 5.4 |
| Recolor every Service, frames after it | 7.0 / 20.1 / 22.5 ✗ | 7.5 / 22.2 / 25.0 ✗ | 11.0 / 25.5 / 34.9 ✗ | 13.5 / 26.7 / 40.0 ✗ | 3.2 / 17.4 / 22.8 ✗ | 7.1 / 21.1 / 23.2 ✗ | 8.9 / 22.6 / 136.3 ✗ | 8.7 / 22.9 / 26.4 ✗ | – | – |
| Pan, whole view, 1,000 routed lines | 3.7 / 4.5 / 9.8 | 3.7 / 5.0 / 12.0 | 4.2 / 5.5 / 9.3 | – | – | 3.6 / 4.2 / 12.7 | 4.2 / 5.6 / 8.4 | 3.7 / 4.7 / 10.2 | – | – |
| Zoom, whole view, 1,000 routed lines | 3.5 / 4.5 / 7.4 | 3.3 / 4.2 / 5.2 | 4.2 / 5.6 / 29.6 | – | – | 3.5 / 4.3 / 5.5 | 4.0 / 5.0 / 10.0 | 3.5 / 4.5 / 8.8 | – | – |
| Pan, details shown, 1,000 routed lines | 3.2 / 3.9 / 4.3 | 3.2 / 3.8 / 4.4 | 3.8 / 4.7 / 5.3 | – | – | 3.2 / 3.8 / 4.8 | 3.8 / 4.6 / 9.3 | 3.2 / 4.0 / 4.6 | – | – |
| Drag a bend point of a routed line | 3.6 / 4.4 / 18.8 | 3.5 / 4.2 / 26.6 | 4.3 / 5.1 / 24.5 | 7.9 / 14.4 / 206.0 ✗ | 3.2 / 3.6 / 42.8 ✗ | 3.8 / 4.7 / 24.3 | 4.2 / 5.2 / 24.7 | 3.8 / 4.4 / 18.7 | – | – |
| Pan, whole view, 951 routed lines | – | – | – | 3.0 / 3.5 / 4.0 | – | – | – | – | – | – |
| Zoom, whole view, 951 routed lines | – | – | – | 5.4 / 14.0 / 33.9 ✗ | – | – | – | – | – | – |
| Pan, details shown, 951 routed lines | – | – | – | 7.1 / 10.9 / 16.6 | – | – | – | – | – | – |
| Pan, whole view, 986 routed lines | – | – | – | – | 5.4 / 7.1 / 24.7 | – | – | – | – | – |
| Zoom, whole view, 986 routed lines | – | – | – | – | 4.1 / 6.2 / 8.5 | – | – | – | – | – |
| Pan, details shown, 986 routed lines | – | – | – | – | 2.4 / 3.0 / 3.4 | – | – | – | – | – |
| Pan, icons shown, images cold | – | – | – | – | – | – | – | 4.4 / 5.6 / 38.7 ✗ | – | 4.7 / 8.7 / 44.1 ✗ |
| Pan, drawings shown, images cold | – | – | – | – | – | – | – | 4.1 / 5.2 / 38.6 ✗ | – | 2.7 / 3.5 / 4.3 |
| Zoom, images cold | – | – | – | – | – | – | – | 3.5 / 5.6 / 43.7 ✗ | – | 3.0 / 4.9 / 36.7 ✗ |
| Recolor every Column, frames after it | – | – | – | – | – | – | – | – | 3.4 / 10.3 / 15.9 | 3.9 / 10.1 / 17.7 |

| Timed action | Mark (p95) | Default | Default, again | Stairs | Grid | Cascade | Dark | Grid on | Images | Tables | Tables, images |
|---|---|---|---|---|---|---|---|---|---|---|---|
| One edit: a rename or a move | ≤ 50 | 32 / 42 / 42 | 39 / 91 / 91 ✗ | 13 / 25 / 25 | 50 / 68 / 68 ✗ | 28 / 51 / 51 ✗ | 36 / 45 / 45 | 37 / 85 / 85 ✗ | 43 / 51 / 51 ✗ | 20 / 25 / 25 | 21 / 38 / 38 |
| Apply a layout: every shape moves | ≤ 150 | 500 / 540 / 540 ✗ | 434 / 447 / 447 ✗ | 527 / 680 / 680 ✗ | 428 / 734 / 734 ✗ | 619 / 800 / 800 ✗ | 524 / 539 / 539 ✗ | 443 / 469 / 469 ✗ | 567 / 749 / 749 ✗ | 143 / 167 / 167 ✗ | 158 / 183 / 183 ✗ |
| Restack: to the back, then to the front | ≤ 100 | 17 / 33 / 33 | 17 / 39 / 39 | 20 / 38 / 38 | – | – | 16 / 32 / 32 | 20 / 38 / 38 | 24 / 39 / 39 | – | – |
| One route edit: a style or a bend point | ≤ 50 | 19 / 33 / 33 | 21 / 35 / 35 | 21 / 28 / 28 | 93 / 148 / 148 ✗ | 105 / 137 / 137 ✗ | 21 / 33 / 33 | 19 / 34 / 34 | 23 / 30 / 30 | – | – |
| Show the view with routes | none | 566 / 566 / 566 | 537 / 537 / 537 | 524 / 524 / 524 | 457 / 457 / 457 | 671 / 671 / 671 | 634 / 634 / 634 | 558 / 558 / 558 | 624 / 624 / 624 | – | – |
| Edit one column of a large table | ≤ 100 | – | – | – | – | – | – | – | – | 16 / 20 / 20 | 16 / 22 / 22 |

| Other | Default | Default, again | Stairs | Grid | Cascade | Dark | Grid on | Images | Tables | Tables, images |
|---|---|---|---|---|---|---|---|---|---|---|
| Scene built in the page (ms) | 247 | 223 | 282 | 207 | 267 | 232 | 242 | 2735 | 183 | 2680 |
| Grid cost at the median, pan / zoom (ms) | 0.10 / 0.20 | 0.20 / 0.30 | 0.20 / 0.30 | 0.10 / 0.20 | 0.10 / 0.10 | 0.40 / 0.30 | on | 0.10 / 0.30 | 0.20 / 0.50 | 0.20 / 0.30 |
| Selecting, p50 / p95 (ms) | 0.10 / 0.30 | 0.10 / 0.20 | 0.10 / 0.30 | 0.20 / 0.40 | 0.10 / 0.30 | 0.10 / 0.20 | 0.10 / 0.30 | 0.10 / 0.40 | 0.10 / 0.30 | 0.10 / 0.20 |
| Pictures: textures, MiB | – | – | – | – | – | – | – | 50, 16.0 | – | 158, 18.2 |
| Restyles: fallbacks, stale tiles shown | 0, 3480 | 0, 3637 | 0, 7015 | 0, 351 | 0, 2843 | 0, 1837 | 0, 4732 | 0, 3466 | 0, 68 | 0, 31 |
| Restyles: frames until shown | 7 5 5 4 5 4 8 7 6 7 8 6 1 2 1 2 1 2 2 4 2 5 3 3 2 2 | 6 5 4 5 5 5 7 5 5 5 7 6 1 1 1 1 2 1 1 5 2 4 3 3 2 3 | 14 8 7 9 7 7 6 6 7 7 7 8 2 2 2 2 2 2 3 7 2 9 5 3 4 3 | 3 3 4 3 4 4 16 17 15 16 19 16 5 4 5 5 6 6 5 3 5 3 8 8 10 8 | 7 6 6 6 7 6 1 1 1 1 1 1 1 1 1 1 1 1 1 6 1 7 1 1 1 1 | 5 6 6 5 4 4 5 5 6 7 7 6 1 2 1 2 1 2 1 6 3 3 2 2 | 7 5 6 5 5 5 9 6 7 7 6 6 1 2 1 2 1 1 2 4 2 4 2 2 2 3 | 6 5 6 4 5 5 7 6 7 7 7 6 2 2 1 2 1 2 1 5 2 4 3 3 2 3 | 2 1 2 1 2 1 2 3 2 3 2 4 1 1 1 1 1 1 1 1 1 1 2 2 2 1 | 2 1 1 1 2 2 3 3 3 2 3 3 1 1 2 1 1 1 1 1 1 1 2 2 2 2 |

### The app benchmark

| Interaction | Mark | Before |
|---|---|---|
| Select by clicking | p95 ≤ 33.3, worst ≤ 50 | 35.9 / 38.2 / 77.5 (work p95 30.4) ✗ |
| Select everything | worst ≤ 100 | 37.9 / 38.3 / 38.3 (work p95 20.3) |
| Keyboard move | report only | 36.2 / 95.9 / 95.9 (work p95 95.5) |
| One edit: a rename | report only | 43.1 / 55.2 / 55.2 (work p95 54.8) |

| Pan and zoom, frames as shown | Mark | Before |
|---|---|---|
| Pan by dragging, one element selected | avg ≤ 18.1, p95 ≤ 25, worst ≤ 33.3 | 17.9 / 18.1 / 18.2 (work 1.9 / 5.2 / 6.7) |
| Pan with the wheel, one element selected | avg ≤ 18.1, p95 ≤ 25, worst ≤ 33.3 | 18.2 / 18.1 / 71.6 (work 2.5 / 5.3 / 77.1) ✗ |
| Zoom with the wheel, one element selected | avg ≤ 18.1, p95 ≤ 25, worst ≤ 33.3 | 17.9 / 18.1 / 18.3 (work 1.9 / 2.6 / 7.2) |
| Pan by dragging, everything selected | avg ≤ 18.1, p95 ≤ 25, worst ≤ 33.3 | 17.9 / 18.1 / 18.2 (work 2.2 / 2.8 / 3.5) |
| Pan with the wheel, everything selected | avg ≤ 18.1, p95 ≤ 25, worst ≤ 33.3 | 17.8 / 18.1 / 18.2 (work 1.5 / 1.9 / 16.1) |
| Zoom with the wheel, everything selected | avg ≤ 18.1, p95 ≤ 25, worst ≤ 33.3 | 17.9 / 18.1 / 18.2 (work 1.7 / 2.2 / 2.4) |

Before: frames every 17.9 ms, mounted in 446.7 ms.

## 2. After, beside a Before measured in the same pair

Measured from 10:05 to 10:26, every variant of Before (`ce4970a`, 10:05–10:15) and then every variant of After (10:16–10:26), with the keep-alive window, on a quiet machine but for its antivirus and virtual machine: the processors were busy 84% of the time on average, the antivirus taking 37% and the virtual machine 23%. The next wave's builders started at 10:25, during After's tables with images and its app benchmark, which are therefore taken under load.

### Before, in the pair

| Phase | Default | Default, again | Stairs | Grid | Cascade | Dark | Grid on | Images | Tables | Tables, images |
|---|---|---|---|---|---|---|---|---|---|---|
| Pan, whole view | 3.4 / 4.2 / 4.7 | 3.6 / 4.2 / 5.1 | 4.1 / 4.9 / 13.7 | 2.3 / 2.7 / 2.9 | 5.4 / 6.0 / 11.2 | 3.3 / 3.9 / 4.4 | 4.3 / 4.9 / 12.7 | 4.2 / 5.0 / 9.8 | 1.7 / 2.1 / 2.8 | 2.1 / 3.1 / 3.7 |
| Zoom, whole view | 3.2 / 3.9 / 7.2 | 3.3 / 4.0 / 12.4 | 4.2 / 5.0 / 31.1 | 8.5 / 24.0 / 45.3 ✗ | 4.1 / 6.0 / 11.2 | 3.3 / 4.0 / 10.5 | 4.3 / 5.5 / 8.1 | 3.5 / 4.5 / 7.8 | 1.7 / 2.3 / 2.5 | 2.2 / 3.0 / 3.5 |
| Pan with the grid | 3.6 / 4.0 / 6.9 | 3.6 / 4.0 / 4.8 | 4.2 / 5.0 / 5.5 | 3.7 / 4.4 / 4.9 | 5.2 / 6.0 / 6.5 | 3.5 / 4.1 / 8.8 | – | 3.8 / 4.6 / 4.9 | 1.8 / 2.3 / 2.9 | 2.2 / 3.1 / 3.3 |
| Zoom with the grid | 3.4 / 4.5 / 6.6 | 3.5 / 4.4 / 6.4 | 4.6 / 6.0 / 32.8 | 7.2 / 16.0 / 89.3 ✗ | 4.0 / 5.9 / 9.9 | 3.3 / 4.2 / 6.2 | – | 3.7 / 4.9 / 6.8 | 2.1 / 3.0 / 6.6 | 2.6 / 3.6 / 5.9 |
| Pan with the grid and rulers | 3.9 / 4.6 / 9.6 | 4.0 / 4.6 / 8.4 | 5.1 / 5.7 / 10.8 | 4.6 / 5.5 / 9.7 | 5.9 / 6.7 / 11.5 | 4.0 / 4.7 / 10.1 | – | 4.3 / 5.2 / 9.8 | 2.3 / 2.8 / 4.4 | 2.7 / 3.5 / 4.1 |
| Zoom with the grid and rulers | 4.2 / 5.4 / 12.1 | 4.3 / 5.5 / 8.0 | 5.1 / 7.7 / 17.1 | 6.9 / 13.6 / 58.0 ✗ | 4.6 / 6.6 / 10.8 | 3.9 / 5.1 / 10.3 | – | 4.5 / 5.4 / 8.0 | 2.8 / 3.8 / 7.8 | 3.1 / 4.0 / 7.4 |
| Pan, names shown | 6.4 / 12.7 / 20.4 | 6.2 / 12.2 / 21.6 | 8.4 / 15.5 / 23.6 ✗ | 5.9 / 11.5 / 15.2 | 3.1 / 3.7 / 16.3 | 6.1 / 11.8 / 16.1 | 6.6 / 11.8 / 17.3 | 7.2 / 14.2 / 20.5 ✗ | 2.8 / 3.9 / 7.1 | 4.5 / 7.0 / 8.8 |
| Pan, names shown, again | 4.8 / 5.7 / 10.0 | 4.7 / 5.4 / 10.6 | 6.5 / 7.1 / 13.5 | 4.8 / 5.7 / 11.6 | 3.4 / 3.9 / 9.2 | 4.8 / 5.6 / 8.8 | 5.4 / 6.2 / 12.5 | 5.5 / 6.4 / 10.3 | 2.6 / 3.1 / 3.5 | 4.4 / 5.2 / 9.5 |
| Zoom across the label threshold | 4.7 / 9.9 / 19.7 | 4.5 / 9.2 / 18.0 | 6.0 / 12.0 / 39.1 ✗ | 4.7 / 6.4 / 18.3 | 3.5 / 4.7 / 6.3 | 4.5 / 9.7 / 15.9 | 5.3 / 10.6 / 16.3 | 5.5 / 11.6 / 15.8 | 2.6 / 4.4 / 12.7 | 3.7 / 7.3 / 12.8 |
| Pan, details shown | 3.8 / 4.5 / 5.0 | 3.6 / 4.2 / 4.5 | 4.4 / 5.2 / 5.6 | 9.6 / 15.9 / 29.7 ✗ | 2.6 / 3.1 / 3.6 | 3.6 / 4.1 / 4.4 | 4.7 / 5.4 / 10.6 | 4.6 / 5.5 / 8.8 | 3.3 / 8.8 / 11.9 | 5.0 / 13.6 / 15.4 ✗ |
| Select by clicking | 4.2 / 4.9 / 6.1 | 4.4 / 5.5 / 6.6 | 4.9 / 5.8 / 6.4 | 4.4 / 5.2 / 6.1 | 5.6 / 6.1 / 7.1 | 4.3 / 5.0 / 6.3 | 4.7 / 5.6 / 6.2 | 5.0 / 5.9 / 6.0 | 2.0 / 2.4 / 2.7 | 2.6 / 3.3 / 4.4 |
| Select everything | 7.2 / 10.5 / 19.9 | 7.1 / 9.6 / 17.7 | 7.6 / 10.9 / 15.8 | 6.6 / 9.6 / 15.7 | 8.0 / 10.4 / 17.6 | 6.8 / 9.8 / 17.3 | 7.3 / 11.3 / 23.7 | 7.4 / 11.4 / 43.2 ✗ | 5.4 / 8.2 / 15.8 | 5.7 / 10.8 / 16.1 |
| Zoom, everything selected | 5.0 / 6.0 / 6.7 | 4.9 / 6.0 / 6.5 | 6.0 / 7.2 / 14.0 | 6.5 / 14.1 / 19.4 ✗ | 4.9 / 6.9 / 7.8 | 4.7 / 5.8 / 6.7 | 5.9 / 7.4 / 10.9 | 5.3 / 6.3 / 6.9 | 4.0 / 4.9 / 5.2 | 4.6 / 5.5 / 6.1 |
| Switch theme, whole view | 15.2 / 43.8 / 97.7 ✗ | 15.1 / 42.4 / 85.7 ✗ | 15.0 / 48.2 / 97.5 ✗ | 18.9 / 49.1 / 81.5 ✗ | 15.7 / 36.4 / 90.9 ✗ | 14.5 / 41.2 / 84.3 ✗ | 14.5 / 42.4 / 46.4 ✗ | 14.7 / 40.0 / 75.7 ✗ | 15.9 / 30.4 / 30.4 ✗ | 16.3 / 27.0 / 27.0 ✗ |
| Switch theme, shapes in full | 14.9 / 30.7 / 33.1 ✗ | 15.5 / 31.4 / 35.0 ✗ | 17.3 / 37.8 / 44.7 ✗ | 21.6 / 38.1 / 83.3 ✗ | 17.5 / 19.8 / 19.8 ✗ | 14.7 / 30.6 / 36.1 ✗ | 15.0 / 30.4 / 35.2 ✗ | 17.6 / 34.9 / 36.7 ✗ | 14.1 / 26.2 / 29.0 ✗ | 15.7 / 29.9 / 31.4 ✗ |
| Switch theme, names shown | 18.1 / 26.9 / 26.9 ✗ | 16.2 / 27.3 / 27.3 ✗ | 19.5 / 40.4 / 40.4 ✗ | 19.2 / 42.5 / 43.8 ✗ | 17.8 / 19.3 / 19.3 ✗ | 17.1 / 25.0 / 25.0 ✗ | 17.8 / 26.6 / 26.6 ✗ | 17.8 / 28.1 / 28.1 ✗ | 14.3 / 20.6 / 20.6 ✗ | 16.2 / 22.6 / 22.6 ✗ |
| Pan after a switch, names shown | 6.4 / 9.1 / 16.1 | 6.6 / 8.4 / 16.1 | 8.4 / 11.5 / 18.3 | 6.0 / 14.6 / 23.3 ✗ | 4.8 / 5.6 / 11.1 | 6.3 / 8.3 / 15.4 | 6.9 / 9.3 / 14.6 | 7.4 / 10.3 / 14.7 | 3.5 / 4.1 / 11.7 | 5.0 / 6.3 / 11.4 |
| Zoom in after a switch, to names shown | 5.0 / 6.1 / 17.0 | 5.1 / 6.1 / 21.2 | 6.4 / 8.8 / 26.1 | 6.4 / 10.8 / 53.3 ✗ | 4.2 / 6.1 / 8.2 | 5.1 / 6.2 / 22.9 | 5.8 / 7.0 / 21.3 | 5.8 / 9.2 / 23.8 | 3.2 / 4.1 / 11.6 | 3.8 / 6.5 / 11.1 |
| Select everything, dark theme | 7.9 / 11.4 / 16.2 | 7.8 / 10.4 / 14.9 | 8.3 / 10.5 / 25.9 | 7.8 / 11.7 / 32.6 | 8.3 / 11.3 / 25.5 | 7.7 / 10.4 / 13.3 | 7.9 / 12.8 / 16.9 | 7.9 / 10.6 / 14.2 | 6.3 / 9.1 / 13.2 | 6.3 / 10.4 / 14.4 |
| Zoom, everything selected, dark theme | 5.6 / 7.2 / 8.1 | 5.5 / 6.8 / 7.4 | 6.4 / 8.2 / 25.9 | 6.9 / 8.7 / 54.6 ✗ | 5.3 / 7.5 / 8.1 | 5.5 / 7.0 / 7.4 | 6.5 / 8.1 / 10.0 | 5.9 / 7.8 / 8.9 | 4.6 / 5.6 / 6.2 | 5.1 / 5.9 / 6.7 |
| Recolor every Service, frames after it | 10.2 / 24.5 / 29.9 ✗ | 10.1 / 23.9 / 50.5 ✗ | 14.4 / 28.3 / 43.8 ✗ | 18.6 / 34.0 / 50.1 ✗ | 5.5 / 20.7 / 27.4 ✗ | 10.2 / 23.8 / 27.7 ✗ | 10.0 / 23.2 / 29.5 ✗ | 12.8 / 26.5 / 28.2 ✗ | – | – |
| Pan, whole view, 1,000 routed lines | 4.9 / 5.9 / 13.4 | 4.7 / 5.6 / 15.6 | 5.5 / 6.2 / 11.0 | – | – | 4.6 / 5.4 / 13.4 | 5.1 / 6.3 / 11.9 | 4.7 / 5.8 / 14.6 | – | – |
| Zoom, whole view, 1,000 routed lines | 4.4 / 5.4 / 6.1 | 4.1 / 5.1 / 5.8 | 5.9 / 6.6 / 40.1 ✗ | – | – | 4.1 / 5.2 / 5.6 | 5.2 / 6.3 / 12.2 | 4.3 / 5.4 / 5.8 | – | – |
| Pan, details shown, 1,000 routed lines | 4.0 / 4.9 / 5.7 | 4.0 / 4.8 / 5.9 | 5.0 / 5.7 / 6.5 | – | – | 4.0 / 4.5 / 5.4 | 4.8 / 5.7 / 11.8 | 4.0 / 4.8 / 5.3 | – | – |
| Drag a bend point of a routed line | 4.8 / 5.5 / 31.8 | 4.7 / 5.4 / 33.4 ✗ | 5.4 / 5.9 / 42.6 ✗ | 7.0 / 13.1 / 110.1 ✗ | 4.5 / 4.8 / 68.5 ✗ | 4.7 / 5.4 / 32.0 | 4.8 / 5.3 / 31.9 | 4.7 / 5.4 / 30.1 | – | – |
| Pan, whole view, 951 routed lines | – | – | – | 3.1 / 3.8 / 4.8 | – | – | – | – | – | – |
| Zoom, whole view, 951 routed lines | – | – | – | 6.4 / 16.1 / 47.3 ✗ | – | – | – | – | – | – |
| Pan, details shown, 951 routed lines | – | – | – | 9.1 / 14.1 / 19.1 ✗ | – | – | – | – | – | – |
| Pan, whole view, 986 routed lines | – | – | – | – | 7.2 / 8.3 / 37.1 ✗ | – | – | – | – | – |
| Zoom, whole view, 986 routed lines | – | – | – | – | 5.1 / 7.1 / 8.0 | – | – | – | – | – |
| Pan, details shown, 986 routed lines | – | – | – | – | 3.1 / 3.7 / 4.1 | – | – | – | – | – |
| Pan, icons shown, images cold | – | – | – | – | – | – | – | 5.9 / 7.1 / 58.5 ✗ | – | 6.7 / 13.4 / 61.3 ✗ |
| Pan, drawings shown, images cold | – | – | – | – | – | – | – | 5.5 / 6.7 / 58.7 ✗ | – | 3.5 / 4.3 / 5.3 |
| Zoom, images cold | – | – | – | – | – | – | – | 5.0 / 7.2 / 50.4 ✗ | – | 4.1 / 7.2 / 57.1 ✗ |
| Recolor every Column, frames after it | – | – | – | – | – | – | – | – | 5.4 / 11.7 / 17.5 | 5.8 / 12.9 / 18.8 |

| Timed action | Mark (p95) | Default | Default, again | Stairs | Grid | Cascade | Dark | Grid on | Images | Tables | Tables, images |
|---|---|---|---|---|---|---|---|---|---|---|---|
| One edit: a rename or a move | ≤ 50 | 50 / 67 / 67 ✗ | 44 / 66 / 66 ✗ | 23 / 34 / 34 | 78 / 104 / 104 ✗ | 54 / 78 / 78 ✗ | 50 / 75 / 75 ✗ | 52 / 140 / 140 ✗ | 63 / 86 / 86 ✗ | 29 / 36 / 36 | 34 / 40 / 40 |
| Apply a layout: every shape moves | ≤ 150 | 697 / 864 / 864 ✗ | 669 / 691 / 691 ✗ | 743 / 817 / 817 ✗ | 613 / 1015 / 1015 ✗ | 1080 / 1358 / 1358 ✗ | 800 / 1063 / 1063 ✗ | 661 / 703 / 703 ✗ | 669 / 734 / 734 ✗ | 233 / 251 / 251 ✗ | 243 / 260 / 260 ✗ |
| Restack: to the back, then to the front | ≤ 100 | 30 / 51 / 51 | 28 / 53 / 53 | 37 / 67 / 67 | – | – | 29 / 45 / 45 | 30 / 49 / 49 | 37 / 48 / 48 | – | – |
| One route edit: a style or a bend point | ≤ 50 | 29 / 40 / 40 | 30 / 42 / 42 | 30 / 42 / 42 | 136 / 154 / 154 ✗ | 164 / 209 / 209 ✗ | 27 / 42 / 42 | 28 / 50 / 50 ✗ | 30 / 40 / 40 | – | – |
| Show the view with routes | none | 823 / 823 / 823 | 1002 / 1002 / 1002 | 859 / 859 / 859 | 600 / 600 / 600 | 985 / 985 / 985 | 901 / 901 / 901 | 869 / 869 / 869 | 1060 / 1060 / 1060 | – | – |
| Edit one column of a large table | ≤ 100 | – | – | – | – | – | – | – | – | 24 / 27 / 27 | 24 / 34 / 34 |

| Other | Default | Default, again | Stairs | Grid | Cascade | Dark | Grid on | Images | Tables | Tables, images |
|---|---|---|---|---|---|---|---|---|---|---|
| Scene built in the page (ms) | 361 | 350 | 387 | 302 | 359 | 345 | 344 | 4194 | 242 | 3956 |
| Grid cost at the median, pan / zoom (ms) | 0.40 / 0.40 | 0.50 / 0.50 | -0.00 / 0.20 | 0.20 / 0.20 | 0.10 / 0.30 | 0.20 / 0.20 | on | 0.30 / 0.50 | 0.30 / 0.40 | 0.20 / 0.30 |
| Selecting, p50 / p95 (ms) | 0.10 / 0.40 | 0.20 / 0.60 | 0.20 / 0.40 | 0.20 / 0.50 | 0.10 / 0.50 | 0.20 / 0.40 | 0.20 / 0.50 | 0.20 / 0.60 | 0.10 / 0.20 | 0.10 / 0.40 |
| Pictures: textures, MiB | – | – | – | – | – | – | – | 50, 16.0 | – | 158, 18.2 |
| Restyles: fallbacks, stale tiles shown | 0, 6051 | 0, 5643 | 0, 14084 | 0, 568 | 0, 4972 | 0, 2483 | 0, 6034 | 0, 6238 | 0, 251 | 0, 156 |
| Restyles: frames until shown | 11 9 8 8 10 8 11 9 10 9 9 8 2 2 3 2 2 2 2 9 2 10 5 3 4 3 | 10 8 10 9 9 6 11 10 9 9 11 9 2 2 3 2 2 3 3 10 3 8 5 4 4 3 | 16 14 14 12 11 11 11 12 13 11 10 9 3 3 4 3 3 3 2 12 3 16 7 6 6 7 | 7 5 6 4 5 4 21 21 21 20 20 20 6 6 6 6 9 7 7 4 8 6 14 15 15 12 | 15 10 11 9 11 7 1 1 1 1 2 1 1 1 1 1 1 1 1 7 1 10 1 1 1 1 | 11 9 7 10 9 11 10 8 11 9 10 8 2 2 2 2 2 2 2 8 4 5 3 4 | 10 8 9 10 10 8 10 8 10 10 11 9 2 3 2 3 2 2 2 8 3 9 5 3 4 3 | 11 9 10 9 10 9 11 10 10 9 9 9 2 3 3 2 3 2 2 10 3 9 4 5 4 4 | 3 2 2 2 2 1 5 6 5 4 4 4 2 1 2 2 2 1 1 2 2 1 4 3 3 3 | 2 2 2 1 2 2 5 5 5 5 5 4 2 1 2 1 2 2 1 2 1 1 3 3 3 3 |

### After, in the pair

| Phase | Default | Default, again | Stairs | Grid | Cascade | Dark | Grid on | Images | Tables | Tables, images |
|---|---|---|---|---|---|---|---|---|---|---|
| Pan, whole view | 3.4 / 4.0 / 12.5 | 3.4 / 4.1 / 5.0 | 4.1 / 4.6 / 13.8 | 2.3 / 2.8 / 3.2 | 5.4 / 6.5 / 10.9 | 4.1 / 3.8 / 149.7 ✗ | 4.6 / 6.2 / 13.0 | 4.2 / 5.4 / 16.1 | 2.0 / 2.5 / 3.3 | 2.4 / 3.4 / 3.8 |
| Zoom, whole view | 3.1 / 3.8 / 4.6 | 3.1 / 4.1 / 4.5 | 3.9 / 4.9 / 25.1 | 7.7 / 20.1 / 31.4 ✗ | 3.9 / 5.6 / 7.7 | 3.1 / 3.9 / 4.4 | 4.5 / 5.9 / 12.7 | 3.5 / 4.5 / 5.8 | 2.2 / 2.7 / 8.6 | 2.5 / 3.5 / 4.1 |
| Pan with the grid | 3.4 / 3.9 / 4.8 | 3.5 / 4.2 / 9.1 | 4.0 / 4.6 / 5.4 | 2.5 / 2.8 / 3.3 | 5.3 / 6.0 / 6.5 | 3.4 / 3.8 / 4.5 | – | 3.9 / 4.9 / 5.8 | 2.3 / 2.9 / 6.3 | 2.5 / 3.5 / 8.1 |
| Zoom with the grid | 3.4 / 4.4 / 6.5 | 3.6 / 4.6 / 6.7 | 4.4 / 5.6 / 20.8 | 6.8 / 15.4 / 29.3 ✗ | 4.2 / 6.5 / 9.3 | 3.2 / 4.2 / 6.2 | – | 3.9 / 5.3 / 8.7 | 2.7 / 3.8 / 7.8 | 2.7 / 3.8 / 6.6 |
| Pan with the grid and rulers | 3.9 / 4.5 / 10.3 | 3.8 / 4.3 / 8.5 | 5.0 / 5.8 / 11.7 | 3.2 / 3.7 / 8.9 | 5.8 / 6.4 / 10.8 | 3.8 / 4.5 / 10.5 | – | 4.2 / 5.0 / 11.0 | 2.5 / 3.1 / 3.4 | 2.9 / 3.8 / 4.4 |
| Zoom with the grid and rulers | 4.3 / 5.3 / 9.3 | 4.0 / 4.9 / 10.4 | 4.9 / 6.7 / 14.8 | 6.9 / 16.4 / 29.6 ✗ | 4.7 / 6.8 / 10.6 | 4.1 / 5.2 / 13.1 | – | 4.5 / 5.7 / 13.3 | 2.9 / 3.8 / 12.5 | 3.2 / 4.6 / 9.2 |
| Pan, names shown | 6.0 / 12.6 / 17.8 | 5.9 / 13.4 / 22.1 ✗ | 8.7 / 16.4 / 21.8 ✗ | 6.4 / 11.1 / 14.0 | 3.0 / 3.6 / 6.0 | 6.2 / 14.0 / 22.7 ✗ | 10.3 / 21.9 / 166.3 ✗ | 7.7 / 17.1 / 25.6 ✗ | 3.2 / 4.8 / 9.8 | 5.5 / 9.1 / 13.6 |
| Pan, names shown, again | 4.7 / 5.5 / 9.1 | 4.7 / 5.4 / 11.8 | 6.9 / 7.5 / 13.0 | 5.7 / 6.9 / 7.5 | 3.0 / 3.5 / 5.4 | 4.7 / 5.6 / 9.8 | 7.4 / 10.9 / 145.4 ✗ | 5.9 / 6.8 / 11.8 | 2.9 / 3.5 / 4.2 | 5.8 / 7.6 / 24.5 |
| Zoom across the label threshold | 4.0 / 8.6 / 12.3 | 4.2 / 9.3 / 13.1 | 5.6 / 12.0 / 27.2 | 4.7 / 8.5 / 25.3 | 2.9 / 4.2 / 5.9 | 4.1 / 8.5 / 12.3 | 7.6 / 16.2 / 24.1 ✗ | 5.4 / 11.7 / 13.8 | 2.8 / 5.8 / 11.8 | 5.1 / 13.2 / 43.8 ✗ |
| Pan, details shown | 3.7 / 4.3 / 5.4 | 3.6 / 4.0 / 4.3 | 4.8 / 6.0 / 6.5 | 9.3 / 12.8 / 24.9 | 2.8 / 3.2 / 3.6 | 3.7 / 4.2 / 5.0 | 6.4 / 12.7 / 37.2 ✗ | 4.8 / 6.2 / 9.3 | 3.6 / 9.0 / 14.6 | 5.9 / 14.7 / 24.9 ✗ |
| Select by clicking | 3.4 / 4.5 / 5.0 | 3.6 / 4.4 / 4.8 | 4.1 / 5.1 / 8.0 | 2.9 / 3.9 / 4.5 | 5.6 / 6.5 / 6.9 | 3.4 / 3.9 / 4.2 | 4.7 / 6.1 / 10.3 | 4.0 / 5.0 / 5.2 | 2.0 / 2.6 / 3.1 | 2.8 / 3.8 / 4.7 |
| Select everything | 6.6 / 9.5 / 16.3 | 6.4 / 9.6 / 18.6 | 6.9 / 10.7 / 15.9 | 5.5 / 10.6 / 19.4 | 7.6 / 10.7 / 20.5 | 6.3 / 8.8 / 17.6 | 8.0 / 16.9 / 79.7 ✗ | 6.6 / 10.8 / 19.7 | 5.1 / 7.8 / 15.6 | 6.7 / 13.3 / 25.9 ✗ |
| Zoom, everything selected | 4.3 / 5.5 / 6.1 | 4.1 / 5.3 / 5.8 | 5.1 / 6.5 / 17.5 | 6.7 / 16.9 / 22.6 ✗ | 4.5 / 6.7 / 7.2 | 4.2 / 5.5 / 6.2 | 6.0 / 8.6 / 44.2 ✗ | 4.7 / 6.0 / 6.4 | 3.9 / 4.5 / 5.6 | 5.0 / 6.9 / 10.6 |
| Switch theme, whole view | 13.4 / 24.8 / 35.2 ✗ | 13.3 / 25.1 / 26.5 ✗ | 14.9 / 38.5 / 44.2 ✗ | 11.3 / 19.4 / 28.1 ✗ | 15.5 / 29.7 / 45.7 ✗ | 13.0 / 24.3 / 25.6 ✗ | 16.7 / 35.1 / 108.5 ✗ | 13.4 / 23.2 / 27.7 ✗ | 8.6 / 12.6 / 13.4 | 9.2 / 14.8 / 16.7 |
| Switch theme, shapes in full | 12.0 / 23.9 / 30.0 ✗ | 11.9 / 22.5 / 29.3 ✗ | 15.1 / 29.2 / 56.1 ✗ | 16.6 / 23.1 / 59.5 ✗ | 8.6 / 14.7 / 14.7 | 11.8 / 23.0 / 29.4 ✗ | 16.3 / 30.5 / 55.6 ✗ | 14.0 / 19.6 / 30.5 ✗ | 11.3 / 23.5 / 25.7 ✗ | 10.8 / 16.0 / 26.9 |
| Switch theme, names shown | 11.7 / 20.1 / 20.9 ✗ | 11.6 / 16.5 / 18.9 | 17.0 / 33.5 / 35.3 ✗ | 14.9 / 29.5 / 43.7 ✗ | 7.5 / 10.1 / 10.1 | 11.5 / 15.3 / 21.2 | 14.6 / 26.4 / 48.5 ✗ | 12.5 / 17.9 / 24.5 ✗ | 7.7 / 12.4 / 12.4 | 9.3 / 11.3 / 13.4 |
| Pan after a switch, names shown | 6.3 / 9.3 / 17.1 | 6.2 / 8.4 / 15.5 | 9.3 / 12.8 / 21.5 | 7.5 / 12.8 / 20.8 | 4.8 / 5.7 / 7.6 | 6.3 / 9.2 / 16.5 | 8.1 / 13.9 / 19.8 ✗ | 7.9 / 10.6 / 16.2 | 4.2 / 5.8 / 12.0 | 6.1 / 7.7 / 10.3 |
| Zoom in after a switch, to names shown | 4.2 / 6.2 / 22.3 | 4.2 / 6.6 / 21.5 | 5.7 / 9.7 / 29.8 | 6.7 / 17.5 / 47.8 ✗ | 3.9 / 5.7 / 10.7 | 4.1 / 6.6 / 19.9 | 8.5 / 16.4 / 57.2 ✗ | 5.0 / 8.6 / 20.9 | 3.1 / 5.7 / 34.8 ✗ | 3.6 / 6.7 / 13.0 |
| Select everything, dark theme | 7.1 / 9.0 / 12.8 | 7.1 / 8.9 / 14.4 | 8.1 / 11.2 / 15.6 | 5.2 / 7.6 / 11.8 | 8.7 / 11.2 / 17.3 | 6.6 / 10.5 / 13.4 | 7.8 / 13.5 / 34.8 ✗ | 7.6 / 11.3 / 16.1 | 5.4 / 8.1 / 10.4 | 5.9 / 10.1 / 18.2 |
| Zoom, everything selected, dark theme | 5.1 / 6.4 / 7.6 | 5.2 / 6.4 / 9.5 | 6.1 / 8.1 / 34.6 ✗ | 7.2 / 16.2 / 90.1 ✗ | 5.6 / 7.9 / 9.6 | 4.3 / 5.4 / 5.9 | 6.3 / 7.9 / 10.8 | 5.8 / 7.3 / 12.7 | 3.9 / 4.8 / 5.9 | 4.8 / 5.8 / 8.2 |
| Recolor every Service, frames after it | 8.4 / 13.6 / 18.1 | 8.1 / 14.0 / 17.1 | 12.6 / 18.0 / 21.8 ✗ | 15.8 / 19.1 / 36.5 ✗ | 3.1 / 3.6 / 4.0 | 8.2 / 14.6 / 16.0 | 8.7 / 14.7 / 17.0 | 10.0 / 16.7 / 21.1 ✗ | – | – |
| Pan, whole view, 1,000 routed lines | 4.4 / 5.4 / 14.6 | 4.2 / 5.0 / 17.7 | 4.9 / 5.7 / 16.4 | – | – | 6.9 / 6.7 / 309.1 ✗ | 4.9 / 5.9 / 17.0 | 4.6 / 5.5 / 18.2 | – | – |
| Zoom, whole view, 1,000 routed lines | 3.9 / 4.6 / 5.2 | 3.6 / 4.4 / 4.8 | 4.8 / 5.8 / 28.6 | – | – | 4.4 / 5.5 / 11.9 | 4.9 / 6.2 / 13.7 | 4.2 / 5.4 / 7.0 | – | – |
| Pan, details shown, 1,000 routed lines | 3.9 / 4.6 / 5.3 | 3.9 / 4.5 / 5.2 | 5.1 / 6.0 / 8.7 | – | – | 5.0 / 5.2 / 96.4 ✗ | 4.9 / 5.6 / 13.3 | 4.3 / 5.0 / 5.2 | – | – |
| Drag a bend point of a routed line | 4.6 / 5.1 / 34.0 ✗ | 4.6 / 5.4 / 34.0 ✗ | 5.6 / 5.9 / 37.9 ✗ | 7.0 / 13.6 / 84.6 ✗ | 4.5 / 4.8 / 75.1 ✗ | 5.5 / 6.5 / 34.2 ✗ | 5.1 / 5.8 / 32.1 | 5.1 / 5.8 / 36.3 ✗ | – | – |
| Pan, whole view, 951 routed lines | – | – | – | 2.6 / 2.9 / 4.0 | – | – | – | – | – | – |
| Zoom, whole view, 951 routed lines | – | – | – | 6.1 / 17.0 / 25.9 ✗ | – | – | – | – | – | – |
| Pan, details shown, 951 routed lines | – | – | – | 8.9 / 12.0 / 20.3 | – | – | – | – | – | – |
| Pan, whole view, 986 routed lines | – | – | – | – | 9.2 / 11.1 / 36.6 ✗ | – | – | – | – | – |
| Zoom, whole view, 986 routed lines | – | – | – | – | 6.6 / 9.9 / 10.9 | – | – | – | – | – |
| Pan, details shown, 986 routed lines | – | – | – | – | 3.0 / 3.6 / 4.1 | – | – | – | – | – |
| Pan, icons shown, images cold | – | – | – | – | – | – | – | 7.5 / 8.6 / 53.0 ✗ | – | 9.4 / 18.3 / 78.6 ✗ |
| Pan, drawings shown, images cold | – | – | – | – | – | – | – | 7.9 / 9.3 / 57.5 ✗ | – | 5.8 / 7.9 / 24.7 |
| Zoom, images cold | – | – | – | – | – | – | – | 6.1 / 7.9 / 49.2 ✗ | – | 6.0 / 9.6 / 81.0 ✗ |
| Recolor every Column, frames after it | – | – | – | – | – | – | – | – | 6.1 / 11.0 / 14.0 | 7.8 / 13.0 / 15.3 |

| Timed action | Mark (p95) | Default | Default, again | Stairs | Grid | Cascade | Dark | Grid on | Images | Tables | Tables, images |
|---|---|---|---|---|---|---|---|---|---|---|---|
| One edit: a rename or a move | ≤ 50 | 50 / 68 / 68 ✗ | 57 / 67 / 67 ✗ | 24 / 32 / 32 | 63 / 550 / 550 ✗ | 19 / 29 / 29 | 44 / 67 / 67 ✗ | 48 / 63 / 63 ✗ | 61 / 76 / 76 ✗ | 25 / 38 / 38 | 49 / 99 / 99 ✗ |
| Apply a layout: every shape moves | ≤ 150 | 302 / 308 / 308 ✗ | 292 / 315 / 315 ✗ | 315 / 351 / 351 ✗ | 303 / 397 / 397 ✗ | 198 / 207 / 207 ✗ | 271 / 305 / 305 ✗ | 275 / 318 / 318 ✗ | 298 / 314 / 314 ✗ | 148 / 161 / 161 ✗ | 232 / 245 / 245 ✗ |
| Restack: to the back, then to the front | ≤ 100 | 21 / 115 / 115 ✗ | 23 / 548 / 548 ✗ | 27 / 49 / 49 | – | – | 22 / 36 / 36 | 22 / 39 / 39 | 24 / 376 / 376 ✗ | – | – |
| Export the whole view at 1× | none | 1 / 1 / 1 | 2 / 2 / 2 | 1 / 1 / 1 | 7647 / 7647 / 7647 | 1 / 1 / 1 | 1 / 1 / 1 | 1 / 1 / 1 | 1 / 1 / 1 | 1 / 1 / 1 | 1 / 1 / 1 |
| Export what is visible at 2×, names shown | none | 171 / 171 / 171 | 150 / 150 / 150 | 163 / 163 / 163 | 112 / 112 / 112 | 128 / 128 / 128 | 151 / 151 / 151 | 144 / 144 / 144 | 172 / 172 / 172 | 230 / 230 / 230 | 289 / 289 / 289 |
| Export what is visible at 2×, whole view | none | 135 / 135 / 135 | 145 / 145 / 145 | 143 / 143 / 143 | 65 / 65 / 65 | 273 / 273 / 273 | 141 / 141 / 141 | 485 / 485 / 485 | 132 / 132 / 132 | 69 / 69 / 69 | 95 / 95 / 95 |
| One route edit: a style or a bend point | ≤ 50 | 27 / 38 / 38 | 29 / 40 / 40 | 32 / 48 / 48 | 102 / 306 / 306 ✗ | 189 / 218 / 218 ✗ | 33 / 125 / 125 ✗ | 31 / 42 / 42 | 29 / 35 / 35 | – | – |
| Show the view with routes | none | 478 / 478 / 478 | 492 / 492 / 492 | 499 / 499 / 499 | 635 / 635 / 635 | 388 / 388 / 388 | 482 / 482 / 482 | 572 / 572 / 572 | 554 / 554 / 554 | – | – |
| Edit one column of a large table | ≤ 100 | – | – | – | – | – | – | – | – | 21 / 30 / 30 | 36 / 38 / 38 |

| Other | Default | Default, again | Stairs | Grid | Cascade | Dark | Grid on | Images | Tables | Tables, images |
|---|---|---|---|---|---|---|---|---|---|---|
| Scene built in the page (ms) | 359 | 355 | 345 | 300 | 356 | 356 | 499 | 4249 | 273 | 4347 |
| Grid cost at the median, pan / zoom (ms) | 0.20 / 0.30 | 0.10 / 0.30 | 0.20 / 0.20 | 0.10 / 0.20 | 0.00 / 0.20 | 0.20 / 0.30 | on | 0.20 / 0.40 | 0.30 / 0.40 | 0.20 / 0.50 |
| Selecting, p50 / p95 (ms) | 0.20 / 0.50 | 0.20 / 0.60 | 0.20 / 0.40 | 0.20 / 0.50 | 0.20 / 0.60 | 0.20 / 0.40 | 0.30 / 0.50 | 0.20 / 0.50 | 0.10 / 0.40 | 0.20 / 0.40 |
| Pictures: textures, MiB | – | – | – | – | – | – | – | 50, 16.0 | – | 143, 18.2 |
| Restyles: fallbacks, stale tiles shown | 0, 0 | 0, 0 | 0, 0 | 0, 0 | 0, 0 | 0, 0 | 0, 0 | 0, 0 | 0, 0 | 0, 0 |
| Restyles: frames until shown | 14 12 12 9 11 11 19 13 15 13 16 14 5 4 5 4 4 3 3 9 3 9 7 6 5 5 | 14 11 12 11 10 10 23 14 12 14 13 13 4 4 4 4 4 4 4 8 4 9 5 5 5 4 | 21 17 16 12 12 13 27 22 22 17 21 17 8 5 6 6 6 5 5 13 6 15 9 8 8 6 | 10 8 8 8 8 7 52 40 48 43 47 43 12 11 12 12 11 10 10 6 14 6 24 1 1 1 1 23 1 1 1 1 1 25 1 1 1 1 1 1 1 25 1 1 1 1 1 1 1 1 | 14 13 14 12 13 11 3 3 2 3 2 2 2 2 2 2 2 3 2 10 2 12 | 13 12 12 11 9 10 18 14 16 12 14 14 5 3 3 4 3 4 3 9 7 6 6 6 | 31 12 14 21 12 14 27 16 17 18 15 15 7 7 5 4 5 4 7 1 8 10 7 5 6 5 | 14 11 11 10 10 10 24 14 16 11 13 13 5 4 4 5 3 3 5 9 8 9 5 5 4 5 | 5 3 4 3 3 3 8 6 6 7 8 7 3 3 3 3 3 2 3 3 3 3 4 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 4 1 1 1 1 1 1 1 1 1 1 1 1 1 1 3 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 3 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 | 6 4 4 7 6 4 12 8 15 8 9 7 3 3 4 3 3 5 3 3 3 4 5 1 1 1 1 1 1 1 1 1 1 1 4 1 1 1 1 1 1 1 1 1 1 1 1 4 1 1 1 1 1 1 1 1 1 1 1 4 1 1 1 1 1 1 1 1 1 1 1 1 |

### The app benchmark, in the pair

| Interaction | Mark | Before | After |
|---|---|---|---|
| Select by clicking | p95 ≤ 33.3, worst ≤ 50 | 35.9 / 59.9 / 125.6 (work p95 46.9) ✗ | 33.8 / 82.2 / 152.7 (work p95 55.2) ✗ |
| Select everything | worst ≤ 100 | 40.0 / 57.7 / 57.7 (work p95 40.0) | 36.9 / 57.8 / 57.8 (work p95 53.5) |
| Keyboard move | report only | 60.8 / 128.2 / 128.2 (work p95 127.7) | 66.4 / 119.0 / 119.0 (work p95 116.4) |
| One edit: a rename | report only | 71.9 / 106.0 / 106.0 (work p95 96.3) | 84.0 / 118.3 / 118.3 (work p95 117.5) |

| Pan and zoom, frames as shown | Mark | Before | After |
|---|---|---|---|
| Pan by dragging, one element selected | avg ≤ 18.1, p95 ≤ 25, worst ≤ 33.3 | 18.1 / 18.2 / 25.5 (work 2.8 / 7.7 / 10.4) | 16.7 / 16.8 / 16.8 (work 3.8 / 10.8 / 17.4) |
| Pan with the wheel, one element selected | avg ≤ 18.1, p95 ≤ 25, worst ≤ 33.3 | 18.0 / 18.2 / 23.3 (work 2.5 / 7.3 / 9.5) | 16.9 / 16.8 / 66.8 (work 3.9 / 11.4 / 73.9) ✗ |
| Zoom with the wheel, one element selected | avg ≤ 18.1, p95 ≤ 25, worst ≤ 33.3 | 18.0 / 18.2 / 26.0 (work 3.2 / 5.2 / 24.3) | 16.7 / 16.8 / 16.9 (work 3.0 / 3.6 / 10.2) |
| Pan by dragging, everything selected | avg ≤ 18.1, p95 ≤ 25, worst ≤ 33.3 | 18.1 / 18.2 / 29.4 (work 2.9 / 3.4 / 4.3) ✗ | 16.7 / 16.8 / 17.0 (work 2.9 / 3.3 / 4.8) |
| Pan with the wheel, everything selected | avg ≤ 18.1, p95 ≤ 25, worst ≤ 33.3 | 18.1 / 19.7 / 26.2 (work 1.7 / 2.0 / 2.2) | 16.7 / 16.8 / 16.9 (work 2.3 / 2.8 / 3.7) |
| Zoom with the wheel, everything selected | avg ≤ 18.1, p95 ≤ 25, worst ≤ 33.3 | 18.2 / 18.2 / 28.0 (work 2.5 / 2.9 / 3.8) ✗ | 16.7 / 16.8 / 16.9 (work 2.9 / 3.4 / 5.0) |

Before: frames every 18.0 ms, mounted in 581.8 ms. After: frames every 16.7 ms, mounted in 642.2 ms.

## 3. What changed, and why it worked

Each fix was found by timing every part of the frames of a phase from outside the page (`performance.now` around the renderer's steps, the GPU's own time through `EXT_disjoint_timer_query_webgl2`, and the Performance panel's CPU profile), changed within the architecture of ADR 0014, tested in the renderer's tests, and measured again in pairs.

1. **A layout plans only what the screen shows.** A change that touches most of the view, such as a layout, planned and drew every tile of the view in the frame that showed it: at the default view, 564 ms of "tiles and frame". Now only the cells near the screen are planned at once; the others keep their tiles off screen until a frame brings them near, which plans them before it draws, or until the camera and the canvas rest, a region a frame. Once every cell is planned the tiles are those a plan of the whole view makes (a test checks it), and an image plans what it shows first. In the pair below, the layout's "tiles and frame" went from 562 to 160 ms at the default view, from 808 to 40 ms in the cascade and from 157 to 74 ms with tables, and drawing the view with 1,000 routes from 528 to 129 ms.
2. **A switch far out shows copies put together behind it.** The frame that showed a switch at the whole view changed every plain drawing in place, which made PixiJS gather every region again: 38–93 ms. Now each region whose plain drawings are all drawn again is copied behind the one that shows, hidden, as soon as it is ready, and the copy's geometry is sent to the GPU in that frame, since PixiJS would otherwise send it only when it first draws it, in the switch's frame. The switch then shows the copies in place of their regions: 10–29 ms, mostly under 17, against 38–93 ms (frame by frame, section 4 says what is left).
3. **No tile shows a theme or colors no longer current.** Before, tiles off screen were shown stale when they came near: the benchmark counted 156 to 14,084 such tiles a run. A tile that comes near is now drawn again before it shows, whatever the clock: 0 in every run.
4. **The clocks stop before they overrun.** Drawing a tile again, or in full, stops before a drawing whose cost, learned from those made so far for its kind, would overrun the frame's clock, rather than after it; drawings in full are drawn 4 ms a frame, 40 shapes at least, with their geometry built ahead.
5. **The rest waits for a rest.** What a switch or a recolor left off screen, and the cells left to plan, used to be drawn in the frames that came next, at 6 ms a frame plus the regions PixiJS gathered again, which kept the frames after a recolor at a p95 of 21–25 ms. They now wait until the camera rests and nothing else happens on the canvas, then take what a frame's own work leaves of 5 ms, one region a frame, its drawings shown together. The frames after recoloring every Service went from a p95 of 24.5 to 13.6 ms at the default view.
6. **Names are tinted again where names show.** The swap frame tinted again every label written, far out too, where none shows: about 8 ms at the whole view. Labels now wait for the scale names show at, or for the camera to rest.
7. **Crowded cells are shared out.** A cell of the grid overlap held about 200 shapes in one tile, drawn in full in one go by the frame that first needed it. Cells now hold at most 64 shapes of a band, or 256 relations, to a tile: the grid overlap's 50 cells take 188 tiles, and its worst frames zooming the whole view, with the grid, and with the grid and rulers went from 45, 89 and 58 ms to 31, 29 and 30, though not every zoom improved (with everything selected in the dark theme, 55 became 90). The default view (588 tiles of shapes and 308 of relations) and the cascade are unchanged.
8. **Smaller jobs.** The casings under lines are one path for each width and one for every arrowhead, in place of a stroke for each piece. Drawings no frame shows any more are destroyed between frames, 3 ms at a time, rather than in the frame that replaced them; with it, the restacks' median went from 30 to 21 ms.
9. **Exports are measured.** The benchmark now times a PNG of the whole view at 1× and of what is visible at 2×, at the scale names show at and at the whole view, and counts the drawings the canvas keeps before and after each. At 10,000 elements the whole view is 22,544 × 14,384 pixels (48,216 × 37,436 in the cascade), larger than an image may be, and is refused at once, as R27 says; what is visible takes 69–273 ms, 0.1–0.4 MiB of PNG, and the canvas keeps as many drawings in full and as many names after an image as before it (191 tiles and 1,553 names at the default view, before and after).

## 4. The marks, met and missed

Read from the pair of section 2, After against Before. Absolute numbers on this laptop under its antivirus are a lead, not proof: the spec's checkboxes wait for the main session's official run on a quiet machine, and none is ticked here.

**Met, in every run of After:**
- Every switch and recolor shows in one frame with no stale tile and no fallback: 0 stale tiles shown in every variant, against 156 to 14,084 in Before.
- An edit of a column: p95 30 and 38 ms (mark 100). A route edit at the default view, in the stairs and with the grid on: p95 38–48 ms (mark 50), as in Before.
- The grid: 0.0–0.5 ms a frame at the median. Pictures: 16.0 and 18.2 MiB (mark 64). Antialiasing stays off, and layout runs in its worker (ADR 0015), as before.
- Frames on the default view, every phase but those named below, within average 10, p95 13 and worst 33.3 ms.

**Met where it missed before:**
- The frames after recoloring every Service, at the default view: p95 13.6 and 14.0 ms, worst 18.1 and 17.1 (Before: 24.5 and 23.9, worst 29.9 and 50.5); in the dark theme and with tables too. Still missed in the stairs (p95 18.0, from 28.3), the grid overlap (19.1, from 34.0) and with images (16.7, from 26.5).

**Missed, and what they would take:**
- **A layout** (mark 150): 292–315 ms at the default view, from 669–864; 198–207 in the cascade, from 1,080–1,358; 148 at the median and 161 at p95 with tables, from 233 and 251. Building the scene for 10,000 new positions takes about 100 ms and indexing it 35 to 40, before any tile is planned; planning and drawing the tiles near the screen then takes 160 ms at the default view and 40 in the cascade, from 562 and 808. The scene and its index alone come near the mark. Meeting it would take building the scene and its index for a layout off the main thread, and tiles cheaper to make than a batched drawing each; both need their own decision.
- **The 95% of a switch's frames within 16.7 ms**: p95 24.8 and 25.1 at the whole view (Before 43.8 and 42.4), 23.9 and 22.5 with shapes in full (30.7 and 31.4), 20.1 and 16.5 with names (26.9 and 27.3); worst 35.2 once at the whole view (97.7). The frames that draw tiles again take 10–14 ms; each switch then has one frame of 10–29 ms that shows it, and, far out, one frame of 24–28 ms four frames after it starts, which waits 16–20 ms for the GPU. That wait comes with the region copies: without them it is gone but the frame that shows the switch takes 22–60 ms again. It is in the GPU process, and its cause was not found in this pass. It would take a trace of the GPU process, or plain drawings that a switch can tint rather than draw again.
- **One edit** (mark 50): p95 66–68 ms at the default view, about as Before; 29–38 ms in the stairs, the cascade and with tables. At the median the edit's scene takes 7–9 ms, its index 1–2 and its tiles and frame 32–35. Not profiled further in this pass.
- **A route edit with overlap** (mark 50): 101 ms at the median in the grid overlap (Before 136) and 189 in the cascade (Before 164), all of it in tiles and frame; and single slower ones elsewhere, such as one of 125 ms in the dark theme. Not profiled in this pass.
- **A restack** (mark 100): 20–27 ms at the median in every variant, but the p95 of 20 restacks is their slowest, and single restacks of 115–548 ms came in After as in earlier pairs of Before (486–513 ms). Not explained.
- **Panning with names shown** at the default view: p95 12.6 and 13.4 (Before 12.7 and 12.2). With the grid on it was worse in After in each pair; measured again under load in alternating blocks, frame by frame, the averages are equal (7.6 against 7.6 and 7.3 against 7.5 ms) and the p95 0.4–2.4 ms higher, the difference in the step that gives tiles their detail, which now also builds the geometry of what it draws in full before PixiJS draws it.
- **The cascade with 986 routed lines**: the whole view pans at an average of 9.2 ms against 7.2, and a p95 of 11.1 against 8.3, within the marks but slower in each pair. Its cells are not shared out (1,182 tiles of relations in 1,182 cells), and the cause was not found in this pass.
- **Dragging a bend point**: worst 34.0 ms in both default runs (Before 31.8 and 33.4), the frame that starts the drag.
- **Pictures not decoded yet** (cold): single frames of 49–81 ms in After as in Before (50–61). Not addressed in this pass.
- **The app benchmark's clicks** (p95 ≤ 33.3 ms, two frames after React commits): this display starts a frame every 16.7–18 ms, so two frames take 33.4–36 ms; the benchmark says so itself and points at its work columns. The After run of the app benchmark began as six builders of the next wave started, and is not comparable.

## 5. Outside the canvas

- **Cleaning heavy SVGs** (core): the images variants take 4.2–4.3 s to build in the page, against about 0.35 s without images, nearly all of it in `cleanSvg` on the benchmark's four heavy icons. In `packages/core/src/images/svg.ts`, the scan for function calls in each attribute value, `value.matchAll(/([A-Za-z_][\w-]*)\s*\(/g)`, backtracks over every run of word characters, which is quadratic on long path data: about 2.9 s for a path of 20,000 commands. Scanning only values that hold a `(`, or matching names that are not preceded by a word character, makes it linear. This pass changes nothing outside `packages/app`.

## Measured again (A4)

Date: 2026-11-01. Measured by a builder, on `develop` at `98ceb85` with every other A4 task merged, the last task of A4, recorded and not held; nothing was optimized. This is the canvas benchmark's and the app benchmark's first record since section 2.

**How it differs from the runs above.** Not on the reference laptop, and not in a window in front:

- **The machine:** an Intel Core i9-14900HX (32 logical processors), 32 GB of memory and an NVIDIA GeForce RTX 4060 Laptop GPU, on Windows 11, on mains power in Windows' balanced plan; the machine `benchmark-5.md` and `benchmark-12.md` measured A4 on. Alongside ran the OneDrive sync service (about one processor), the antivirus (`bdservicehost`), Windows Update in the first minutes, and the person's own idle programs (their Visual Anything server on 52927, their browser and editor). No test run, benchmark or other builder's work ran meanwhile.
- **The browser:** Chrome 156.0.8078.74 run headless (`--headless=new`) on the RTX 4060 through ANGLE and Direct3D 11, in a profile of its own on debugging port 9347, with `--disable-background-timer-throttling`, `--disable-renderer-backgrounding` and `--disable-backgrounding-occluded-windows`, at a pixel ratio of 1, cross-origin isolated. No browser window was visible. Headless Chrome starts a frame every 4.2 ms, about 240 a second, not 60.
- **The build:** `pnpm bench`'s, built with its config and served by `vite preview` on 127.0.0.1:47721.
- **The runs:** `bench.html?elements=10000` in work mode three times, at 1600 by 900 pixels (1578 by 802 inside); the build of `cf6c8d7` (A4's "The main thread", the commit the "After A4" numbers of `benchmark-5.md` and `benchmark-12.md` came from) once, in the same hour, as the Before of the pair, since the reference laptop's numbers above cannot be compared with this machine's; and `app-bench.html?elements=10000` twice, at 1366 by 768 pixels (below says why).

Cells are "average / p95 / worst" for frames and "p50 / p95 / worst" for timed actions, in milliseconds; ✗ marks a miss, as the page judges it.

### The canvas benchmark, measured again

| Phase | benchmark-3, After, Default (reference laptop) | `cf6c8d7`, today | Now, run 1 | Now, run 2 | Now, run 3 |
| --- | --- | --- | --- | --- | --- |
| Pan, whole view | 3.4 / 4.0 / 12.5 | 5.6 / 7.9 / 11.4 | 5.8 / 9.1 / 11.0 | 5.5 / 7.9 / 23.9 | 5.4 / 7.8 / 11.8 |
| Zoom, whole view | 3.1 / 3.8 / 4.6 | 5.2 / 9.2 / 19.5 | 3.5 / 8.1 / 13.5 | 5.7 / 10.4 / 15.8 | 2.9 / 6.8 / 12.7 |
| Pan with the grid | 3.4 / 3.9 / 4.8 | 4.9 / 7.3 / 8.1 | 2.2 / 2.6 / 3.3 | 4.8 / 9.0 / 11.1 | 2.3 / 2.8 / 4.8 |
| Zoom with the grid | 3.4 / 4.4 / 6.5 | 4.9 / 10.3 / 23.6 | 2.5 / 6.0 / 7.8 | 2.4 / 5.5 / 8.7 | 2.4 / 5.8 / 7.4 |
| Pan with the grid and rulers | 3.9 / 4.5 / 10.3 | 5.1 / 7.2 / 9.8 | 2.8 / 3.7 / 4.1 | 2.5 / 3.1 / 4.4 | 3.1 / 5.7 / 7.7 |
| Zoom with the grid and rulers | 4.3 / 5.3 / 9.3 | 5.1 / 8.2 / 12.0 | 2.9 / 5.8 / 8.2 | 2.6 / 5.5 / 7.8 | 2.7 / 5.3 / 7.0 |
| Pan, names shown | 6.0 / 12.6 / 17.8 | 1.6 / 2.0 / 3.6 | 1.5 / 1.9 / 4.0 | 1.6 / 2.1 / 3.9 | 1.7 / 2.1 / 4.1 |
| Pan, names shown, again | 4.7 / 5.5 / 9.1 | 1.5 / 1.7 / 1.8 | 1.4 / 1.6 / 1.7 | 1.5 / 1.8 / 2.1 | 1.6 / 1.9 / 2.3 |
| Zoom across the label threshold | 4.0 / 8.6 / 12.3 | 2.1 / 4.3 / 13.5 | 1.5 / 2.7 / 4.2 | 1.5 / 2.6 / 4.9 | 1.9 / 3.4 / 5.4 |
| Pan, details shown | 3.7 / 4.3 / 5.4 | 1.2 / 1.3 / 1.9 | 1.0 / 1.1 / 1.5 | 1.0 / 1.2 / 1.5 | 1.8 / 2.2 / 2.5 |
| Select by clicking | 3.4 / 4.5 / 5.0 | 1.6 / 2.3 / 2.8 | 1.3 / 1.7 / 2.7 | 1.4 / 1.9 / 2.6 | 4.6 / 7.3 / 10.2 |
| Select everything | 6.6 / 9.5 / 16.3 | 2.6 / 4.5 / 7.1 | 2.2 / 4.3 / 6.6 | 2.2 / 4.3 / 7.0 | 3.4 / 8.4 / 11.5 |
| Zoom, everything selected | 4.3 / 5.5 / 6.1 | 4.9 / 8.8 / 16.0 | 2.3 / 5.3 / 6.5 | 2.3 / 5.6 / 6.8 | 2.3 / 4.7 / 10.3 |
| Switch theme, whole view | 13.4 / 24.8 / 35.2 ✗ | 10.5 / 15.5 / 17.5 | 15.5 / 27.9 / 29.5 ✗ | 14.9 / 23.9 / 26.9 ✗ | 14.7 / 27.0 / 29.7 ✗ |
| Switch theme, shapes in full | 12.0 / 23.9 / 30.0 ✗ | 14.0 / 29.8 / 33.7 ✗ | 14.6 / 28.8 / 29.6 ✗ | 9.9 / 15.8 / 27.9 | 9.1 / 13.1 / 25.8 |
| Switch theme, names shown | 11.7 / 20.1 / 20.9 ✗ | 20.1 / 34.9 / 51.1 ✗ | 8.1 / 13.7 / 13.7 | 8.6 / 12.3 / 12.3 | 7.9 / 10.7 / 10.7 |
| Pan after a switch, names shown | 6.3 / 9.3 / 17.1 | 5.6 / 9.9 / 53.9 ✗ | 2.1 / 3.0 / 11.5 | 2.2 / 3.1 / 10.1 | 3.5 / 6.9 / 11.9 |
| Zoom in after a switch, to names shown | 4.2 / 6.2 / 22.3 | 2.3 / 4.6 / 17.1 | 2.2 / 4.7 / 15.7 | 2.4 / 4.8 / 15.5 | 5.7 / 10.0 / 34.8 ✗ |
| Select everything, dark theme | 7.1 / 9.0 / 12.8 | 2.3 / 4.2 / 7.4 | 2.4 / 4.2 / 11.7 | 4.8 / 8.7 / 12.3 | 2.4 / 4.3 / 7.2 |
| Zoom, everything selected, dark theme | 5.1 / 6.4 / 7.6 | 4.5 / 9.2 / 37.6 ✗ | 2.7 / 5.6 / 16.4 | 2.5 / 5.3 / 16.2 | 2.7 / 5.2 / 16.1 |
| Recolor every Service, frames after it | 8.4 / 13.6 / 18.1 | 4.6 / 12.0 / 22.2 | 4.0 / 10.0 / 14.0 | 4.8 / 10.6 / 16.9 | 4.7 / 13.5 / 26.3 |
| Resize a shape, guides shown | – | 4.0 / 6.0 / 7.6 | 5.8 / 9.0 / 12.2 | 6.4 / 9.3 / 13.2 | 5.3 / 7.9 / 11.7 |
| Pan, whole view, 1,000 routed lines | 4.4 / 5.4 / 14.6 | 2.5 / 3.8 / 9.6 | 2.9 / 3.8 / 12.3 | 2.7 / 3.9 / 10.1 | 2.4 / 2.7 / 8.7 |
| Zoom, whole view, 1,000 routed lines | 3.9 / 4.6 / 5.2 | 2.2 / 4.6 / 11.4 | 5.3 / 9.9 / 35.0 ✗ | 2.7 / 5.8 / 14.2 | 2.7 / 5.9 / 14.4 |
| Pan, details shown, 1,000 routed lines | 3.9 / 4.6 / 5.3 | 1.3 / 1.5 / 2.2 | 2.8 / 4.6 / 6.9 | 1.4 / 1.6 / 2.1 | 1.5 / 2.2 / 2.8 |
| Drag a bend point of a routed line | 4.6 / 5.1 / 34.0 ✗ | 1.6 / 1.7 / 14.0 | 2.3 / 3.0 / 15.1 | 1.8 / 2.2 / 13.2 | 2.8 / 4.1 / 12.2 |
| Overlay of color, frames after it | – | 3.3 / 6.8 / 11.6 | 2.3 / 5.8 / 12.0 | 2.4 / 6.4 / 10.2 | 2.0 / 4.3 / 6.4 |
| Zoom across a level of detail | – | 5.4 / 8.3 / 11.3 | 3.0 / 7.5 / 11.5 | 5.9 / 10.0 / 13.3 | 5.0 / 7.1 / 10.1 |
| Tour step gliding 111 shapes | – | 3.6 / 2.3 / 171 ✗ | 5.4 / 8.5 / 206 ✗ | 3.6 / 2.7 / 176 ✗ | 3.5 / 2.2 / 170 ✗ |
| Pan before routes around shapes | – | 2.1 / 2.7 / 3.6 | 2.6 / 3.7 / 5.8 | 1.7 / 2.0 / 13.7 | 1.6 / 2.1 / 3.9 |
| Pan while routes around shapes come in | – | 5.7 / 7.5 / 161 ✗ | 6.0 / 8.8 / 163 ✗ | 4.2 / 4.9 / 164 ✗ | 3.9 / 4.0 / 146 ✗ |

| Timed action | Mark (p95) | benchmark-3, After, Default (reference laptop) | `cf6c8d7`, today | Now, run 1 | Now, run 2 | Now, run 3 |
| --- | --- | --- | --- | --- | --- | --- |
| One edit: a rename or a move | ≤ 50 | 50 / 68 / 68 ✗ | 30 / 39 / 39 | 32 / 41 / 41 | 30 / 36 / 36 | 26 / 32 / 32 |
| Apply a layout: every shape moves | ≤ 150 | 302 / 308 / 308 ✗ | 123 / 141 / 141 | 119 / 254 / 254 ✗ | 159 / 193 / 193 ✗ | 142 / 178 / 178 ✗ |
| Resize a shape: let go | ≤ 50 | – | 32 / 37 / 37 | 36 / 44 / 44 | 38 / 45 / 45 | 36 / 42 / 42 |
| Scope: leave one element out of the view, and add it back | ≤ 50 | – | 65 / 80 / 80 ✗ | 61 / 76 / 76 ✗ | 62 / 94 / 94 ✗ | 61 / 82 / 82 ✗ |
| Scope: leave a system out of the view, its contents into World, and add it back | ≤ 100 | – | 125 / 148 / 148 ✗ | 124 / 155 / 155 ✗ | 129 / 177 / 177 ✗ | 131 / 153 / 153 ✗ |
| Scope: show only the Services, then the whole model | ≤ 150 | – | 116 / 133 / 133 | 115 / 260 / 260 ✗ | 116 / 325 / 325 ✗ | 107 / 302 / 302 ✗ |
| Element list: 10000 rows and their columns | ≤ 50 | – | 0.5 / 1.9 / 1.9 | 1.3 / 2.6 / 2.6 | 0.5 / 1.4 / 1.4 | 1.5 / 2.8 / 2.8 |
| Element list: sort by a column | ≤ 50 | – | 5.2 / 5.9 / 5.9 | 5.2 / 6.1 / 6.1 | 5.2 / 6.2 / 6.2 | 5.2 / 6.1 / 6.1 |
| Element list: filter by words | ≤ 50 | – | 9.4 / 12 / 12 | 11 / 16 / 16 | 9.6 / 12 / 12 | 10 / 12 / 12 |
| Element list: paste 100 rows of 2 cells, to the frame | ≤ 150 | – | 9.2 / 17 / 17 | 13 / 20 / 20 | 9.4 / 15 / 15 | 11 / 17 / 17 |
| Destinations: 1,000 shapes marked, and unmarked, to the frame | ≤ 150 | – | 20 / 22 / 22 | 20 / 24 / 24 | 17 / 21 / 21 | 18 / 23 / 23 |
| Restack: to the back, then to the front | ≤ 100 | 21 / 115 / 115 ✗ | 19 / 34 / 34 | 16 / 28 / 28 | 13 / 23 / 23 | 16 / 32 / 32 |
| Export the whole view at 1× | none | 1 / 1 / 1 | 0.4 / 0.4 / 0.4 | 0.4 / 0.4 / 0.4 | 0.5 / 0.5 / 0.5 | 0.4 / 0.4 / 0.4 |
| Export what is visible at 2×, names shown | none | 171 / 171 / 171 | 139 / 139 / 139 | 133 / 133 / 133 | 156 / 156 / 156 | 134 / 134 / 134 |
| Export what is visible at 2×, whole view | none | 135 / 135 / 135 | 66 / 66 / 66 | 64 / 64 / 64 | 106 / 106 / 106 | 75 / 75 / 75 |
| One route edit: a style or a bend point | ≤ 50 | 27 / 38 / 38 | 19 / 23 / 23 | 20 / 26 / 26 | 14 / 18 / 18 | 17 / 20 / 20 |
| Show the view with routes | none | 478 / 478 / 478 | 259 / 259 / 259 | 204 / 204 / 204 | 218 / 218 / 218 | 203 / 203 / 203 |
| Overlay: color 10,000 shapes by an attribute | ≤ 150 | – | 35 / 46 / 46 | 28 / 48 / 48 | 31 / 49 / 49 | 30 / 49 / 49 |
| Overlay: size 10,000 shapes by an attribute | ≤ 150 | – | 121 / 138 / 138 | 117 / 137 / 137 | 119 / 144 / 144 | 111 / 134 / 134 |
| Move one shape: routing’s own work on the main thread | ≤ 8 | – | 5.4 / 9.8 / 9.8 ✗ | 6.2 / 11.9 / 11.9 ✗ | 5.8 / 10.8 / 10.8 ✗ | 5.9 / 10.6 / 10.6 ✗ |
| Move one shape: the frame with the routes around shapes that came | ≤ 50 | – | 12 / 17 / 17 | 14 / 17 / 17 | 14 / 16 / 16 | 13 / 18 / 18 |

- **Other figures, now:** the scene built in the page in 129 to 130 ms (130 at `cf6c8d7`); selecting 0.09 to 0.11 ms at the median, 0.21 to 0.30 at the 95th percentile; restyles with 0 fallbacks and 0 stale tiles shown in every run; "Apply a layout": the scene 38 to 54 ms, its index 14 to 15 and the tiles and frame 84 to 98 on average (32, 14 and 79 at `cf6c8d7`).
- **The grid's cost** (A3's mark: 0.5 ms a frame at the median) read 1.82 / 2.32 ms panning / zooming in the first run now, and −1.81 / −2.30 and −0.31 / 0.26 in the others (−0.38 / 0.05 at `cf6c8d7`). It is the difference of two medians measured apart, and headless frames of 1 to 5 ms swing by more than it between phases, as the grid phases' own rows show (pan with the grid 2.2 in one run, 4.8 in the next); on this machine headless it does not tell the grid's cost.

### The app benchmark, measured again

At 1600 by 900 pixels the app benchmark stops within its first clicks: "What the benchmark waited for never showed." A click it chose as clear of relations selects a relation instead (relation-3295, Element 0.16 → Element 0.19, "writes to"), so the inspector never shows the shape's name. It stops the same way on builds of `m3`, `m3c` and `m12` run headless at that size, so it is not A4's doing; at 1366 by 768, the reference laptop's display, it runs to its end. The benchmark finds its spots in the scene it builds itself, with the camera it works out for Fit and its zoom; at that size either a line the app draws passes a spot that scene leaves clear, or the app's camera is not the one the benchmark works out. Which was not diagnosed here; the earlier runs above were all at 1366 by 768, so the larger window may never have run. The runs below are at 1366 by 768 (1344 by 670 inside, the canvas 441 by 626 pixels between the app's panels and the results), shapes clicked at scale 0.585; the app mounted in 328 ms.

| Interaction | Mark | Section 2's After (reference laptop, front window) | Now, run 1 | Now, run 2 |
| --- | --- | --- | --- | --- |
| Select by clicking | p95 ≤ 33.3, worst ≤ 50 | 33.8 / 82.2 / 152.7 (work p95 55.2) ✗ | 22.9 / 29.9 / 70.0 (work p95 28.7) ✗ | 23.0 / 55.8 / 201.3 (work p95 54.7) ✗ |
| Select everything | worst ≤ 100 | 36.9 / 57.8 / 57.8 (work p95 53.5) | 13.7 / 23.8 / 23.8 (work p95 21.5) | 13.6 / 19.9 / 19.9 (work p95 18.1) |
| Keyboard move | report only | 66.4 / 119.0 / 119.0 (work p95 116.4) | 73.9 / 102.6 / 102.6 (work p95 100.9) | 71.7 / 98.1 / 98.1 (work p95 96.3) |
| One edit: a rename | report only | 84.0 / 118.3 / 118.3 (work p95 117.5) | 72.2 / 154.0 / 154.0 (work p95 148.2) | 72.4 / 202.8 / 202.8 (work p95 190.4) |
| Import: read a 10,000-node flowchart | worst ≤ 1,000 | – | 44.3 / 54.0 / 54.0 | 44.2 / 52.7 / 52.7 |
| Import: prepare a 10,000-node flowchart | worst ≤ 1,000 | – | 53.0 / 58.7 / 58.7 | 51.3 / 59.0 / 59.0 |
| Import: read a 10,000-row spreadsheet | worst ≤ 1,000 | – | 40.6 / 48.8 / 48.8 | 39.5 / 48.7 / 48.7 |
| Import: prepare a 10,000-row spreadsheet | worst ≤ 1,000 | – | 48.5 / 56.3 / 56.3 | 47.0 / 52.6 / 52.6 |

| Pan and zoom, frames as shown (work avg / p95 / worst) | Section 2's After | Now, run 1 | Now, run 2 |
| --- | --- | --- | --- |
| Pan by dragging, one element selected | 16.7 / 16.8 / 16.8 (work 3.8 / 10.8 / 17.4) | 4.2 / 4.3 / 6.0 (work 1.2 / 1.5 / 3.5) | 4.2 / 4.7 / 6.8 (work 1.2 / 1.4 / 3.3) |
| Pan with the wheel, one element selected | 16.9 / 16.8 / 66.8 (work 3.9 / 11.4 / 73.9) ✗ | 4.2 / 4.3 / 4.3 (work 1.1 / 3.3 / 5.4) | 4.2 / 4.3 / 4.3 (work 1.1 / 3.0 / 4.9) |
| Zoom with the wheel, one element selected | 16.7 / 16.8 / 16.9 (work 3.0 / 3.6 / 10.2) | 4.3 / 4.3 / 33.3 (work 1.8 / 3.2 / 27.2) | 4.3 / 4.3 / 33.3 (work 1.8 / 2.6 / 25.8) |
| Pan by dragging, everything selected | 16.7 / 16.8 / 17.0 (work 2.9 / 3.3 / 4.8) | 4.3 / 5.1 / 9.1 (work 1.5 / 2.6 / 4.7) | 4.2 / 4.9 / 9.0 (work 1.3 / 1.7 / 4.4) |
| Pan with the wheel, everything selected | 16.7 / 16.8 / 16.9 (work 2.3 / 2.8 / 3.7) | 4.2 / 5.3 / 6.7 (work 1.0 / 1.4 / 4.5) | 4.2 / 5.0 / 6.1 (work 1.0 / 1.5 / 3.3) |
| Zoom with the wheel, everything selected | 16.7 / 16.8 / 16.9 (work 2.9 / 3.4 / 5.0) | 4.2 / 4.3 / 4.9 (work 1.6 / 2.4 / 9.4) | 4.2 / 4.3 / 4.3 (work 1.6 / 2.2 / 9.2) |

Where a change's time goes, now (p50 / p95, run 1): a keyboard move takes 2.4 / 8.0 ms in the core, 45.5 / 58.2 in the shell's render and commit (React's Profiler 44.7 / 56.4), 17.1 / 23.5 in the canvas update and the other effects and 7.2 / 12.9 in the frame; a rename 10.3 / 22.5, 46.4 / 114.7, 7.3 / 11.2 and 8.0 / 13.3.

**What frames as shown can say here: not the 60 frames per second target.** Headless Chrome starts a frame every 4.2 ms, so a frame as shown is about 4.2 ms whatever the app does, and an interaction's "two frames after React committed" is 8.4 ms of waiting where a front window at 60 Hz waits 33.3. The rows above say that each input's work fits in the frames headless Chrome offers, and the work columns say what the app costs; whether the page keeps 60 frames a second in front, and the clicks' mark, which counts two of those frames, need the run in a front window at 60 Hz that the benchmark asks for, on a visible window this task does not open.

### What it says, measured again

- **No regression from A4 in the canvas benchmark:** now and `cf6c8d7` measured in the same hour are within each other's run-to-run spread in every phase. The one change of A4's last merges on the canvas's path, the check of a curve between the points of its flattening (`routing/rounded.ts`), runs only for automatic curved lines, which this view draws none of.
- **Within the marks on this machine,** every phase of panning, zooming and selecting at 10,000 elements, with names, details, the grid and rulers, everything selected, and 1,000 routed lines: average 1 to 6 ms, p95 under 11, worst under 24 in every run but one frame of 35 ms zooming with routed lines in run 1.
- **Missed now, as at `cf6c8d7` unless said:** a theme switch at the whole view (p95 24 to 28 against 16.7; met in `cf6c8d7`'s run, which missed it with names shown instead, by 35); the tour step's glide (one frame of 170 to 206 ms, its first) and panning while routes around shapes come in (one frame of 146 to 164 ms, when they come); "Apply a layout" at the 95th percentile, the slowest of four (178 to 254 against 141 in `cf6c8d7`'s one run; see `benchmark-5.md`); the scope's three actions (leaving one element out, 76 to 94 against 50; a system, 153 to 177 against 100; showing only the Services, 260 to 325 against 150, met at `cf6c8d7` with 133 in its one run, its median the same, 107 to 116); and routing's own work on the main thread when a shape moves, 10.6 to 11.9 against 8.
- **The app benchmark** times a keyboard move at about 72 ms and a rename at about 72 ms at the median on this machine, most of it React's render and commit of the shell (about 45 ms); the clicks keep within 30 ms at the 95th percentile in one run and not the other (56), its worst 70 and 201 ms.
