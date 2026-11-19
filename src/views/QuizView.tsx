import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  Flag,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
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

interface SessionQuestionRecord {
  question: QuizQuestion;
  selectedOptionId: string | null;
  isNotSureMarked: boolean;
  answeredAsIdk: boolean;
}

export interface QuizHistoryEntry {
  id: string;
  verb_id: number;
  kanji_form: string;
  furigana_reading: string;
  correct_meaning: string;
  jlpt_level: string;
  quiz_mode: string;
  is_correct: number;
  is_idk?: number;
  is_not_sure?: number;
  selected_label: string;
  selected_kanji: string;
  selected_furigana: string;
  selected_meaning: string;
  correct_label: string;
  answered_at: string;
}

const JLPT_LEVELS: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

const IDK_BUTTON_VARIANTS = [
  "🤷 Honestly, I don't know (No Gacha)",
  "🫠 Brain empty — show me the answer",
  "🎲 Skip guessing — flag for review",
];

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

function createQuestionFromPool(
  pool: Verb[],
  excludeIds: Set<number>,
  modeSetting: QuizMode,
  currentProgressMap: Map<number, VerbProgress> | Record<number, VerbProgress> | undefined
): QuizQuestion | null {
  if (pool.length < 4) return null;

  const remaining = pool.filter((v) => !excludeIds.has(v.id));
  const sourcePool = remaining.length > 0 ? remaining : pool;

  const weighted = [...sourcePool].sort((a, b) => {
    const pa = getProgressEntry(currentProgressMap, a.id);
    const pb = getProgressEntry(currentProgressMap, b.id);
    const sa = pa ? (pa.reading_score + pa.meaning_score) / 2 : 0;
    const sb = pb ? (pb.reading_score + pb.meaning_score) / 2 : 0;
    return sa - sb + (Math.random() - 0.5) * 0.85;
  });

  const targetVerb = weighted[0];
  const effectiveMode: Exclude<QuizMode, "mixed"> =
    modeSetting === "mixed"
      ? (["kanji_to_meaning", "kanji_to_reading", "meaning_to_kanji"] as const)[
          Math.floor(Math.random() * 3)
        ]
      : modeSetting;

  const targetMeaning = targetVerb.meanings.slice(0, 3).join(", ");

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
    id: `q_${Date.now()}_${targetVerb.id}_${Math.random().toString(36).slice(2, 5)}`,
    mode: effectiveMode,
    targetVerb,
    options,
  };
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

  // Keep parent props in refs so parent updates NEVER trigger a session reset
  const progressMapRef = useRef(progressMap);
  progressMapRef.current = progressMap;

  const verbsRef = useRef(verbs);
  verbsRef.current = verbs;

  const callbacksRef = useRef({
    onUpdateProgress,
    onRecordProgress,
    onProgressUpdate,
  });
  callbacksRef.current = {
    onUpdateProgress,
    onRecordProgress,
    onProgressUpdate,
  };

  const getFilteredPool = useCallback((levels: JlptLevel[]) => {
    const currentVerbs = verbsRef.current || [];
    if (currentVerbs.length === 0) return [];
    if (levels.length > 0) {
      const filtered = currentVerbs.filter((v) => levels.includes(v.jlpt_level));
      if (filtered.length >= 4) return filtered;
    }
    return currentVerbs;
  }, []);

  // Build initial question once on mount — NO reactive useEffect watching restartSession!
  const [sessionRecords, setSessionRecords] = useState<SessionQuestionRecord[]>(() => {
    const initialPool = verbs && verbs.length >= 4 ? verbs : [];
    const first = createQuestionFromPool(
      initialPool,
      new Set<number>(),
      "kanji_to_meaning",
      progressMap
    );
    return first
      ? [
          {
            question: first,
            selectedOptionId: null,
            isNotSureMarked: false,
            answeredAsIdk: false,
          },
        ]
      : [];
  });

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [questionsAnswered, setQuestionsAnswered] = useState<number>(0);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [notSureCount, setNotSureCount] = useState<number>(0);
  const [idkCount, setIdkCount] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [bestStreak, setBestStreak] = useState<number>(0);
  const [usedVerbIds, setUsedVerbIds] = useState<Set<number>>(() => {
    const s = new Set<number>();
    if (sessionRecords[0]) {
      s.add(sessionRecords[0].question.targetVerb.id);
    }
    return s;
  });

  // Populate only if `verbs` loaded asynchronously after mount while sessionRecords is still empty
  useEffect(() => {
    if (sessionRecords.length === 0 && verbs && verbs.length >= 4) {
      const pool = getFilteredPool(selectedLevels);
      const first = createQuestionFromPool(
        pool,
        new Set<number>(),
        quizMode,
        progressMapRef.current
      );
      if (first) {
        setSessionRecords([
          {
            question: first,
            selectedOptionId: null,
            isNotSureMarked: false,
            answeredAsIdk: false,
          },
        ]);
        setUsedVerbIds(new Set([first.targetVerb.id]));
        setActiveIndex(0);
      }
    }
  }, [verbs, sessionRecords.length, getFilteredPool, selectedLevels, quizMode]);

  const [history, setHistory] = useState<QuizHistoryEntry[]>([]);
  const [historyFilter, setHistoryFilter] = useState<
    "all" | "wrong" | "not_sure" | "idk" | "correct"
  >("all");

  const activeRecord = sessionRecords[activeIndex] || null;
  const currentQuestion = activeRecord?.question || null;
  const selectedOptionId = activeRecord?.selectedOptionId ?? null;
  const isNotSureMarked = activeRecord?.isNotSureMarked ?? false;
  const answeredAsIdk = activeRecord?.answeredAsIdk ?? false;
  const isCurrentAnswered = selectedOptionId !== null || answeredAsIdk;

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
          is_idk INTEGER NOT NULL DEFAULT 0,
          is_not_sure INTEGER NOT NULL DEFAULT 0,
          selected_label TEXT NOT NULL,
          selected_kanji TEXT NOT NULL,
          selected_furigana TEXT NOT NULL,
          selected_meaning TEXT NOT NULL,
          correct_label TEXT NOT NULL,
          answered_at TEXT NOT NULL
        );
      `);
      for (const col of [
        `ALTER TABLE quiz_history ADD COLUMN is_idk INTEGER NOT NULL DEFAULT 0;`,
        `ALTER TABLE quiz_history ADD COLUMN is_not_sure INTEGER NOT NULL DEFAULT 0;`,
      ]) {
        try {
          await db.execute(col);
        } catch {
          // column exists
        }
      }
      const rows = await db.select<QuizHistoryEntry[]>(
        `SELECT * FROM quiz_history ORDER BY answered_at DESC LIMIT 250;`
      );
      setHistory(rows || []);
    } catch (err) {
      console.warn("[QuizView] Failed to load history:", err);
    }
  }, []);

  useEffect(() => {
    loadQuizHistory();
  }, [loadQuizHistory]);

  // Explicit session starter — ONLY runs when user clicks JLPT Level, Quiz Mode, or Restart
  const startNewSessionWith = useCallback(
    (nextLevels: JlptLevel[], nextMode: QuizMode) => {
      const emptySet = new Set<number>();
      setQuestionsAnswered(0);
      setCorrectCount(0);
      setNotSureCount(0);
      setIdkCount(0);
      setStreak(0);
      const pool = getFilteredPool(nextLevels);
      const first = createQuestionFromPool(
        pool,
        emptySet,
        nextMode,
        progressMapRef.current
      );
      if (first) {
        emptySet.add(first.targetVerb.id);
        setSessionRecords([
          {
            question: first,
            selectedOptionId: null,
            isNotSureMarked: false,
            answeredAsIdk: false,
          },
        ]);
      } else {
        setSessionRecords([]);
      }
      setActiveIndex(0);
      setUsedVerbIds(emptySet);
    },
    [getFilteredPool]
  );

  const handleToggleLevel = (lvl: JlptLevel) => {
    const nextLevels = selectedLevels.includes(lvl)
      ? selectedLevels.filter((x) => x !== lvl)
      : [...selectedLevels, lvl];
    setSelectedLevels(nextLevels);
    startNewSessionWith(nextLevels, quizMode);
  };

  const handleClearLevels = () => {
    setSelectedLevels([]);
    startNewSessionWith([], quizMode);
  };

  const handleChangeQuizMode = (nextMode: QuizMode) => {
    setQuizMode(nextMode);
    startNewSessionWith(selectedLevels, nextMode);
  };

  const setCurrentNotSure = (updater: boolean | ((prev: boolean) => boolean)) => {
    setSessionRecords((prev) =>
      prev.map((rec, idx) => {
        if (idx !== activeIndex || rec.selectedOptionId !== null || rec.answeredAsIdk) {
          return rec;
        }
        const nextVal =
          typeof updater === "function" ? updater(rec.isNotSureMarked) : updater;
        return { ...rec, isNotSureMarked: nextVal };
      })
    );
  };

  const recordAttempt = async (
    target: Verb,
    mode: Exclude<QuizMode, "mixed">,
    isRight: boolean,
    isIdk: boolean,
    isNotSure: boolean,
    pickedOption: QuizOption | null,
    correctOpt: QuizOption
  ) => {
    const nowIso = new Date().toISOString();

    const historyRow: QuizHistoryEntry = {
      id: `qh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      verb_id: target.id,
      kanji_form: target.kanji_form,
      furigana_reading: target.furigana_reading,
      correct_meaning: target.meanings.slice(0, 3).join(", "),
      jlpt_level: target.jlpt_level,
      quiz_mode: mode,
      is_correct: isRight ? 1 : 0,
      is_idk: isIdk ? 1 : 0,
      is_not_sure: isNotSure ? 1 : 0,
      selected_label: isIdk
        ? "🤷 Honestly, I don't know"
        : pickedOption?.label || "",
      selected_kanji: isIdk ? target.kanji_form : pickedOption?.kanji || "",
      selected_furigana: isIdk ? target.furigana_reading : pickedOption?.furigana || "",
      selected_meaning: isIdk
        ? "Flagged honestly without guessing"
        : pickedOption?.meaning || "",
      correct_label: correctOpt.label,
      answered_at: nowIso,
    };

    setHistory((prev) => [historyRow, ...prev]);

    try {
      const db = await getDatabase();
      await db.execute(
        `INSERT INTO quiz_history (
          id, verb_id, kanji_form, furigana_reading, correct_meaning, jlpt_level,
          quiz_mode, is_correct, is_idk, is_not_sure, selected_label, selected_kanji,
          selected_furigana, selected_meaning, correct_label, answered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          historyRow.id,
          historyRow.verb_id,
          historyRow.kanji_form,
          historyRow.furigana_reading,
          historyRow.correct_meaning,
          historyRow.jlpt_level,
          historyRow.quiz_mode,
          historyRow.is_correct,
          historyRow.is_idk ?? 0,
          historyRow.is_not_sure ?? 0,
          historyRow.selected_label,
          historyRow.selected_kanji,
          historyRow.selected_furigana,
          historyRow.selected_meaning,
          historyRow.correct_label,
          historyRow.answered_at,
        ]
      );

      const existing = getProgressEntry(progressMapRef.current, target.id);
      const prevReading = existing?.reading_score ?? 0;
      const prevMeaning = existing?.meaning_score ?? 0;
      const prevStability = existing?.stability_days ?? 1.0;
      const prevReps = existing?.repetitions ?? 0;
      const prevLapses = existing?.lapses ?? 0;

      const rightGain = isNotSure ? 0.1 : 0.22;
      const isReadingTest = mode === "kanji_to_reading";
      const nextReading = isReadingTest
        ? isRight
          ? Math.min(1, prevReading + rightGain)
          : Math.max(0, prevReading - 0.15)
        : isRight
          ? Math.min(1, prevReading + 0.06)
          : prevReading;

      const nextMeaning = !isReadingTest
        ? isRight
          ? Math.min(1, prevMeaning + rightGain)
          : Math.max(0, prevMeaning - 0.15)
        : isRight
          ? Math.min(1, prevMeaning + 0.06)
          : prevMeaning;

      const nextStability = isRight
        ? isNotSure
          ? Math.min(180, prevStability * 1.15 + 0.2)
          : Math.min(180, prevStability * 1.65 + 0.5)
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

      callbacksRef.current.onUpdateProgress?.(updatedProgress);
      callbacksRef.current.onRecordProgress?.(updatedProgress);
      callbacksRef.current.onProgressUpdate?.(updatedProgress);
    } catch (err) {
      console.warn("[QuizView] Error saving progress/history:", err);
    }
  };

  // Locks the selected answer on screen — NEVER advances until user clicks Next Question
  const handleSelectOption = async (option: QuizOption) => {
    if (!currentQuestion || isCurrentAnswered) return;

    const currentNotSure = isNotSureMarked;
    setSessionRecords((prev) =>
      prev.map((rec, idx) =>
        idx === activeIndex ? { ...rec, selectedOptionId: option.id } : rec
      )
    );

    const isRight = option.isCorrect;
    const nextAnswered = questionsAnswered + 1;
    const nextCorrect = isRight ? correctCount + 1 : correctCount;
    const nextStreak = isRight ? streak + 1 : 0;

    setQuestionsAnswered(nextAnswered);
    setCorrectCount(nextCorrect);
    if (currentNotSure) {
      setNotSureCount((n) => n + 1);
    }
    setStreak(nextStreak);
    if (nextStreak > bestStreak) {
      setBestStreak(nextStreak);
    }

    const correctOpt =
      currentQuestion.options.find((o) => o.isCorrect) || option;
    await recordAttempt(
      currentQuestion.targetVerb,
      currentQuestion.mode,
      isRight,
      false,
      currentNotSure,
      option,
      correctOpt
    );
  };

  // Locks IDK state on screen — NEVER advances until user clicks Next Question
  const handleHonestlyDontKnow = async () => {
    if (!currentQuestion || isCurrentAnswered) return;

    const correctOpt = currentQuestion.options.find((o) => o.isCorrect);
    if (!correctOpt) return;

    setSessionRecords((prev) =>
      prev.map((rec, idx) =>
        idx === activeIndex
          ? { ...rec, answeredAsIdk: true, isNotSureMarked: false }
          : rec
      )
    );

    setQuestionsAnswered((q) => q + 1);
    setIdkCount((k) => k + 1);
    setStreak(0);
    speakJapanese(
      currentQuestion.targetVerb.furigana_reading ||
        currentQuestion.targetVerb.kanji_form
    );

    await recordAttempt(
      currentQuestion.targetVerb,
      currentQuestion.mode,
      false,
      true,
      false,
      null,
      correctOpt
    );
  };

  const handlePreviousQuestion = useCallback(() => {
    if (activeIndex > 0) {
      setActiveIndex((prev) => prev - 1);
    }
  }, [activeIndex]);

  const handleNextQuestion = useCallback(() => {
    if (activeIndex < sessionRecords.length - 1) {
      setActiveIndex((prev) => prev + 1);
      return;
    }

    if (!isCurrentAnswered) return;
    if (sessionLength > 0 && questionsAnswered >= sessionLength) return;

    const nextUsed = new Set(usedVerbIds);
    const pool = getFilteredPool(selectedLevels);
    const nextQ = createQuestionFromPool(
      pool,
      nextUsed,
      quizMode,
      progressMapRef.current
    );
    if (nextQ) {
      nextUsed.add(nextQ.targetVerb.id);
      setSessionRecords((prev) => [
        ...prev,
        {
          question: nextQ,
          selectedOptionId: null,
          isNotSureMarked: false,
          answeredAsIdk: false,
        },
      ]);
      setActiveIndex(sessionRecords.length);
    }
    setUsedVerbIds(nextUsed);
  }, [
    activeIndex,
    sessionRecords.length,
    isCurrentAnswered,
    sessionLength,
    questionsAnswered,
    usedVerbIds,
    getFilteredPool,
    selectedLevels,
    quizMode,
  ]);

  useEffect(() => {
    if (subView !== "quiz") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLButtonElement
      ) {
        return;
      }
      if (!currentQuestion) return;

      if (!isCurrentAnswered) {
        if (["1", "2", "3", "4"].includes(e.key)) {
          const idx = Number(e.key) - 1;
          const opt = currentQuestion.options[idx];
          if (opt) {
            e.preventDefault();
            handleSelectOption(opt);
          }
        } else if (e.key.toLowerCase() === "u") {
          e.preventDefault();
          setCurrentNotSure((prev) => !prev);
        } else if (e.key === "?" || e.key === "0") {
          e.preventDefault();
          handleHonestlyDontKnow();
        } else if (e.key === "ArrowLeft" && activeIndex > 0) {
          e.preventDefault();
          handlePreviousQuestion();
        }
      } else {
        if (e.key === "ArrowLeft" && activeIndex > 0) {
          e.preventDefault();
          handlePreviousQuestion();
        } else if (e.key === "Enter" || e.key === "ArrowRight") {
          e.preventDefault();
          handleNextQuestion();
        }
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
    () => history.filter((h) => h.is_correct === 0 && (h.is_idk ?? 0) === 0).length,
    [history]
  );

  const notSureHistoryCount = useMemo(
    () => history.filter((h) => (h.is_not_sure ?? 0) === 1).length,
    [history]
  );

  const idkHistoryCount = useMemo(
    () => history.filter((h) => (h.is_idk ?? 0) === 1).length,
    [history]
  );

  const filteredHistory = useMemo(() => {
    if (historyFilter === "wrong") {
      return history.filter((h) => h.is_correct === 0 && (h.is_idk ?? 0) === 0);
    }
    if (historyFilter === "not_sure") {
      return history.filter((h) => (h.is_not_sure ?? 0) === 1);
    }
    if (historyFilter === "idk") {
      return history.filter((h) => (h.is_idk ?? 0) === 1);
    }
    if (historyFilter === "correct") {
      return history.filter((h) => h.is_correct === 1 && (h.is_not_sure ?? 0) === 0);
    }
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

  const isReviewingPrevious = activeIndex < sessionRecords.length - 1;
  const isSessionComplete =
    sessionLength > 0 &&
    questionsAnswered >= sessionLength &&
    isCurrentAnswered &&
    !isReviewingPrevious;

  const accuracyPct =
    questionsAnswered === 0
      ? 0
      : Math.round((correctCount / questionsAnswered) * 100);

  const idkButtonLabel = IDK_BUTTON_VARIANTS[activeIndex % IDK_BUTTON_VARIANTS.length];

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-24 md:pb-10">
      {/* Top Mode & Sub-View Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-3xl glass-card border border-border-glass">
        <div className="flex items-center gap-2 flex-wrap">
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
            {notSureHistoryCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-sky-500/20 text-sky-300 font-bold tabular-nums">
                🤔 {notSureHistoryCount}
              </span>
            )}
            {idkHistoryCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-amber-500/20 text-amber-300 font-bold tabular-nums">
                🤷 {idkHistoryCount}
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
              <div className="flex items-center gap-1.5 p-1 rounded-full glass-panel overflow-x-auto">
                <span className="text-[11px] font-semibold text-primary-muted px-2">
                  JLPT:
                </span>
                <button
                  type="button"
                  onClick={handleClearLevels}
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
                      onClick={() => handleToggleLevel(lvl)}
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
                    onClick={() => handleChangeQuizMode(m.id)}
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

              <div className="flex items-center gap-3 tabular-nums flex-wrap">
                <span className="font-semibold text-primary">
                  Score:{" "}
                  <span className="text-emerald-400">
                    {correctCount}/{questionsAnswered}
                  </span>{" "}
                  ({accuracyPct}%)
                </span>
                {notSureCount > 0 && (
                  <span className="font-semibold text-sky-300">
                    🤔 {notSureCount} Not Sure
                  </span>
                )}
                {idkCount > 0 && (
                  <span className="font-semibold text-amber-300">
                    🤷 {idkCount} IDK
                  </span>
                )}
                <span className="flex items-center gap-1 font-semibold text-amber-400">
                  <Flame className="w-3.5 h-3.5" />
                  Streak: {streak}
                </span>
                <button
                  type="button"
                  onClick={() => startNewSessionWith(selectedLevels, quizMode)}
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
              {/* Card Metadata, Step Counter, Not Sure Flag & Listen Button */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg bg-accent/15 text-accent text-xs font-bold">
                    {currentQuestion.targetVerb.jlpt_level}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg glass-panel text-primary-muted text-xs font-medium">
                    {currentQuestion.targetVerb.verb_group}
                  </span>
                  <span className="text-xs text-primary-muted tabular-nums font-medium">
                    Question {activeIndex + 1}
                    {sessionLength > 0 ? ` / ${sessionLength}` : ` of ${sessionRecords.length}`}
                  </span>
                  {isReviewingPrevious && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-[11px] font-semibold">
                      Reviewing Answered Question
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!isCurrentAnswered && (
                    <button
                      type="button"
                      onClick={() => setCurrentNotSure((prev) => !prev)}
                      aria-pressed={isNotSureMarked}
                      title="Mark this answer as an educated guess before choosing from the 4 options (Shortcut: U)"
                      className={`flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                        isNotSureMarked
                          ? "border-sky-400 bg-sky-500/20 text-sky-200 shadow-sm"
                          : "glass-panel border-border-glass text-primary-muted hover:text-sky-300 hover:border-sky-400/50"
                      }`}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>
                        {isNotSureMarked ? "🤔 Marked: Not Sure" : "🤔 Not Sure?"}
                      </span>
                    </button>
                  )}

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
              </div>

              {/* Active "Not Sure" Banner above options */}
              {!isCurrentAnswered && isNotSureMarked && (
                <div className="px-3.5 py-2 rounded-xl bg-sky-500/15 border border-sky-400/40 text-xs text-sky-200 flex items-center justify-between gap-2">
                  <span>
                    🤔 <strong>Not Sure flag active:</strong> Pick your best guess from the 4 choices below — it will be tagged as an uncertain attempt for review.
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentNotSure(false)}
                    className="text-[11px] underline text-sky-300 shrink-0"
                  >
                    Clear
                  </button>
                </div>
              )}

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
                        ? showFurigana && isCurrentAnswered
                        : showFurigana
                    )}
                  </div>
                )}
              </div>

              {/* 4 Multiple Choice Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentQuestion.options.map((opt, idx) => {
                  const isPicked = selectedOptionId === opt.id;

                  let styleClass = isNotSureMarked
                    ? "glass-panel border-sky-400/35 hover:border-sky-400 text-primary"
                    : "glass-panel border-border-glass hover:border-accent/60 text-primary";
                  if (isCurrentAnswered) {
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
                      disabled={isCurrentAnswered}
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

                      {isCurrentAnswered && opt.isCorrect && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      )}
                      {isCurrentAnswered && isPicked && !opt.isCorrect && (
                        <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 5th Anti-Gacha Option: "Honestly, I Don't Know" */}
              {!isCurrentAnswered && (
                <button
                  type="button"
                  onClick={handleHonestlyDontKnow}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  <Flag className="w-4 h-4" />
                  <span>{idkButtonLabel}</span>
                </button>
              )}

              {/* Instant Detailed Feedback Card — Stays visible until you click Next Question */}
              {isCurrentAnswered && correctOption && (
                <div
                  className={`p-4 rounded-2xl border space-y-2.5 ${
                    answeredAsIdk
                      ? "border-amber-500/40 bg-amber-500/10"
                      : isNotSureMarked
                        ? "border-sky-500/40 bg-sky-500/10"
                        : selectedOption?.isCorrect
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-rose-500/40 bg-rose-500/10"
                  }`}
                >
                  {answeredAsIdk ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                        <Flag className="w-4 h-4" />
                        <span>
                          🤷 Flagged as "Honestly, I don't know" — saved for honest FSRS review!
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs sm:text-sm space-y-1">
                        <p className="text-emerald-400 font-semibold">
                          Right answer: "{correctOption.label}"
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
                  ) : selectedOption?.isCorrect ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap font-bold text-sm">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Correct!</span>
                        </span>
                        {isNotSureMarked && (
                          <span className="px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300 text-xs font-semibold">
                            🤔 Flagged as Not Sure (Scheduled sooner to reinforce)
                          </span>
                        )}
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
                  ) : selectedOption ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap text-rose-400 font-bold text-sm">
                        <XCircle className="w-4 h-4" />
                        <span>Incorrect — Here is the breakdown:</span>
                        {isNotSureMarked && (
                          <span className="px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300 text-xs font-semibold">
                            🤔 Marked Not Sure
                          </span>
                        )}
                      </div>

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
                  ) : null}

                  {/* Step-by-step Previous / Next Review Controls */}
                  {isSessionComplete ? (
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border-glass">
                      <div className="flex items-center gap-2 text-sm font-bold text-primary">
                        <Award className="w-5 h-5 text-amber-400" />
                        <span>
                          Session Complete! Score: {correctCount}/{questionsAnswered} ({accuracyPct}%)
                          • 🤔 Not Sure: {notSureCount} • 🤷 IDK: {idkCount}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeIndex > 0 && (
                          <button
                            type="button"
                            onClick={handlePreviousQuestion}
                            className="min-h-[42px] px-4 py-2 rounded-xl glass-panel border border-border-glass text-primary font-semibold text-xs flex items-center gap-1 hover:border-accent/60"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            <span>Previous</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startNewSessionWith(selectedLevels, quizMode)}
                          className="min-h-[42px] px-5 py-2 rounded-xl bg-accent text-white font-semibold text-xs hover:opacity-95 shadow-neon-glow"
                        >
                          Start New Session
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 flex items-center justify-between gap-2 border-t border-border-glass">
                      <button
                        type="button"
                        disabled={activeIndex === 0}
                        onClick={handlePreviousQuestion}
                        className="min-h-[42px] px-4 py-2 rounded-xl glass-panel border border-border-glass text-primary font-semibold text-xs flex items-center gap-1.5 hover:border-accent/60 disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Previous Question</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleNextQuestion}
                        className="min-h-[42px] px-5 py-2 rounded-xl bg-accent text-white font-semibold text-xs flex items-center gap-1.5 hover:opacity-95 shadow-neon-glow"
                      >
                        <span>
                          {isReviewingPrevious ? "Next Reviewed" : "Next Question"}
                        </span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Allow stepping back to review answered questions even while viewing an unanswered one */}
              {!isCurrentAnswered && activeIndex > 0 && (
                <div className="pt-1 flex justify-start">
                  <button
                    type="button"
                    onClick={handlePreviousQuestion}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl glass-panel border border-border-glass text-primary-muted hover:text-primary font-semibold text-xs flex items-center gap-1.5"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Review Previous Question (#{activeIndex})</span>
                  </button>
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
                <span>Quiz Choice, Not Sure & Mistake Review History</span>
              </h3>
              <p className="text-xs text-primary-muted">
                Review confident answers, uncertain 🤔 Not Sure guesses, wrong choices, and 🤷 IDK flags
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex p-1 rounded-xl glass-panel text-xs flex-wrap">
                {(
                  [
                    { id: "all", label: `All (${history.length})` },
                    { id: "not_sure", label: `🤔 Not Sure (${notSureHistoryCount})` },
                    { id: "wrong", label: `Wrong (${wrongHistoryCount})` },
                    { id: "idk", label: `🤷 IDK (${idkHistoryCount})` },
                    {
                      id: "correct",
                      label: `Confident Right (${
                        history.filter(
                          (h) => h.is_correct === 1 && (h.is_not_sure ?? 0) === 0
                        ).length
                      })`,
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
              No quiz history entries in this filter yet.
            </div>
          ) : (
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {filteredHistory.map((item) => {
                const isRight = item.is_correct === 1;
                const isIdk = (item.is_idk ?? 0) === 1;
                const isNotSure = (item.is_not_sure ?? 0) === 1;
                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border space-y-2.5 ${
                      isNotSure
                        ? "glass-panel border-sky-500/35"
                        : isRight
                          ? "glass-panel border-emerald-500/30"
                          : isIdk
                            ? "glass-panel border-amber-500/35"
                            : "glass-panel border-rose-500/35"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isRight ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Right
                          </span>
                        ) : isIdk ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-xs font-bold">
                            <Flag className="w-3.5 h-3.5" />
                            🤷 Flagged IDK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-xs font-bold">
                            <XCircle className="w-3.5 h-3.5" />
                            Wrong
                          </span>
                        )}

                        {isNotSure && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 text-xs font-bold">
                            🤔 Not Sure
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

                    {isRight ? (
                      <p className="text-xs text-primary">
                        You selected{" "}
                        <strong className="text-emerald-400">
                          "{item.selected_label}"
                        </strong>{" "}
                        — Meaning: <strong>"{item.correct_meaning}"</strong>
                      </p>
                    ) : isIdk ? (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs space-y-0.5">
                        <div className="font-bold text-amber-300">
                          🤷 Flagged honestly without guessing — Right Answer: "{item.correct_label}"
                        </div>
                        <div className="text-primary">
                          Meaning of{" "}
                          <span className="font-jp font-bold">
                            {item.kanji_form}（{item.furigana_reading}）
                          </span>
                          :{" "}
                          <strong className="text-emerald-300">
                            "{item.correct_meaning}"
                          </strong>
                        </div>
                      </div>
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