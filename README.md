# Visual Anything

Make any concept or system visual and explore it interactively. Private, work in progress toward v0.1.

- Domain language: [CONTEXT.md](CONTEXT.md)
- Decisions: [docs/adr/](docs/adr/)
- v0.1 scope, milestones and tasks: [docs/spec-v0.1.md](docs/spec-v0.1.md)
- Building it with Claude Code: [docs/playbook.md](docs/playbook.md), with the agent rules in [CLAUDE.md](CLAUDE.md)

## Opening a project

Run `pnpm dev` (or `pnpm start`) at the repository root. Visual Anything opens your browser on the sample project at an address that works once, within two minutes. In the terminal where it runs, press `o` to open another tab, or `a` to print another such address; with `--no-open` it prints one at start. The session token never appears on screen or in an address: the tab gets it when it opens and keeps it for reloads.

## Claude through MCP

Claude works on the project Visual Anything has open through an MCP server that Claude Code or Claude Desktop starts. It attaches to the Visual Anything running on the project, and starts one in the background when none runs, which stops by itself once nothing has been connected to it for a minute. Every change Claude makes is one action in your undo history, labelled Claude, and you undo it in the app like your own. Claude's guidance (highlights, focus, moves of the canvas and captions) shows while the app is open; ask Claude to open it.

The server is `packages/server/src/mcp-cli.ts`, run with the `tsx` that `pnpm install` puts in the repository. Below, replace `<repo>` with the absolute path of this repository and `<project>` with the absolute path of a project folder, such as `<repo>/examples/my-systems`. Leave the project out to attach to whichever single Visual Anything is running. A program Claude starts serves the built app, so run `pnpm build` once first, or add `--dev` after the project to serve it from its sources.

**Claude Code**, from any folder:

```sh
claude mcp add visual-anything -- node <repo>/node_modules/tsx/dist/cli.mjs <repo>/packages/server/src/mcp-cli.ts <project>
```

Add `--scope user` after `add` to have it in every folder. `claude mcp list` shows whether it connects.

**Claude Desktop**: open Settings, then Developer, then Edit Config, and add the server to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "visual-anything": {
      "command": "node",
      "args": [
        "<repo>/node_modules/tsx/dist/cli.mjs",
        "<repo>/packages/server/src/mcp-cli.ts",
        "<project>"
      ]
    }
  }
}
```

On Windows, write the paths with forward slashes, as in `C:/Users/you/visual-anything`, or with doubled backslashes in the JSON. Restart Claude Desktop afterwards.

Then ask Claude, for example: "Build a view of my booking system from this description", "Walk me through the System overview", or "Which services write to the Appointments DB?".

How it stays safe: the server reaches Visual Anything only on 127.0.0.1, through an endpoint and a credential of its own that accept only what Claude may send (commands, guidance and opening the app; never undo, redo or your preferences). The credential sits in a record only your account can read, in `%LOCALAPPDATA%\Visual Anything\run` on Windows, `~/Library/Application Support/Visual Anything/run` on macOS, and `$XDG_RUNTIME_DIR/visual-anything` or `~/.local/state/visual-anything/run` elsewhere. Text in a project is passed to Claude as data, never as instructions.

Scenarios, images and exploring work through Claude too:

- **Scenarios.** Describe an example or paste a log, and Claude maps each line to the relations of your model, asks about the lines that match nothing, and creates the scenario as one action you can undo; it edits steps, repairs broken ones, and plays a scenario in the open app, going from step to step while it explains. Playing changes nothing, and you can pause or close it in the scenario panel at any time.
- **Images.** Claude adds SVG or small PNG, JPEG and WebP pictures to your project's own packages by passing their content itself: Visual Anything never fetches a URL. Every picture is cleaned before it is stored, and Claude tells you what cleaning removed. It shows a picture on a component or an element through its appearance, like any other trait.
- **Filters and focus.** Claude can filter the open view or turn focus mode on, as if you had: you see them in the toolbar's strip and end them there with Show everything or End focus. Nothing is written to the view file.

Try, for example: "Turn this log into a scenario and play it", "Give the Calendar component this SVG icon", or "Show me only the services and what they write to".
