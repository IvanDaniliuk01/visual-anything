---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# What ships with Visual Anything carries a license that lets it ship

M6c adds starter packages per domain (R38): C4 architecture and data-science pipelines first, then machine learning, physical AI, and neuroscience and anatomy. They bring icons, sample projects and, later, data drawn from ontologies. Visual Anything is open source, and its own license is not chosen yet, so what ships with it must be redistributable whatever that license turns out to be.

- **Allowed licenses for content that ships:**
  - CC0-1.0;
  - CC-BY-4.0, with the attribution it asks for;
  - MIT, ISC, BSD-2-Clause and BSD-3-Clause;
  - Apache-2.0.

  Content under any other terms does not ship. That includes non-commercial, no-derivatives and share-alike licenses, and icon sets whose terms differ from their code's. Such content can be referred to, or imported by the person into their own project.
- **Recorded where it lives.**
  - A package file gains optional `license` (an SPDX identifier) and `attribution` (text).
  - An image already has `source`; it gains an optional `license`.
  - Every built-in package and every image in one records both. A test checks them against the list above.
- **Attribution travels.** The app shows a package's attribution in the Components tab. Exports carry the attribution of the packages a view uses: the read-only page in its About panel (ADR-0041), and SVG and PDF in their metadata.
- **Ontologies,** such as anatomy's (M13), ship only what their license allows. Every term keeps its source's identifier as an external identifier (R13), so that the source can be cited and followed.
- **Projects of the person's own** are theirs: Visual Anything never checks their licenses. The fields are there for them to fill in.

## Considered options

- **Choosing Visual Anything's license now:** left to the user, who owns the project. This decision holds for any open-source license.
- **Share-alike content, such as CC-BY-SA icons:** rejected. Its terms would reach the packages and pages made with it.
- **Drawing every icon ourselves:** kept for what no allowed set covers, but too slow as the only source.

## Consequences

- The schema gains the package and image fields.
- The built-in packages record their license and attribution, and the test above guards them.
- Each starter package says where its icons come from in its own README section.

## Clarifications

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25 (W31): **how the fields are written.** A package's `license` and an image's `license` are one SPDX identifier, such as `CC0-1.0` or `LicenseRef-mine`; an expression such as `MIT OR Apache-2.0` is not one. A package's `attribution` is text of 1 to 2,000 characters, and its `version` a semantic version, such as `1.2.0`. The schema says so in words, and every command that sets them checks them: `create-package`, `update-package` (where `null` takes one out), `define-image`, `add-package` and `replace-package`.
- 2026-10-25 (W31): **the license test** is `core/src/builtin/licenses.test.ts`, over `SHIPPABLE_LICENSES` and `shippingProblems` in `core/src/licenses.ts`. Every built-in package needs a license from the list and an attribution; every image in one needs a source and a license from the list.
- 2026-10-25 (W31): **what Visual Anything writes and draws itself is CC0-1.0**, credited to "Visual Anything contributors" (ADR 0051). That covers Systems, Data modeling, the starter packages and their icons, whose source is "Drawn for Visual Anything". The README's "Starter packages" section says so for each starter package.
- 2026-10-25 (W31): **the Components tab** shows a package's version, license and attribution in its page, and the project's own packages can change them there.
- 2026-10-25: what M6b's exports carry and ship (W32).
  - An SVG export writes the license and attribution of each package it draws from that records them, one line each, in its metadata's `dc:rights`; a PDF writes the same lines in its document information, under `Attribution`. A package that records neither is not named.
  - The PDF export ships Roboto 2.137 Regular and Bold under Apache-2.0, which is on the list above. They are taken unchanged from the npm package `roboto-fontface` 0.10.0, and their license is in `app/src/export/fonts/LICENSE-roboto.txt` beside them. Later Roboto releases are under the SIL Open Font License, which is not on the list, so they do not replace these.
- 2026-10-26: **the public domain, and sets that ship under their pictures' terms** (ADR 0079). The list gains `CC-PDM-1.0` and `LicenseRef-public-domain`. The line on "icon sets whose terms differ from their code's" means sets whose terms for the pictures are not on the list: a set ships under its pictures' license when that is on the list.
- 2026-10-26 (M8b, W59): **a sample that ships a picture records its license as a built-in package does.** A sample ships in the repository, and Add from another project can copy its package, pictures and all, into anyone's project. So `examples/beyond-boxes`'s package `heart` records `CC0-1.0` and "Visual Anything contributors", and its picture of a heart "Drawn for Visual Anything" and `CC0-1.0`; its test holds them to the list with `shippingProblems`, as the license test holds the built-in packages. The other samples' packages ship no picture.
- 2026-10-26 (M8b, W56): **code is recorded where it is chosen, and in the notice of what ships.** The list above is for content: data, pictures and fonts. The code Visual Anything depends on is chosen, with its license, in the ADR that adds it, as ADR 0068 chose parse5 (MIT, its `entities` BSD-2-Clause) and satori (MPL-2.0, its dependencies MIT and ISC). What a single executable bundles is listed, package by package, with its license and where its source is, in the notice `pnpm package` writes (ADR 0037's clarification of this date). The Roboto that drawings of HTML are written in is the PDF export's, under Apache-2.0, copied unchanged with its license into `server/src/drawings/fonts/`.
- 2026-10-30 (M3c Stage 1b, ADR 0080): **libavoid-js joins the code that ships.** The app depends on `libavoid-js` 0.5.0-beta.5, pinned exactly: npm's `latest` on 2026-10-30, published on 2026-02-23. It is Adaptagrams' libavoid compiled to WebAssembly, under LGPL-2.1-or-later, which is not on the list above, since that list is for content; LGPL code may ship when it can be replaced. So its WebAssembly ships as a file of its own, `libavoid.wasm`, served beside the app at `/libavoid.wasm` and copied unchanged into the build, which the person can replace with a build of their own of the same version; its JavaScript glue is a chunk of its own, which only the routing worker loads. The notice `pnpm package` writes names it, with its license and where its source is (`LIBAVOID_JS_VERSION` in `server/scripts/notices.ts`, which a test holds to the app's dependency).
- 2026-10-30 (M3c, after Stage 1b, ADR 0080's clarification "libavoid leaves the shipped app"): **libavoid-js leaves the code that ships.** It missed the routing budget, and the routing worker's policy (ADR 0054) refuses the WebAssembly and the functions made from text it needs, so the app no longer loads it. It stays a development dependency of `packages/app`, used only by the quality tests that measure it against the program's router; no module that ships imports it, the build emits no `libavoid*.wasm`, and the notice `pnpm package` writes no longer names it (`server/scripts/notices.test.ts` holds that). This supersedes the entry above of the same date.
