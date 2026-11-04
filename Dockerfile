# Visual Anything in a container (ADR 0094): the single executable for Linux (ADR 0037), with git
# for the versions panel (ADR 0071) and the projects and preferences on the volume /data.
#
#   docker compose up            then open the address it prints, within two minutes
#
# The program listens on every interface of the container, so the port must be published on the
# host's 127.0.0.1 alone, at the same number: compose.yaml does both.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /repository
# The pnpm version pinned in package.json's packageManager field.
RUN npm install --global pnpm@12.15.0
COPY . .
# pnpm links PixiJS's agent skills into .claude/skills, which the image leaves out, so it starts empty.
RUN mkdir -p .claude/skills && pnpm install --frozen-lockfile
# Builds the app, then the executable from this image's Node.js.
RUN pnpm package

FROM debian:bookworm-slim
# Links the image to its repository on GHCR, and says what it is.
LABEL org.opencontainers.image.source=https://github.com/IvanDaniliuk01/visual-anything       org.opencontainers.image.description="Visual Anything: make any concept or system visual and explore it interactively."       org.opencontainers.image.licenses=MIT
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates git libstdc++6 tini \
  && rm -rf /var/lib/apt/lists/*
# Inside the container every repository under /data is the person's, whoever owns its files on the
# host, so git reads them all. The program reads git's system configuration and writes none.
RUN git config --system safe.directory '*'
RUN useradd --create-home --uid 1000 visual-anything \
  && mkdir -p /data/projects /data/preferences \
  && chown -R visual-anything:visual-anything /data
COPY --from=build /repository/dist-exe/visual-anything /usr/local/bin/visual-anything
# `visual-anything notices` prints the code the executable bundles, with its licenses.
COPY LICENSE /usr/share/doc/visual-anything/LICENSE

# The record that lets Claude attach lives under XDG_STATE_HOME, which any user can make in /tmp.
ENV VISUAL_ANYTHING_PROJECTS=/data/projects \
    VISUAL_ANYTHING_PREFERENCES=/data/preferences \
    VISUAL_ANYTHING_PORT=47700 \
    XDG_STATE_HOME=/tmp/visual-anything-state
USER visual-anything
WORKDIR /data
VOLUME /data
EXPOSE 47700
ENTRYPOINT ["tini", "--"]
# Starts at home, the Projects screen; a shell form so that the port can come from the environment.
CMD ["sh", "-c", "exec visual-anything --listen 0.0.0.0 --port \"$VISUAL_ANYTHING_PORT\" --no-open"]
