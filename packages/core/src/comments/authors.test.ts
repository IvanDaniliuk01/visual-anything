import { describe, expect, it } from 'vitest';
import { authorKeyOf, authorNameOf, checkPerson, isSameAuthor } from './authors';

describe('checkPerson', () => {
  it('keeps a name and an email, trimmed, and leaves out an empty email', () => {
    expect(checkPerson({ kind: 'person', name: '  Ana ', email: ' ana@example.com ' })).toEqual({
      ok: true,
      author: { kind: 'person', name: 'Ana', email: 'ana@example.com' },
    });
    expect(checkPerson({ kind: 'person', name: 'Ana', email: '' })).toEqual({
      ok: true,
      author: { kind: 'person', name: 'Ana' },
    });
  });

  it('keeps only what an author has, so nothing else reaches the file', () => {
    const hostile = JSON.parse(
      '{"kind":"person","name":"Ana","__proto__":{"polluted":true},"html":"<b>"}',
    ) as unknown;
    const checked = checkPerson(hostile);
    expect(checked).toEqual({ ok: true, author: { kind: 'person', name: 'Ana' } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('refuses no author, a blank or long name, and an email that is not one', () => {
    expect(checkPerson(undefined)).toMatchObject({ ok: false, code: 'no-comment-author' });
    expect(checkPerson({ kind: 'person', name: '   ' })).toMatchObject({
      ok: false,
      code: 'no-comment-author',
    });
    expect(checkPerson({ kind: 'person', name: 'x'.repeat(201) })).toMatchObject({
      ok: false,
      code: 'invalid-author',
    });
    expect(checkPerson({ kind: 'person', name: 'Ana', email: 'not an email' })).toMatchObject({
      ok: false,
      code: 'invalid-author',
    });
    expect(checkPerson({ kind: 'person', name: 'Ana', email: 5 })).toMatchObject({
      ok: false,
      code: 'invalid-author',
    });
    expect(checkPerson({ kind: 'claude' })).toMatchObject({ ok: false, code: 'invalid-author' });
    expect(checkPerson('Ana')).toMatchObject({ ok: false, code: 'no-comment-author' });
  });
});

describe('isSameAuthor', () => {
  const ana = { kind: 'person', name: 'Ana' } as const;
  it('matches Claude with Claude only', () => {
    expect(isSameAuthor({ kind: 'claude' }, { kind: 'claude' })).toBe(true);
    expect(isSameAuthor({ kind: 'claude' }, ana)).toBe(false);
  });

  it('matches people by their emails when both have one, and else by their names', () => {
    expect(isSameAuthor(ana, { kind: 'person', name: ' ana ' })).toBe(true);
    expect(isSameAuthor(ana, { kind: 'person', name: 'Ana', email: 'ana@example.com' })).toBe(true);
    expect(
      isSameAuthor(
        { kind: 'person', name: 'Ana', email: 'ANA@example.com' },
        { kind: 'person', name: 'Ana Pérez', email: 'ana@example.com' },
      ),
    ).toBe(true);
    expect(
      isSameAuthor(
        { kind: 'person', name: 'Ana', email: 'ana@example.com' },
        { kind: 'person', name: 'Ana', email: 'other@example.com' },
      ),
    ).toBe(false);
    expect(isSameAuthor(ana, { kind: 'person', name: 'Bruno' })).toBe(false);
  });
});

describe('authorNameOf and authorKeyOf', () => {
  it('name and key Claude and people', () => {
    expect(authorNameOf({ kind: 'claude' })).toBe('Claude');
    expect(authorNameOf({ kind: 'person', name: 'Ana' })).toBe('Ana');
    expect(authorKeyOf({ kind: 'claude' })).toBe('claude');
    expect(authorKeyOf({ kind: 'person', name: ' Ana ' })).toBe('name:ana');
    expect(authorKeyOf({ kind: 'person', name: 'Ana', email: 'Ana@Example.com' })).toBe(
      'email:ana@example.com',
    );
  });
});
