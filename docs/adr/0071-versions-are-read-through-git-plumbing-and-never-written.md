---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# Versions are read through git's plumbing, with the person's own git, and never written

A comparison needs the project as a commit holds it (ADR 0070). The project's repository may be a clone of someone else's work, and git itself can be made to run programs:
- `core.fsmonitor`;
- external diff drivers and textconv filters;
- pagers and credential helpers;
- the fetches a partial clone makes when it lacks an object.

Benchmark R47 asks for git's plumbing, read-only. This ADR settles:
- which git runs, and how;
- with what limits;
- where its arguments come from;
- what is never done.

The rule throughout: git runs with arguments, never through a shell, and never on a path or a ref that a project file or a page gave.

## Which git

- **The person's own git, 2.36 or later.** `VISUAL_ANYTHING_GIT` may name its absolute path, for tests and portable installs. A relative one is ignored, with a warning.
- **Otherwise the program finds git on PATH itself,** once, when a version is first asked for:
  - it takes only absolute PATH entries;
  - it skips any entry inside the project folder, its repository, or the folder the program was started in;
  - it takes `git.exe` on Windows, never a `.bat` or `.cmd`, which would run through `cmd.exe`, and `git` elsewhere;
  - the file must be a regular file once links are resolved.

  It then always starts git by that absolute path, so that no lookup can find a `git` that a repository placed in its folder. Windows looks in the current folder before PATH; this rule is why that cannot happen.
- **Without git, or with an older one,** comparing with a commit says what is needed, and comparing with the version as opened still works.
- **Partial clones.** A repository that lacks objects needs git 2.44 or later, whose `--no-lazy-fetch` keeps a read from fetching. With an older git the program says so.

## How it runs

- **`spawn` with an argument list:** `shell: false`, `windowsHide: true`, in the project folder's real path. Never `exec`, never a command line in one string.
- **Only these subcommands,** which read:
  - `version`;
  - `rev-parse`;
  - `for-each-ref`;
  - `log`;
  - `ls-tree`;
  - `cat-file`;
  - `config --get` and `config --get-regexp`.

  The runner refuses any other, and its tests check every call the program makes.
- **Every call starts with the same options:**
  - `--no-pager`;
  - `--no-optional-locks`, so that no read writes the index;
  - `--no-replace-objects`, so that a commit reads as it was recorded;
  - `--literal-pathspecs`;
  - `--no-lazy-fetch`, where git has it;
  - `-c core.fsmonitor=false`;
  - `-c protocol.allow=never`, so that no transport runs, ssh included;
  - `-c gc.auto=0` and `-c maintenance.auto=false`;
  - `-c credential.helper=`.

  Hooks need nothing, since none of these commands calls one.
- **`--end-of-options` goes before every ref,** and `--` before every path.
- **A cleaned environment.** Git gets `PATH`, the home and profile folders, the temporary folder and, on Windows, `SystemRoot` and `windir`, so that it reads the person's own configuration, `safe.directory` included. It also gets:
  - `LC_ALL=C`, so that its messages parse;
  - `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0` and `GIT_NO_LAZY_FETCH=1`.

  It gets no other variable. Every `GIT_*` the program inherited is dropped, `GIT_DIR`, `GIT_WORK_TREE`, `GIT_CONFIG_PARAMETERS` and `GIT_EXTERNAL_DIFF` among them, so that git finds the repository from the project folder alone, and no configuration reaches it from the program's environment.
- **Output is read strictly.** Each call uses `-z` where git offers it. Object ids must be 40 or 64 hexadecimal digits, as the repository's object format says.

## What it runs

1. **The repository.** `rev-parse --show-toplevel --show-prefix --show-object-format`, run in the project folder, gives the repository and the project folder's place in it.
   - A folder outside any repository has no commits to compare with.
   - A repository git does not trust, because another account owns it, is refused with git's reason. The program never adds a `safe.directory`.
2. **The versions it lists:**
   - `HEAD`;
   - local branches, remote-tracking branches and tags, each newest first and at most 1,000 of each (`for-each-ref`, annotated tags peeled to their commit);
   - the last 200 commits on `HEAD` that touched the project folder (`log -z --format=… -n 200 -- <prefix>`).

   Each version has its commit id, a short id, its subject's first line, cut at 200 characters, its author's name and its time. The author's email is never read.
3. **Resolving a ref.** This is for the command line only, for a ref the person typed: `rev-parse --verify --quiet --end-of-options <ref>^{commit}`, after checking the text:
   - 1 to 255 characters;
   - no leading `-`;
   - no space, control character, `:`, `\` or `..`.
4. **The commit's tree.**
   - `ls-tree -z -l <commit> -- <prefix>` finds the project folder's tree; at the repository's top, it is the commit's own tree. A commit without it says so: the folder may have had another name then.
   - `ls-tree -z -l <tree>` then lists its entries, and lists again the trees of `packages/`, `views/`, `scenarios/`, `tours/` and `comments/`, by their tree ids, matched without case as the loader matches folders.
   - Only regular blobs, modes `100644` and `100755`, with a project file's extension are read. The kind folders must be trees.
   - A link (`120000`) or a submodule (`160000`) where a project file or a kind folder belongs is a problem of that file, and nothing it names is read. This is the rule of regular files (ADR-0030), applied to a tree.
5. **The files.** One `cat-file --batch` reads the blobs by id.
   - Each blob's size, from `ls-tree -l` and again from the batch's header, must be within its kind's cap before a byte of it is read.
   - The bytes become a version through the same checks as opening a folder: the loader's checks from bytes (`loadProjectFrom`), each file's schema, ids once each, the packages listed, and the core's `checkProject`. A version that does not open says why, file by file, and nothing of it shows.

## Limits

- **Each file within its kind's cap** (ADR-0030, and ADR 0059's 1 MiB per thread).
- **At most 50,000 project files and 256 MiB in all** for one version.
- **Time.** Each git call has 30 s, and reading a version has 120 s in all. Then the call is killed, and the request says it took too long.
- **Output.** Each listing is read up to 4 MiB, and errors up to 64 KiB.
- **One version is read at a time** for each program. A new request stops the one under way.
- **The app keeps two versions at most:** the version shown, and the version as opened, which the program keeps in memory anyway.

## Where arguments come from

- **Never from a project file or a message's text.**
  - Paths come from git's own answers: the prefix `rev-parse` gives, and the tree and blob ids `ls-tree` lists.
  - Branch and tag names, and commit subjects, from a cloned repository are shown as text. They are never passed back to git.
- **The app and Claude name a version only by what the program listed:** a commit id it listed in its latest listing, or the version as opened. The program refuses any other id before git hears of it.
- **The command line takes the ref the person typed,** checked and resolved to a commit id as in step 3. Only the id is used from then on.

## What is never done

- **Nothing is written to the repository.** No checkout, stash, worktree, fetch, gc, index refresh or note. A version lives only in the program's memory, as data. It is never written to the project folder or a temporary checkout.
  - The one exception is `visual-anything merge-driver --install` and `--uninstall` (ADR 0072). The person runs them, and they write git's configuration through `git config` with arguments.
- **Nothing outside the repository is read.** Git reads what it calls the repository:
  - its folder, object store and configuration, with a worktree's common folder and alternates among them;
  - the person's own configuration, with every key that would start a program or fetch turned off by the options above.

  The program reads only what git answers.
- **Nothing runs from the repository.** No hook runs, no filter or diff driver is asked for, and no transport runs. A repository's `.gitattributes` and configuration cannot change what these commands do.

## Considered options

- **A JavaScript git, such as isomorphic-git:** rejected. It starts no program, but it would be a second reader of repositories. It would read them differently from git: reftable, SHA-256 repositories, worktrees and partial clones, which git keeps adding to. It would also be a large dependency for what six read commands do.
- **`git show <commit>:<path>` for each file:** rejected. It takes a path where `cat-file --batch` takes object ids, and it starts one process per file.
- **A temporary checkout or worktree of the commit:** rejected. It writes to the repository and to the disk, and it would make the commit's files look like a project folder to the watcher.
- **Letting the app send any ref the person types:** rejected. A page's text would reach git's argument list. Listed ids cover the app, and the command line takes refs from the person's own terminal.
- **Ignoring the person's configuration entirely,** with `GIT_CONFIG_NOSYSTEM` and an empty global file: rejected. It would drop the `safe.directory` entries by which the person told git to trust a folder. The keys that start programs are turned off one by one instead.

## Consequences

- The server gains `versions/`: the git runner, the listing, reading a commit, and `loadProjectFrom(files)`, the loader's checks from bytes, split out of `project.ts` so that `loadProject` reads a folder through it.
- The security tests build hostile repositories. In each, a version is listed and read, and nothing runs, no network is reached, and nothing outside the repository is read:
  - a `core.fsmonitor` that writes a marker file;
  - `diff.external`, textconv and a pager set in its configuration;
  - a branch named `--output=x`;
  - links and a submodule named like project files;
  - a blob past its cap;
  - a partial clone missing a blob;
  - a `GIT_DIR` set in the program's environment.
- CLAUDE.md's security rules should gain the line "git runs only through the program's runner: an absolute path, arguments and never a shell, read commands only, on ids it listed". The main session makes that edit with the user's agreement.

## Clarifications

<!-- Decided by Claude on 2026-10-29 under the user's standing delegation of design decisions. -->
- 2026-10-29 (M11b's task "Versions in the program"): how the program reads versions, as built in `server/src/versions/`.
  - **Two more fixed options.** Every call also starts with `-c log.showSignature=false`, since a person's or a repository's `log.showSignature` makes `log` start gpg, and `-c log.mailmap=false`, since `mailmap.file` may name a file anywhere. The tests check the whole list on every call.
  - **The environment's home folders** are `HOME`, `USERPROFILE`, `HOMEDRIVE`, `HOMEPATH` and `XDG_CONFIG_HOME`, so that git finds the person's own configuration, `safe.directory` included, on every platform. The temporary folder is `TMPDIR`, `TMP` and `TEMP`. Windows' variables are read without case.
  - **Paths, from where git runs.** Git runs in the project folder and reads a path from there, so `log -- .` names the prefix `rev-parse` gave. `ls-tree` runs with `--full-tree`, which reads paths from the top and lists a tree, named by its id, whole. Without it, git would cut each listing down to the folder it runs in.
  - **Finding git.**
    - Before git has said where the repository is, its top is taken as the nearest folder at or above the project folder that holds `.git`, and PATH entries inside it are skipped. Once `rev-parse` has answered, a git inside that top is refused.
    - A `VISUAL_ANYTHING_GIT` the person set is taken as named, once it is a regular file that can be run. Quotes around a Windows PATH entry are dropped.
    - Git is found once for each program. If none is found, the program says so until it is started again.
  - **What a listing holds.**
    - HEAD is found with `rev-parse --verify --quiet`, so that a repository with no commits yet lists none and says so.
    - Symbolic refs, such as `origin/HEAD`, and refs that name no commit, such as a tag of a tree, are left out.
    - Each kind is sorted by `creatordate`, newest first. A version's time is its committer's time, the time that sorting reads.
    - Subjects, authors' names and refs' names are cut at 200, 200 and 1,000 characters, never inside a character, and their control characters become spaces.
  - **The latest listing is the program's,** whoever asked for it, an app or Claude: Claude's `comparison` guidance names a commit that Claude listed, and the app then asks for it. A listing that fails leaves no commit to name.
  - **One read at a time** holds for commits. A listing, and the version as opened, never stop a read. The version read last stays in memory, so that comparing with it again reads nothing: with the project as opened, the program keeps two versions at most. The 120 s apply to a listing too.
  - **What reads as a problem of a file.**
    - A blob a partial clone lacks, whose size `ls-tree` gives as `BAD` or which `cat-file` answers `missing`, says that it is not in the repository.
    - A blob with a mode other than `100644` and `100755` is not a regular file.
    - A tree with a project file's name is passed over, as a folder is on disk.
    - Two kind folders whose names differ only in case are a problem of the folder, since on Windows and macOS they would be one.
    - With a git older than 2.44, a repository with `extensions.partialClone` or a promisor remote is refused before any commit is read.
  - **Refusals keep the core's codes,** since protocol 7 fixed them:
    - `invalid-command` for a commit not in the latest listing;
    - `invalid-file` for each problem of a version's files, written `<file> <pointer>: <message>` as opening a folder writes them;
    - `unknown-view` for a view neither version has;
    - `program-failed` for git missing, failing, too slow or stopped.

    The messages are in English, and the app reads them through `es.ts`.
  - **One view.** `version/compare` with a view keeps the changes of that view's own items and of the elements and relations it draws in either version, with their counts and names (`comparisonOfView`). A view neither version has is refused. Without a view, the comparison is whole.
  - **When it is worked out.** Reading a version never waits behind the project's work. The comparison is worked out against the project as every app last heard of it, and sent in the same turn, so that an app follows each later action with `recompare`. The version as opened is the project as the program last opened or reloaded it.
