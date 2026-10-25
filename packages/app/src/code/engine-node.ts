/**
 * QuickJS for Node: the build of quickjs-emscripten whose WebAssembly is inside its JavaScript, for
 * Claude's tools and the tests. Each call makes a module of its own, with its own memory.
 */
import variant from '@jitl/quickjs-singlefile-mjs-release-sync';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';

export function loadNodeEngine(): Promise<QuickJSWASMModule> {
  return newQuickJSWASMModuleFromVariant(variant);
}
