---
status: accepted
---

<!-- Agreed with the user on 2026-11-10, when A9 found that KaTeX's fonts are under the SIL Open Font License. It supersedes ADR 0047's rule for fonts only. -->

# Fonts under the SIL Open Font License 1.1 may ship, unchanged and with their license

Math (ADR 0106) draws with KaTeX's twenty fonts, and their name tables give the SIL Open Font License 1.1 (OFL-1.1), with Reserved Font Names `KaTeX_Main`, `KaTeX_Math` and the others. ADR 0047 lets ship only content under CC0-1.0, CC-BY-4.0, MIT, ISC, the BSD licenses, Apache-2.0 and the public domain, and its clarification of 2026-10-25 kept later Roboto releases out for being under the OFL. No complete set of math fonts is under a license on that list: MathJax's are under the OFL too.

## Decision

- **A font under OFL-1.1 may ship** in the app, the read-only page and the single executable, besides what ADR 0047 lists. This is for fonts only; data, pictures and solids keep ADR 0047's list, and so do the licenses packages record.
- **Unchanged, and with its license.** The font files ship as their source gives them, never renamed inside the file; the CSS family names the app gives them are names it looks them up by, not changes to the fonts. Their license, with their copyright lines and Reserved Font Names, is in the repository beside what is made from them and in `THIRD-PARTY-NOTICES.md`.
- **What is made from them is under the same license:** tables read from a font, such as Math's advance widths and glyph outlines (`packages/core/src/math/advances.json` and `outlines.json`), carry the font's license and never take its Reserved Font Names.
- **Documents are not reached.** SVG, PDF, PNG and read-only pages that draw glyphs from these fonts are documents, which the OFL leaves to their authors.
- **Never sold alone.** The OFL lets fonts ship with software, sold or not, but not be sold by themselves; Visual Anything never offers a font apart from the program.

## Considered options

- **Keeping ADR 0047 as it is:** rejected by the user, since Math would have no fonts to ship.
- **Drawing math fonts of our own:** far too slow, and the result would read worse than fonts made for TeX.
- **Letting the person download the fonts on first use:** rejected; the app works offline and loads nothing from the internet (ADR 0041).

## Consequences

- `THIRD-PARTY-NOTICES.md` names KaTeX's fonts with the OFL's full text, from `packages/core/src/math/LICENSE-katex-fonts.txt`.
- A later Roboto release under the OFL could now replace the Roboto that ships, should a reason arise.
