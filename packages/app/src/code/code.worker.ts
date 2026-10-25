/**
 * The code worker (ADR 0054): package code runs here, in QuickJS inside WebAssembly, off the main
 * thread. The local program serves this script under the worker policy, which lets it make no
 * connection, so the interpreter's WebAssembly is inside the script and nothing is fetched.
 */
import { loadBrowserEngine } from './engine';
import type { CodeReply, CodeRequest } from './messages';
import { CodeRunner } from './runner';
import { CodeSandbox } from './sandbox';

/** What this file needs of its worker scope, which the DOM types do not describe. */
interface CodeWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<CodeRequest>) => void): void;
  postMessage(message: CodeReply): void;
}

const scope = self as unknown as CodeWorkerScope;

const runner = new CodeRunner({
  newSandbox: async () => new CodeSandbox(await loadBrowserEngine()),
  post: (reply) => scope.postMessage(reply),
});

scope.addEventListener('message', (event) => runner.receive(event.data));
