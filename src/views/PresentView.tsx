import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Volume2,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Sliders,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import {
  VerbWithProgress,
  FsrsRating,
  updateFsrsProgress,
  saveVerbProgress,
} from "../lib/mastery";
import { UserProfile, IndustryTrack } from "../lib/db";
import { speakJapanese } from "../lib/audio";
import { cn } from "../lib/utils";

interface PresentViewProps {
  verbs: VerbWithProgress[];
  profile: UserProfile;
  onVerbUpdated: () => void;
}

type AutoModeOrder = "priority" | "random" | "sequential";

export const PresentView: React.FC<PresentViewProps> = ({ verbs, profile: _profile, onVerbUpdated }) => {
  // Navigation & Filter State
  const [selectedJlpt, setSelectedJlpt] = useState<string>("All");
  const [selectedIndustry, setSelectedIndustry] = useState<string>("All");
  const [currentIndex, setCurrentIndex] = useState(0);

  // Card Reveal States
  const [isRevealed, setIsRevealed] = useState(false);
  const [showFurigana, setShowFurigana] = useState(true);

  // Auto-Presentation State
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState<number>(1.0); // 0.5x, 1.0x, 1.5x, 2.0x
  const [autoOrder, setAutoOrder] = useState<AutoModeOrder>("priority");
  const [autoStep, setAutoStep] = useState<number>(1); // 1: Kanji, 2: Furigana+TTS, 3: Meaning, 4: Transition
  const [countdownProgress, setCountdownProgress] = useState(0); // 0 to 100 for SVG ring
  const [loopEnabled] = useState(true);
  const [showControlsDrawer, setShowControlsDrawer] = useState(false);

  // Filter verbs based on JLPT & Industry filters
  const filteredVerbs = React.useMemo(() => {
    let list = [...verbs];
    if (selectedJlpt !== "All") {
      list = list.filter((v) => v.jlpt_level === selectedJlpt);
    }
    if (selectedIndustry !== "All") {
      list = list.filter((v) => v.industry_tags.includes(selectedIndustry as IndustryTrack));
    }

    if (autoOrder === "priority") {
      list.sort((a, b) => b.priorityScore - a.priorityScore);
    }
    return list;
  }, [verbs, selectedJlpt, selectedIndustry, autoOrder]);

  const currentVerb = filteredVerbs[currentIndex] || filteredVerbs[0] || null;

  // Reset index when filter changes
  useEffect(() => {
    setCurrentIndex(0);
    setIsRevealed(false);
    setAutoStep(1);
    setCountdownProgress(0);
  }, [selectedJlpt, selectedIndustry]);

  // Handle Advance
  const handleNext = useCallback(() => {
    if (filteredVerbs.length === 0) return;
    if (currentIndex < filteredVerbs.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else if (loopEnabled) {
      setCurrentIndex(0);
    }
    setIsRevealed(false);
    setAutoStep(1);
  }, [currentIndex, filteredVerbs.length, loopEnabled]);

  const handlePrev = useCallback(() => {
    if (filteredVerbs.length === 0) return;
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    } else if (loopEnabled) {
      setCurrentIndex(filteredVerbs.length - 1);
    }
    setIsRevealed(false);
    setAutoStep(1);
  }, [currentIndex, filteredVerbs.length, loopEnabled]);

  // Audio Playback
  const handleSpeak = useCallback(() => {
    if (currentVerb) {
      speakJapanese(currentVerb.furigana_reading || currentVerb.kanji_form);
    }
  }, [currentVerb]);

  // FSRS Triage Action
  const handleTriage = async (rating: FsrsRating) => {
    if (!currentVerb) return;
    const updated = updateFsrsProgress(currentVerb.progress, currentVerb.id, rating, "both");
    await saveVerbProgress(updated);
    onVerbUpdated();
    handleNext();
  };

  // Auto-Presentation Timer Loop
  const autoTimerRef = useRef<any>(null);
  const stepTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!isAutoPlaying || !currentVerb) {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
      setCountdownProgress(0);
      return;
    }

    // Step duration scaled by autoSpeed
    const stepDuration = 2200 / autoSpeed;
    const intervalTick = 50;
    let elapsed = 0;

    const runStep = (step: number) => {
      setAutoStep(step);
      if (step === 1) {
        setIsRevealed(false);
      } else if (step === 2) {
        setIsRevealed(false);
        handleSpeak();
      } else if (step === 3) {
        setIsRevealed(true);
      } else if (step === 4) {
        handleNext();
        return;
      }

      elapsed = 0;
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);

      autoTimerRef.current = setInterval(() => {
        elapsed += intervalTick;
        const pct = Math.min(100, (elapsed / stepDuration) * 100);
        setCountdownProgress(pct);

        if (elapsed >= stepDuration) {
          clearInterval(autoTimerRef.current);
          runStep(step + 1);
        }
      }, intervalTick);
    };

    runStep(1);

    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    };
  }, [isAutoPlaying, currentIndex, autoSpeed, handleNext, handleSpeak]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setIsRevealed((prev) => !prev);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        handleSpeak();
      } else if (e.key === "1") {
        e.preventDefault();
        handleTriage("again");
      } else if (e.key === "2") {
        e.preventDefault();
        handleTriage("hard");
      } else if (e.key === "3") {
        e.preventDefault();
        handleTriage("easy");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, handleSpeak, currentVerb]);

  if (!currentVerb) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-primary-muted">
        <HelpCircle className="w-12 h-12 mb-3 text-primary-muted/50" />
        <p className="text-lg font-medium">No verbs found matching the selected filters.</p>
        <button
          onClick={() => {
            setSelectedJlpt("All");
            setSelectedIndustry("All");
          }}
          className="mt-4 px-4 py-2 rounded-full glass-panel hover:bg-surface-hover text-sm font-medium transition-colors"
        >
          Reset Filters
        </button>
      </div>
    );
  }

  // Circular timer calculation
  const circleRadius = 24;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference - (countdownProgress / 100) * circleCircumference;

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto px-4 py-6">
      {/* Top Filter & Calibration Pills Bar */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 mb-6">
        {/* JLPT Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-full glass-panel overflow-x-auto scrollbar-none">
          {["All", "N5", "N4", "N3", "N2", "N1"].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setSelectedJlpt(lvl)}
              className={cn(
                "relative px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200",
                selectedJlpt === lvl
                  ? "bg-accent text-white shadow-neon-glow"
                  : "text-primary-muted hover:text-primary hover:bg-surface-hover"
              )}
            >
              {lvl}
            </button>
          ))}
        </div>

        {/* Mode & Action Controls */}
        <div className="flex items-center gap-2">
          {/* Furigana Toggle */}
          <button
            onClick={() => setShowFurigana(!showFurigana)}
            title="Toggle Furigana (F)"
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium glass-panel transition-colors",
              showFurigana ? "text-accent border-accent/40" : "text-primary-muted hover:text-primary"
            )}
          >
            {showFurigana ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Ruby</span>
          </button>

          {/* Slideshow Settings Button */}
          <button
            onClick={() => setShowControlsDrawer(!showControlsDrawer)}
            title="Auto-Presentation Settings"
            className={cn(
              "p-2 rounded-full glass-panel transition-colors",
              showControlsDrawer ? "text-accent bg-accent/10 border-accent/40" : "text-primary-muted hover:text-primary"
            )}
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Auto-Presentation Settings Drawer */}
      <AnimatePresence>
        {showControlsDrawer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full glass-card p-4 mb-6 border border-border-glass rounded-2xl overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
              {/* Order Mode */}
              <div className="flex items-center gap-2">
                <span className="text-primary-muted font-medium">Order:</span>
                {(["priority", "random", "sequential"] as AutoModeOrder[]).map((ord) => (
                  <button
                    key={ord}
                    onClick={() => setAutoOrder(ord)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg capitalize transition-colors font-medium",
                      autoOrder === ord ? "bg-accent text-white" : "glass-panel text-primary-muted hover:text-primary"
                    )}
                  >
                    {ord}
                  </button>
                ))}
              </div>

              {/* Speed Control */}
              <div className="flex items-center gap-2">
                <span className="text-primary-muted font-medium">Speed:</span>
                {[0.5, 1.0, 1.5, 2.0].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setAutoSpeed(spd)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg transition-colors font-medium",
                      autoSpeed === spd ? "bg-accent text-white" : "glass-panel text-primary-muted hover:text-primary"
                    )}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              {/* Industry Filter inside drawer */}
              <div className="flex items-center gap-2">
                <span className="text-primary-muted font-medium">Track:</span>
                <select
                  value={selectedIndustry}
                  onChange={(e) => setSelectedIndustry(e.target.value)}
                  className="bg-transparent border border-border-glass rounded-lg px-2 py-1 text-xs text-primary focus:outline-none"
                >
                  <option value="All" className="bg-zinc-900 text-zinc-100">All Tracks</option>
                  <option value="general" className="bg-zinc-900 text-zinc-100">General</option>
                  <option value="it" className="bg-zinc-900 text-zinc-100">IT & Tech</option>
                  <option value="finance" className="bg-zinc-900 text-zinc-100">Finance</option>
                  <option value="fnb" className="bg-zinc-900 text-zinc-100">Food & Beverage</option>
                  <option value="healthcare" className="bg-zinc-900 text-zinc-100">Healthcare</option>
                  <option value="manufacturing" className="bg-zinc-900 text-zinc-100">Manufacturing</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Presentation Glassmorphic Card */}
      <div className="relative w-full max-w-2xl min-h-[460px] flex flex-col justify-between glass-card p-8 border border-border-glass shadow-glass rounded-[var(--card-radius)]">
        {/* Top Badges Row */}
        <div className="flex items-center justify-between w-full mb-4">
          <div className="flex items-center gap-2">
            {/* JLPT Badge */}
            <span
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                currentVerb.jlpt_level === "N5" && "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30",
                currentVerb.jlpt_level === "N4" && "bg-blue-500/20 text-blue-400 border border-blue-500/30",
                currentVerb.jlpt_level === "N3" && "bg-violet-500/20 text-violet-400 border border-violet-500/30",
                currentVerb.jlpt_level === "N2" && "bg-purple-500/20 text-purple-400 border border-purple-500/30",
                currentVerb.jlpt_level === "N1" && "bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30"
              )}
            >
              {currentVerb.jlpt_level}
            </span>

            {/* Verb Group Badge */}
            <span className="px-2.5 py-1 rounded-full text-xs font-medium glass-panel text-primary-muted border border-border-subtle">
              {currentVerb.verb_group}
            </span>

            {/* Industry Track Badges */}
            {currentVerb.industry_tags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-full text-xs font-medium glass-panel text-accent border border-accent/20 flex items-center gap-1"
              >
                <Briefcase className="w-3 h-3" />
                <span className="capitalize">{tag}</span>
              </span>
            ))}
          </div>

          {/* Mastery & Retention Meter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-primary-muted">
              Mastery: <span className="text-accent font-bold">{currentVerb.masteryScore}%</span>
            </span>
            <div className="w-16 h-1.5 rounded-full bg-border-glass overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${currentVerb.masteryScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* Central Kanji & Furigana Presentation Area (Strict CLS < 0.1 Layout Stability) */}
        <div className="flex-1 flex flex-col items-center justify-center my-6 select-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentVerb.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="flex flex-col items-center text-center w-full"
            >
              {/* Fixed Vertical Height Slot for Kanji & Ruby Furigana */}
              <div className="h-[var(--kanji-fixed-slot-h)] flex items-center justify-center">
                <button
                  onClick={handleSpeak}
                  className="group relative cursor-pointer focus:outline-none transition-transform active:scale-95"
                  title="Click to Pronounce (R)"
                >
                  <h1 className="font-jp text-6xl md:text-7xl font-bold tracking-tight text-primary transition-all duration-200 group-hover:text-accent">
                    {showFurigana || isRevealed || autoStep >= 2 ? (
                      <ruby className="inline-block">
                        {currentVerb.ruby_segments.map((seg, idx) => (
                          <React.Fragment key={idx}>
                            {seg.base}
                            {seg.ruby && <rt className="text-xl md:text-2xl text-accent font-medium">{seg.ruby}</rt>}
                          </React.Fragment>
                        ))}
                      </ruby>
                    ) : (
                      <span>{currentVerb.kanji_form}</span>
                    )}
                  </h1>
                </button>
              </div>

              {/* Audio Pronunciation Pill */}
              <button
                onClick={handleSpeak}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-panel hover:bg-surface-hover text-xs font-medium text-primary-muted hover:text-accent transition-colors"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{currentVerb.furigana_reading}</span>
              </button>

              {/* Fixed Vertical Height Slot for English Meanings (Zero CLS on Reveal) */}
              <div className="h-[var(--meaning-fixed-slot-h)] flex items-center justify-center mt-4 w-full px-6">
                <AnimatePresence>
                  {isRevealed || autoStep >= 3 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                      className="text-center"
                    >
                      <p className="text-lg md:text-xl font-semibold text-primary">
                        {currentVerb.meanings.join("; ")}
                      </p>
                      <p className="text-xs text-primary-muted mt-1">
                        Constituent Kanji: {currentVerb.constituent_kanji.join("・")}
                      </p>
                    </motion.div>
                  ) : (
                    <button
                      onClick={() => setIsRevealed(true)}
                      className="px-4 py-2 rounded-xl border border-dashed border-border-glass text-xs font-medium text-primary-muted hover:text-primary hover:border-accent transition-colors"
                    >
                      Tap or press Space to reveal meaning
                    </button>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* FSRS Triage Action Buttons */}
        <div className="w-full pt-4 border-t border-border-glass">
          <div className="grid grid-cols-3 gap-3">
            {/* Don't Know (Again) */}
            <button
              onClick={() => handleTriage("again")}
              className="min-h-[var(--touch-target-min)] flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-xs transition-all bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 active:scale-95"
            >
              <AlertCircle className="w-4 h-4" />
              <span>Again (1)</span>
            </button>

            {/* Shaky (Hard) */}
            <button
              onClick={() => handleTriage("hard")}
              className="min-h-[var(--touch-target-min)] flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-xs transition-all bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 active:scale-95"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Hard (2)</span>
            </button>

            {/* Know It (Easy) */}
            <button
              onClick={() => handleTriage("easy")}
              className="min-h-[var(--touch-target-min)] flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-xs transition-all bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Easy (3)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Floating Navigation Bar & Hands-Free Slideshow Controller */}
      <div className="w-full max-w-2xl flex items-center justify-between mt-6 px-4 py-3 glass-card rounded-2xl border border-border-glass">
        {/* Previous Button */}
        <button
          onClick={handlePrev}
          title="Previous Verb (ArrowLeft)"
          className="min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] flex items-center justify-center p-2 rounded-full glass-panel hover:bg-surface-hover text-primary transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Center Slideshow Ring & Status */}
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-primary-muted tabular-nums">
            {currentIndex + 1} / {filteredVerbs.length}
          </span>

          {/* Auto-Presentation SVG Countdown Ring */}
          <div className="relative flex items-center justify-center">
            <button
              onClick={() => setIsAutoPlaying(!isAutoPlaying)}
              title={isAutoPlaying ? "Pause Slideshow" : "Start Auto-Presentation"}
              className="relative z-10 w-12 h-12 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center shadow-neon-glow transition-transform active:scale-95"
            >
              {isAutoPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            {/* SVG Circular Countdown Ring */}
            {isAutoPlaying && (
              <svg className="absolute -top-1 -left-1 w-14 h-14 -rotate-90 pointer-events-none">
                <circle
                  cx="28"
                  cy="28"
                  r={circleRadius}
                  className="stroke-border-glass fill-none"
                  strokeWidth="3"
                />
                <circle
                  cx="28"
                  cy="28"
                  r={circleRadius}
                  className="stroke-accent fill-none transition-all duration-75"
                  strokeWidth="3"
                  strokeDasharray={circleCircumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Next Button */}
        <button
          onClick={handleNext}
          title="Next Verb (ArrowRight)"
          className="min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] flex items-center justify-center p-2 rounded-full glass-panel hover:bg-surface-hover text-primary transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
