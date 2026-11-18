import { getDatabase } from "./db";
import type { GrammarQuestion } from "../data/grammar_corpus";
import type { KanjiGloss } from "./kanjiAnnotator";

const KANJI_RE = /[\u4e00-\u9faf\u3400-\u4dbf\uf900-\ufaff々]/g;
const KANJI_COMPOUND_RE = /[\u4e00-\u9faf\u3400-\u4dbf\uf900-\ufaff々]+/g;

interface ScrapeTarget {
  query: string;
  blank: string;
  level: "N5" | "N4" | "N3" | "N2" | "N1";
  category: "particle" | "conjugation" | "slang";
  distractors: string[];
  rule: string;
}

const LIVE_SCRAPE_POOL: ScrapeTarget[] = [
  {
    query: "マジで",
    blank: "マジで",
    level: "N4",
    category: "slang",
    distractors: ["わざと", "せっかく", "まさか"],
    rule: "マジで (from 真面目) = 'seriously / for real' in casual spoken Japanese.",
  },
  {
    query: "ヤバい",
    blank: "ヤバい",
    level: "N4",
    category: "slang",
    distractors: ["地味", "退屈", "丁寧"],
    rule: "ヤバい = versatile slang meaning 'awesome / insane' OR 'dangerous / oh no'.",
  },
  {
    query: "ちゃう",
    blank: "ちゃう",
    level: "N4",
    category: "slang",
    distractors: ["とく", "みる", "おく"],
    rule: "〜ちゃう is the casual contraction of 〜てしまう (accidental completion or regret).",
  },
  {
    query: "微妙",
    blank: "微妙",
    level: "N3",
    category: "slang",
    distractors: ["完璧", "明確", "新鮮"],
    rule: "微妙 (びみょう) in casual speech = 'meh / sketchy / hard to say'.",
  },
  {
    query: "めんどくさい",
    blank: "めんどくさい",
    level: "N4",
    category: "slang",
    distractors: ["なつかしい", "うらやましい", "もったいない"],
    rule: "めんどくさい (casual form of 面倒臭い) = 'a total pain / can't be bothered'.",
  },
  {
    query: "せっかく",
    blank: "せっかく",
    level: "N3",
    category: "particle",
    distractors: ["もしも", "たとえ", "まさか"],
    rule: "せっかく = 'with much trouble / since someone went out of their way'.",
  },
  {
    query: "せいで",
    blank: "せいで",
    level: "N3",
    category: "particle",
    distractors: ["おかげで", "ために", "ついでに"],
    rule: "せいで = 'because of / due to (negative outcome or blame)'.",
  },
  {
    query: "ばかり",
    blank: "ばかり",
    level: "N3",
    category: "particle",
    distractors: ["しか", "こそ", "さえ"],
    rule: "ばかり = 'nothing but / only' or 'just finished doing (〜たばかり)'.",
  },
  {
    query: "かもしれない",
    blank: "かもしれない",
    level: "N4",
    category: "conjugation",
    distractors: ["に違いない", "はずがない", "わけではない"],
    rule: "〜かもしれない = 'might / maybe / possibly'.",
  },
  {
    query: "に違いない",
    blank: "に違いない",
    level: "N2",
    category: "conjugation",
    distractors: ["にすぎない", "とは限らない", "どころではない"],
    rule: "〜に違いない = 'must be / no doubt that...'.",
  },
  {
    query: "ざるを得ない",
    blank: "ざるを得ない",
    level: "N1",
    category: "conjugation",
    distractors: ["かねない", "に耐えない", "を禁じ得ない"],
    rule: "Verb-nai stem + ざるを得ない = 'cannot help doing / have no choice but to...'.",
  },
];

async function fetchWithTimeout(url: string, ms = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSingleKanjiGloss(char: string): Promise<KanjiGloss | null> {
  try {
    const res = await fetchWithTimeout(
      `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(char)}`,
      4500
    );
    if (!res.ok) return null;
    const data = await res.json();
    const reading =
      (data.kun_readings?.[0] || data.on_readings?.[0] || "")
        .replace(/\..*$/, "")
        .replace(/-/g, "") || "かんじ";
    const meaning = (data.meanings || []).slice(0, 3).join(", ") || "Kanji character";
    return { reading, meaning };
  } catch {
    return null;
  }
}

async function fetchTatoebaBatch(query: string, page = 1): Promise<Array<{ jp: string; eng: string }>> {
  try {
    const url = `https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&query=${encodeURIComponent(
      query
    )}&orphans=no&unapproved=no&page=${page}`;
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) return [];
    const data = await res.json();
    const out: Array<{ jp: string; eng: string }> = [];

    for (const item of data.results || []) {
      const jp = item.text?.trim();
      const eng = item.translations?.[0]?.[0]?.text?.trim();
      if (!jp || !eng || jp.length < 6 || jp.length > 52) continue;
      out.push({ jp, eng });
      if (out.length >= 3) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function ensureLiveScraperTables() {
  const db = await getDatabase();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS scraped_grammar_questions (
      id INTEGER PRIMARY KEY,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS scraped_kanji_glosses (
      surface TEXT PRIMARY KEY,
      reading TEXT NOT NULL,
      meaning TEXT NOT NULL
    );
  `);
}

export async function loadPersistedScrapedData(): Promise<{
  questions: GrammarQuestion[];
  glosses: Record<string, KanjiGloss>;
}> {
  try {
    await ensureLiveScraperTables();
    const db = await getDatabase();
    const qRows = await db.select<Array<{ payload_json: string }>>(
      `SELECT payload_json FROM scraped_grammar_questions ORDER BY id DESC;`
    );
    const gRows = await db.select<Array<{ surface: string; reading: string; meaning: string }>>(
      `SELECT surface, reading, meaning FROM scraped_kanji_glosses;`
    );

    const questions: GrammarQuestion[] = [];
    for (const r of qRows || []) {
      try {
        questions.push(JSON.parse(r.payload_json));
      } catch {
        // skip malformed row
      }
    }

    const glosses: Record<string, KanjiGloss> = {};
    for (const g of gRows || []) {
      glosses[g.surface] = { reading: g.reading, meaning: g.meaning };
    }
    return { questions, glosses };
  } catch {
    return { questions: [], glosses: {} };
  }
}

export async function runLiveCorpusScrape(
  existingQuestions: GrammarQuestion[],
  onProgress?: (status: string) => void
): Promise<{
  addedQuestions: GrammarQuestion[];
  addedGlosses: Record<string, KanjiGloss>;
}> {
  await ensureLiveScraperTables();
  const db = await getDatabase();

  const seenSentences = new Set(
    existingQuestions.map((q) => `${q.sentencePre}${q.correctAnswer}${q.sentencePost}`)
  );

  // Pick 5 random targets per click so each scrape completes in ~3–5 seconds
  const pickedTargets = [...LIVE_SCRAPE_POOL]
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);

  const randomPage = Math.floor(Math.random() * 3) + 1;
  const addedQuestions: GrammarQuestion[] = [];
  const kanjiChars = new Set<string>();
  let nextId = Date.now();

  for (let i = 0; i < pickedTargets.length; i++) {
    const target = pickedTargets[i];
    onProgress?.(`Scraping "${target.query}" (${i + 1}/${pickedTargets.length})...`);
    const hits = await fetchTatoebaBatch(target.query, randomPage);

    for (const hit of hits) {
      if (seenSentences.has(hit.jp)) continue;
      const idx = hit.jp.indexOf(target.blank);
      if (idx === -1) continue;

      const sentencePre = hit.jp.slice(0, idx);
      const sentencePost = hit.jp.slice(idx + target.blank.length);

      for (const ch of hit.jp.match(KANJI_RE) || []) {
        if (ch !== "々") kanjiChars.add(ch);
      }

      const options = [
        { text: target.blank, explanation: `Correct! ${target.rule}` },
        ...target.distractors.map((d) => ({
          text: d,
          explanation: `Incorrect. Does not fit the nuance of "${hit.eng}".`,
        })),
      ].sort(() => Math.random() - 0.5);

      const q: GrammarQuestion = {
        id: nextId++,
        sentencePre,
        sentencePost,
        targetCategory: target.category,
        jlpt_level: target.level,
        correctAnswer: target.blank,
        options,
        sentenceTranslation: hit.eng,
        fullSentenceRuby: [],
        ruleSummary: target.rule,
      };

      addedQuestions.push(q);
      seenSentences.add(hit.jp);

      await db.execute(
        `INSERT OR REPLACE INTO scraped_grammar_questions (id, payload_json, created_at) VALUES (?, ?, ?);`,
        [q.id, JSON.stringify(q), new Date().toISOString()]
      );
    }
  }

  // Resolve kanji readings/meanings via KanjiAPI.dev in parallel
  const addedGlosses: Record<string, KanjiGloss> = {};
  const chars = Array.from(kanjiChars).slice(0, 24);
  if (chars.length > 0) {
    onProgress?.(`Fetching readings & meanings for ${chars.length} kanji...`);
    await Promise.all(
      chars.map(async (ch) => {
        const gloss = await fetchSingleKanjiGloss(ch);
        if (gloss) {
          addedGlosses[ch] = gloss;
          await db.execute(
            `INSERT OR REPLACE INTO scraped_kanji_glosses (surface, reading, meaning) VALUES (?, ?, ?);`,
            [ch, gloss.reading, gloss.meaning]
          );
        }
      })
    );
  }

  return { addedQuestions, addedGlosses };
}