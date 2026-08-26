# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static macOS-only landing page for Copy Pasta at `site/`, describing the app and linking to a download and a support page.

**Architecture:** A second Vite entry (`vite.site.config.mts`) rooted at `site/`, producing a static HTML page with no client-side JavaScript. The app's colour palette moves into a shared SCSS partial that both the Electron renderer and the site consume, so the two cannot drift apart.

**Tech Stack:** Vite 8, Sass 1.103 (both already devDependencies), Vitest 4 for structural tests. No new packages.

**Spec:** `docs/superpowers/specs/2026-08-24-landing-page-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/styles/_tokens.scss` | **Create.** Colour palette + font family names. Variables only — no `@font-face`, no rules. |
| `src/renderer/styles/index.scss` | **Modify.** Consume tokens instead of redeclaring `$black`/`$blue`. |
| `src/renderer/styles/landing.scss` | **Modify.** Consume tokens instead of redeclaring `$blue`/`$green`/`$black`. |
| `vite.site.config.mts` | **Create.** Vite config rooted at `site/`, output to `site/dist`. |
| `site/assets/bowl.png` | **Create.** Copy of `src/main/bowl.png`, used as the favicon at its native 16x16. |
| `site/index.html` | **Create.** All page content. |
| `site/styles/site.scss` | **Create.** `@font-face` declarations + page layout and styling. |
| `site/site.test.ts` | **Create.** Structural assertions against `index.html`. |
| `package.json` | **Modify.** Add `site:dev` and `site:build` scripts. |
| `vitest.config.mts` | **Modify.** Add `site/**/*.test.ts` to `include`. |
| `tsconfig.json` | **Modify.** Add `site/**/*` and `*.config.mts` to `include`. |
| `.gitignore` | **Modify.** Ignore `site/dist/`. |

### Why `@font-face` is NOT in the tokens partial

Sass flattens `@use`d partials into the consumer's output file. Relative `url()` paths inside a
partial are **not** rebased by Sass, so a `src: url('../fonts/x.ttf')` written in
`src/shared/styles/_tokens.scss` would resolve relative to whichever file `@use`s it — correct for
one consumer, broken for the other. Keeping `@font-face` in each consumer, with a path correct for
that consumer, sidesteps the problem entirely. The partial holds variables only.

---

## Task 1: Shared design tokens

**Files:**
- Create: `src/shared/styles/_tokens.scss`
- Modify: `src/renderer/styles/index.scss`
- Modify: `src/renderer/styles/landing.scss`

- [ ] **Step 1: Create the tokens partial**

Create `src/shared/styles/_tokens.scss`:

```scss
// Copy Pasta's palette, shared by the Electron renderer and the landing page.
//
// These values were duplicated by hand across index.scss and landing.scss.
// They live here now so the app and the marketing page cannot drift apart.
//
// Variables only. `@font-face` belongs in the consuming stylesheet: Sass does
// not rebase relative url() paths out of a partial, so a font path written
// here would be correct for one consumer and broken for the other.

// Dark theme (default)
$black: #1e1e1e;
$blue: #569CD6;
$green: #B5CEA8;
$purple: #C586C0;

// Light theme. The `light-theme-` prefix means "the light theme's", not
// "a lighter shade of" -- $light-theme-blue is in fact darker than $blue.
$light-theme-bg: #fff;
$light-theme-blue: #0451A5;
$light-theme-maroon: #811F3F;
$light-theme-amber: #CD9731;

// Type
$font-display: leckerli-one;
$font-body: abeezee;
```

- [ ] **Step 2: Point index.scss at the tokens**

Replace the top of `src/renderer/styles/index.scss` — the two `$black`/`$blue` declarations and the
`@font-face` block — with a `@use` plus the font declaration. The file currently begins:

```scss
$black: #1e1e1e;
$blue: #569CD6;

$lightThemeBlue: #0451A5;

@font-face {
  font-family: leckerli-one; 
  src: url('../fonts/LeckerliOne-Regular.ttf');
}
```

Replace exactly that with:

```scss
@use '../../shared/styles/tokens';

@font-face {
  font-family: leckerli-one;
  src: url('../fonts/LeckerliOne-Regular.ttf');
}
```

Then update the references further down the same file:
- `background: $black;` becomes `background: tokens.$black;`
- `color: $blue;` becomes `color: tokens.$blue;`
- `color: $lightThemeBlue;` becomes `color: tokens.$light-theme-blue;`
- `color: #811F3F;` becomes `color: tokens.$light-theme-maroon;`

- [ ] **Step 3: Point landing.scss at the tokens**

`src/renderer/styles/landing.scss` currently begins with three indented declarations:

```scss
  $blue: #569CD6;
  $green: #B5CEA8;
  $black: #1e1e1e;
```

Replace those three lines with:

```scss
@use '../../shared/styles/tokens';
```

Then update every reference in the file:
- `$blue` becomes `tokens.$blue` (appears in `.table-head`, `.search`)
- `$green` becomes `tokens.$green` (appears in `.btn`, `.delete-btn, .pin-btn`)
- `$black` becomes `tokens.$black` (appears in `.btn`)
- `color: #811F3F;` becomes `color: tokens.$light-theme-maroon;` (appears twice, in `.delete-btn` and `.table-head` under `.light-theme`)
- `#CD9731` becomes `tokens.$light-theme-amber` (appears four times in the `.light-theme .btn` and `.light-theme .search` blocks)

- [ ] **Step 4: Verify the app still builds and tests pass**

Run: `npm test && npm run lint && npm run typecheck`
Expected: 55 tests passing, no lint errors, no type errors.

Sass compiles during the Vite build, not during tests, so also run:

Run: `npx vite build --config vite.renderer.config.mts`
Expected: build completes, no `Undefined variable` errors. If Sass reports an undefined variable,
a `$name` reference was missed in step 2 or 3 — find it in the error's file/line and prefix it
with `t.`.

- [ ] **Step 5: Commit**

```bash
git add src/shared/styles/_tokens.scss src/renderer/styles/index.scss src/renderer/styles/landing.scss
git commit -m "Extract shared SCSS design tokens

The palette was duplicated by hand across index.scss and landing.scss.
It lives in one partial now, ready for the landing page to consume."
```

---

## Task 2: Vite site config and wiring

**Files:**
- Create: `vite.site.config.mts`
- Modify: `package.json`
- Modify: `vitest.config.mts`
- Modify: `tsconfig.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create the Vite config**

Create `vite.site.config.mts`:

```ts
import path from 'node:path';
import { defineConfig } from 'vite';

const projectRoot = process.cwd();

// The landing page. Separate from the renderer build (vite.renderer.config.mts)
// because it is a public web page, not part of the packaged app: it ships no
// JavaScript and its output never goes into .vite/.
export default defineConfig({
  root: path.resolve(projectRoot, 'site'),
  // Relative asset URLs, so the built page works from any path a host serves
  // it at rather than assuming it sits at the domain root.
  base: './',
  build: {
    outDir: path.resolve(projectRoot, 'site/dist'),
    emptyOutDir: true,
  },
});
```

- [ ] **Step 2: Add the scripts**

In `package.json`, in the `"scripts"` object, add these two entries after `"publish"`:

```json
    "site:dev": "vite --config vite.site.config.mts",
    "site:build": "vite build --config vite.site.config.mts",
```

- [ ] **Step 3: Widen the vitest include**

In `vitest.config.mts`, change:

```ts
    include: ['src/**/*.test.{ts,tsx}'],
```

to:

```ts
    include: ['src/**/*.test.{ts,tsx}', 'site/**/*.test.ts'],
```

- [ ] **Step 4: Widen the tsconfig include**

In `tsconfig.json`, change the `"include"` array from:

```json
  "include": [
    "src/**/*",
    "*.config.ts",
    "forge.config.ts"
  ]
```

to:

```json
  "include": [
    "src/**/*",
    "site/**/*",
    "*.config.ts",
    "*.config.mts",
    "forge.config.ts"
  ]
```

Note: `*.config.mts` was missing, so the existing Vite configs were never typechecked. Adding it
brings them in along with the new one.

- [ ] **Step 5: Ignore the build output**

Append to `.gitignore`:

```
# Landing page build output
site/dist/
```

- [ ] **Step 6: Verify nothing broke**

Run: `npm test && npm run typecheck`
Expected: 55 tests passing (no site tests exist yet), no type errors.

If `typecheck` now reports errors in `*.config.mts` files that were previously unchecked, fix them —
that is the point of adding them.

- [ ] **Step 7: Commit**

```bash
git add vite.site.config.mts package.json vitest.config.mts tsconfig.json .gitignore
git commit -m "Add Vite config and wiring for the landing page

Second Vite entry rooted at site/, plus site:dev and site:build scripts.
Also brings *.config.mts into typechecking, which it was missing."
```

---

## Task 3: The structural test

This task is TDD's "write the failing test" step, at file scale: the test defines the page's
contract before the page exists.

**Files:**
- Create: `site/site.test.ts`

- [ ] **Step 1: Write the failing test**

Create `site/site.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run site/site.test.ts`
Expected: FAIL — `ENOENT: no such file or directory` for `site/index.html`, because the page does
not exist yet. That is the correct failure.

- [ ] **Step 3: Commit the failing test**

```bash
git add site/site.test.ts
git commit -m "Add structural tests for the landing page

Written before the page: they define what the markup must not lose.
The support-link test asserts the placeholder deliberately, so hooking
up the real URL is a conscious edit."
```

---

## Task 4: The page markup

**Files:**
- Create: `site/assets/bowl.png`
- Create: `site/index.html`

- [ ] **Step 1: Copy the favicon into the site**

The tray icon is 16x16, which is exactly favicon size. Copy it rather than referencing it across
the Vite root boundary:

```bash
mkdir -p site/assets
cp src/main/bowl.png site/assets/bowl.png
```

- [ ] **Step 2: Write the page**

Create `site/index.html`. Note the `data-testid` attributes — Task 3's tests depend on them.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Copy Pasta — clipboard history for macOS</title>
    <meta
      name="description"
      content="A clipboard history utility for macOS. Everything you copy, searchable and re-pastable from a global shortcut. Stays on your machine."
    />
    <link rel="icon" type="image/png" href="./assets/bowl.png" />
    <link rel="stylesheet" href="./styles/site.scss" />
  </head>
  <body>
    <main>
      <section class="hero">
        <!-- Drawn rather than linked: the only bowl asset in the repo is a
             16x16 tray icon, which would be a blurry mess at hero size. -->
        <svg
          class="hero__mark"
          viewBox="0 0 120 120"
          role="img"
          aria-label="A steaming bowl of pasta"
        >
          <g fill="none" stroke-linecap="round" stroke-width="4">
            <path class="hero__steam" d="M45 30c0-7 9-7 9-14s-9-7-9-14" />
            <path class="hero__steam" d="M63 32c0-6 8-6 8-12s-8-6-8-12" />
            <path class="hero__steam" d="M81 30c0-7 9-7 9-14s-9-7-9-14" />
          </g>
          <path
            class="hero__noodles"
            fill="none"
            stroke-linecap="round"
            stroke-width="5"
            d="M28 62c6-14 16-20 32-20s26 6 32 20M40 62c4-10 10-14 20-14s16 4 20 14"
          />
          <path class="hero__bowl" d="M16 64h88a44 44 0 0 1-88 0z" />
          <path class="hero__base" d="M44 110h32" stroke-width="6" stroke-linecap="round" fill="none" />
        </svg>

        <h1 class="hero__title">Copy Pasta</h1>
        <p class="hero__tagline">
          Your clipboard, remembered. Everything you copy stays searchable and
          one keystroke away.
        </p>

        <div class="hero__actions">
          <a
            class="btn btn--primary"
            data-testid="download"
            href="https://github.com/etcetera8/copy-pasta/releases/latest"
          >
            Download
          </a>
          <!-- TODO: replace with the real buy-me-a-coffee URL. site.test.ts
               asserts this placeholder, so that test fails when it changes. -->
          <a class="btn btn--secondary" data-testid="support" href="#">
            ☕ Buy me a coffee
          </a>
        </div>

        <p class="hero__platform">For macOS</p>
      </section>

      <section class="features">
        <article class="feature" data-testid="feature">
          <h3>Global shortcut</h3>
          <p>
            Press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>V</kbd> from any app to bring up
            your history. No dock icon — it lives in the menu bar.
          </p>
        </article>

        <article class="feature" data-testid="feature">
          <h3>Instant search</h3>
          <p>
            Start typing to filter everything you have copied. Found it? Click
            it and it pastes straight into whatever you were doing.
          </p>
        </article>

        <article class="feature" data-testid="feature">
          <h3>Pin what matters</h3>
          <p>
            Pinned entries are kept indefinitely. Everything else clears itself
            out after a week, so the list never becomes an archive.
          </p>
        </article>

        <article class="feature" data-testid="feature">
          <h3>Stays on your Mac</h3>
          <p>
            History is a plain JSON file in
            <code>~/Library/Application&nbsp;Support/Copy&nbsp;Pasta/</code>.
            No account, no sync, no server. Nothing leaves your machine.
          </p>
        </article>

        <article class="feature" data-testid="feature">
          <h3>Light and dark</h3>
          <p>
            Both themes, switched from the menu-bar icon. Your choice is
            remembered between launches.
          </p>
        </article>
      </section>

      <section class="how">
        <h2 class="how__title">How it works</h2>
        <ol class="how__steps">
          <li><span class="how__num">1</span> Copy anything, anywhere.</li>
          <li>
            <span class="how__num">2</span> Press
            <kbd>⌘</kbd><kbd>⇧</kbd><kbd>V</kbd>.
          </li>
          <li><span class="how__num">3</span> Click an entry — it pastes.</li>
        </ol>
      </section>
    </main>

    <footer class="footer">
      <a href="https://github.com/etcetera8/copy-pasta">GitHub</a>
      <span class="footer__dot">·</span>
      <span>MIT licensed</span>
      <span class="footer__dot">·</span>
      <span>Built by Svet &amp; Parker</span>
    </footer>
  </body>
</html>
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run site/site.test.ts`
Expected: FAIL on the stylesheet only if Vite is involved — it is not, this test reads the file
directly, so all 7 tests should PASS.

If the "describes all five features" test fails on heading text, the `<h3>` contents must match the
array in the test exactly, including capitalisation.

- [ ] **Step 4: Commit**

```bash
git add site/index.html site/assets/bowl.png
git commit -m "Add landing page markup

Hero mark is inline SVG: the only bowl asset in the repo is a 16x16
tray icon, too small to scale up. It still serves as the favicon."
```

---

## Task 5: The stylesheet

**Files:**
- Create: `site/styles/site.scss`

- [ ] **Step 1: Write the stylesheet**

Create `site/styles/site.scss`:

```scss
@use '../../src/shared/styles/tokens';

// Paths are relative to this file, which is what Sass and Vite both expect.
// The fonts are not duplicated into site/ -- there is one copy in the repo.
@font-face {
  font-family: leckerli-one;
  src: url('../../src/renderer/fonts/LeckerliOne-Regular.ttf');
  font-display: swap;
}

@font-face {
  font-family: abeezee;
  src: url('../../src/renderer/fonts/ABeeZee-Regular.ttf');
  font-display: swap;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: tokens.$black;
  color: tokens.$blue;
  font-family: tokens.$font-body, system-ui, sans-serif;
  line-height: 1.6;
}

main {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 24px;
}

// --- Hero ---------------------------------------------------------------

.hero {
  text-align: center;
  padding: 80px 0 64px;

  &__mark {
    width: 120px;
    height: 120px;
  }

  &__steam {
    stroke: tokens.$green;
    opacity: 0.65;
  }

  &__noodles {
    stroke: tokens.$green;
  }

  &__bowl {
    fill: tokens.$blue;
  }

  &__base {
    stroke: tokens.$blue;
  }

  &__title {
    font-family: tokens.$font-display, cursive;
    font-size: clamp(56px, 12vw, 88px);
    font-weight: 400;
    margin: 8px 0 0;
    color: tokens.$purple;
  }

  &__tagline {
    max-width: 30rem;
    margin: 16px auto 0;
    font-size: 20px;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: center;
    margin-top: 36px;
  }

  &__platform {
    margin-top: 20px;
    font-size: 14px;
    opacity: 0.6;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
}

// Mirrors the app's .btn: transparent until hover, then it fills.
.btn {
  display: inline-block;
  padding: 12px 28px;
  font-size: 17px;
  font-weight: bold;
  text-decoration: none;
  border: 1px solid currentcolor;
  background: none;
  cursor: pointer;
  transition: all 0.2s;

  &--primary {
    color: tokens.$green;

    &:hover,
    &:focus-visible {
      background: tokens.$green;
      color: tokens.$black;
    }
  }

  &--secondary {
    color: tokens.$light-theme-amber;

    &:hover,
    &:focus-visible {
      background: tokens.$light-theme-amber;
      color: tokens.$black;
    }
  }
}

// --- Features -----------------------------------------------------------

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
  padding-bottom: 72px;
}

.feature {
  border: 1px solid rgba(86, 156, 214, 0.25);
  padding: 24px;

  h3 {
    font-family: tokens.$font-display, cursive;
    font-weight: 400;
    font-size: 26px;
    margin: 0 0 8px;
    color: tokens.$green;
  }

  p {
    margin: 0;
    font-size: 16px;
  }

  code {
    font-size: 13px;
    color: tokens.$light-theme-amber;
    word-break: break-all;
  }
}

kbd {
  display: inline-block;
  min-width: 1.6em;
  padding: 1px 6px;
  margin: 0 1px;
  border: 1px solid rgba(181, 206, 168, 0.5);
  border-radius: 4px;
  font-family: inherit;
  font-size: 0.9em;
  text-align: center;
  color: tokens.$green;
}

// --- How it works -------------------------------------------------------

.how {
  border-top: 1px solid rgba(86, 156, 214, 0.2);
  padding: 56px 0 72px;
  text-align: center;

  &__title {
    font-family: tokens.$font-display, cursive;
    font-weight: 400;
    font-size: 34px;
    margin: 0 0 28px;
    color: tokens.$purple;
  }

  &__steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 32px;

    li {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 17px;
    }
  }

  &__num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: tokens.$green;
    color: tokens.$black;
    font-weight: bold;
    flex-shrink: 0;
  }
}

// --- Footer -------------------------------------------------------------

.footer {
  border-top: 1px solid rgba(86, 156, 214, 0.2);
  padding: 28px 24px 40px;
  text-align: center;
  font-size: 14px;
  opacity: 0.75;

  a {
    color: tokens.$green;
  }

  &__dot {
    margin: 0 10px;
    opacity: 0.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}
```

- [ ] **Step 2: Build the site**

Run: `npm run site:build`
Expected: build succeeds; `site/dist/index.html`, a hashed `.css` file, the two `.ttf` files, and
`bowl.png` appear in `site/dist/assets/` or `site/dist/`.

**If the build fails on the font `url()` paths** (Vite reporting it cannot resolve a file outside
the project root, or emitting the fonts without rebasing): copy the two `.ttf` files into
`site/assets/fonts/` and change the two `src:` paths to `url('../assets/fonts/<name>.ttf')`. That
duplicates ~86KB of font data but is self-contained. Try the shared path first.

- [ ] **Step 3: Confirm the output actually references the assets**

Run: `grep -o 'href="[^"]*\.css"' site/dist/index.html && find site/dist -type f | sort`
Expected: a hashed CSS filename in the HTML, and the two `.ttf` files plus `bowl.png` present
somewhere in the output tree.

- [ ] **Step 4: Run the full suite**

Run: `npm test && npm run lint && npm run typecheck`
Expected: 62 tests passing (55 existing + 7 new), no lint errors, no type errors.

- [ ] **Step 5: Commit**

```bash
git add site/styles/site.scss
git commit -m "Style the landing page

Consumes the shared tokens, so the page carries the app's palette.
Buttons mirror the app's transparent-until-hover treatment."
```

---

## Task 6: Look at the page

A structural test cannot tell you the page looks right. This task is a human check.

**Files:** none

- [ ] **Step 1: Serve it**

Run: `npm run site:dev`
Expected: Vite prints a local URL (port 5174 or similar — **not** 3000, and it will avoid 5173 if
the app's dev server is running).

- [ ] **Step 2: Check it in a browser**

Open the URL and confirm:
- Both fonts load — the title is the script face (Leckerli One), body text is ABeeZee. If either
  falls back to a system font, the `@font-face` path is wrong.
- The SVG bowl renders as a bowl, not a blank box.
- Hovering each button fills it with its colour.
- Narrowing the window to phone width reflows the feature grid to one column without horizontal
  scrolling.

- [ ] **Step 3: Stop the dev server**

Ctrl-C.

---

## Task 7: Update the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the new scripts**

In `README.md`, in the Scripts table, add two rows after the `npm run make` row:

```markdown
| `npm run site:dev` | Run the landing page locally |
| `npm run site:build` | Build the landing page to `site/dist` |
```

- [ ] **Step 2: Add a short section**

Add this section immediately before the `## How it works` heading:

```markdown
## Landing page

`site/` holds a static landing page, built separately from the app:

```bash
npm run site:dev      # preview it
npm run site:build    # output to site/dist (gitignored)
```

It ships no JavaScript and shares the app's palette through
`src/shared/styles/_tokens.scss`. Two links are not live yet: the download
points at the GitHub releases page, which has no releases, and the support
link is a placeholder. `site/site.test.ts` asserts the placeholder so that
hooking it up is a deliberate change.

Nothing publishes it — no CI, no Pages configuration.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document the landing page in the README"
```

---

## Final verification

- [ ] **Run everything**

```bash
npm test
npm run lint
npm run typecheck
npm run site:build
npx vite build --config vite.renderer.config.mts
```

Expected, in order: 62 tests passing across 9 files; no lint errors; no type errors; site build
succeeds; renderer build succeeds (this last one proves Task 1's token refactor did not break the
app's styles).

- [ ] **Confirm the working tree is clean**

Run: `git status --short`
Expected: empty. `site/dist/` must not appear — if it does, Task 2 step 5 was missed.

- [ ] **Confirm what is deliberately not done**

Both are recorded in the spec, and are not bugs:
- The download URL 404s until a release is cut.
- The support link is `#`.
