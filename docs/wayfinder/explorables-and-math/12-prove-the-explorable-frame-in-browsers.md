---
label: wayfinder:task
title: Prove the explorable frame in Chrome, Firefox and Safari
status: closed
assignee: claude
blocked_by: [03-sandboxing-an-explorable.md]
---

# Prove the explorable frame in Chrome, Firefox and Safari

## Question

Before the Explorables ADR fixes the frame, build a throwaway prototype (outside the packages, on a `prototype/explorable-frame` branch) of the second loopback listener and the `srcdoc` frame of the read-only page, and record, in each browser, whether:

- the embedder's `frame-src` stops an explorable navigating itself to an outside address;
- a `srcdoc` frame passes `frame-src 'none'`;
- an endless loop in the frame freezes the app (only desktop Chrome 127+ is known to isolate sandboxed frames);
- `localhost` reaches a 127.0.0.1-only listener without delay;
- common libraries (D3, Plotly, function-plot, JSXGraph, KaTeX with its fonts, a multi-file ESM such as three.js) run with no `eval`, Trusted Types inherited, and inline or served by the listener (ticket 04's risk on relative imports);
- the hashes the server computes match the browser's;
- html-to-image draws the still from inside the frame (ticket 05).

Name the browser versions the program supports, which the repository does not yet say.

## Resolution

Done on 2026-11-10 by a subagent, in headless Chrome 157.0.8103.50 and Firefox 160.0 on Windows, in the app (the second loopback listener) and in the read-only page (`srcdoc`, over http and as `file://`); the main session checked the recorded results and that no server or browser was left running. Prototype, results, stills and report on branch `prototype/explorable-frame`, under `prototypes/explorable-frame/` (`REPORT.md`). Safari was not tested: it does not run on Windows.

- **What holds, in both browsers.** The frame cannot read the parent, the app's `sessionStorage` token or any storage; every network and code path tried was blocked (the stand-in outside server got no request); the embedder's `frame-src` stops an explorable navigating itself out, and a `srcdoc` frame loads under `frame-src 'none'`; the server's hashes match the browser's; Trusted Types are inherited; the watchdog removes a silent frame after 3.0 s; one `MessageChannel` port carries data both ways. D3, Plotly, function-plot, JSXGraph, KaTeX with its fonts as `data:` addresses, and three.js all ran, and html-to-image drew a readable PNG inside the frame for a D3 chart, a canvas chart and a KaTeX formula.
- **Four changes the design needs:**
  1. **A fresh `<random label>.localhost` host per frame,** not plain `localhost`: in Chrome a looping frame's process spins for seconds after the watchdog removes it, and the next frame on the same site hung (2 of 2 runs), while one on a fresh label answered in 103 ms. Firefox resolves `*.localhost` too.
  2. **Script libraries inlined as globals,** and an ESM-only package flattened into one file when it is fetched: import maps cannot work in the page, and serving modules from the listener would need it to accept `Origin: null`, against "refuse any Origin". This settles ticket 04's import-map naming: an explorable names a library by its id in its definition, and the frame inlines it.
  3. **The frame builder turns CR and CRLF into LF and escapes NUL before hashing,** since the browser rewrites them before it hashes.
  4. **The read-only page's policy adds `font-src data:`,** for KaTeX's fonts in explorables.
- **A gap the ADR must state.** In Firefox, an endless loop in the read-only page's `srcdoc` frame freezes the whole tab and the watchdog never fires; in the app Firefox is fine, since its frame runs in another process. So, outside Chromium, the page shows explorables' stills and runs one only when the reader presses Run, with a warning. This narrows the user's Q40 ("they run there by themselves") to Chromium browsers.
- **WebRTC leaks, as the research said:** from inside the frame, Chrome sent STUN packets to a loopback UDP listener. Approval stays the real line.
- **Libraries that compile strings into code fail without `eval`:** function-plot's formulas as strings (`fn: 'x^2'`), JSXGraph's string terms, `d3.csvParse`. Functions work (`fn: x => x * x`), and so does `d3.csvParseRows`. The guidance Claude reads must say so (the map's fog "How Claude learns to write explorables well").
- **For the capture:** in Firefox, `document.fonts.ready` never settled in the app's frame in 3 of 4 runs, though the glyphs drew: wait for it at most about 2 s, then draw.
- **For automated tests:** puppeteer's defaults turn off Chrome's isolation of sandboxed frames and force Firefox into one content process; a test that does not turn both back on measures the wrong browser.
- **Proposed support:** desktop Chrome and Edge 127 or later in full; Firefox in full in the app, with Run on request in the page; Safari and mobile browsers as Firefox's page until someone runs the prototype on a Mac.
