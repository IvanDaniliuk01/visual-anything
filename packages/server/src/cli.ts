/**
 * The command that starts the local program:
 *
 *   visual-anything [folder] [--port <n>] [--no-open] [--dev]
 *
 * It opens the project folder, serves the app on 127.0.0.1 and opens the browser on it.
 */
import { homedir } from 'node:os';
import open from 'open';
import { runCommand } from './command';
import { preferencesFolder } from './preferences';

process.exitCode = await runCommand(process.argv.slice(2), {
  cwd: process.cwd(),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  openBrowser: (url) => open(url),
  signals: process,
  preferences: preferencesFolder(process.platform, process.env, homedir()),
});
