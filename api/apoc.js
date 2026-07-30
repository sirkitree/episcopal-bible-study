const CACHE_MISS = "public, s-maxage=300, stale-while-revalidate=1800";
// `max-age=0` keeps browsers revalidating while `s-maxage` lets the CDN hold the
// response for a week. Without it browsers cache heuristically, and because the
// URL stays the same across a parser change or a CORPUS_REF bump, a reader could
// be pinned to stale output long after a deploy fixed it.
const CACHE_OK = "public, max-age=0, s-maxage=604800, stale-while-revalidate=2592000";
// The index gates every Library view, so it deliberately drops
// stale-while-revalidate: serving a stale copy here hides a book that was just
// added from anyone who has visited before. It is under 2 KB, so always
// revalidating costs a conditional request and nothing more. The CDN still holds
// it for a week, because the pinned ref means it cannot change under us.
const CACHE_INDEX = "public, max-age=0, s-maxage=604800";

const RAW_HOST = "raw.githubusercontent.com";
const CORPUS_REPO = "sirkitree/apoc";
const CORPUS_REF = "56b94450c094fcd02db375b05aa3b968257411f2";
const CORPUS_HOME = `https://github.com/${CORPUS_REPO}`;
const MAX_BYTES = 1_500_000;

// The corpus publishes books.json: per text, the directory, the README, and for
// every file its path, format, edition, translator, source and rights. That is
// the source of truth for all of it — this file only decides which texts the
// Library offers and what to call them.
//
// Keys are the ids used in the app's own URLs. `manifestId` points into
// books.json. `file` picks one specific text where a manifest book holds several
// primary files: the Additions to Daniel are three separate compositions rather
// than alternative editions of one, so the Library lists them separately.
const LIBRARY_BOOKS = {
  "tobit":               { manifestId: "tobit" },
  "judith":              { manifestId: "judith" },
  "wisdom-of-solomon":   { manifestId: "wisdom-of-solomon" },
  "sirach":              { manifestId: "sirach" },
  "baruch":              { manifestId: "baruch" },
  "1-maccabees":         { manifestId: "1-maccabees" },
  "2-maccabees":         { manifestId: "2-maccabees" },
  "1-esdras":            { manifestId: "1-esdras" },
  "2-esdras":            { manifestId: "2-esdras" },
  "prayer-of-manasseh":  { manifestId: "prayer-of-manasseh" },
  "additions-to-esther": { manifestId: "additions-to-esther" },
  "susanna":             { manifestId: "additions-to-daniel", file: "Susanna_KJV.md", name: "Susanna" },
  "bel-and-the-dragon":  { manifestId: "additions-to-daniel", file: "Bel_and_the_Dragon_KJV.md", name: "Bel and the Dragon" },
  "prayer-of-azariah":   { manifestId: "additions-to-daniel", file: "Prayer_of_Azariah_and_Song_of_Three_Holy_Children_KJV.md", name: "Prayer of Azariah" },

  "1-enoch":                 { manifestId: "1-enoch" },
  "2-enoch":                 { manifestId: "2-enoch" },
  "jubilees":                { manifestId: "jubilees" },
  "acts-of-paul-and-thecla": { manifestId: "acts-of-paul-and-thecla" },
  "testament-of-solomon":    { manifestId: "testament-of-solomon" },
  "life-of-adam-and-eve":    { manifestId: "life-of-adam-and-eve" },
  "gospel-of-james":         { manifestId: "gospel-of-james" },
  "gospel-of-thomas":        { manifestId: "gospel-of-thomas" },
  // `pageNumbers` marks the texts whose bare inline numbers are manuscript or
  // codex pages rather than anything to do with the text's own divisions. The
  // sectioned-prose format says this of all its files, but that does not hold:
  // the Apocalypse of Peter carries James's own Akhmim verse numbers inline, plus
  // cross-references to the Greek, so its numbers are marked as neither.
  "gospel-of-mary":          { manifestId: "gospel-of-mary", pageNumbers: true },
  "gospel-of-philip":        { manifestId: "gospel-of-philip", pageNumbers: true },
  "gospel-of-judas":         { manifestId: "gospel-of-judas", pageNumbers: true },
  "apocalypse-of-peter":     { manifestId: "apocalypse-of-peter" }
};

// The corpus groups its texts into three phases, which are exactly the Library's
// three sections.
const GROUP_BY_PHASE = { 1: "deutero", 2: "pseudep", 3: "ntapoc" };

// Manifest format name -> parser. A format absent from this map is one the
// Library does not yet render, and asking for that book returns a clear error
// rather than a mangled text.
const FORMAT_PARSERS = {
  "chapter-caps-verse-lines": "verseLines",
  "chapter-title-verse-lines": "verseLines",
  "verse-lines": "verseLines",
  "chapter-caps-cv-lines": "colonLines",
  "gutenberg-douay-rheims": "douayRheims",
  "cv-paragraphs": "cvParagraphs",
  "cv-paragraphs-ranged": "cvParagraphsRanged",
  "numbered-paragraphs": "numberedParagraphs",
  "sectioned-prose": "sectionedProse"
};

// CORPUS_REF is immutable, so the manifest can be memoised for the life of the
// process. A failure is not cached — the next request retries.
let manifestPromise = null;
function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetchSource("books.json")
      .then(text => {
        const data = JSON.parse(text);
        if (!Array.isArray(data.books)) throw new Error("Corpus manifest is malformed");
        return new Map(data.books.map(book => [book.id, book]));
      })
      .catch(error => { manifestPromise = null; throw error; });
  }
  return manifestPromise;
}

// Resolve an app book id to its manifest entry and the specific file to parse.
async function resolve(key) {
  const wanted = LIBRARY_BOOKS[key];
  const manifest = await loadManifest();
  const book = manifest.get(wanted.manifestId);
  if (!book) throw new Error(`The corpus no longer lists ${wanted.manifestId}.`);

  const candidates = (book.files || []).filter(file => file.primary && file.scripture);
  let file = wanted.file
    ? candidates.find(entry => entry.path.endsWith("/" + wanted.file))
    : candidates[0];
  if (!file) throw new Error(`No primary text for ${wanted.manifestId} in the corpus.`);

  // Some editions of record can't be addressed by verse — their chapter and verse
  // numbers run inside the prose. Where the corpus publishes a mechanically
  // derived rendering that can be, read that instead, but keep the edition of
  // record's provenance since no word of the translation differs.
  if (!FORMAT_PARSERS[file.format] && file.derivedFile) {
    const derived = (book.files || []).find(entry => entry.path === file.derivedFile);
    if (derived && FORMAT_PARSERS[derived.format]) {
      file = { ...derived, edition: derived.edition || file.edition, translator: derived.translator || file.translator, source: derived.source || file.source, rights: derived.rights || file.rights };
    }
  }

  return { wanted, book, file, name: wanted.name || book.name };
}

function corpusUrl(path) {
  return `${CORPUS_HOME}/blob/${CORPUS_REF}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function provenanceOf(file) {
  return {
    edition: file.edition || "",
    translator: file.translator || "",
    source: file.source?.name || "",
    sourceUrl: file.source?.url || CORPUS_HOME,
    rights: file.rights?.status === "public-domain" ? "Public domain" : (file.rights?.status || ""),
    corpusUrl: corpusUrl(file.path)
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.setHeader("Cache-Control", CACHE_MISS);
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (req.query.doc === "index") {
    try {
      await sendIndex(res);
    } catch (error) {
      res.setHeader("Cache-Control", CACHE_MISS);
      res.status(502).json({ ok: false, error: error.message || "Unable to load the Library." });
    }
    return;
  }

  const key = typeof req.query.book === "string" ? req.query.book.trim().toLowerCase() : "";
  if (!/^[a-z0-9-]{1,64}$/.test(key) || !Object.prototype.hasOwnProperty.call(LIBRARY_BOOKS, key)) {
    res.setHeader("Cache-Control", CACHE_MISS);
    res.status(404).json({ ok: false, error: "Unknown book" });
    return;
  }

  const doc = req.query.doc === "essay" ? "essay" : "text";

  try {
    const resolved = await resolve(key);
    if (doc === "essay") await sendEssay(res, key, resolved);
    else await sendText(res, key, resolved);
  } catch (error) {
    res.setHeader("Cache-Control", CACHE_MISS);
    res.status(502).json({ ok: false, error: error.message || "Unable to load this book." });
  }
}

// The Library index: name, section and chapter count for every book on offer,
// so the client holds only what the corpus cannot know — a siglum, a one-line
// description, and the order to show them in.
//
// The chapter count is the one fact here that requires reading the text, so this
// parses each book. That is affordable because CORPUS_REF is immutable: the
// answer cannot change until the pin moves, so it caches for a week and the
// parses are memoised for the life of the process. A book that fails to parse is
// still listed, without a count, rather than taking the whole index down.
const chapterCounts = new Map();

async function countChapters(key) {
  if (chapterCounts.has(key)) return chapterCounts.get(key);
  const { file } = await resolve(key);
  const parser = PARSERS[FORMAT_PARSERS[file.format]];
  if (!parser) return null;
  const count = parser(await fetchSource(file.path), file).length;
  chapterCounts.set(key, count);
  return count;
}

async function sendIndex(res) {
  const manifest = await loadManifest();

  const books = await Promise.all(Object.entries(LIBRARY_BOOKS).map(async ([key, wanted]) => {
    const book = manifest.get(wanted.manifestId);
    if (!book) return null;
    let chapters = null;
    try { chapters = await countChapters(key); } catch { /* listed without a count */ }
    return {
      id: key,
      name: wanted.name || book.name,
      group: GROUP_BY_PHASE[book.phase] || "deutero",
      chapters
    };
  }));

  res.setHeader("Cache-Control", CACHE_INDEX);
  res.status(200).json({ ok: true, books: books.filter(Boolean) });
}

async function sendText(res, key, { book, file, name }) {
  const parser = PARSERS[FORMAT_PARSERS[file.format]];
  if (!parser) {
    res.setHeader("Cache-Control", CACHE_MISS);
    res.status(501).json({ ok: false, error: `The Library cannot yet render ${file.format} texts.` });
    return;
  }

  const chapters = parser(await fetchSource(file.path), file);

  // Refuse to serve a book the parser clearly mangled rather than showing
  // someone a half-empty chapter and letting them assume that's the text.
  // Chapter numbers must also strictly increase: a repeat means the parser
  // invented a chapter, which is how a title line reading "1 ESDRAS" once
  // produced a one-verse chapter 1 ahead of the real one.
  const numbers = chapters.map(chapter => chapter.number);
  const ordered = numbers.every((number, i) => i === 0 || number > numbers[i - 1]);
  if (!chapters.length || !ordered || chapters.some(chapter => !chapter.verses.length)) {
    res.setHeader("Cache-Control", CACHE_MISS);
    res.status(502).json({ ok: false, error: "This book could not be read from the corpus." });
    return;
  }

  // Where the manifest states how many sections a file holds, hold the parse to
  // it: a count that drifts means the heading pattern stopped matching the file,
  // and a silently short text is the failure worth catching.
  const expected = file.structure?.sections;
  const parsed = chapters.reduce((total, chapter) => total + chapter.verses.length, 0);
  if (typeof expected === "number" && parsed !== expected) {
    res.setHeader("Cache-Control", CACHE_MISS);
    res.status(502).json({ ok: false, error: `Expected ${expected} sections in this text but read ${parsed}.` });
    return;
  }

  res.setHeader("Cache-Control", CACHE_OK);
  res.status(200).json({
    ok: true,
    book: { id: key, name, note: book.note || "" },
    pageNumbers: LIBRARY_BOOKS[key].pageNumbers === true,
    chapters: chapters.map(chapter => ({
      number: chapter.number,
      verses: chapter.verses.map(verse => ({
        verse: verse.verse ?? null,
        title: verse.title || "",
        text: verse.text
      }))
    })),
    provenance: provenanceOf(file)
  });
}

// Every book directory carries a README.md of scholarly context. Three of the
// Library's books (Susanna, Bel, Azariah) share a manifest entry and therefore
// one essay — correct, since it covers the Additions to Daniel as a group.
async function sendEssay(res, key, { book, file, name }) {
  const path = book.readme || (file.path.slice(0, file.path.lastIndexOf("/")) + "/README.md");
  const essay = parseEssay(await fetchSource(path));

  if (!essay.sections.length) {
    res.setHeader("Cache-Control", CACHE_MISS);
    res.status(502).json({ ok: false, error: "This essay could not be read from the corpus." });
    return;
  }

  res.setHeader("Cache-Control", CACHE_OK);
  res.status(200).json({
    ok: true,
    book: { id: key, name },
    title: essay.title || name,
    standfirst: essay.standfirst,
    sections: essay.sections,
    provenance: { source: "apoc", sourceUrl: CORPUS_HOME, corpusUrl: corpusUrl(path) }
  });
}

// Markdown to the same typed blocks the study reader already renders, plus
// `heading`, `table` and `quote`. Inline markup is flattened to plain text
// because the client escapes everything and only linkifies scripture
// references — "**Aramaic**" would otherwise render with its asterisks.
function inlineText(value) {
  return String(value || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    // The essays write "--" for both the parenthetical dash and numeric ranges.
    // A range between figures wants an en dash; everything else an em dash.
    .replace(/(\d)\s*--\s*(\d)/g, "$1–$2")
    .replace(/--/g, "—")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEssay(markdown) {
  const sections = [];
  let title = "";
  let standfirst = "";
  let section = null;
  let paragraph = [];
  let list = null;
  let quote = [];
  let table = null;

  // Content before the first "##" is the book's one-line description.
  const open = heading => { section = { heading, blocks: [] }; sections.push(section); };
  const blocks = () => (section ? section.blocks : null);

  const flush = () => {
    if (paragraph.length) {
      const text = inlineText(paragraph.join(" "));
      if (text) { if (blocks()) blocks().push({ type: "paragraph", text }); else if (!standfirst) standfirst = text; }
      paragraph = [];
    }
    if (list) { if (list.items.length && blocks()) blocks().push(list); list = null; }
    if (quote.length) {
      const text = inlineText(quote.join(" "));
      if (text && blocks()) blocks().push({ type: "quote", text });
      quote = [];
    }
    if (table) { if (table.rows.length && blocks()) blocks().push(table); table = null; }
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();

    if (!line || /^(-{3,}|={3,}|\*{3,})$/.test(line)) { flush(); continue; }

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) { flush(); if (!title) title = inlineText(h1[1]); continue; }

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) { flush(); open(inlineText(h2[1])); continue; }

    const h3 = line.match(/^#{3,6}\s+(.+)$/);
    if (h3) { flush(); if (blocks()) blocks().push({ type: "heading", text: inlineText(h3[1]) }); continue; }

    if (line.startsWith("|")) {
      const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => inlineText(cell));
      if (cells.every(cell => /^:?-{1,}:?$/.test(cell.replace(/—/g, "--")))) continue;  // alignment row
      if (paragraph.length || list || quote.length) flush();
      if (!table) table = { type: "table", headers: cells, rows: [] };
      else table.rows.push(cells);
      continue;
    }
    if (table) flush();

    const bullet = line.match(/^(?:[-*+]|\d+\.)\s+(.+)$/);
    if (bullet) {
      if (paragraph.length || quote.length) flush();
      if (!list) list = { type: "list", items: [] };
      list.items.push(inlineText(bullet[1]));
      continue;
    }
    if (list) flush();

    if (line.startsWith(">")) {
      if (paragraph.length) flush();
      quote.push(line.replace(/^>\s?/, ""));
      continue;
    }
    if (quote.length) flush();

    paragraph.push(line);
  }
  flush();

  return { title, standfirst, sections: sections.filter(entry => entry.blocks.length) };
}

async function fetchSource(path) {
  const url = `https://${RAW_HOST}/${CORPUS_REPO}/${CORPUS_REF}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Corpus returned ${response.status}`);

  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BYTES) throw new Error("Corpus file is unexpectedly large");

  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error("Corpus file is unexpectedly large");
  return text;
}

const GUTENBERG_START = /^\*\*\*\s*START OF THE PROJECT GUTENBERG.*$/m;
const GUTENBERG_END = /^\*\*\*\s*END OF THE PROJECT GUTENBERG.*$/m;

function stripGutenberg(text) {
  let body = text;
  const start = body.match(GUTENBERG_START);
  if (start) body = body.slice(start.index + start[0].length);
  const end = body.match(GUTENBERG_END);
  if (end) body = body.slice(0, end.index);
  return body;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// "Chapter 1" headings with one verse per line, opening with the verse number.
// Wisdom, Baruch, Susanna, Bel, Azariah, Additions to Esther. Books of a single
// chapter carry no heading at all, so verses seen before one start chapter 1.
function parseVerseLines(text) {
  const lines = text.split(/\r?\n/);
  const HEADING = /^chapter\s+(\d{1,3})\s*$/i;

  // Only a book with no chapter headings at all may open a chapter implicitly.
  // Otherwise the title line of "1 ESDRAS" or "2 ESDRAS" matches the verse shape
  // and manufactures a spurious chapter 1 ahead of the real one.
  const titled = lines.some(line => HEADING.test(line.trim()));

  const chapters = [];
  let current = null;
  const open = number => { current = { number, verses: [] }; chapters.push(current); };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^[-=]{3,}$/.test(line)) continue;

    const heading = line.match(HEADING);
    if (heading) { open(Number(heading[1])); continue; }

    // Titles, source notes and the prose preface some files carry simply don't
    // match the verse shape and fall through.
    const verse = line.match(/^(\d{1,3})[ \t]+(.+)$/);
    if (!verse) continue;
    if (!current) { if (titled) continue; open(1); }
    current.verses.push({ verse: Number(verse[1]), text: cleanText(verse[2]) });
  }
  return chapters;
}

// One verse per line prefixed "1:1 ". 1 Maccabees.
function parseColonLines(text) {
  return collectByMarker(text.split(/\r?\n/), /^(\d{1,3}):(\d{1,3})[ \t]+(.+)$/);
}

// Project Gutenberg Douay-Rheims: verses are blank-line separated paragraphs
// opening "1:1. ". Editorial footnotes sit between verses as ordinary
// paragraphs and must be dropped rather than folded into the verse above —
// which is exactly what not matching the marker achieves.
function parseDouayRheims(text) {
  return collectByMarker(stripGutenberg(text).split(/\n\s*\n/), /^(\d{1,3}):(\d{1,3})\.\s+([\s\S]+)$/);
}

// Chapters are driven by the verse markers rather than by chapter headings: the
// Sirach text is missing its "Chapter 48" heading even though all 28 of that
// chapter's verses are present.
function collectByMarker(blocks, marker) {
  const chapters = [];
  const byNumber = new Map();

  for (const block of blocks) {
    const found = block.trim().match(marker);
    if (!found) continue;

    const number = Number(found[1]);
    let current = byNumber.get(number);
    if (!current) { current = { number, verses: [] }; byNumber.set(number, current); chapters.push(current); }
    current.verses.push({ verse: Number(found[2]), text: cleanText(found[3]) });
  }
  chapters.sort((a, b) => a.number - b.number);
  return chapters;
}

// R. H. Charles's Enoch and Jubilees: verses are paragraphs opening "1:1 ", and a
// verse may carry continuation lines indented four spaces that preserve his line
// layout in poetic passages. Those belong to the verse and are folded in by
// cleanText. A continuation of the form "[<witness>: ...]" is apparatus — a
// parallel recension in another language — and is dropped. Charles's own square
// brackets around restored text carry no witness label and so survive.
const APPARATUS = /^\s{2,}\[[^:\]]+:[^\]]*\]\s*$/;

function parseCvParagraphs(text) {
  const blocks = text.split(/\n\s*\n/).map(block =>
    block.split(/\r?\n/).filter(line => !APPARATUS.test(line)).join("\n"));
  return collectByMarker(blocks, /^(\d{1,3}):(\d{1,3})\s+([\s\S]+)$/);
}

// Texts with no chapters at all, divided only into numbered sections: the whole
// book is one chapter whose verses are those sections, which is what the reader
// wants for a work read straight through.
function parseNumberedParagraphs(text) {
  const verses = [];
  for (const block of text.split(/\n\s*\n/)) {
    const found = block.trim().match(/^(\d{1,3})\.\s+([\s\S]+)$/);
    if (found) verses.push({ verse: Number(found[1]), text: cleanText(found[2]) });
  }
  return verses.length ? [{ number: 1, verses }] : [];
}

// The body of a sectioned file is delimited by rules of 70+ equals signs: the
// translator's front matter stands before the first and their notes after the
// second, and neither is part of the text.
function bodyLines(text) {
  const lines = text.split(/\r?\n/);
  const rules = [];
  lines.forEach((line, i) => { if (/^={70,}$/.test(line.trim())) rules.push(i); });
  if (!rules.length) return lines;
  return lines.slice(rules[0] + 1, rules.length > 1 ? rules[1] : lines.length);
}

// Prose divided into named sections rather than numbered verses — the Mattison
// translations of Thomas, Mary, Philip and Judas. The heading pattern differs per
// translation, so it comes from the manifest rather than being guessed. Sections
// become the verses of a single chapter, carrying a title; where the heading is
// numbered (Thomas's sayings) that number is used, and an unnumbered section such
// as Thomas's Prologue keeps a null number so the reader shows no numeral.
function parseSectionedProse(text, file) {
  const structure = file.structure || {};
  if (!structure.sectionHeading) return [];
  const isHeading = new RegExp(structure.sectionHeading);
  const numbered = structure.sectionNumber ? new RegExp(structure.sectionNumber) : null;

  const sections = [];
  let current = null;
  for (const raw of bodyLines(text)) {
    const line = raw.trim();
    if (!line || /^[-=]{3,}$/.test(line)) continue;
    if (isHeading.test(line)) {
      const found = numbered && line.match(numbered);
      current = { number: found ? Number(found[1]) : null, title: line, lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }

  // A trailing heading with no prose under it is the ancient colophon repeating
  // the work's title, not a section.
  while (sections.length && !sections[sections.length - 1].lines.length) sections.pop();

  const verses = sections.map(section => ({
    verse: section.number,
    // Strip the numbering from a numbered heading; the number is shown already.
    title: numbered ? section.title.replace(numbered, "").trim() || section.title : section.title,
    text: cleanText(section.lines.join(" "))
  })).filter(verse => verse.text);

  return verses.length ? [{ number: 1, verses }] : [];
}

// As cvParagraphs, but a marker may name a range where the printed edition
// numbers two verses together, and the body is delimited.
function parseCvParagraphsRanged(text, file) {
  const blocks = bodyLines(text).join("\n").split(/\n\s*\n/).map(block =>
    block.split(/\r?\n/).filter(line => !APPARATUS.test(line)).join("\n"));
  const chapters = collectByMarker(blocks, /^(\d{1,3}):(\d{1,3})(?:-\d{1,3})?\s+([\s\S]+)$/);
  return chapters;
}

const PARSERS = {
  verseLines: parseVerseLines,
  colonLines: parseColonLines,
  douayRheims: parseDouayRheims,
  cvParagraphs: parseCvParagraphs,
  numberedParagraphs: parseNumberedParagraphs,
  sectionedProse: parseSectionedProse,
  cvParagraphsRanged: parseCvParagraphsRanged
};
