---
status: accepted
---

<!-- From GitHub issue #14, four problems Claude met with run_commands while modeling a real project with 0.1.2. Decided by the main session, as the user delegated. -->

# Every command refuses what it does not take, from one table of shapes

Claude writes commands by hand through `run_commands`, and nothing told it when it wrote one wrong. `update-view` with `changes.scope` answered done, applied the rest and dropped the scope; `delete` with `ids` said only that nothing was given; `update-free-shape` with partial changes answered in the JavaScript engine's words ("Cannot read properties of undefined"); and the shape of a command could not be looked up.

## Decision

- **One table, `COMMAND_SHAPES` in `core/src/commands/shapes.ts`, holds the shape of every command type:** each field with its type as Claude reads it, whether it is needed, the kind of JSON value it holds, the kind of a list's items, whether it takes `null`, a one-line meaning, the keys of the objects it holds whose keys the core reads as a fixed set (every `changes`, and the new element, relation, package, view, scenario, tour, thread and comment), an example of the whole command, and hints for keys that belong to another command.
- **The TypeScript types keep the table true.** Its type is built from `Command`: every field of every command, and no other, must be in it; `required`, `nullable`, `kind` and a list's `items` are computed from the field's type and must agree. An example must be a command of its type. A command whose types change fails to compile until its shape says so too.
- **The core checks every command against its shape before running it,** a batch's commands each in turn, and refuses with every problem it finds, naming them: a key the command does not take, with the keys it takes there and, when known, where the key goes ("A view's scope is set with set-scope.", `"name" goes in "changes"`); a field it needs; a value of the wrong kind (`update-view takes "changes.name" as text, not 5.`). A key whose value is `undefined` counts as left out, as JSON leaves it. Nothing in the project changes. Objects the core reads as a whole, such as an appearance, a free shape, a scope or a package's file, are checked where they are read, as before.
- **Callers that send a key a command does not take are fixed, never the check loosened.**
- **`update-free-shape` takes partial changes:** `{ view, id, changes }`, merged over the shape stored, `null` taking a color or a picture's name out; a part its kind does not have is refused, naming those it has. The whole `shape`, as the app sends it, stays.
- **Claude's `describe_command`** (read-only) answers a command's fields, which are needed, what each means, the keys of its fixed objects, and its example, from the same table; without a type, the list of commands. `run_commands` names it.
- **No command answers in the engine's words.** A property test sends random JSON, shaped by the table, for every command type, and checks that each is done or refused in the core's words. The core still turns a `TypeError` into a refusal, as a last safety net; nothing reaches it today, so the Spanish catalog no longer keeps an English exception for it.

## Considered options

- **The JSON Schema the schema package can generate, for the `Command` type:** rejected. The commands' types live in `core`, which exports source and has no build step; the generator runs at build time over `files.ts`, and its output would need committing and reading back at run time. It gives no hints for misplaced keys, and its descriptions would come from doc comments written for programmers. The table is checked by the compiler as strictly, runs in the core with no I/O, and serves the check and `describe_command` alike.
- **Ignoring unknown keys, or only warning:** rejected. A silent drop is how Claude came to believe a view had a scope it did not have.
- **Checking only Claude's commands, in the server:** rejected. The app's and the imports' commands are commands too, and one check in one place keeps them all honest.
