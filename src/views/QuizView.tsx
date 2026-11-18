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
} from "lucide-react";
import { VerbWithProgress, updateFsrsProgress, saveVerbProgress } from "../lib/mastery";
import { UserProfile } from "../lib/db";
import { speakJapanese } from "../lib/audio";
import { cn } from "../lib/utils";

interface QuizViewProps {
  verbs: VerbWithProgress[];
  profile: UserProfile;
  onVerbUpdated: () => void;
}

export type QuizMode = "reading" | "meaning" | "reverse" | "weakness";

interface Question {
  verb: VerbWithProgress;
  mode: "reading" | "meaning" | "reverse";
  prompt: string;
  subPrompt?: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export const QuizView: React.FC<QuizViewProps> = ({ verbs, profile, onVerbUpdated }) => {
  const [selectedMode, setSelectedMode] = useState<QuizMode>("weakness");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  // Generate Questions for the chosen quiz mode
  const generateQuiz = useCallback(() => {
    if (verbs.length < 4) return;

    // Filter candidate pool
    let pool = [...verbs];
    if (selectedMode === "weakness") {
      // Prioritize target JLPT and industry, and lowest mastery score
      pool.sort((a, b) => {
        const aTargetMatch = a.jlpt_level === profile.target_jlpt ? 1 : 0;
        const bTargetMatch = b.jlpt_level === profile.target_jlpt ? 1 : 0;
        if (aTargetMatch !== bTargetMatch) return bTargetMatch - aTargetMatch;
        return a.masteryScore - b.masteryScore;
      });
    }

    const questionCount = Math.min(10, pool.length);
    const chosenVerbs = pool.slice(0, questionCount);
    // Shuffle chosen order
    chosenVerbs.sort(() => Math.random() - 0.5);

    const generated: Question[] = chosenVerbs.map((target) => {
      let mode: "reading" | "meaning" | "reverse";
      if (selectedMode === "weakness") {
        mode = Math.random() > 0.5 ? "reading" : "meaning";
      } else {
        mode = selectedMode;
      }

      // Pick 3 distractors
      const distractors = verbs.filter((v) => v.id !== target.id);
      distractors.sort(() => Math.random() - 0.5);
      const chosenDistractors = distractors.slice(0, 3);

      let prompt = "";
      let subPrompt: string | undefined = undefined;
      let correctValue = "";
      let wrongValues: string[] = [];
      let explanation = "";

      if (mode === "reading") {
        prompt = target.kanji_form;
        subPrompt = "Select the correct Furigana reading";
        correctValue = target.furigana_reading;
        wrongValues = chosenDistractors.map((d) => d.furigana_reading);
        explanation = `${target.kanji_form} (${target.furigana_reading}) means "${target.meanings.join(", ")}"`;
      } else if (mode === "meaning") {
        prompt = target.kanji_form;
        subPrompt = `[${target.furigana_reading}] Select the English meaning`;
        correctValue = target.meanings[0];
        wrongValues = chosenDistractors.map((d) => d.meanings[0]);
        explanation = `${target.kanji_form} (${target.furigana_reading}) = ${target.meanings.join("; ")}`;
      } else {
        // Reverse: Meaning -> Kanji
        prompt = target.meanings.slice(0, 2).join("; ");
        subPrompt = `[Reading: ${target.furigana_reading}] Which Kanji matches this meaning?`;
        correctValue = target.kanji_form;
        wrongValues = chosenDistractors.map((d) => d.kanji_form);
        explanation = `${target.kanji_form} (${target.furigana_reading}) - ${target.meanings.join(", ")}`;
      }

      // Combine and shuffle options
      const allOptions = [correctValue, ...wrongValues].slice(0, 4);
      allOptions.sort(() => Math.random() - 0.5);
      const correctIndex = allOptions.indexOf(correctValue);

      return {
        verb: target,
        mode,
        prompt,
        subPrompt,
        options: allOptions,
        correctIndex,
        explanation,
      };
    });

    setQuestions(generated);
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setIsFinished(false);
  }, [verbs, selectedMode, profile]);

  useEffect(() => {
    generateQuiz();
  }, [generateQuiz]);

  const currentQ = questions[currentIndex];

  const handleSelectOption = async (optionIndex: number) => {
    if (isAnswered || !currentQ) return;
    setSelectedOption(optionIndex);
    setIsAnswered(true);

    const isCorrect = optionIndex === currentQ.correctIndex;
    if (isCorrect) {
      setScore((s) => s + 1);
      setStreak((st) => {
        const next = st + 1;
        if (next > maxStreak) setMaxStreak(next);
        return next;
      });
      // Play voice on correct
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
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setIsAnswered(false);
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

  if (verbs.length < 4) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-primary-muted">
        <HelpCircle className="w-12 h-12 mb-3 text-primary-muted/50" />
        <p className="text-lg font-medium">At least 4 verbs are required to generate adaptive quizzes.</p>
      </div>
    );
  }

  // Quiz Finished Screen
  if (isFinished) {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-xl mx-auto my-8 p-8 glass-card border border-border-glass text-center rounded-[var(--card-radius)]"
      >
        <div className="w-20 h-20 mx-auto rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center mb-4 text-accent">
          <Trophy className="w-10 h-10" />
        </div>

        <h2 className="text-2xl font-bold text-primary mb-1">Quiz Completed!</h2>
        <p className="text-sm text-primary-muted mb-6">FSRS memory retention scores have been updated.</p>

        {/* Score & Streak Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-4 glass-panel rounded-2xl">
            <span className="text-xs text-primary-muted font-medium block mb-1">Score</span>
            <span className="text-2xl font-bold text-accent">{score} / {questions.length}</span>
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

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      {/* Quiz Mode Selector Pills */}
      <div className="flex items-center justify-center gap-2 p-1 mb-6 rounded-full glass-panel overflow-x-auto scrollbar-none">
        {[
          { id: "weakness", label: "Dual-Track Weakness", icon: Brain },
          { id: "reading", label: "Reading Test", icon: Volume2 },
          { id: "meaning", label: "Meaning Test", icon: BookOpen },
          { id: "reverse", label: "Reverse Recognition", icon: Sparkles },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setSelectedMode(item.id as QuizMode)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
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

      {/* Quiz Progress & Streak Bar */}
      <div className="flex items-center justify-between text-xs text-primary-muted mb-3 px-1">
        <span className="font-mono">
          Question {currentIndex + 1} of {questions.length}
        </span>
        {streak > 1 && (
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="flex items-center gap-1 text-amber-400 font-bold"
          >
            <Flame className="w-4 h-4 fill-amber-400" />
            <span>{streak} Streak</span>
          </motion.div>
        )}
      </div>

      {/* Progress Track */}
      <div className="w-full h-1.5 bg-border-glass rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
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
                stateClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/50";
              } else if (idx === selectedOption) {
                stateClass = "bg-rose-500/20 text-rose-300 border-rose-500/50";
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
                  <span className="font-jp">{opt}</span>
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

        {/* Post-Answer Explanation Drawer */}
        <AnimatePresence>
          {isAnswered && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 pt-4 border-t border-border-glass overflow-hidden"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-primary-muted font-medium mb-1">Explanation:</p>
                  <p className="text-sm font-semibold text-primary">{currentQ.explanation}</p>
                </div>

                <button
                  onClick={handleNextQuestion}
                  className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-transform active:scale-95 shadow-neon-glow"
                >
                  <span>{currentIndex < questions.length - 1 ? "Next (Enter)" : "Finish"}</span>
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
