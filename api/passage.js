const CACHE_OK = "public, s-maxage=86400, stale-while-revalidate=604800";
const CACHE_MISS = "public, s-maxage=300, stale-while-revalidate=1800";
const MAX_QUERY_LENGTH = 80;

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

  try {
    const lookup = normalizeLookup(q);
    const { response, data } = await fetchPassage(lookup);

    if (!response.ok || data.error) {
      const fallback = await clampedRangeFallback(lookup);
      if (fallback) {
        res.setHeader("Cache-Control", CACHE_OK);
        res.status(200).json({ ok: true, requestedReference: q, ...normalizePassage(fallback.data, fallback.note) });
        return;
      }

      res.setHeader("Cache-Control", CACHE_MISS);
      res.status(404).json({ ok: false, error: data.error || "Passage not found" });
      return;
    }

    res.setHeader("Cache-Control", CACHE_OK);
    res.status(200).json({ ok: true, requestedReference: q, ...normalizePassage(data) });
  } catch (error) {
    res.setHeader("Cache-Control", CACHE_MISS);
    res.status(500).json({ ok: false, error: error.message || "Unable to load passage" });
  }
}

async function fetchPassage(query) {
  const url = new URL(`https://bible-api.com/${encodeURIComponent(query)}`);
  url.searchParams.set("translation", "web");
  const response = await fetch(url, { redirect: "follow" });
  return { response, data: await response.json() };
}

async function clampedRangeFallback(query) {
  const parsed = query.match(/^(.+?)\s+(\d{1,3}):(\d{1,3})(?:-\d{1,3})?$/);
  if (!parsed) return null;

  const [, book, chapter, start] = parsed;
  const whole = await fetchPassage(`${book} ${chapter}`);
  if (!whole.response.ok || whole.data.error || !Array.isArray(whole.data.verses)) return null;

  const lastVerse = whole.data.verses.at(-1)?.verse;
  if (!lastVerse || Number(start) > lastVerse) return null;

  const clampedQuery = `${book} ${chapter}:${start}-${lastVerse}`;
  if (clampedQuery === query) return null;

  const clamped = await fetchPassage(clampedQuery);
  if (!clamped.response.ok || clamped.data.error) return null;

  return {
    data: clamped.data,
    note: `The requested range ends beyond verse ${lastVerse} in this translation, so the available text is shown.`
  };
}

function normalizePassage(data, note = "") {
  return {
    reference: data.reference || "",
    translation: data.translation_name || "World English Bible",
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
