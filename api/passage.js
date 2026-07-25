const CACHE_OK = "public, s-maxage=86400, stale-while-revalidate=604800";
const CACHE_MISS = "public, s-maxage=300, stale-while-revalidate=1800";
const MAX_QUERY_LENGTH = 80;

// Single source of truth + allowlist for translations. Only public-domain /
// freely-licensed versions are offered today, all served by bible-api.com.
// A translation belongs here only if it is a complete Bible *including the
// Apocrypha* — the lectionary appoints Sirach, Wisdom, Baruch, Tobit and Judith,
// so a partial text would fail on readings the app links every year. That rules
// out the Bible in Basic English (no Apocrypha) and the Open English Bible (only
// part of the Old Testament translated).
// The `provider` field is the seam for adding a licensed source (NRSV/ESV) later:
// a new provider function in PROVIDERS plus a row here, with no handler changes.
const TRANSLATIONS = {
  web:   { name: "World English Bible",           provider: "bibleApi", code: "web"   },
  webbe: { name: "World English Bible (British)", provider: "bibleApi", code: "webbe" },
  kjv:   { name: "King James Version",            provider: "bibleApi", code: "kjv"   }
};
const DEFAULT_TRANSLATION = "web";

// Provider handlers fetch a passage for a given upstream translation code.
const PROVIDERS = {
  async bibleApi(query, code) {
    const url = new URL(`https://bible-api.com/${encodeURIComponent(query)}`);
    url.searchParams.set("translation", code);
    const response = await fetch(url, { redirect: "follow" });
    return { response, data: await response.json() };
  }
};

// Resolve a raw query param to a valid registry key, defaulting when unknown.
function resolveTranslation(value) {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  return Object.prototype.hasOwnProperty.call(TRANSLATIONS, key) ? key : DEFAULT_TRANSLATION;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const q = cleanQuery(req.query.q);
  if (!q) {
    res.status(400).json({ ok: false, error: "Missing passage reference" });
    return;
  }

  const translation = resolveTranslation(req.query.translation);

  try {
    const lookup = normalizeLookup(q);
    const { response, data } = await fetchPassage(lookup, translation);

    if (!response.ok || data.error) {
      const fallback = await clampedRangeFallback(lookup, translation);
      if (fallback) {
        res.setHeader("Cache-Control", CACHE_OK);
        res.status(200).json({ ok: true, requestedReference: q, ...normalizePassage(fallback.data, translation, fallback.note) });
        return;
      }

      res.setHeader("Cache-Control", CACHE_MISS);
      res.status(404).json({ ok: false, error: await notFoundMessage(lookup, translation, data.error) });
      return;
    }

    res.setHeader("Cache-Control", CACHE_OK);
    res.status(200).json({ ok: true, requestedReference: q, ...normalizePassage(data, translation) });
  } catch (error) {
    res.setHeader("Cache-Control", CACHE_MISS);
    res.status(500).json({ ok: false, error: error.message || "Unable to load passage" });
  }
}

// A lookup can fail because the reference is wrong, or because the chosen
// translation simply does not carry that book — the Open English Bible has only
// part of the Old Testament, and neither it nor the Bible in Basic English has
// the Apocrypha. Probing the default translation tells the two apart without a
// hand-maintained coverage table that would drift as upstream adds books.
async function notFoundMessage(query, translation, upstreamError) {
  const generic = typeof upstreamError === "string" && upstreamError ? upstreamError : "Passage not found";
  if (translation === DEFAULT_TRANSLATION) return generic;

  try {
    const probe = await fetchPassage(query, DEFAULT_TRANSLATION);
    if (probe.response.ok && !probe.data.error) {
      return `${query} is not available in the ${TRANSLATIONS[translation].name}. Try another translation.`;
    }
  } catch (error) {
    // Probe is best-effort; fall back to the upstream message.
  }
  return generic;
}

async function fetchPassage(query, translation = DEFAULT_TRANSLATION) {
  const entry = TRANSLATIONS[translation] || TRANSLATIONS[DEFAULT_TRANSLATION];
  return PROVIDERS[entry.provider](query, entry.code);
}

async function clampedRangeFallback(query, translation = DEFAULT_TRANSLATION) {
  const parsed = query.match(/^(.+?)\s+(\d{1,3}):(\d{1,3})(?:-\d{1,3})?$/);
  if (!parsed) return null;

  const [, book, chapter, start] = parsed;
  const whole = await fetchPassage(`${book} ${chapter}`, translation);
  if (!whole.response.ok || whole.data.error || !Array.isArray(whole.data.verses)) return null;

  const lastVerse = whole.data.verses.at(-1)?.verse;
  if (!lastVerse || Number(start) > lastVerse) return null;

  const clampedQuery = `${book} ${chapter}:${start}-${lastVerse}`;
  if (clampedQuery === query) return null;

  const clamped = await fetchPassage(clampedQuery, translation);
  if (!clamped.response.ok || clamped.data.error) return null;

  return {
    data: clamped.data,
    note: `The requested range ends beyond verse ${lastVerse} in this translation, so the available text is shown.`
  };
}

function normalizePassage(data, translation = DEFAULT_TRANSLATION, note = "") {
  const entry = TRANSLATIONS[translation] || TRANSLATIONS[DEFAULT_TRANSLATION];
  return {
    reference: data.reference || "",
    translation: data.translation_name || entry.name,
    note,
    text: cleanText(data.text || ""),
    verses: Array.isArray(data.verses) ? data.verses.map(verse => ({
      book: verse.book_name,
      chapter: verse.chapter,
      verse: verse.verse,
      text: cleanText(verse.text || "")
    })) : []
  };
}

function cleanQuery(value) {
  if (!value || typeof value !== "string") return "";
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > MAX_QUERY_LENGTH) return "";
  if (!/^[1-3]?\s?[A-Za-z .]+\s+\d{1,3}(?::\d{1,3}[a-d]?(?:-\d{1,3}[a-d]?)?(?:,\s*\d{1,3}[a-d]?(?:-\d{1,3}[a-d]?)?)*)?$/.test(cleaned)) return "";
  return cleaned;
}

function normalizeLookup(query) {
  return query.replace(/(\d{1,3}:\d{1,3})[a-d]\b/gi, "$1").replace(/(-\d{1,3})[a-d]\b/gi, "$1");
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
