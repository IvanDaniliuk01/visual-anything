import { describe, expect, it } from 'vitest';
import {
  MAX_PACKAGE_FILE_PROBLEMS,
  MAX_PACKAGE_FILE_TEXT,
  packageFileProblems,
} from './package-file-messages';
import {
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  type AppMessage,
} from './protocol';

const read = {
  type: 'package/read',
  requestId: 'r1',
  name: 'gauges.vapackage',
  text: '{"id": "gauges"}',
};
const answer = {
  type: 'package/read-answer',
  requestId: 'r1',
  package: { id: 'gauges', name: 'Gauges', components: [], relationTypes: [] },
};

function reason(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof ProtocolError) return error.message;
    throw error;
  }
  throw new Error('It was read.');
}

describe('reading a package file over the live connection (ADR 0089)', () => {
  it('reads the app’s request, keeping only what it holds', () => {
    expect(decodeAppMessage(JSON.stringify({ ...read, extra: 1 }))).toEqual(read);
    expect(decodeAppMessage(encodeMessage(read as AppMessage))).toEqual(read);
  });

  it('refuses a request without a name, or with text that is none or past 2 MiB', () => {
    const app = (more: object) => () => decodeAppMessage(JSON.stringify({ ...read, ...more }));
    expect(reason(app({ name: '' }))).toBe(
      'Reading a package file names it, in 1 to 1000 characters.',
    );
    expect(reason(app({ name: 'x'.repeat(1001) }))).toBe(
      'Reading a package file names it, in 1 to 1000 characters.',
    );
    for (const text of [5, null, 'x'.repeat(MAX_PACKAGE_FILE_TEXT + 1)]) {
      expect(reason(app({ text }))).toBe(
        'Reading a package file needs its text, of at most 2 MiB.',
      );
    }
    expect(decodeAppMessage(JSON.stringify({ ...read, text: '' }))).toMatchObject({ text: '' });
  });

  it('reads the program’s answer by its envelope', () => {
    expect(decodeServerMessage(JSON.stringify(answer))).toEqual(answer);
    expect(reason(() => decodeServerMessage(JSON.stringify({ ...answer, package: [] })))).toBe(
      'The package file Visual Anything read cannot be read.',
    );
    expect(reason(() => decodeServerMessage(JSON.stringify({ ...answer, requestId: '' })))).toBe(
      'The answer has no valid request id.',
    );
  });
});

describe('packageFileProblems', () => {
  it('says where in the file each problem is, and that text which is no JSON is not', () => {
    expect(
      packageFileProblems([
        { path: '', message: 'must have the key "id"' },
        { path: '/components/0/name', message: 'must not be empty' },
        { path: '', message: 'Not valid JSON: Unexpected token' },
      ]),
    ).toEqual([
      'The package file must have the key "id".',
      'In the package file, /components/0/name must not be empty.',
      'The file is not valid JSON.',
    ]);
  });

  it('says at most so many, the last saying how many more there are', () => {
    const errors = Array.from({ length: 30 }, (_, n) => ({
      path: `/components/${n}`,
      message: 'must be an object',
    }));
    const said = packageFileProblems(errors);
    expect(said).toHaveLength(MAX_PACKAGE_FILE_PROBLEMS);
    expect(said.at(-1)).toBe('And 11 more problems.');
  });
});
