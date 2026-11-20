// scripts/import-all-jlpt.mjs
import fs from "node:fs";
import path from "node:path";

const KANJI_DATA_URL =
  "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json";
const RADICAL_DECOMP_URL =
  "https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/kradfile-u";
const VOCAB_SOURCES = [
  { level: "N5", url: "https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n5.csv" },
  { level: "N4", url: "https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n4.csv" },
  { level: "N3", url: "https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n3.csv" },
  { level: "N2", url: "https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n2.csv" },
  { level: "N1", url: "https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n1.csv" },
];

const JLPT_MAP = { 5: "N5", 4: "N4", 3: "N3", 2: "N2", 1: "N1" };
const KANJI_RE = /[\u4e00-\u9faf\u3400-\u4dbf]/;
const KANJI_GLOBAL_RE = /[\u4e00-\u9faf\u3400-\u4dbf]/g;

// Common radical-variant -> standard kanji mapping so learners see clear meanings
const RADICAL_NORMALIZE = {
  "亻": "人",
  "氵": "水",
  "扌": "手",
  "忄": "心",
  "訁": "言",
  "釒": "金",
  "飠": "食",
  "糹": "糸",
  "艹": "草",
  "辶": "道",
  "阝": "邑",
  "犭": "犬",
  "王": "玉",
  "月": "月",
  "木": "木",
  "火": "火",
  "土": "土",
  "日": "日",
  "口": "口",
  "目": "目",
  "耳": "耳",
  "女": "女",
  "子": "子",
  "力": "力",
  "刀": "刀",
  "刂": "刀",
  "門": "門",
  "雨": "雨",
  "車": "車",
  "馬": "馬",
  "魚": "魚",
  "鳥": "鳥",
  "貝": "貝",
  "見": "見",
  "売": "売",
  "買": "買",
  "寺": "寺",
  "青": "青",
  "毎": "毎",
  "化": "化",
  "古": "古",
  "十": "十",
  "立": "立",
  "里": "里",
  "田": "田",
  "力": "力",
};

function buildRubySegments(kanjiForm, furigana) {
  if (!KANJI_RE.test(kanjiForm) || kanjiForm === furigana) {
    return [{ base: kanjiForm, ruby: null }];
  }
  let kEnd = kanjiForm.length;
  let fEnd = furigana.length;
  while (
    kEnd > 0 &&
    fEnd > 0 &&
    !KANJI_RE.test(kanjiForm[kEnd - 1]) &&
    kanjiForm[kEnd - 1] === furigana[fEnd - 1]
  ) {
    kEnd--;
    fEnd--;
  }
  let kStart = 0;
  let fStart = 0;
  while (
    kStart < kEnd &&
    fStart < fEnd &&
    !KANJI_RE.test(kanjiForm[kStart]) &&
    kanjiForm[kStart] === furigana[fStart]
  ) {
    kStart++;
    fStart++;
  }
  const segments = [];
  if (kStart > 0) segments.push({ base: kanjiForm.slice(0, kStart), ruby: null });
  const kanjiCore = kanjiForm.slice(kStart, kEnd);
  const rubyCore = furigana.slice(fStart, fEnd);
  if (kanjiCore) segments.push({ base: kanjiCore, ruby: rubyCore || furigana });
  if (kEnd < kanjiForm.length) segments.push({ base: kanjiForm.slice(kEnd), ruby: null });
  return segments.length > 0 ? segments : [{ base: kanjiForm, ruby: furigana }];
}

function classifyCategory(kanji, reading, meaningsText) {
  const m = meaningsText.toLowerCase();
  if (
    /[一二三四五六七八九十百千万億零]/.test(kanji) ||
    /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|o'clock|minute|hour|day of|week|month|year|yesterday|today|tomorrow)/.test(
      m
    )
  ) {
    return "time_number";
  }
  if (
    reading.endsWith("い") &&
    /(adjective|big|small|new|old|hot|cold|good|bad|high|low|long|short|fast|slow|expensive|cheap|delicious|difficult|easy|fun|busy)/.test(
      m
    )
  ) {
    return "adjective";
  }
  if (m.startsWith("to ") || m.includes("; to ")) {
    return "verb";
  }
  return "noun";
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

async function main() {
  console.log("1. Downloading JLPT Kanji dataset & KRADFILE component decompositions...");
  const [kanjiRes, kradRes] = await Promise.all([
    fetch(KANJI_DATA_URL),
    fetch(RADICAL_DECOMP_URL),
  ]);
  const rawKanji = await kanjiRes.json();
  const kradText = kradRes.ok ? await kradRes.text() : "";

  // Parse kradfile-u: "読 : 言 士 冖 儿"
  const kradMap = new Map();
  for (const line of kradText.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const [lhs, rhs] = line.split(":");
    if (!lhs || !rhs) continue;
    const char = lhs.trim();
    const parts = rhs.trim().split(/\s+/).filter(Boolean);
    kradMap.set(char, parts);
  }

  // Helper to resolve meaning of any kanji or radical part
  const lookupPartMeaning = (partChar) => {
    const direct = rawKanji[partChar];
    if (direct?.meanings?.length) return direct.meanings.slice(0, 2).join(", ");
    const norm = RADICAL_NORMALIZE[partChar];
    if (norm && rawKanji[norm]?.meanings?.length) {
      return rawKanji[norm].meanings.slice(0, 2).join(", ");
    }
    return null;
  };

  const kanjiMap = new Map();
  for (const [char, info] of Object.entries(rawKanji)) {
    const jlptLevel = JLPT_MAP[info.jlpt_new];
    if (!jlptLevel) continue;

    // Build meaningful sub-kanji / radical decomposition
    const rawParts = kradMap.get(char) || [];
    const seenNorm = new Set();
    const components = [];

    for (const rawPart of rawParts) {
      if (rawPart === char) continue;
      const displayChar = RADICAL_NORMALIZE[rawPart] || rawPart;
      if (displayChar === char || seenNorm.has(displayChar)) continue;
      const partMeaning = lookupPartMeaning(rawPart);
      if (!partMeaning) continue;
      seenNorm.add(displayChar);
      components.push({
        part: rawPart,
        kanji: displayChar,
        meaning: partMeaning,
      });
    }

    kanjiMap.set(char, {
      character: char,
      jlpt_level: jlptLevel,
      strokes: info.strokes || 0,
      grade: info.grade || null,
      meanings: (info.meanings || []).slice(0, 5),
      onyomi: (info.readings_on || []).map((r) => r.replace(/^[!^]/, "")),
      kunyomi: (info.readings_kun || []).map((r) => r.replace(/^[!^]/, "")),
      radicals: info.wk_radicals || [],
      components,
      compounds: [],
    });
  }

  console.log("2. Downloading full JLPT N5–N1 Vocabulary...");
  const existingVerbs = JSON.parse(
    fs.readFileSync(path.resolve("src/data/seed_verbs.json"), "utf-8")
  );
  const seenKeys = new Set(existingVerbs.map((v) => `${v.kanji_form}::${v.furigana_reading}`));

  const mergedItems = existingVerbs.map((v) => ({
    ...v,
    category: v.category || "verb",
  }));

  let nextId = Math.max(0, ...mergedItems.map((v) => v.id)) + 1;

  for (const src of VOCAB_SOURCES) {
    const res = await fetch(src.url);
    if (!res.ok) continue;
    const text = await res.text();
    const lines = text.split(/\r?\n/).slice(1);

    for (const line of lines) {
      if (!line.trim()) continue;
      const [expression, reading, meaningRaw] = parseCsvLine(line);
      if (!expression || !meaningRaw) continue;

      const kanjiForm = expression;
      const furigana = reading || expression;
      const key = `${kanjiForm}::${furigana}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const meanings = meaningRaw
        .split(/;|,/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5);

      const category = classifyCategory(kanjiForm, furigana, meaningRaw);
      const constituentKanji = Array.from(new Set(kanjiForm.match(KANJI_GLOBAL_RE) || []));

      mergedItems.push({
        id: nextId++,
        kanji_form: kanjiForm,
        furigana_reading: furigana,
        ruby_segments: buildRubySegments(kanjiForm, furigana),
        meanings,
        jlpt_level: src.level,
        verb_group: category === "verb" ? "Godan" : "Non-Verb",
        category,
        constituent_kanji: constituentKanji,
        industry_tags: ["general"],
        is_core_jlpt: 1,
      });
    }
  }

  // 3. Cross-link compound words (2+ kanji) to every kanji character
  for (const item of mergedItems) {
    const chars = item.constituent_kanji || [];
    if (chars.length < 2) continue;
    for (const ch of chars) {
      const kEntry = kanjiMap.get(ch);
      if (!kEntry || kEntry.compounds.length >= 24) continue;
      if (kEntry.compounds.some((c) => c.word === item.kanji_form)) continue;
      kEntry.compounds.push({
        word: item.kanji_form,
        reading: item.furigana_reading,
        meaning: (item.meanings || []).slice(0, 2).join(", "),
        jlpt_level: item.jlpt_level,
        parts: chars,
      });
    }
  }

  const levelOrder = { N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 };
  const kanjiList = Array.from(kanjiMap.values()).sort(
    (a, b) => levelOrder[a.jlpt_level] - levelOrder[b.jlpt_level] || a.strokes - b.strokes
  );

  fs.writeFileSync(
    path.resolve("src/data/seed_kanji.json"),
    JSON.stringify(kanjiList, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    path.resolve("src/data/seed_verbs.json"),
    JSON.stringify(mergedItems, null, 2),
    "utf-8"
  );

  console.log(`Done! ${kanjiList.length} Kanji with component decompositions -> src/data/seed_kanji.json`);
  console.log(`Done! ${mergedItems.length} total JLPT words -> src/data/seed_verbs.json`);
}

main().catch(console.error);