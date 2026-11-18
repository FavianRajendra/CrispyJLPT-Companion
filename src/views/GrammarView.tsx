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
} from "lucide-react";
import {
  SAMPLE_VERBS,
  PARTICLES_ENCYCLOPEDIA,
  GRAMMAR_QUIZ_QUESTIONS,
  GrammarQuestion,
} from "../data/grammar_corpus";
import { speakJapanese } from "../lib/audio";
import { cn } from "../lib/utils";

type GrammarSubTab = "tenses" | "particles" | "quiz";
type QuestionCountPreset = 10 | 20 | 30 | 40 | "infinite";

export const GrammarView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<GrammarSubTab>("tenses");

  // Sub-tab 1: Tenses state
  const [selectedVerbId, setSelectedVerbId] = useState<string>("taberu");
  const currentVerbModel = useMemo(
    () => SAMPLE_VERBS.find((v) => v.id === selectedVerbId) || SAMPLE_VERBS[0],
    [selectedVerbId]
  );

  // Sub-tab 2: Particles state
  const [particleLevelFilter, setParticleLevelFilter] = useState<string>("All");
  const [expandedParticleId, setExpandedParticleId] = useState<string | null>("wa");

  const filteredParticles = useMemo(() => {
    if (particleLevelFilter === "All") return PARTICLES_ENCYCLOPEDIA;
    return PARTICLES_ENCYCLOPEDIA.filter((p) => p.jlpt_level === particleLevelFilter);
  }, [particleLevelFilter]);

  // Sub-tab 3: Sentence Quiz state
  const [quizLevelFilter, setQuizLevelFilter] = useState<string>("All");
  const [quizCategoryFilter, setQuizCategoryFilter] = useState<string>("All");
  const [countPreset, setCountPreset] = useState<QuestionCountPreset>(10);

  const [questions, setQuestions] = useState<GrammarQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  // Initialize or re-generate quiz questions
  const generateQuiz = () => {
    let pool = [...GRAMMAR_QUIZ_QUESTIONS];
    if (quizLevelFilter !== "All") {
      pool = pool.filter((q) => q.jlpt_level === quizLevelFilter);
    }
    if (quizCategoryFilter !== "All") {
      pool = pool.filter((q) => q.targetCategory === quizCategoryFilter);
    }

    if (pool.length === 0) {
      pool = [...GRAMMAR_QUIZ_QUESTIONS];
    }

    pool.sort(() => Math.random() - 0.5);

    const targetCount = countPreset === "infinite" ? pool.length : Math.min(countPreset, pool.length);
    setQuestions(pool.slice(0, targetCount));
    setCurrentIndex(0);
    setSelectedOptionIndex(null);
    setIsAnswered(false);
    setScore(0);
    setAnsweredCount(0);
    setStreak(0);
    setMaxStreak(0);
    setIsFinished(false);
  };

  useEffect(() => {
    generateQuiz();
  }, [quizLevelFilter, quizCategoryFilter, countPreset]);

  const currentQ = questions[currentIndex];

  const handleSelectAnswer = (optIdx: number) => {
    if (isAnswered || !currentQ) return;
    setSelectedOptionIndex(optIdx);
    setIsAnswered(true);
    setAnsweredCount((c) => c + 1);

    const chosen = currentQ.options[optIdx];
    const isCorrect = chosen.text === currentQ.correctAnswer;

    if (isCorrect) {
      setScore((s) => s + 1);
      setStreak((st) => {
        const next = st + 1;
        if (next > maxStreak) setMaxStreak(next);
        return next;
      });
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

  const handleNextQuizQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedOptionIndex(null);
      setIsAnswered(false);
    } else if (countPreset === "infinite") {
      generateQuiz();
    } else {
      setIsFinished(true);
    }
  };

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
          SUB-TAB 1: VERB TENSE & POLARITY TABLES
          ===================================================================== */}
      {activeSubTab === "tenses" && (
        <div className="space-y-6">
          {/* Verb Switcher Bar */}
          <div className="glass-card p-4 rounded-2xl border border-border-glass flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-primary-muted uppercase tracking-wider">
                Sample Verb:
              </span>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_VERBS.map((verb) => (
                  <button
                    key={verb.id}
                    onClick={() => setSelectedVerbId(verb.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border",
                      selectedVerbId === verb.id
                        ? "bg-accent text-white border-accent shadow-neon-glow"
                        : "glass-panel text-primary-muted hover:text-primary border-border-glass"
                    )}
                  >
                    <span className="font-jp">{verb.kanji}</span>{" "}
                    <span className="opacity-75">({verb.group})</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-primary-muted">
              <span className="px-2 py-0.5 rounded-md glass-panel text-accent font-semibold uppercase">
                {currentVerbModel.level}
              </span>
              <span>Meaning: <strong>&ldquo;{currentVerbModel.meaning}&rdquo;</strong></span>
            </div>
          </div>

          {/* Structured Conjugation Matrix */}
          <div className="glass-card rounded-[var(--card-radius)] border border-border-glass overflow-hidden shadow-glass">
            <div className="p-4 border-b border-border-glass flex items-center justify-between bg-surface-card">
              <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                <Table2 className="w-4 h-4 text-accent" />
                <span>
                  Conjugation Matrix: <span className="font-jp text-accent">{currentVerbModel.kanji}</span> (
                  {currentVerbModel.reading})
                </span>
              </h3>
              <span className="text-xs text-primary-muted">
                10 Conjugated Tenses & Polarity Patterns
              </span>
            </div>

            <div className="divide-y divide-border-subtle overflow-x-auto">
              {currentVerbModel.conjugations.map((row, idx) => (
                <div
                  key={idx}
                  className="p-4 hover:bg-surface-hover/30 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                >
                  {/* Tense Label & Rule */}
                  <div className="min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary">{row.tenseName}</span>
                    </div>
                    <span className="text-[11px] text-primary-muted block">{row.tenseEnglish}</span>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] glass-panel text-accent font-mono">
                      Rule: {row.formationRule}
                    </span>
                  </div>

                  {/* Conjugated Form with Ruby Furigana */}
                  <div className="flex items-center gap-3 min-w-[180px]">
                    <button
                      onClick={() => speakJapanese(row.furiganaReading)}
                      title="Pronounce"
                      className="p-2 rounded-xl glass-panel hover:bg-surface-hover text-accent transition-transform active:scale-95"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                    <div>
                      <h4 className="font-jp text-xl font-bold text-primary">
                        <ruby>
                          {row.rubySegments.map((seg, sIdx) => (
                            <React.Fragment key={sIdx}>
                              {seg.base}
                              {seg.ruby && <rt className="text-xs text-accent">{seg.ruby}</rt>}
                            </React.Fragment>
                          ))}
                        </ruby>
                      </h4>
                      <span className="text-xs text-primary-muted font-jp">
                        【{row.furiganaReading}】
                      </span>
                    </div>
                  </div>

                  {/* Annotated Example Sentence */}
                  <div className="flex-1 p-2.5 rounded-xl glass-panel border border-border-glass text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase font-bold text-primary-muted tracking-wider">
                        Example Context
                      </span>
                      <button
                        onClick={() =>
                          speakJapanese(
                            row.exampleSentence.japaneseWithRuby
                              .map((s) => s.ruby || s.base)
                              .join("")
                          )
                        }
                        className="text-primary-muted hover:text-accent p-0.5"
                      >
                        <Volume2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="font-jp text-sm text-primary mb-0.5">
                      <ruby>
                        {row.exampleSentence.japaneseWithRuby.map((seg, sIdx) => (
                          <React.Fragment key={sIdx}>
                            {seg.base}
                            {seg.ruby && <rt className="text-[9px] text-accent">{seg.ruby}</rt>}
                          </React.Fragment>
                        ))}
                      </ruby>
                    </p>
                    <p className="text-primary-muted text-[11px] italic">
                      &ldquo;{row.exampleSentence.english}&rdquo;
                    </p>
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
          {/* Level Filter Bar */}
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

          {/* Particles Grid */}
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
                    {/* Header: Particle Character & Role */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center font-jp text-2xl font-black text-accent shadow-sm">
                          {item.particle}
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">
                            {item.jlpt_level}
                          </span>
                          <h4 className="text-sm font-bold text-primary mt-1">{item.role}</h4>
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          setExpandedParticleId(isExpanded ? null : item.id)
                        }
                        className="p-1.5 rounded-xl glass-panel text-primary-muted hover:text-primary transition-colors"
                      >
                        <ChevronDown
                          className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-180")}
                        />
                      </button>
                    </div>

                    {/* Nuance & Contrast Explanation */}
                    <div className="p-3 rounded-xl glass-panel text-xs text-primary-muted mb-3 leading-relaxed">
                      <div className="flex items-center gap-1 font-semibold text-primary mb-1">
                        <Info className="w-3.5 h-3.5 text-accent" />
                        <span>Usage & Nuance:</span>
                      </div>
                      <p>{item.nuanceAndContrast}</p>
                    </div>
                  </div>

                  {/* Annotated Examples */}
                  <div className="space-y-2 pt-2 border-t border-border-subtle">
                    <span className="text-[10px] uppercase font-bold text-primary-muted tracking-wider block">
                      Authentic Sentence Examples
                    </span>
                    {item.examples.map((ex, exIdx) => (
                      <div key={exIdx} className="p-2.5 rounded-xl glass-panel text-xs space-y-1">
                        <div className="flex items-center justify-between">
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
                            onClick={() =>
                              speakJapanese(
                                ex.sentenceRuby.map((s) => s.ruby || s.base).join("")
                              )
                            }
                            className="text-primary-muted hover:text-accent p-1"
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
          SUB-TAB 3: JLPT-STYLE SENTENCE FILL-IN-THE-BLANK QUIZ
          ===================================================================== */}
      {activeSubTab === "quiz" && (
        <div className="w-full max-w-2xl mx-auto space-y-4">
          {/* Quiz Filters & Presets Bar */}
          <div className="flex flex-col gap-2.5 glass-card p-3 rounded-2xl border border-border-glass text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Category Filter */}
              <div className="flex items-center gap-1.5 p-1 rounded-full glass-panel">
                {["All", "particle", "conjugation"].map((cat) => (
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

              {/* Presets */}
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

            {/* JLPT Level Filter for Grammar Quiz */}
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
          </div>

          {/* Real-Time Score & Streak HUD */}
          <div className="glass-panel p-3 rounded-2xl border border-border-glass flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="font-mono text-primary font-semibold">
                Score: <strong className="text-accent">{score}</strong> / {answeredCount} ({liveAccuracy}%)
              </span>
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
                Sentence fill-in-the-blank assessment evaluated.
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

              <button
                onClick={generateQuiz}
                className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center justify-center gap-2 mx-auto transition-transform active:scale-95 shadow-neon-glow"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Retake Grammar Quiz</span>
              </button>
            </motion.div>
          ) : currentQ ? (
            /* Question Fill-In-The-Blank Card */
            <div className="glass-card p-6 md:p-8 rounded-[var(--card-radius)] border border-border-glass shadow-glass space-y-6">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-accent/20 text-accent">
                    {currentQ.jlpt_level}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium glass-panel text-primary-muted capitalize">
                    {currentQ.targetCategory} Quiz
                  </span>
                </div>

                {/* Sentence with Blank */}
                <h3 className="font-jp text-2xl md:text-3xl font-bold text-primary leading-relaxed">
                  <span>{currentQ.sentencePre}</span>
                  <span className="mx-2 px-3 py-1 rounded-xl bg-accent/20 border border-accent/40 text-accent inline-block min-w-[60px] text-center">
                    {isAnswered ? currentQ.correctAnswer : "（   ）"}
                  </span>
                  <span>{currentQ.sentencePost}</span>
                </h3>

                <p className="text-xs text-primary-muted mt-3 italic">
                  &ldquo;{currentQ.sentenceTranslation}&rdquo;
                </p>
              </div>

              {/* 4 Fill-in Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentQ.options.map((opt, idx) => {
                  let stateClass = "glass-panel hover:bg-surface-hover text-primary border-border-glass";
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
                    <button
                      key={idx}
                      disabled={isAnswered}
                      onClick={() => handleSelectAnswer(idx)}
                      className={cn(
                        "min-h-[var(--touch-target-min)] flex items-center justify-between p-4 rounded-xl text-left font-medium text-sm transition-all border active:scale-98",
                        stateClass
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg glass-panel flex items-center justify-center text-xs font-bold text-primary-muted">
                          {idx + 1}
                        </span>
                        <span className="font-jp text-base font-semibold">{opt.text}</span>
                      </div>

                      {isAnswered && opt.text === currentQ.correctAnswer && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 ml-2" />
                      )}
                      {isAnswered && idx === selectedOptionIndex && opt.text !== currentQ.correctAnswer && (
                        <XCircle className="w-5 h-5 text-rose-400 shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Diagnostic Breakdown */}
              <AnimatePresence>
                {isAnswered && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pt-4 border-t border-border-glass space-y-3"
                  >
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
