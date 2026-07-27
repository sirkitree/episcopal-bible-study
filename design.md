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
