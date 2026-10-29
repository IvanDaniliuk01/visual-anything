import type { ListedVersion } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { translatorFor } from '../i18n/t';
import {
  MOST_OF_A_KIND,
  OPENED,
  chosenOf,
  refOf,
  summaryVersionOf,
  versionOptions,
  versionTitle,
} from './versions';

const en = translatorFor('en');
const es = translatorFor('es');

function listed(
  kind: ListedVersion['kind'],
  name: string | undefined,
  digit: string,
  subject = '',
) {
  return {
    kind,
    ...(name === undefined ? {} : { name }),
    commit: digit.repeat(40),
    short: digit.repeat(7),
    subject,
    author: 'Ana',
    time: Date.UTC(2026, 9, 28, 10, 0),
  } satisfies ListedVersion;
}

const HEAD = listed('head', undefined, 'a', 'Add the SMS channel');
const MAIN = listed('branch', 'main', 'a', 'Add the SMS channel');
const ORIGIN = listed('remote', 'origin/main', 'b', 'Rename WhatsApp');
const TAG = listed('tag', 'v0.1', 'c', 'First version');
const COMMIT = listed('commit', undefined, 'd', 'Move the patient');

describe('what a version is called', () => {
  it('names the project as opened, HEAD, a branch, a tag and a commit', () => {
    expect(versionTitle(en, OPENED)).toBe('Compared with the project as opened');
    expect(versionTitle(en, chosenOf(HEAD))).toBe('Compared with HEAD (aaaaaaa)');
    expect(versionTitle(en, chosenOf(MAIN))).toBe('Compared with main (aaaaaaa)');
    expect(versionTitle(en, chosenOf(TAG))).toBe('Compared with v0.1 (ccccccc)');
    expect(versionTitle(en, chosenOf(COMMIT))).toBe('Compared with commit ddddddd');
  });

  it('names a commit Claude named, which this tab never listed, by its short id', () => {
    expect(versionTitle(en, { kind: 'named', commit: 'e'.repeat(40) })).toBe(
      'Compared with commit eeeeeee',
    );
  });

  it('names them in Spanish', () => {
    expect(versionTitle(es, OPENED)).toBe('Comparado con el proyecto tal como se abrió');
    expect(versionTitle(es, chosenOf(MAIN))).toBe('Comparado con main (aaaaaaa)');
  });

  it('asks the program for a version only as it listed it', () => {
    expect(refOf(OPENED)).toEqual({ kind: 'opened' });
    expect(refOf(chosenOf(MAIN))).toEqual({ kind: 'commit', commit: MAIN.commit });
    expect(refOf({ kind: 'named', commit: 'e'.repeat(40) })).toEqual({
      kind: 'commit',
      commit: 'e'.repeat(40),
    });
  });

  it('names a version in the summary by its branch, its commit and its date', () => {
    expect(summaryVersionOf(en, chosenOf(MAIN))).toEqual({
      name: 'main',
      commit: MAIN.commit,
      date: MAIN.time,
    });
    expect(summaryVersionOf(en, chosenOf(HEAD))).toMatchObject({ name: 'HEAD' });
    expect(summaryVersionOf(en, chosenOf(COMMIT))).toEqual({
      commit: COMMIT.commit,
      date: COMMIT.time,
    });
    expect(summaryVersionOf(en, OPENED)).toEqual({ name: 'The project as opened' });
  });
});

describe('the versions to choose from', () => {
  const versions = [COMMIT, TAG, ORIGIN, MAIN, HEAD];

  it('lists the project as opened first, then HEAD, branches, remote branches, tags and commits', () => {
    const { options } = versionOptions(en, versions, '');
    expect(options.map((option) => option.chosen)).toEqual([
      OPENED,
      chosenOf(HEAD),
      chosenOf(MAIN),
      chosenOf(ORIGIN),
      chosenOf(TAG),
      chosenOf(COMMIT),
    ]);
  });

  it('finds versions by name, short id, commit, subject, author and kind, whatever the case', () => {
    const found = (typed: string) =>
      versionOptions(en, versions, typed).options.map((option) => option.key);
    expect(found('MAIN')).toEqual([
      `branch:${MAIN.commit}:main`,
      `remote:${ORIGIN.commit}:origin/main`,
    ]);
    expect(found('ccc')).toEqual([`tag:${TAG.commit}:v0.1`]);
    expect(found('patient')).toEqual([`commit:${COMMIT.commit}:`]);
    expect(found('tag')).toEqual([`tag:${TAG.commit}:v0.1`]);
    expect(found('opened')).toEqual(['opened']);
    expect(found('nothing like it')).toEqual([]);
  });

  it(`lists at most ${MOST_OF_A_KIND} of a kind, and says how many more there are`, () => {
    const many = Array.from({ length: MOST_OF_A_KIND + 5 }, (_, at) => ({
      ...listed('tag', `v${at}`, 'c'),
    }));
    const { options, more } = versionOptions(en, many, '');
    expect(options.filter((option) => option.chosen.kind === 'listed')).toHaveLength(
      MOST_OF_A_KIND,
    );
    expect(more).toBe(5);
    expect(versionOptions(en, many, 'v1').more).toBe(0);
  });
});
