/**
 * What runs in each package's context before its code (ADR 0054), as JavaScript text the interpreter
 * evaluates. It takes away making code from text, the clock unless `time` is granted, and keeps the
 * intrinsics it needs before the package's code can replace them. It gives back `run`, which calls one
 * hook with a frozen copy of its input and writes its answer as JSON, refusing what is not plain data,
 * and `describe`, which says what a thrown value is.
 *
 * Everything that reads a value the package's code made, its answers and what it throws, runs here,
 * inside the call and under its deadline: a getter or a proxy that never ends is stopped like any
 * loop. The app reads back only strings and numbers, which run nothing, and checks what it reads again.
 *
 * `run` answers `A` and the answer's JSON, a number saying why the answer is not plain data, or `E`
 * and what `describe` says of what the hook threw. `describe` answers `N` for something that is not
 * an error, or `M` and the JSON of its name and message, read from data properties only.
 *
 * For `simulate` (ADR 0085), `run` is also given the run's seed and the tick: `context.random()` and
 * `Math.random()` draw from the generator of `TICK_RANDOM_SOURCE` for them, made afresh for each
 * call before the hook runs, so the code draws what the core's `tickRandom` draws. Its answer is
 * written as the JSON of `[answer, carried]`: a simulated value that is a number but not finite,
 * which JSON cannot hold, is written `null` there, and `carried` names it with `NaN`, `Infinity` or
 * `-Infinity`, so that the core's check stops the run at that value's limit rather than drop the
 * answer.
 */
import { TICK_RANDOM_SOURCE } from '@visual-anything/core';

/** What `describe` answers for a thrown value that is not an error, or that reads as one only through getters. */
export const NOT_AN_ERROR = 'it threw something that is not an error';

/** Why `run` refused an answer, by the number it gives. */
export const REFUSED: Readonly<Record<number, (limit: number, depth?: number) => string>> = {
  1: () => 'it is not plain data',
  2: (_limit, depth = ANSWER_DEPTH) => `it nests deeper than ${depth} levels`,
  3: (limit) => `it is over ${limit} characters as JSON`,
  4: () => 'it has the key "__proto__"',
};

/**
 * How deep an answer may nest, as the core's checks allow; `run` takes a deeper one for the hooks
 * whose answers the core lets nest deeper, such as the commands of `act` (ADR 0089).
 */
export const ANSWER_DEPTH = 16;

/**
 * A function expression of `(global, grantTime)`: it locks the context down and gives back
 * `[run(hook, inputJson, limit, readModel, readNetwork, seed, tick, deepest), describe(thrown)]`,
 * where `deepest` is how deep the answer may nest, {@link ANSWER_DEPTH} when left out. With `readNetwork`, for
 * `attributes` in a package granted an origin (ADR 0063), `context.fetched(url, { every })` gives
 * what the local program last fetched from that address, or undefined until it has, and asks for it
 * to be fetched every `every` seconds; `readNetwork` answers `A` and the answer's JSON, `R` and why
 * the address may not be fetched, or nothing.
 */
export const PRELUDE = String.raw`(function (global, grantTime) {
  'use strict';
  const parse = JSON.parse;
  const quote = JSON.stringify;
  const freeze = Object.freeze;
  const keysOf = Object.keys;
  const protoOf = Object.getPrototypeOf;
  const isArray = Array.isArray;
  const own = Object.hasOwn;
  const descriptorOf = Object.getOwnPropertyDescriptor;
  const defineProperty = Object.defineProperty;
  const construct = Reflect.construct;
  const objectProto = Object.prototype;
  const arrayProto = Array.prototype;
  const isFinite = Number.isFinite;
  const isError = Error.isError;
  const toText = String;
  const apply = Reflect.apply;
  const sliceText = String.prototype.slice;
  const MadeError = Error;
  const MadeTypeError = TypeError;

  // The chance of a simulation's tick (ADR 0085): the core's generator, on an imul of its own, so
  // that code replacing Math.imul changes nothing it draws. Math.random draws from the generator of
  // the tick under way in simulate, and as the engine draws in every other call.
  const makeRandom = (function (Math) {
    return ${TICK_RANDOM_SOURCE};
  })(freeze({ imul: Math.imul }));
  const engineRandom = Math.random;
  let drawing = engineRandom;
  const random = freeze(function random() {
    return drawing();
  });
  defineProperty(Math, 'random', { value: random, writable: false, configurable: false });

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
  // In a simulate answer (mode 1), its values (mode 2) may be numbers that are not finite: each is
  // written null, and named in out.carried with what it is.
  function write(value, depth, out, mode) {
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
    } else if (depth >= out.depth) {
      out.error = 2;
      return;
    } else if (isArray(value)) {
      if (protoOf(value) !== arrayProto) { out.error = 1; return; }
      const length = value.length;
      out.text += '[';
      for (let i = 0; i < length; i += 1) {
        if (i > 0) out.text += ',';
        if (!own(value, i)) { out.error = 1; return; }
        write(value[i], depth + 1, out, 0);
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
        const key = keys[i];
        out.text += quote(key) + ':';
        // Read once: a getter runs once, and what it gave is what is written.
        const child = value[key];
        const inside = mode === 1 && key === 'values' ? 2 : mode === 2 ? 3 : 0;
        if (inside === 3 && typeof child === 'number' && !isFinite(child)) {
          out.text += 'null';
          const what = child !== child ? 'NaN' : child > 0 ? 'Infinity' : '-Infinity';
          out.carried += (out.carried === '' ? '' : ',') + quote(key) + ',' + quote(what);
        } else {
          write(child, depth + 1, out, inside);
        }
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

  // What the local program fetched for the package (ADR 0063), read through the app.
  function fetchedOf(read) {
    return freeze(function fetched(url, options) {
      if (typeof url !== 'string') throw new MadeTypeError('context.fetched takes an address as text.');
      let every = 0;
      if (typeof options === 'object' && options !== null) {
        const given = options.every;
        if (typeof given === 'number') every = given;
      }
      const text = read(url, every);
      if (typeof text !== 'string' || text.length === 0) return undefined;
      const rest = apply(sliceText, text, [1]);
      if (text[0] === 'R') throw new MadeError(rest);
      return deepFreeze(parse(rest), 0);
    });
  }

  // The longest description of a thrown value.
  const LONGEST = 1000;

  // A text property of a thrown value, from its own data properties or its prototypes': undefined when
  // it has none, and null when one is a getter or a setter, which would run the code to read it.
  function textProperty(value, key) {
    let at = value;
    for (let depth = 0; depth < 8 && at !== null && typeof at === 'object'; depth += 1) {
      const descriptor = descriptorOf(at, key);
      if (descriptor !== undefined) {
        if (!own(descriptor, 'value')) return null;
        const found = descriptor.value;
        return typeof found === 'string' ? found : undefined;
      }
      at = protoOf(at);
    }
    return undefined;
  }

  function cut(text) {
    return text.length > LONGEST ? apply(sliceText, text, [0, LONGEST]) : text;
  }

  // What a thrown value is, read without running a getter: errors made by the engine or by
  // constructors only, never a proxy, which Error.isError tells apart without running its traps.
  function describe(thrown) {
    try {
      if (typeof thrown === 'string') return 'M' + quote('') + ',' + quote(cut(thrown));
      if (typeof thrown === 'number' || typeof thrown === 'boolean') {
        return 'M' + quote('') + ',' + quote(toText(thrown));
      }
      if (typeof thrown !== 'object' || thrown === null) return 'N';
      if (typeof isError === 'function' && !isError(thrown)) return 'N';
      const name = textProperty(thrown, 'name');
      const message = textProperty(thrown, 'message');
      if (name === null || message === null) return 'N';
      return 'M' + quote(cut(name === undefined ? '' : name)) + ',' + quote(cut(message === undefined ? '' : message));
    } catch (error) {
      return 'N';
    }
  }

  function run(hook, inputJson, limit, readModel, readNetwork, seed, tick, deepest) {
    const simulating = typeof seed === 'number' && typeof tick === 'number';
    const depth = typeof deepest === 'number' ? deepest : ${ANSWER_DEPTH};
    try {
      const input = parse(inputJson);
      const element = input[0];
      const context = input[1];
      if (readModel !== undefined) {
        defineProperty(context, 'model', { value: modelOf(readModel), enumerable: true });
      }
      if (readNetwork !== undefined) {
        defineProperty(context, 'fetched', { value: fetchedOf(readNetwork), enumerable: true });
      }
      if (simulating) defineProperty(context, 'random', { value: random, enumerable: true });
      deepFreeze(input, 0);
      // Made afresh for each call, before the hook runs: the same seed and tick draw the same.
      drawing = simulating ? makeRandom(seed, tick) : engineRandom;
      const answer = hook(element, context);
      if (!simulating) {
        if (answer === undefined) return 'Anull';
        const out = { text: '', limit: limit, error: 0, carried: '', depth: depth };
        write(answer, 0, out, 0);
        return out.error !== 0 ? out.error : 'A' + out.text;
      }
      const out = { text: '[', limit: limit, error: 0, carried: '', depth: depth };
      if (answer === undefined) out.text += 'null';
      else write(answer, 0, out, 1);
      if (out.error !== 0) return out.error;
      out.text += ',[' + out.carried + ']]';
      return out.text.length > limit ? 3 : 'A' + out.text;
    } catch (error) {
      return 'E' + describe(error);
    } finally {
      drawing = engineRandom;
    }
  }

  return [run, describe];
})`;
