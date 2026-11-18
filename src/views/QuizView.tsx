import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RotateCcw,
  Trophy,
  Flame,
  Volume2,
  BookOpen,
  Sparkles,
  HelpCircle,
  Briefcase,
  AlertTriangle,
  Infinity as InfinityIcon,
} from "lucide-react";
import { VerbWithProgress, updateFsrsProgress, saveVerbProgress } from "../lib/mastery";
import { UserProfile, IndustryTrack } from "../lib/db";
import { speakJapanese } from "../lib/audio";
import { cn } from "../lib/utils";

interface QuizViewProps {
  verbs: VerbWithProgress[];
  profile: UserProfile;
  onVerbUpdated: () => void;
}

export type QuizMode = "weakness" | "reading" | "meaning" | "reverse";
export type QuestionCountPreset = 10 | 20 | 30 | 40 | "infinite";

interface QuizOption {
  text: string;
  sourceVerb: VerbWithProgress;
}

interface Question {
  verb: VerbWithProgress;
  mode: "reading" | "meaning" | "reverse";
  prompt: string;
  subPrompt?: string;
  options: QuizOption[];
  correctIndex: number;
}

const ALL_INDUSTRY_TRACKS: { id: IndustryTrack; label: string; short: string }[] = [
  { id: "it", label: "IT & Tech", short: "IT" },
  { id: "finance", label: "Finance", short: "Finance" },
  { id: "fnb", label: "Food & Beverage", short: "F&B" },
  { id: "healthcare", label: "Healthcare", short: "Health" },
  { id: "manufacturing", label: "Manufacturing", short: "Mfg" },
  { id: "general", label: "General", short: "General" },
];

export const QuizView: React.FC<QuizViewProps> = ({ verbs, profile, onVerbUpdated }) => {
  const [selectedMode, setSelectedMode] = useState<QuizMode>("weakness");
  const [selectedJlpt, setSelectedJlpt] = useState<string>("All");
  const [selectedTracks, setSelectedTracks] = useState<IndustryTrack[]>(() =>
    Array.isArray(profile.target_industries) ? profile.target_industries : []
  );
  const [countPreset, setCountPreset] = useState<QuestionCountPreset>(10);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const toggleTrack = (trackId: IndustryTrack) => {
    setSelectedTracks((prev) =>
      prev.includes(trackId) ? prev.filter((t) => t !== trackId) : [...prev, trackId]
    );
  };

  // Build filtered candidate pool based on JLPT & Tracks
  const filteredPool = React.useMemo(() => {
    let pool = [...verbs];
    if (selectedJlpt !== "All") {
      pool = pool.filter((v) => v.jlpt_level === selectedJlpt);
    }

    if (selectedTracks.length === 0) {
      pool = pool.filter((v) => v.is_core_jlpt === 1);
    } else {
      pool = pool.filter(
        (v) => v.is_core_jlpt === 1 || v.industry_tags.some((t) => selectedTracks.includes(t))
      );
    }

    return pool;
  }, [verbs, selectedJlpt, selectedTracks]);

  // Generate Questions for the chosen quiz mode and count
  const generateQuiz = useCallback(() => {
    if (filteredPool.length < 4) return;

    let pool = [...filteredPool];
    if (selectedMode === "weakness") {
      pool.sort((a, b) => {
        const aTargetMatch = a.jlpt_level === profile.target_jlpt ? 1 : 0;
        const bTargetMatch = b.jlpt_level === profile.target_jlpt ? 1 : 0;
        if (aTargetMatch !== bTargetMatch) return bTargetMatch - aTargetMatch;
        return a.masteryScore - b.masteryScore;
      });
    } else {
      pool.sort(() => Math.random() - 0.5);
    }

    const totalQuestions =
      countPreset === "infinite" ? Math.min(50, pool.length) : Math.min(countPreset, pool.length);
    const chosenVerbs = pool.slice(0, totalQuestions);

    const generated: Question[] = chosenVerbs.map((target) => {
      let mode: "reading" | "meaning" | "reverse";
      if (selectedMode === "weakness") {
        mode = Math.random() > 0.5 ? "reading" : "meaning";
      } else {
        mode = selectedMode;
      }

      // Pick 3 distractors from verbs
      const distractors = verbs.filter((v) => v.id !== target.id);
      distractors.sort(() => Math.random() - 0.5);
      const chosenDistractors = distractors.slice(0, 3);

      let prompt = "";
      let subPrompt: string | undefined = undefined;

      const rawOptions: QuizOption[] = [
        {
          text:
            mode === "reading"
              ? target.furigana_reading
              : mode === "meaning"
              ? target.meanings[0]
              : target.kanji_form,
          sourceVerb: target,
        },
        ...chosenDistractors.map((d) => ({
          text:
            mode === "reading"
              ? d.furigana_reading
              : mode === "meaning"
              ? d.meanings[0]
              : d.kanji_form,
          sourceVerb: d,
        })),
      ];

      if (mode === "reading") {
        prompt = target.kanji_form;
        subPrompt = "Select the correct Furigana reading";
      } else if (mode === "meaning") {
        prompt = target.kanji_form;
        subPrompt = `[${target.furigana_reading}] Select the English meaning`;
      } else {
        prompt = target.meanings.slice(0, 2).join("; ");
        subPrompt = `[Reading: ${target.furigana_reading}] Which Kanji matches this meaning?`;
      }

      // Shuffle options while tracking correct option
      const correctOption = rawOptions[0];
      const shuffled = [...rawOptions].sort(() => Math.random() - 0.5);
      const correctIndex = shuffled.indexOf(correctOption);

      return {
        verb: target,
        mode,
        prompt,
        subPrompt,
        options: shuffled,
        correctIndex,
      };
    });

    setQuestions(generated);
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setAnsweredCount(0);
    setStreak(0);
    setMaxStreak(0);
    setIsFinished(false);
  }, [filteredPool, verbs, selectedMode, profile, countPreset]);

  useEffect(() => {
    generateQuiz();
  }, [generateQuiz]);

  const currentQ = questions[currentIndex];

  const handleSelectOption = async (optionIndex: number) => {
    if (isAnswered || !currentQ) return;
    setSelectedOption(optionIndex);
    setIsAnswered(true);
    setAnsweredCount((c) => c + 1);

    const isCorrect = optionIndex === currentQ.correctIndex;
    if (isCorrect) {
      setScore((s) => s + 1);
      setStreak((st) => {
        const next = st + 1;
        if (next > maxStreak) setMaxStreak(next);
        return next;
      });
      speakJapanese(currentQ.verb.furigana_reading);

      // FSRS boost
      const updated = updateFsrsProgress(
        currentQ.verb.progress,
        currentQ.verb.id,
        "easy",
        currentQ.mode === "reading" ? "reading" : "meaning"
      );
      await saveVerbProgress(updated);
      onVerbUpdated();
    } else {
      setStreak(0);
      // FSRS penalty
      const updated = updateFsrsProgress(
        currentQ.verb.progress,
        currentQ.verb.id,
        "again",
        currentQ.mode === "reading" ? "reading" : "meaning"
      );
      await saveVerbProgress(updated);
      onVerbUpdated();

      // In Infinite mode: re-queue missed question 3-5 cards ahead
      if (countPreset === "infinite") {
        setQuestions((prev) => {
          const nextQuestions = [...prev];
          const insertIdx = Math.min(nextQuestions.length, currentIndex + 4);
          nextQuestions.splice(insertIdx, 0, currentQ);
          return nextQuestions;
        });
      }
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else if (countPreset === "infinite") {
      // Loop with reshuffled questions in infinite mode
      generateQuiz();
    } else {
      setIsFinished(true);
    }
  };

  // Keyboard navigation 1-4, Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (!isAnswered) {
        if (e.key === "1") handleSelectOption(0);
        else if (e.key === "2") handleSelectOption(1);
        else if (e.key === "3") handleSelectOption(2);
        else if (e.key === "4") handleSelectOption(3);
      } else {
        if (e.key === "Enter" || e.code === "Space") {
          e.preventDefault();
          handleNextQuestion();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAnswered, handleSelectOption, handleNextQuestion]);

  if (filteredPool.length < 4) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-primary-muted">
        <HelpCircle className="w-12 h-12 mb-3 text-primary-muted/50" />
        <p className="text-lg font-medium">At least 4 verbs are required for quizzes.</p>
        <button
          onClick={() => {
            setSelectedJlpt("All");
            setSelectedTracks([]);
          }}
          className="mt-4 px-4 py-2 rounded-full glass-panel hover:bg-surface-hover text-sm font-medium transition-colors"
        >
          Reset Filters
        </button>
      </div>
    );
  }

  // Quiz Finished Screen
  if (isFinished) {
    const percentage =
      answeredCount > 0 ? Math.round((score / answeredCount) * 100) : 0;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-xl mx-auto my-8 p-8 glass-card border border-border-glass text-center rounded-[var(--card-radius)]"
      >
        <div className="w-20 h-20 mx-auto rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center mb-4 text-accent shadow-neon-glow">
          <Trophy className="w-10 h-10" />
        </div>

        <h2 className="text-2xl font-bold text-primary mb-1">Quiz Completed!</h2>
        <p className="text-sm text-primary-muted mb-6">Dual-axis FSRS memory scores have been updated.</p>

        {/* Score & Streak Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-4 glass-panel rounded-2xl">
            <span className="text-xs text-primary-muted font-medium block mb-1">Score</span>
            <span className="text-2xl font-bold text-accent">
              {score} / {answeredCount}
            </span>
          </div>
          <div className="p-4 glass-panel rounded-2xl">
            <span className="text-xs text-primary-muted font-medium block mb-1">Accuracy</span>
            <span className="text-2xl font-bold text-emerald-400">{percentage}%</span>
          </div>
          <div className="p-4 glass-panel rounded-2xl">
            <span className="text-xs text-primary-muted font-medium block mb-1">Best Streak</span>
            <span className="text-2xl font-bold text-amber-400 flex items-center justify-center gap-1">
              <Flame className="w-5 h-5 text-amber-400 fill-amber-400" />
              {maxStreak}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={generateQuiz}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-neon-glow"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Retake Exam</span>
          </button>
        </div>
      </motion.div>
    );
  }

  if (!currentQ) return null;

  const liveAccuracy =
    answeredCount > 0 ? Math.round((score / answeredCount) * 100) : 100;

  const correctOpt = currentQ.options[currentQ.correctIndex];
  const chosenOpt = selectedOption !== null ? currentQ.options[selectedOption] : null;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      {/* Top Filter Bar: Quiz Modes & Presets */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
          {/* Quiz Mode Selector Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-full glass-panel">
            {[
              { id: "weakness", label: "Dual-Track", icon: Brain },
              { id: "reading", label: "Reading", icon: Volume2 },
              { id: "meaning", label: "Meaning", icon: BookOpen },
              { id: "reverse", label: "Reverse", icon: Sparkles },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedMode(item.id as QuizMode)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                    selectedMode === item.id
                      ? "bg-accent text-white shadow-neon-glow"
                      : "text-primary-muted hover:text-primary hover:bg-surface-hover"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Question Count Presets */}
          <div className="flex items-center gap-1 p-1 rounded-full glass-panel text-xs font-semibold">
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

        {/* Multi-Select Career Tracks Filter */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl glass-panel border border-border-subtle text-xs">
          <span className="text-[11px] font-semibold text-primary-muted px-2 flex items-center gap-1">
            <Briefcase className="w-3 h-3" />
            <span>Tracks:</span>
          </span>

          <button
            onClick={() => setSelectedTracks([])}
            className={cn(
              "px-2 py-0.5 rounded-lg text-xs font-medium transition-all",
              selectedTracks.length === 0
                ? "bg-accent text-white shadow-neon-glow"
                : "text-primary-muted hover:text-primary glass-panel"
            )}
          >
            Core JLPT
          </button>

          {ALL_INDUSTRY_TRACKS.map((track) => {
            const isSelected = selectedTracks.includes(track.id);
            return (
              <button
                key={track.id}
                onClick={() => toggleTrack(track.id)}
                className={cn(
                  "px-2 py-0.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1",
                  isSelected
                    ? "bg-accent/20 border border-accent text-accent font-semibold"
                    : "glass-panel text-primary-muted hover:text-primary"
                )}
              >
                <span>{track.short}</span>
                {isSelected && <CheckCircle2 className="w-2.5 h-2.5 text-accent" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Real-Time Score & Streak HUD */}
      <div className="glass-panel p-3 rounded-2xl border border-border-glass mb-4 flex items-center justify-between text-xs">
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
          Question {currentIndex + 1} /{" "}
          {countPreset === "infinite" ? "∞" : questions.length}
        </span>
      </div>

      {/* Progress Track */}
      <div className="w-full h-1.5 bg-border-glass rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{
            width: `${
              countPreset === "infinite"
                ? Math.min(100, (answeredCount % 20) * 5)
                : ((currentIndex + 1) / questions.length) * 100
            }%`,
          }}
        />
      </div>

      {/* Question Card */}
      <div className="glass-card p-6 md:p-8 rounded-[var(--card-radius)] border border-border-glass shadow-glass mb-6">
        <div className="text-center mb-6">
          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold glass-panel text-accent mb-3 uppercase tracking-wider">
            {currentQ.verb.jlpt_level} • {currentQ.verb.verb_group}
          </span>
          <h2 className="font-jp text-4xl md:text-5xl font-bold text-primary mb-2">
            {currentQ.prompt}
          </h2>
          {currentQ.subPrompt && (
            <p className="text-xs md:text-sm text-primary-muted">{currentQ.subPrompt}</p>
          )}
        </div>

        {/* 4 Adaptive Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {currentQ.options.map((opt, idx) => {
            let stateClass = "glass-panel hover:bg-surface-hover text-primary border-border-glass";

            if (isAnswered) {
              if (idx === currentQ.correctIndex) {
                stateClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-sm";
              } else if (idx === selectedOption) {
                stateClass = "bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-sm";
              } else {
                stateClass = "opacity-40 border-transparent";
              }
            }

            return (
              <button
                key={idx}
                disabled={isAnswered}
                onClick={() => handleSelectOption(idx)}
                className={cn(
                  "min-h-[var(--touch-target-min)] flex items-center justify-between p-4 rounded-xl text-left font-medium text-sm transition-all duration-150 border active:scale-98",
                  stateClass
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg glass-panel flex items-center justify-center text-xs font-bold text-primary-muted">
                    {idx + 1}
                  </span>
                  <span className="font-jp text-base font-semibold">{opt.text}</span>
                </div>

                {isAnswered && idx === currentQ.correctIndex && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 ml-2" />
                )}
                {isAnswered && idx === selectedOption && idx !== currentQ.correctIndex && (
                  <XCircle className="w-5 h-5 text-rose-400 shrink-0 ml-2" />
                )}
              </button>
            );
          })}
        </div>

        {/* Post-Answer Diagnostic Explanation Drawer */}
        <AnimatePresence>
          {isAnswered && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 pt-4 border-t border-border-glass overflow-hidden"
            >
              {selectedOption === currentQ.correctIndex ? (
                /* Correct Confirmation Banner */
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-emerald-400">Correct!</p>
                      <p className="text-xs text-primary font-medium mt-0.5">
                        <strong>{currentQ.verb.kanji_form}</strong> ({currentQ.verb.furigana_reading}) ={" "}
                        {currentQ.verb.meanings.join(", ")}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Diagnostic Mistake Card */
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 mb-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <span className="font-bold text-rose-400 block mb-1">Diagnostic Breakdown:</span>
                      {chosenOpt && (
                        <p className="text-rose-200">
                          You chose <strong className="text-white font-jp">{chosenOpt.sourceVerb.kanji_form}</strong> (
                          {chosenOpt.sourceVerb.furigana_reading}) ={" "}
                          <em>&ldquo;{chosenOpt.sourceVerb.meanings.join(", ")}&rdquo;</em>
                        </p>
                      )}
                      <p className="text-emerald-300 mt-1">
                        Correct answer: <strong className="text-white font-jp">{correctOpt.sourceVerb.kanji_form}</strong> (
                        {correctOpt.sourceVerb.furigana_reading}) ={" "}
                        <em>&ldquo;{correctOpt.sourceVerb.meanings.join(", ")}&rdquo;</em>
                      </p>
                      {countPreset === "infinite" && (
                        <p className="text-[11px] text-amber-300 font-medium mt-1">
                          ↻ Re-queued 4 cards ahead for memory reinforcement.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end">
                <button
                  onClick={handleNextQuestion}
                  className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-transform active:scale-95 shadow-neon-glow"
                >
                  <span>
                    {currentIndex < questions.length - 1 || countPreset === "infinite"
                      ? "Next (Enter)"
                      : "Finish Quiz"}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
