import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Table2,
  BookOpen,
  HelpCircle,
  Volume2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RotateCcw,
  Trophy,
  Flame,
  ChevronDown,
  Sparkles,
  Info,
  Infinity as InfinityIcon,
  Search,
  Shuffle,
  Eye,
  EyeOff,
  Flag,
} from "lucide-react";
import {
  PARTICLES_ENCYCLOPEDIA,
  GRAMMAR_QUIZ_QUESTIONS,
  GrammarQuestion,
} from "../data/grammar_corpus";
import seedVerbs from "../data/seed_verbs.json";
import { conjugateVerb } from "../lib/conjugator";
import { getDatabase, Verb } from "../lib/db";
import { speakJapanese } from "../lib/audio";
import { AnnotatedJapaneseText } from "../lib/kanjiAnnotator";
import { cn } from "../lib/utils";

type GrammarSubTab = "tenses" | "particles" | "quiz";
type QuestionCountPreset = 10 | 20 | 30 | 40 | "infinite";
type FlagType = "idk" | "not_sure";

const KANJI_CHAR_RE = /[\u4e00-\u9faf\u3400-\u4dbf]/;

const IDK_BUTTON_VARIANTS = [
  "🤷 Honestly, I don't know (No Gacha)",
  "🫠 Brain empty — show me the answer",
  "🎲 Skip guessing — flag for review",
];

function renderConjugatedWithRuby(kanjiForm: string, furiganaForm: string): React.ReactNode {
  if (!KANJI_CHAR_RE.test(kanjiForm) || kanjiForm === furiganaForm) {
    return kanjiForm;
  }

  let kEnd = kanjiForm.length;
  let fEnd = furiganaForm.length;
  while (
    kEnd > 0 &&
    fEnd > 0 &&
    !KANJI_CHAR_RE.test(kanjiForm[kEnd - 1]) &&
    kanjiForm[kEnd - 1] === furiganaForm[fEnd - 1]
  ) {
    kEnd--;
    fEnd--;
  }

  let kStart = 0;
  let fStart = 0;
  while (
    kStart < kEnd &&
    fStart < fEnd &&
    !KANJI_CHAR_RE.test(kanjiForm[kStart]) &&
    kanjiForm[kStart] === furiganaForm[fStart]
  ) {
    kStart++;
    fStart++;
  }

  const prefix = kanjiForm.slice(0, kStart);
  const kanjiCore = kanjiForm.slice(kStart, kEnd);
  const rubyCore = furiganaForm.slice(fStart, fEnd);
  const suffix = kanjiForm.slice(kEnd);

  if (!kanjiCore || !rubyCore) return kanjiForm;

  return (
    <ruby>
      {prefix}
      {kanjiCore}
      <rt className="text-xs text-accent font-normal">{rubyCore}</rt>
      {suffix}
    </ruby>
  );
}

export const GrammarView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<GrammarSubTab>("tenses");

  const allCorpusVerbs = useMemo(() => seedVerbs as unknown as Verb[], []);

  // =========================================================================
  // Sub-tab 1: Verb Tense Matrix State (All 3,437 Verbs)
  // =========================================================================
  const [verbSearchQuery, setVerbSearchQuery] = useState<string>("");
  const [verbLevelFilter, setVerbLevelFilter] = useState<string>("All");
  const [selectedVerbId, setSelectedVerbId] = useState<number>(() => {
    const defaultVerb = (seedVerbs as unknown as Verb[]).find((v) => v.kanji_form === "食べる");
    return defaultVerb ? defaultVerb.id : (seedVerbs as unknown as Verb[])[0]?.id ?? 1;
  });

  const quickReferenceVerbs = useMemo(() => {
    const targets = ["食べる", "書く", "実装する", "行く", "来る"];
    return targets
      .map((k) => allCorpusVerbs.find((v) => v.kanji_form === k))
      .filter((v): v is Verb => Boolean(v));
  }, [allCorpusVerbs]);

  const filteredCorpusVerbs = useMemo(() => {
    const q = verbSearchQuery.trim().toLowerCase();
    return allCorpusVerbs.filter((v) => {
      if (verbLevelFilter !== "All" && v.jlpt_level !== verbLevelFilter) return false;
      if (!q) return true;
      return (
        v.kanji_form.toLowerCase().includes(q) ||
        v.furigana_reading.toLowerCase().includes(q) ||
        v.meanings.some((m) => m.toLowerCase().includes(q))
      );
    });
  }, [allCorpusVerbs, verbSearchQuery, verbLevelFilter]);

  const currentVerbModel = useMemo(
    () => allCorpusVerbs.find((v) => v.id === selectedVerbId) || allCorpusVerbs[0],
    [allCorpusVerbs, selectedVerbId]
  );

  const dynamicConjugations = useMemo(
    () => (currentVerbModel ? conjugateVerb(currentVerbModel) : []),
    [currentVerbModel]
  );

  const handlePickRandomVerb = () => {
    const pool = filteredCorpusVerbs.length > 0 ? filteredCorpusVerbs : allCorpusVerbs;
    if (pool.length === 0) return;
    const randomVerb = pool[Math.floor(Math.random() * pool.length)];
    setSelectedVerbId(randomVerb.id);
  };

  // =========================================================================
  // Sub-tab 2: Particles Encyclopedia State
  // =========================================================================
  const [particleLevelFilter, setParticleLevelFilter] = useState<string>("All");
  const [expandedParticleId, setExpandedParticleId] = useState<string | null>("wa");

  const filteredParticles = useMemo(() => {
    if (particleLevelFilter === "All") return PARTICLES_ENCYCLOPEDIA;
    return PARTICLES_ENCYCLOPEDIA.filter((p) => p.jlpt_level === particleLevelFilter);
  }, [particleLevelFilter]);

  // =========================================================================
  // Sub-tab 3: JLPT-Style Sentence Quiz + Separate "Not Sure" & "IDK" Flags
  // =========================================================================
  const [quizLevelFilter, setQuizLevelFilter] = useState<string>("All");
  const [quizCategoryFilter, setQuizCategoryFilter] = useState<string>("All");
  const [quizDeckScope, setQuizDeckScope] = useState<"all" | "flagged">("all");
  const [countPreset, setCountPreset] = useState<QuestionCountPreset>(10);
  const [showQuizFurigana, setShowQuizFurigana] = useState<boolean>(true);
  const [flaggedMap, setFlaggedMap] = useState<Record<string, FlagType>>({});

  const [questions, setQuestions] = useState<GrammarQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [isNotSureMarked, setIsNotSureMarked] = useState(false);
  const [answeredAsIdk, setAnsweredAsIdk] = useState(false);
  const [isAnswered, setIsAnswered] = useState(false);

  const [score, setScore] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [sessionNotSureCount, setSessionNotSureCount] = useState(0);
  const [sessionIdkCount, setSessionIdkCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  // Load persisted Flagged Grammar questions (both IDK and Not Sure) from SQLite
  useEffect(() => {
    (async () => {
      try {
        const db = await getDatabase();
        await db.execute(`
          CREATE TABLE IF NOT EXISTS grammar_flagged_idk (
            question_id TEXT PRIMARY KEY,
            flag_type TEXT NOT NULL DEFAULT 'idk',
            flagged_at TEXT NOT NULL
          );
        `);
        try {
          await db.execute(
            `ALTER TABLE grammar_flagged_idk ADD COLUMN flag_type TEXT NOT NULL DEFAULT 'idk';`
          );
        } catch {
          // column already exists
        }
        const rows = await db.select<Array<{ question_id: string; flag_type?: FlagType }>>(
          `SELECT question_id, flag_type FROM grammar_flagged_idk ORDER BY flagged_at DESC;`
        );
        if (rows) {
          const nextMap: Record<string, FlagType> = {};
          for (const r of rows) {
            nextMap[r.question_id] = r.flag_type || "idk";
          }
          setFlaggedMap(nextMap);
        }
      } catch (err) {
        console.warn("[GrammarView] Could not load flagged table:", err);
      }
    })();
  }, []);

  const persistFlag = async (questionId: string, flagType: FlagType) => {
    setFlaggedMap((prev) => ({ ...prev, [questionId]: flagType }));
    try {
      const db = await getDatabase();
      await db.execute(
        `INSERT OR REPLACE INTO grammar_flagged_idk (question_id, flag_type, flagged_at) VALUES (?, ?, ?);`,
        [questionId, flagType, new Date().toISOString()]
      );
    } catch (err) {
      console.warn("[GrammarView] Failed to persist flag:", err);
    }
  };

  const clearFlag = async (questionId: string) => {
    setFlaggedMap((prev) => {
      const copy = { ...prev };
      delete copy[questionId];
      return copy;
    });
    try {
      const db = await getDatabase();
      await db.execute(`DELETE FROM grammar_flagged_idk WHERE question_id = ?;`, [questionId]);
    } catch {
      // ignore
    }
  };

  const flaggedIds = useMemo(() => Object.keys(flaggedMap), [flaggedMap]);

  const generateQuiz = () => {
    let pool = [...GRAMMAR_QUIZ_QUESTIONS];
    if (quizLevelFilter !== "All") {
      pool = pool.filter((q) => q.jlpt_level === quizLevelFilter);
    }
    if (quizCategoryFilter !== "All") {
      pool = pool.filter((q) => q.targetCategory === quizCategoryFilter);
    }
    if (quizDeckScope === "flagged") {
      const flaggedPool = pool.filter((q) => Boolean(flaggedMap[q.id]));
      pool = flaggedPool.length > 0 ? flaggedPool : pool;
    }

    if (pool.length === 0) {
      pool = [...GRAMMAR_QUIZ_QUESTIONS];
    }

    pool.sort(() => Math.random() - 0.5);

    const targetCount = countPreset === "infinite" ? pool.length : Math.min(countPreset, pool.length);
    setQuestions(pool.slice(0, targetCount));
    setCurrentIndex(0);
    setSelectedOptionIndex(null);
    setIsNotSureMarked(false);
    setAnsweredAsIdk(false);
    setIsAnswered(false);
    setScore(0);
    setAnsweredCount(0);
    setSessionNotSureCount(0);
    setSessionIdkCount(0);
    setStreak(0);
    setMaxStreak(0);
    setIsFinished(false);
  };

  useEffect(() => {
    generateQuiz();
  }, [quizLevelFilter, quizCategoryFilter, quizDeckScope, countPreset]);

  const currentQ = questions[currentIndex];
  const idkButtonLabel = IDK_BUTTON_VARIANTS[currentIndex % IDK_BUTTON_VARIANTS.length];

  const handleSelectAnswer = (optIdx: number) => {
    if (isAnswered || !currentQ) return;
    setSelectedOptionIndex(optIdx);
    setAnsweredAsIdk(false);
    setIsAnswered(true);
    setAnsweredCount((c) => c + 1);

    if (isNotSureMarked) {
      setSessionNotSureCount((n) => n + 1);
      persistFlag(currentQ.id, "not_sure");
    }

    const chosen = currentQ.options[optIdx];
    const isCorrect = chosen.text === currentQ.correctAnswer;

    if (isCorrect) {
      setScore((s) => s + 1);
      setStreak((st) => {
        const next = st + 1;
        if (next > maxStreak) setMaxStreak(next);
        return next;
      });
      // Only clear previous flag if answered confidently without "Not Sure"
      if (!isNotSureMarked && flaggedMap[currentQ.id]) {
        clearFlag(currentQ.id);
      }
      speakJapanese(currentQ.sentencePre + chosen.text + currentQ.sentencePost);
    } else {
      setStreak(0);
      if (countPreset === "infinite") {
        setQuestions((prev) => {
          const next = [...prev];
          const insertIdx = Math.min(next.length, currentIndex + 4);
          next.splice(insertIdx, 0, currentQ);
          return next;
        });
      }
    }
  };

  const handleHonestlyDontKnow = () => {
    if (isAnswered || !currentQ) return;
    setSelectedOptionIndex(null);
    setIsNotSureMarked(false);
    setAnsweredAsIdk(true);
    setIsAnswered(true);
    setAnsweredCount((c) => c + 1);
    setSessionIdkCount((k) => k + 1);
    setStreak(0);
    persistFlag(currentQ.id, "idk");
    speakJapanese(currentQ.sentencePre + currentQ.correctAnswer + currentQ.sentencePost);

    if (countPreset === "infinite") {
      setQuestions((prev) => {
        const next = [...prev];
        const insertIdx = Math.min(next.length, currentIndex + 3);
        next.splice(insertIdx, 0, currentQ);
        return next;
      });
    }
  };

  const handleNextQuizQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedOptionIndex(null);
      setIsNotSureMarked(false);
      setAnsweredAsIdk(false);
      setIsAnswered(false);
    } else if (countPreset === "infinite") {
      generateQuiz();
    } else {
      setIsFinished(true);
    }
  };

  // Keyboard shortcuts: 1-4 answer, U toggle Not Sure, ?/0 IDK, Enter/Space Next
  useEffect(() => {
    if (activeSubTab !== "quiz") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (!currentQ || isFinished) return;

      if (!isAnswered) {
        if (["1", "2", "3", "4"].includes(e.key)) {
          const idx = Number(e.key) - 1;
          if (currentQ.options[idx]) {
            e.preventDefault();
            handleSelectAnswer(idx);
          }
        } else if (e.key.toLowerCase() === "u") {
          e.preventDefault();
          setIsNotSureMarked((prev) => !prev);
        } else if (e.key === "?" || e.key === "0") {
          e.preventDefault();
          handleHonestlyDontKnow();
        }
      } else if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        handleNextQuizQuestion();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const liveAccuracy = answeredCount > 0 ? Math.round((score / answeredCount) * 100) : 100;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6">
      {/* Top Grammar Navigation Pills */}
      <div className="flex items-center justify-center gap-2 p-1.5 mb-8 rounded-full glass-panel max-w-md mx-auto">
        {[
          { id: "tenses", label: "Tense Matrix", icon: Table2 },
          { id: "particles", label: "Particles Guide", icon: BookOpen },
          { id: "quiz", label: "Sentence Quiz", icon: HelpCircle },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as GrammarSubTab)}
              className={cn(
                "relative flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs font-semibold transition-all select-none",
                isActive ? "text-white shadow-neon-glow" : "text-primary-muted hover:text-primary"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="active-grammar-subpill"
                  className="absolute inset-0 rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon className="relative z-10 w-3.5 h-3.5" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          SUB-TAB 1: VERB TENSE & POLARITY TABLES (ALL 3,437 VERBS)
          ===================================================================== */}
      {activeSubTab === "tenses" && currentVerbModel && (
        <div className="space-y-6">
          <div className="glass-card p-4 rounded-2xl border border-border-glass space-y-3.5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-primary-muted absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={verbSearchQuery}
                  onChange={(e) => setVerbSearchQuery(e.target.value)}
                  placeholder={`Search all ${allCorpusVerbs.length.toLocaleString()} verbs by kanji, furigana, or English...`}
                  className="w-full min-h-[40px] pl-9 pr-3.5 py-2 rounded-xl glass-panel border border-border-glass text-primary text-xs focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="flex items-center gap-1 p-1 rounded-full glass-panel overflow-x-auto shrink-0">
                {["All", "N5", "N4", "N3", "N2", "N1"].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setVerbLevelFilter(lvl)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-semibold transition-all",
                      verbLevelFilter === lvl
                        ? "bg-accent text-white shadow-neon-glow"
                        : "text-primary-muted hover:text-primary"
                    )}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handlePickRandomVerb}
                className="min-h-[40px] px-3.5 py-2 rounded-xl glass-panel border border-border-glass hover:border-accent/50 text-xs font-semibold text-primary flex items-center justify-center gap-1.5 transition-all shrink-0"
              >
                <Shuffle className="w-3.5 h-3.5 text-accent" />
                <span>Random Verb</span>
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-[11px] font-semibold text-primary-muted uppercase tracking-wider shrink-0">
                {verbSearchQuery.trim() || verbLevelFilter !== "All"
                  ? `Matches (${filteredCorpusVerbs.length}):`
                  : "Select Verb:"}
              </span>

              {(verbSearchQuery.trim() || verbLevelFilter !== "All"
                ? filteredCorpusVerbs.slice(0, 20)
                : [...quickReferenceVerbs, ...allCorpusVerbs.slice(0, 16)]
                    .filter((v, idx, arr) => arr.findIndex((x) => x.id === v.id) === idx)
                    .slice(0, 20)
              ).map((verb) => (
                <button
                  key={verb.id}
                  onClick={() => setSelectedVerbId(verb.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border whitespace-nowrap shrink-0",
                    selectedVerbId === verb.id
                      ? "bg-accent text-white border-accent shadow-neon-glow"
                      : "glass-panel text-primary-muted hover:text-primary border-border-glass"
                  )}
                >
                  <span className="font-jp">{verb.kanji_form}</span>{" "}
                  <span className="opacity-75">({verb.furigana_reading})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-[var(--card-radius)] border border-border-glass overflow-hidden shadow-glass">
            <div className="p-4 border-b border-border-glass flex flex-wrap items-center justify-between gap-2 bg-surface-card">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => speakJapanese(currentVerbModel.furigana_reading)}
                  title="Pronounce dictionary form"
                  className="p-2 rounded-xl glass-panel hover:bg-surface-hover text-accent transition-transform active:scale-95"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                <div>
                  <h3 className="text-sm font-bold text-primary flex items-center gap-2 flex-wrap">
                    <span>Conjugation Matrix:</span>
                    <span className="font-jp text-lg text-accent">
                      {currentVerbModel.kanji_form}
                    </span>
                    <span className="text-xs font-normal text-primary-muted">
                      ({currentVerbModel.furigana_reading})
                    </span>
                  </h3>
                  <p className="text-xs text-primary-muted">
                    Meaning: <strong>&ldquo;{currentVerbModel.meanings.slice(0, 3).join(", ")}&rdquo;</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-0.5 rounded-md glass-panel text-accent font-semibold uppercase">
                  {currentVerbModel.jlpt_level}
                </span>
                <span className="px-2.5 py-0.5 rounded-md glass-panel text-primary font-semibold">
                  {currentVerbModel.verb_group}
                </span>
              </div>
            </div>

            <div className="divide-y divide-border-subtle overflow-x-auto">
              {dynamicConjugations.map((row, idx) => (
                <div
                  key={idx}
                  className="p-4 hover:bg-surface-hover/30 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="min-w-[220px]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary">{row.tense}</span>
                      <span
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-semibold",
                          row.register === "Polite"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-accent/15 text-accent"
                        )}
                      >
                        {row.register}
                      </span>
                    </div>
                    <span className="inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] glass-panel text-accent font-mono">
                      Rule: {row.ruleNote}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 min-w-[220px]">
                    <button
                      type="button"
                      onClick={() => speakJapanese(row.furiganaForm)}
                      title="Pronounce conjugated form"
                      className="p-2 rounded-xl glass-panel hover:bg-surface-hover text-accent transition-transform active:scale-95 shrink-0"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                    <div>
                      <h4 className="font-jp text-xl font-bold text-primary">
                        {renderConjugatedWithRuby(row.kanjiForm, row.furiganaForm)}
                      </h4>
                      <span className="text-xs text-primary-muted font-jp">
                        【{row.furiganaForm}】
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 2: PARTICLES ENCYCLOPEDIA
          ===================================================================== */}
      {activeSubTab === "particles" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 glass-card p-3 rounded-2xl border border-border-glass">
            <span className="text-xs font-semibold text-primary-muted px-2">Filter by JLPT:</span>
            <div className="flex items-center gap-1.5 p-1 rounded-full glass-panel overflow-x-auto">
              {["All", "N5", "N4", "N3", "N2"].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setParticleLevelFilter(lvl)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-semibold transition-all",
                    particleLevelFilter === lvl
                      ? "bg-accent text-white shadow-neon-glow"
                      : "text-primary-muted hover:text-primary"
                  )}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredParticles.map((item) => {
              const isExpanded = expandedParticleId === item.id;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "glass-card p-5 rounded-2xl border border-border-glass transition-all duration-200 flex flex-col justify-between",
                    isExpanded && "border-accent/40 shadow-neon-glow"
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-[3.25rem] px-3 h-12 rounded-2xl bg-accent/20 border border-accent/40 inline-flex items-center justify-center whitespace-nowrap shrink-0 font-jp text-lg sm:text-xl font-black text-accent shadow-sm">
                          {item.particle}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">
                            {item.jlpt_level}
                          </span>
                          <h4 className="text-sm font-bold text-primary mt-1">{item.role}</h4>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedParticleId(isExpanded ? null : item.id)
                        }
                        className="p-1.5 rounded-xl glass-panel text-primary-muted hover:text-primary transition-colors shrink-0"
                      >
                        <ChevronDown
                          className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-180")}
                        />
                      </button>
                    </div>

                    <div className="p-3 rounded-xl glass-panel text-xs text-primary-muted mb-3 leading-relaxed">
                      <div className="flex items-center gap-1 font-semibold text-primary mb-1">
                        <Info className="w-3.5 h-3.5 text-accent" />
                        <span>Usage & Nuance:</span>
                      </div>
                      <p>{item.nuanceAndContrast}</p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border-subtle">
                    <span className="text-[10px] uppercase font-bold text-primary-muted tracking-wider block">
                      Authentic Sentence Examples
                    </span>
                    {item.examples.map((ex, exIdx) => (
                      <div key={exIdx} className="p-2.5 rounded-xl glass-panel text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-jp text-sm text-primary font-medium">
                            <ruby>
                              {ex.sentenceRuby.map((seg, sIdx) => (
                                <React.Fragment key={sIdx}>
                                  {seg.base}
                                  {seg.ruby && <rt className="text-[9px] text-accent">{seg.ruby}</rt>}
                                </React.Fragment>
                              ))}
                            </ruby>
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              speakJapanese(
                                ex.sentenceRuby.map((s) => s.ruby || s.base).join("")
                              )
                            }
                            title="Listen to example sentence"
                            className="text-primary-muted hover:text-accent p-1.5 rounded-lg hover:bg-surface-hover shrink-0"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-[11px] text-primary-muted italic">&ldquo;{ex.english}&rdquo;</p>
                        <p className="text-[10px] text-accent font-medium">{ex.focusExplanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 3: JLPT-STYLE SENTENCE QUIZ (NOT SURE FLAG + IDK FLAG)
          ===================================================================== */}
      {activeSubTab === "quiz" && (
        <div className="w-full max-w-2xl mx-auto space-y-4">
          <div className="flex flex-col gap-2.5 glass-card p-3 rounded-2xl border border-border-glass text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 p-1 rounded-full glass-panel">
                {["All", "particle", "conjugation", "slang"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setQuizCategoryFilter(cat)}
                    className={cn(
                      "px-2.5 py-1 rounded-full capitalize font-semibold transition-all",
                      quizCategoryFilter === cat
                        ? "bg-accent text-white shadow-neon-glow"
                        : "text-primary-muted hover:text-primary"
                    )}
                  >
                    {cat === "All" ? "All Grammar" : cat}
                  </button>
                ))}
              </div>

              {/* Deck Scope: All vs Flagged (Not Sure + IDK) */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setQuizDeckScope("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-full font-semibold border transition-all",
                    quizDeckScope === "all"
                      ? "bg-accent/15 border-accent text-accent"
                      : "glass-panel border-border-glass text-primary-muted hover:text-primary"
                  )}
                >
                  All Deck
                </button>
                <button
                  type="button"
                  disabled={flaggedIds.length === 0}
                  onClick={() => setQuizDeckScope("flagged")}
                  className={cn(
                    "px-2.5 py-1 rounded-full font-semibold border transition-all",
                    quizDeckScope === "flagged"
                      ? "bg-amber-500/20 border-amber-400 text-amber-300"
                      : "glass-panel border-border-glass text-primary-muted hover:text-primary disabled:opacity-40"
                  )}
                >
                  🚩 Flagged Review ({flaggedIds.length})
                </button>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-full glass-panel font-semibold">
                {([10, 20, 30, 40, "infinite"] as QuestionCountPreset[]).map((preset) => (
                  <button
                    key={String(preset)}
                    onClick={() => setCountPreset(preset)}
                    className={cn(
                      "px-2.5 py-1 rounded-full transition-all flex items-center justify-center",
                      countPreset === preset
                        ? "bg-accent text-white shadow-neon-glow"
                        : "text-primary-muted hover:text-primary"
                    )}
                  >
                    {preset === "infinite" ? <InfinityIcon className="w-3.5 h-3.5" /> : preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 p-1 rounded-full glass-panel overflow-x-auto">
                <span className="text-[10px] font-semibold text-primary-muted px-2">Level:</span>
                {["All", "N5", "N4", "N3", "N2", "N1"].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setQuizLevelFilter(lvl)}
                    className={cn(
                      "px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all",
                      quizLevelFilter === lvl
                        ? "bg-accent text-white shadow-neon-glow"
                        : "text-primary-muted hover:text-primary"
                    )}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowQuizFurigana((prev) => !prev)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5",
                  showQuizFurigana
                    ? "bg-accent/15 border-accent text-accent"
                    : "glass-panel border-border-glass text-primary-muted hover:text-primary"
                )}
              >
                {showQuizFurigana ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                <span>Furigana: {showQuizFurigana ? "ON" : "OFF"}</span>
              </button>
            </div>
          </div>

          {/* Real-Time Score, Not Sure, IDK & Streak HUD */}
          <div className="glass-panel p-3 rounded-2xl border border-border-glass flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-primary font-semibold">
                Score: <strong className="text-accent">{score}</strong> / {answeredCount} ({liveAccuracy}%)
              </span>
              {sessionNotSureCount > 0 && (
                <span className="text-sky-300 font-semibold bg-sky-500/10 px-2 py-0.5 rounded-lg border border-sky-500/30">
                  🤔 {sessionNotSureCount} Not Sure
                </span>
              )}
              {sessionIdkCount > 0 && (
                <span className="text-amber-300 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/30">
                  🤷 {sessionIdkCount} IDK
                </span>
              )}
              {streak > 1 && (
                <span className="flex items-center gap-1 text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/30">
                  <Flame className="w-3.5 h-3.5 fill-amber-400" />
                  <span>{streak} Streak</span>
                </span>
              )}
            </div>

            <span className="font-mono text-primary-muted">
              Question {currentIndex + 1} / {countPreset === "infinite" ? "∞" : questions.length}
            </span>
          </div>

          {/* Finish Screen */}
          {isFinished ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card p-8 rounded-[var(--card-radius)] border border-border-glass text-center shadow-glass"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center mb-4 text-accent shadow-neon-glow">
                <Trophy className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-primary mb-1">Grammar Exam Completed!</h3>
              <p className="text-xs text-primary-muted mb-6">
                {sessionNotSureCount} marked 🤔 Not Sure • {sessionIdkCount} flagged 🤷 Honestly IDK
              </p>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="p-3 rounded-xl glass-panel">
                  <span className="text-[10px] text-primary-muted block">Score</span>
                  <span className="text-xl font-bold text-accent">{score} / {answeredCount}</span>
                </div>
                <div className="p-3 rounded-xl glass-panel">
                  <span className="text-[10px] text-primary-muted block">Accuracy</span>
                  <span className="text-xl font-bold text-emerald-400">{liveAccuracy}%</span>
                </div>
                <div className="p-3 rounded-xl glass-panel">
                  <span className="text-[10px] text-primary-muted block">Best Streak</span>
                  <span className="text-xl font-bold text-amber-400">{maxStreak}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setQuizDeckScope("all");
                    generateQuiz();
                  }}
                  className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-neon-glow"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Retake Grammar Quiz</span>
                </button>

                {flaggedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuizDeckScope("flagged")}
                    className="px-5 py-2.5 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-semibold"
                  >
                    🚩 Review {flaggedIds.length} Flagged Items
                  </button>
                )}
              </div>
            </motion.div>
          ) : currentQ ? (
            /* Question Fill-In-The-Blank Card */
            <div className="glass-card p-6 md:p-8 rounded-[var(--card-radius)] border border-border-glass shadow-glass space-y-6">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-accent/20 text-accent">
                    {currentQ.jlpt_level}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium glass-panel text-primary-muted capitalize">
                    {currentQ.targetCategory} Quiz
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      speakJapanese(
                        `${currentQ.sentencePre}${
                          isAnswered ? currentQ.correctAnswer : "、"
                        }${currentQ.sentencePost}`
                      )
                    }
                    title="Listen to sentence"
                    className="p-1.5 rounded-full glass-panel text-primary-muted hover:text-accent transition-colors"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Separate "Not Sure" Confidence Toggle Pill */}
                  {!isAnswered && (
                    <button
                      type="button"
                      onClick={() => setIsNotSureMarked((prev) => !prev)}
                      aria-pressed={isNotSureMarked}
                      title="Label your choice from the 4 options as Not Sure (Shortcut: U)"
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-semibold border transition-all flex items-center gap-1",
                        isNotSureMarked
                          ? "bg-sky-500/20 border-sky-400 text-sky-200"
                          : "glass-panel border-border-glass text-primary-muted hover:text-sky-300 hover:border-sky-400/50"
                      )}
                    >
                      <span>{isNotSureMarked ? "🤔 Marked: Not Sure" : "🤔 Not Sure?"}</span>
                    </button>
                  )}
                </div>

                {!isAnswered && isNotSureMarked && (
                  <p className="text-[11px] text-sky-300 font-medium mb-2">
                    🤔 Not Sure flag active — pick from the 4 choices below to test your hunch and flag it for review.
                  </p>
                )}

                <p className="text-[11px] text-primary-muted mb-3">
                  Hover or tap any underlined kanji for English meaning
                </p>

                <h3 className="font-jp text-2xl md:text-3xl font-bold text-primary leading-relaxed">
                  <span>
                    <AnnotatedJapaneseText
                      text={currentQ.sentencePre}
                      showFurigana={showQuizFurigana}
                    />
                  </span>
                  <span className="mx-2 px-3 py-1 rounded-xl bg-accent/20 border border-accent/40 text-accent inline-block min-w-[60px] text-center align-baseline">
                    {isAnswered ? (
                      <AnnotatedJapaneseText
                        text={currentQ.correctAnswer}
                        showFurigana={showQuizFurigana}
                      />
                    ) : (
                      "（   ）"
                    )}
                  </span>
                  <span>
                    <AnnotatedJapaneseText
                      text={currentQ.sentencePost}
                      showFurigana={showQuizFurigana}
                    />
                  </span>
                </h3>

                <p className="text-xs text-primary-muted mt-3 italic">
                  &ldquo;{currentQ.sentenceTranslation}&rdquo;
                </p>
              </div>

              {/* 4 Fill-in Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentQ.options.map((opt, idx) => {
                  let stateClass = isNotSureMarked
                    ? "glass-panel border-sky-400/35 hover:border-sky-400 text-primary"
                    : "glass-panel hover:bg-surface-hover text-primary border-border-glass";
                  if (isAnswered) {
                    if (opt.text === currentQ.correctAnswer) {
                      stateClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-sm";
                    } else if (idx === selectedOptionIndex) {
                      stateClass = "bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-sm";
                    } else {
                      stateClass = "opacity-40 border-transparent";
                    }
                  }

                  return (
                    <div
                      key={idx}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectAnswer(idx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSelectAnswer(idx);
                      }}
                      className={cn(
                        "min-h-[var(--touch-target-min)] flex items-center justify-between p-4 rounded-xl text-left font-medium text-sm transition-all border cursor-pointer",
                        stateClass
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg glass-panel flex items-center justify-center text-xs font-bold text-primary-muted shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-jp text-base font-semibold">
                          <AnnotatedJapaneseText
                            text={opt.text}
                            showFurigana={showQuizFurigana}
                          />
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            speakJapanese(opt.text);
                          }}
                          title="Pronounce option"
                          className="p-1.5 rounded-lg text-primary-muted hover:text-accent hover:bg-surface-hover"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                        {isAnswered && opt.text === currentQ.correctAnswer && (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        )}
                        {isAnswered && idx === selectedOptionIndex && opt.text !== currentQ.correctAnswer && (
                          <XCircle className="w-5 h-5 text-rose-400" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 5th Anti-Gacha Action: "Honestly, I Don't Know" */}
              {!isAnswered && (
                <button
                  type="button"
                  onClick={handleHonestlyDontKnow}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>{idkButtonLabel}</span>
                </button>
              )}

              {/* Diagnostic Breakdown */}
              <AnimatePresence>
                {isAnswered && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pt-4 border-t border-border-glass space-y-3"
                  >
                    {answeredAsIdk && (
                      <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-400/40 text-xs text-amber-200 font-semibold">
                        🤷 Flagged as "Honestly, I don't know" — saved to your Flagged Review deck without counting a lucky random guess!
                      </div>
                    )}

                    {!answeredAsIdk && isNotSureMarked && (
                      <div className="p-3 rounded-xl bg-sky-500/15 border border-sky-400/40 text-xs text-sky-200 font-semibold">
                        🤔 Labeled as "Not Sure" — saved to your Flagged Review deck so you can drill this grammar pattern again!
                      </div>
                    )}

                    <div className="p-3.5 rounded-xl glass-panel border border-border-glass text-xs space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-accent">
                        <Sparkles className="w-4 h-4" />
                        <span>Grammar Rule Breakdown:</span>
                      </div>
                      <p className="text-primary font-medium">{currentQ.ruleSummary}</p>

                      <div className="space-y-1.5 pt-2 border-t border-border-subtle">
                        {currentQ.options.map((opt, oIdx) => (
                          <div key={oIdx} className="text-[11px] leading-relaxed">
                            <strong className="font-jp text-primary">{opt.text}:</strong>{" "}
                            <span
                              className={cn(
                                opt.text === currentQ.correctAnswer ? "text-emerald-300" : "text-primary-muted"
                              )}
                            >
                              {opt.explanation}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-end">
                      <button
                        onClick={handleNextQuizQuestion}
                        className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-transform active:scale-95 shadow-neon-glow"
                      >
                        <span>
                          {currentIndex < questions.length - 1 || countPreset === "infinite"
                            ? "Next Question"
                            : "Finish Exam"}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};