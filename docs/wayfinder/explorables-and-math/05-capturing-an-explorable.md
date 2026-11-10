---
label: wayfinder:research
title: How an explorable becomes a still picture, for the canvas, exports and Claude
status: open
assignee:
blocked_by: []
---

# How an explorable becomes a still picture, for the canvas, exports and Claude

## Question

A walled-off frame cannot be read by the app, yet an explorable needs a still picture: on the canvas until explored, in SVG, PDF and PNG exports, and for Claude, who captures it and reads its console errors (ADR 0081). What can make that picture: the frame drawing itself (SVG `foreignObject`, html-to-image libraries, a canvas's `toDataURL`) and posting it out, the browser's own capture APIs, or the local program rendering it headless? When is it taken (after approval, on each change, kept by hash)? What does the canvas show for an explorable not yet approved, which cannot run?
