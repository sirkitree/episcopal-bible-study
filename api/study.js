import * as cheerio from "cheerio";

const SOURCE_HOST = "www.episcopalchurch.org";
const CACHE_OK = "public, s-maxage=1800, stale-while-revalidate=86400";
const CACHE_MISS = "public, s-maxage=300, stale-while-revalidate=1800";
const READING_LABEL = /^(Old Testament|First Reading|Psalm|Canticle|Epistle|Second Reading|Gospel)\s*:\s*(.+)$/i;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const detail = safeSourceUrl(req.query.detail);
    const hub = safeSourceUrl(req.query.hub);

    if (!detail && !hub) {
      res.status(400).json({ ok: false, error: "Missing detail or hub URL" });
      return;
    }

    const resolved = await resolveStudyUrl(detail, hub);
    if (!resolved) {
      res.setHeader("Cache-Control", CACHE_MISS);
      res.status(404).json({ ok: false, error: "Study is not available yet" });
      return;
    }

    const html = await fetchText(resolved);
    const study = parseStudy(html, resolved);
    const tracks = await loadTracks(study.lectionaryUrl);

    res.setHeader("Cache-Control", CACHE_OK);
    res.status(200).json({ ok: true, ...study, tracks });
  } catch (error) {
    res.setHeader("Cache-Control", CACHE_MISS);
    res.status(500).json({ ok: false, error: error.message || "Unable to load study" });
  }
}

function safeSourceUrl(raw) {
  if (!raw || typeof raw !== "string") return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== SOURCE_HOST) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function resolveStudyUrl(detail, hub) {
  if (detail && await exists(detail)) return detail;
  if (!hub) return null;

  const html = await fetchText(hub);
  const $ = cheerio.load(html);
  const links = [];

  $("a[href*='/bible_study/']").each((_, el) => {
    const href = absoluteUrl($(el).attr("href"), hub);
    const text = cleanText($(el).text());
    if (href && text && /bible study:/i.test(text)) links.push(href);
  });

  return links[0] || null;
}

async function exists(url) {
  const response = await fetch(url, { redirect: "follow" });
  return response.ok;
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Source returned ${response.status}`);
  return response.text();
}

function parseStudy(html, sourceUrl) {
  const $ = cheerio.load(html);
  const titleEl = $("h1").filter((_, el) => /^Bible Study:/i.test(cleanText($(el).text()))).first();
  if (!titleEl.length) throw new Error("Unable to find Bible study article");

  const title = cleanText(titleEl.text());
  const articleNodes = collectArticleNodes($, titleEl);
  const meta = extractMeta($, articleNodes);
  const sections = [];
  let current = null;
  let image = null;
  const downloads = [];

  for (const node of articleNodes) {
    const el = $(node);
    const tag = node.tagName?.toLowerCase();
    const text = cleanText(el.text());
    if (!text && tag !== "img" && !el.find("img").length) continue;
    if (shouldStop(text, el)) break;

    const download = extractDownload($, el, sourceUrl);
    if (download) {
      downloads.push(download);
      continue;
    }

    if (!image) {
      const img = el.is("img") ? el : el.find("img").first();
      if (img.length) {
        const src = absoluteUrl(img.attr("src"), sourceUrl);
        if (src) image = { src, alt: cleanText(img.attr("alt") || "") };
      }
    }

    if (isMetaText(text, meta) || isLanguageSwitcher(text)) continue;

    const heading = sectionHeading(el);
    if (heading) {
      current = { heading, blocks: [] };
      sections.push(current);
      const remainder = text.replace(/^[^|]+\|\s*/, "").trim();
      if (remainder) current.blocks.push({ type: "paragraph", text: remainder });
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const items = el.find("li").map((_, li) => cleanText($(li).text())).get().filter(Boolean);
      if (items.length) ensureSection().blocks.push({ type: "list", items });
      continue;
    }

    if (tag === "p" || tag === "div" || /^h[2-6]$/.test(tag || "")) {
      if (text && !/^RCL:/i.test(text)) ensureSection().blocks.push({ type: "paragraph", text });
    }
  }

  return {
    sourceUrl,
    title,
    ...meta,
    image,
    sections: sections.filter(section => section.blocks.length),
    downloads: uniqueDownloads(downloads)
  };

  function ensureSection() {
    if (!current) {
      current = { heading: "Study", blocks: [] };
      sections.push(current);
    }
    return current;
  }
}

/* During the Season after Pentecost the RCL appoints two tracks of Old Testament and
   psalm readings, but a bible-study page prints only the track its author used. The
   lectionary page for the same Sunday carries both, as a pair of labelled tabs, so the
   tracks are read from there. Returns null for Sundays with a single set of readings
   (no tabs) and whenever the lectionary page can't be read, which leaves the client
   rendering the study's own flat list of readings. */
async function loadTracks(lectionaryUrl) {
  if (!lectionaryUrl) return null;

  try {
    return parseTracks(await fetchText(lectionaryUrl));
  } catch {
    return null;
  }
}

function parseTracks(html) {
  const $ = cheerio.load(html);
  const content = $("div.entry-content").first();
  const tabs = content.find(".wp-block-getwid-tabs").first();
  if (!tabs.length) return null;

  const navs = tabs.find(".wp-block-getwid-tabs__nav-link").map((_, el) => cleanText($(el).text())).get();
  const panels = tabs.find(".wp-block-getwid-tabs__tab-content").toArray();
  const track = number => {
    const index = navs.findIndex(nav => new RegExp(`^track\\s*${number}\\b`, "i").test(nav));
    return index >= 0 && panels[index] ? readingRefs($, $(panels[index])) : [];
  };

  const one = track(1);
  const two = track(2);
  if (!one.length || !two.length) return null;

  // Epistle and gospel sit outside the tabs: both tracks share them.
  return { one, two, shared: readingRefs($, content, true) };
}

function readingRefs($, scope, skipTabs) {
  const refs = [];

  scope.find("p").each((_, el) => {
    const paragraph = $(el);
    if (skipTabs && paragraph.closest(".wp-block-getwid-tabs").length) return;
    if (!paragraph.children("strong, b").length) return;

    const match = cleanText(paragraph.text()).match(READING_LABEL);
    if (match) refs.push(normalizeReadingRef(match[1], match[2]));
  });

  return refs;
}

// Some entries drop the book from a psalm ("Psalm: 145:10-19") or space out the chapter
// colon ("Psalm 17: 1-7"); both break the client's scripture-reference detection.
function normalizeReadingRef(label, ref) {
  const tidy = ref.replace(/(\d)\s*:\s*(\d)/g, "$1:$2").trim();
  return /^psalm/i.test(label) && /^\d/.test(tidy) ? `Psalm ${tidy}` : tidy;
}

function collectArticleNodes($, titleEl) {
  const nodes = [];
  let cursor = titleEl.next();

  while (cursor.length) {
    nodes.push(cursor[0]);
    cursor = cursor.next();
  }

  return nodes;
}

function extractMeta($, nodes) {
  const meta = { date: "", author: "", authorUrl: "", readings: "", lectionaryUrl: "" };

  for (const node of nodes.slice(0, 12)) {
    const el = $(node);
    const text = cleanText(el.text());
    if (!meta.date && /^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(text)) meta.date = text;

    if (!meta.author) {
      const authorLink = el.find("a[href*='/authors/']").first();
      if (authorLink.length) {
        meta.author = cleanText(authorLink.text());
        meta.authorUrl = absoluteUrl(authorLink.attr("href"), SOURCE_HOST);
      }
    }

    if (!meta.readings && /^\[?RCL\]?\s*:?/i.test(text)) {
      meta.readings = text.replace(/^\[?RCL\]?\s*:?\s*/i, "");
      const link = el.find("a[href*='/lectionary/']").first();
      if (link.length) meta.lectionaryUrl = absoluteUrl(link.attr("href"), SOURCE_HOST);
    }
  }

  return meta;
}

function sectionHeading(el) {
  const strong = el.children("strong, b").first();
  const text = cleanText(strong.text() || el.text());
  const match = text.match(/^(.+?)\s*\|/);
  if (!match) return "";
  return match[1].trim();
}

function extractDownload($, el, base) {
  const link = el.find("a[href$='.pdf'], a[href$='.docx']").addBack("a[href$='.pdf'], a[href$='.docx']").first();
  if (!link.length) return null;

  const url = absoluteUrl(link.attr("href"), base);
  if (!url) return null;

  const ext = url.split(".").pop().toUpperCase();
  return { label: ext === "DOCX" ? "Word" : ext, url };
}

function uniqueDownloads(downloads) {
  const seen = new Set();
  return downloads.filter(download => {
    if (seen.has(download.url)) return false;
    seen.add(download.url);
    return true;
  });
}

function shouldStop(text, el) {
  return /^This page is available in:/i.test(text)
    || /^Don.t forget to subscribe/i.test(text)
    || /^Receive Free Weekly/i.test(text)
    || /^Contact:/i.test(text)
    || /^Give to The/i.test(text)
    || el.find("a[href*='/category/']").length > 0;
}

function isMetaText(text, meta) {
  return text === meta.date
    || text === meta.author
    || /^\[?RCL\]?\s*:?/i.test(text)
    || /^Download$/i.test(text);
}

function isLanguageSwitcher(text) {
  return /^This page is available in:/i.test(text);
}

function absoluteUrl(raw, base) {
  if (!raw) return "";
  try {
    return new URL(raw, base.startsWith("http") ? base : `https://${base}/`).toString();
  } catch {
    return "";
  }
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
