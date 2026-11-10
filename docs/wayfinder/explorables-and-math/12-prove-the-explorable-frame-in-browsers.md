---
label: wayfinder:task
title: Prove the explorable frame in Chrome, Firefox and Safari
status: open
assignee:
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
