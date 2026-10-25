/**
 * QuickJS for the browser's code worker: the build of quickjs-emscripten whose WebAssembly is inside
 * its JavaScript, so that the worker, which may fetch nothing, never fetches a file for it. Each call
 * makes a module of its own, with its own memory.
 */
import variant from '@jitl/quickjs-singlefile-browser-release-sync';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';

export function loadBrowserEngine(): Promise<QuickJSWASMModule> {
  return newQuickJSWASMModuleFromVariant(variant);
}
