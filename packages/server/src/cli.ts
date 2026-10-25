/**
 * The command that starts the local program, and the entry point of the single executable:
 *
 *   visual-anything [folder] [--port <n>] [--no-open] [--dev] [--stop-when-idle]
 *   visual-anything mcp [folder] [--dev]
 *
 * It opens the project folder, serves the app on 127.0.0.1 and opens the browser on it; `mcp` runs
 * Claude's MCP entry point instead. It awaits nothing at the top level, so that it bundles into the
 * CommonJS script the executable runs.
 */
import { main } from './main';

main(process.argv.slice(2));
