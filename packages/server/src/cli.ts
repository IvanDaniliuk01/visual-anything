/**
 * The command that starts the local program:
 *
 *   visual-anything [folder] [--port <n>] [--no-open] [--dev]
 *
 * It opens the project folder, serves the app on 127.0.0.1 and opens the browser on it.
 */
import open from 'open';
import { runCommand } from './command';

process.exitCode = await runCommand(process.argv.slice(2), {
  cwd: process.cwd(),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  openBrowser: (url) => open(url),
  signals: process,
});
