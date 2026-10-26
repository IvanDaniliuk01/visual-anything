import fc from 'fast-check';
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Overlay } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { setCurrentLanguage } from '../i18n/language';
import { SAMPLE_VIEW, collapsedSample } from '../test/exports';
import { loadSample } from '../test/sample';
import { withWovenRelations } from '../test/woven';
import { codeSpan, markdownBlock, markdownInline } from './markdown';
import { writeOutline } from './outline';

describe('markdownInline', () => {
  it('escapes every character Markdown or HTML reads as markup, and keeps the text one line', () => {
    expect(
      markdownInline('<img src=x onerror=alert(1)> [link](http://x) **b** `c` # h | t ~s~ &amp;'),
    ).toBe(
      '\\<img src=x onerror=alert\\(1\\)\\> \\[link\\]\\(http://x\\) \\*\\*b\\*\\* \\`c\\` \\# h \\| t \\~s\\~ &amp;amp;',
    );
    expect(markdownInline('one\ntwo\r\n three')).toBe('one two three');
  });

  it('leaves no markup character unescaped, whatever the text', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const written = markdownInline(text);
        expect(written).not.toMatch(/[\r\n]/);
        // Each markup character comes right after a backslash that is not itself escaped.
        const unescaped = written.replace(/\\[\\`*_[\]{}()#+!|~<>]/g, '');
        expect(unescaped).not.toMatch(/[\\`*_[\]{}()#+!|~<>]/);
        expect(unescaped).not.toMatch(/&(?!amp;)/);
      }),
    );
  });
});

describe('markdownBlock', () => {
  it('keeps lines, none of them starting a heading, a list, a quote or code', () => {
    expect(markdownBlock('# Title\n- item\n1. first\n> quote\n    code\n=== rule')).toBe(
      '\\# Title\n\\- item\n1\\. first\n\\> quote\ncode\n\\=== rule',
    );
  });
});

describe('codeSpan', () => {
  it('fences a text with more backticks than any run in it', () => {
    expect(codeSpan('{"a":1}')).toBe('`{"a":1}`');
    expect(codeSpan('a`b``c')).toBe('```a`b``c```');
    expect(codeSpan('`x`')).toBe('`` `x` ``');
  });
});

describe('writeOutline', () => {
  it('lists what sits in World and inside each container, with the relations drawn from each shape', () => {
    const { text, lost } = writeOutline(loadSample(), SAMPLE_VIEW);
    expect(text).toContain(
      '# System overview\n\nHow a booking request travels from the patient to the calendar.',
    );
    expect(text).toContain('Perspective: Data flow.');
    expect(text).toContain(
      [
        '- **Patient** (Person)',
        '  - → communicates with **WhatsApp channel**',
        '- **Clinic booking** (System)',
        '  - **WhatsApp channel** (Chat channel)',
      ].join('\n'),
    );
    expect(text).toContain('    - → communicates with **Appointments API**: “HTTPS”');
    expect(text).toContain('## Notes\n\n- Scheduling owns the calendar');
    expect(text).toContain('## Scenarios\n\n### ');
    expect(text).toMatch(/\n1\. .+\n {3}- Patient communicates with WhatsApp channel/);
    expect(text).toContain('## What this outline leaves out');
    expect(lost.length).toBeGreaterThan(0);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('lists a collapsed container with how many it holds, and the relations it aggregates', () => {
    const { text, lost } = writeOutline(collapsedSample(), SAMPLE_VIEW);
    expect(text).toContain('**Scheduling** (System), collapsed, with 3 inside');
    expect(text).toMatch(
      /→ 1 relations “communicates with” with \*\*Scheduling\*\*, aggregated|aggregated/,
    );
    expect(lost.join(' ')).toMatch(/collapsed containers/);
  });

  it('lists relations that end on relations under them, however they loop', () => {
    const { text } = writeOutline(withWovenRelations(loadSample(), 3), SAMPLE_VIEW);
    expect(text).toContain('relates to');
    expect(text.split('\n').length).toBeLessThan(400);
  });

  it('writes what people wrote as text, never as markup', () => {
    const project = loadSample();
    const hostile = '# Heading [x](javascript:alert(1)) <script>alert(1)</script>\n- list';
    const changed: ProjectSnapshot = {
      ...project,
      model: {
        ...project.model,
        elements: project.model.elements.map((element) =>
          element.id === 'patient' ? { ...element, name: hostile } : element,
        ),
      },
      views: project.views.map((view) => ({ ...view, name: hostile, description: hostile })),
    };
    const { text } = writeOutline(changed, SAMPLE_VIEW);
    expect(text).not.toContain('<script>');
    expect(text).not.toContain('](');
    expect(text.split('\n').filter((line) => line.startsWith('# '))).toHaveLength(1);
    expect(text).toContain('\\<script\\>');
  });

  it('writes its own words in the language the app reads in', () => {
    setCurrentLanguage('es');
    const { text } = writeOutline(loadSample(), SAMPLE_VIEW);
    expect(text).not.toContain('What this outline leaves out');
    expect(text).not.toContain('Shapes and relations');
  });
});

describe('the legend of an outline', () => {
  const team: Overlay = {
    id: 'team',
    name: 'Team',
    of: 'elements',
    attribute: 'owner',
    channel: 'fill',
    mapping: {
      kind: 'discrete',
      cases: [
        { value: 'Scheduling team', color: '#FFFF00' },
        { value: 'Patient experience', color: '#FFFF33', label: 'Patients' },
      ],
      otherwise: '#6B7280',
    },
  };
  const latency: Overlay = {
    id: 'latency',
    of: 'relations',
    attribute: 'rate',
    channel: 'opacity',
    mapping: {
      kind: 'continuous',
      stops: [
        { at: 0, opacity: 0.4 },
        { at: 100, opacity: 1, label: 'Busy' },
      ],
    },
  };
  const tier: Overlay = {
    id: 'tier',
    name: 'Tier',
    of: 'elements',
    attribute: 'tier',
    channel: 'badge',
    mapping: { kind: 'passthrough' },
  };
  const marked: Overlay = {
    id: 'marked',
    of: 'elements',
    attribute: 'critical',
    channel: 'badge',
    mapping: { kind: 'discrete', cases: [{ value: 'true', text: 'Critical' }] },
  };

  function withOverlays(overlays: Overlay[]): ProjectSnapshot {
    const project = loadSample();
    return {
      ...project,
      views: project.views.map((view) => (view.id === SAMPLE_VIEW ? { ...view, overlays } : view)),
    };
  }

  it('lists each overlay that is on, with what it changes and each case and stop in words', () => {
    const { text } = writeOutline(withOverlays([team, latency, tier, marked]), SAMPLE_VIEW);
    expect(text).toContain(
      [
        '## Legend',
        '',
        '### Team',
        '',
        'Fill by owner.',
        '',
        '- Scheduling team: `#FFFF00`',
        '- Patients: `#FFFF33`',
        '- Any other value: `#6B7280`',
        '',
        '### rate',
        '',
        'Line opacity by rate.',
        '',
        '- 0: 40%',
        '- Busy: 100%',
        '',
        '### Tier',
        '',
        'Badge by tier.',
        '',
        '- The value itself',
        '',
        '### critical',
        '',
        'Badge by critical.',
        '',
        '- true: “Critical”',
        '',
        '## Scenarios',
      ].join('\n'),
    );
  });

  it('says nothing of its colors’ contrast, which only a drawing shows', () => {
    const { text } = writeOutline(withOverlays([team]), SAMPLE_VIEW);
    expect(text).not.toContain('under 3:1');
  });

  it('has no legend while no overlay is on', () => {
    expect(writeOutline(loadSample(), SAMPLE_VIEW).text).not.toContain('## Legend');
    const off = writeOutline(withOverlays([{ ...team, off: true }]), SAMPLE_VIEW);
    expect(off.text).not.toContain('## Legend');
  });

  it('writes what people wrote in it as text, never as markup', () => {
    const hostile: Overlay = {
      ...team,
      name: '# <b>Team</b>',
      attribute: 'own*er',
      mapping: {
        kind: 'discrete',
        cases: [{ value: 'x', color: '#FFFF00', label: '[link](http://x)' }],
      },
    };
    const { text } = writeOutline(withOverlays([hostile]), SAMPLE_VIEW);
    expect(text).toContain('### \\# \\<b\\>Team\\</b\\>');
    expect(text).toContain('Fill by own\\*er.');
    expect(text).toContain('- \\[link\\]\\(http://x\\): `#FFFF00`');
  });

  it('writes its words in the language the app reads in', () => {
    setCurrentLanguage('es');
    const { text } = writeOutline(withOverlays([team, latency]), SAMPLE_VIEW);
    expect(text).toContain('## Leyenda');
    expect(text).toContain('Relleno según owner.');
    expect(text).toContain('- Cualquier otro valor: `#6B7280`');
    // Spanish writes a no-break space before the percent sign.
    expect(text).toContain('- 0: 40 %');
  });
});
