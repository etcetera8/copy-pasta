// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The landing page has no components of its own to render. Its one piece of
 * JavaScript is Buy Me a Coffee's third-party widget, which injects the
 * support button at runtime -- so a static parse sees the <script> tag but
 * never the button it produces.
 *
 * What can still go wrong is the markup losing something it must not lose:
 * a broken download link, a support widget pointed at the wrong account, a
 * feature card dropped in an edit.
 *
 * These tests parse index.html and assert that contract.
 */

const DOWNLOAD_URL = 'https://github.com/etcetera8/copy-pasta/releases/latest';
const BMC_SRC = 'https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js';
const BMC_SLUG = 'etcetera8';

let doc: Document;

beforeAll(() => {
  const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
  doc = new DOMParser().parseFromString(html, 'text/html');
});

describe('landing page', () => {
  it('offers a download that points at the releases page', () => {
    const link = doc.querySelector('[data-testid="download"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(DOWNLOAD_URL);
  });

  it('embeds the buy-me-a-coffee widget', () => {
    const script = doc.querySelector('script[data-name="bmc-button"]');
    expect(script).not.toBeNull();
    expect(script?.getAttribute('src')).toBe(BMC_SRC);
  });

  /**
   * The slug decides whose account the money reaches, so a typo here is a
   * silent failure that looks fine on the page. Pinned deliberately: changing
   * the destination should mean changing this line on purpose.
   */
  it('points the widget at the right account', () => {
    const script = doc.querySelector('script[data-name="bmc-button"]');
    expect(script?.getAttribute('data-slug')).toBe(BMC_SLUG);
    expect(script?.getAttribute('data-text')).toMatch(/coffee/i);
  });

  it('has no leftover placeholder support link', () => {
    // The widget supplies the button now; a surviving [data-testid="support"]
    // would mean two coffee buttons, one of them still pointing at '#'.
    expect(doc.querySelector('[data-testid="support"]')).toBeNull();
  });

  it('describes all five features', () => {
    const cards = doc.querySelectorAll('[data-testid="feature"]');
    expect(cards).toHaveLength(5);

    const headings = Array.from(cards).map((c) =>
      c.querySelector('h3')?.textContent?.trim(),
    );
    expect(headings).toEqual([
      'Global shortcut',
      'Instant search',
      'Pin what matters',
      'Stays on your Mac',
      'Light and dark',
    ]);
  });

  it('says it is a macOS app and does not promise other platforms', () => {
    const text = doc.body.textContent ?? '';
    expect(text).toMatch(/macOS/);
    expect(text).not.toMatch(/Windows/);
    expect(text).not.toMatch(/Linux/);
  });

  it('leaves no TODO text visible to readers', () => {
    // Comments are not in textContent, so the TODO marking the support URL
    // does not trip this -- only a TODO that leaked into visible copy would.
    expect(doc.body.textContent).not.toMatch(/TODO/i);
  });

  it('has a title and a description for link previews', () => {
    expect(doc.title).toBe('Copy Pasta — clipboard history for macOS');
    const description = doc.querySelector('meta[name="description"]');
    expect(description?.getAttribute('content')).toBeTruthy();
  });
});
