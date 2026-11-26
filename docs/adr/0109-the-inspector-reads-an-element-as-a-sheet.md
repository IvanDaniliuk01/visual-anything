---
status: accepted
---

<!-- Decided on 2026-11-26, when the user had the sheet (PR 18) applied to master after using it on a project of 300 elements. -->

# The inspector reads an element as a sheet, or edits it

Projects that explain a process are read far more than edited: each element holds a rule, a source, a model or a measured accuracy in its attributes. The inspector showed them in one-line fields that clipped long values, drew no Markdown in them, and put the packages' panels after every editing section, so each new selection meant scrolling down again.

## Decision

- **A Sheet | Edit switch under an element's title.** Edit is the inspector as it was.
- **The sheet reads the element:** the packages' panels first, then the description with its Markdown, then every attribute that has a value, whole, under its name, with its definition's description as a hint. An attribute whose definition has `"format": "emphasis"` draws as Markdown blocks; any other value as written, so identifiers keep their underscores. Attributes without a value are left out.
- **The choice is each person's, kept in the browser** (`visual-anything.inspector-mode`), like the view folders, and holds from one element to the next. It is a reading preference of one browser, not of the person across machines, so it stays out of the preferences ADR 0032 keeps beside the program.
- Relations and views keep only editing for now.

## Considered options

- **A separate reading panel beside the inspector.** Rejected: it doubles what shows for one selection and takes canvas width.
- **Making the editing fields grow and draw Markdown.** Rejected: an editing field that draws Markdown hides what is typed, and the order of sections would still put the panels last.
