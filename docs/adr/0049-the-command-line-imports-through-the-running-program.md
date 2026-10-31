---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# The command line imports through the running program, as the person's action

`visual-anything import <folder> <file>` (ADR-0042) brings a file into a project as one undoable action. Only one program runs on a project, and it owns the project's files (ADR-0016, ADR-0044). So while one runs, the command line cannot write the files itself: the import has to go through that program. Its live connection takes only the tab's session token, which never leaves the program (ADR-0030). Its Claude endpoint takes the credential in the runtime folder's record, but runs every command with Claude as its author (ADR-0029). An import the person ran in a terminal is the person's action, and the history must say so (CLAUDE.md: every command records its author).

This supersedes one line of ADR-0029: the Claude endpoint accepted exactly three messages, `command`, `guidance` and `open-app`. It now accepts a fourth:

- **`import`:** a batch command whose label starts with `Import "`, as every import's batch is labelled. The program runs it with the person as its author.
  - It answers as it answers `command`: `project/changed` or `command/rejected`.
  - Any other command in it is refused as not well formed, whatever it is. So the message can bring in an import, and do nothing else.
- **Who sends it:** only the command line's import, through `ProgramBridge.importAsPerson`. Claude's tools never send it: `import_file` sends its batch as an ordinary `command`, which Claude authors.
- **Without a running program,** the command line opens the project itself, runs the import with the person as its author, saves, and closes. No message is involved.

## Considered options

- **The command line as Claude's action:** rejected. The history would say Claude did what the person did.
- **Refusing while a program runs**, and asking the person to stop it or to use the app: rejected. The spec asks for the import through the running program, and stopping the program closes the person's tabs.
- **A new endpoint for the command line,** with its own credential: rejected for now. It would add a second secret to the record for what one message does, with the same trust: any process that can read the runtime folder can already reach both endpoints.
- **Letting the message carry any command as the person's:** rejected. Limiting it to an import's batch keeps everything else the endpoint does labelled as Claude's.

## Consequences

- A process that can read the runtime folder's record can record an import as the person's. That process could already change the project's files directly, so this widens nothing that the folder's privacy does not already guard (ADR-0030).
- The Claude endpoint's refusal names the import too: "only commands, guidance, opening the app and imports from the command line".
- An import sent through the endpoint is at most 8 MiB, the endpoint's largest message. A larger one is refused before it is sent, and the command line says to stop the program and import again; the project is then opened by the command line itself.

## Clarifications

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25: **the message carries the file, never a command.** A batch whose label says it is an import may hold any command: one that deletes everything, labelled `Import "notes.csv"`, would run as the person's. So the `import` message now carries what an import is asked with: the file's name and its bytes in base64 (its text is read from them as UTF-8), and the person's `format`, `key`, `map`, `nesting` and `views`. Any other part, and a `command` in particular, is refused.
  - The program reads and maps the file itself, with `previewImport`, against the project as it is when the message comes, and runs the batch that makes with the person as its author. What runs as the person's is therefore only what an import of that content makes: views, elements and relations created or updated, scopes, positions and routes, and the built-in packages it starts using.
  - A file no reader reads, or a mapping that cannot be applied, is refused with the problems the program finds, and nothing changes.
  - The command line still prepares the import against the project the program sends it, to say what it will do and for `--dry-run`; what the program does is what it answers with.
  - The 8 MiB limit is now on the message with the file. Base64 makes it a third larger, so a file past about 6 MiB goes through the command line opening the project itself, as before.

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25 (W42): **"as it is when the message comes" means when its turn comes.** The program read and mapped the file as soon as the message came, while commands sent before it could still be waiting in the session's queue, and then queued the batch that made, which landed on a project those commands had changed. It now reads, maps and runs the import in one turn of the queue (`Session.executePlanned`), against the project the work asked for before it leaves, so that nothing comes between the plan and the change. The endpoint's refusal now names every message it accepts (ADR-0029's clarification of this date): "only commands, guidance, opening the app, asking which package code is approved, live values and imports from the command line".
  - This narrows what a process holding the endpoint's credential can do in the person's name, without changing who can hold that credential (ADR-0030).
- 2026-10-31 (M9, ADR 0075): **Claude's endpoint takes `solid/prepare`.** `visual-anything import` sends a solid's file through the running program in pieces of 1 MiB, so the endpoint's 8 MiB message limit does not cap solids. The `import` message gains the prepared solid's hash. Nothing else on the endpoint changes.
