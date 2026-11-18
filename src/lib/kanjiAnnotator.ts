import React, { useState } from "react";
import seedVerbs from "../data/seed_verbs.json";

export interface KanjiAnnotationEntry {
  surface: string;
  reading: string;
  meaning: string;
}

interface RawSeedVerb {
  kanji_form: string;
  furigana_reading: string;
  meanings: string[];
}

const STATIC_KANJI_LEXICON: Array<[string, string, string]> = [
  // Time & Dates
  ["今日", "きょう", "today"],
  ["明日", "あした", "tomorrow"],
  ["昨日", "きのう", "yesterday"],
  ["毎日", "まいにち", "every day"],
  ["毎週", "まいしゅう", "every week"],
  ["毎月", "まいつき", "every month"],
  ["毎年", "まいとし", "every year"],
  ["今年", "ことし", "this year"],
  ["来年", "らいねん", "next year"],
  ["去年", "きょねん", "last year"],
  ["来週", "らいしゅう", "next week"],
  ["先週", "せんしゅう", "last week"],
  ["今週", "こんしゅう", "this week"],
  ["今月", "こんげつ", "this month"],
  ["来月", "らいげつ", "next month"],
  ["先月", "せんげつ", "last month"],
  ["午前", "ごぜん", "morning / A.M."],
  ["午後", "ごご", "afternoon / P.M."],
  ["朝", "あさ", "morning"],
  ["昼", "ひる", "noon / daytime"],
  ["夜", "よる", "night / evening"],
  ["週末", "しゅうまつ", "weekend"],
  ["時間", "じかん", "time / hour"],
  ["最近", "さいきん", "recently / lately"],
  ["将来", "しょうらい", "future / prospects"],

  // People, School & Workplace
  ["私", "わたし", "I / me"],
  ["彼", "かれ", "he / boyfriend"],
  ["彼女", "かのじょ", "she / girlfriend"],
  ["友達", "ともだち", "friend"],
  ["家族", "かぞく", "family"],
  ["両親", "りょうしん", "parents"],
  ["子供", "こども", "child / children"],
  ["先生", "せんせい", "teacher / instructor"],
  ["学生", "がくせい", "student"],
  ["留学生", "りゅうがくせい", "international student"],
  ["大学", "だいがく", "university"],
  ["学校", "がっこう", "school"],
  ["教室", "きょうしつ", "classroom"],
  ["図書館", "としょかん", "library"],
  ["会社", "かいしゃ", "company / office"],
  ["社員", "しゃいん", "company employee"],
  ["社長", "しゃちょう", "company president / CEO"],
  ["部長", "ぶちょう", "department manager"],
  ["お客様", "おきゃくさま", "customer / guest"],
  ["仕事", "しごと", "work / job"],
  ["会議", "かいぎ", "meeting / conference"],
  ["資料", "しりょう", "documents / materials"],
  ["新機能", "しんきのう", "new feature"],
  ["計画", "けいかく", "plan / project"],
  ["準備", "じゅんび", "preparation"],
  ["報告", "ほうこく", "report"],
  ["連絡", "れんらく", "contact / communication"],
  ["相談", "そうだん", "consultation / discussion"],
  ["約束", "やくそく", "promise / appointment"],
  ["経験", "けいけん", "experience"],
  ["努力", "どりょく", "effort / hard work"],
  ["結果", "けっか", "result / outcome"],
  ["成功", "せいこう", "success"],
  ["失敗", "しっぱい", "failure / mistake"],
  ["問題", "もんだい", "problem / question"],
  ["解決", "かいけつ", "solution / resolution"],
  ["必要", "ひつよう", "necessary / essential"],
  ["大切", "たいせつ", "important / precious"],
  ["重要", "じゅうよう", "important / major"],

  // Study, Language & JLPT
  ["日本語", "にほんご", "Japanese language"],
  ["英語", "えいご", "English language"],
  ["外国語", "がいこくご", "foreign language"],
  ["漢字", "かんじ", "kanji / Chinese characters"],
  ["言葉", "ことば", "word / language"],
  ["意味", "いみ", "meaning / significance"],
  ["質問", "しつもん", "question"],
  ["答え", "こたえ", "answer"],
  ["試験", "しけん", "exam / test"],
  ["合格", "ごうかく", "passing (an exam)"],
  ["勉強", "べんきょう", "study"],
  ["練習", "れんしゅう", "practice"],
  ["宿題", "しゅくだい", "homework"],
  ["辞書", "じしょ", "dictionary"],
  ["新聞", "しんぶん", "newspaper"],
  ["雑誌", "ざっし", "magazine"],
  ["小説", "しょうせつ", "novel"],
  ["本", "ほん", "book"],
  ["手紙", "てがみ", "letter"],

  // Places & Travel
  ["日本", "にほん", "Japan"],
  ["東京", "とうきょう", "Tokyo"],
  ["京都", "きょうと", "Kyoto"],
  ["大阪", "おおさか", "Osaka"],
  ["駅", "えき", "station"],
  ["電車", "でんしゃ", "train"],
  ["地下鉄", "ちかてつ", "subway"],
  ["新幹線", "しんかんせん", "bullet train (Shinkansen)"],
  ["飛行機", "ひこうき", "airplane"],
  ["空港", "くうこう", "airport"],
  ["車", "くるま", "car"],
  ["自転車", "じてんしゃ", "bicycle"],
  ["道", "みち", "road / street / way"],
  ["病院", "びょういん", "hospital"],
  ["銀行", "ぎんこう", "bank"],
  ["郵便局", "ゆうびんきょく", "post office"],
  ["店", "みせ", "shop / store"],
  ["映画館", "えいがかん", "movie theater"],
  ["公園", "こうえん", "park"],
  ["部屋", "へや", "room"],
  ["家", "いえ", "house / home"],
  ["場所", "ばしょ", "place / location"],
  ["旅行", "りょこう", "travel / trip"],
  ["外国", "がいこく", "foreign country"],

  // Daily Life, Health & Nature
  ["食事", "しょくじ", "meal"],
  ["料理", "りょうり", "cooking / cuisine"],
  ["朝ご飯", "あさごはん", "breakfast"],
  ["昼ご飯", "ひるごはん", "lunch"],
  ["晩ご飯", "ばんごはん", "dinner"],
  ["水", "みず", "water"],
  ["お茶", "おちゃ", "tea"],
  ["お酒", "おさけ", "alcohol / sake"],
  ["薬", "くすり", "medicine"],
  ["病気", "びょうき", "illness / sickness"],
  ["風邪", "かぜ", "cold (illness)"],
  ["頭", "あたま", "head / mind"],
  ["体", "からだ", "body / health"],
  ["天気", "てんき", "weather"],
  ["雨", "あめ", "rain"],
  ["雪", "ゆき", "snow"],
  ["風", "かぜ", "wind"],
  ["空", "そら", "sky"],
  ["山", "やま", "mountain"],
  ["川", "かわ", "river"],
  ["海", "うみ", "sea / ocean"],
  ["花", "はな", "flower"],
  ["音楽", "おんがく", "music"],
  ["映画", "えいが", "movie"],
  ["写真", "しゃしん", "photograph"],
  ["電話", "でんわ", "telephone / call"],
  ["お金", "おかね", "money"],
  ["買い物", "かいもの", "shopping"],
  ["荷物", "にもつ", "luggage / baggage"],

  // Common Adjectives & Adverbs
  ["新しい", "あたらしい", "new"],
  ["古い", "ふるい", "old (things)"],
  ["大きい", "おおきい", "big / large"],
  ["小さい", "ちいさい", "small / little"],
  ["高い", "たかい", "high / expensive"],
  ["安い", "やすい", "cheap / inexpensive"],
  ["多い", "おおい", "many / much"],
  ["少ない", "すくない", "few / little"],
  ["長い", "ながい", "long"],
  ["短い", "みじかい", "short"],
  ["早い", "はやい", "early / fast"],
  ["速い", "はやい", "fast / quick"],
  ["遅い", "おそい", "slow / late"],
  ["難しい", "むずかしい", "difficult"],
  ["易しい", "やさしい", "easy / simple"],
  ["優しい", "やさしい", "kind / gentle"],
  ["忙しい", "いそがしい", "busy"],
  ["楽しい", "たのしい", "fun / enjoyable"],
  ["嬉しい", "うれしい", "happy / glad"],
  ["悲しい", "かなしい", "sad"],
  ["美味しい", "おいしい", "delicious"],
  ["暑い", "あつい", "hot (weather)"],
  ["寒い", "さむい", "cold (weather)"],
  ["暖かい", "あたたかい", "warm"],
  ["涼しい", "すずしい", "cool / refreshing"],
  ["有名", "ゆうめい", "famous"],
  ["便利", "べんり", "convenient"],
  ["不便", "ふべん", "inconvenient"],
  ["静か", "しずか", "quiet"],
  ["賑やか", "にぎやか", "lively / bustling"],
  ["親切", "しんせつ", "kind / helpful"],
  ["元気", "げんき", "healthy / energetic"],
  ["丈夫", "じょうぶ", "strong / durable"],
  ["上手", "じょうず", "skillful / good at"],
  ["下手", "へた", "unskillful / poor at"],
  ["好き", "すき", "liked / favorite"],
  ["嫌い", "きらい", "disliked"],
  ["同じ", "おなじ", "same"],
  ["違う", "ちがう", "different / wrong"],
  ["一番", "いちばん", "number one / most"],
  ["全部", "ぜんぶ", "all / everything"],
  ["大変", "たいへん", "tough / very"],
  ["絶対", "ぜったい", "absolutely / definitely"],
];

let cachedLexiconMap: Map<string, KanjiAnnotationEntry> | null = null;
let cachedSortedKeys: string[] | null = null;

function getLexicon(): {
  map: Map<string, KanjiAnnotationEntry>;
  keys: string[];
} {
  if (cachedLexiconMap && cachedSortedKeys) {
    return { map: cachedLexiconMap, keys: cachedSortedKeys };
  }

  const map = new Map<string, KanjiAnnotationEntry>();

  // 1. Load static JLPT nouns/adjectives/expressions
  for (const [surface, reading, meaning] of STATIC_KANJI_LEXICON) {
    map.set(surface, { surface, reading, meaning });
  }

  // 2. Load all 3,437 verbs + inflected stems from seed_verbs.json
  const corpus = seedVerbs as unknown as RawSeedVerb[];
  for (const v of corpus) {
    if (!v.kanji_form || !v.furigana_reading) continue;
    const meaningStr = Array.isArray(v.meanings)
      ? v.meanings.slice(0, 3).join(", ")
      : "";

    if (!map.has(v.kanji_form)) {
      map.set(v.kanji_form, {
        surface: v.kanji_form,
        reading: v.furigana_reading,
        meaning: meaningStr,
      });
    }

    // Extract pure kanji prefix stem (e.g., 食べる -> 食, 実装する -> 実装)
    const kanjiPrefixMatch = v.kanji_form.match(/^([\u4e00-\u9faf\u3400-\u4dbf々]+)(.*)$/);
    if (kanjiPrefixMatch) {
      const kanjiStem = kanjiPrefixMatch[1];
      const okurigana = kanjiPrefixMatch[2];
      if (
        kanjiStem.length >= 1 &&
        okurigana &&
        v.furigana_reading.endsWith(okurigana)
      ) {
        const stemReading = v.furigana_reading.slice(
          0,
          v.furigana_reading.length - okurigana.length
        );
        if (stemReading && !map.has(kanjiStem)) {
          map.set(kanjiStem, {
            surface: kanjiStem,
            reading: stemReading,
            meaning: `${meaningStr} (${v.kanji_form})`,
          });
        }
      }
    }
  }

  const keys = Array.from(map.keys()).sort((a, b) => b.length - a.length);
  cachedLexiconMap = map;
  cachedSortedKeys = keys;
  return { map, keys };
}

export interface AnnotatedSegment {
  text: string;
  annotation?: KanjiAnnotationEntry;
  fallbackReading?: string;
}

const HAS_KANJI_REGEX = /[\u4e00-\u9faf\u3400-\u4dbf々]/;

/**
 * Splits a Japanese sentence or quiz option into annotated segments,
 * pairing every matched lexicon word AND any unmatched kanji run with
 * a reading (via fallbackHint alignment) and meaning tooltip.
 */
export function segmentJapaneseWithAnnotations(
  text: string,
  fallbackFuriganaHint?: string
): AnnotatedSegment[] {
  if (!text) return [];
  const { map, keys } = getLexicon();
  const segments: AnnotatedSegment[] = [];

  let i = 0;
  while (i < text.length) {
    let matchedEntry: KanjiAnnotationEntry | undefined;

    for (const key of keys) {
      if (text.startsWith(key, i)) {
        matchedEntry = map.get(key);
        break;
      }
    }

    if (matchedEntry) {
      segments.push({
        text: matchedEntry.surface,
        annotation: matchedEntry,
      });
      i += matchedEntry.surface.length;
      continue;
    }

    // If current char is an unmatched kanji, group contiguous kanji
    if (HAS_KANJI_REGEX.test(text[i])) {
      let j = i + 1;
      while (j < text.length && HAS_KANJI_REGEX.test(text[j])) {
        j++;
      }
      const kanjiChunk = text.slice(i, j);
      const singleLookup = map.get(kanjiChunk);
      segments.push({
        text: kanjiChunk,
        annotation: singleLookup,
        fallbackReading: singleLookup ? undefined : fallbackFuriganaHint,
      });
      i = j;
      continue;
    }

    // Accumulate non-kanji kana/punctuation
    let j = i + 1;
    while (j < text.length && !HAS_KANJI_REGEX.test(text[j])) {
      // Stop if a lexicon key starts at j
      let keyStartsHere = false;
      for (const key of keys) {
        if (text.startsWith(key, j)) {
          keyStartsHere = true;
          break;
        }
      }
      if (keyStartsHere) break;
      j++;
    }
    segments.push({ text: text.slice(i, j) });
    i = j;
  }

  return segments;
}

export interface AnnotatedJapaneseTextProps {
  text: string;
  showFurigana: boolean;
  fallbackFuriganaHint?: string;
  enableTooltip?: boolean;
  className?: string;
}

export const AnnotatedJapaneseText: React.FC<AnnotatedJapaneseTextProps> = ({
  text,
  showFurigana,
  fallbackFuriganaHint,
  enableTooltip = true,
  className = "",
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const segments = segmentJapaneseWithAnnotations(text, fallbackFuriganaHint);

  // Check if any segment had an unmatched kanji without its own reading
  const hasUnresolvedKanji = segments.some(
    (s) => HAS_KANJI_REGEX.test(s.text) && !s.annotation
  );

  return (
    <span className={`inline-flex flex-wrap items-baseline leading-relaxed ${className}`}>
      {segments.map((seg, idx) => {
        const isKanji = HAS_KANJI_REGEX.test(seg.text);
        const reading = seg.annotation?.reading;
        const meaning = seg.annotation?.meaning;
        const isOpen = activeIndex === idx;

        if (!isKanji) {
          return <span key={idx}>{seg.text}</span>;
        }

        const innerRuby =
          showFurigana && reading ? (
            <ruby className="font-jp">
              {seg.text}
              <rt className="text-[10px] text-accent font-medium select-none">
                {reading}
              </rt>
            </ruby>
          ) : (
            <span className="font-jp">{seg.text}</span>
          );

        if (!enableTooltip || (!meaning && !reading)) {
          return <span key={idx}>{innerRuby}</span>;
        }

        return (
          <span
            key={idx}
            role="button"
            tabIndex={0}
            onMouseEnter={() => setActiveIndex(idx)}
            onMouseLeave={() => setActiveIndex(null)}
            onFocus={() => setActiveIndex(idx)}
            onBlur={() => setActiveIndex(null)}
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex((prev) => (prev === idx ? null : idx));
            }}
            className="relative inline-block cursor-help border-b border-dotted border-accent/60 hover:border-accent hover:bg-accent/10 rounded px-0.5 transition-colors"
          >
            {innerRuby}

            {isOpen && (
              <span
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-max max-w-[230px] px-3 py-2 rounded-xl bg-zinc-900/95 text-white border border-accent/40 shadow-xl text-left pointer-events-auto"
              >
                <span className="block font-jp text-xs font-bold text-accent">
                  {seg.text} {reading ? `（${reading}）` : ""}
                </span>
                <span className="block text-[11px] text-zinc-200 leading-snug mt-0.5">
                  {meaning || "JLPT vocabulary term"}
                </span>
              </span>
            )}
          </span>
        );
      })}

      {/* If an entire sentence contained rare kanji not in lexicon, show aligned reading hint when Furigana is ON */}
      {showFurigana && hasUnresolvedKanji && fallbackFuriganaHint && (
        <span className="block w-full text-xs font-jp text-accent/90 mt-1">
          {fallbackFuriganaHint}
        </span>
      )}
    </span>
  );
};