import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Repeat,
  Shuffle,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Verb,
  UserProfile,
  VerbProgress,
  JlptLevel,
  IndustryTrack,
  getDatabase,
} from "../lib/db";
import { updateVerbMastery, computeVerbPriority } from "../lib/mastery";
import { speakJapanese } from "../lib/audio";
import seedKanji from "../data/seed_kanji.json";
import {
  PARTICLES_ENCYCLOPEDIA,
  GRAMMAR_QUIZ_QUESTIONS,
} from "../data/grammar_corpus";

export interface PresentViewProps {
  verbs: Verb[];
  profile: UserProfile;
  progressMap: Map<number, VerbProgress>;
  onUpdateProgress: (progress: VerbProgress) => void | Promise<void>;
  selectedLevels?: JlptLevel[];
  setSelectedLevels?: React.Dispatch<React.SetStateAction<JlptLevel[]>>;
  selectedTracks?: IndustryTrack[];
  setSelectedTracks?: React.Dispatch<React.SetStateAction<IndustryTrack[]>>;
}

type SortOrderMode = "priority" | "random" | "sequential";
type PresentDeckType = "kanji" | "vocab" | "grammar";
type VocabSubFilter = "all" | "verbs" | "non_verbs";

interface UnifiedSlideCard {
  uid: string;
  deckType: PresentDeckType;
  jlpt_level: JlptLevel;
  badgeText: string;
  heroMain: string;
  heroReading: string;
  meaningPrimary: string;
  meaningSecondary?: string;
  speakText: string;
  verbRef?: Verb;
}

const ALL_LEVELS: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

const INDUSTRY_OPTIONS: Array<{ id: IndustryTrack; label: string }> = [
  { id: "general", label: "General" },
  { id: "it", label: "IT & Tech" },
  { id: "finance", label: "Finance" },
  { id: "fnb", label: "F&B" },
  { id: "healthcare", label: "Healthcare" },
  { id: "manufacturing", label: "Manufacturing" },
];

const RESOLVED_GRAMMAR_BANK = [
  ...PARTICLES_ENCYCLOPEDIA.map((p) => ({
    id: `particle_${p.id}`,
    jlpt_level: p.jlpt_level,
    pattern: p.particle,
    structure: p.role,
    meaning: p.nuanceAndContrast,
    example_jp: p.examples[0]?.sentenceRuby.map((s) => s.base).join("") || "",
    example_en: p.examples[0]?.english || "",
  })),
  ...GRAMMAR_QUIZ_QUESTIONS.map((q) => ({
    id: `quiz_${q.id}`,
    jlpt_level: q.jlpt_level,
    pattern: q.correctAnswer,
    structure: `${q.sentencePre}（ ${q.correctAnswer} ）${q.sentencePost}`,
    meaning: q.ruleSummary,
    example_jp: `${q.sentencePre}${q.correctAnswer}${q.sentencePost}`,
    example_en: q.sentenceTranslation,
  })),
];

function uniformShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const PresentView: React.FC<PresentViewProps> = ({
  verbs,
  profile,
  progressMap,
  onUpdateProgress,
  selectedLevels: externalLevels,
  setSelectedLevels: setExternalLevels,
  selectedTracks: externalTracks,
  setSelectedTracks: setExternalTracks,
}) => {
  const [internalLevels, setInternalLevels] = useState<JlptLevel[]>([
    profile.target_jlpt || "N5",
  ]);
  const [internalTracks, setInternalTracks] = useState<IndustryTrack[]>([]);

  const activeLevels = externalLevels ?? internalLevels;
  const setActiveLevels = setExternalLevels ?? setInternalLevels;
  const activeTracks = externalTracks ?? internalTracks;
  const setActiveTracks = setExternalTracks ?? setInternalTracks;

  const [activeDecks, setActiveDecks] = useState<PresentDeckType[]>(["vocab"]);
  const [vocabSubFilter, setVocabSubFilter] = useState<VocabSubFilter>("all");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);

  const [sortMode, setSortMode] = useState<SortOrderMode>("priority");
  const [shuffleNonce, setShuffleNonce] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [loopDeck, setLoopDeck] = useState<boolean>(true);
  const [cardGapSec, setCardGapSec] = useState<number>(4);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [autoSpeak, setAutoSpeak] = useState<boolean>(true);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [countdownMs, setCountdownMs] = useState<number>(4000);

  const lastSpokenKeyRef = useRef<string>("");

  const toggleDeckType = (deck: PresentDeckType) => {
    setActiveDecks((prev) => {
      if (prev.includes(deck)) {
        return prev.length > 1 ? prev.filter((d) => d !== deck) : prev;
      }
      return [...prev, deck];
    });
  };

  const unifiedPool = useMemo<UnifiedSlideCard[]>(() => {
    const levelsToUse =
      activeLevels.length > 0 ? activeLevels : ([profile.target_jlpt] as JlptLevel[]);
    const cards: UnifiedSlideCard[] = [];

    // 1. Kanji Deck
    if (activeDecks.includes("kanji")) {
      for (const k of seedKanji as any[]) {
        if (!levelsToUse.includes(k.jlpt_level)) continue;
        const onStr =
          Array.isArray(k.onyomi) && k.onyomi.length > 0 ? `On: ${k.onyomi.join("・")}` : "";
        const kunStr =
          Array.isArray(k.kunyomi) && k.kunyomi.length > 0 ? `Kun: ${k.kunyomi.join("・")}` : "";
        const partsStr =
          Array.isArray(k.components) && k.components.length > 0
            ? `Parts: ${k.components.map((c: any) => `${c.kanji}(${c.meaning})`).join(" + ")}`
            : Array.isArray(k.radicals) && k.radicals.length > 0
            ? `Radicals: ${k.radicals.join(", ")}`
            : "";

        cards.push({
          uid: `kanji_${k.character}`,
          deckType: "kanji",
          jlpt_level: k.jlpt_level,
          badgeText: `漢 Kanji • ${k.strokes} Strokes`,
          heroMain: k.character,
          heroReading: [onStr, kunStr].filter(Boolean).join("   |   ") || k.character,
          meaningPrimary: (k.meanings || []).join(", "),
          meaningSecondary: partsStr,
          speakText: (k.kunyomi?.[0] || k.onyomi?.[0] || k.character).replace(".", ""),
        });
      }
    }

    // 2. Vocabulary Deck (Verbs, Nouns, Adjectives, Days/Numbers)
    if (activeDecks.includes("vocab")) {
      const matchedVerbs = verbs.filter((v) => {
        if (!levelsToUse.includes(v.jlpt_level)) return false;
        const cat = v.category || "verb";
        if (vocabSubFilter === "verbs" && cat !== "verb") return false;
        if (vocabSubFilter === "non_verbs" && cat === "verb") return false;

        if (activeTracks.length === 0) return v.is_core_jlpt === 1;
        const inTrack =
          Array.isArray(v.industry_tags) &&
          v.industry_tags.some((t) => activeTracks.includes(t));
        return v.is_core_jlpt === 1 || inTrack;
      });

      for (const v of matchedVerbs) {
        const catLabel =
          v.category === "time_number"
            ? "Days & Numbers"
            : v.category === "adjective"
            ? "Adjective"
            : v.category === "noun"
            ? "Noun"
            : `Verb • ${v.verb_group}`;

        cards.push({
          uid: `vocab_${v.id}`,
          deckType: "vocab",
          jlpt_level: v.jlpt_level,
          badgeText: `語 ${catLabel}`,
          heroMain: v.kanji_form,
          heroReading: v.furigana_reading,
          meaningPrimary: v.meanings.join("; "),
          speakText: v.furigana_reading || v.kanji_form,
          verbRef: v,
        });
      }
    }

    // 3. Grammar Deck
    if (activeDecks.includes("grammar")) {
      for (let i = 0; i < RESOLVED_GRAMMAR_BANK.length; i++) {
        const g = RESOLVED_GRAMMAR_BANK[i];
        const lvl = (g.jlpt_level || "N5") as JlptLevel;
        if (!levelsToUse.includes(lvl)) continue;

        const patternText = g.pattern || "";
        if (!patternText) continue;

        cards.push({
          uid: `grammar_${g.id}_${i}`,
          deckType: "grammar",
          jlpt_level: lvl,
          badgeText: `文 Grammar Pattern`,
          heroMain: patternText,
          heroReading: g.structure || "",
          meaningPrimary: g.meaning || "",
          meaningSecondary: g.example_jp
            ? `Ex: ${g.example_jp}${g.example_en ? ` — ${g.example_en}` : ""}`
            : g.example_en,
          speakText: g.example_jp || patternText,
        });
      }
    }

    return cards;
  }, [activeDecks, vocabSubFilter, activeLevels, activeTracks, verbs, profile.target_jlpt]);

  const studyQueue = useMemo(() => {
    if (unifiedPool.length === 0) return [];
    if (sortMode === "sequential") {
      return unifiedPool;
    }
    if (sortMode === "random") {
      return uniformShuffle(unifiedPool);
    }
    const scored = unifiedPool.map((card) => {
      let rawPriority = 1.0;
      if (card.verbRef) {
        const prog = progressMap?.get?.(card.verbRef.id);
        rawPriority = computeVerbPriority(card.verbRef, profile, prog);
      }
      const weight = Math.max(0.1, Math.pow(Math.max(0.1, rawPriority), 2.0));
      const u = Math.max(1e-6, Math.random());
      return { card, key: Math.pow(u, 1 / weight) };
    });
    scored.sort((a, b) => b.key - a.key);
    return scored.map((s) => s.card);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unifiedPool, sortMode, shuffleNonce]);

  useEffect(() => {
    setCurrentIndex(0);
    setIsRevealed(false);
    setCountdownMs(cardGapSec * 1000);
    lastSpokenKeyRef.current = "";
  }, [studyQueue, cardGapSec]);

  const currentCard = studyQueue[currentIndex % Math.max(1, studyQueue.length)];

  useEffect(() => {
    if (!isRevealed || !autoSpeak || !currentCard) return;
    const key = `${currentIndex}:${currentCard.uid}`;
    if (lastSpokenKeyRef.current === key) return;
    lastSpokenKeyRef.current = key;

    if (currentCard.speakText) {
      speakJapanese(currentCard.speakText, speechRate);
    }
  }, [isRevealed, autoSpeak, currentCard, currentIndex, speechRate]);

  const toggleLevel = (lvl: JlptLevel) => {
    setActiveLevels((prev) => {
      if (prev.includes(lvl)) {
        return prev.length > 1 ? prev.filter((l) => l !== lvl) : prev;
      }
      return [...prev, lvl];
    });
  };

  const toggleTrack = (track: IndustryTrack) => {
    setActiveTracks((prev) =>
      prev.includes(track) ? prev.filter((t) => t !== track) : [...prev, track]
    );
  };

  const goNext = useCallback(() => {
    lastSpokenKeyRef.current = "";
    setIsRevealed(false);
    setCountdownMs(cardGapSec * 1000);
    setCurrentIndex((prev) => {
      if (prev + 1 >= studyQueue.length) {
        if (!loopDeck) {
          setIsPlaying(false);
          return prev;
        }
        if (sortMode !== "sequential") {
          setShuffleNonce((n) => n + 1);
        }
        return 0;
      }
      return prev + 1;
    });
  }, [cardGapSec, studyQueue.length, loopDeck, sortMode]);

  const goPrev = useCallback(() => {
    lastSpokenKeyRef.current = "";
    setIsRevealed(false);
    setCountdownMs(cardGapSec * 1000);
    setCurrentIndex((prev) =>
      prev - 1 < 0 ? Math.max(0, studyQueue.length - 1) : prev - 1
    );
  }, [cardGapSec, studyQueue.length]);

  const recordDailyReviewActivity = async () => {
    try {
      const db = await getDatabase();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS daily_checkins (
          date_key TEXT PRIMARY KEY,
          reviews_count INTEGER NOT NULL DEFAULT 0,
          quizzes_count INTEGER NOT NULL DEFAULT 0,
          checked_in_at TEXT NOT NULL
        );
      `);
      const today = getTodayDateKey();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO daily_checkins (date_key, reviews_count, quizzes_count, checked_in_at)
         VALUES (?, 1, 0, ?)
         ON CONFLICT(date_key) DO UPDATE SET
           reviews_count = reviews_count + 1,
           checked_in_at = excluded.checked_in_at;`,
        [today, now]
      );
      window.dispatchEvent(new Event("daily-streak-updated"));
    } catch {
      // ignore
    }
  };

  const handleGradeCard = async (grade: 1 | 2 | 3) => {
    if (!currentCard) return;
    if (currentCard.verbRef) {
      const existing = progressMap?.get?.(currentCard.verbRef.id);
      const updatedReading = updateVerbMastery(
        existing,
        currentCard.verbRef.id,
        "reading",
        grade
      );
      const updatedBoth = updateVerbMastery(
        updatedReading,
        currentCard.verbRef.id,
        "meaning",
        grade
      );
      await onUpdateProgress(updatedBoth);
    }
    await recordDailyReviewActivity();
    goNext();
  };

  useEffect(() => {
    if (!isPlaying || !currentCard) return;

    const totalMs = Math.max(2000, cardGapSec * 1000);
    const revealAtMs = Math.round(totalMs * 0.5);
    const tickMs = 100;

    const timer = window.setInterval(() => {
      setCountdownMs((prev) => {
        const next = prev - tickMs;
        if (next <= revealAtMs) {
          setIsRevealed(true);
        }
        if (next <= 0) {
          goNext();
          return totalMs;
        }
        return next;
      });
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, currentCard, cardGapSec, goNext]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLButtonElement
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (!isRevealed) setIsRevealed(true);
        else goNext();
      } else if (e.key === "ArrowRight") {
        goNext();
      } else if (e.key === "ArrowLeft") {
        goPrev();
      } else if (e.key.toLowerCase() === "r" && currentCard?.speakText) {
        speakJapanese(currentCard.speakText, speechRate);
      } else if (e.key === "1") {
        handleGradeCard(1);
      } else if (e.key === "2") {
        handleGradeCard(2);
      } else if (e.key === "3") {
        handleGradeCard(3);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const progressRatio = Math.max(
    0,
    Math.min(1, countdownMs / Math.max(2000, cardGapSec * 1000))
  );
  const circleRadius = 20;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference * (1 - progressRatio);

  const currentProg = currentCard?.verbRef
    ? progressMap?.get?.(currentCard.verbRef.id)
    : undefined;
  const currentMasteryPct = currentProg
    ? Math.round(
        ((currentProg.reading_score + currentProg.meaning_score) / 2) * 100
      )
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4 pb-24 md:pb-10">
      {/* Study Deck Mode Selector + Collapsible Mobile Filter Bar */}
      <div className="p-3 sm:p-4 rounded-3xl glass-card border border-border-glass space-y-3">
        {/* Compact Mobile Summary Toggle Bar */}
        <div className="flex md:hidden items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((prev) => !prev)}
            className="flex-1 flex items-center justify-between px-3 py-2 rounded-2xl glass-panel border border-border-glass text-xs font-semibold text-primary"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="truncate">
                {activeDecks.map((d) => d.toUpperCase()).join("+")} •{" "}
                {activeLevels.join(", ")} • {sortMode}
              </span>
            </span>
            <span className="flex items-center gap-1 text-accent shrink-0 ml-2">
              <span>{mobileFiltersOpen ? "Hide" : "Filters"}</span>
              {mobileFiltersOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {sortMode !== "sequential" && (
            <button
              type="button"
              onClick={() => setShuffleNonce((n) => n + 1)}
              aria-label="Reshuffle queue"
              className="p-2.5 rounded-2xl glass-panel border border-border-glass text-accent"
            >
              <Shuffle className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Full Filter Controls (Always visible on Desktop, expandable on Mobile) */}
        <div
          className={`${
            mobileFiltersOpen ? "block" : "hidden"
          } md:block space-y-3`}
        >
          {/* Content Deck Multi-Toggle (Kanji, Vocab, Grammar, or All Combined) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border-glass">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary-muted mr-1 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-accent" />
                <span>Present Deck:</span>
              </span>

              {(
                [
                  { id: "kanji", label: "漢 Kanji Only" },
                  { id: "vocab", label: "語 Vocab (Words)" },
                  { id: "grammar", label: "文 Grammar" },
                ] as Array<{ id: PresentDeckType; label: string }>
              ).map((deck) => {
                const active = activeDecks.includes(deck.id);
                return (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() => toggleDeckType(deck.id)}
                    className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold border transition-all ${
                      active
                        ? "bg-accent text-white border-accent shadow-neon-glow"
                        : "glass-panel border-border-glass text-primary-muted hover:text-primary"
                    }`}
                  >
                    {deck.label}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setActiveDecks(["kanji", "vocab", "grammar"])}
                className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold border transition-all ${
                  activeDecks.length === 3
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                    : "glass-panel border-border-glass text-primary-muted hover:text-primary"
                }`}
              >
                ✨ All Combined
              </button>
            </div>

            {activeDecks.includes("vocab") && (
              <div className="flex items-center gap-1 p-1 rounded-xl glass-panel text-[11px]">
                {(
                  [
                    { id: "all", label: "All Vocab" },
                    { id: "verbs", label: "Verbs" },
                    { id: "non_verbs", label: "Nouns/Adj/Time" },
                  ] as const
                ).map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setVocabSubFilter(sub.id)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                      vocabSubFilter === sub.id
                        ? "bg-accent/20 text-accent"
                        : "text-primary-muted hover:text-primary"
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* JLPT Multi-Select Pills */}
            <div className="flex items-center gap-1 p-1 rounded-full glass-panel overflow-x-auto">
              {ALL_LEVELS.map((lvl) => {
                const active = activeLevels.includes(lvl);
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => toggleLevel(lvl)}
                    className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      active
                        ? "bg-accent text-white shadow-neon-glow"
                        : "text-primary-muted hover:text-primary"
                    }`}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>

            {/* Sort Mode Selector + Reshuffle */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 p-1 rounded-xl glass-panel">
                {(
                  [
                    { id: "priority", label: "Priority (Weighted)" },
                    { id: "random", label: "Random" },
                    { id: "sequential", label: "Sequential" },
                  ] as Array<{ id: SortOrderMode; label: string }>
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSortMode(m.id);
                      setShuffleNonce((n) => n + 1);
                    }}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      sortMode === m.id
                        ? "bg-accent text-white"
                        : "text-primary-muted hover:text-primary"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {sortMode !== "sequential" && (
                <button
                  type="button"
                  onClick={() => setShuffleNonce((n) => n + 1)}
                  title="Reshuffle Priority / Random Queue"
                  className="hidden md:flex min-h-[36px] px-2.5 py-1.5 rounded-xl glass-panel border border-border-glass text-primary hover:border-accent items-center gap-1 text-xs font-semibold"
                >
                  <Shuffle className="w-3.5 h-3.5 text-accent" />
                  <span>Reshuffle</span>
                </button>
              )}
            </div>
          </div>

          {/* Optional Industry Track Chips (Applies when Vocab is active) */}
          {activeDecks.includes("vocab") && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <span className="text-[11px] font-semibold text-primary-muted shrink-0 mr-1 flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3" />
                Tracks:
              </span>
              {INDUSTRY_OPTIONS.map((tr) => {
                const active = activeTracks.includes(tr.id);
                return (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => toggleTrack(tr.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 border transition-all ${
                      active
                        ? "bg-accent/20 border-accent text-accent"
                        : "glass-panel border-border-glass text-primary-muted hover:text-primary"
                    }`}
                  >
                    {tr.label}
                  </button>
                );
              })}
              {activeTracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTracks([])}
                  className="px-2 py-1 text-[11px] text-rose-400 hover:underline shrink-0"
                >
                  Clear (Core JLPT Only)
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center Hero Presentation Card */}
      {currentCard && (
        <div className="p-5 sm:p-8 rounded-3xl glass-card border border-border-glass space-y-5 sm:space-y-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg bg-accent/15 text-accent text-xs font-bold">
                {currentCard.jlpt_level}
              </span>
              <span className="px-2.5 py-1 rounded-lg glass-panel text-primary-muted text-xs font-semibold">
                {currentCard.badgeText}
              </span>
              {currentMasteryPct !== null && (
                <span className="text-xs text-primary-muted tabular-nums">
                  Mastery: {currentMasteryPct}%
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-primary-muted tabular-nums">
                {(currentIndex % studyQueue.length) + 1} / {studyQueue.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  currentCard.speakText &&
                  speakJapanese(currentCard.speakText, speechRate)
                }
                aria-label="Pronounce Japanese"
                className="p-2.5 rounded-xl glass-panel border border-border-glass text-primary-muted hover:text-accent"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Fixed-Height Reveal Stage */}
          <div
            onClick={() => setIsRevealed((prev) => !prev)}
            className="min-h-[190px] sm:min-h-[220px] flex flex-col items-center justify-center text-center cursor-pointer select-none px-2"
          >
            <div className="min-h-[32px] flex items-center justify-center">
              {isRevealed ? (
                <span className="font-jp text-base sm:text-lg font-semibold text-accent">
                  {currentCard.heroReading}
                </span>
              ) : (
                <span className="text-xs text-primary-muted flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  Tap card or press Space to reveal reading & meaning
                </span>
              )}
            </div>

            <div
              className={`font-jp font-bold text-primary my-2 tracking-wide ${
                currentCard.deckType === "grammar"
                  ? "text-3xl sm:text-4xl"
                  : "text-5xl sm:text-6xl"
              }`}
            >
              {currentCard.heroMain}
            </div>

            <div className="min-h-[56px] sm:min-h-[60px] flex flex-col items-center justify-center mt-2 space-y-1">
              {isRevealed ? (
                <>
                  <p className="text-base sm:text-lg font-semibold text-primary max-w-xl">
                    {currentCard.meaningPrimary}
                  </p>
                  {currentCard.meaningSecondary && (
                    <p className="text-xs text-primary-muted max-w-xl">
                      {currentCard.meaningSecondary}
                    </p>
                  )}
                </>
              ) : (
                <span className="text-[11px] text-primary-muted/60">••••••</span>
              )}
            </div>
          </div>

          {/* FSRS Triage Buttons */}
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => handleGradeCard(1)}
              className="min-h-[46px] py-2.5 px-3 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-rose-300 hover:bg-rose-500/25 text-xs sm:text-sm font-bold transition-all"
            >
              1 • Again
            </button>
            <button
              type="button"
              onClick={() => handleGradeCard(2)}
              className="min-h-[46px] py-2.5 px-3 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-300 hover:bg-amber-500/25 text-xs sm:text-sm font-bold transition-all"
            >
              2 • Hard
            </button>
            <button
              type="button"
              onClick={() => handleGradeCard(3)}
              className="min-h-[46px] py-2.5 px-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25 text-xs sm:text-sm font-bold transition-all"
            >
              3 • Easy
            </button>
          </div>
        </div>
      )}

      {/* Hands-Free Auto-Presentation Slideshow Bar */}
      <div className="p-4 rounded-3xl glass-card border border-border-glass flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous card"
            className="w-11 h-11 rounded-2xl glass-panel border border-border-glass flex items-center justify-center text-primary hover:border-accent"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            aria-label={isPlaying ? "Pause slideshow" : "Start auto-slideshow"}
            className="relative w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center shadow-neon-glow"
          >
            <svg
              className="absolute inset-0 w-12 h-12 -rotate-90 pointer-events-none"
              viewBox="0 0 48 48"
            >
              <circle
                cx="24"
                cy="24"
                r={circleRadius}
                fill="none"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="3"
              />
              {isPlaying && (
                <circle
                  cx="24"
                  cy="24"
                  r={circleRadius}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="3"
                  strokeDasharray={circleCircumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              )}
            </svg>
            {isPlaying ? (
              <Pause className="w-4 h-4 relative z-10" />
            ) : (
              <Play className="w-4 h-4 ml-0.5 relative z-10" />
            )}
          </button>

          <button
            type="button"
            onClick={goNext}
            aria-label="Next card"
            className="w-11 h-11 rounded-2xl glass-panel border border-border-glass flex items-center justify-center text-primary hover:border-accent"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setLoopDeck((l) => !l)}
            title="Loop Deck"
            className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all ${
              loopDeck
                ? "bg-accent/15 border-accent text-accent"
                : "glass-panel border-border-glass text-primary-muted"
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <label className="flex items-center gap-2 text-primary-muted">
            <span>Gap: {cardGapSec}s</span>
            <input
              type="range"
              min={2}
              max={12}
              step={1}
              value={cardGapSec}
              onChange={(e) => setCardGapSec(Number(e.target.value))}
              className="w-20 accent-indigo-500"
            />
          </label>

          <label className="flex items-center gap-2 text-primary-muted">
            <span>Voice: {speechRate.toFixed(1)}x</span>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={speechRate}
              onChange={(e) => setSpeechRate(Number(e.target.value))}
              className="w-20 accent-indigo-500"
            />
          </label>

          <button
            type="button"
            onClick={() => setAutoSpeak((s) => !s)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 ${
              autoSpeak
                ? "bg-accent/15 border-accent text-accent"
                : "glass-panel border-border-glass text-primary-muted"
            }`}
          >
            {autoSpeak ? (
              <Eye className="w-3.5 h-3.5" />
            ) : (
              <EyeOff className="w-3.5 h-3.5" />
            )}
            <span>Auto-Audio: {autoSpeak ? "ON" : "OFF"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};