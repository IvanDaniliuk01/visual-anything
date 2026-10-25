/**
 * The MCP stdio entry point that Claude Code and Claude Desktop start, run from the repository:
 *
 *   visual-anything-mcp [folder] [--dev]
 *
 * It is `visual-anything mcp`, under the name the repository's MCP setups use. It speaks MCP on stdin
 * and stdout, so it writes nothing else there: every line of its own goes to stderr. It attaches to
 * the running local program of the project, starting it when needed, through the Claude endpoint and
 * the credential the program's record holds.
 */
import { runMcp } from './main';

void runMcp(process.argv.slice(2)).then((code) => {
  if (code !== undefined) process.exitCode = code;
});
