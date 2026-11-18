import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Volume2,
  RotateCcw,
  Eye,
  EyeOff,
  History,
  BrainCircuit,
  Sparkles,
  Trash2,
  Award,
  Flame,
} from "lucide-react";
import {
  Verb,
  UserProfile,
  VerbProgress,
  JlptLevel,
  getDatabase,
} from "../lib/db";
import { speakJapanese } from "../lib/audio";

export interface QuizViewProps {
  verbs: Verb[];
  profile: UserProfile;
  progressMap?: Map<number, VerbProgress> | Record<number, VerbProgress>;
  onUpdateProgress?: (progress: VerbProgress) => void | Promise<void>;
  onRecordProgress?: (progress: VerbProgress) => void | Promise<void>;
  onProgressUpdate?: (progress: VerbProgress) => void | Promise<void>;
}

type QuizMode = "kanji_to_meaning" | "kanji_to_reading" | "meaning_to_kanji" | "mixed";
type SessionLength = 10 | 20 | 30 | 40 | 0; // 0 = Infinite

interface QuizOption {
  id: string;
  label: string;
  verbId: number;
  kanji: string;
  furigana: string;
  meaning: string;
  jlptLevel: JlptLevel;
  isCorrect: boolean;
}

interface QuizQuestion {
  id: string;
  mode: Exclude<QuizMode, "mixed">;
  targetVerb: Verb;
  options: QuizOption[];
}

export interface QuizHistoryEntry {
  id: string;
  verb_id: number;
  kanji_form: string;
  furigana_reading: string;
  correct_meaning: string;
  jlpt_level: string;
  quiz_mode: string;
  is_correct: number; // 1 = right, 0 = wrong
  selected_label: string;
  selected_kanji: string;
  selected_furigana: string;
  selected_meaning: string;
  correct_label: string;
  answered_at: string;
}

const JLPT_LEVELS: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

function getProgressEntry(
  progressMap: Map<number, VerbProgress> | Record<number, VerbProgress> | undefined,
  verbId: number
): VerbProgress | undefined {
  if (!progressMap) return undefined;
  if (progressMap instanceof Map) {
    return progressMap.get(verbId);
  }
  return progressMap[verbId];
}

function formatHistoryTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function renderRubyText(verb: Verb, showFurigana: boolean) {
  if (!showFurigana) {
    return <span>{verb.kanji_form}</span>;
  }
  if (Array.isArray(verb.ruby_segments) && verb.ruby_segments.length > 0) {
    return (
      <ruby className="ruby-align">
        {verb.ruby_segments.map((seg, idx) => (
          <React.Fragment key={idx}>
            <span>{seg.base}</span>
            {seg.ruby ? (
              <rt className="text-xs sm:text-sm text-accent font-medium tracking-normal">
                {seg.ruby}
              </rt>
            ) : (
              <rt />
            )}
          </React.Fragment>
        ))}
      </ruby>
    );
  }
  return (
    <ruby>
      <span>{verb.kanji_form}</span>
      <rt className="text-xs sm:text-sm text-accent font-medium">{verb.furigana_reading}</rt>
    </ruby>
  );
}

export const QuizView: React.FC<QuizViewProps> = ({
  verbs,
  profile,
  progressMap,
  onUpdateProgress,
  onRecordProgress,
  onProgressUpdate,
}) => {
  const [subView, setSubView] = useState<"quiz" | "history">("quiz");
  const [quizMode, setQuizMode] = useState<QuizMode>("kanji_to_meaning");
  const [sessionLength, setSessionLength] = useState<SessionLength>(20);
  const [selectedLevels, setSelectedLevels] = useState<JlptLevel[]>([]);
  const [showFurigana, setShowFurigana] = useState<boolean>(true);

  // Active question & session metrics
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [questionsAnswered, setQuestionsAnswered] = useState<number>(0);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [bestStreak, setBestStreak] = useState<number>(0);
  const [usedVerbIds, setUsedVerbIds] = useState<Set<number>>(new Set());

  // Persistent Quiz History state
  const [history, setHistory] = useState<QuizHistoryEntry[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"all" | "wrong" | "correct">("all");

  // Ensure SQLite quiz_history table exists and load history
  const loadQuizHistory = useCallback(async () => {
    try {
      const db = await getDatabase();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS quiz_history (
          id TEXT PRIMARY KEY,
          verb_id INTEGER NOT NULL,
          kanji_form TEXT NOT NULL,
          furigana_reading TEXT NOT NULL,
          correct_meaning TEXT NOT NULL,
          jlpt_level TEXT NOT NULL,
          quiz_mode TEXT NOT NULL,
          is_correct INTEGER NOT NULL,
          selected_label TEXT NOT NULL,
          selected_kanji TEXT NOT NULL,
          selected_furigana TEXT NOT NULL,
          selected_meaning TEXT NOT NULL,
          correct_label TEXT NOT NULL,
          answered_at TEXT NOT NULL
        );
      `);
      const rows = await db.select<QuizHistoryEntry[]>(
        `SELECT * FROM quiz_history ORDER BY answered_at DESC LIMIT 250;`
      );
      setHistory(rows || []);
    } catch (err) {
      console.warn("[QuizView] Failed to load quiz history:", err);
    }
  }, []);

  useEffect(() => {
    loadQuizHistory();
  }, [loadQuizHistory]);

  const toggleLevel = (lvl: JlptLevel) => {
    setSelectedLevels((prev) =>
      prev.includes(lvl) ? prev.filter((x) => x !== lvl) : [...prev, lvl]
    );
  };

  // Filter candidate verbs by selected JLPT levels (or active profile band if none selected)
  const candidatePool = useMemo(() => {
    if (!verbs || verbs.length === 0) return [];
    if (selectedLevels.length > 0) {
      const filtered = verbs.filter((v) => selectedLevels.includes(v.jlpt_level));
      if (filtered.length >= 4) return filtered;
    }
    return verbs;
  }, [verbs, selectedLevels]);

  // Build a fresh 4-option multiple-choice question
  const buildQuestion = useCallback(
    (pool: Verb[], excludeIds: Set<number>): QuizQuestion | null => {
      if (pool.length < 4) return null;

      const remaining = pool.filter((v) => !excludeIds.has(v.id));
      const sourcePool = remaining.length > 0 ? remaining : pool;

      // Prioritize weaker FSRS items slightly while keeping variety
      const weighted = [...sourcePool].sort((a, b) => {
        const pa = getProgressEntry(progressMap, a.id);
        const pb = getProgressEntry(progressMap, b.id);
        const sa = pa ? (pa.reading_score + pa.meaning_score) / 2 : 0;
        const sb = pb ? (pb.reading_score + pb.meaning_score) / 2 : 0;
        return sa - sb + (Math.random() - 0.5) * 0.85;
      });

      const targetVerb = weighted[0];
      const effectiveMode: Exclude<QuizMode, "mixed"> =
        quizMode === "mixed"
          ? (["kanji_to_meaning", "kanji_to_reading", "meaning_to_kanji"] as const)[
              Math.floor(Math.random() * 3)
            ]
          : quizMode;

      const targetMeaning = targetVerb.meanings.slice(0, 3).join(", ");

      // Pick 3 distinct distractors with different meanings & readings
      const distractors: Verb[] = [];
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (const candidate of shuffled) {
        if (candidate.id === targetVerb.id) continue;
        const candMeaning = candidate.meanings.slice(0, 3).join(", ");
        if (
          effectiveMode === "kanji_to_meaning" &&
          candMeaning.toLowerCase() === targetMeaning.toLowerCase()
        ) {
          continue;
        }
        if (
          effectiveMode === "kanji_to_reading" &&
          candidate.furigana_reading === targetVerb.furigana_reading
        ) {
          continue;
        }
        if (
          effectiveMode === "meaning_to_kanji" &&
          candidate.kanji_form === targetVerb.kanji_form
        ) {
          continue;
        }
        if (distractors.some((d) => d.id === candidate.id)) continue;
        distractors.push(candidate);
        if (distractors.length === 3) break;
      }

      if (distractors.length < 3) return null;

      const toOption = (v: Verb, isCorrect: boolean): QuizOption => {
        const meaningText = v.meanings.slice(0, 3).join(", ");
        let label = meaningText;
        if (effectiveMode === "kanji_to_reading") {
          label = v.furigana_reading;
        } else if (effectiveMode === "meaning_to_kanji") {
          label = v.kanji_form;
        }
        return {
          id: `${v.id}_${isCorrect ? "correct" : "dist"}_${Math.random().toString(36).slice(2, 6)}`,
          label,
          verbId: v.id,
          kanji: v.kanji_form,
          furigana: v.furigana_reading,
          meaning: meaningText,
          jlptLevel: v.jlpt_level,
          isCorrect,
        };
      };

      const options = [
        toOption(targetVerb, true),
        ...distractors.map((d) => toOption(d, false)),
      ].sort(() => Math.random() - 0.5);

      return {
        id: `q_${Date.now()}_${targetVerb.id}`,
        mode: effectiveMode,
        targetVerb,
        options,
      };
    },
    [quizMode, progressMap]
  );

  // Start / reset session whenever mode, length, or JLPT filters change
  const restartSession = useCallback(() => {
    const emptySet = new Set<number>();
    setQuestionsAnswered(0);
    setCorrectCount(0);
    setStreak(0);
    setSelectedOptionId(null);
    const first = buildQuestion(candidatePool, emptySet);
    if (first) {
      emptySet.add(first.targetVerb.id);
    }
    setUsedVerbIds(emptySet);
    setCurrentQuestion(first);
  }, [buildQuestion, candidatePool]);

  useEffect(() => {
    restartSession();
  }, [restartSession]);

  // Handle user answer selection
  const handleSelectOption = async (option: QuizOption) => {
    if (!currentQuestion || selectedOptionId !== null) return;

    setSelectedOptionId(option.id);
    const isRight = option.isCorrect;
    const nextAnswered = questionsAnswered + 1;
    const nextCorrect = isRight ? correctCount + 1 : correctCount;
    const nextStreak = isRight ? streak + 1 : 0;

    setQuestionsAnswered(nextAnswered);
    setCorrectCount(nextCorrect);
    setStreak(nextStreak);
    if (nextStreak > bestStreak) {
      setBestStreak(nextStreak);
    }

    const target = currentQuestion.targetVerb;
    const correctOption =
      currentQuestion.options.find((o) => o.isCorrect) || option;
    const nowIso = new Date().toISOString();

    // 1. Save to persistent SQLite quiz_history
    const historyRow: QuizHistoryEntry = {
      id: `qh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      verb_id: target.id,
      kanji_form: target.kanji_form,
      furigana_reading: target.furigana_reading,
      correct_meaning: target.meanings.slice(0, 3).join(", "),
      jlpt_level: target.jlpt_level,
      quiz_mode: currentQuestion.mode,
      is_correct: isRight ? 1 : 0,
      selected_label: option.label,
      selected_kanji: option.kanji,
      selected_furigana: option.furigana,
      selected_meaning: option.meaning,
      correct_label: correctOption.label,
      answered_at: nowIso,
    };

    setHistory((prev) => [historyRow, ...prev]);

    try {
      const db = await getDatabase();
      await db.execute(
        `INSERT INTO quiz_history (
          id, verb_id, kanji_form, furigana_reading, correct_meaning, jlpt_level,
          quiz_mode, is_correct, selected_label, selected_kanji, selected_furigana,
          selected_meaning, correct_label, answered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          historyRow.id,
          historyRow.verb_id,
          historyRow.kanji_form,
          historyRow.furigana_reading,
          historyRow.correct_meaning,
          historyRow.jlpt_level,
          historyRow.quiz_mode,
          historyRow.is_correct,
          historyRow.selected_label,
          historyRow.selected_kanji,
          historyRow.selected_furigana,
          historyRow.selected_meaning,
          historyRow.correct_label,
          historyRow.answered_at,
        ]
      );

      // 2. Update Dual-Axis FSRS progress in SQLite
      const existing = getProgressEntry(progressMap, target.id);
      const prevReading = existing?.reading_score ?? 0;
      const prevMeaning = existing?.meaning_score ?? 0;
      const prevStability = existing?.stability_days ?? 1.0;
      const prevReps = existing?.repetitions ?? 0;
      const prevLapses = existing?.lapses ?? 0;

      const isReadingTest = currentQuestion.mode === "kanji_to_reading";
      const nextReading = isReadingTest
        ? isRight
          ? Math.min(1, prevReading + 0.22)
          : Math.max(0, prevReading - 0.15)
        : isRight
          ? Math.min(1, prevReading + 0.08)
          : prevReading;

      const nextMeaning = !isReadingTest
        ? isRight
          ? Math.min(1, prevMeaning + 0.22)
          : Math.max(0, prevMeaning - 0.15)
        : isRight
          ? Math.min(1, prevMeaning + 0.08)
          : prevMeaning;

      const nextStability = isRight
        ? Math.min(180, prevStability * 1.65 + 0.5)
        : Math.max(0.5, prevStability * 0.5);
      const nextReviewDate = new Date(
        Date.now() + nextStability * 24 * 60 * 60 * 1000
      ).toISOString();

      const updatedProgress: VerbProgress = {
        verb_id: target.id,
        reading_score: Number(nextReading.toFixed(3)),
        meaning_score: Number(nextMeaning.toFixed(3)),
        stability_days: Number(nextStability.toFixed(2)),
        repetitions: isRight ? prevReps + 1 : prevReps,
        lapses: isRight ? prevLapses : prevLapses + 1,
        last_reviewed_at: nowIso,
        next_review_at: nextReviewDate,
        sync_dirty: 1,
        updated_at: nowIso,
      };

      await db.execute(
        `INSERT INTO user_verb_progress (
          verb_id, reading_score, meaning_score, stability_days,
          repetitions, lapses, last_reviewed_at, next_review_at, sync_dirty, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(verb_id) DO UPDATE SET
          reading_score = excluded.reading_score,
          meaning_score = excluded.meaning_score,
          stability_days = excluded.stability_days,
          repetitions = excluded.repetitions,
          lapses = excluded.lapses,
          last_reviewed_at = excluded.last_reviewed_at,
          next_review_at = excluded.next_review_at,
          sync_dirty = 1,
          updated_at = excluded.updated_at;`,
        [
          updatedProgress.verb_id,
          updatedProgress.reading_score,
          updatedProgress.meaning_score,
          updatedProgress.stability_days,
          updatedProgress.repetitions,
          updatedProgress.lapses,
          updatedProgress.last_reviewed_at,
          updatedProgress.next_review_at,
          updatedProgress.updated_at,
        ]
      );

      onUpdateProgress?.(updatedProgress);
      onRecordProgress?.(updatedProgress);
      onProgressUpdate?.(updatedProgress);
    } catch (err) {
      console.warn("[QuizView] Error saving progress/history:", err);
    }
  };

  // Advance to next question
  const handleNextQuestion = useCallback(() => {
    if (sessionLength > 0 && questionsAnswered >= sessionLength) {
      return;
    }
    const nextUsed = new Set(usedVerbIds);
    const nextQ = buildQuestion(candidatePool, nextUsed);
    if (nextQ) {
      nextUsed.add(nextQ.targetVerb.id);
    }
    setUsedVerbIds(nextUsed);
    setSelectedOptionId(null);
    setCurrentQuestion(nextQ);
  }, [sessionLength, questionsAnswered, usedVerbIds, buildQuestion, candidatePool]);

  // Keyboard shortcuts: 1-4 to pick answer, Enter/Space for Next
  useEffect(() => {
    if (subView !== "quiz") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (!currentQuestion) return;

      if (selectedOptionId === null && ["1", "2", "3", "4"].includes(e.key)) {
        const idx = Number(e.key) - 1;
        const opt = currentQuestion.options[idx];
        if (opt) {
          e.preventDefault();
          handleSelectOption(opt);
        }
      } else if (
        selectedOptionId !== null &&
        (e.key === "Enter" || e.key === " " || e.key === "ArrowRight")
      ) {
        e.preventDefault();
        handleNextQuestion();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const handleClearHistory = async () => {
    try {
      const db = await getDatabase();
      await db.execute(`DELETE FROM quiz_history;`);
      setHistory([]);
    } catch (err) {
      console.warn("[QuizView] Failed to clear history:", err);
    }
  };

  const wrongHistoryCount = useMemo(
    () => history.filter((h) => h.is_correct === 0).length,
    [history]
  );

  const filteredHistory = useMemo(() => {
    if (historyFilter === "wrong") return history.filter((h) => h.is_correct === 0);
    if (historyFilter === "correct") return history.filter((h) => h.is_correct === 1);
    return history;
  }, [history, historyFilter]);

  const selectedOption = useMemo(
    () =>
      currentQuestion?.options.find((o) => o.id === selectedOptionId) || null,
    [currentQuestion, selectedOptionId]
  );

  const correctOption = useMemo(
    () => currentQuestion?.options.find((o) => o.isCorrect) || null,
    [currentQuestion]
  );

  const isSessionComplete =
    sessionLength > 0 &&
    questionsAnswered >= sessionLength &&
    selectedOptionId !== null;

  const accuracyPct =
    questionsAnswered === 0
      ? 0
      : Math.round((correctCount / questionsAnswered) * 100);

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-24 md:pb-10">
      {/* Top Mode & Sub-View Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-3xl glass-card border border-border-glass">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubView("quiz")}
            className={`flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-2xl text-xs font-semibold transition-all ${
              subView === "quiz"
                ? "bg-accent text-white shadow-neon-glow"
                : "glass-panel text-primary-muted hover:text-primary"
            }`}
          >
            <BrainCircuit className="w-4 h-4" />
            <span>Kanji Quiz</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView("history")}
            className={`flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-2xl text-xs font-semibold transition-all ${
              subView === "history"
                ? "bg-accent text-white shadow-neon-glow"
                : "glass-panel text-primary-muted hover:text-primary"
            }`}
          >
            <History className="w-4 h-4" />
            <span>Choice History ({history.length})</span>
            {wrongHistoryCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-rose-500/20 text-rose-400 font-bold tabular-nums">
                {wrongHistoryCount} wrong
              </span>
            )}
          </button>
        </div>

        {/* Furigana Visibility Toggle */}
        <button
          type="button"
          onClick={() => setShowFurigana((prev) => !prev)}
          aria-pressed={showFurigana}
          className={`flex items-center gap-2 min-h-[42px] px-3.5 py-2 rounded-2xl border text-xs font-semibold transition-all ${
            showFurigana
              ? "border-accent bg-accent/15 text-accent"
              : "border-border-glass glass-panel text-primary-muted hover:text-primary"
          }`}
        >
          {showFurigana ? (
            <Eye className="w-4 h-4" />
          ) : (
            <EyeOff className="w-4 h-4" />
          )}
          <span>Furigana: {showFurigana ? "ON" : "OFF"}</span>
        </button>
      </div>

      {subView === "quiz" ? (
        <>
          {/* Configuration & Live Score HUD */}
          <div className="p-4 rounded-3xl glass-card border border-border-glass space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* JLPT N5-N1 Multi-Select Pills */}
              <div className="flex items-center gap-1.5 p-1 rounded-full glass-panel overflow-x-auto">
                <span className="text-[11px] font-semibold text-primary-muted px-2">
                  JLPT:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedLevels([])}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                    selectedLevels.length === 0
                      ? "bg-accent text-white shadow-neon-glow"
                      : "text-primary-muted hover:text-primary"
                  }`}
                >
                  All ({profile.current_jlpt}–{profile.target_jlpt})
                </button>
                {JLPT_LEVELS.map((lvl) => {
                  const active = selectedLevels.includes(lvl);
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => toggleLevel(lvl)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
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

              {/* Quiz Mode Selector */}
              <div className="flex items-center gap-1.5 p-1 rounded-full glass-panel overflow-x-auto">
                {(
                  [
                    { id: "kanji_to_meaning", label: "Kanji → Meaning" },
                    { id: "kanji_to_reading", label: "Kanji → Reading" },
                    { id: "meaning_to_kanji", label: "Meaning → Kanji" },
                    { id: "mixed", label: "Mixed" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setQuizMode(m.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                      quizMode === m.id
                        ? "bg-accent text-white shadow-neon-glow"
                        : "text-primary-muted hover:text-primary"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Session Length + Live Score Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border-glass text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-primary-muted font-medium">Questions:</span>
                {([10, 20, 30, 40, 0] as SessionLength[]).map((len) => (
                  <button
                    key={len}
                    type="button"
                    onClick={() => setSessionLength(len)}
                    className={`px-2.5 py-1 rounded-lg font-semibold tabular-nums transition-colors ${
                      sessionLength === len
                        ? "bg-accent/20 text-accent border border-accent/40"
                        : "glass-panel text-primary-muted hover:text-primary"
                    }`}
                  >
                    {len === 0 ? "∞" : len}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-4 tabular-nums">
                <span className="font-semibold text-primary">
                  Score:{" "}
                  <span className="text-emerald-400">
                    {correctCount}/{questionsAnswered}
                  </span>{" "}
                  ({accuracyPct}%)
                </span>
                <span className="flex items-center gap-1 font-semibold text-amber-400">
                  <Flame className="w-3.5 h-3.5" />
                  Streak: {streak}
                </span>
                <button
                  type="button"
                  onClick={restartSession}
                  title="Restart quiz session"
                  className="p-1.5 rounded-lg glass-panel text-primary-muted hover:text-primary transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Active Question Card */}
          {currentQuestion ? (
            <div className="p-6 sm:p-8 rounded-3xl glass-card border border-border-glass space-y-6">
              {/* Card Metadata & Pronunciation */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg bg-accent/15 text-accent text-xs font-bold">
                    {currentQuestion.targetVerb.jlpt_level}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg glass-panel text-primary-muted text-xs font-medium">
                    {currentQuestion.targetVerb.verb_group}
                  </span>
                  {sessionLength > 0 && (
                    <span className="text-xs text-primary-muted tabular-nums">
                      Question {Math.min(questionsAnswered + (selectedOptionId ? 0 : 1), sessionLength)} /{" "}
                      {sessionLength}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    speakJapanese(
                      currentQuestion.targetVerb.furigana_reading ||
                        currentQuestion.targetVerb.kanji_form
                    )
                  }
                  aria-label="Listen to pronunciation"
                  className="flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl glass-panel border border-border-glass text-xs font-semibold text-primary hover:text-accent transition-colors"
                >
                  <Volume2 className="w-4 h-4 text-accent" />
                  <span>Listen</span>
                </button>
              </div>

              {/* Prompt Display */}
              <div className="text-center py-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-muted">
                  {currentQuestion.mode === "kanji_to_meaning" &&
                    "Select the correct English meaning"}
                  {currentQuestion.mode === "kanji_to_reading" &&
                    "Select the correct Hiragana reading"}
                  {currentQuestion.mode === "meaning_to_kanji" &&
                    "Select the matching Japanese Kanji"}
                </p>

                {currentQuestion.mode === "meaning_to_kanji" ? (
                  <div className="space-y-1.5">
                    <h2 className="text-2xl sm:text-3xl font-bold text-primary">
                      {currentQuestion.targetVerb.meanings.slice(0, 3).join(", ")}
                    </h2>
                    {showFurigana && (
                      <p className="font-jp text-sm text-accent font-medium">
                        Hint: {currentQuestion.targetVerb.furigana_reading}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="font-jp text-4xl sm:text-5xl font-bold text-primary tracking-wide pt-2">
                    {renderRubyText(
                      currentQuestion.targetVerb,
                      currentQuestion.mode === "kanji_to_reading"
                        ? showFurigana && selectedOptionId !== null
                        : showFurigana
                    )}
                  </div>
                )}
              </div>

              {/* 4 Multiple Choice Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentQuestion.options.map((opt, idx) => {
                  const isPicked = selectedOptionId === opt.id;
                  const isAnswered = selectedOptionId !== null;

                  let styleClass =
                    "glass-panel border-border-glass hover:border-accent/60 text-primary";
                  if (isAnswered) {
                    if (opt.isCorrect) {
                      styleClass =
                        "border-emerald-500 bg-emerald-500/15 text-primary shadow-sm";
                    } else if (isPicked && !opt.isCorrect) {
                      styleClass =
                        "border-rose-500 bg-rose-500/15 text-primary";
                    } else {
                      styleClass =
                        "glass-panel border-border-glass opacity-55 text-primary-muted";
                    }
                  }

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isAnswered}
                      onClick={() => handleSelectOption(opt)}
                      className={`min-h-[60px] p-4 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 ${styleClass}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-surface-card border border-border-glass flex items-center justify-center text-xs font-mono font-bold text-primary-muted shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          {currentQuestion.mode === "meaning_to_kanji" &&
                            showFurigana && (
                              <div className="font-jp text-[11px] text-accent font-medium">
                                {opt.furigana}
                              </div>
                            )}
                          <div
                            className={`font-semibold text-sm sm:text-base truncate ${
                              currentQuestion.mode !== "kanji_to_meaning"
                                ? "font-jp"
                                : ""
                            }`}
                          >
                            {opt.label}
                          </div>
                        </div>
                      </div>

                      {isAnswered && opt.isCorrect && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      )}
                      {isAnswered && isPicked && !opt.isCorrect && (
                        <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Instant Detailed Feedback Card (Wrong Option Meaning + Right Choice) */}
              {selectedOption && correctOption && (
                <div
                  className={`p-4 rounded-2xl border space-y-2.5 ${
                    selectedOption.isCorrect
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-rose-500/40 bg-rose-500/10"
                  }`}
                >
                  {selectedOption.isCorrect ? (
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Correct!</span>
                        </div>
                        <p className="text-xs sm:text-sm text-primary">
                          <span className="font-jp font-bold">
                            {currentQuestion.targetVerb.kanji_form}
                          </span>{" "}
                          <span className="font-jp text-accent">
                            （{currentQuestion.targetVerb.furigana_reading}）
                          </span>{" "}
                          means{" "}
                          <strong>
                            "{currentQuestion.targetVerb.meanings.slice(0, 3).join(", ")}"
                          </strong>
                          .
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                        <XCircle className="w-4 h-4" />
                        <span>Incorrect — Here is the breakdown:</span>
                      </div>

                      {/* What was wrong & the meaning of the wrong option */}
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs sm:text-sm space-y-1">
                        <p className="text-rose-300 font-semibold">
                          Your choice: "{selectedOption.label}"
                        </p>
                        <p className="text-primary">
                          That option belongs to{" "}
                          <span className="font-jp font-bold text-rose-300">
                            {selectedOption.kanji}（{selectedOption.furigana}）
                          </span>
                          , which means:{" "}
                          <strong className="text-rose-200">
                            "{selectedOption.meaning}"
                          </strong>
                          .
                        </p>
                      </div>

                      {/* The right choice */}
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs sm:text-sm space-y-1">
                        <p className="text-emerald-400 font-semibold">
                          Right choice: "{correctOption.label}"
                        </p>
                        <p className="text-primary">
                          <span className="font-jp font-bold text-emerald-300">
                            {currentQuestion.targetVerb.kanji_form}（
                            {currentQuestion.targetVerb.furigana_reading}）
                          </span>{" "}
                          means:{" "}
                          <strong className="text-emerald-200">
                            "{currentQuestion.targetVerb.meanings.slice(0, 3).join(", ")}"
                          </strong>
                          .
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Next Question or Session Complete Banner */}
                  {isSessionComplete ? (
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border-glass">
                      <div className="flex items-center gap-2 text-sm font-bold text-primary">
                        <Award className="w-5 h-5 text-amber-400" />
                        <span>
                          Session Complete! Final Score: {correctCount}/{questionsAnswered} (
                          {accuracyPct}%) • Best Streak: {bestStreak}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={restartSession}
                        className="min-h-[42px] px-5 py-2 rounded-xl bg-accent text-white font-semibold text-xs hover:opacity-95 shadow-neon-glow"
                      >
                        Start New Session
                      </button>
                    </div>
                  ) : (
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={handleNextQuestion}
                        className="min-h-[42px] px-5 py-2 rounded-xl bg-accent text-white font-semibold text-xs hover:opacity-95 shadow-neon-glow"
                      >
                        Next Question →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 rounded-3xl glass-card border border-border-glass text-center text-sm text-primary-muted">
              Not enough verbs match the current filter. Select additional JLPT levels above.
            </div>
          )}
        </>
      ) : (
        /* QUIZ CHOICE HISTORY SECTION */
        <div className="p-5 rounded-3xl glass-card border border-border-glass space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-primary flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <span>Quiz Choice & Mistake Review History</span>
              </h3>
              <p className="text-xs text-primary-muted">
                Review past right & wrong choices, see what each wrong option meant, and reinforce the right answer
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex p-1 rounded-xl glass-panel text-xs">
                {(
                  [
                    { id: "all", label: `All (${history.length})` },
                    { id: "wrong", label: `Wrong (${wrongHistoryCount})` },
                    {
                      id: "correct",
                      label: `Right (${history.length - wrongHistoryCount})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setHistoryFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                      historyFilter === tab.id
                        ? "bg-accent text-white"
                        : "text-primary-muted hover:text-primary"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  title="Clear quiz history"
                  className="p-2 rounded-xl glass-panel text-primary-muted hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-xs text-primary-muted">
              No quiz history entries in this filter yet. Answer a few questions in the Kanji Quiz tab!
            </div>
          ) : (
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {filteredHistory.map((item) => {
                const isRight = item.is_correct === 1;
                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border space-y-2.5 ${
                      isRight
                        ? "glass-panel border-emerald-500/30"
                        : "glass-panel border-rose-500/35"
                    }`}
                  >
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {isRight ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Right
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-xs font-bold">
                            <XCircle className="w-3.5 h-3.5" />
                            Wrong
                          </span>
                        )}

                        <span className="font-jp text-lg font-bold text-primary">
                          {item.kanji_form}
                        </span>
                        {showFurigana && (
                          <span className="font-jp text-xs text-accent font-medium">
                            （{item.furigana_reading}）
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-bold">
                          {item.jlpt_level}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-primary-muted">
                          {formatHistoryTime(item.answered_at)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            speakJapanese(item.furigana_reading || item.kanji_form)
                          }
                          aria-label="Pronounce word"
                          className="p-1.5 rounded-lg text-primary-muted hover:text-accent hover:bg-surface-hover"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Choice Details */}
                    {isRight ? (
                      <p className="text-xs text-primary">
                        You selected{" "}
                        <strong className="text-emerald-400">
                          "{item.selected_label}"
                        </strong>{" "}
                        — Meaning: <strong>"{item.correct_meaning}"</strong>
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 space-y-0.5">
                          <div className="font-bold text-rose-400">
                            Your Wrong Choice: "{item.selected_label}"
                          </div>
                          <div className="text-primary">
                            Meaning of{" "}
                            <span className="font-jp font-bold">
                              {item.selected_kanji}（{item.selected_furigana}）
                            </span>
                            :{" "}
                            <strong className="text-rose-200">
                              "{item.selected_meaning}"
                            </strong>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-0.5">
                          <div className="font-bold text-emerald-400">
                            Right Choice: "{item.correct_label}"
                          </div>
                          <div className="text-primary">
                            Meaning of{" "}
                            <span className="font-jp font-bold">
                              {item.kanji_form}（{item.furigana_reading}）
                            </span>
                            :{" "}
                            <strong className="text-emerald-200">
                              "{item.correct_meaning}"
                            </strong>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};