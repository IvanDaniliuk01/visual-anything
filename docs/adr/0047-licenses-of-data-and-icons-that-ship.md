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

- 2026-10-25: what M6b's exports carry and ship (W32).
  - An SVG export writes the license and attribution of each package it draws from that records them, one line each, in its metadata's `dc:rights`; a PDF writes the same lines in its document information, under `Attribution`. A package that records neither is not named.
  - The PDF export ships Roboto 2.137 Regular and Bold under Apache-2.0, which is on the list above. They are taken unchanged from the npm package `roboto-fontface` 0.10.0, and their license is in `app/src/export/fonts/LICENSE-roboto.txt` beside them. Later Roboto releases are under the SIL Open Font License, which is not on the list, so they do not replace these.
