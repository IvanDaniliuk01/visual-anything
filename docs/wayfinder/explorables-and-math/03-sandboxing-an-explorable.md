---
label: wayfinder:research
title: How an explorable runs walled off, in the app and in the read-only page
status: open
assignee:
blocked_by: []
---

# How an explorable runs walled off, in the app and in the read-only page

## Question

What frame, origin and content security policy let an explorable's JavaScript run with no reach into the app, its session token, the local program (127.0.0.1, which checks Origin and Host), the person's files or the network, both in the app the local program serves and in the read-only page, which is one file with `default-src 'none'`, scripts by hash and Trusted Types (ADR 0041)? Cover `sandbox` flags (never `allow-same-origin` with the app's origin), `srcdoc` against blob or a separate loopback origin, how libraries kept beside the project reach the frame, how data and a tour step's state go in and console errors come out (`postMessage`, `MessageChannel`), how to stop a page that loops forever or eats memory, and the browsers we support. Name what is proven and what must be prototyped.
