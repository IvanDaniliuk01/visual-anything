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
