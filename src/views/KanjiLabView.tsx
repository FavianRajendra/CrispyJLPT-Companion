import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  Volume2,
  Play,
  RotateCcw,
  Layers,
  Sparkles,
  Plus,
  X,
  BookOpen,
  PenTool,
  Puzzle,
  Eye,
  EyeOff,
  Languages,
} from "lucide-react";
import seedKanji from "../data/seed_kanji.json";
import seedVerbs from "../data/seed_verbs.json";
import { speakJapanese } from "../lib/audio";
import { JlptLevel, Verb } from "../lib/db";
import { cn } from "../lib/utils";

export interface KanjiComponentPart {
  part: string;
  kanji: string;
  meaning: string;
}

export interface KanjiCompound {
  word: string;
  reading: string;
  meaning: string;
  jlpt_level: JlptLevel;
  parts: string[];
}

export interface KanjiCharacterEntry {
  character: string;
  jlpt_level: JlptLevel;
  strokes: number;
  grade: number | null;
  meanings: string[];
  onyomi: string[];
  kunyomi: string[];
  radicals: string[];
  components?: KanjiComponentPart[];
  compounds: KanjiCompound[];
}

type LabStudyMode = "kanji" | "vocab";
type VocabCategoryFilter = "all" | "time_number" | "noun" | "adjective" | "verb";

const ALL_KANJI = seedKanji as unknown as KanjiCharacterEntry[];
const ALL_VOCAB = seedVerbs as unknown as (Verb & { category?: string })[];
const JLPT_LEVELS: ("All" | JlptLevel)[] = ["All", "N5", "N4", "N3", "N2", "N1"];

const RADICAL_NAME_TO_KANJI: Record<string, { kanji: string; meaning: string }> = {
  gate: { kanji: "門", meaning: "Gate / Doors" },
  ear: { kanji: "耳", meaning: "Ear" },
  sun: { kanji: "日", meaning: "Sun / Day" },
  moon: { kanji: "月", meaning: "Moon / Month" },
  tree: { kanji: "木", meaning: "Tree / Wood" },
  water: { kanji: "水", meaning: "Water" },
  fire: { kanji: "火", meaning: "Fire" },
  earth: { kanji: "土", meaning: "Earth / Ground" },
  person: { kanji: "人", meaning: "Person" },
  mouth: { kanji: "口", meaning: "Mouth" },
  eye: { kanji: "目", meaning: "Eye" },
  hand: { kanji: "手", meaning: "Hand" },
  heart: { kanji: "心", meaning: "Heart / Mind" },
  say: { kanji: "言", meaning: "Words / Say" },
  words: { kanji: "言", meaning: "Words / Say" },
  sell: { kanji: "売", meaning: "Sell" },
  buy: { kanji: "買", meaning: "Buy" },
  car: { kanji: "車", meaning: "Vehicle / Car" },
  rain: { kanji: "雨", meaning: "Rain" },
  mountain: { kanji: "山", meaning: "Mountain" },
  river: { kanji: "川", meaning: "River" },
  ricefield: { kanji: "田", meaning: "Rice Field" },
  child: { kanji: "子", meaning: "Child" },
  woman: { kanji: "女", meaning: "Woman" },
  power: { kanji: "力", meaning: "Power / Strength" },
  knife: { kanji: "刀", meaning: "Sword / Blade" },
  gold: { kanji: "金", meaning: "Gold / Metal" },
  eat: { kanji: "食", meaning: "Eat / Food" },
  food: { kanji: "食", meaning: "Eat / Food" },
  thread: { kanji: "糸", meaning: "Thread" },
  shellfish: { kanji: "貝", meaning: "Shellfish / Money" },
  see: { kanji: "見", meaning: "See / Look" },
  stand: { kanji: "立", meaning: "Stand" },
  roof: { kanji: "宀", meaning: "Roof / House" },
  road: { kanji: "道", meaning: "Road / Path" },
  horse: { kanji: "馬", meaning: "Horse" },
  fish: { kanji: "魚", meaning: "Fish" },
  bird: { kanji: "鳥", meaning: "Bird" },
};

const CURATED_KANJI_STORIES: Record<string, string> = {
  聞: "Picture an Ear (耳) pressed right up against a closed Gate (門) to listen in on what is happening inside — combining 'Gate' + 'Ear' literally means 'to hear, listen, or ask'.",
  間: "Sunlight (日) streaming through the gap between double Gates (門) creates a measurable space or interval of time.",
  開: "Two hands reaching up to unlatch the bar across double Gates (門) — meaning 'to open'.",
  閉: "Fastening a wooden bolt tightly across double Gates (門) — meaning 'to close or shut'.",
  休: "A Person (亻/人) leaning against a shady Tree (木) after working in the fields — meaning 'to rest'.",
  明: "The bright Sun (日) and glowing Moon (月) shining together — meaning 'bright, light, or clear'.",
  読: "Speaking Words (言) aloud from a scroll or book being Sold (売) — meaning 'to read'.",
  話: "Words (言) spoken with a lively Tongue (舌) — meaning 'to speak or talk'.",
  語: "Words (言) exchanged between Five (五) Mouths (口) — meaning 'language or word'.",
  買: "A Net (罒) used to gather valuable Cowrie Shells (貝, ancient currency) — meaning 'to buy'.",
  電: "Rain clouds (雨) unleashing a jagged bolt of lightning — representing 'electricity'.",
  駅: "A relay post where Horses (馬) were kept ready at every stop along a route — meaning 'train station'.",
  好: "A Woman (女) holding her Child (子) with affection — meaning 'to like, fond, or pleasing'.",
  男: "Someone exerting Power/Strength (力) in the Rice Field (田) — meaning 'man or male'.",
  森: "Three Trees (木 + 木 + 木) standing densely together — meaning 'forest'.",
  林: "Two Trees (木 + 木) standing side by side — meaning 'woods or grove'.",
};

const KanjiStrokeViewer: React.FC<{ character: string; strokeCount: number }> = ({
  character,
  strokeCount,
}) => {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [animKey, setAnimKey] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const hex = character.codePointAt(0)?.toString(16).padStart(5, "0");
    if (!hex) return;

    setLoading(true);
    setSvgMarkup(null);

    fetch(`https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex}.svg`)
      .then((res) => (res.ok ? res.text() : Promise.reject("Not found")))
      .then((raw) => {
        if (cancelled) return;
        const svgStart = raw.indexOf("<svg");
        const clean = svgStart >= 0 ? raw.slice(svgStart) : raw;
        setSvgMarkup(clean);
      })
      .catch(() => {
        if (!cancelled) setSvgMarkup(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [character]);

  return (
    <div className="p-4 rounded-2xl glass-panel border border-border-glass flex flex-col items-center justify-between gap-3">
      <div className="w-full flex items-center justify-between text-xs">
        <span className="font-semibold text-primary-muted flex items-center gap-1.5">
          <PenTool className="w-3.5 h-3.5 text-accent" />
          <span>Stroke Order ({strokeCount} strokes)</span>
        </span>
        <button
          type="button"
          onClick={() => setAnimKey((k) => k + 1)}
          className="px-2.5 py-1 rounded-lg bg-accent/15 text-accent font-semibold flex items-center gap-1 hover:bg-accent/25 transition-colors"
        >
          <Play className="w-3 h-3" />
          <span>Replay</span>
        </button>
      </div>

      <div
        key={`${character}_${animKey}`}
        className="w-40 h-40 rounded-2xl bg-surface-card border border-border-glass flex items-center justify-center relative overflow-hidden kanjivg-box"
      >
        {loading ? (
          <span className="font-jp text-7xl font-bold text-primary/40 animate-pulse">
            {character}
          </span>
        ) : svgMarkup ? (
          <>
            <style>{`
              .kanjivg-box svg {
                width: 136px;
                height: 136px;
              }
              .kanjivg-box svg g[id^="kvg:StrokePaths"] path {
                fill: none;
                stroke: currentColor;
                stroke-width: 3.4;
                stroke-linecap: round;
                stroke-linejoin: round;
                stroke-dasharray: 1000;
                stroke-dashoffset: 1000;
                animation: kvgDraw 0.65s ease forwards;
              }
              .kanjivg-box svg g[id^="kvg:StrokeNumbers"] text {
                fill: #38bdf8;
                font-size: 8px;
                font-weight: 700;
              }
              ${Array.from({ length: 30 })
                .map(
                  (_, i) =>
                    `.kanjivg-box svg g[id^="kvg:StrokePaths"] path:nth-of-type(${
                      i + 1
                    }) { animation-delay: ${i * 0.22}s; }`
                )
                .join("\n")}
              @keyframes kvgDraw {
                to { stroke-dashoffset: 0; }
              }
            `}</style>
            <div
              className="text-primary"
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
          </>
        ) : (
          <span className="font-jp text-7xl font-bold text-primary">{character}</span>
        )}
      </div>

      <p className="text-[11px] text-primary-muted text-center">
        Follow numbered blue strokes top-to-bottom, left-to-right
      </p>
    </div>
  );
};

export const KanjiLabView: React.FC = () => {
  // Obenkyo-style dual focus mode: "kanji" (character focus) vs "vocab" (vocabulary & meaning focus)
  const [studyMode, setStudyMode] = useState<LabStudyMode>("kanji");
  const [levelFilter, setLevelFilter] = useState<"All" | JlptLevel>("N5");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Kanji Mode State
  const [selectedChar, setSelectedChar] = useState<string>(() => {
    const listenKanji = ALL_KANJI.find((k) => k.character === "聞");
    return listenKanji ? listenKanji.character : ALL_KANJI[0]?.character || "日";
  });
  const [combinerTray, setCombinerTray] = useState<string[]>(["聞"]);

  // Vocab Mode State (Obenkyo Vocabulary & Meaning section)
  const [vocabCategory, setVocabCategory] = useState<VocabCategoryFilter>("all");
  const [showVocabFurigana, setShowVocabFurigana] = useState<boolean>(true);
  const [selectedVocabId, setSelectedVocabId] = useState<number | null>(null);

  const kanjiByChar = useMemo(() => {
    const map = new Map<string, KanjiCharacterEntry>();
    for (const k of ALL_KANJI) {
      map.set(k.character, k);
    }
    return map;
  }, []);

  const filteredKanji = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALL_KANJI.filter((k) => {
      if (levelFilter !== "All" && k.jlpt_level !== levelFilter) return false;
      if (!q) return true;
      return (
        k.character.includes(q) ||
        k.meanings.some((m) => m.toLowerCase().includes(q)) ||
        k.onyomi.some((r) => r.toLowerCase().includes(q)) ||
        k.kunyomi.some((r) => r.toLowerCase().includes(q))
      );
    });
  }, [levelFilter, searchQuery]);

  const activeKanji = useMemo(
    () => kanjiByChar.get(selectedChar) || filteredKanji[0] || ALL_KANJI[0],
    [kanjiByChar, selectedChar, filteredKanji]
  );

  const handleSelectKanji = (char: string) => {
    setSelectedChar(char);
    setCombinerTray((prev) => (prev.length === 0 ? [char] : prev));
  };

  // Merge kradfile components + radical mappings so enclosed kanji like 聞 (門 + 耳) always decompose completely
  const enrichedComponents = useMemo(() => {
    if (!activeKanji) return [];
    const merged: KanjiComponentPart[] = [...(activeKanji.components || [])];
    const seen = new Set(merged.map((c) => c.kanji));

    for (const radName of activeKanji.radicals || []) {
      const mapped = RADICAL_NAME_TO_KANJI[radName.toLowerCase().trim()];
      if (!mapped || mapped.kanji === activeKanji.character || seen.has(mapped.kanji)) {
        continue;
      }
      seen.add(mapped.kanji);
      merged.unshift({
        part: mapped.kanji,
        kanji: mapped.kanji,
        meaning: mapped.meaning,
      });
    }
    return merged;
  }, [activeKanji]);

  const etymologyExplanation = useMemo(() => {
    if (!activeKanji) return "";
    if (CURATED_KANJI_STORIES[activeKanji.character]) {
      return CURATED_KANJI_STORIES[activeKanji.character];
    }
    if (enrichedComponents.length >= 2) {
      const partsDesc = enrichedComponents
        .map((c) => `${c.kanji} (${c.meaning})`)
        .join(" + ");
      return `Built by combining ${partsDesc}. Together, these visual and semantic building blocks fuse to express "${activeKanji.meanings
        .slice(0, 3)
        .join(", ")}".`;
    }
    if (enrichedComponents.length === 1) {
      const only = enrichedComponents[0];
      return `Built around the core radical ${only.kanji} (${only.meaning}), extending its core concept into "${activeKanji.meanings
        .slice(0, 3)
        .join(", ")}".`;
    }
    return `Foundational root pictograph representing "${activeKanji.meanings
      .slice(0, 3)
      .join(", ")}", which itself acts as a building block inside compound kanji.`;
  }, [activeKanji, enrichedComponents]);

  // Matching compound words containing ALL kanji currently in combinerTray
  const combinedMatches = useMemo(() => {
    if (combinerTray.length === 0) return [];
    const seen = new Set<string>();
    const results: KanjiCompound[] = [];

    for (const kChar of combinerTray) {
      const entry = kanjiByChar.get(kChar);
      if (!entry) continue;
      for (const comp of entry.compounds || []) {
        if (seen.has(comp.word)) continue;
        const hasAll = combinerTray.every((req) => comp.word.includes(req));
        if (hasAll) {
          seen.add(comp.word);
          results.push(comp);
        }
      }
    }
    return results;
  }, [combinerTray, kanjiByChar]);

  // Dynamic context-aware combiner suggestions based on what's currently in the tray (or activeKanji)
  const dynamicCombinerSuggestions = useMemo(() => {
    const anchorSet =
      combinerTray.length > 0
        ? combinerTray
        : activeKanji
        ? [activeKanji.character]
        : [];
    if (anchorSet.length === 0) return [];

    const firstEntry = kanjiByChar.get(anchorSet[0]);
    if (!firstEntry) return [];

    const suggestions: Array<{
      addChar: string;
      addMeaning: string;
      resultWord: string;
      resultReading: string;
      resultMeaning: string;
      fullParts: string[];
    }> = [];
    const seenNextChars = new Set<string>(anchorSet);

    for (const comp of firstEntry.compounds || []) {
      const containsAnchor = anchorSet.every((req) => comp.word.includes(req));
      if (!containsAnchor) continue;

      const missingPart = comp.parts.find((p) => !seenNextChars.has(p));
      if (!missingPart) continue;

      const missingEntry = kanjiByChar.get(missingPart);
      seenNextChars.add(missingPart);

      suggestions.push({
        addChar: missingPart,
        addMeaning: missingEntry?.meanings[0] || "",
        resultWord: comp.word,
        resultReading: comp.reading,
        resultMeaning: comp.meaning,
        fullParts: Array.from(new Set([...anchorSet, missingPart])).slice(0, 3),
      });

      if (suggestions.length >= 6) break;
    }

    return suggestions;
  }, [combinerTray, activeKanji, kanjiByChar]);

  const handleAddToCombiner = (char: string) => {
    setCombinerTray((prev) => {
      if (prev.includes(char)) return prev;
      if (prev.length >= 3) return [...prev.slice(1), char];
      return [...prev, char];
    });
  };

  // Filtered Vocabulary for Obenkyo "Vocab & Meaning" Mode
  const filteredVocab = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALL_VOCAB.filter((v) => {
      if (levelFilter !== "All" && v.jlpt_level !== levelFilter) return false;
      const cat = v.category || "verb";
      if (vocabCategory !== "all" && cat !== vocabCategory) return false;
      if (!q) return true;
      return (
        v.kanji_form.toLowerCase().includes(q) ||
        v.furigana_reading.toLowerCase().includes(q) ||
        v.meanings.some((m) => m.toLowerCase().includes(q))
      );
    });
  }, [levelFilter, vocabCategory, searchQuery]);

  const inspectedVocab = useMemo(
    () =>
      filteredVocab.find((v) => v.id === selectedVocabId) ||
      filteredVocab[0] ||
      null,
    [filteredVocab, selectedVocabId]
  );

  if (!activeKanji) {
    return (
      <div className="max-w-4xl mx-auto p-8 rounded-3xl glass-card border border-border-glass text-center text-sm text-primary-muted">
        Run <code className="text-accent">node scripts/import-all-jlpt.mjs</code> first to generate{" "}
        <code className="text-accent">src/data/seed_kanji.json</code>.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24 md:pb-10">
      {/* Top Obenkyo-Style Dual Mode Switcher & JLPT Filter */}
      <div className="p-4 rounded-3xl glass-card border border-border-glass space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Mode Toggle: Kanji Focus vs Vocab & Meaning Focus */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl glass-panel border border-border-glass">
            <button
              type="button"
              onClick={() => setStudyMode("kanji")}
              className={cn(
                "min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all",
                studyMode === "kanji"
                  ? "bg-accent text-white shadow-neon-glow"
                  : "text-primary-muted hover:text-primary"
              )}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>漢 Kanji & Strokes ({ALL_KANJI.length.toLocaleString()})</span>
            </button>

            <button
              type="button"
              onClick={() => setStudyMode("vocab")}
              className={cn(
                "min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all",
                studyMode === "vocab"
                  ? "bg-accent text-white shadow-neon-glow"
                  : "text-primary-muted hover:text-primary"
              )}
            >
              <Languages className="w-3.5 h-3.5" />
              <span>語 Vocab & Meaning ({ALL_VOCAB.length.toLocaleString()})</span>
            </button>
          </div>

          {/* JLPT N5-N1 Pill Bar */}
          <div className="flex items-center gap-1 p-1 rounded-full glass-panel overflow-x-auto">
            {JLPT_LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevelFilter(lvl)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-semibold transition-all",
                  levelFilter === lvl
                    ? "bg-accent text-white shadow-neon-glow"
                    : "text-primary-muted hover:text-primary"
                )}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-primary-muted absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              studyMode === "kanji"
                ? "Search kanji by character (e.g. 聞, 読, 電), meaning (e.g. hear, read, mountain), or reading..."
                : "Search vocabulary by Japanese word, hiragana reading, or English meaning (e.g. Monday, train, eat)..."
            }
            className="w-full min-h-[40px] pl-9 pr-4 py-2 rounded-xl glass-panel border border-border-glass text-xs text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* =====================================================================
          MODE A: KANJI STUDY MODE (STROKE ORDER, DECOMPOSITION & COMBINER)
          ===================================================================== */}
      {studyMode === "kanji" ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left 2 Columns: Active Kanji Deep-Dive + Component Breakdown */}
            <div className="lg:col-span-2 p-5 sm:p-6 rounded-3xl glass-card border border-border-glass space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-accent/15 border border-accent/40 flex items-center justify-center font-jp text-5xl font-black text-accent shadow-neon-glow">
                    {activeKanji.character}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md bg-accent text-white text-xs font-bold">
                        {activeKanji.jlpt_level}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md glass-panel text-xs font-semibold text-primary-muted">
                        {activeKanji.strokes} Strokes
                      </span>
                      {activeKanji.grade && (
                        <span className="px-2.5 py-0.5 rounded-md glass-panel text-xs font-semibold text-primary-muted">
                          Grade {activeKanji.grade}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-primary capitalize">
                      {activeKanji.meanings.join(", ")}
                    </h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddToCombiner(activeKanji.character)}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-accent/15 border border-accent/40 text-accent text-xs font-semibold flex items-center gap-1.5 hover:bg-accent/25 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add to Combiner</span>
                </button>
              </div>

              {/* Internal Component / Sub-Kanji Decomposition & Deeper Etymology */}
              <div className="p-4 rounded-2xl bg-accent/10 border border-accent/30 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-accent flex items-center gap-1.5">
                    <Puzzle className="w-4 h-4" />
                    <span>
                      Kanji Structure & Component Parts of &ldquo;{activeKanji.character}&rdquo;
                    </span>
                  </span>
                  <span className="text-[11px] text-primary-muted">
                    Tap any component kanji to inspect it
                  </span>
                </div>

                {enrichedComponents.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {enrichedComponents.map((comp, idx) => {
                      const isInspectable = kanjiByChar.has(comp.kanji);
                      return (
                        <React.Fragment key={`${comp.part}_${idx}`}>
                          {idx > 0 && (
                            <span className="text-accent font-extrabold text-base">+</span>
                          )}
                          <button
                            type="button"
                            disabled={!isInspectable}
                            onClick={() => isInspectable && handleSelectKanji(comp.kanji)}
                            className={cn(
                              "px-3 py-2 rounded-xl bg-surface-card border border-border-glass text-left flex items-center gap-2.5 transition-all",
                              isInspectable
                                ? "hover:border-accent cursor-pointer"
                                : "opacity-85 cursor-default"
                            )}
                          >
                            <span className="font-jp text-2xl font-bold text-primary">
                              {comp.part}
                              {comp.part !== comp.kanji && (
                                <span className="text-xs text-accent ml-1">({comp.kanji})</span>
                              )}
                            </span>
                            <div className="text-xs">
                              <div className="font-bold text-primary capitalize">
                                {comp.meaning}
                              </div>
                              {isInspectable && (
                                <div className="text-[10px] text-accent">
                                  Tap to open kanji
                                </div>
                              )}
                            </div>
                          </button>
                        </React.Fragment>
                      );
                    })}

                    <span className="text-accent font-extrabold text-base">=</span>

                    <div className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center gap-2">
                      <span className="font-jp text-2xl font-black text-emerald-300">
                        {activeKanji.character}
                      </span>
                      <span className="text-xs font-bold text-emerald-200 capitalize">
                        ({activeKanji.meanings[0]})
                      </span>
                    </div>
                  </div>
                )}

                <p className="text-xs text-primary leading-relaxed bg-surface-card/60 p-3 rounded-xl border border-border-glass">
                  <strong className="text-accent">How it forms &amp; deeper meaning:</strong>{" "}
                  {etymologyExplanation}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <KanjiStrokeViewer
                  character={activeKanji.character}
                  strokeCount={activeKanji.strokes}
                />

                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl glass-panel border border-border-glass space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                        On&apos;yomi (Compound Reading)
                      </span>
                      {activeKanji.onyomi[0] && (
                        <button
                          type="button"
                          onClick={() => speakJapanese(activeKanji.onyomi[0])}
                          className="p-1 rounded-lg text-primary-muted hover:text-accent"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {activeKanji.onyomi.length > 0 ? (
                        activeKanji.onyomi.map((on, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => speakJapanese(on)}
                            className="font-jp px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-200 text-xs font-semibold hover:bg-sky-500/25"
                          >
                            {on}
                          </button>
                        ))
                      ) : (
                        <span className="text-xs text-primary-muted">None</span>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl glass-panel border border-border-glass space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                        Kun&apos;yomi (Standalone Reading)
                      </span>
                      {activeKanji.kunyomi[0] && (
                        <button
                          type="button"
                          onClick={() => speakJapanese(activeKanji.kunyomi[0].replace(".", ""))}
                          className="p-1 rounded-lg text-primary-muted hover:text-accent"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {activeKanji.kunyomi.length > 0 ? (
                        activeKanji.kunyomi.map((kun, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => speakJapanese(kun.replace(".", ""))}
                            className="font-jp px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/25"
                          >
                            {kun}
                          </button>
                        ))
                      ) : (
                        <span className="text-xs text-primary-muted">None</span>
                      )}
                    </div>
                  </div>

                  {activeKanji.radicals.length > 0 && (
                    <div className="p-3.5 rounded-2xl glass-panel border border-border-glass space-y-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block">
                        Mnemonic Radicals
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {activeKanji.radicals.map((rad, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-200 text-xs font-medium capitalize"
                          >
                            {rad}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Compound Words Formed With This Kanji */}
              <div className="space-y-2.5 pt-2 border-t border-border-glass">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary-muted flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-accent" />
                  <span>Compound Words (熟語) Using &ldquo;{activeKanji.character}&rdquo;</span>
                </h4>

                {activeKanji.compounds.length === 0 ? (
                  <p className="text-xs text-primary-muted">
                    Used standalone with hiragana endings or counters.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {activeKanji.compounds.slice(0, 8).map((comp, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl glass-panel border border-border-glass flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-jp text-base font-bold text-primary">
                              {comp.word}
                            </span>
                            <span className="font-jp text-xs text-accent">
                              （{comp.reading}）
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-bold">
                              {comp.jlpt_level}
                            </span>
                          </div>
                          <p className="text-xs text-primary-muted truncate">
                            {comp.parts
                              .map((p) => {
                                const k = kanjiByChar.get(p);
                                return k ? `${p}(${k.meanings[0]})` : p;
                              })
                              .join(" + ")}{" "}
                            → <strong className="text-primary">{comp.meaning}</strong>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => speakJapanese(comp.reading || comp.word)}
                          className="p-1.5 rounded-lg text-primary-muted hover:text-accent shrink-0"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Context-Aware Kanji Combiner */}
            <div className="p-5 rounded-3xl glass-card border border-border-glass space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-primary flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-accent" />
                  <span>Kanji Combiner (漢字合体)</span>
                </h3>
                {combinerTray.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCombinerTray([])}
                    className="text-[11px] text-primary-muted hover:text-rose-400 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              <p className="text-xs text-primary-muted leading-relaxed">
                Combine 2 or 3 kanji to fuse their meanings into real words. Tap any suggested partner kanji below to complete a combination:
              </p>

              {/* Selected Kanji Formula Slots */}
              <div className="flex items-center justify-center gap-2 flex-wrap p-3 rounded-2xl glass-panel border border-border-glass min-h-[84px]">
                {combinerTray.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setCombinerTray([activeKanji.character])}
                    className="text-xs text-accent underline font-semibold"
                  >
                    + Start combining with &ldquo;{activeKanji.character}&rdquo; (
                    {activeKanji.meanings[0]})
                  </button>
                ) : (
                  combinerTray.map((ch, idx) => {
                    const info = kanjiByChar.get(ch);
                    return (
                      <React.Fragment key={ch}>
                        {idx > 0 && <span className="text-accent font-bold text-lg">+</span>}
                        <div className="relative px-3 py-2 rounded-xl bg-surface-card border border-accent/40 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setCombinerTray((prev) => prev.filter((item) => item !== ch))
                            }
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                          <div className="font-jp text-2xl font-bold text-primary">{ch}</div>
                          <div className="text-[10px] text-accent font-medium truncate max-w-[68px]">
                            {info?.meanings[0] || ""}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>

              {/* Dynamic Context-Aware Combination Suggestions */}
              {dynamicCombinerSuggestions.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary-muted block">
                    Suggested Combinations for{" "}
                    <span className="font-jp text-accent">
                      {(combinerTray.length > 0 ? combinerTray : [activeKanji.character]).join(
                        " + "
                      )}
                    </span>
                    :
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {dynamicCombinerSuggestions.map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCombinerTray(sug.fullParts)}
                        className="px-2.5 py-1.5 rounded-xl glass-panel border border-border-glass hover:border-accent/50 text-left text-[11px] transition-all"
                      >
                        <span className="font-jp font-bold text-accent">+ {sug.addChar}</span>{" "}
                        <span className="text-primary-muted">({sug.addMeaning})</span>{" "}
                        <span className="text-primary font-semibold">
                          → {sug.resultWord} ({sug.resultMeaning})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Resulting Combined Words */}
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {combinerTray.length > 0 && combinedMatches.length === 0 ? (
                  <p className="text-xs text-primary-muted text-center py-4">
                    No compound word found with all selected kanji — try clicking a suggested partner above or clearing one character.
                  </p>
                ) : (
                  combinedMatches.map((m, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/35 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-jp text-lg font-bold text-emerald-300">
                            {m.word}
                          </span>
                          <span className="font-jp text-xs text-primary">（{m.reading}）</span>
                        </div>
                        <p className="text-xs text-emerald-100 font-medium">{m.meaning}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => speakJapanese(m.reading || m.word)}
                        className="p-1.5 rounded-lg text-emerald-300 hover:bg-emerald-500/20"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Bottom Interactive Kanji Deck */}
          <div className="p-5 rounded-3xl glass-card border border-border-glass space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-primary">
                Kanji Character Deck ({filteredKanji.length} characters)
              </span>
              <span className="text-primary-muted">
                Tap any kanji to inspect component breakdown, stroke order &amp; compounds
              </span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 max-h-[360px] overflow-y-auto pr-1">
              {filteredKanji.map((k) => {
                const isSelected = activeKanji.character === k.character;
                return (
                  <button
                    key={k.character}
                    type="button"
                    onClick={() => handleSelectKanji(k.character)}
                    className={cn(
                      "p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-0.5",
                      isSelected
                        ? "bg-accent text-white border-accent shadow-neon-glow"
                        : "glass-panel border-border-glass hover:border-accent/50 text-primary"
                    )}
                  >
                    <span className="font-jp text-2xl font-bold leading-tight">
                      {k.character}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] truncate w-full font-medium",
                        isSelected ? "text-white/90" : "text-primary-muted"
                      )}
                    >
                      {k.meanings[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        /* ===================================================================
           MODE B: OBENKYO-STYLE VOCABULARY & MEANING STUDY SECTION
           =================================================================== */
        <div className="space-y-4">
          {/* Category Filter Pills & Furigana Toggle */}
          <div className="p-3.5 rounded-3xl glass-card border border-border-glass flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 p-1 rounded-full glass-panel overflow-x-auto">
              {(
                [
                  { id: "all", label: "All Categories" },
                  { id: "time_number", label: "📅 Days & Numbers" },
                  { id: "noun", label: "📦 Nouns" },
                  { id: "adjective", label: "✨ Adjectives" },
                  { id: "verb", label: "⚡ Verbs" },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setVocabCategory(cat.id)}
                  className={cn(
                    "px-3 py-1 rounded-full font-semibold transition-all whitespace-nowrap",
                    vocabCategory === cat.id
                      ? "bg-accent text-white shadow-neon-glow"
                      : "text-primary-muted hover:text-primary"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowVocabFurigana((prev) => !prev)}
              className={cn(
                "px-3 py-1.5 rounded-full font-semibold border transition-all flex items-center gap-1.5",
                showVocabFurigana
                  ? "bg-accent/15 border-accent text-accent"
                  : "glass-panel border-border-glass text-primary-muted hover:text-primary"
              )}
            >
              {showVocabFurigana ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" />
              )}
              <span>Furigana: {showVocabFurigana ? "ON" : "OFF"}</span>
            </button>
          </div>

          {/* Focused Word Inspector Card + Kanji-by-Kanji Breakdown */}
          {inspectedVocab && (
            <div className="p-5 sm:p-6 rounded-3xl glass-card border border-border-glass space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-md bg-accent text-white text-xs font-bold">
                      {inspectedVocab.jlpt_level}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md glass-panel text-xs font-semibold text-primary-muted capitalize">
                      {(inspectedVocab.category || "verb").replace("_", " & ")}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-3 flex-wrap pt-1">
                    <span className="font-jp text-3xl sm:text-4xl font-black text-primary">
                      {inspectedVocab.kanji_form}
                    </span>
                    {showVocabFurigana && (
                      <span className="font-jp text-base sm:text-lg text-accent font-semibold">
                        （{inspectedVocab.furigana_reading}）
                      </span>
                    )}
                  </div>

                  <p className="text-sm sm:text-base font-bold text-emerald-300">
                    Meaning: &ldquo;{inspectedVocab.meanings.join(", ")}&rdquo;
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    speakJapanese(
                      inspectedVocab.furigana_reading || inspectedVocab.kanji_form
                    )
                  }
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-accent/15 border border-accent/40 text-accent text-xs font-semibold flex items-center gap-1.5 hover:bg-accent/25"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Listen</span>
                </button>
              </div>

              {/* Kanji Inside This Vocabulary Word (Tap to jump into Kanji Mode) */}
              {Array.isArray(inspectedVocab.constituent_kanji) &&
                inspectedVocab.constituent_kanji.length > 0 && (
                  <div className="pt-3 border-t border-border-glass space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary-muted block">
                      Kanji Inside This Word (Tap any character to study its strokes &amp; parts):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {inspectedVocab.constituent_kanji.map((ch) => {
                        const kInfo = kanjiByChar.get(ch);
                        return (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => {
                              handleSelectKanji(ch);
                              setStudyMode("kanji");
                            }}
                            className="px-3 py-2 rounded-xl glass-panel border border-border-glass hover:border-accent flex items-center gap-2.5 text-left transition-all"
                          >
                            <span className="font-jp text-2xl font-bold text-accent">
                              {ch}
                            </span>
                            <div className="text-xs">
                              <div className="font-bold text-primary capitalize">
                                {kInfo?.meanings.slice(0, 2).join(", ") || "Kanji"}
                              </div>
                              <div className="text-[10px] text-primary-muted">
                                {kInfo
                                  ? `${kInfo.jlpt_level} • ${kInfo.strokes} strokes`
                                  : "Inspect"}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Vocabulary Cards Grid */}
          <div className="p-5 rounded-3xl glass-card border border-border-glass space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-primary flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-accent" />
                <span>Vocabulary List ({filteredVocab.length.toLocaleString()} words)</span>
              </span>
              <span className="text-primary-muted">
                Showing up to 120 matches — use search or JLPT filter to narrow down
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[460px] overflow-y-auto pr-1">
              {filteredVocab.slice(0, 120).map((item) => {
                const isSelected = inspectedVocab?.id === item.id;
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedVocabId(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setSelectedVocabId(item.id);
                    }}
                    className={cn(
                      "p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer",
                      isSelected
                        ? "bg-accent/15 border-accent shadow-sm"
                        : "glass-panel border-border-glass hover:border-accent/50"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-jp text-lg font-bold text-primary truncate">
                          {item.kanji_form}
                        </span>
                        {showVocabFurigana && item.furigana_reading !== item.kanji_form && (
                          <span className="font-jp text-xs text-accent truncate">
                            （{item.furigana_reading}）
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-primary-muted truncate mt-0.5">
                        {item.meanings.slice(0, 3).join(", ")}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        speakJapanese(item.furigana_reading || item.kanji_form);
                      }}
                      className="p-1.5 rounded-lg text-primary-muted hover:text-accent shrink-0"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};