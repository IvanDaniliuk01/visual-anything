---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# Claude's changes can wait as a proposal, which the person accepts change by change

Every change Claude makes today applies at once, as one undoable action labelled Claude (ADR-0029). The person can take any of them back, but only after it is in the files, and perhaps already committed or pulled by someone else. Benchmark R48 asks for a way to review Claude's changes before they apply, as DrawSQL does, since AI content is often ungrounded. This ADR settles:
- what Claude proposes;
- where a proposal lives;
- how the person reviews it and applies it;
- its authorship and its undo.

It amends ADR-0029, ADR-0028 and ADR-0032 by the clarifications of this date.

## When Claude's changes wait

- **A preference, *Review Claude's changes*** (`reviewClaude`), the person's own (ADR-0032), set from the history panel. It is off by default, so direct application stays the default.
  - While it is on, every change Claude asks for joins a proposal instead of applying.
  - Claude's tools never read or change it. A tool's answer says only what became of the change.
- **Claude can ask for a proposal itself.** `run_commands` takes `propose: true`, which proposes that call's commands even while the preference is off. Nothing Claude sends can make a change apply while the preference is on.
- **What is proposed:** every command that changes the model, its definitions and packages, views, scenarios or tours, package code included. Code still needs the person's approval to run (ADR-0054).
- **What is never proposed:**
  - comments, which are Claude's own words, signed as Claude, and which the person reads anyway (ADR-0059). They apply to the project now, so a thread about something only the proposal holds is refused until the proposal is accepted;
  - guidance, and the layouts it asks the app for, which the app records as the person's (ADR-0029);
  - live values, which are never saved (ADR-0057);
  - imports from the command line, which are the person's (ADR-0049).

## One proposal, which grows

- **One proposal at a time for each project.** The first change Claude asks for opens it. Each further change, until the person decides, joins it, so that Claude can build on its own changes over several calls.
- **The proposal sits on the project as it is now.** The program keeps two projects:
  - the project now, which the person keeps editing as usual;
  - the proposed project: the project now with every change of Claude's.

  When the project changes, by the person, another tab or a reload from disk, the program rebases the proposal on it, before the apps hear of the change. It does this with the core's item merge (ADR 0072).
  - Claude's value wins in the proposed project, so that nothing Claude asked for is dropped.
  - Each change that touches what the person also changed is marked "changed by you too".
  - Where something the person did meets something Claude's change needs, the proposed project keeps it, and the proposal says so. An example: the person deleted an element that Claude's relation ends on. The proposal then brings the element back, marked as changed by the person too.
- **Claude's commands run through the core on the proposed project.**
  - Ids are made then, and kept if the change is accepted.
  - The core's rules hold in the proposed project, as they hold in any project.
  - A command the core refuses is refused, as it would be without a proposal.
- **Claude reads the proposed project** while the proposal is open. Its read tools say that they include changes not yet applied.

## Where it lives

- **Only in the local program's memory,** as live values do (ADR-0057). A proposal is never written to a project file, never put in the history, and never seen by git.
- **When it goes:** when the person accepts or refuses it, when Claude withdraws it, or when the program stops.
  - A reload from disk keeps it, rebased.
  - A program started with `--stop-when-idle` keeps running while a proposal waits, for at most an hour after the last change joined it. When it stops it drops the proposal, and its log says so.

## How the person reviews it

- **Every open app shows that Claude proposes changes,** with how many, and opens the review on the person's say:
  - the proposal drawn as a comparison between the project now and the project with the proposal accepted (ADR 0070), before, after or as a comparison;
  - the proposal's changes listed in the Changes tab, each with a tick, and `]` and `[` to go through them.
- **The changes are the comparison's,** as ADR 0070 groups them. Some examples:
  - an element added, with its places and the nesting relations that place it;
  - a relation, with its routes;
  - a definition;
  - a change to the view itself, such as its scope;
  - the move of a shape;
  - a scenario or a tour.
- **The ticks.**
  - Every change starts ticked, but those changed by the person too, which start unticked: the person's own edit stays unless they take Claude's.
  - **What a change needs:** the changes that add the ends of a relation, the change that adds an element's component, and the removals of the relations that end on a removed element.
  - Ticking a change ticks what it needs. Unticking one unticks what needs it. The list says so each time.
- **Accept, Accept the ticked changes, or Refuse.** The first tab to decide decides for all of them. The others see the proposal close.

## Accepting

- **What it makes:** one action of Claude's in the history, whatever the person accepted, undone and redone in one step.
- **Its label.** It is labelled with Claude's own labels: the one change's label, or the first's and how many more. When only some are accepted, it says how many of how many, such as "Create “Payments” and 4 more (3 of 5 changes)".
- **Its author is Claude.** The change is Claude's work, even though the person chose to accept it. CLAUDE.md's rule that every command records its author holds.
- **The core works it out,** as it works out a command, and returns what `executeCommand` returns: the project, the operations, their inverses, the label, the warnings and the ids created.
  - It takes the ticked changes from the proposed project onto the project now, through `operationsBetween` (ADR 0070).
  - It checks the result as a command's result is checked: `checkProject`, images, and routes kept true (ADR-0039).
  - When a rule would break, it refuses the whole acceptance with the problems, and applies nothing.
- **Afterwards.** The program saves and announces the action as any other, and the proposal closes. An undo of the action does not bring the proposal back.
- **Refusing** changes nothing, and closes the proposal.

## What Claude hears

- **A write call while proposing answers at once.** The answer says that the change was proposed and not applied. It gives the proposal's id, its changes so far, the ids it would create, its warnings, and whether an app is open to review it, or that `open_app` opens one.
- **The call never waits for the person.** An MCP call that waited for a person would time out, and Claude could not go on building.
- **When the person decides,** the program tells Claude's entry point which changes were accepted. Claude's next read sees the project as it then is.
- **`read_proposal`** says whether a proposal waits, with its changes, or how the last one ended.
- **`withdraw_proposal`** closes Claude's own proposal.
- **Claude never accepts or refuses.** The endpoint refuses those messages, as it refuses undo (ADR-0029). Only the person decides, in the app, with the session token.

## Limits

- **One open proposal per project.**
- **At most 500 changes joined,** as many as the history keeps, and the history's weight budget, 64 Mi code units (ADR-0028), for the operations they hold. Past either, Claude's call is refused with `proposal-full`. The refusal says to ask the person to review the open proposal first.
- **Speed.** Rebasing after an action adds at most 20 ms to that action at 10,000 elements. The program touches only the items the action's operations name.

## Considered options

- **Proposals as the default:** rejected. Direct application stays the default (R48). Most work with Claude is quick and is undone when wrong.
- **A call that waits until the person decides:** rejected. MCP clients time out, and Claude could not build on a change still waiting.
- **Each call its own proposal:** rejected. Claude's later calls name what earlier ones created, and many small proposals take longer to review than one with its changes listed.
- **Accepting Claude's calls one by one, rather than the changes they make:** rejected. Calls depend on one another, and a call's label does not show the person what it changes. Changes read like a comparison.
- **Applying accepted changes by running Claude's commands again:** rejected. On a project that changed meanwhile, a command can land elsewhere, or make new ids. Taking the changes as proposed applies exactly what the person saw.
- **Proposal files in the project, or a branch per proposal:** rejected. A change still waiting would travel through git, and a cloned repository could then carry one that a person accepts as Claude's. A branch would also write to the repository, which ADR 0071 never does.
- **Apply, then let the person undo:** that is today. It puts unreviewed changes into the files, and into whatever reads them.

## Consequences

- The core gains `versions/proposals.ts`, test-first:
  - `propose`;
  - `rebaseProposal`;
  - `proposalChanges`, with what each needs;
  - `acceptProposal`.

  Its property tests: accepting every change gives the proposed project; accepting none changes nothing; any choice closed under what its changes need gives a project that keeps every rule; and undoing the accepted action gives back the project before it.
- **Protocol 7** carries the proposal to the apps, and their decisions back, as the spec's M11b tasks list.
- The Claude endpoint:
  - takes `propose` on `command`, and the message `proposal/withdraw`;
  - answers a proposed command with `proposal/made`;
  - sends Claude the proposal's changes and how it ended.
- The app gains the review, and the preference's toggle in the history panel.
- CONTEXT.md gains **Proposal**, and **Preference** names the new one.

## Clarifications

<!-- Decided by Claude on 2026-10-29 under the user's standing delegation of design decisions. -->
- 2026-10-29 (M11b's third seam): proposals in the core, as built (`core/src/versions/proposals.ts`).
  - **What a proposal holds:** its id; the project when it opened, which tells what the person changed since; the project now it sits on; the proposed project; the labels of Claude's commands; the ids they made; and what their operations weigh. A command that changes nothing opens no proposal and joins none.
  - **What is never proposed** is refused by `propose`, whatever the preference says: comments, signed as Claude, which go to the project now as before; and `resolve-conflicts`, since a file's conflicts are no item a comparison lists, so that a proposal could not show their resolution. Claude resolves conflicts with the review off; the person always can.
  - **A change's key** is its item's key and what happened to it, as `element:<id> added`. Two changes of one item, such as a shape's move and its resize, need each other, since accepting takes items whole.
  - **What a change needs**, worked out from the ids each item names in either project, free text left out:
    - the change that adds or redefines what it names: a relation's ends or type, an element's component, the view a scenario plays over;
    - for a removal, the changes of what named what it removes, such as the removals of the relations that end on a removed element;
    - for a definition changed, the changes of what named it or what derives from it, such as the removal of a relation whose type, or whose type's parent, now nests;
    - for a nesting relation added, or made to nest by its type, the removals of nesting relations on a path back that would close a cycle with it;
    - for a package added or removed, the project's change of its list of packages, and the other way round.

    An acceptance whose changes lack what they need is refused, naming the change and what it needs. The app ticks what is needed, so it never sends one.
  - **Rebasing** merges each file the person's operations reached, by the item merge with Claude's side kept and winning (ADR 0072's `keptWins`); a file one side alone changed is that side's. Claude's removal stays over the person's change, and takes the person's relations that end on what Claude removed, as `delete` takes them; those changes start unticked, marked changed by you too. What the person removed that Claude's change needs comes back. The model merges with the relation types that nest in the rebased packages. A cycle the person closed by changing a definition, rather than by adding a relation, stays in the proposed project, and accepting the change that closes it is refused with the core's error; nothing of Claude's is dropped to break it.
  - **Changed by you too** is any change one of whose items differs between the project when the proposal opened and the project now.
  - **Accepting** takes, for the chosen changes, each item as the proposed project holds it, and every other as the project now holds it. Lists keep the project's order, with what comes from the proposal after what precedes it there; the model's order is the proposal's when its change is chosen; a stacking list holds the elements the result has. Accepting every change gives the proposed project exactly, and none changes nothing. The operations between the project now and the result run as one action of Claude's through `executeOperations`, checked as a command is: routes kept true, the images shown, and no error `checkProject` finds that the project did not have. A file's conflicts stay as the project now holds them.
  - **The label** is Claude's one label, or the first's "and N more"; a partial acceptance adds "(k of m changes)".
  - **The protocol stays 7.** No build of 7 shipped, as with M8b and M11c. Its messages are in `core/src/versions/messages.ts`: `versions/list`, `versions/listed`, `version/compare`, `version/compared`, `version/refused`, `proposal/shown`, `proposal/accept`, `proposal/refuse`, `proposal/closed`, and the guidance `comparison`, which also takes `show`: before, after or the comparison. A version is named as `{ kind: 'opened' }` or `{ kind: 'commit', commit }`, the commit a listed id of 40 or 64 lower-case hexadecimal digits. `version/compared` carries the version's project for an app, and leaves it out for Claude (ADR-0029). `proposal/shown` carries the operations from the project now to the proposed one, each change with its key, what it needs and whether the person changed it too, and the names the changes mention.
  - **Time.** The changes are read through two comparisons (ADR 0070); the rebase merges only the files an action reached, and a file one side did not change costs no merge. The benchmark task measures them at 10,000 elements.

<!-- Decided by Claude on 2026-10-29 under the user's standing delegation of design decisions; the two security points by the main session's review of the task. -->
- 2026-10-29 (M11b, proposals in the program): the session's proposal, as built (`server/src/proposals.ts`, the hooks in `session.ts` and `claude/endpoint.ts`, `claude/bridge.ts`, `claude/proposal-tools.ts`).
  - **Which of Claude's commands join it.** Every command of Claude's joins the proposal while the person reviews Claude's changes, when the command carries `propose`, and also while a proposal waits with neither: Claude's later commands build on what it proposed, and name ids only the proposed project holds. Comments, alone or in a batch of comments only, go to the project now in every case; a batch that mixes them with other commands is proposed, and `propose` refuses it. A comment's refusal while a proposal waits adds, for Claude, that what only the proposal holds takes a thread once the person accepts it.
  - **No conflict resolution bypasses review.** `resolve-conflicts`, alone or in a batch, runs on the project now only while the review is off, no proposal waits and the command does not carry `propose`. Otherwise it goes to `propose`, which refuses it with the core's message, so that Claude never resolves conflicts in the files while the person reviews its changes.
  - **An acceptance names the revision the person saw.** `proposal/shown` carries `revision`, a whole number the session raises each time it shows the proposal anew: after each command of Claude's that joins it, and after each rebase, on the person's actions, undo and redo, and reloads. It goes on counting from one proposal to the next. An app or Claude that attaches is shown the proposal at the revision last shown. `proposal/accept` must name a revision, a whole number of 0 or more, or the protocol refuses it; the session refuses an acceptance, of all changes or of some, whose revision is not the one last shown, with "The proposal changed since it was shown: review it again.", changes nothing, and shows that app the proposal again. So nothing Claude proposed after the app last drew it is accepted unseen. Refusing needs no revision. The protocol stays 7.
  - **The order of what every app and Claude hear.** After a change of the project now, by the person, Claude's comment, an undo, a redo, an acceptance or a reload, the proposal is rebased before anyone hears of the change; then `project/changed` or `project/reloaded`, then `proposal/shown`. A command that joins the proposal is shown to everyone before Claude's endpoint answers it with `proposal/made`. An acceptance announces Claude's action, then `proposal/closed`, which carries the request id only to the app that decided; a refused acceptance answers that app with `command/rejected`, and the proposal waits on. An acceptance whose result does not differ from the project now closes it as accepted and records nothing.
  - **Refusals of a decision.** A decision about no proposal, or about one that no longer waits, is refused, and so is Claude's `proposal/withdraw` when none waits. A rebase that fails, or a proposal that cannot be shown, drops it, as `dropped`, and the program's error output says why.
  - **The proposed copy for Claude's reads.** The entry point keeps the proposed project as the project now with the operations last shown. After a change of the project now while a proposal waits, a read waits, for at most 10 seconds, for the proposal shown rebased on it, and otherwise asks Claude to read again; a copy that drifts attaches again, as the project's copy does. Every read tool's answer then carries `proposed`, a sentence that it includes the proposal's changes not yet applied.
  - **What the tools answer.** A write tool's answer to a proposed change gives `proposed` (its label), `applied: false`, the proposal's id, a note that it was proposed and not applied, the keys of its changes so far, at most 50, with `moreChanges` past them, and whether an app is open to review it, or that `open_app` opens one; never `done` or `undo`. `read_proposal` lists the waiting proposal's labels and up to 500 changes, each with its key, status, the name of what it is about, the paths that differ, what it needs and whether the person changed it too; or, with none waiting, how the last one ended since the entry point attached, with the keys accepted. `withdraw_proposal` answers the proposal withdrawn.
  - **`--stop-when-idle`.** The idle delay counts as before. When it runs out while a proposal waits, the program waits on until an hour after the last change joined the proposal, then stops, and says that Claude's proposal waited an hour. Stopping drops a waiting proposal: the program's output says how many changes it held and that nothing of it was applied, every app and Claude hear `proposal/closed` with `dropped`, and the program's log gains the event.
  - **The program's log** gains the event `proposal`, with `kind` opened, joined, accepted, refused, withdrawn or dropped, and how many changes it held or were accepted; a refused decision is logged as a refusal of the request `proposal`, by its problems' codes only.
