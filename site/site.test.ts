// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
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

  /**
   * The mark is one file referenced twice: once as the tab icon, once as the
   * hero image. Both of these went wrong while it was being wired up, and
   * neither failure is visible in a passing build.
   *
   * The path is checked against the filesystem because the reference used to
   * climb out of site/ into src/. Vite's dev server serves site/ as its root
   * and answers anything above it with the SPA fallback, so the hero came back
   * as HTML and rendered as a broken image -- while `site:build`, which
   * resolves the reference and emits a hashed copy, produced a working page.
   * Only `yarn site:dev` showed it.
   */
  it('points the tab icon and the hero at the same file, and that file exists', () => {
    const icon = doc.querySelector('link[rel="icon"]')?.getAttribute('href');
    const hero = doc.querySelector('.hero__mark')?.getAttribute('src');

    expect(icon).toBe('./assets/bowl.svg');
    expect(hero).toBe(icon);
    expect(existsSync(join(__dirname, icon!))).toBe(true);
  });

  /**
   * A standalone .svg is parsed as XML, where a double hyphen inside a comment
   * is fatal rather than a warning. The mark carries a long explanatory
   * comment and the repo writes '--' for an em dash everywhere else, so this
   * is an easy edit to make; the only symptom is a broken image, with nothing
   * logged and the build still green.
   */
  it('keeps the mark parseable as XML', () => {
    const svg = readFileSync(join(__dirname, 'assets/bowl.svg'), 'utf8');
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');

    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(parsed.documentElement.tagName).toBe('svg');
  });

  it('has a title and a description for link previews', () => {
    expect(doc.title).toBe('Copy Pasta — clipboard history for macOS');
    const description = doc.querySelector('meta[name="description"]');
    expect(description?.getAttribute('content')).toBeTruthy();
  });
});
