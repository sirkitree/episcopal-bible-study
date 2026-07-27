# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install deps (only cheerio)
npm run dev        # serve at http://localhost:4173 (server.js)
npm run check      # syntax-check server.js + api/*.js (no test suite exists)
vercel             # deploy preview
vercel --prod      # deploy production
```

Requires Node 18+ for built-in `fetch`. There is no build step and no test framework — `npm run check` (`node --check`) is the only automated check.

## Architecture

A no-framework, no-build app: one static client plus three serverless functions. Content is never copied into the repo — it is fetched live from `episcopalchurch.org` (studies) and `github.com/sirkitree/apoc` (the apocryphal Library) on request and returned as sanitized JSON.

- **`index.html`** — the entire client (HTML + CSS custom properties + vanilla JS in one file). Contains all the liturgical-calendar math. Key pieces: `easter(year)` and `adventFirst(ay)` anchor the calendar; `buildYear(ay)` emits the ordered list of studies for a liturgical year; `SEASONS` maps seasons to display names, colors, and CSS vars; `letterFor(ay)` computes the lectionary year (A/B/C). The client builds the source URLs (`hubUrl`, `studyUrl`, `detailUrl`) itself and passes them to the API. Scripture references are detected via `VERSE_RE` and turned into tap-to-read links (`showVersePanel` → `/api/passage`).

- **`api/study.js`** — given `detail` and/or `hub` query params (full episcopalchurch.org URLs), resolves the real study page, parses the article with cheerio, and returns typed JSON blocks (`sections`, `readings`, `author`, `downloads`). If the dated `detail` URL isn't published yet, it falls back to scraping the season `hub` page to discover the link. Returns `{ ok: false, error }` with a 404 when the study isn't available.

- **`api/passage.js`** — proxies scripture lookups to bible-api.com (World English Bible, public domain). Includes a `clampedRangeFallback` for references that fail as a single range, and a **resolution guard**: bible-api.com resolves an unknown book name to the nearest one it knows rather than erroring, so every response is checked against the book actually returned. Without it, `Prayer of Azariah 1:1` silently returns the Prayer of Manasses and `Song of the Three Holy Children 1:1` returns the Song of Solomon. `BOOK_ALIASES` lists the only renames that are legitimate.

- **`api/apoc.js`** — serves the Library from the [apoc](https://github.com/sirkitree/apoc) corpus. `?book=<id>` returns a whole book as parsed chapters and verses; `?book=<id>&doc=essay` returns that book's scholarly essay as typed blocks. The corpus publishes `books.json`, which is the source of truth for every text's path, format, edition, translator, source and rights; this handler memoises it per cold start (safe, since `CORPUS_REF` is immutable) and holds only `LIBRARY_BOOKS`, deciding which texts the Library offers and what to call them. The client sends only a key from `LIBRARY_BOOKS` — never a path or URL — so nothing user-controlled reaches `fetch`.

  `FORMAT_PARSERS` maps the manifest's format names to parsers; a format that isn't mapped returns a clear 501 rather than a mangled text. Five parsers exist today: `verseLines` (`1 <text>`), `colonLines` (`1:1 <text>`), `douayRheims` (Project Gutenberg paragraphs, whose interleaved editorial footnotes must be dropped), `cvParagraphs` (Charles's Enoch and Jubilees, whose four-space continuation lines belong to the verse but whose `[<witness>: ...]` apparatus lines do not), and `numberedParagraphs` (a book with no chapters, served as one chapter whose verses are its numbered sections). Two traps are worth knowing: chapters are driven by the verse markers rather than the chapter headings, because the Sirach source was missing its "Chapter 48" heading; and `verseLines` only opens a chapter implicitly when a file has no chapter headings at all, because otherwise a title line reading `1 ESDRAS` matches the verse shape and manufactures a spurious chapter 1.

  A parse that yields no chapters, an empty chapter, or chapter numbers that do not strictly increase is refused with a 502 rather than served.

- **`server.js`** — local-only shim. Serves static files and adapts Node's `http` req/res into the Vercel `req.query` / `res.status().json()` shape the handlers expect (`toVercelRequest` / `toVercelResponse`), so `api/*.js` run unchanged locally and on Vercel. Not used in production (Vercel invokes the handlers directly per `vercel.json`).

## Conventions & constraints

- **Each handler owns exactly one allowlisted host, declared as a module constant in that file. Handlers never share an allowlist** — a shared module would turn one function's boundary into a surface where a bug in one path widens another. `api/study.js` has `SOURCE_HOST` / `safeSourceUrl` (`www.episcopalchurch.org`); `api/apoc.js` has `RAW_HOST` / `CORPUS_REPO` / `CORPUS_REF`; `api/passage.js` hardcodes bible-api.com in `PROVIDERS`. Preserve the allowlists and the HTTPS-only check when touching any fetch path — this is the core security boundary.
- **`api/apoc.js` pins the corpus to a commit SHA (`CORPUS_REF`), never a branch.** An edit to the corpus can then never silently change what the app serves. **To take in corpus changes: bump `CORPUS_REF`, re-run the book and essay checks for every id in `BOOKS`, and confirm chapter counts and verse totals are unchanged or expected.** The pinned ref is also why `CACHE_OK` can be a week — but note it carries `max-age=0`, so browsers revalidate rather than pinning themselves to output from before a parser fix.
- **API responses are typed JSON blocks, never raw upstream HTML.** Keep parsing/sanitizing server-side.
- All API handlers are GET-only and set `Cache-Control` (`CACHE_OK` / `CACHE_MISS`) on every response, including errors; follow that pattern for new endpoints.
- Author attribution, lectionary readings, and a link back to the original must always be preserved in rendered studies (content is The Episcopal Church's work; only the app code is MIT). The same rule applies to the Library: every reading and essay view shows its edition, source, and a link to the exact file at the pinned commit.
- **Books are only added to the Library once their text has been verified by parsing the real file.** Chapter counts in the client `LIBRARY` manifest are display hints; the chapter grid is built from the numbers the API actually returns, which is what makes Additions to Esther (chapters 10–16) render correctly.
- **Markdown is never hard-wrapped at 80 columns.** Write one line per paragraph/bullet and let it soft-wrap — this applies everywhere, including commit messages, PR descriptions, and docs.
- See `design.md` for full design notes.
