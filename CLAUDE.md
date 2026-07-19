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

A no-framework, no-build app: one static client plus two serverless functions. Content is never copied into the repo — it is fetched live from `episcopalchurch.org` on request and returned as sanitized JSON.

- **`index.html`** — the entire client (HTML + CSS custom properties + vanilla JS in one file). Contains all the liturgical-calendar math. Key pieces: `easter(year)` and `adventFirst(ay)` anchor the calendar; `buildYear(ay)` emits the ordered list of studies for a liturgical year; `SEASONS` maps seasons to display names, colors, and CSS vars; `letterFor(ay)` computes the lectionary year (A/B/C). The client builds the source URLs (`hubUrl`, `studyUrl`, `detailUrl`) itself and passes them to the API. Scripture references are detected via `VERSE_RE` and turned into tap-to-read links (`showVersePanel` → `/api/passage`).

- **`api/study.js`** — given `detail` and/or `hub` query params (full episcopalchurch.org URLs), resolves the real study page, parses the article with cheerio, and returns typed JSON blocks (`sections`, `readings`, `author`, `downloads`). If the dated `detail` URL isn't published yet, it falls back to scraping the season `hub` page to discover the link. Returns `{ ok: false, error }` with a 404 when the study isn't available.

- **`api/passage.js`** — proxies scripture lookups to bible-api.com (World English Bible, public domain). Includes a `clampedRangeFallback` for references that fail as a single range.

- **`server.js`** — local-only shim. Serves static files and adapts Node's `http` req/res into the Vercel `req.query` / `res.status().json()` shape the handlers expect (`toVercelRequest` / `toVercelResponse`), so `api/*.js` run unchanged locally and on Vercel. Not used in production (Vercel invokes the handlers directly per `vercel.json`).

## Conventions & constraints

- **Only `www.episcopalchurch.org` is an allowlisted source host** (`SOURCE_HOST` / `safeSourceUrl` in `api/study.js`). Preserve this allowlist and the HTTPS-only check when touching the fetch path — it is the core security boundary.
- **API responses are typed JSON blocks, never raw upstream HTML.** Keep parsing/sanitizing server-side.
- Both API handlers are GET-only and set `Cache-Control` (`CACHE_OK` / `CACHE_MISS`) on every response; follow that pattern for new endpoints.
- Author attribution, lectionary readings, and a link back to the original must always be preserved in rendered studies (content is The Episcopal Church's work; only the app code is MIT).
- See `design.md` for full design notes.
