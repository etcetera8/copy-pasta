// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The landing page ships no JavaScript, so there is no component to render.
 * What can still go wrong is the markup losing something it must not lose:
 * a broken download link, a support link quietly shipped as a placeholder,
 * a feature card dropped in an edit.
 *
 * These tests parse index.html and assert that contract.
 */

const DOWNLOAD_URL = 'https://github.com/etcetera8/copy-pasta/releases/latest';
const SUPPORT_PLACEHOLDER = '#';

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

  it('offers a support link', () => {
    const link = doc.querySelector('[data-testid="support"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toMatch(/coffee/i);
  });

  /**
   * Deliberately asserts the placeholder. This test is the tripwire: when the
   * real buy-me-a-coffee URL lands, this test fails, and whoever changes it
   * has to update SUPPORT_PLACEHOLDER on purpose rather than by accident.
   */
  it('still has the support link as a known placeholder', () => {
    const link = doc.querySelector('[data-testid="support"]');
    expect(link?.getAttribute('href')).toBe(SUPPORT_PLACEHOLDER);
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
