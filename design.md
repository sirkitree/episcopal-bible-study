# Bible Study App Design

## Current Product Shape

The app is a single-page, mobile-first Bible study index organized by Episcopal liturgical year. It computes the church calendar in the browser, groups studies by season, and highlights the current week.

The current experience is intentionally lightweight:

- No build step.
- No client framework.
- One static `index.html` file.
- Date calculations happen in vanilla JavaScript.
- Styling is local CSS built around custom properties.
- The interface prioritizes quick scanning over dense reading.

## Visual Language

The app uses a warm, restrained liturgical design rather than a generic content-feed layout.

Core traits:

- Soft paper-like background.
- White or dark raised cards.
- Deep Episcopal red for app chrome and current-week emphasis.
- Liturgical season colors as navigation and orientation cues.
- Rounded geometry throughout.
- Compact typography with strong hierarchy.
- Minimal decoration beyond color, spacing, and card depth.

## Layout

The main layout is a narrow centered column optimized for phones while still comfortable on desktop.

Primary constraints:

- Maximum content width: `680px`.
- Horizontal page padding: `16px`.
- Main list padding: `8px 16px 48px`.
- Footer uses the same maximum width and centered alignment.
- Safe-area insets are respected for modern mobile devices.

## Theme Tokens

Current CSS tokens:

```css
--bg: #f6f5f2;
--surface: #ffffff;
--surface-2: #f0eee9;
--text: #1d1c1a;
--text-muted: #6b6862;
--border: #e3e0d8;
--shadow: 0 1px 2px rgba(0,0,0,.06), 0 1px 8px rgba(0,0,0,.04);
--brand: #7a1623;
--radius: 14px;
--maxw: 680px;
```

Dark mode equivalents are provided through `prefers-color-scheme: dark` and should remain automatic rather than requiring a manual toggle.

## Liturgical Color System

Season color tokens are central to the app design and should be reused in any full-study reading view.

```css
--advent: #3f3a8c;
--christmas: #b8860b;
--epiphany: #2e7d52;
--lent: #6a3d9a;
--holyweek: #a01b2e;
--easter: #c69214;
--pentecost: #2e7d52;
--feast: #b8860b;
--passion: #c0392b;
```

Usage rules:

- Season headers use full-color backgrounds.
- Study cards use a narrow left accent bar.
- Tags use the season color for text and soft tinted backgrounds.
- Feasts and passion observances may override the parent season color.

## Typography

The app uses the system UI stack:

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, system-ui, sans-serif;
```

Current text hierarchy:

- Page title: `1.4rem`, weight `700`.
- Header subtitle: `.9rem`.
- Season header: `.95rem`, uppercase-like tracking through `letter-spacing: .3px`.
- Study title: `1.02rem`, weight `650`, line height `1.2`.
- Date tile day number: `1.5rem`, weight `800`.
- Tags and badges: small uppercase labels with strong weight.

For long-form study content, keep the same typeface but increase reading comfort:

- Article title: `1.45rem` to `1.7rem`.
- Body text: `1rem` to `1.06rem`.
- Body line height: `1.6` to `1.7`.
- Section headings: `1.05rem` to `1.15rem`, weight `750`.
- Question lists: normal body size with generous spacing.

## Components

### Header

The header is a solid brand-red block with white text. It contains the product title, subtitle, and year navigation.

Future article views should keep this header language, but may replace year navigation with:

- Back to studies.
- Study date.
- Lectionary year label.

### Toolbar

The toolbar uses pill controls. Primary actions use `--brand`; secondary controls use bordered surface styling.

Article views should use the same pill pattern for actions such as:

- Back.
- Open original.
- Download PDF or Word, if available.

### Season Headers

Season headers are sticky, rounded blocks with white text and season color backgrounds. They establish the app's strongest visual rhythm.

Article views should use a compact season banner near the top of the article instead of repeated sticky headers.

### Study Cards

Study cards are horizontal, tappable cards containing:

- A narrow season color bar.
- A date tile.
- Title and metadata.
- Chevron affordance.

Cards have `--surface` background, `--border`, `--radius`, and `--shadow`.

### Full Study Article

The full-study view should feel like a natural expansion of the card design.

Recommended structure:

- Header with app title and back action.
- Article shell constrained to `--maxw`.
- Hero card using `--surface`, `--border`, `--radius`, and `--shadow`.
- Season accent bar across the top or left edge.
- Date tile or compact date metadata near the title.
- Lectionary readings presented as a tinted callout.
- Main content divided into readable sections.
- Reflection questions rendered as a distinct question card.
- Practice section rendered as a closing callout.
- Attribution and source links at the bottom.

## Motion And Accessibility

Current motion is subtle and should remain so.

Rules:

- Card tap scale is acceptable for touch feedback.
- Hover effects should only apply inside `@media (hover:hover)`.
- Respect `prefers-reduced-motion: reduce`.
- Use semantic headings for article content.
- Preserve visible focus styles or add explicit accessible focus states when new controls are introduced.
- Keep the main content region announced with `aria-live` only when dynamic replacement is meaningful.

## Dynamic Study Content Plan

### Goal

Replace outbound study-card navigation with an in-app reading experience that fetches the latest Episcopal Church Bible study content in real time, parses the source page, and renders it using the design system above.

### Important Constraint

This cannot be reliably implemented as browser-only JavaScript against `episcopalchurch.org` because cross-origin HTML fetches may be blocked by CORS. The app should add a small same-origin fetch endpoint that retrieves source HTML server-side, normalizes it, and returns structured JSON to the static page.

Good hosting fits:

- Netlify Function.
- Vercel Serverless Function.
- Cloudflare Worker.
- Small Node/Express service.

The static `index.html` can remain framework-free.

### Source URL Resolution

The current app already computes the correct study observance, season, date, and lectionary year. Reuse that computed object as the canonical local model.

Resolution should happen in this order:

1. Try the specific dated detail page when the study is in the current lectionary cycle and is within the publishing lead window.
2. If the detail URL returns `404`, parse the all-years hub page for that observance and choose the newest matching detail link.
3. If no detail link is available, render a friendly unavailable state with an `Open original index` button.

Current source patterns:

- All-years hub: `https://www.episcopalchurch.org/bible-study/proper-7a/`.
- Detail page example: `https://www.episcopalchurch.org/bible_study/bible-study-proper-7-a-june-21-2026/`.

Note: the current generator's dated URL convention is incomplete for at least numbered propers. The source uses `proper-7-a`, not `proper-7a`. The resolver should not depend only on handcrafted detail URL strings; it should be able to discover the detail URL from the hub page.

### Server Endpoint

Add a same-origin endpoint shaped like this:

```txt
GET /api/study?hub=https%3A%2F%2Fwww.episcopalchurch.org%2Fbible-study%2Fproper-7a%2F&detail=https%3A%2F%2Fwww.episcopalchurch.org%2Fbible_study%2Fbible-study-proper-7-a-june-21-2026%2F
```

Return JSON:

```json
{
  "ok": true,
  "sourceUrl": "https://www.episcopalchurch.org/bible_study/bible-study-proper-7-a-june-21-2026/",
  "title": "Bible Study: Proper 7 (A) – June 21, 2026",
  "date": "June 21, 2026",
  "author": "Adelle Dennis",
  "authorUrl": "https://www.episcopalchurch.org/authors/adelle-dennis/",
  "readings": "Genesis 21:8-21, Psalm 86:1-10, 16-17, Romans 6:1b-11, Matthew 10:24-39",
  "lectionaryUrl": "https://www.episcopalchurch.org/lectionary/proper-7a/",
  "tracks": {
    "one": ["Genesis 21:8-21", "Psalm 86:1-10, 16-17"],
    "two": ["Jeremiah 20:7-13", "Psalm 69:8-11, (12-17), 18-20"],
    "shared": ["Romans 6:1b-11", "Matthew 10:24-39"]
  },
  "image": {
    "src": "https://www.episcopalchurch.org/wp-content/uploads/2026/05/Proper-7A-Bible-study-1024x576.png",
    "alt": "Have there been times in your life when God was your ultimate priority?"
  },
  "sections": [
    {
      "heading": "Opening Prayer",
      "blocks": [
        { "type": "paragraph", "text": "O Lord, make us have perpetual love..." }
      ]
    },
    {
      "heading": "Reflection Questions",
      "blocks": [
        { "type": "list", "items": ["This is a challenging gospel lesson. What questions do you have?"] }
      ]
    }
  ],
  "downloads": [
    { "label": "Word", "url": "https://www.episcopalchurch.org/wp-content/uploads/2026/05/Proper-7A-Bible-study.docx" },
    { "label": "PDF", "url": "https://www.episcopalchurch.org/wp-content/uploads/2026/05/Proper-7A-Bible-study.pdf" }
  ]
}
```

### Parser Rules

The server parser should extract only the Bible study article, not site navigation, donation blocks, footer content, podcast promotion, or repeated language-switching blocks.

Extraction strategy:

1. Fetch the detail page HTML.
2. Select the main content container around the page `h1` that starts with `Bible Study:`.
3. Capture the title from that `h1`.
4. Capture date and author from the immediate metadata following the title.
5. Capture readings from the `RCL:` paragraph and preserve its lectionary link.
6. Capture the first meaningful image after the readings as the hero image.
7. Fetch the lectionary page from that link and read the two tracks of readings appointed during the Season after Pentecost. Each track is a tab (`.wp-block-getwid-tabs__nav-link` / `.wp-block-getwid-tabs__tab-content`) holding labelled `Old Testament:` and `Psalm:` paragraphs; the epistle and gospel sit outside the tabs and belong to both tracks. Emit `tracks: null` when the page has no tabs (Sundays with a single set of readings) or can't be read. A study page prints only the track its author used, so the lectionary page is the only source that has both.
8. Convert bold labels ending with `|` into section headings. Examples: `Opening Prayer |`, `Context |`, `Theological Reflection |`, `Reflection Questions |`, `Faith in Practice |`.
9. Preserve paragraphs, emphasis, and unordered lists inside each section.
10. Stop parsing when reaching downloads, categories, language switcher, podcast subscription, contact block, donation block, or footer navigation.
11. Extract PDF and Word download links separately.

Use an HTML parser instead of regular expressions for the main parse. Recommended packages for a Node-based function:

- `cheerio` for practical HTML traversal.
- Native `fetch` for network requests.

### Client-Side Flow

The index should stop using external navigation as the primary action.

New behavior:

1. Each study card becomes an internal button or link with a query/hash route such as `?study=proper-7a&year=2026` or `#study/proper-7a/2026-06-21`.
2. On selection, the app renders an article loading state inside `<main>`.
3. The client calls `/api/study` with the computed hub URL and best-known detail URL.
4. The client renders the returned JSON as a styled article.
5. The browser history is updated so back/forward works.
6. A `Back to index` control restores the computed list without a full page reload.
7. The article includes an `Open original` fallback link using `sourceUrl`.

### Reader-Friendly Rendering

Use the existing design tokens and add only article-specific classes.

Suggested article classes:

```css
.article-shell
.article-card
.article-accent
.article-kicker
.article-title
.article-meta
.readings-card
.hero-image
.study-section
.question-card
.practice-card
.download-row
.source-link
```

Rendering rules:

- Keep the article width at `--maxw`.
- Use one main `article-card` with the season accent color.
- Put readings in a tinted callout using the current season accent.
- Use section cards only where they improve scanning, especially questions and practice.
- Do not reproduce the source site's header, footer, donation prompt, subscription prompt, or navigation.
- Keep original attribution and source links visible.

### Loading, Error, And Cache Behavior

The app should feel live but avoid unnecessary repeated requests.

Recommended behavior:

- Show a skeleton or simple `Loading study...` card immediately.
- Server caches successful source parses for 15 to 60 minutes.
- Server caches 404 or unavailable results for 5 minutes.
- Client can keep an in-memory cache for the current session.
- If parsing fails, show a friendly error card with `Try again` and `Open original` actions.
- If the detail URL fails but the hub page has entries, use the first matching or newest detail link.

### Security And Content Hygiene

Because content comes from an external site, the parser should return structured JSON rather than raw HTML.

Rules:

- Allow only known text block types.
- Normalize external URLs to absolute URLs.
- Strip scripts, inline event handlers, iframes, forms, navigation, and tracking elements.
- Preserve basic inline formatting only if sanitized.
- Treat all source content as untrusted even though the source is reputable.

### Implementation Steps

1. Add serverless endpoint `/api/study` with allowlisted source host `www.episcopalchurch.org`.
2. Build URL resolver that tries detail first and falls back to hub discovery.
3. Build detail-page parser that returns structured JSON.
4. Update `index.html` card clicks to open an internal article route instead of a new tab.
5. Add article rendering functions and article CSS using the tokens in this file.
6. Add loading, unavailable, and error states.
7. Add cache headers or platform cache for the endpoint.
8. Test against current, future, feast, Holy Week, and all-years-only entries.

### Test Cases

Use these cases before considering the feature complete:

- Current week detail page exists.
- Future study has no detail page yet and falls back to hub or unavailable state.
- Numbered proper uses hub discovery to avoid `proper-7a` versus `proper-7-a` URL mistakes.
- Feast page with no predictable dated detail URL.
- Holy Week weekday with all-years-only behavior.
- Page contains downloads.
- Page contains no image.
- Source markup changes enough that a section heading is missing.

## The Library

A second section of the app, reached from a persistent bottom tab bar (Home / Library), carrying the deuterocanonical books alongside the weekly lectionary studies.

### Navigation and chrome

The brand header, year pager, colour key and footer all belong to the lectionary calendar, so `body.library-mode` hides them and shows a plain bar instead: a back arrow and the current title. The arrow is contextual — from the Library index it returns Home, from a book to the index, from a chapter or essay to the book. Routes are hash-based, matching the existing scheme:

```
#library                    the index, grouped by corpus division
#library/<book-id>          a book: description, essay link, chapter grid
#library/<book-id>/<n>      one chapter
#library/<book-id>/about    that book's scholarly essay
```

The tab bar is hidden while the verse panel is open, since on phones that panel is a bottom sheet and would collide.

Eleven of the twenty-five books hold a single chapter — Susanna, the Prayer of Manasseh, the gospels of Thomas, Mary, Philip and Judas, and the rest. For those the book page has nothing to choose: no chapter grid, only a button. So their Library cards link straight to the text, a deep link to their book page redirects there, and the reading view carries the essay link and returns to the Library index instead of to a page nothing points at. Books with real chapters keep the intermediate page, because there the grid is the point.

### Presentation

Book covers are generated from CSS rather than shipped as images: each is an accent-tinted panel carrying the book's scholarly siglum (`Tob`, `Sir`, `1 Mac`), with a spine rule down the left edge and the tint varied slightly per position so a grid of them doesn't read flat. This costs no assets, adapts to dark mode for free, and sits naturally beside the season cards on the Home side. A `cover` field is reserved in the manifest for real artwork later.

Books are three across on a phone and five above 520px, matching `ul.studies`. Chapter grids are six across and nine above the breakpoint. Reading and essay views drop the card container entirely and sit on the page, with a 62ch measure and looser leading for continuous text.

### Corpus contract

Text and essays come from `github.com/sirkitree/apoc`, fetched live through `api/apoc.js` — nothing is copied into this repository. The corpus is pinned to a commit SHA rather than a branch, so a corpus edit can never silently change what the app serves; taking in corpus changes is a deliberate `CORPUS_REF` bump followed by re-verification of every book.

The corpus publishes `books.json`, a manifest giving every text's directory, README, and for each of its files the path, format, edition, translator, source and rights — along with the formats' own heading and verse regexes, and an explicit list of files that are *not* scripture and must never be served as such. That manifest is the source of truth. `api/apoc.js` keeps only `LIBRARY_BOOKS`, which decides which texts the Library offers and what to call them, and which doubles as the allowlist: the client sends a key from it and nothing else, so no user-controlled string reaches the fetch and path traversal is structurally impossible.

Where a manifest book holds several primary files they are separate compositions rather than alternative editions, so the Library lists them separately — the Additions to Daniel appear as Susanna, Bel and the Dragon, and the Prayer of Azariah, all sharing one essay.

`FORMAT_PARSERS` maps manifest format names to parsers, so a format the Library cannot yet render fails loudly with a 501 instead of producing a mangled text. Seven parsers cover every text in the corpus but one:

- `verseLines` — `Chapter 1` headings with one verse per line as `1 <text>`. Single-chapter books carry no heading, so verses seen before one open chapter 1.
- `colonLines` — one verse per line as `1:1 <text>`.
- `douayRheims` — Project Gutenberg text, verses as blank-line separated paragraphs opening `1:1. `. Editorial footnotes sit between verses as ordinary paragraphs and are dropped by not matching the marker.
- `cvParagraphs` — R. H. Charles's Enoch and Jubilees, verses as paragraphs opening `1:1 `. A verse may carry continuation lines indented four spaces preserving his poetic layout; those belong to the verse and are folded in. A continuation of the form `[<witness>: ...]` is apparatus, a parallel recension, and is dropped — while Charles's own square brackets around restored text carry no witness label and so survive.
- `numberedParagraphs` — a text with no chapters, divided only into numbered sections. The whole book becomes one chapter whose verses are those sections, which is what a work read straight through wants and needs no schema change.
- `cvParagraphsRanged` — as `cvParagraphs`, but a marker may name a range where the printed edition numbers two verses together, and the body is delimited by rules of equals signs.
- `sectionedProse` — prose divided into named sections rather than numbered verses: the Mattison translations of Thomas, Mary, Philip and Judas. The heading pattern differs from one translation to the next, so it is read from the manifest per file rather than guessed. Sections become the verses of a single chapter, each carrying a title. Where the heading is numbered — Thomas's sayings — that number is used; an unnumbered section such as Thomas's Prologue keeps a null number and the reader shows no numeral. A trailing heading with no prose beneath it is the ancient colophon repeating the work's title, not a section, and is dropped.

Two rules make this safe to leave running. Where the manifest states how many sections a file holds, the parse is held to that count and a mismatch is refused: a count that drifts means the heading pattern stopped matching the file. And where a text's edition of record cannot be addressed by verse — the Apocalypse of Moses sets its chapter and verse numbers inside the running prose — the manifest names a mechanically derived rendering in `derivedFile`, which is read instead while the edition of record's provenance is kept, since no word of the translation differs.

The one text still not served is the Apocalypse of Peter, where M. R. James's introduction, his notes and the translations he prints are interleaved with no marker between them and no derived rendering yet.

Chapters are driven by the verse markers rather than the chapter headings, because the Sirach source was for a time missing its `Ecclesiasticus Chapter 48` heading even though all 28 of that chapter's verses were present. `verseLines` opens a chapter implicitly only when a file carries no chapter headings anywhere, since otherwise a title line reading `1 ESDRAS` matches the verse shape and manufactures a spurious chapter 1 ahead of the real one.

A parse yielding no chapters, an empty chapter, or chapter numbers that do not strictly increase is refused with a 502 rather than served half-empty. That last check is what catches the spurious-chapter class of bug.

Taking in corpus changes is deliberate: bump `CORPUS_REF`, then re-run the book and essay checks for every id in `LIBRARY_BOOKS` and confirm the chapter counts and verse totals are unchanged or explainable.

Essays are parsed from each book directory's `README.md` into the same typed blocks the study reader uses, extended with `heading`, `table` and `quote`. Inline markup is flattened to plain text, since the client escapes everything and only linkifies scripture references — which means references inside an essay become tap-to-read for free.

### Verse reference safety

bible-api.com resolves a book name it does not recognise to the nearest one it does, rather than returning an error. `Prayer of Azariah 1:1` comes back as the Prayer of Manasses; `Song of the Three Holy Children 1:1` comes back as the Song of Solomon. Serving that is worse than serving nothing, so `api/passage.js` checks every response against the book actually returned and rejects a mismatch. `BOOK_SYNONYMS` groups the names that mean one book and both sides are resolved to their group before comparing. Grouping rather than renaming matters: the name the source returns varies by translation as well as from the name asked with, so a one-directional map rejects valid lookups in one direction.

For the same reason those two books are deliberately absent from `VERSE_RE`: the guard would reject them anyway, and leaving them unlinked avoids a dead tap.
