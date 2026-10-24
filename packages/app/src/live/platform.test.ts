import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAppleAgent } from './platform';

describe('isAppleAgent', () => {
  it('knows macOS, iPhone and iPad by their user agents', () => {
    expect(
      isAppleAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      ),
    ).toBe(true);
    expect(
      isAppleAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      ),
    ).toBe(true);
    expect(isAppleAgent('Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)')).toBe(true);
  });

  it('does not take Windows, Linux or Android for Apple, though their browsers name AppleWebKit', () => {
    expect(
      isAppleAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      ),
    ).toBe(false);
    expect(
      isAppleAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'),
    ).toBe(false);
    expect(
      isAppleAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko)',
      ),
    ).toBe(false);
  });
});

describe('IS_APPLE', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('reads the user agent of the browser it runs in, with the same test as the header', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)' });
    vi.resetModules();
    expect((await import('./platform')).IS_APPLE).toBe(true);

    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    vi.resetModules();
    expect((await import('./platform')).IS_APPLE).toBe(false);
  });
});
