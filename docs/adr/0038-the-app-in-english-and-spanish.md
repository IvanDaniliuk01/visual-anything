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

## How L1 applies it

<!-- Decided by Claude on 2026-10-24, building L1, under the user's standing delegation of design decisions. -->

- **The browser's language** is the first of `navigator.languages` that the app reads, by its primary subtag: `es-AR` is Spanish, and `fr-FR, es` is Spanish too. With none, English.
- **The first frame.** The tab keeps the language chosen in its session storage, as it keeps the theme, so that a reload starts in it. The address carries no language: a new tab reads in the browser's language until the local program sends the person's preferences, with the project.
- **The Language control** is a select beside the Theme control. Each language is named in its own language, English and Español, and matching the browser says which language that is now.
- **Two sections in the catalog.** `ui` holds what the app writes through `t()`. `messages` holds what is kept in English and translated where it is shown: the core's and the local program's messages, and the app's own notices and undo labels. Only `messages` entries are matched as templates, so that a loose text of the app such as `{from} to {to}` never takes a message apart.
- **Parts that are messages.** A template's brace holds what people wrote, never translated, unless its name says it holds a message or a phrase the core builds, such as `{why}`, `{of}` or `{things}`; those are translated in turn, and lists of them, as in "3 elements, 2 relations and 1 view", are joined as the language joins lists. Spanish contracts "de el" and "a el" where such a phrase follows.
- **Built-in names** are found by definition and package id, never by name. Attribute names are data, like ids, and are not translated.

## How L1 finishes

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25: **what the canvas writes** reads in the language too: the built-in component name in a shape's detail, what a collapsed container holds ("3 inside") and what a collapsed table holds ("12 × Column"). The scene is built again, from nothing, when the language changes, and keeps nothing from a build in another one; nothing else the canvas draws changes with the language, since an aggregated relation's "×3" reads the same in both. The canvas's role description is translated too, so the benchmark finds the canvas by its class.
- 2026-10-25: **a name the app gives** something new, such as an element named after its component, a row after its column's component, a connection point "point 2" or a definition derived from a built-in one, is written in the language read in when it is made, and is from then on what people wrote: it is never translated again, and the history's label holds it as it was given.
- 2026-10-25: **a built-in attribute's description** reads in the language, found by the definitions an element, a relation or a definition is known through, nearest first, and the attribute's name, and only while it is that built-in definition's own description: a redefinition of the project's own keeps its own words. Attribute names, attribute types ("string", "number", "boolean", "JSON") and the keys and values of the file format are data and stay as files write them.
- 2026-10-25: **messages the app shows later** are kept in English and read in the language as they are shown: the component editor's problems, the core's reasons, history labels the app makes (such as `Lay out "Overview"`) and what it announces once a change is done. Built-in names inside a core message stay as the core wrote them, as names inside any message do.
- 2026-10-25: **what stays English** is only what no template can read: the reason of a command the core cannot read at all ("The command is not well formed: …"), which is the JavaScript engine's own words, and reasons that come from outside, such as the JSON parser's, the browser's and the file system's codes, which a template keeps as they are inside a translated sentence. Only commands written by hand reach the first, so only Claude, which reads English, can see it.
- 2026-10-25: **Claude's tool refusals** go to Claude, never to an app: the app shows the person only what Claude does (its actions, labelled by the core or by Claude, and its guidance, in Claude's own words), so no template is needed for them. The local program's notices and refusals to the app, the schema's reasons and the problems that keep a project from opening all have templates, and the server package has a test that runs the program on broken folders and reads what it says through the app's catalog.
- 2026-10-25: a template's brace named `files` holds a list of paths, each kept as it is and joined as the language joins lists; one whose name says it holds a message or a phrase is read as a list by its commas alone when an item says "or" itself, as "1 EXIF or XMP segment" does. Places in an order are written as the language writes them ("3rd", "3.º").

## Clarifications from the L1 review

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25: **the words of three terms.** A sample project is "proyecto de muestra", never "proyecto de ejemplo", since CONTEXT.md avoids "example" for it. A legend is "leyenda", never "referencias", which is close to the built-in relation type "references" ("referencia") and to the word CONTEXT.md avoids for external identifiers and destinations. A caption, which the glossary had as "leyenda", becomes "rótulo", so that no two terms share a word.
- 2026-10-25: **the avoided words in Spanish.** `catalog.test.ts` lists the Spanish of every word CONTEXT.md avoids that has one. Where the word is right in its context, the entry is rewritten, or the word is kept through a narrow, commented exception in the test: an XML entity, a JSON object, the built-in "Object storage", a spreadsheet, a stylesheet's class, a colour profile, an SVG's outside references, the "&" that starts an XML reference, and the relation type "referencia" with its package's description. Words too common to forbid outright ("archivo", "carpeta", "conexión", "página", "nivel") are not listed.
- 2026-10-25: **the sandbox's own reasons.** What the sandbox that runs package code says itself (the code imports, waits at the top of its module, has no such hook, the interpreter stopped or failed, an error that says nothing) is a reason of its own in lower case, as "it threw something that is not an error" is, and the catalog has a template for each sentence that holds one. Only what the package's code threw, and the engine's words after "the interpreter failed:", stay as written.
- 2026-10-25: **the protocol's reasons** have templates too: every reason the core's protocol and live-value readers give, which the "unreadable" screen shows for a message of the local program and a refusal shows for one the app sent; "The message is not text."; the reasons a tab's copy falls out of step, which the drift notice holds; and why the program refuses preferences. `protocol-messages.test.ts` reads each. What only Claude and the command line see, such as `checkViewState`'s reasons, and what only the core's own tests see, such as `shippingProblems`, need none.
- 2026-10-25: **a brace's name says what it holds.** The matcher reads a brace named `n`, `m`, `number`, `total`, `position`, `first`, `last`, `amount`, `limit` or `rest` as a number, and one named in `NESTED_VALUES` as a message, so a template never names a brace that holds a name so; "defined by package "{first}"" and the `{owner}` of a route's connection point never matched, and are renamed.
- 2026-10-25: **every message the core gives a person is run.** Besides its run of commands, the core-messages test runs `test/core-refusals.ts`: commands alone on the sample, short runs, projects broken as files can be, and pictures past each of the cleaner's limits. A message the core adds needs a fixture there or in the run.
- 2026-10-25: **a reason a writer of the Export dialog gives** is read through the catalog's templates where it is shown, so the PDF writer's own reasons read in the language and a library's stay as written. A picture whose file gives no name is named "Picture" in the language read in.

## Consequences

- New UI text goes through `t()` or `useT()`. A test fails when any component file of the app, found by itself, writes visible text outside them, or when any file writes text into the page by hand; only the test harnesses and the benchmark's own page are left out.
- The catalog has a test that every Spanish entry has the same braces as its English key.
- The core's messages and the catalog's templates must change together. A test runs the core's labels and problems on fixtures through the templates, hand-written commands included, and fails on any with no Spanish entry but the one that stays English; another does the same for the local program's notices and refusals.
- The catalog has a test that its Spanish uses none of the words CONTEXT.md avoids for its terms.
- A third language is one more catalog.
