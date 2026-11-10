---
label: wayfinder:research
title: How an explorable runs walled off, in the app and in the read-only page
status: closed
assignee: claude
blocked_by: []
---

# How an explorable runs walled off, in the app and in the read-only page

## Question

What frame, origin and content security policy let an explorable's JavaScript run with no reach into the app, its session token, the local program (127.0.0.1, which checks Origin and Host), the person's files or the network, both in the app the local program serves and in the read-only page, which is one file with `default-src 'none'`, scripts by hash and Trusted Types (ADR 0041)? Cover `sandbox` flags (never `allow-same-origin` with the app's origin), `srcdoc` against blob or a separate loopback origin, how libraries kept beside the project reach the frame, how data and a tour step's state go in and console errors come out (`postMessage`, `MessageChannel`), how to stop a page that loops forever or eats memory, and the browsers we support. Name what is proven and what must be prototyped.

## Resolution

Findings: `docs/wayfinder/explorables-and-math/research/explorable-sandbox.md` on branch `research/explorable-sandbox`.

- **One frame document, built by one pure function in the core** (`core/src/explorables/frame.ts`): the `va` runtime, the libraries inline and the explorable, every inline script and style hashed, so a script it did not build has no hash and never runs. The frame is sandboxed with `allow-scripts` only, so its origin is opaque. Its policy, in the app and in the page: scripts only by hash, no `eval`, no network, no workers, no nested frames.
- **In the app, a second loopback listener.** Bound to 127.0.0.1 on a port of its own and reached under the other loopback name (`localhost` when the app is at `127.0.0.1`, and the reverse), so the frame is cross-site and Chrome and Firefox put it in another process. Its responses carry the hashes, the `sandbox` directive and `frame-ancestors` naming the app; its address holds a per-session nonce that is not the session token; it refuses any request with an Origin header, and its Host check stops DNS rebinding. `srcdoc` is ruled out in the app: it would inherit the app's `script-src 'self'` and put the code on the origin whose `sessionStorage` holds the token.
- **In the read-only page, `srcdoc`,** which inherits the page's policy, as every `srcdoc`, `blob:` and `data:` frame does. Only a page that holds explorables changes its policy: `script-src` adds their hashes, `style-src` becomes `'unsafe-inline'` (a change to ADR 0041 the ADR must state), and a Trusted Types policy `visual-anything-explorables` admits only the embedded documents.
- **Messages and runaways.** Data in and console errors out over one transferred `MessageChannel` port, every message checked and capped in the core. A watchdog pings every second and removes a frame silent for 3 s; a `sessionStorage` mark keeps a frame that hung the tab from starting again by itself.
- **What no policy stops: WebRTC.** No browser lets a content security policy block it, so a malicious explorable could still send data out that way. The person's approval stays the real line, which the ADR and the approval prompt must say plainly.
- **Must be proven in Chrome, Firefox and Safari.** Graduated as [Prove the explorable frame in Chrome, Firefox and Safari](12-prove-the-explorable-frame-in-browsers.md).
