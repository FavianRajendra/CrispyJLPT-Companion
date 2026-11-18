import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Volume2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  History,
  Flag,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Verb,
  UserProfile,
  VerbProgress,
  JlptLevel,
  IndustryTrack,
  getDatabase,
} from "../lib/db";
import { updateVerbMastery } from "../lib/mastery";
import { speakJapanese } from "../lib/audio";

export interface QuizViewProps {
  verbs: Verb[];
  profile: UserProfile;
  progressMap: Map<number, VerbProgress>;
  onUpdateProgress: (progress: VerbProgress) => void | Promise<void>;
  selectedLevels?: JlptLevel[];
  selectedTracks?: IndustryTrack[];
}

type QuizMode = "reading" | "meaning" | "reverse" | "mixed";
type SessionLength = 10 | 20 | 30 | 40 | "infinite";

interface QuizQuestionItem {
  verb: Verb;
  mode: "reading" | "meaning" | "reverse";
  options: Verb[];
  correctIndex: number;
}

interface QuizHistoryEntry {
  id: string;
  verb_id: number;
  kanji_form: string;
  furigana_reading: string;
  correct_meaning: string;
  chosen_label: string;
  is_correct: number;
  is_idk: number;
  mode: string;
  answered_at: string;
}

const IDK_EMOTE_PROMPTS = [
  "🤷 Honestly, I don't know (No Gacha)",
  "🫠 Blank mind — flag for review",
  "🎲 Skip gambling — reveal answer",
];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const QuizView: React.FC<QuizViewProps> = ({
  verbs,
  profile,
  progressMap,
  onUpdateProgress,
  selectedLevels,
  selectedTracks,
}) => {
  const [quizMode, setQuizMode] = useState<QuizMode>("mixed");
  const [sessionLength, setSessionLength] = useState<SessionLength>(10);
  const [deckSource, setDeckSource] = useState<"pool" | "flagged">("pool");
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "wrong" | "idk">("all");
  const [historyRows, setHistoryRows] = useState<QuizHistoryEntry[]>([]);

  const [questions, setQuestions] = useState<QuizQuestionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [answeredAsIdk, setAnsweredAsIdk] = useState(false);

  const [score, setScore] = useState(0);
  const [answeredTotal, setAnsweredTotal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [sessionIdkCount, setSessionIdkCount] = useState(0);
  const [isSessionDone, setIsSessionDone] = useState(false);

  // Load persisted quiz history & flagged IDK rows from SQLite
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
          chosen_label TEXT NOT NULL,
          is_correct INTEGER NOT NULL DEFAULT 0,
          is_idk INTEGER NOT NULL DEFAULT 0,
          mode TEXT NOT NULL DEFAULT 'mixed',
          answered_at TEXT NOT NULL
        );
      `);
      // Backwards-compatible column migration if table existed without is_idk
      try {
        await db.execute(
          `ALTER TABLE quiz_history ADD COLUMN is_idk INTEGER NOT NULL DEFAULT 0;`
        );
      } catch {
        // Column already exists
      }

      const rows = await db.select<QuizHistoryEntry[]>(
        `SELECT * FROM quiz_history ORDER BY answered_at DESC LIMIT 250;`
      );
      setHistoryRows(rows || []);
    } catch (err) {
      console.warn("[QuizView] Failed to load quiz history:", err);
    }
  }, []);

  useEffect(() => {
    loadQuizHistory();
  }, [loadQuizHistory]);

  const flaggedVerbIds = useMemo(() => {
    const ids = new Set<number>();
    for (const row of historyRows) {
      if (row.is_idk === 1) {
        ids.add(row.verb_id);
      }
    }
    return ids;
  }, [historyRows]);

  // Active filtered verb pool (supports multi-select tracks + Core JLPT default)
  const activePool = useMemo(() => {
    const levels =
      selectedLevels && selectedLevels.length > 0
        ? selectedLevels
        : ([profile.target_jlpt] as JlptLevel[]);
    const tracks = selectedTracks || [];

    const filtered = verbs.filter((v) => {
      if (!levels.includes(v.jlpt_level)) return false;
      if (tracks.length === 0) {
        return v.is_core_jlpt === 1;
      }
      const hasTrack =
        Array.isArray(v.industry_tags) &&
        v.industry_tags.some((t) => tracks.includes(t));
      return v.is_core_jlpt === 1 || hasTrack;
    });

    const base = filtered.length >= 4 ? filtered : verbs;

    if (deckSource === "flagged" && flaggedVerbIds.size > 0) {
      const flaggedOnly = base.filter((v) => flaggedVerbIds.has(v.id));
      if (flaggedOnly.length > 0) return flaggedOnly;
    }

    return base;
  }, [verbs, profile.target_jlpt, selectedLevels, selectedTracks, deckSource, flaggedVerbIds]);

  const buildQuestion = useCallback(
    (targetVerb: Verb, allDistractorPool: Verb[]): QuizQuestionItem => {
      const effectiveMode: "reading" | "meaning" | "reverse" =
        quizMode === "mixed"
          ? (["reading", "meaning", "reverse"] as const)[
              Math.floor(Math.random() * 3)
            ]
          : quizMode;

      const sameLevelDistractors = allDistractorPool.filter(
        (v) => v.id !== targetVerb.id && v.jlpt_level === targetVerb.jlpt_level
      );
      const fallbackDistractors = allDistractorPool.filter(
        (v) => v.id !== targetVerb.id
      );
      const sourcePool =
        sameLevelDistractors.length >= 3 ? sameLevelDistractors : fallbackDistractors;

      const distractors = shuffle(sourcePool).slice(0, 3);
      const options = shuffle([targetVerb, ...distractors]);
      const correctIndex = options.findIndex((o) => o.id === targetVerb.id);

      return {
        verb: targetVerb,
        mode: effectiveMode,
        options,
        correctIndex,
      };
    },
    [quizMode]
  );

  const startNewSession = useCallback(() => {
    if (activePool.length === 0) return;
    const count =
      sessionLength === "infinite"
        ? Math.min(40, activePool.length)
        : Math.min(sessionLength, activePool.length);

    const chosenVerbs = shuffle(activePool).slice(0, count);
    const built = chosenVerbs.map((v) => buildQuestion(v, verbs));

    setQuestions(built);
    setCurrentIndex(0);
    setSelectedIdx(null);
    setAnsweredAsIdk(false);
    setScore(0);
    setAnsweredTotal(0);
    setStreak(0);
    setSessionIdkCount(0);
    setIsSessionDone(false);
  }, [activePool, verbs, sessionLength, buildQuestion]);

  useEffect(() => {
    startNewSession();
  }, [startNewSession]);

  const recordHistoryRow = async (
    q: QuizQuestionItem,
    chosenLabel: string,
    isCorrect: boolean,
    isIdk: boolean
  ) => {
    try {
      const db = await getDatabase();
      const id = `qh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO quiz_history (
          id, verb_id, kanji_form, furigana_reading, correct_meaning,
          chosen_label, is_correct, is_idk, mode, answered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          q.verb.id,
          q.verb.kanji_form,
          q.verb.furigana_reading,
          q.verb.meanings.slice(0, 3).join(", "),
          chosenLabel,
          isCorrect ? 1 : 0,
          isIdk ? 1 : 0,
          q.mode,
          now,
        ]
      );

      // If user answered correctly later, clear prior IDK flags on that verb
      if (isCorrect) {
        await db.execute(
          `UPDATE quiz_history SET is_idk = 0 WHERE verb_id = ?;`,
          [q.verb.id]
        );
      }

      await loadQuizHistory();
    } catch (err) {
      console.warn("[QuizView] Failed to save quiz history:", err);
    }
  };

  const currentQ = questions[currentIndex % Math.max(1, questions.length)];
  const isAnswered = selectedIdx !== null || answeredAsIdk;
  const idkButtonText = IDK_EMOTE_PROMPTS[currentIndex % IDK_EMOTE_PROMPTS.length];

  const handleChooseOption = async (idx: number) => {
    if (isAnswered || !currentQ) return;
    setSelectedIdx(idx);
    setAnsweredTotal((t) => t + 1);

    const chosenVerb = currentQ.options[idx];
    const isCorrect = idx === currentQ.correctIndex;

    const chosenLabel =
      currentQ.mode === "reading"
        ? chosenVerb.furigana_reading
        : currentQ.mode === "meaning"
        ? chosenVerb.meanings[0] || ""
        : `${chosenVerb.kanji_form} (${chosenVerb.furigana_reading})`;

    if (isCorrect) {
      setScore((s) => s + 1);
      setStreak((st) => st + 1);
    } else {
      setStreak(0);
      if (sessionLength === "infinite") {
        setQuestions((prev) => {
          const copy = [...prev];
          const reinsert = buildQuestion(currentQ.verb, verbs);
          copy.splice(Math.min(copy.length, currentIndex + 4), 0, reinsert);
          return copy;
        });
      }
    }

    // Update FSRS Dual-Axis Mastery
    const existing = progressMap.get(currentQ.verb.id);
    const axis = currentQ.mode === "reading" ? "reading" : "meaning";
    const updated = updateVerbMastery(
      existing,
      currentQ.verb.id,
      axis,
      isCorrect ? 3 : 1
    );
    await onUpdateProgress(updated);
    await recordHistoryRow(currentQ, chosenLabel, isCorrect, false);
  };

  const handleHonestlyDontKnow = async () => {
    if (isAnswered || !currentQ) return;
    setAnsweredAsIdk(true);
    setAnsweredTotal((t) => t + 1);
    setSessionIdkCount((k) => k + 1);
    setStreak(0);

    if (sessionLength === "infinite") {
      setQuestions((prev) => {
        const copy = [...prev];
        const reinsert = buildQuestion(currentQ.verb, verbs);
        copy.splice(Math.min(copy.length, currentIndex + 3), 0, reinsert);
        return copy;
      });
    }

    // Record gentle FSRS lapse without counting a random lucky hit
    const existing = progressMap.get(currentQ.verb.id);
    const axis = currentQ.mode === "reading" ? "reading" : "meaning";
    const updated = updateVerbMastery(existing, currentQ.verb.id, axis, 1);
    await onUpdateProgress(updated);
    await recordHistoryRow(
      currentQ,
      "🤷 Honestly, I don't know",
      false,
      true
    );
  };

  const handleNext = () => {
    if (sessionLength !== "infinite" && answeredTotal >= sessionLength) {
      setIsSessionDone(true);
      return;
    }
    setSelectedIdx(null);
    setAnsweredAsIdk(false);
    setCurrentIndex((prev) => {
      if (prev + 1 >= questions.length) {
        const rebuilt = shuffle(activePool)
          .slice(0, 20)
          .map((v) => buildQuestion(v, verbs));
        setQuestions(rebuilt);
        return 0;
      }
      return prev + 1;
    });
  };

  // Keyboard shortcuts: 1-4 for options, ? or 0 for IDK, Enter/Space for Next
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (!isAnswered) {
        if (e.key === "1") handleChooseOption(0);
        if (e.key === "2") handleChooseOption(1);
        if (e.key === "3") handleChooseOption(2);
        if (e.key === "4") handleChooseOption(3);
        if (e.key === "?" || e.key === "0") handleHonestlyDontKnow();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const clearHistory = async () => {
    try {
      const db = await getDatabase();
      await db.execute(`DELETE FROM quiz_history;`);
      setHistoryRows([]);
    } catch {
      // ignore
    }
  };

  const filteredHistory = useMemo(() => {
    if (historyFilter === "idk") {
      return historyRows.filter((r) => r.is_idk === 1);
    }
    if (historyFilter === "wrong") {
      return historyRows.filter((r) => r.is_correct === 0);
    }
    return historyRows;
  }, [historyRows, historyFilter]);

  const accuracyPct =
    answeredTotal === 0 ? 0 : Math.round((score / answeredTotal) * 100);

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-24 md:pb-10">
      {/* Top Quiz Mode, Session Length & Flagged IDK Controls */}
      <div className="p-4 rounded-3xl glass-card border border-border-glass space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Quiz Mode Selector */}
          <div className="flex items-center gap-1 p-1 rounded-xl glass-panel overflow-x-auto">
            {(
              [
                { id: "mixed", label: "Mixed" },
                { id: "reading", label: "Kanji → Furigana" },
                { id: "meaning", label: "Kanji → Meaning" },
                { id: "reverse", label: "Meaning → Kanji" },
              ] as Array<{ id: QuizMode; label: string }>
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setQuizMode(m.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  quizMode === m.id
                    ? "bg-accent text-white shadow-neon-glow"
                    : "text-primary-muted hover:text-primary"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Session Length Selector */}
          <div className="flex items-center gap-1 p-1 rounded-xl glass-panel">
            {([10, 20, 30, 40, "infinite"] as SessionLength[]).map((len) => (
              <button
                key={String(len)}
                type="button"
                onClick={() => setSessionLength(len)}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  sessionLength === len
                    ? "bg-accent text-white"
                    : "text-primary-muted hover:text-primary"
                }`}
              >
                {len === "infinite" ? "∞" : len}
              </button>
            ))}
          </div>
        </div>

        {/* Deck Source & Choice History Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDeckSource("pool")}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                deckSource === "pool"
                  ? "bg-accent/15 border-accent text-accent"
                  : "glass-panel border-border-glass text-primary-muted hover:text-primary"
              }`}
            >
              Active Deck ({activePool.length})
            </button>

            <button
              type="button"
              onClick={() => setDeckSource("flagged")}
              disabled={flaggedVerbIds.size === 0}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                deckSource === "flagged"
                  ? "bg-amber-500/20 border-amber-400 text-amber-300"
                  : "glass-panel border-border-glass text-primary-muted hover:text-primary disabled:opacity-40"
              }`}
            >
              🤷 Practice Flagged IDK ({flaggedVerbIds.size})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowHistoryDrawer((prev) => !prev)}
            className="flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl glass-panel border border-border-glass text-xs font-semibold text-primary hover:border-accent"
          >
            <History className="w-3.5 h-3.5 text-accent" />
            <span>Choice History ({historyRows.length})</span>
          </button>
        </div>

        {/* Real-Time Telemetry HUD */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 rounded-2xl glass-panel">
            <div className="text-[10px] uppercase text-primary-muted">Score</div>
            <div className="text-sm font-bold text-primary tabular-nums">
              {score}/{answeredTotal} ({accuracyPct}%)
            </div>
          </div>
          <div className="p-2 rounded-2xl glass-panel">
            <div className="text-[10px] uppercase text-primary-muted">Streak</div>
            <div className="text-sm font-bold text-emerald-400 tabular-nums">
              {streak} 🔥
            </div>
          </div>
          <div className="p-2 rounded-2xl glass-panel">
            <div className="text-[10px] uppercase text-primary-muted">
              Flagged IDK
            </div>
            <div className="text-sm font-bold text-amber-400 tabular-nums">
              {sessionIdkCount} 🤷
            </div>
          </div>
          <div className="p-2 rounded-2xl glass-panel">
            <div className="text-[10px] uppercase text-primary-muted">Question</div>
            <div className="text-sm font-bold text-accent tabular-nums">
              {answeredTotal} / {sessionLength === "infinite" ? "∞" : sessionLength}
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Choice & Flagged IDK History Panel */}
      {showHistoryDrawer && (
        <div className="p-4 rounded-3xl glass-card border border-border-glass space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: "all", label: `All (${historyRows.length})` },
                  {
                    id: "idk",
                    label: `🤷 Flagged IDK (${
                      historyRows.filter((r) => r.is_idk === 1).length
                    })`,
                  },
                  {
                    id: "wrong",
                    label: `Missed (${
                      historyRows.filter((r) => r.is_correct === 0).length
                    })`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHistoryFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                    historyFilter === tab.id
                      ? "bg-accent text-white"
                      : "glass-panel text-primary-muted hover:text-primary"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {historyRows.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {filteredHistory.length === 0 ? (
            <p className="text-xs text-primary-muted text-center py-4">
              No entries in this filter yet.
            </p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2">
              {filteredHistory.slice(0, 40).map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-2xl glass-panel border border-border-glass flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-jp font-bold text-sm text-primary">
                        {item.kanji_form}
                      </span>
                      <span className="font-jp text-accent">
                        （{item.furigana_reading}）
                      </span>
                      {item.is_idk === 1 ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">
                          🤷 Flagged IDK
                        </span>
                      ) : item.is_correct === 1 ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                          Correct
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[10px]">
                          Wrong
                        </span>
                      )}
                    </div>
                    <p className="text-primary-muted truncate">
                      Meaning: {item.correct_meaning} • Your pick:{" "}
                      <span className="text-primary">{item.chosen_label}</span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      speakJapanese(item.furigana_reading || item.kanji_form)
                    }
                    className="p-2 rounded-lg text-primary-muted hover:text-accent shrink-0"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Session Completed View */}
      {isSessionDone ? (
        <div className="p-8 rounded-3xl glass-card border border-border-glass text-center space-y-4">
          <Sparkles className="w-10 h-10 text-accent mx-auto" />
          <h3 className="text-xl font-bold text-primary">
            Kanji Quiz Session Complete!
          </h3>
          <p className="text-sm text-primary-muted">
            Score:{" "}
            <strong className="text-primary">
              {score} / {answeredTotal} ({accuracyPct}%)
            </strong>{" "}
            • Flagged IDK:{" "}
            <strong className="text-amber-400">{sessionIdkCount} 🤷</strong>
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setDeckSource("pool");
                startNewSession();
              }}
              className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-accent text-white text-xs font-semibold flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>New Session</span>
            </button>
            {flaggedVerbIds.size > 0 && (
              <button
                type="button"
                onClick={() => setDeckSource("flagged")}
                className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-semibold"
              >
                🤷 Drill {flaggedVerbIds.size} Flagged IDK Verbs
              </button>
            )}
          </div>
        </div>
      ) : (
        currentQ && (
          <div className="p-6 rounded-3xl glass-card border border-border-glass space-y-5">
            {/* Prompt Card */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-lg bg-accent/15 text-accent text-xs font-bold">
                  {currentQ.verb.jlpt_level}
                </span>
                <span className="px-2.5 py-0.5 rounded-lg glass-panel text-primary-muted text-xs font-semibold">
                  {currentQ.verb.verb_group}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  speakJapanese(
                    currentQ.verb.furigana_reading || currentQ.verb.kanji_form
                  )
                }
                className="flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl glass-panel border border-border-glass text-xs font-semibold text-primary hover:border-accent"
              >
                <Volume2 className="w-3.5 h-3.5 text-accent" />
                <span>Audio</span>
              </button>
            </div>

            <div className="text-center py-4 space-y-2">
              <div className="text-xs uppercase tracking-wider text-primary-muted font-semibold">
                {currentQ.mode === "reading"
                  ? "Select the correct Furigana reading"
                  : currentQ.mode === "meaning"
                  ? "Select the correct English meaning"
                  : "Select the matching Kanji verb"}
              </div>

              {currentQ.mode === "reverse" ? (
                <div className="space-y-1">
                  <div className="text-2xl sm:text-3xl font-bold text-primary">
                    {currentQ.verb.meanings.slice(0, 3).join(", ")}
                  </div>
                  {isAnswered && (
                    <div className="font-jp text-sm text-accent">
                      {currentQ.verb.furigana_reading}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {isAnswered && (
                    <div className="font-jp text-sm text-accent font-semibold">
                      {currentQ.verb.furigana_reading}
                    </div>
                  )}
                  <div className="font-jp text-4xl sm:text-5xl font-bold text-primary">
                    {currentQ.verb.kanji_form}
                  </div>
                </div>
              )}
            </div>

            {/* 4 Multiple-Choice Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentQ.options.map((opt, idx) => {
                const isCorrect = idx === currentQ.correctIndex;
                const isSelected = idx === selectedIdx;

                let btnClass =
                  "glass-panel border-border-glass hover:border-accent/60 text-primary";
                if (isAnswered) {
                  if (isCorrect) {
                    btnClass =
                      "bg-emerald-500/15 border-emerald-400 text-emerald-200";
                  } else if (isSelected) {
                    btnClass = "bg-rose-500/15 border-rose-400 text-rose-200";
                  } else {
                    btnClass =
                      "glass-panel border-border-glass opacity-55 text-primary-muted";
                  }
                }

                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isAnswered}
                    onClick={() => handleChooseOption(idx)}
                    className={`min-h-[58px] p-4 rounded-2xl border text-left flex items-center justify-between gap-2 transition-all ${btnClass}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-surface-hover text-xs font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        {currentQ.mode === "reading" && (
                          <div className="font-jp text-lg font-bold">
                            {opt.furigana_reading}
                          </div>
                        )}
                        {currentQ.mode === "meaning" && (
                          <div className="text-sm font-semibold line-clamp-2">
                            {opt.meanings.slice(0, 3).join(", ")}
                          </div>
                        )}
                        {currentQ.mode === "reverse" && (
                          <div>
                            <div className="font-jp text-xl font-bold">
                              {opt.kanji_form}
                            </div>
                            {isAnswered && (
                              <div className="font-jp text-xs text-accent">
                                {opt.furigana_reading}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {isAnswered && isCorrect && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    )}
                    {isAnswered && isSelected && !isCorrect && (
                      <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* 5th Option: "Honestly, I Don't Know" Anti-Gacha Flag */}
            {!isAnswered && (
              <button
                type="button"
                onClick={handleHonestlyDontKnow}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <Flag className="w-4 h-4" />
                <span>{idkButtonText}</span>
              </button>
            )}

            {/* Diagnostic Feedback Banner */}
            {isAnswered && (
              <div
                className={`p-4 rounded-2xl border space-y-2 ${
                  answeredAsIdk
                    ? "bg-amber-500/10 border-amber-400/40"
                    : selectedIdx === currentQ.correctIndex
                    ? "bg-emerald-500/10 border-emerald-400/40"
                    : "bg-rose-500/10 border-rose-400/40"
                }`}
              >
                {answeredAsIdk ? (
                  <p className="text-xs sm:text-sm font-semibold text-amber-300">
                    🤷 Flagged as "Honestly, I don't know" — added to your{" "}
                    <strong>Practice Flagged IDK</strong> deck so you can master
                    it instead of gambling!
                  </p>
                ) : selectedIdx === currentQ.correctIndex ? (
                  <p className="text-xs sm:text-sm font-semibold text-emerald-300">
                    Correct! FSRS mastery updated.
                  </p>
                ) : (
                  selectedIdx !== null && (
                    <p className="text-xs sm:text-sm text-rose-300">
                      You picked{" "}
                      <strong className="font-jp">
                        {currentQ.options[selectedIdx].kanji_form}（
                        {currentQ.options[selectedIdx].furigana_reading}）
                      </strong>{" "}
                      ={" "}
                      <strong>
                        "{currentQ.options[selectedIdx].meanings.slice(0, 2).join(", ")}"
                      </strong>
                      .
                    </p>
                  )
                )}

                <p className="text-xs text-primary">
                  <strong>Answer:</strong>{" "}
                  <span className="font-jp font-bold text-accent">
                    {currentQ.verb.kanji_form}（{currentQ.verb.furigana_reading}）
                  </span>{" "}
                  — {currentQ.verb.meanings.join("; ")}
                </p>

                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={handleNext}
                    className="min-h-[42px] px-5 py-2 rounded-xl bg-accent text-white text-xs font-semibold"
                  >
                    Next Question →
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};