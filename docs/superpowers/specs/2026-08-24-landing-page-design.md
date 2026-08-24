# Copy Pasta Landing Page — Design

**Date:** 2026-08-24
**Status:** Approved
**Scope:** A standalone marketing/splash page for Copy Pasta, built as a second Vite entry in this
repo. Describes the app, links to a download, and links to a support/tip page. No change to app
behaviour; one refactor of app styles to share design tokens.

## 1. Background

Copy Pasta has no public-facing page. The README documents it for developers, but there is nowhere
to send someone who just wants to know what the app does and install it.

The app already has a distinct visual identity worth reusing: a VS Code-flavoured dark palette
(`#1e1e1e` ground, `#569CD6` blue, `#B5CEA8` green, `#CD9731` amber, `#811F3F` maroon), Leckerli One
for display type and ABeeZee for body text. The page should look like it belongs to the app, and
should stay that way as the app changes.

Note: `src/renderer/pages/Landing.tsx` is the app's in-app main view. It is unrelated to this work
and is not touched. The new code lives under `site/`.

## 2. Approach

A `site/` workspace built by Vite, separate from the Electron renderer build.

Considered and rejected:

- **Single hand-written static HTML file.** Simplest, but the palette and fonts would be duplicated
  by copy-paste and drift from the app.
- **README expansion only.** Not a landing page; no control over presentation.

The Vite route reuses `vite` and `sass`, which are already devDependencies. Nothing new is
installed.

The page ships **no client-side JavaScript**. It is static content, so the build output is one HTML
file, one CSS file, the fonts, and the icon.

## 2a. Platform positioning

**macOS only.** Windows ships a built-in clipboard manager, so the page targets macOS and says so
plainly rather than listing three platforms. Consequences for the page:

- The hero sub-line reads `For macOS`, not `macOS · Windows · Linux`.
- Shortcuts are written in macOS form only (`⌘⇧V`), with no `Ctrl` alternative.
- The storage path can be stated concretely as
  `~/Library/Application Support/Copy Pasta/history.json` instead of "your user-data directory".

## 3. Layout

```
site/
  index.html            page content
  styles/
    site.scss           layout and page-specific styles
  assets/
    bowl.png            copied from src/main/bowl.png
  site.test.ts          structural assertions against index.html
vite.site.config.mts    root: site/, outDir: site/dist
```

New scripts in `package.json`:

| Script | What it does |
|---|---|
| `npm run site:dev` | Vite dev server for the page |
| `npm run site:build` | Build the page to `site/dist` |

`site/dist/` is added to `.gitignore`.

## 4. Shared design tokens

`$blue`, `$black`, and `$green` are currently hand-duplicated across `src/renderer/styles/index.scss`
and `src/renderer/styles/landing.scss`. The palette moves to a new partial:

```
src/shared/styles/_tokens.scss
```

`index.scss`, `landing.scss`, and `site/styles/site.scss` all `@use` it. `src/shared/` is the
existing home for things both sides of the process boundary depend on, so it is the consistent
place for this.

Uses `@use`, not the deprecated `@import`.

**Variables only — `@font-face` stays in each consumer.** Sass flattens `@use`d partials into the
consuming file and does not rebase relative `url()` paths out of a partial, so a font path written
in the partial would resolve correctly for one consumer and break for the other. Each stylesheet
declares its own `@font-face` with a path correct for its own location. The `.ttf` files are not
duplicated: there remains one copy, in `src/renderer/fonts/`.

This is the only change to existing app code. It removes duplication that already exists, and it is
what makes "the site matches the app" true by construction rather than by discipline.

## 5. Page content

One scrolling page on the `#1e1e1e` ground.

**Hero.** Pasta bowl icon, "Copy Pasta" set in Leckerli One, a one-line tagline, then two buttons —
Download (green, primary) and "Buy me a coffee" (amber, secondary). Under them, a small line reading
`For macOS`.

**Features.** Five cards:

| Feature | Claim |
|---|---|
| Global shortcut | `⌘⇧V` from anywhere; no dock icon, lives in the menu bar |
| Instant search | Filter the whole history as you type |
| Pinning | Pinned entries kept indefinitely; unpinned expire after a week |
| Stays local | History is a JSON file at `~/Library/Application Support/Copy Pasta/history.json`; nothing leaves your machine |
| Light and dark | Both themes, toggled from the menu-bar icon |

**How it works.** Three steps: copy anything → press `⌘⇧V` → click an entry and it pastes into the
app you were in.

**Footer.** GitHub link, MIT license, contributors.

All copy derives from the README and the source, so claims stay accurate. In particular the storage
claim and the one-week expiry are load-bearing. Verified against source: `WEEK_MS = 604800000` in
`src/renderer/store/clipboardStore.ts:4`, pinned items exempt from expiry at line 87. The theme
toggle has no keyboard accelerator — `⌥⌘I` is Toggle Developer Tools — so the page must not
advertise a theme shortcut.

## 6. Links

Both link targets are defined once, near the top of the markup, so changing them is a one-line edit.

- **Download** → `https://github.com/etcetera8/copy-pasta/releases/latest`.
  **Known limitation:** the repository has no published releases yet, so this URL 404s until one is
  cut. Chosen over a `#` placeholder because it needs no follow-up edit once a release exists.
- **Support** → `#`, with an adjacent `<!-- TODO: buy-me-a-coffee URL -->` comment. Deliberately not
  live; to be hooked up later.

## 7. Testing

`site/site.test.ts` reads `index.html` and asserts the structural contract:

- Both hero buttons are present.
- The download link points at the releases URL.
- The support link is the known `#` placeholder — this test is the tripwire that catches it being
  forgotten, and must be updated deliberately when the real URL lands.
- All five feature cards are present.
- No literal `TODO` text appears in user-visible content.

`vitest.config.mts` gains `site/**/*.test.ts` in its `include`; it currently matches `src/**` only.

`tsconfig.json` gains `site/**/*` and `*.config.mts` in its `include`. The `.mts` config files are
currently excluded from typechecking, so the new Vite config would otherwise go unchecked.

Verification before completion: `npm test`, `npm run lint`, `npm run typecheck`, and
`npm run site:build` all pass. Baseline before any change is 55 tests passing across 8 files.

## 8. Out of scope

- Publishing or hosting the page (no CI, no deploy step, no GitHub Pages configuration).
- Cutting a release so the download link resolves.
- The real buy-me-a-coffee URL.
- Per-platform download detection or direct installer links.
- Removing the Windows and Linux makers from `forge.config.ts` (see §9).
- Any change to app behaviour.

## 9. Follow-up, not part of this work

`forge.config.ts` still builds `MakerSquirrel` (Windows), `MakerDeb`, and `MakerRpm` (Linux)
alongside the macOS `MakerDMG` and `MakerZIP`. If Copy Pasta is macOS-only going forward, those
three makers are dead weight in the build. That is a build-configuration change with its own
testing implications, so it is deliberately excluded here and left as a separate decision.
