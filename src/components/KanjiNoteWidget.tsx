import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus,
  X,
  Search,
  Volume2,
  BookOpen,
  Calendar,
  Trash2,
  Check,
  Sparkles,
  RefreshCw,
  Type,
  ArrowRight,
} from "lucide-react";
import { getDatabase } from "../lib/db";
import { speakJapanese } from "../lib/audio";
import seedVerbs from "../data/seed_verbs.json";

export interface LearnedKanjiNote {
  id: string;
  kanji: string;
  furigana: string;
  meaning: string;
  source_note: string;
  jlpt_level: string;
  learned_at: string;
  sync_dirty: number;
  updated_at: string;
  deleted_at: string | null;
}

interface KanjiCandidate {
  kanji: string;
  furigana: string;
  meaning: string;
  jlpt_level: string;
  origin: "Core" | "Corpus" | "Dictionary";
}

const KANJI_RE = /[\u4e00-\u9faf\u3400-\u4dbf]/;
const LATIN_RE = /[a-zA-Z]/;

// --- Romaji to Hiragana Converter (supports Hepburn, Kunrei-shiki, sokuon, and n/nn) ---
const ROMAJI_TABLE: Record<string, string> = {
  // 4-char
  ltsu: "っ",
  xtsu: "っ",
  // 3-char
  kya: "きゃ", kyu: "きゅ", kyo: "きょ",
  sha: "しゃ", shi: "し", shu: "しゅ", sho: "しょ", she: "しぇ",
  sya: "しゃ", syu: "しゅ", syo: "しょ",
  cha: "ちゃ", chi: "ち", chu: "ちゅ", cho: "ちょ", che: "ちぇ",
  tya: "ちゃ", tyu: "ちゅ", tyo: "ちょ",
  cya: "ちゃ", cyu: "ちゅ", cyo: "ちょ",
  tsu: "つ", tsa: "つぁ", tsi: "つぃ", tse: "つぇ", tso: "つぉ",
  nya: "にゃ", nyu: "にゅ", nyo: "にょ",
  hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ",
  mya: "みゃ", myu: "みゅ", myo: "みょ",
  rya: "りゃ", ryu: "りゅ", ryo: "りょ",
  gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ",
  jya: "じゃ", jyu: "じゅ", jyo: "じょ",
  zya: "じゃ", zyu: "じゅ", zyo: "じょ",
  bya: "びゃ", byu: "びゅ", byo: "びょ",
  pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ",
  dya: "ぢゃ", dyu: "ぢゅ", dyo: "ぢょ",
  fya: "ふゃ", fyu: "ふゅ", fyo: "ふょ",
  xya: "ゃ", xyu: "ゅ", xyo: "ょ",
  lya: "ゃ", lyu: "ゅ", lyo: "ょ",
  xtu: "っ", ltu: "っ",
  // 2-char
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  sa: "さ", si: "し", su: "す", se: "せ", so: "そ",
  ta: "た", ti: "ち", tu: "つ", te: "て", to: "と",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", hu: "ふ", fu: "ふ", he: "へ", ho: "ほ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ", wi: "うぃ", we: "うぇ", wo: "を",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  za: "ざ", zi: "じ", ji: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  ja: "じゃ", ju: "じゅ", jo: "じょ", je: "じぇ",
  fa: "ふぁ", fi: "ふぃ", fe: "ふぇ", fo: "ふぉ",
  va: "ゔぁ", vi: "ゔぃ", vu: "ゔ", ve: "ゔぇ", vo: "ゔぉ",
  xa: "ぁ", xi: "ぃ", xu: "ぅ", xe: "ぇ", xo: "ぉ",
  la: "ぁ", li: "ぃ", lu: "ぅ", le: "ぇ", lo: "ぉ",
  // 1-char
  a: "あ", i: "い", u: "う", e: "え", o: "お",
  "-": "ー",
};

const CONSONANTS = new Set("bcdfghjklmpqrstvwxyz".split(""));
const VOWELS_OR_Y = new Set(["a", "i", "u", "e", "o", "y"]);

function romajiToHiragana(input: string, finalizeTrailingN = false): string {
  const s = input.toLowerCase();
  let out = "";
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    // Double consonant -> small っ (e.g., kk, tt, pp, ss, tch)
    if (i + 2 < s.length && s.slice(i, i + 3) === "tch") {
      out += "っ";
      i += 1;
      continue;
    }
    if (
      i + 1 < s.length &&
      ch === s[i + 1] &&
      CONSONANTS.has(ch) &&
      ch !== "n"
    ) {
      out += "っ";
      i += 1;
      continue;
    }

    // 'n' / 'nn' / "n'" handling -> ん
    if (ch === "n") {
      const next = s[i + 1];
      if (next === "n" || next === "'") {
        out += "ん";
        i += 2;
        continue;
      }
      if (!next) {
        out += finalizeTrailingN ? "ん" : "n";
        i += 1;
        continue;
      }
      if (!VOWELS_OR_Y.has(next)) {
        out += "ん";
        i += 1;
        continue;
      }
    }

    // Longest match (4 -> 3 -> 2 -> 1)
    let matched = false;
    for (let len = 4; len >= 1; len--) {
      if (i + len <= s.length) {
        const chunk = s.slice(i, i + len);
        if (ROMAJI_TABLE[chunk]) {
          out += ROMAJI_TABLE[chunk];
          i += len;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      out += input[i];
      i += 1;
    }
  }

  return out;
}

function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

// Core 1-kana, single-kanji, and common non-verb N5-N2 vocabulary for instant offline Kanji <-> Furigana
const CORE_LEXICON: KanjiCandidate[] = [
  { kanji: "下", furigana: "した", meaning: "below, under, beneath, bottom", jlpt_level: "N5", origin: "Core" },
  { kanji: "下", furigana: "もと", meaning: "under (guidance/supervision), base", jlpt_level: "N3", origin: "Core" },
  { kanji: "下る", furigana: "くだる", meaning: "to descend, to go down, to be given", jlpt_level: "N3", origin: "Core" },
  { kanji: "下がる", furigana: "さがる", meaning: "to hang down, to fall, to step back", jlpt_level: "N4", origin: "Core" },
  { kanji: "下ろす", furigana: "おろす", meaning: "to take down, to lower, to withdraw", jlpt_level: "N4", origin: "Core" },
  { kanji: "舌", furigana: "した", meaning: "tongue", jlpt_level: "N3", origin: "Core" },
  { kanji: "上", furigana: "うえ", meaning: "above, up, over, top", jlpt_level: "N5", origin: "Core" },
  { kanji: "胃", furigana: "い", meaning: "stomach", jlpt_level: "N3", origin: "Core" },
  { kanji: "絵", furigana: "え", meaning: "picture, drawing, painting", jlpt_level: "N5", origin: "Core" },
  { kanji: "尾", furigana: "お", meaning: "tail, ridge", jlpt_level: "N2", origin: "Core" },
  { kanji: "蚊", furigana: "か", meaning: "mosquito", jlpt_level: "N3", origin: "Core" },
  { kanji: "木", furigana: "き", meaning: "tree, wood, timber", jlpt_level: "N5", origin: "Core" },
  { kanji: "気", furigana: "き", meaning: "spirit, mind, mood, air", jlpt_level: "N5", origin: "Core" },
  { kanji: "毛", furigana: "け", meaning: "hair, fur, wool", jlpt_level: "N4", origin: "Core" },
  { kanji: "子", furigana: "こ", meaning: "child, kid", jlpt_level: "N5", origin: "Core" },
  { kanji: "差", furigana: "さ", meaning: "difference, variation", jlpt_level: "N3", origin: "Core" },
  { kanji: "死", furigana: "し", meaning: "death", jlpt_level: "N3", origin: "Core" },
  { kanji: "詩", furigana: "し", meaning: "poem, poetry", jlpt_level: "N3", origin: "Core" },
  { kanji: "市", furigana: "し", meaning: "city, market", jlpt_level: "N4", origin: "Core" },
  { kanji: "酢", furigana: "す", meaning: "vinegar", jlpt_level: "N3", origin: "Core" },
  { kanji: "背", furigana: "せ", meaning: "back, height, stature", jlpt_level: "N4", origin: "Core" },
  { kanji: "田", furigana: "た", meaning: "rice field, paddy", jlpt_level: "N5", origin: "Core" },
  { kanji: "血", furigana: "ち", meaning: "blood", jlpt_level: "N4", origin: "Core" },
  { kanji: "地", furigana: "ち", meaning: "earth, ground, land", jlpt_level: "N4", origin: "Core" },
  { kanji: "手", furigana: "て", meaning: "hand, arm", jlpt_level: "N5", origin: "Core" },
  { kanji: "戸", furigana: "と", meaning: "door (Japanese style)", jlpt_level: "N4", origin: "Core" },
  { kanji: "名", furigana: "な", meaning: "name, reputation", jlpt_level: "N5", origin: "Core" },
  { kanji: "荷", furigana: "に", meaning: "load, baggage, cargo", jlpt_level: "N3", origin: "Core" },
  { kanji: "根", furigana: "ね", meaning: "root, base", jlpt_level: "N3", origin: "Core" },
  { kanji: "値", furigana: "ね", meaning: "price, cost, value", jlpt_level: "N3", origin: "Core" },
  { kanji: "野", furigana: "の", meaning: "plain, field", jlpt_level: "N4", origin: "Core" },
  { kanji: "歯", furigana: "は", meaning: "tooth, teeth", jlpt_level: "N4", origin: "Core" },
  { kanji: "葉", furigana: "は", meaning: "leaf, foliage", jlpt_level: "N4", origin: "Core" },
  { kanji: "日", furigana: "ひ", meaning: "day, sun, sunlight", jlpt_level: "N5", origin: "Core" },
  { kanji: "火", furigana: "ひ", meaning: "fire, flame", jlpt_level: "N5", origin: "Core" },
  { kanji: "帆", furigana: "ほ", meaning: "sail", jlpt_level: "N1", origin: "Core" },
  { kanji: "実", furigana: "み", meaning: "fruit, nut, seed, substance", jlpt_level: "N3", origin: "Core" },
  { kanji: "身", furigana: "み", meaning: "body, oneself", jlpt_level: "N3", origin: "Core" },
  { kanji: "目", furigana: "め", meaning: "eye, eyeball", jlpt_level: "N5", origin: "Core" },
  { kanji: "芽", furigana: "め", meaning: "sprout, bud", jlpt_level: "N3", origin: "Core" },
  { kanji: "矢", furigana: "や", meaning: "arrow", jlpt_level: "N2", origin: "Core" },
  { kanji: "湯", furigana: "ゆ", meaning: "hot water, hot spring", jlpt_level: "N4", origin: "Core" },
  { kanji: "輪", furigana: "わ", meaning: "ring, circle, wheel", jlpt_level: "N3", origin: "Core" },
  { kanji: "本", furigana: "ほん", meaning: "book, origin, main", jlpt_level: "N5", origin: "Core" },
  { kanji: "水", furigana: "みず", meaning: "water", jlpt_level: "N5", origin: "Core" },
  { kanji: "山", furigana: "やま", meaning: "mountain, hill", jlpt_level: "N5", origin: "Core" },
  { kanji: "川", furigana: "かわ", meaning: "river, stream", jlpt_level: "N5", origin: "Core" },
  { kanji: "人", furigana: "ひと", meaning: "person, human", jlpt_level: "N5", origin: "Core" },
  { kanji: "車", furigana: "くるま", meaning: "car, vehicle", jlpt_level: "N5", origin: "Core" },
  { kanji: "駅", furigana: "えき", meaning: "train station", jlpt_level: "N5", origin: "Core" },
  { kanji: "店", furigana: "みせ", meaning: "store, shop", jlpt_level: "N5", origin: "Core" },
  { kanji: "道", furigana: "みち", meaning: "road, street, way", jlpt_level: "N5", origin: "Core" },
  { kanji: "雨", furigana: "あめ", meaning: "rain", jlpt_level: "N5", origin: "Core" },
  { kanji: "雪", furigana: "ゆき", meaning: "snow", jlpt_level: "N4", origin: "Core" },
  { kanji: "風", furigana: "かぜ", meaning: "wind, breeze", jlpt_level: "N4", origin: "Core" },
  { kanji: "空", furigana: "そら", meaning: "sky, air", jlpt_level: "N5", origin: "Core" },
  { kanji: "海", furigana: "うみ", meaning: "sea, ocean", jlpt_level: "N4", origin: "Core" },
  { kanji: "花", furigana: "はな", meaning: "flower, blossom", jlpt_level: "N5", origin: "Core" },
  { kanji: "犬", furigana: "いぬ", meaning: "dog", jlpt_level: "N5", origin: "Core" },
  { kanji: "猫", furigana: "ねこ", meaning: "cat", jlpt_level: "N5", origin: "Core" },
  { kanji: "魚", furigana: "さかな", meaning: "fish", jlpt_level: "N5", origin: "Core" },
  { kanji: "肉", furigana: "にく", meaning: "meat", jlpt_level: "N5", origin: "Core" },
  { kanji: "図書館", furigana: "としょかん", meaning: "library", jlpt_level: "N5", origin: "Core" },
  { kanji: "日本", furigana: "にほん", meaning: "Japan", jlpt_level: "N5", origin: "Core" },
  { kanji: "日本語", furigana: "にほんご", meaning: "Japanese language", jlpt_level: "N5", origin: "Core" },
  { kanji: "学校", furigana: "がっこう", meaning: "school", jlpt_level: "N5", origin: "Core" },
  { kanji: "先生", furigana: "せんせい", meaning: "teacher, master, doctor", jlpt_level: "N5", origin: "Core" },
  { kanji: "学生", furigana: "がくせい", meaning: "student", jlpt_level: "N5", origin: "Core" },
  { kanji: "会社", furigana: "かいしゃ", meaning: "company, corporation", jlpt_level: "N5", origin: "Core" },
  { kanji: "電車", furigana: "でんしゃ", meaning: "train, electric train", jlpt_level: "N5", origin: "Core" },
  { kanji: "病院", furigana: "びょういん", meaning: "hospital", jlpt_level: "N5", origin: "Core" },
  { kanji: "銀行", furigana: "ぎんこう", meaning: "bank", jlpt_level: "N5", origin: "Core" },
  { kanji: "映画", furigana: "えいが", meaning: "movie, film", jlpt_level: "N5", origin: "Core" },
  { kanji: "音楽", furigana: "おんがく", meaning: "music", jlpt_level: "N5", origin: "Core" },
  { kanji: "料理", furigana: "りょうり", meaning: "cooking, cuisine, dish", jlpt_level: "N4", origin: "Core" },
  { kanji: "写真", furigana: "しゃしん", meaning: "photograph, picture", jlpt_level: "N5", origin: "Core" },
  { kanji: "天気", furigana: "てんき", meaning: "weather", jlpt_level: "N5", origin: "Core" },
  { kanji: "時間", furigana: "じかん", meaning: "time, hour", jlpt_level: "N5", origin: "Core" },
  { kanji: "今日", furigana: "きょう", meaning: "today", jlpt_level: "N5", origin: "Core" },
  { kanji: "明日", furigana: "あした", meaning: "tomorrow", jlpt_level: "N5", origin: "Core" },
  { kanji: "昨日", furigana: "きのう", meaning: "yesterday", jlpt_level: "N5", origin: "Core" },
  { kanji: "友達", furigana: "ともだち", meaning: "friend, companion", jlpt_level: "N5", origin: "Core" },
  { kanji: "家族", furigana: "かぞく", meaning: "family", jlpt_level: "N5", origin: "Core" },
  { kanji: "漢字", furigana: "かんじ", meaning: "kanji, Chinese characters", jlpt_level: "N4", origin: "Core" },
];

// Build an offline lookup index from seed_verbs.json (verbs + suru-stems + ruby_segments)
const CORPUS_INDEX: KanjiCandidate[] = (() => {
  const entries: KanjiCandidate[] = [];
  const seen = new Set<string>();

  const pushUnique = (item: KanjiCandidate) => {
    const key = `${item.kanji}|${item.furigana}`;
    if (!seen.has(key) && item.kanji && item.furigana) {
      seen.add(key);
      entries.push(item);
    }
  };

  for (const v of seedVerbs as any[]) {
    const kanji: string = v.kanji_form || "";
    const reading: string = v.furigana_reading || "";
    const meaning = Array.isArray(v.meanings)
      ? v.meanings.slice(0, 3).join(", ")
      : String(v.meanings || "");
    const jlpt: string = v.jlpt_level || "";

    pushUnique({ kanji, furigana: reading, meaning, jlpt_level: jlpt, origin: "Corpus" });

    // Index noun stems of 〜する verbs (e.g. 勉強する -> 勉強 / べんきょう)
    if (kanji.endsWith("する") && reading.endsWith("する") && kanji.length > 2) {
      pushUnique({
        kanji: kanji.slice(0, -2),
        furigana: reading.slice(0, -2),
        meaning,
        jlpt_level: jlpt,
        origin: "Corpus",
      });
    }

    // Index character/compound ruby_segments so individual kanji resolve readings offline
    if (Array.isArray(v.ruby_segments)) {
      for (const seg of v.ruby_segments) {
        if (seg?.base && seg?.ruby && KANJI_RE.test(seg.base)) {
          pushUnique({
            kanji: seg.base,
            furigana: seg.ruby,
            meaning: `${meaning} (in ${kanji})`,
            jlpt_level: jlpt,
            origin: "Corpus",
          });
        }
      }
    }
  }

  return entries;
})();

function searchOfflineCandidates(rawQuery: string): KanjiCandidate[] {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [];

  // Normalize Romaji or Katakana into Hiragana for matching
  const normalizedQuery = LATIN_RE.test(trimmed)
    ? romajiToHiragana(trimmed, true)
    : katakanaToHiragana(trimmed);

  const exactMatches: KanjiCandidate[] = [];
  const prefixMatches: KanjiCandidate[] = [];
  const seen = new Set<string>();

  const checkList = (list: KanjiCandidate[]) => {
    for (const item of list) {
      const key = `${item.kanji}|${item.furigana}`;
      if (seen.has(key)) continue;

      if (
        item.furigana === normalizedQuery ||
        item.kanji === trimmed ||
        item.kanji === normalizedQuery
      ) {
        seen.add(key);
        exactMatches.push(item);
      } else if (
        item.furigana.startsWith(normalizedQuery) ||
        item.kanji.startsWith(trimmed)
      ) {
        seen.add(key);
        prefixMatches.push(item);
      }
    }
  };

  checkList(CORE_LEXICON);
  checkList(CORPUS_INDEX);

  prefixMatches.sort((a, b) => a.furigana.length - b.furigana.length);
  return [...exactMatches, ...prefixMatches].slice(0, 14);
}

function formatLearnedDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const KanjiNoteWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"add" | "log">("add");

  // Form states
  const [furiganaInput, setFuriganaInput] = useState("");
  const [kanjiInput, setKanjiInput] = useState("");
  const [meaningInput, setMeaningInput] = useState("");
  const [sourceInput, setSourceInput] = useState("");
  const [jlptInput, setJlptInput] = useState("");
  const [furiganaOnlyMode, setFuriganaOnlyMode] = useState(false);

  // Explicit state tracking which input the user is driving
  const [activeDriver, setActiveDriver] = useState<"furigana" | "kanji">("furigana");
  const isComposingRef = useRef<boolean>(false);
  const userEditedFuriganaRef = useRef<boolean>(false);
  const userEditedMeaningRef = useRef<boolean>(false);

  // Lookup & stored notes
  const [remoteCandidates, setRemoteCandidates] = useState<KanjiCandidate[]>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [notes, setNotes] = useState<LearnedKanjiNote[]>([]);
  const [logSearch, setLogSearch] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. Ensure SQLite table exists & load saved kanji notes
  const ensureTableAndLoad = async () => {
    const db = await getDatabase();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS learned_kanji_notes (
        id TEXT PRIMARY KEY,
        kanji TEXT NOT NULL,
        furigana TEXT NOT NULL,
        meaning TEXT NOT NULL,
        source_note TEXT NOT NULL DEFAULT '',
        jlpt_level TEXT NOT NULL DEFAULT '',
        learned_at TEXT NOT NULL,
        sync_dirty INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
    `);

    const rows = await db.select<LearnedKanjiNote[]>(
      `SELECT * FROM learned_kanji_notes WHERE deleted_at IS NULL ORDER BY learned_at DESC;`
    );
    setNotes(rows || []);
  };

  // Resolve active userId for Neon sync
  const resolveSyncUserId = async (): Promise<string> => {
    const stored = localStorage.getItem("jlpt_user_id");
    if (stored) return stored;

    try {
      const db = await getDatabase();
      const profiles = await db.select<Array<{ id: string }>>(
        `SELECT id FROM user_profiles LIMIT 1;`
      );
      if (profiles?.[0]?.id) return profiles[0].id;
    } catch {
      // Fallback to default guest ID
    }
    return "guest_user";
  };

  // Sync dirty rows with Neon edge endpoint if configured
  const syncKanjiNotes = async () => {
    const apiUrl = import.meta.env.VITE_SYNC_API_URL;
    if (!apiUrl || (typeof navigator !== "undefined" && !navigator.onLine)) return;

    try {
      setIsSyncing(true);
      const db = await getDatabase();
      const userId = await resolveSyncUserId();
      const dirtyRows = await db.select<LearnedKanjiNote[]>(
        `SELECT * FROM learned_kanji_notes WHERE sync_dirty = 1;`
      );
      const lastSync =
        localStorage.getItem("jlpt_kanji_notes_last_sync") || "1970-01-01T00:00:00.000Z";
      const token = localStorage.getItem("jlpt_auth_token") || "guest_token";

      const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          lastSyncedAt: lastSync,
          kanji_notes: dirtyRows,
        }),
      });

      if (!res.ok) return;
      const data = await res.json();

      for (const row of dirtyRows) {
        await db.execute(`UPDATE learned_kanji_notes SET sync_dirty = 0 WHERE id = ?;`, [row.id]);
      }

      if (Array.isArray(data.kanji_notes)) {
        for (const remote of data.kanji_notes) {
          await db.execute(
            `INSERT INTO learned_kanji_notes (
              id, kanji, furigana, meaning, source_note, jlpt_level,
              learned_at, sync_dirty, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              kanji = excluded.kanji,
              furigana = excluded.furigana,
              meaning = excluded.meaning,
              source_note = excluded.source_note,
              jlpt_level = excluded.jlpt_level,
              learned_at = excluded.learned_at,
              sync_dirty = 0,
              updated_at = excluded.updated_at,
              deleted_at = excluded.deleted_at
            WHERE excluded.updated_at > learned_kanji_notes.updated_at;`,
            [
              remote.id,
              remote.kanji,
              remote.furigana,
              remote.meaning,
              remote.source_note || "",
              remote.jlpt_level || "",
              remote.learned_at,
              remote.updated_at,
              remote.deleted_at || null,
            ]
          );
        }
      }

      localStorage.setItem("jlpt_kanji_notes_last_sync", data.serverTime || new Date().toISOString());
      await ensureTableAndLoad();
      window.dispatchEvent(new Event("kanji-notes-updated"));
    } catch (err) {
      console.warn("[KanjiNoteWidget] Cloud sync skipped:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    ensureTableAndLoad().then(() => syncKanjiNotes());
  }, []);

  // Live Romaji -> Hiragana conversion preview when user types on a Romaji keyboard
  const liveRomajiHiragana = useMemo(() => {
    const trimmed = furiganaInput.trim();
    if (!trimmed || !LATIN_RE.test(trimmed)) return "";
    return romajiToHiragana(trimmed, true);
  }, [furiganaInput]);

  // Normalized query for dictionary lookup (converts Romaji/Katakana -> Hiragana automatically)
  const activeSearchQuery = useMemo(() => {
    const k = kanjiInput.trim();
    const f = furiganaInput.trim();
    if (activeDriver === "kanji" && k) return k;
    if (f) {
      return LATIN_RE.test(f) ? romajiToHiragana(f, true) : katakanaToHiragana(f);
    }
    return k;
  }, [activeDriver, furiganaInput, kanjiInput]);

  // 2. Instant synchronous offline candidates
  const localCandidates = useMemo<KanjiCandidate[]>(() => {
    return searchOfflineCandidates(activeSearchQuery);
  }, [activeSearchQuery]);

  // 3. Debounced CORS-safe online dictionary lookup (Jotoba primary + Jisho proxy fallback)
  useEffect(() => {
    const q = activeSearchQuery;
    if (!q) {
      setRemoteCandidates([]);
      return;
    }

    const timer = setTimeout(async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        setIsLookingUp(true);
        const exactItems: KanjiCandidate[] = [];
        const otherItems: KanjiCandidate[] = [];

        // Primary: Jotoba API (supports browser & Tauri WebView CORS natively)
        const jotobaRes = await fetch("https://jotoba.de/api/search/words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: q,
            language: "English",
            no_english: false,
          }),
        });

        if (jotobaRes.ok) {
          const data = await jotobaRes.json();
          for (const entry of (data.words || []).slice(0, 15)) {
            const reading: string = entry.reading?.kana || "";
            const word: string = entry.reading?.kanji || reading;
            const glosses: string[] = entry.senses?.[0]?.glosses || [];
            const meaning = glosses.slice(0, 3).join(", ");
            if (!word || !meaning) continue;

            const candidate: KanjiCandidate = {
              kanji: word,
              furigana: reading || q,
              meaning,
              jlpt_level: "",
              origin: "Dictionary",
            };

            if (reading === q || word === q) {
              exactItems.push(candidate);
            } else {
              otherItems.push(candidate);
            }
          }
        }

        otherItems.sort((a, b) => a.furigana.length - b.furigana.length);
        setRemoteCandidates([...exactItems, ...otherItems].slice(0, 12));
      } catch {
        // Offline or network blocked; localCandidates still work seamlessly
      } finally {
        setIsLookingUp(false);
      }
    }, 240);

    return () => clearTimeout(timer);
  }, [activeSearchQuery]);

  // Merge deduplicated candidates (exact matches first)
  const allCandidates = useMemo(() => {
    const seen = new Set<string>();
    const combined: KanjiCandidate[] = [];
    for (const c of [...localCandidates, ...remoteCandidates]) {
      const key = `${c.kanji}|${c.furigana}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(c);
      }
    }
    return combined.slice(0, 14);
  }, [localCandidates, remoteCandidates]);

  // Automatic Kanji -> Furigana + Meaning resolution whenever user types in Kanji box
  useEffect(() => {
    if (activeDriver !== "kanji" || furiganaOnlyMode) return;
    const kTrimmed = kanjiInput.trim();
    if (!kTrimmed || allCandidates.length === 0) return;

    const exactKanjiMatch = allCandidates.find(
      (c) => c.kanji === kTrimmed && c.furigana && !KANJI_RE.test(c.furigana)
    );
    const prefixMatch = allCandidates.find(
      (c) => c.kanji.startsWith(kTrimmed) && c.furigana && !KANJI_RE.test(c.furigana)
    );
    const best = exactKanjiMatch || prefixMatch;

    if (best) {
      if (!userEditedFuriganaRef.current) {
        setFuriganaInput(best.furigana);
      }
      if (!userEditedMeaningRef.current) {
        setMeaningInput(best.meaning);
      }
      if (best.jlpt_level) {
        setJlptInput(best.jlpt_level);
      }
    }
  }, [allCandidates, kanjiInput, activeDriver, furiganaOnlyMode]);

  // Distinct Furigana reading options (shown under Step 1)
  const furiganaOptions = useMemo(() => {
    const fTrimmed = furiganaInput.trim();
    const kTrimmed = kanjiInput.trim();
    const seen = new Set<string>();
    const options: Array<{ reading: string; sampleMeaning: string; jlpt: string }> = [];

    // If user typed Romaji, offer the converted Hiragana first!
    if (fTrimmed && LATIN_RE.test(fTrimmed)) {
      const converted = romajiToHiragana(fTrimmed, true);
      if (converted && !LATIN_RE.test(converted)) {
        const match = allCandidates.find((c) => c.furigana === converted);
        seen.add(converted);
        options.push({
          reading: converted,
          sampleMeaning: match?.meaning || "",
          jlpt: match?.jlpt_level || "",
        });
      }
    } else if (fTrimmed && !KANJI_RE.test(fTrimmed)) {
      const matchingCand = allCandidates.find((c) => c.furigana === fTrimmed);
      seen.add(fTrimmed);
      options.push({
        reading: fTrimmed,
        sampleMeaning: matchingCand?.meaning || "",
        jlpt: matchingCand?.jlpt_level || "",
      });
    }

    // Prioritize readings belonging to the currently entered Kanji
    const orderedCandidates = kTrimmed
      ? [
          ...allCandidates.filter((c) => c.kanji === kTrimmed),
          ...allCandidates.filter((c) => c.kanji !== kTrimmed),
        ]
      : allCandidates;

    for (const c of orderedCandidates) {
      if (c.furigana && !KANJI_RE.test(c.furigana) && !seen.has(c.furigana)) {
        seen.add(c.furigana);
        options.push({
          reading: c.furigana,
          sampleMeaning: c.meaning,
          jlpt: c.jlpt_level,
        });
      }
      if (options.length >= 6) break;
    }

    return options;
  }, [furiganaInput, kanjiInput, allCandidates]);

  // Distinct Kanji options (shown under Step 2 so user can pick WHICH kanji they meant)
  const kanjiOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: KanjiCandidate[] = [];

    for (const c of allCandidates) {
      if (!KANJI_RE.test(c.kanji)) continue;
      const key = `${c.kanji}|${c.furigana}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(c);
      if (options.length >= 8) break;
    }

    return options;
  }, [allCandidates]);

  // Handler: User selects a Furigana reading pill in Step 1
  const handleSelectFuriganaOption = (reading: string, sampleMeaning?: string, jlpt?: string) => {
    userEditedFuriganaRef.current = true;
    setFuriganaInput(reading);

    const kTrimmed = kanjiInput.trim();
    if (furiganaOnlyMode) {
      setKanjiInput("");
      if (sampleMeaning && !userEditedMeaningRef.current) {
        setMeaningInput(sampleMeaning);
      }
    } else if (kTrimmed) {
      const pairMatch = allCandidates.find(
        (c) => c.kanji === kTrimmed && c.furigana === reading
      );
      if (pairMatch && !userEditedMeaningRef.current) {
        setMeaningInput(pairMatch.meaning);
        if (pairMatch.jlpt_level) setJlptInput(pairMatch.jlpt_level);
      } else if (sampleMeaning && !userEditedMeaningRef.current) {
        setMeaningInput(sampleMeaning);
        if (jlpt) setJlptInput(jlpt);
      }
    }
  };

  // Handler: User toggles "Furigana Only (No Kanji)" mode
  const handleEnableFuriganaOnly = () => {
    const raw = furiganaInput.trim();
    const cleanKana = LATIN_RE.test(raw) ? romajiToHiragana(raw, true) : raw;
    setFuriganaOnlyMode(true);
    setFuriganaInput(cleanKana);
    setKanjiInput("");
    setJlptInput("");
    setActiveDriver("furigana");
    const exact = allCandidates.find((c) => c.furigana === cleanKana);
    if (exact && !userEditedMeaningRef.current) {
      setMeaningInput(exact.meaning);
    }
  };

  // Handler: User clicks a Kanji candidate card in Step 2 -> maps Kanji + Furigana + Meaning + JLPT
  const handleSelectKanjiOption = (candidate: KanjiCandidate) => {
    setFuriganaOnlyMode(false);
    setKanjiInput(candidate.kanji);
    setFuriganaInput(candidate.furigana);
    setMeaningInput(candidate.meaning);
    setJlptInput(candidate.jlpt_level);
    userEditedFuriganaRef.current = false;
    userEditedMeaningRef.current = false;
  };

  // Handler: User types in Step 1 (Furigana / Romaji)
  const handleFuriganaInputChange = (val: string) => {
    const trimmed = val.trim();

    // If user types Kanji directly into Step 1, route it to Step 2 and auto-fill Furigana
    if (!isComposingRef.current && KANJI_RE.test(trimmed)) {
      setActiveDriver("kanji");
      userEditedFuriganaRef.current = false;
      userEditedMeaningRef.current = false;
      setFuriganaOnlyMode(false);
      setKanjiInput(trimmed);

      const immediate = searchOfflineCandidates(trimmed).find(
        (c) => c.kanji === trimmed && !KANJI_RE.test(c.furigana)
      );
      if (immediate) {
        setFuriganaInput(immediate.furigana);
        setMeaningInput(immediate.meaning);
        setJlptInput(immediate.jlpt_level);
      } else {
        setFuriganaInput("");
      }
      return;
    }

    setActiveDriver("furigana");
    userEditedFuriganaRef.current = Boolean(trimmed);
    userEditedMeaningRef.current = false;
    setFuriganaInput(val);
  };

  // Handler: User types in Step 2 (Kanji Form) -> synchronously + asynchronously fills Furigana & Meaning
  const handleKanjiInputChange = (val: string) => {
    setActiveDriver("kanji");
    userEditedFuriganaRef.current = false;
    userEditedMeaningRef.current = false;
    setFuriganaOnlyMode(false);
    setKanjiInput(val);

    const trimmed = val.trim();
    if (!trimmed) {
      setFuriganaInput("");
      setMeaningInput("");
      setJlptInput("");
      return;
    }

    // Immediate synchronous resolution so Furigana appears on the exact same keystroke
    const immediateMatches = searchOfflineCandidates(trimmed);
    const best =
      immediateMatches.find((c) => c.kanji === trimmed && !KANJI_RE.test(c.furigana)) ||
      immediateMatches.find((c) => c.kanji.startsWith(trimmed) && !KANJI_RE.test(c.furigana));

    if (best) {
      setFuriganaInput(best.furigana);
      setMeaningInput(best.meaning);
      setJlptInput(best.jlpt_level);
    }
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawFurigana = furiganaInput.trim();
    const convertedFurigana = LATIN_RE.test(rawFurigana)
      ? romajiToHiragana(rawFurigana, true)
      : rawFurigana;
    const rawKanji = furiganaOnlyMode ? "" : kanjiInput.trim();
    const finalMeaning = meaningInput.trim();

    const cleanFurigana = KANJI_RE.test(convertedFurigana) ? "" : convertedFurigana;
    const finalKanji = rawKanji;

    if ((!finalKanji && !cleanFurigana) || !finalMeaning) return;

    const db = await getDatabase();
    const now = new Date().toISOString();
    const id = `kn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await db.execute(
      `INSERT INTO learned_kanji_notes (
        id, kanji, furigana, meaning, source_note, jlpt_level,
        learned_at, sync_dirty, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NULL);`,
      [id, finalKanji, cleanFurigana, finalMeaning, sourceInput.trim(), jlptInput, now, now]
    );

    await ensureTableAndLoad();
    window.dispatchEvent(new Event("kanji-notes-updated"));
    const label = finalKanji
      ? `${finalKanji}${cleanFurigana ? ` (${cleanFurigana})` : ""}`
      : `${cleanFurigana} (Furigana)`;
    setSaveFeedback(`Saved ${label}`);

    // Reset form
    setActiveDriver("furigana");
    userEditedFuriganaRef.current = false;
    userEditedMeaningRef.current = false;
    setFuriganaOnlyMode(false);
    setFuriganaInput("");
    setKanjiInput("");
    setMeaningInput("");
    setSourceInput("");
    setJlptInput("");
    setRemoteCandidates([]);
    setTimeout(() => setSaveFeedback(null), 2500);

    syncKanjiNotes();
  };

  const handleDeleteNote = async (id: string) => {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE learned_kanji_notes SET deleted_at = ?, updated_at = ?, sync_dirty = 1 WHERE id = ?;`,
      [now, now, id]
    );
    await ensureTableAndLoad();
    window.dispatchEvent(new Event("kanji-notes-updated"));
    syncKanjiNotes();
  };

  const filteredNotes = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.kanji.toLowerCase().includes(q) ||
        n.furigana.toLowerCase().includes(q) ||
        n.meaning.toLowerCase().includes(q) ||
        n.source_note.toLowerCase().includes(q)
    );
  }, [notes, logSearch]);

  return (
    <>
      {/* Floating Bottom-Right "+ Kanji" Trigger Button (>= 44x44px touch target) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Log learned kanji"
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-2 min-h-[46px] px-4 py-2.5 rounded-full bg-accent text-white font-semibold text-sm shadow-lg hover:opacity-95 active:scale-95 transition-all"
      >
        <Plus className="w-4 h-4 stroke-[2.5]" />
        <span>Kanji</span>
        {notes.length > 0 && (
          <span className="ml-0.5 px-1.5 py-0.5 text-[11px] rounded-full bg-white/20 tabular-nums">
            {notes.length}
          </span>
        )}
      </button>

      {/* Glassmorphic Quick-Log & Journal Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl glass-card bg-surface-card border border-border-glass shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-glass">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center font-bold">
                  字
                </div>
                <div>
                  <h3 className="text-sm font-bold text-primary">Daily Kanji & Furigana Notes</h3>
                  <p className="text-[11px] text-primary-muted">
                    Type Kanji, Hiragana, or Romaji — auto-maps reading & meaning
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={syncKanjiNotes}
                  title="Sync notes with cloud"
                  aria-label="Sync kanji notes"
                  className="p-2 rounded-xl text-primary-muted hover:text-primary hover:bg-surface-hover transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-accent" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close modal"
                  className="p-2 rounded-xl text-primary-muted hover:text-primary hover:bg-surface-hover transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sub-Tab Switcher */}
            <div className="flex gap-2 px-5 pt-3">
              <button
                type="button"
                onClick={() => setActiveSubTab("add")}
                className={`flex-1 min-h-[40px] rounded-xl text-xs font-semibold transition-colors ${
                  activeSubTab === "add"
                    ? "bg-accent text-white shadow-neon-glow"
                    : "glass-panel text-primary-muted hover:text-primary"
                }`}
              >
                + Record New Word
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab("log")}
                className={`flex-1 min-h-[40px] rounded-xl text-xs font-semibold transition-colors ${
                  activeSubTab === "log"
                    ? "bg-accent text-white shadow-neon-glow"
                    : "glass-panel text-primary-muted hover:text-primary"
                }`}
              >
                Learned History ({notes.length})
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {activeSubTab === "add" ? (
                <form onSubmit={handleSaveNote} className="space-y-4">
                  {/* STEP 1: Furigana / Romaji Input + Furigana Reading Pills */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold text-primary">
                        1. Furigana (Kana or Romaji)
                      </label>
                      {furiganaInput.trim() && (
                        <button
                          type="button"
                          onClick={handleEnableFuriganaOnly}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1 shrink-0 ${
                            furiganaOnlyMode
                              ? "bg-accent text-white border-accent"
                              : "glass-panel border-border-glass text-primary-muted hover:text-primary"
                          }`}
                        >
                          <Type className="w-3 h-3" />
                          <span>Save Furigana Only</span>
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        value={furiganaInput}
                        onCompositionStart={() => {
                          isComposingRef.current = true;
                        }}
                        onCompositionEnd={(e) => {
                          isComposingRef.current = false;
                          handleFuriganaInputChange(e.currentTarget.value);
                        }}
                        onChange={(e) => handleFuriganaInputChange(e.target.value)}
                        placeholder="Type kana (した) or romaji (benkyou, toshokan)..."
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl glass-panel border border-border-glass text-primary font-jp text-base focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      {isLookingUp && (
                        <span className="absolute right-3 top-3 text-[11px] text-accent flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Looking up...
                        </span>
                      )}
                    </div>

                    {/* Live Romaji -> Hiragana Conversion Banner */}
                    {liveRomajiHiragana && (
                      <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-accent/10 border border-accent/25 text-xs">
                        <span className="flex items-center gap-1.5 text-primary">
                          <span className="text-primary-muted">{furiganaInput.trim()}</span>
                          <ArrowRight className="w-3 h-3 text-accent" />
                          <strong className="font-jp text-accent text-sm">
                            {liveRomajiHiragana}
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSelectFuriganaOption(liveRomajiHiragana)}
                          className="px-2 py-0.5 rounded-md bg-accent text-white text-[11px] font-semibold hover:opacity-90"
                        >
                          Use {liveRomajiHiragana}
                        </button>
                      </div>
                    )}

                    {/* Furigana Reading Pills */}
                    {furiganaOptions.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium text-primary-muted mb-1">
                          Furigana reading options:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {furiganaOptions.map((opt) => {
                            const isSelected =
                              furiganaInput.trim() === opt.reading ||
                              liveRomajiHiragana === opt.reading;
                            return (
                              <button
                                key={opt.reading}
                                type="button"
                                onClick={() =>
                                  handleSelectFuriganaOption(
                                    opt.reading,
                                    opt.sampleMeaning,
                                    opt.jlpt
                                  )
                                }
                                className={`px-3 py-1 rounded-full text-xs font-jp font-semibold border transition-all ${
                                  isSelected
                                    ? "border-accent bg-accent/20 text-accent"
                                    : "border-border-glass glass-panel text-primary hover:border-accent/50"
                                }`}
                              >
                                {opt.reading}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* STEP 2: Smart Kanji Form (Typing Kanji auto-types Furigana in Step 1 + Meaning in Step 3) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-primary">
                        2. Kanji Form{" "}
                        <span className="font-normal text-primary-muted">
                          {furiganaOnlyMode
                            ? "(Skipped — Furigana Only)"
                            : "(Type Kanji or pick match below)"}
                        </span>
                      </label>
                      {kanjiInput && (
                        <button
                          type="button"
                          onClick={() => {
                            setKanjiInput("");
                            setJlptInput("");
                          }}
                          className="text-[11px] text-primary-muted hover:text-primary"
                        >
                          Clear Kanji
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        disabled={furiganaOnlyMode}
                        value={kanjiInput}
                        onCompositionStart={() => {
                          isComposingRef.current = true;
                        }}
                        onCompositionEnd={(e) => {
                          isComposingRef.current = false;
                          handleKanjiInputChange(e.currentTarget.value);
                        }}
                        onChange={(e) => handleKanjiInputChange(e.target.value)}
                        placeholder={
                          furiganaOnlyMode
                            ? "Furigana-only mode active"
                            : "Type Kanji (e.g. 下, 勉強, 図書館)"
                        }
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl glass-panel border border-border-glass text-primary font-jp font-bold text-base disabled:opacity-45 focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <input
                        type="text"
                        value={sourceInput}
                        onChange={(e) => setSourceInput(e.target.value)}
                        placeholder="Source (e.g. NHK News, Book)"
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl glass-panel border border-border-glass text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>

                    {/* Smart Kanji Candidate Cards */}
                    {!furiganaOnlyMode && kanjiOptions.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                        {kanjiOptions.map((item, idx) => {
                          const isSelected =
                            kanjiInput === item.kanji &&
                            (furiganaInput === item.furigana ||
                              liveRomajiHiragana === item.furigana);
                          return (
                            <button
                              key={`${item.kanji}-${item.furigana}-${idx}`}
                              type="button"
                              onClick={() => handleSelectKanjiOption(item)}
                              className={`p-2.5 rounded-xl border text-left transition-all flex items-start justify-between gap-2 ${
                                isSelected
                                  ? "border-accent bg-accent/15 text-primary shadow-sm"
                                  : "border-border-glass glass-panel hover:border-accent/50 text-primary"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-jp font-bold text-base text-primary">
                                    {item.kanji}
                                  </span>
                                  <span className="font-jp text-xs text-accent font-medium">
                                    ({item.furigana})
                                  </span>
                                </div>
                                <p className="text-[11px] text-primary-muted truncate mt-0.5">
                                  {item.meaning}
                                </p>
                              </div>
                              {item.jlpt_level && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-semibold shrink-0">
                                  {item.jlpt_level}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* STEP 3: Auto-filled Meaning */}
                  <div>
                    <label className="block text-xs font-semibold text-primary mb-1">
                      3. Meaning{" "}
                      <span className="font-normal text-primary-muted">
                        (Auto-mapped from Kanji & Furigana)
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      value={meaningInput}
                      onChange={(e) => {
                        userEditedMeaningRef.current = true;
                        setMeaningInput(e.target.value);
                      }}
                      placeholder="Auto-fills from Kanji/Furigana, or type meaning..."
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl glass-panel border border-border-glass text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  {saveFeedback && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-500 text-xs font-semibold">
                      <Check className="w-4 h-4" />
                      <span>{saveFeedback}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!furiganaInput.trim() && !kanjiInput.trim()}
                    className="w-full min-h-[46px] rounded-xl bg-accent text-white font-semibold text-sm hover:opacity-95 disabled:opacity-40 transition-all shadow-neon-glow"
                  >
                    {furiganaOnlyMode ? "Save Furigana to Memory Log" : "Save Word to Memory Log"}
                  </button>
                </form>
              ) : (
                <div className="space-y-3">
                  {/* Search Saved History */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-primary-muted absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      placeholder="Search saved kanji, furigana, meaning, or book..."
                      className="w-full min-h-[42px] pl-9 pr-3.5 py-2 rounded-xl glass-panel border border-border-glass text-primary text-xs focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  {filteredNotes.length === 0 ? (
                    <div className="text-center py-8 text-xs text-primary-muted">
                      No learned words logged yet. Switch to "+ Record New Word" to save words you discover!
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1">
                      {filteredNotes.map((note) => {
                        const hasKanji = Boolean(note.kanji && note.kanji.trim());
                        return (
                          <div
                            key={note.id}
                            className="p-3.5 rounded-2xl glass-panel border border-border-glass flex items-start justify-between gap-3"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {hasKanji ? (
                                  <>
                                    <span className="font-jp text-lg font-bold text-primary">
                                      {note.kanji}
                                    </span>
                                    {note.furigana && (
                                      <span className="font-jp text-xs text-accent font-medium">
                                        （{note.furigana}）
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span className="font-jp text-lg font-bold text-primary">
                                      {note.furigana}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-semibold">
                                      Furigana
                                    </span>
                                  </>
                                )}
                                {note.jlpt_level && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-semibold">
                                    {note.jlpt_level}
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-primary font-medium">{note.meaning}</p>

                              <div className="flex items-center gap-3 text-[11px] text-primary-muted pt-0.5 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatLearnedDate(note.learned_at)}
                                </span>
                                {note.source_note && (
                                  <span className="flex items-center gap-1">
                                    <BookOpen className="w-3 h-3" />
                                    {note.source_note}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => speakJapanese(note.furigana || note.kanji)}
                                title="Pronounce"
                                aria-label="Pronounce word"
                                className="p-2 rounded-xl text-primary-muted hover:text-accent hover:bg-surface-hover transition-colors"
                              >
                                <Volume2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteNote(note.id)}
                                title="Delete entry"
                                aria-label="Delete note"
                                className="p-2 rounded-xl text-primary-muted hover:text-rose-500 hover:bg-surface-hover transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};