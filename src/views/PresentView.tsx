import React, { useState, useEffect, useMemo, useCallback } from "react";
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

const ALL_LEVELS: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

const INDUSTRY_OPTIONS: Array<{ id: IndustryTrack; label: string }> = [
  { id: "general", label: "General" },
  { id: "it", label: "IT & Tech" },
  { id: "finance", label: "Finance" },
  { id: "fnb", label: "F&B" },
  { id: "healthcare", label: "Healthcare" },
  { id: "manufacturing", label: "Manufacturing" },
];

function uniformShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Efraimidis-Spirakis weighted stochastic sampling without replacement.
 * Produces a fresh order every run while heavily favoring higher-priority verbs
 * (due FSRS intervals, low mastery scores, target JLPT band, selected tracks).
 */
function weightedStochasticOrder(
  items: Verb[],
  profile: UserProfile,
  progressMap: Map<number, VerbProgress>
): Verb[] {
  const scored = items.map((verb) => {
    const prog = progressMap.get(verb.id);
    const rawPriority = computeVerbPriority(verb, profile, prog);
    // Amplify contrast so high-priority items reliably cluster near the front
    // while still retaining organic session-to-session variation.
    const weight = Math.max(0.08, Math.pow(Math.max(0.1, rawPriority), 2.2));
    const u = Math.max(1e-6, Math.random());
    const stochasticKey = Math.pow(u, 1 / weight);
    return { verb, stochasticKey };
  });

  scored.sort((a, b) => b.stochasticKey - a.stochasticKey);
  return scored.map((entry) => entry.verb);
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
  // Local fallback filter states if parent didn't pass controlled props
  const [internalLevels, setInternalLevels] = useState<JlptLevel[]>([
    profile.target_jlpt || "N5",
  ]);
  const [internalTracks, setInternalTracks] = useState<IndustryTrack[]>([]);

  const activeLevels = externalLevels ?? internalLevels;
  const setActiveLevels = setExternalLevels ?? setInternalLevels;
  const activeTracks = externalTracks ?? internalTracks;
  const setActiveTracks = setExternalTracks ?? setInternalTracks;

  // Presentation & Auto-Slideshow Controls
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

  // Filter verbs by selected JLPT levels + optional multi-select industry tracks
  const filteredPool = useMemo(() => {
    const levelsToUse =
      activeLevels.length > 0 ? activeLevels : ([profile.target_jlpt] as JlptLevel[]);

    const matches = verbs.filter((v) => {
      if (!levelsToUse.includes(v.jlpt_level)) return false;
      if (activeTracks.length === 0) {
        return v.is_core_jlpt === 1;
      }
      const inSelectedTrack =
        Array.isArray(v.industry_tags) &&
        v.industry_tags.some((t) => activeTracks.includes(t));
      return v.is_core_jlpt === 1 || inSelectedTrack;
    });

    return matches.length > 0 ? matches : verbs;
  }, [verbs, activeLevels, activeTracks, profile.target_jlpt]);

  // Build ordered study queue (Priority = weighted stochastic; Random = uniform; Sequential = corpus ID)
  const studyQueue = useMemo(() => {
    if (filteredPool.length === 0) return [];
    if (sortMode === "sequential") {
      return [...filteredPool].sort((a, b) => a.id - b.id);
    }
    if (sortMode === "random") {
      return uniformShuffle(filteredPool);
    }
    return weightedStochasticOrder(filteredPool, profile, progressMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredPool, sortMode, shuffleNonce]);

  useEffect(() => {
    setCurrentIndex(0);
    setIsRevealed(false);
    setCountdownMs(cardGapSec * 1000);
  }, [studyQueue, cardGapSec]);

  const currentVerb = studyQueue[currentIndex % Math.max(1, studyQueue.length)];

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
    setIsRevealed(false);
    setCountdownMs(cardGapSec * 1000);
    setCurrentIndex((prev) => {
      if (prev + 1 >= studyQueue.length) {
        if (!loopDeck) {
          setIsPlaying(false);
          return prev;
        }
        // Automatically reshuffle priority/random deck when looping around
        if (sortMode !== "sequential") {
          setShuffleNonce((n) => n + 1);
        }
        return 0;
      }
      return prev + 1;
    });
  }, [cardGapSec, studyQueue.length, loopDeck, sortMode]);

  const goPrev = useCallback(() => {
    setIsRevealed(false);
    setCountdownMs(cardGapSec * 1000);
    setCurrentIndex((prev) =>
      prev - 1 < 0 ? Math.max(0, studyQueue.length - 1) : prev - 1
    );
  }, [cardGapSec, studyQueue.length]);

  // Increment daily check-in activity counter whenever user grades a verb
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
      // ignore if table not ready yet
    }
  };

  const handleGradeVerb = async (grade: 1 | 2 | 3) => {
    if (!currentVerb) return;
    const existing = progressMap.get(currentVerb.id);
    const updatedReading = updateVerbMastery(
      existing,
      currentVerb.id,
      "reading",
      grade
    );
    const updatedBoth = updateVerbMastery(
      updatedReading,
      currentVerb.id,
      "meaning",
      grade
    );
    await onUpdateProgress(updatedBoth);
    await recordDailyReviewActivity();
    goNext();
  };

  // Auto-Presentation Timer Loop
  useEffect(() => {
    if (!isPlaying || !currentVerb) return;

    const totalMs = Math.max(2000, cardGapSec * 1000);
    const revealAtMs = Math.round(totalMs * 0.5);
    const tickMs = 100;

    const timer = window.setInterval(() => {
      setCountdownMs((prev) => {
        const next = prev - tickMs;
        if (next <= revealAtMs && !isRevealed) {
          setIsRevealed(true);
          if (autoSpeak) {
            speakJapanese(
              currentVerb.furigana_reading || currentVerb.kanji_form,
              speechRate
            );
          }
        }
        if (next <= 0) {
          goNext();
          return totalMs;
        }
        return next;
      });
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [
    isPlaying,
    currentVerb,
    cardGapSec,
    isRevealed,
    autoSpeak,
    speechRate,
    goNext,
  ]);

  // Keyboard shortcuts: Space (reveal/next), ArrowRight, ArrowLeft, R (speak), 1/2/3 (triage)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (!isRevealed) {
          setIsRevealed(true);
          if (currentVerb && autoSpeak) {
            speakJapanese(
              currentVerb.furigana_reading || currentVerb.kanji_form,
              speechRate
            );
          }
        } else {
          goNext();
        }
      } else if (e.key === "ArrowRight") {
        goNext();
      } else if (e.key === "ArrowLeft") {
        goPrev();
      } else if (e.key.toLowerCase() === "r" && currentVerb) {
        speakJapanese(
          currentVerb.furigana_reading || currentVerb.kanji_form,
          speechRate
        );
      } else if (e.key === "1") {
        handleGradeVerb(1);
      } else if (e.key === "2") {
        handleGradeVerb(2);
      } else if (e.key === "3") {
        handleGradeVerb(3);
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

  const currentProg = currentVerb ? progressMap.get(currentVerb.id) : undefined;
  const currentMasteryPct = currentProg
    ? Math.round(
        ((currentProg.reading_score + currentProg.meaning_score) / 2) * 100
      )
    : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-24 md:pb-10">
      {/* Filter & Queue Order Bar */}
      <div className="p-4 rounded-3xl glass-card border border-border-glass space-y-3">
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

          {/* Sort Mode Selector + Weighted Priority Reshuffle Button */}
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
                aria-label="Reshuffle Queue"
                className="min-h-[36px] px-2.5 py-1.5 rounded-xl glass-panel border border-border-glass text-primary hover:border-accent flex items-center gap-1 text-xs font-semibold"
              >
                <Shuffle className="w-3.5 h-3.5 text-accent" />
                <span className="hidden sm:inline">Reshuffle</span>
              </button>
            )}
          </div>
        </div>

        {/* Optional Industry Track Chips (Unselected = Pure Core JLPT) */}
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
      </div>

      {/* Center Hero Kanji Presentation Card */}
      {currentVerb && (
        <div className="p-6 sm:p-8 rounded-3xl glass-card border border-border-glass space-y-6">
          {/* Card Metadata Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-accent/15 text-accent text-xs font-bold">
                {currentVerb.jlpt_level}
              </span>
              <span className="px-2.5 py-1 rounded-lg glass-panel text-primary-muted text-xs font-semibold">
                {currentVerb.verb_group}
              </span>
              <span className="text-xs text-primary-muted tabular-nums">
                Mastery: {currentMasteryPct}%
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-primary-muted tabular-nums">
                {(currentIndex % studyQueue.length) + 1} / {studyQueue.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  speakJapanese(
                    currentVerb.furigana_reading || currentVerb.kanji_form,
                    speechRate
                  )
                }
                aria-label="Pronounce verb"
                className="p-2.5 rounded-xl glass-panel border border-border-glass text-primary-muted hover:text-accent"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Fixed-Height Kanji + Furigana + Meaning Stage (CLS < 0.1) */}
          <div
            onClick={() => {
              const nextState = !isRevealed;
              setIsRevealed(nextState);
              if (nextState && autoSpeak) {
                speakJapanese(
                  currentVerb.furigana_reading || currentVerb.kanji_form,
                  speechRate
                );
              }
            }}
            className="min-h-[210px] flex flex-col items-center justify-center text-center cursor-pointer select-none px-2"
          >
            {/* Furigana Slot */}
            <div className="h-8 flex items-center justify-center">
              {isRevealed ? (
                <span className="font-jp text-lg sm:text-xl font-semibold text-accent">
                  {currentVerb.furigana_reading}
                </span>
              ) : (
                <span className="text-xs text-primary-muted flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  Tap card or press Space to reveal reading & meaning
                </span>
              )}
            </div>

            {/* Kanji Form Hero */}
            <div className="font-jp text-5xl sm:text-6xl font-bold text-primary my-2 tracking-wide">
              {currentVerb.kanji_form}
            </div>

            {/* English Meaning Slot */}
            <div className="min-h-[52px] flex flex-col items-center justify-center mt-2">
              {isRevealed ? (
                <p className="text-base sm:text-lg font-semibold text-primary max-w-xl">
                  {currentVerb.meanings.join("; ")}
                </p>
              ) : (
                <span className="text-[11px] text-primary-muted/60">
                  ••••••
                </span>
              )}
            </div>
          </div>

          {/* Manual FSRS Triage Buttons */}
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => handleGradeVerb(1)}
              className="min-h-[46px] py-2.5 px-3 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-rose-300 hover:bg-rose-500/25 text-xs sm:text-sm font-bold transition-all"
            >
              1 • Again
            </button>
            <button
              type="button"
              onClick={() => handleGradeVerb(2)}
              className="min-h-[46px] py-2.5 px-3 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-300 hover:bg-amber-500/25 text-xs sm:text-sm font-bold transition-all"
            >
              2 • Hard
            </button>
            <button
              type="button"
              onClick={() => handleGradeVerb(3)}
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
            aria-label="Previous verb"
            className="w-11 h-11 rounded-2xl glass-panel border border-border-glass flex items-center justify-center text-primary hover:border-accent"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Play/Pause with Circular Countdown Ring */}
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
            aria-label="Next verb"
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

        {/* Card Gap & Speech Rate Sliders */}
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