/**
 * The MCP stdio entry point that Claude Code and Claude Desktop start:
 *
 *   visual-anything-mcp [folder] [--dev]
 *
 * It speaks MCP on stdin and stdout, so it writes nothing else there: every line of its own goes to
 * stderr. It attaches to the running local program of the project, starting it when needed, through
 * the Claude endpoint and the credential the program's record holds.
 */
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ProgramBridge } from './claude/bridge';
import { runtimeFolder } from './claude/discovery';
import { MCP_USAGE, createMcpServer, parseMcpCommandLine } from './claude/mcp';

const parsed = parseMcpCommandLine(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.message);
  console.error(MCP_USAGE);
  process.exit(2);
}
if (parsed.help) {
  console.error(MCP_USAGE);
  process.exit(0);
}

const program = new ProgramBridge({
  ...(parsed.folder === undefined ? {} : { folder: resolve(process.cwd(), parsed.folder) }),
  runtime: runtimeFolder(process.platform, process.env, homedir()),
  dev: parsed.dev,
});
const server = createMcpServer(program);
server.server.onclose = () => program.close();
await server.connect(new StdioServerTransport());
