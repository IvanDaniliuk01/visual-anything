/**
 * What runs in each package's context before its code (ADR 0054), as JavaScript text the interpreter
 * evaluates. It takes away making code from text, the clock unless `time` is granted, and keeps the
 * intrinsics it needs before the package's code can replace them. It gives back `run`, which calls one
 * hook with a frozen copy of its input and writes its answer as JSON, refusing what is not plain data.
 *
 * `run` answers a string of JSON, or a number saying why the answer is not plain data. Whatever it
 * answers, the app checks it again: this only spares copying what cannot be kept.
 */

/** Why `run` refused an answer, by the number it gives. */
export const REFUSED: Readonly<Record<number, (limit: number) => string>> = {
  1: () => 'it is not plain data',
  2: () => 'it nests deeper than 16 levels',
  3: (limit) => `it is over ${limit} characters as JSON`,
  4: () => 'it has the key "__proto__"',
};

/** How deep an answer may nest, as the core's checks allow. */
export const ANSWER_DEPTH = 16;

/**
 * A function expression of `(global, grantTime)`: it locks the context down and gives back
 * `run(hook, inputJson, limit, readModel)`.
 */
export const PRELUDE = String.raw`(function (global, grantTime) {
  'use strict';
  const parse = JSON.parse;
  const quote = JSON.stringify;
  const freeze = Object.freeze;
  const keysOf = Object.keys;
  const protoOf = Object.getPrototypeOf;
  const isArray = Array.isArray;
  const hasOwn = Object.prototype.hasOwnProperty;
  const defineProperty = Object.defineProperty;
  const construct = Reflect.construct;
  const objectProto = Object.prototype;
  const arrayProto = Array.prototype;
  const isFinite = Number.isFinite;
  const call = Function.prototype.call;
  const own = (value, key) => call.call(hasOwn, value, key);

  // No code made from text: neither eval nor any kind of Function constructor.
  const blocked = function Function() {
    throw new EvalError('Package code cannot make code from text.');
  };
  const kinds = [function () {}, function* () {}, async function () {}, async function* () {}];
  for (let i = 0; i < kinds.length; i += 1) {
    defineProperty(protoOf(kinds[i]), 'constructor', { value: blocked, writable: false, configurable: false });
  }
  blocked.prototype = protoOf(kinds[0]);
  defineProperty(global, 'Function', { value: blocked, writable: false, configurable: false });
  delete global.eval;

  // A console that keeps nothing, so that code written for a browser still runs.
  const nothing = function () {};
  defineProperty(global, 'console', {
    value: freeze({ log: nothing, info: nothing, warn: nothing, error: nothing, debug: nothing }),
    writable: false,
    configurable: false,
  });

  // The clock, only with the "time" capability: a date from given parts stays.
  if (!grantTime) {
    const RealDate = Date;
    const noClock = function () {
      throw new TypeError('Package code reads the clock only with the "time" capability.');
    };
    const NoClockDate = function Date() {
      if (new.target === undefined || arguments.length === 0) noClock();
      const parts = [];
      for (let i = 0; i < arguments.length; i += 1) parts[i] = arguments[i];
      return construct(RealDate, parts, new.target);
    };
    NoClockDate.prototype = RealDate.prototype;
    NoClockDate.UTC = RealDate.UTC;
    NoClockDate.parse = RealDate.parse;
    NoClockDate.now = noClock;
    defineProperty(RealDate.prototype, 'constructor', { value: NoClockDate });
    defineProperty(global, 'Date', { value: NoClockDate, writable: false, configurable: false });
  }

  function deepFreeze(value, depth) {
    if (typeof value !== 'object' || value === null || depth > 64) return value;
    const keys = keysOf(value);
    for (let i = 0; i < keys.length; i += 1) deepFreeze(value[keys[i]], depth + 1);
    return freeze(value);
  }

  // Writes a plain value as JSON into out.text; sets out.error and stops at the first thing it refuses.
  function write(value, depth, out) {
    if (out.error !== 0) return;
    const type = typeof value;
    if (type === 'string' || type === 'boolean') {
      out.text += quote(value);
    } else if (type === 'number') {
      if (!isFinite(value)) { out.error = 1; return; }
      out.text += quote(value);
    } else if (value === null) {
      out.text += 'null';
    } else if (type !== 'object') {
      out.error = 1;
      return;
    } else if (depth >= ${ANSWER_DEPTH}) {
      out.error = 2;
      return;
    } else if (isArray(value)) {
      if (protoOf(value) !== arrayProto) { out.error = 1; return; }
      const length = value.length;
      out.text += '[';
      for (let i = 0; i < length; i += 1) {
        if (i > 0) out.text += ',';
        if (!own(value, i)) { out.error = 1; return; }
        write(value[i], depth + 1, out);
        if (out.error !== 0) return;
        if (out.text.length > out.limit) { out.error = 3; return; }
      }
      out.text += ']';
    } else {
      const proto = protoOf(value);
      if (proto !== objectProto && proto !== null) { out.error = 1; return; }
      if (own(value, '__proto__')) { out.error = 4; return; }
      const keys = keysOf(value);
      out.text += '{';
      for (let i = 0; i < keys.length; i += 1) {
        if (i > 0) out.text += ',';
        out.text += quote(keys[i]) + ':';
        write(value[keys[i]], depth + 1, out);
        if (out.error !== 0) return;
        if (out.text.length > out.limit) { out.error = 3; return; }
      }
      out.text += '}';
    }
    if (out.text.length > out.limit) out.error = 3;
  }

  function modelOf(read) {
    const get = function (kind, arg) {
      return deepFreeze(parse(read(kind, typeof arg === 'string' ? arg : null)), 0);
    };
    return freeze({
      element: function (id) { return get('element', id); },
      relation: function (id) { return get('relation', id); },
      elements: function (component) { return get('elements', component); },
      relationsOn: function (id) { return get('relationsOn', id); },
    });
  }

  return function run(hook, inputJson, limit, readModel) {
    const input = parse(inputJson);
    const element = input[0];
    const context = input[1];
    if (readModel !== undefined) context.model = modelOf(readModel);
    deepFreeze(input, 0);
    const answer = hook(element, context);
    if (answer === undefined) return 'null';
    const out = { text: '', limit: limit, error: 0 };
    write(answer, 0, out);
    return out.error !== 0 ? out.error : out.text;
  };
})`;
