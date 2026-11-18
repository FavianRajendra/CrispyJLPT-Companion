import React, { useState, useEffect } from "react";
import seedVerbs from "../data/seed_verbs.json";
import scrapedCorpus from "../data/scraped_corpus.json";
import { GRAMMAR_QUIZ_QUESTIONS, PARTICLES_ENCYCLOPEDIA } from "../data/grammar_corpus";
import type { Verb } from "./db";

export interface KanjiGloss {
  reading: string;
  meaning: string;
}

const KANJI_ONLY_RE = /[\u4e00-\u9faf\u3400-\u4dbf\uf900-\ufaff々]/;

const COMPOUND_GLOSS_DICT: Record<string, KanjiGloss> = {
  // IT / Engineering / Workplace terms
  今期: { reading: "こんき", meaning: "this term / current quarter" },
  詳しく: { reading: "くわしく", meaning: "in detail / thoroughly" },
  脆弱性: { reading: "ぜいじゃくせい", meaning: "vulnerability / security flaw" },
  先輩: { reading: "せんぱい", meaning: "senior colleague / mentor" },
  後輩: { reading: "こうはい", meaning: "junior colleague" },
  難解: { reading: "なんかい", meaning: "perplexing / hard to understand" },
  原因: { reading: "げんいん", meaning: "cause / origin" },
  特定: { reading: "とくてい", meaning: "identification / pinpointing" },
  大規模: { reading: "だいきぼ", meaning: "large-scale" },
  移行: { reading: "いこう", meaning: "migration / transition" },
  数日: { reading: "すうじつ", meaning: "several days" },
  契約書: { reading: "けいやくしょ", meaning: "written contract" },
  条項: { reading: "じょうこう", meaning: "clause / terms" },
  精査: { reading: "せいさ", meaning: "close scrutiny / careful examination" },
  合意: { reading: "ごうい", meaning: "mutual agreement" },
  取り交わした: { reading: "とりかわした", meaning: "exchanged (signatures/contracts)" },
  挑戦: { reading: "ちょうせん", meaning: "challenge / attempt" },
  恐れずに: { reading: "おそれずに", meaning: "without fearing" },
  本番環境: { reading: "ほんばんかんきょう", meaning: "production environment" },
  検証: { reading: "けんしょう", meaning: "verification / testing" },
  仕様書: { reading: "しようしょ", meaning: "specification document" },
  議事録: { reading: "ぎじろく", meaning: "meeting minutes" },
  提出: { reading: "ていしゅつ", meaning: "submission" },
  承認: { reading: "しょうにん", meaning: "approval" },
  修正: { reading: "しゅうせい", meaning: "revision / bug fix" },
  障害: { reading: "しょうがい", meaning: "outage / incident" },
  復旧: { reading: "ふっきゅう", meaning: "recovery / restoration" },
  対策: { reading: "たいさく", meaning: "countermeasure" },
  影響: { reading: "えいきょう", meaning: "impact / influence" },
  範囲: { reading: "はんい", meaning: "scope / range" },
  機能: { reading: "きのう", meaning: "feature / function" },
  性能: { reading: "せいのう", meaning: "performance" },
  開発: { reading: "かいはつ", meaning: "development" },
  実装: { reading: "じっそう", meaning: "implementation" },
  調査: { reading: "ちょうさ", meaning: "investigation" },
  分析: { reading: "ぶんせき", meaning: "analysis" },
  改善: { reading: "かいぜん", meaning: "improvement" },
  会議: { reading: "かいぎ", meaning: "meeting" },
  資料: { reading: "しりょう", meaning: "materials / slides" },
  準備: { reading: "じゅんび", meaning: "preparation" },
  確認: { reading: "かくにん", meaning: "confirmation / check" },
  連絡: { reading: "れんらく", meaning: "contact / message" },
  報告: { reading: "ほうこく", meaning: "report" },
  相談: { reading: "そうだん", meaning: "consultation" },
  説明: { reading: "せつめい", meaning: "explanation" },
  決定: { reading: "けってい", meaning: "decision" },
  変更: { reading: "へんこう", meaning: "change / modification" },
  延期: { reading: "えんき", meaning: "postponement" },
  締切: { reading: "しめきり", meaning: "deadline" },
  締め切り: { reading: "しめきり", meaning: "deadline" },
  残業: { reading: "ざんぎょう", meaning: "overtime work" },

  // Slang & Casual Japanese Compounds
  空気: { reading: "くうき", meaning: "air / atmosphere / room vibe" },
  微妙: { reading: "びみょう", meaning: "meh / sketchy / subtle" },
  神対応: { reading: "かみたいおう", meaning: "god-tier service / amazing response" },
  塩対応: { reading: "しおたいおう", meaning: "cold / indifferent response" },
  黒歴史: { reading: "くろれきし", meaning: "embarrassing past" },
  推し活: { reading: "おしかつ", meaning: "supporting one's favorite idol/character" },
  爆笑: { reading: "ばくしょう", meaning: "bursting out laughing" },
  秒速: { reading: "びょうそく", meaning: "instant / within seconds" },
  限界: { reading: "げんかい", meaning: "limit / completely exhausted" },
  優勝: { reading: "ゆうしょう", meaning: "victory / slaying it (slang)" },
  天才: { reading: "てんさい", meaning: "genius" },
  最強: { reading: "さいきょう", meaning: "strongest / unbeatable" },
  最高: { reading: "さいこう", meaning: "the best / awesome" },
  最悪: { reading: "さいあく", meaning: "the worst / awful" },
  面倒: { reading: "めんどう", meaning: "troublesome / hassle" },
  無理: { reading: "むり", meaning: "impossible / no way" },
  本気: { reading: "ほんき", meaning: "serious / dead serious" },
  嘘: { reading: "うそ", meaning: "lie / no way!" },
  本当: { reading: "ほんとう", meaning: "truth / really" },
  絶対: { reading: "ぜったい", meaning: "definitely / 100%" },
  全然: { reading: "ぜんぜん", meaning: "not at all / totally (slang)" },
  結構: { reading: "けっこう", meaning: "quite / fairly / no thank you" },
  一応: { reading: "いちおう", meaning: "just in case / tentatively" },
  結局: { reading: "けっきょく", meaning: "after all / in the end" },
  真剣: { reading: "しんけん", meaning: "serious / earnest" },
  正直: { reading: "しょうじき", meaning: "honestly / frank" },
  投稿: { reading: "とうこう", meaning: "post / upload" },
  動画: { reading: "どうが", meaning: "video" },
  万人: { reading: "まんにん", meaning: "10,000 people" },
  終電: { reading: "しゅうでん", meaning: "last train" },
  夕暮れ: { reading: "ゆうぐれ", meaning: "sunset / dusk" },
  写真: { reading: "しゃしん", meaning: "photograph" },
  気持ち: { reading: "きもち", meaning: "feeling / mood" },
  窓口: { reading: "まどぐち", meaning: "counter / support desk" },
  飲み会: { reading: "のみかい", meaning: "drinking party / social gathering" },
  当日: { reading: "とうじつ", meaning: "on the day itself" },
  幹事: { reading: "かんじ", meaning: "event organizer" },
  迷惑: { reading: "めいわく", meaning: "trouble / inconvenience" },
  中学生: { reading: "ちゅうがくせい", meaning: "middle school student" },
  週末: { reading: "しゅうまつ", meaning: "weekend" },
  遠征: { reading: "えんせい", meaning: "traveling for a concert/event" },
  全力: { reading: "ぜんりょく", meaning: "full power / all one's might" },

  // General JLPT N5–N1 Vocabulary
  新しい: { reading: "あたらしい", meaning: "new" },
  毎日: { reading: "まいにち", meaning: "every day" },
  朝ご飯: { reading: "あさごはん", meaning: "breakfast" },
  図書館: { reading: "としょかん", meaning: "library" },
  勉強: { reading: "べんきょう", meaning: "study" },
  静かに: { reading: "しずかに", meaning: "quietly" },
  昨日: { reading: "きのう", meaning: "yesterday" },
  今日: { reading: "きょう", meaning: "today" },
  明日: { reading: "あした", meaning: "tomorrow" },
  時間: { reading: "じかん", meaning: "time / hour" },
  会社: { reading: "かいしゃ", meaning: "company" },
  仕事: { reading: "しごと", meaning: "work / job" },
  友達: { reading: "ともだち", meaning: "friend" },
  家族: { reading: "かぞく", meaning: "family" },
  先生: { reading: "せんせい", meaning: "teacher" },
  学生: { reading: "がくせい", meaning: "student" },
  大学: { reading: "だいがく", meaning: "university" },
  試験: { reading: "しけん", meaning: "exam" },
  合格: { reading: "ごうかく", meaning: "passing an exam" },
  不合格: { reading: "ふごうかく", meaning: "failing an exam" },
  一生懸命: { reading: "いっしょうけんめい", meaning: "with utmost effort" },
  日本語: { reading: "にほんご", meaning: "Japanese language" },
  英語: { reading: "えいご", meaning: "English language" },
  電車: { reading: "でんしゃ", meaning: "train" },
  駅: { reading: "えき", meaning: "station" },
  天気: { reading: "てんき", meaning: "weather" },
  健康: { reading: "けんこう", meaning: "health" },
  大切: { reading: "たいせつ", meaning: "important" },
  重要: { reading: "じゅうよう", meaning: "essential / important" },
  必要: { reading: "ひつよう", meaning: "necessary" },
  十分: { reading: "じゅうぶん", meaning: "sufficient / enough" },
  問題: { reading: "もんだい", meaning: "problem / question" },
  解決: { reading: "かいけつ", meaning: "solution" },
  結果: { reading: "けっか", meaning: "result" },
  理由: { reading: "りゆう", meaning: "reason" },
  経験: { reading: "けいけん", meaning: "experience" },
  努力: { reading: "どりょく", meaning: "effort" },
  失敗: { reading: "しっぱい", meaning: "failure / mistake" },
  成功: { reading: "せいこう", meaning: "success" },
  郵便局: { reading: "ゆうびんきょく", meaning: "post office" },
  大阪: { reading: "おおさか", meaning: "Osaka" },
  支店: { reading: "してん", meaning: "branch office" },
  転勤: { reading: "てんきん", meaning: "job transfer" },
  冷静: { reading: "れいせい", meaning: "calm / composed" },
  対応: { reading: "たいおう", meaning: "handling / response" },
  技術: { reading: "ぎじゅつ", meaning: "technology / skill" },
  進化: { reading: "しんか", meaning: "evolution / advancement" },
  変化: { reading: "へんか", meaning: "change / shift" },
  個人: { reading: "こじん", meaning: "individual / personal" },
  慎重: { reading: "しんちょう", meaning: "careful / cautious" },
  議論: { reading: "ぎろん", meaning: "discussion / debate" },
  専門用語: { reading: "せんもんようご", meaning: "technical jargon" },
  素人: { reading: "しろうと", meaning: "layperson / amateur" },
  理解: { reading: "りかい", meaning: "understanding" },
};

const SINGLE_KANJI_DICT: Record<string, KanjiGloss> = {
  今: { reading: "こん", meaning: "now / current" },
  期: { reading: "き", meaning: "period / term" },
  詳: { reading: "くわ", meaning: "detailed" },
  脆: { reading: "ぜい", meaning: "fragile / brittle" },
  弱: { reading: "じゃく", meaning: "weak" },
  性: { reading: "せい", meaning: "nature / -ity" },
  先: { reading: "せん", meaning: "ahead / previous" },
  輩: { reading: "はい", meaning: "comrade / generation" },
  難: { reading: "なん", meaning: "difficult" },
  解: { reading: "かい", meaning: "solve / unravel" },
  原: { reading: "げん", meaning: "origin" },
  因: { reading: "いん", meaning: "cause" },
  特: { reading: "とく", meaning: "special" },
  定: { reading: "てい", meaning: "determine" },
  新: { reading: "しん", meaning: "new" },
  本: { reading: "ほん", meaning: "book / origin" },
  気: { reading: "き", meaning: "spirit / mood" },
  空: { reading: "くう", meaning: "air / sky" },
  神: { reading: "かみ", meaning: "god / amazing" },
  塩: { reading: "しお", meaning: "salt / cold" },
  草: { reading: "くさ", meaning: "grass / LOL (slang)" },
  沼: { reading: "ぬま", meaning: "swamp / deep obsession" },
  推: { reading: "お", meaning: "recommend / fave" },
  尊: { reading: "とうと", meaning: "precious / wholesome" },
  闇: { reading: "やみ", meaning: "darkness" },
  病: { reading: "や", meaning: "sick / obsessed" },
  真: { reading: "しん", meaning: "true / genuine" },
  上: { reading: "うえ", meaning: "above / after" },
  下: { reading: "した", meaning: "below" },
  中: { reading: "なか", meaning: "inside / middle" },
  大: { reading: "だい", meaning: "big" },
  小: { reading: "しょう", meaning: "small" },
  高: { reading: "たか", meaning: "high" },
  安: { reading: "やす", meaning: "cheap / safe" },
  人: { reading: "ひと", meaning: "person" },
  者: { reading: "もの", meaning: "person / one" },
  事: { reading: "こと", meaning: "matter / thing" },
  物: { reading: "もの", meaning: "thing" },
  時: { reading: "じ", meaning: "time / o'clock" },
  日: { reading: "にち", meaning: "day / sun" },
  月: { reading: "げつ", meaning: "month / moon" },
  年: { reading: "ねん", meaning: "year" },
  何: { reading: "なに", meaning: "what" },
  私: { reading: "わたし", meaning: "I / me" },
  食: { reading: "た", meaning: "eat / food" },
  飲: { reading: "の", meaning: "drink" },
  見: { reading: "み", meaning: "see" },
  聞: { reading: "き", meaning: "hear / ask" },
  話: { reading: "はな", meaning: "speak / story" },
  読: { reading: "よ", meaning: "read" },
  書: { reading: "か", meaning: "write" },
  買: { reading: "か", meaning: "buy" },
  行: { reading: "い", meaning: "go" },
  来: { reading: "く", meaning: "come" },
  海: { reading: "うみ", meaning: "sea / ocean" },
  昔: { reading: "むかし", meaning: "old days / long ago" },
  頃: { reading: "ころ", meaning: "around (time)" },
  恥: { reading: "は", meaning: "shame / embarrassment" },
  味: { reading: "あじ", meaning: "taste / flavor" },
  値: { reading: "ね", meaning: "price / value" },
  段: { reading: "だん", meaning: "step / rank" },
  浅: { reading: "あさ", meaning: "shallow" },
  彼: { reading: "かれ", meaning: "he / him" },
  方: { reading: "かた", meaning: "way / person" },
  関: { reading: "かん", meaning: "relation / concern" },
  々: { reading: "〃", meaning: "kanji repetition mark" },
};

const { GLOSS_MAP, SORTED_SURFACES } = (() => {
  const map = new Map<string, KanjiGloss>(Object.entries(COMPOUND_GLOSS_DICT));

  // 1. Load scraper-generated glossDict from src/data/scraped_corpus.json
  const scrapedDict = (scrapedCorpus as any)?.glossDict || {};
  for (const [surface, gloss] of Object.entries(scrapedDict)) {
    const g = gloss as KanjiGloss;
    if (surface && g?.reading && KANJI_ONLY_RE.test(surface) && !map.has(surface)) {
      map.set(surface, g);
    }
  }

  // 2. Index all 3,437 verbs & stems from seed_verbs.json
  const verbs = seedVerbs as unknown as Verb[];
  for (const v of verbs) {
    if (!v.kanji_form || !v.furigana_reading || !KANJI_ONLY_RE.test(v.kanji_form)) {
      continue;
    }
    const meaningStr = Array.isArray(v.meanings) ? v.meanings.slice(0, 2).join(", ") : "";

    if (!map.has(v.kanji_form)) {
      map.set(v.kanji_form, {
        reading: v.furigana_reading,
        meaning: meaningStr,
      });
    }

    if (v.kanji_form.endsWith("する") && v.furigana_reading.endsWith("する")) {
      const stemK = v.kanji_form.slice(0, -2);
      const stemF = v.furigana_reading.slice(0, -2);
      if (stemK && stemF && KANJI_ONLY_RE.test(stemK) && !map.has(stemK)) {
        map.set(stemK, {
          reading: stemF,
          meaning: meaningStr,
        });
      }
    }

    let kEnd = v.kanji_form.length;
    let fEnd = v.furigana_reading.length;
    while (
      kEnd > 0 &&
      fEnd > 0 &&
      !KANJI_ONLY_RE.test(v.kanji_form[kEnd - 1]) &&
      v.kanji_form[kEnd - 1] === v.furigana_reading[fEnd - 1]
    ) {
      kEnd--;
      fEnd--;
    }
    const pureKanjiStem = v.kanji_form.slice(0, kEnd);
    const pureRubyStem = v.furigana_reading.slice(0, fEnd);
    if (
      pureKanjiStem.length >= 1 &&
      pureRubyStem.length >= 1 &&
      KANJI_ONLY_RE.test(pureKanjiStem) &&
      !map.has(pureKanjiStem)
    ) {
      map.set(pureKanjiStem, {
        reading: pureRubyStem,
        meaning: meaningStr,
      });
    }
  }

  // 3. Index clean ruby segments from GRAMMAR_QUIZ_QUESTIONS & PARTICLES_ENCYCLOPEDIA
  //    (Only pure kanji tokens <= 6 chars so full English sentences aren't attached to single words)
  for (const q of GRAMMAR_QUIZ_QUESTIONS) {
    if (!Array.isArray(q.fullSentenceRuby)) continue;
    for (const seg of q.fullSentenceRuby) {
      const cleanBase = seg?.base?.trim();
      const cleanRuby = seg?.ruby?.trim();
      if (
        cleanBase &&
        cleanRuby &&
        cleanBase.length <= 6 &&
        KANJI_ONLY_RE.test(cleanBase) &&
        !map.has(cleanBase)
      ) {
        map.set(cleanBase, {
          reading: cleanRuby,
          meaning: `Reading: ${cleanRuby}`,
        });
      }
    }
  }

  for (const p of PARTICLES_ENCYCLOPEDIA) {
    for (const ex of p.examples) {
      for (const seg of ex.sentenceRuby) {
        const cleanBase = seg?.base?.trim();
        const cleanRuby = seg?.ruby?.trim();
        if (
          cleanBase &&
          cleanRuby &&
          cleanBase.length <= 6 &&
          KANJI_ONLY_RE.test(cleanBase) &&
          !map.has(cleanBase)
        ) {
          map.set(cleanBase, {
            reading: cleanRuby,
            meaning: `Reading: ${cleanRuby}`,
          });
        }
      }
    }
  }

  // 4. Single-kanji fallback last so multi-character compounds always win
  for (const [char, gloss] of Object.entries(SINGLE_KANJI_DICT)) {
    if (!map.has(char)) {
      map.set(char, gloss);
    }
  }

  const surfaces = Array.from(map.keys()).sort((a, b) => b.length - a.length);
  return { GLOSS_MAP: map, SORTED_SURFACES: surfaces };
})();

/**
 * Registers newly scraped kanji compounds/characters at runtime
 * so AnnotatedJapaneseText immediately picks them up without a page reload.
 */
export function registerRuntimeGlosses(glosses: Record<string, KanjiGloss>) {
  let added = false;
  for (const [surface, gloss] of Object.entries(glosses)) {
    if (surface && gloss?.reading && KANJI_ONLY_RE.test(surface)) {
      GLOSS_MAP.set(surface, gloss);
      added = true;
    }
  }
  if (added) {
    SORTED_SURFACES.length = 0;
    SORTED_SURFACES.push(...Array.from(GLOSS_MAP.keys()).sort((a, b) => b.length - a.length));
  }
}

function renderSurfaceWithRuby(
  surface: string,
  reading: string,
  showFurigana: boolean
): React.ReactNode {
  if (!showFurigana || !KANJI_ONLY_RE.test(surface) || surface === reading) {
    return surface;
  }

  let kEnd = surface.length;
  let fEnd = reading.length;
  while (
    kEnd > 0 &&
    fEnd > 0 &&
    !KANJI_ONLY_RE.test(surface[kEnd - 1]) &&
    surface[kEnd - 1] === reading[fEnd - 1]
  ) {
    kEnd--;
    fEnd--;
  }

  let kStart = 0;
  let fStart = 0;
  while (
    kStart < kEnd &&
    fStart < fEnd &&
    !KANJI_ONLY_RE.test(surface[kStart]) &&
    surface[kStart] === reading[fStart]
  ) {
    kStart++;
    fStart++;
  }

  const prefix = surface.slice(0, kStart);
  const kanjiCore = surface.slice(kStart, kEnd);
  const rubyCore = reading.slice(fStart, fEnd);
  const suffix = surface.slice(kEnd);

  if (!kanjiCore || !rubyCore) return surface;

  return (
    <ruby className="ruby-align">
      {prefix}
      {kanjiCore}
      <rt className="text-[11px] sm:text-xs text-accent font-medium tracking-normal select-none">
        {rubyCore}
      </rt>
      {suffix}
    </ruby>
  );
}

const RUNTIME_FETCH_CACHE = new Map<string, Promise<KanjiGloss | null>>();

function fetchOnDemandSingleKanji(char: string): Promise<KanjiGloss | null> {
  if (RUNTIME_FETCH_CACHE.has(char)) {
    return RUNTIME_FETCH_CACHE.get(char)!;
  }
  const req = fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(char)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return null;
      const reading =
        (data.kun_readings?.[0] || data.on_readings?.[0] || "")
          .replace(/\..*$/, "")
          .replace(/-/g, "") || "";
      const meaning = (data.meanings || []).slice(0, 3).join(", ") || "JLPT Kanji";
      if (!reading) return null;
      const gloss: KanjiGloss = { reading, meaning };
      registerRuntimeGlosses({ [char]: gloss });
      return gloss;
    })
    .catch(() => null);

  RUNTIME_FETCH_CACHE.set(char, req);
  return req;
}

const InteractiveKanjiToken: React.FC<{
  surface: string;
  gloss: KanjiGloss;
  showFurigana: boolean;
  isFallback?: boolean;
}> = ({ surface, gloss, showFurigana, isFallback = false }) => {
  const [open, setOpen] = useState(false);
  const [resolvedGloss, setResolvedGloss] = useState<KanjiGloss>(gloss);

  useEffect(() => {
    setResolvedGloss(gloss);
  }, [gloss]);

  useEffect(() => {
    if (!isFallback || surface.length !== 1 || surface === "々") return;
    let cancelled = false;
    fetchOnDemandSingleKanji(surface).then((fetched) => {
      if (!cancelled && fetched) {
        setResolvedGloss(fetched);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isFallback, surface]);

  return (
    <span
      className="relative inline-block group cursor-help border-b border-dotted border-accent/70 hover:border-accent transition-colors mx-[0.5px]"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((prev) => !prev);
      }}
      title={`${surface} (${resolvedGloss.reading}): ${resolvedGloss.meaning}`}
    >
      {renderSurfaceWithRuby(surface, resolvedGloss.reading, showFurigana)}

      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-max max-w-[230px] px-2.5 py-1.5 rounded-xl bg-slate-950/95 text-white border border-accent/50 shadow-xl text-left whitespace-normal leading-snug"
        >
          <span className="block font-jp text-[11px] font-bold text-accent">
            {surface} 【{resolvedGloss.reading}】
          </span>
          <span className="block font-sans text-[11px] font-normal text-slate-200 mt-0.5">
            {resolvedGloss.meaning}
          </span>
        </span>
      )}
    </span>
  );
};

export interface AnnotatedJapaneseTextProps {
  text: string;
  showFurigana: boolean;
}

export const AnnotatedJapaneseText: React.FC<AnnotatedJapaneseTextProps> = ({
  text,
  showFurigana,
}) => {
  if (!text) return null;

  if (!KANJI_ONLY_RE.test(text)) {
    return <>{text}</>;
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    if (!KANJI_ONLY_RE.test(text[cursor])) {
      let nextKanji = cursor + 1;
      while (nextKanji < text.length && !KANJI_ONLY_RE.test(text[nextKanji])) {
        nextKanji++;
      }
      nodes.push(
        <React.Fragment key={`txt-${cursor}`}>
          {text.slice(cursor, nextKanji)}
        </React.Fragment>
      );
      cursor = nextKanji;
      continue;
    }

    let matchedSurface: string | null = null;
    let matchedGloss: KanjiGloss | null = null;

    for (const surface of SORTED_SURFACES) {
      if (
        surface.length <= text.length - cursor &&
        text.startsWith(surface, cursor)
      ) {
        matchedSurface = surface;
        matchedGloss = GLOSS_MAP.get(surface) || null;
        break;
      }
    }

    if (matchedSurface && matchedGloss) {
      nodes.push(
        <InteractiveKanjiToken
          key={`kj-${cursor}`}
          surface={matchedSurface}
          gloss={matchedGloss}
          showFurigana={showFurigana}
        />
      );
      cursor += matchedSurface.length;
      continue;
    }

    const fallbackChar = text[cursor];
    const fallbackGloss: KanjiGloss = SINGLE_KANJI_DICT[fallbackChar] || {
      reading: "…",
      meaning: "Loading kanji meaning...",
    };

    nodes.push(
      <InteractiveKanjiToken
        key={`fb-${cursor}`}
        surface={fallbackChar}
        gloss={fallbackGloss}
        showFurigana={showFurigana}
        isFallback={!SINGLE_KANJI_DICT[fallbackChar]}
      />
    );
    cursor += 1;
  }

  return <>{nodes}</>;
};