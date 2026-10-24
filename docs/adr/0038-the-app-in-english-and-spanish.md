---
status: accepted
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions, after the user asked for the app to be in Spanish too. -->

# The app speaks English and Spanish; the repository stays in English

Everything the app shows can be read in English or in Spanish:
- its panels, menus, dialogs, captions, announcements and keyboard help;
- the names of the built-in packages' components and relation types;
- what the local program and the core tell the person, such as command labels in the history and the reasons a change is refused.

The language is a preference (ADR 0032). It follows the browser's language unless the person chooses one in the header, and `<html lang>` follows it.

How the text is kept:

- **English in the code.** Code, comments, tests, docs and the core's own messages stay in English, as CLAUDE.md requires. The app looks each English text up as the key of a catalog. Spanish lives only in that catalog, `packages/app/src/i18n/es.ts`. A text with no Spanish entry shows in English, never as a key or a blank.
- **Values in braces.** Texts with values name them in braces, as in `Put "{element}" inside "{container}"`. Counts choose their form through `Intl.PluralRules`, never by adding "s".
- **The core's messages.** The core and the local program keep writing English: command labels, problem messages and notices. The app translates them with catalog entries written as templates of those messages, so the core needs no language. Claude reads the English, which its tools describe.
- **Not translated:** what people write, such as element names, descriptions and attribute values. Ids, file contents and Claude's tool descriptions are not translated either.

We chose this because the person wants to use Visual Anything in Spanish, while the repository has to stay readable as one language. English keys keep every component readable and let untranslated text degrade gracefully while tasks run in parallel. Templates keep the core free of anything about how the app reads.

## Considered options

- **A translation library such as i18next or FormatJS**: rejected for now. A small lookup with braces and `Intl.PluralRules` covers two languages, adds no dependency, and keeps the page's content security policy simple. One can replace it later behind the same `t()`.
- **Message ids instead of English keys**: rejected. Every component would read as ids, and a missing entry would show an id.
- **The core returning message ids and values**: rejected for now. Every refusal and label in the core would change while other tasks change the core. Templates in the app give the same result. The core can move to structured messages later without changing what the person sees.
- **Spanish strings in the components**: rejected. The repository is in English.

## Consequences

- New UI text goes through `t()` or `useT()`. A test fails when a component writes visible text outside them, once a file has moved to the catalog.
- The catalog has a test that every Spanish entry has the same braces as its English key.
- The core's messages and the catalog's templates must change together. A test runs the core's labels and problems on fixtures through the templates, and lists the ones with no Spanish entry.
- A third language is one more catalog.
