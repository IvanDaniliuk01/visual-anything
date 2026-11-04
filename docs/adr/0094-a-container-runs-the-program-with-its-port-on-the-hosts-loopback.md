---
status: accepted
---

<!-- Asked by the user on 2026-11-04: a Docker image of the project, "con su propia data", where the projects live. They chose a container used from this computer alone, and the image's recipe kept in the repository, built by whoever runs it. Decided by Claude under the user's standing delegation of design decisions. -->

# A container runs the program, with its port on the host's loopback

Some people would rather run Visual Anything in Docker than download an executable: it keeps the program and its files in one place they already manage, and it runs the same on every system. Until now the program listened on 127.0.0.1 only (CLAUDE.md's rules, ADR 0030). Inside a container, 127.0.0.1 is the container's own loopback, which no browser on the host can reach.

## Decision

### 1. The program may listen on every interface of a container

- **`--listen <address>`** takes `127.0.0.1`, the default, or `0.0.0.0`, and no other address. The image passes `--listen 0.0.0.0`, and nothing else should. The program then says it listens on every interface of the container and that the port must be published on the host's 127.0.0.1 only.
- **The checks do not change.** A request's Host must still be `127.0.0.1:<port>` or `localhost:<port>`, its Origin the app's own, and the live connection must still present the session token, which only a launch address gives (ADR 0030). A request that names the container's or the host's network address is refused with 403. That is also why the port is published at the same number on both sides.
- **Publishing is the boundary.** `compose.yaml` publishes the port as `127.0.0.1:47700:47700`, so the host's other interfaces never forward to it. Publishing it on `0.0.0.0`, or reaching it from another machine, is not supported. Several people on one model would need accounts, TLS and a way to share one history (ADR 0016), and that is a different product.

### 2. The image

- **The single executable for Linux** (ADR 0037), built inside the image by `pnpm package` from the repository, runs on `debian:bookworm-slim` with `git`, for the versions panel (ADR 0071), and `tini`, which forwards Ctrl+C and `docker stop` to it. It runs as a user without privileges.
- **The data is the volume `/data`.** `VISUAL_ANYTHING_PROJECTS` makes `/data/projects` the projects folder (ADR 0093) and `VISUAL_ANYTHING_PREFERENCES` puts the preferences in `/data/preferences` (ADR 0032). Both are outside every project, as before. `compose.yaml` mounts the folder `./data`, or `VISUAL_ANYTHING_DATA`, so that the person sees their projects and can keep them in git.
- **The program starts at home** with `--no-open`: it prints an address that works once, within two minutes. Another one, for a new tab, comes from pressing `a` in its terminal: `docker attach visual-anything`, then Ctrl+P Ctrl+Q to leave it running.
- **Git reads every repository under `/data`.** The image's system configuration says `safe.directory=*`. Files on a mounted folder often belong to another user id inside the container, and git would otherwise refuse to read them. The program still writes no git configuration, and nothing in the image runs what a repository holds.
- **The record that lets Claude attach** (ADR 0029) lives under `XDG_STATE_HOME=/tmp/visual-anything-state`, which any user id can make. Claude starts `docker exec -i visual-anything visual-anything mcp`, which runs in the same container as the same user and finds it there.

### 3. Where the image comes from

The recipe lives in the repository: `Dockerfile`, `.dockerignore` and `compose.yaml`. `docker compose up` builds the image on the person's own computer. Nothing is published to a registry. Publishing to GHCR, by hand or by a workflow, is outward-facing, and it waits for the user's go-ahead.

**Clarification of 2026-11-04:** the user published it to GHCR by hand, as `ghcr.io/ivandaniliuk01/visual-anything`. It is built from a commit, `git archive <commit> | docker build --provenance=false --sbom=false -`, so that nothing uncommitted gets into it, and GHCR refused the attestation index Docker Desktop adds otherwise. It is tagged `latest` and `sha-<commit>`, and with a version once one is released from that commit. `compose.yaml` names that image: it pulls it, and builds from the repository only when it cannot.

**Clarification of 2026-11-04 (issue #6):** the image published by hand carried only `latest`. Publishing builds from a commit with `--build-arg REVISION=<commit> --build-arg VERSION=<version or unreleased>`, which become the `org.opencontainers.image.revision` and `version` labels, and pushes `sha-<commit>` beside `latest`, and `v<version>` for a release. A workflow that publishes on a tag would spend CI minutes the project does not use, so publishing stays by hand.

**Clarification of 2026-11-04 (issue #7):** the account the container runs as comes from `VISUAL_ANYTHING_UID` and `VISUAL_ANYTHING_GID`, 1000 when left out. They were `UID` and `GID`, but bash keeps `UID` read-only, so `UID=$(id -u) docker compose up` failed before compose saw it.

## Considered options

- **Host networking** (`network_mode: host`), keeping 127.0.0.1: rejected. Docker Desktop on Windows and macOS does not share the host's loopback that way.
- **Running from the sources with Node and tsx:** rejected. The image would carry every development dependency, and the executable is what people already run.
- **A subcommand that asks the running program for a new address:** deferred. At home there is no record to attach to, so it would need a new channel into the program. Pressing `a` through `docker attach` already works.

## Consequences

- CLAUDE.md's rule reads: the server binds to 127.0.0.1 only, or, inside a container, to every interface of the container, its port published on the host's 127.0.0.1 alone.
- A new tab needs `docker attach`. If people find that awkward, the deferred subcommand comes back.
- The image's Node.js is the build stage's, 24, as the release executables use.

## Clarification of 2026-11-04 (ADR 0099)

- The deferred subcommand came back: `docker exec visual-anything visual-anything address` prints a new address, with no `docker attach`. The program at home now leaves a record that it reaches.
- The image sets `VISUAL_ANYTHING_SESSIONS=/data/preferences/sessions`, so the session is kept on the volume. After `docker restart`, or a new container on the same data, the open tab reconnects by itself and the project it showed opens again.
- `open_app` from Claude brings a connected tab forward rather than opening a new one. With none connected, since the container cannot open the host's browser, it answers a launch address for Claude to pass on.
