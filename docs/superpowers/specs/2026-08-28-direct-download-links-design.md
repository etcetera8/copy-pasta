# Direct download links on the landing page

## Problem

The landing page's Download button sends visitors to
`https://github.com/etcetera8/copy-pasta/releases/latest`. That page is a
release-notes page with an "Assets" disclosure collapsed at the bottom;
someone unfamiliar with GitHub arrives at a changelog, not at a download,
and has to know to expand a fold and pick between two files whose names
mean nothing to them.

The page should let a visitor download without leaving it, and should name
the two Mac builds in terms they can act on.

## Design

### The chooser

The Download button becomes a native `<details>` disclosure. The `<summary>`
keeps the existing `.btn.btn--primary` styling, so the hero is visually
unchanged until it is clicked; clicking expands a panel in place holding one
row per Mac build.

```
<details class="download" data-testid="download">
  <summary class="btn btn--primary download__summary">Download</summary>
  <div class="download__panel">
    <a class="download__option" data-testid="download-option"
       href="https://github.com/etcetera8/copy-pasta/releases/latest/download/Copy-Pasta-arm64.dmg">
      Apple Silicon  <span>M1, M2, M3, M4</span>
    </a>
    <a class="download__option" data-testid="download-option"
       href="https://github.com/etcetera8/copy-pasta/releases/latest/download/Copy-Pasta-x64.dmg">
      Intel  <span>2020 and earlier</span>
    </a>
    <p class="download__help">Not sure which? ... About This Mac ...</p>
  </div>
</details>
```

`<details>` rather than a scripted menu because the page ships no JavaScript
of its own today, and a disclosure is the one interactive control the
platform provides for free -- keyboard-operable, screen-reader-labelled, and
working with scripts disabled. The install steps directly below already use
the same element, so the pattern is established.

Clicking an option downloads in place rather than navigating: GitHub serves
release assets with `Content-Disposition: attachment`, so the browser takes
the file and leaves the page where it is, panel still open. (The `download`
attribute would do nothing here -- it is ignored cross-origin -- so it is
not used, to avoid implying it is what makes this work.)

The `.hero__actions` flex wrapper is removed. It exists to lay out a row of
buttons, and after this change it has one child.

`.hero__platform` ("For macOS -- Apple Silicon and Intel") stays. It is the
signal about what is behind the button *before* the panel is opened.

### Permanent asset URLs

`/releases/latest/download/<name>` is a GitHub redirect that resolves to the
asset called `<name>` on whichever release is newest. It only works if
`<name>` is identical in every release -- so the version has to come out of
the DMG filenames, which are currently `Copy Pasta-1.0.0-arm64.dmg`
(uploaded as `Copy.Pasta-1.0.0-arm64.dmg`, GitHub having replaced the space).

This is done by renaming the files in `release.yml` immediately before
upload, not by setting `name` on `MakerDMG`. That option is the obvious
place to reach for and is wrong twice over: the value is also passed through
as the mounted volume's name, so Finder would show a disk called
"Copy-Pasta-arm64" instead of "Copy Pasta"; and it is a single static string
in a config shared by both arch builds, which land in the same uncleared
`out/make`, so the second build would silently overwrite the first.

The new step sits after "Repackage signed DMGs" (which does `rm -f
out/make/*.dmg` and remakes them, and would otherwise undo the rename):

```bash
for arch in arm64 x64; do
  files=(out/make/*-"$arch".dmg)
  [ ${#files[@]} -eq 1 ] || { echo "expected one $arch dmg, got: ${files[*]}"; exit 1; }
  mv "${files[0]}" "out/make/Copy-Pasta-$arch.dmg"
done
```

The count check is not ceremony: `out/make` is not cleared between the two
arch builds, and a second matching file would otherwise make `mv` fail
obscurely or move the wrong one.

### Alternatives rejected

**Fetch the latest release from the GitHub API at runtime.** Always accurate
and yields exact file sizes, but requires JavaScript on a page that has none,
adds a network round-trip before the button works, and is capped at 60
unauthenticated calls per hour per IP -- so it needs a fallback path that
then never gets exercised.

**Inject the version into the page at build time from `package.json`.** No
runtime JavaScript, and asset names stay as they are, but Pages deploys on
push to `master` while the release is built on tag push. Bumping the version
publishes a page whose links 404 for the length of the release build.

### File sizes

Stated once, approximately -- "each build is about 120 MB" -- rather than per
file. An exact figure hardcoded in HTML is wrong after the next release, with
nothing in the build to notice.

### Tests

`site/site.test.ts` currently pins the single `DOWNLOAD_URL`. That is
replaced by: the chooser exists, holds exactly two options, and their `href`s
are the two permanent URLs.

Added alongside it is a cross-file pin: the test reads
`.github/workflows/release.yml` and asserts the filenames its rename step
produces are exactly the ones the page links to. This is the failure mode the
design invites -- rename the assets in the workflow, and the download links
404 while lint, typecheck, tests, and the release build all stay green. It is
the same shape of guard as `tools/check-app-icon.js` and the workflow's
tag-matches-`package.json` check.

### Backfill

v1.0.0's assets are still versioned, so the permanent links 404 until the
next release. GitHub's release-asset API supports renaming in place
(`PATCH /repos/{owner}/{repo}/releases/assets/{id}`), so both are renamed
with no 240 MB re-upload and the links work as soon as Pages deploys. Links
to the old filenames break; for a v1.0.0 hobby release that is near-zero
cost, and the same call reverses it.

### README

The Releases section says the download button points at `releases/latest`.
It is updated to describe the permanent per-arch URLs and the rename step
they depend on.
