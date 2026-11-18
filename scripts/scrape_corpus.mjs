#!/usr/bin/env node
/**
 * Fast Parallel Scraper for JLPT Slang, Grammar & Kanji/Furigana
 * - Batched parallel requests (8x faster) with 5s timeout per request
 * - Live progress logs + incremental saves to src/data/scraped_corpus.json
 *
 * Usage:
 *   node scripts/scrape_corpus.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_JSON = path.join(ROOT, "src", "data", "scraped_corpus.json");
const GRAMMAR_TS = path.join(ROOT, "src", "data", "grammar_corpus.ts");

const KANJI_RE = /[\u4e00-\u9faf\u3400-\u4dbf\uf900-\ufaff々]/g;
const KANJI_COMPOUND_RE = /[\u4e00-\u9faf\u3400-\u4dbf\uf900-\ufaff々]+/g;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "CrispyJLPTCompanion/2.1" },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

const SLANG_AND_GRAMMAR_TARGETS = [
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
    query: "空気を読む",
    blank: "空気",
    level: "N3",
    category: "slang",
    distractors: ["天気", "気分", "景気"],
    rule: "空気を読む (KY) = 'reading the room / sensing unspoken social cues'.",
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
    query: "おかげで",
    blank: "おかげで",
    level: "N3",
    category: "particle",
    distractors: ["せいで", "くせに", "わりに"],
    rule: "おかげで = 'thanks to (positive cause)', contrasting with せいで (blame).",
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
    query: "らしい",
    blank: "らしい",
    level: "N4",
    category: "conjugation",
    distractors: ["そうだ", "すぎる", "やすい"],
    rule: "〜らしい = 'apparently / it seems like (based on hearsay or typical traits)'.",
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

async function fetchJishoGloss(term) {
  try {
    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(term)}`;
    const res = await fetchWithTimeout(url, 5000);
    if (!res.ok) return null;
    const json = await res.json();
    const first = json?.data?.[0];
    if (!first) return null;

    const jp = first.japanese?.[0];
    const reading = jp?.reading || "";
    const meanings =
      first.senses?.[0]?.english_definitions?.slice(0, 3).join(", ") || "";

    if (!reading) return null;
    return { reading, meaning: meanings || "JLPT vocabulary" };
  } catch {
    return null;
  }
}

async function fetchSingleKanji(char) {
  try {
    const url = `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(char)}`;
    const res = await fetchWithTimeout(url, 5000);
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

async function fetchTatoebaSentences(query, limit = 4) {
  try {
    const url = `https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&query=${encodeURIComponent(
      query
    )}&orphans=no&unapproved=no&page=1`;
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) return [];
    const data = await res.json();
    const results = [];

    for (const item of data.results || []) {
      const jp = item.text?.trim();
      const eng = item.translations?.[0]?.[0]?.text?.trim();
      if (!jp || !eng) continue;
      if (jp.length < 6 || jp.length > 52) continue;
      results.push({ jp, eng });
      if (results.length >= limit) break;
    }
    return results;
  } catch {
    return [];
  }
}

function saveProgress(scrapedQuestions, glossDict) {
  fs.writeFileSync(
    OUTPUT_JSON,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        questions: scrapedQuestions,
        glossDict,
      },
      null,
      2
    ),
    "utf8"
  );
}

async function runInBatches(items, batchSize, worker, onBatchDone) {
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    await Promise.all(slice.map(worker));
    if (onBatchDone) {
      onBatchDone(Math.min(i + batchSize, items.length), items.length);
    }
    await sleep(150);
  }
}

async function main() {
  console.log("🚀 Starting Fast Parallel JLPT & Slang Scraper...");

  const existing = fs.existsSync(OUTPUT_JSON)
    ? JSON.parse(fs.readFileSync(OUTPUT_JSON, "utf8"))
    : { questions: [], glossDict: {} };

  const glossDict = { ...(existing.glossDict || {}) };
  const scrapedQuestions = [...(existing.questions || [])];
  const seenSentences = new Set(
    scrapedQuestions.map((q) => `${q.sentencePre}${q.correctAnswer}${q.sentencePost}`)
  );

  const corpusSource = fs.existsSync(GRAMMAR_TS)
    ? fs.readFileSync(GRAMMAR_TS, "utf8")
    : "";
  const allKanjiCompounds = new Set(corpusSource.match(KANJI_COMPOUND_RE) || []);
  const allSingleKanjis = new Set(corpusSource.match(KANJI_RE) || []);

  // 1. Scrape Tatoeba sentences in parallel batches of 4
  let nextId = 1000 + scrapedQuestions.length;
  await runInBatches(
    SLANG_AND_GRAMMAR_TARGETS,
    4,
    async (target) => {
      const hits = await fetchTatoebaSentences(target.query, 4);
      let addedForTarget = 0;

      for (const hit of hits) {
        if (seenSentences.has(hit.jp)) continue;
        const idx = hit.jp.indexOf(target.blank);
        if (idx === -1) continue;

        const sentencePre = hit.jp.slice(0, idx);
        const sentencePost = hit.jp.slice(idx + target.blank.length);

        for (const m of hit.jp.match(KANJI_COMPOUND_RE) || []) {
          allKanjiCompounds.add(m);
        }
        for (const m of hit.jp.match(KANJI_RE) || []) {
          allSingleKanjis.add(m);
        }

        const options = [
          {
            text: target.blank,
            explanation: `Correct! ${target.rule}`,
          },
          ...target.distractors.map((d) => ({
            text: d,
            explanation: `Incorrect. Does not fit the nuance of "${hit.eng}".`,
          })),
        ].sort(() => Math.random() - 0.5);

        scrapedQuestions.push({
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
        });
        seenSentences.add(hit.jp);
        addedForTarget++;
      }

      console.log(`  ✓ ${target.query} (${target.category}): +${addedForTarget} sentences`);
    },
    () => saveProgress(scrapedQuestions, glossDict)
  );

  // 2. Resolve missing kanji compounds via Jisho.org in parallel batches of 8
  const missingCompounds = Array.from(allKanjiCompounds).filter(
    (c) => !glossDict[c] && c.length <= 8
  );
  console.log(`📚 Resolving ${missingCompounds.length} kanji compounds via Jisho.org...`);

  await runInBatches(
    missingCompounds,
    8,
    async (compound) => {
      const gloss = await fetchJishoGloss(compound);
      if (gloss) {
        glossDict[compound] = gloss;
      }
    },
    (done, total) => {
      process.stdout.write(`\r  ↳ Jisho progress: ${done}/${total} compounds`);
      saveProgress(scrapedQuestions, glossDict);
    }
  );
  if (missingCompounds.length > 0) console.log("");

  // 3. Resolve missing single kanji via KanjiAPI.dev in parallel batches of 10
  const missingSingle = Array.from(allSingleKanjis).filter(
    (ch) => ch !== "々" && !glossDict[ch]
  );
  console.log(`🀄 Resolving ${missingSingle.length} individual kanji via KanjiAPI.dev...`);

  await runInBatches(
    missingSingle,
    10,
    async (ch) => {
      const gloss = await fetchSingleKanji(ch);
      if (gloss) {
        glossDict[ch] = gloss;
      }
    },
    (done, total) => {
      process.stdout.write(`\r  ↳ KanjiAPI progress: ${done}/${total} characters`);
      saveProgress(scrapedQuestions, glossDict);
    }
  );
  if (missingSingle.length > 0) console.log("");

  saveProgress(scrapedQuestions, glossDict);
  console.log(
    `✅ Complete! Total: ${scrapedQuestions.length} scraped questions & ${
      Object.keys(glossDict).length
    } kanji glosses in src/data/scraped_corpus.json`
  );
}

main();