import { describe, expect, it } from 'vitest';
import { translatorFor } from '../i18n/t';
import { loadSample } from '../test/sample';
import { browserAgrees, describeDestination, folderOf, planFollow } from './follow';

const sample = loadSample();
const view = sample.views[0];
const element = sample.model.elements[0];

describe('planFollow', () => {
  it('opens a view of this project at once, with the elements it focuses on that are there', () => {
    if (!view || !element) throw new Error('The sample has a view and elements.');
    expect(planFollow(sample, { view: view.id, focus: [element.id, 'gone'] })).toEqual({
      kind: 'view',
      view: view.id,
      viewName: view.name,
      select: [element.id],
    });
  });

  it('says when the view is not there', () => {
    expect(planFollow(sample, { view: 'gone' })).toEqual({ kind: 'missing-view', view: 'gone' });
  });

  it('asks before another project, naming its folder', () => {
    expect(planFollow(sample, { project: '../billing/', view: 'invoices' })).toEqual({
      kind: 'project',
      project: '../billing/',
      folder: 'billing',
      view: 'invoices',
    });
  });

  it('asks before a web address, naming its host', () => {
    expect(planFollow(sample, { url: 'https://WWW.Example.org/a?b' })).toEqual({
      kind: 'web',
      url: 'https://WWW.Example.org/a?b',
      host: 'www.example.org',
    });
  });

  it.each([
    { url: 'javascript:alert(1)' },
    { url: 'http://example.org' },
    { url: 'https://user:pw@example.org' },
    { project: '../../elsewhere' },
    'https://example.org',
    null,
  ])('follows nothing for %j', (value) => {
    expect(planFollow(sample, value)).toBeUndefined();
  });
});

describe('folderOf', () => {
  it('names the folder a path ends in', () => {
    expect(folderOf('../billing')).toBe('billing');
    expect(folderOf('../billing/./')).toBe('billing');
    expect(folderOf('sub/project')).toBe('project');
    expect(folderOf('..')).toBe('..');
  });
});

describe('browserAgrees', () => {
  it('agrees with an https: address whose host is the one named', () => {
    expect(browserAgrees('https://www.example.org/path', 'www.example.org')).toBe(true);
  });

  it('refuses what the browser reads otherwise', () => {
    expect(browserAgrees('https://www.example.org/path', 'example.org')).toBe(false);
    expect(browserAgrees('http://example.org', 'example.org')).toBe(false);
    expect(browserAgrees('not an address', 'example.org')).toBe(false);
  });
});

describe('describeDestination', () => {
  it('says what each kind opens, in words that read after a verb', () => {
    const t = translatorFor('en');
    if (!view) throw new Error('The sample has a view.');
    expect(describeDestination(t, sample, { view: view.id })).toBe(`the view “${view.name}”`);
    expect(describeDestination(t, sample, { project: '../billing' })).toBe(
      'the project in “billing”',
    );
    expect(describeDestination(t, sample, { url: 'https://example.org' })).toBe(
      'a page of example.org',
    );
    expect(translatorFor('es')('Opens {what}', { what: 'x' })).toBe('Abre x');
  });
});
