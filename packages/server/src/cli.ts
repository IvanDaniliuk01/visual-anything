/**
 * The command that starts the local program:
 *
 *   visual-anything [folder] [--port <n>] [--no-open] [--dev] [--stop-when-idle]
 *
 * It opens the project folder, serves the app on 127.0.0.1 and opens the browser on it.
 */
import { homedir } from 'node:os';
import open from 'open';
import { runtimeFolder } from './claude/discovery';
import { runCommand, type KeyInput } from './command';

/** The keys pressed in this terminal, read one at a time; absent when stdin is not a terminal. */
function terminalKeys(): KeyInput | undefined {
  const { stdin } = process;
  if (!stdin.isTTY) return undefined;
  return {
    listen: (onKey) => {
      const onData = (data: string) => {
        for (const key of data) onKey(key);
      };
      stdin.setRawMode(true);
      stdin.setEncoding('utf8');
      stdin.on('data', onData);
      stdin.resume();
      return () => {
        stdin.off('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
      };
    },
  };
}

const keys = terminalKeys();

process.exitCode = await runCommand(process.argv.slice(2), {
  cwd: process.cwd(),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  openBrowser: (url) => open(url),
  signals: process,
  ...(keys === undefined ? {} : { keys }),
  runtimeFolder: runtimeFolder(process.platform, process.env, homedir()),
});
