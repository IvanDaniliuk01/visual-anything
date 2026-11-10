---
label: wayfinder:research
title: How libraries are fetched once and kept beside the project
status: closed
assignee: claude
blocked_by: []
---

# How libraries are fetched once and kept beside the project

## Question

How does the local program fetch a JavaScript library once (D3, Plotly, function-plot, JSXGraph, KaTeX and the like), check it, and keep it beside the project by its SHA-256, so explorables use it offline and the read-only page carries it? Cover where it comes from (npm tarballs from the registry against jsDelivr or unpkg files, ESM against UMD builds, packages with several files or fonts), how an explorable names one (an import map, a fixed URL scheme), integrity and pinned versions, the sizes of the common ones, licenses and how they are credited (ADR 0047), what the program does today when it fetches for package code (ADR 0063), and what the person sees before approving a download.

## Resolution

Findings: `docs/wayfinder/explorables-and-math/research/libraries.md` on branch `research/libraries` (e3d454b2).

- **Source: the npm registry only.** The program fetches the version's document, then its tarball, and checks the tarball against the registry's SHA-512 `integrity`; exact versions, nothing updates by itself, no install scripts. jsDelivr `+esm` and esm.sh are refused: they build files on request, so no registry hash covers them.
- **Format and naming.** Prefer each library's single-file UMD build that sets a global (D3, Plotly, function-plot, JSXGraph, Chart.js, KaTeX, mathjs and p5 ship one); a standalone ESM file otherwise. An explorable names a library by a bare id (`d3`) through an import map the frame builds; a project keeps one version per id.
- **Storage.** `libraries/<sha256>.<ext>`, written and checked as `media/` and `solids/` are, with a JSON record per library: package, version, tarball address, integrity, SPDX license, files with hash, role and global; the tarball's LICENSE kept too. The read-only page's About and the explorable panel credit them; a license outside ADR 0047's list warns, never refuses.
- **Approval.** Before a byte is fetched the person sees who asks, the package, the exact version and the two registry addresses; afterwards the files and sizes. An explorable's approval covers its libraries' hashes.
- **Seams.** Address checks factored out of `server/src/live-fetch.ts`; a new `server/src/libraries/` (registry fetch, strict gzip and tar reader on `node:zlib`, store); core caps and protocol messages, `schema/src/files.ts`, a Claude tool `request_library`, `app/src/viewer/page.ts`.
- **Risks passed on.** Multi-file ESM (three.js) and CSS with relative `url()` (KaTeX fonts) do not resolve from blob URLs, so ticket 03's frame must serve or rewrite them; Safari has refused blob URLs from sandboxed frames; Plotly adds about 6.5 MB to a read-only page; p5.js is LGPL-2.1. Unverified in a browser: relative imports from blob URLs.

Renamed by [How explorables are kept and named by what shows them](06-explorable-files-and-what-shows-them.md): the folder is `script-libraries/` and the term **Script library**.
