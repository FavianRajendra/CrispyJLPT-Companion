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
  Clock,
  Gauge,
  Sparkles,
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

const ALL_INDUSTRY_TRACKS: { id: IndustryTrack; label: string; short: string }[] = [
  { id: "it", label: "IT & Tech", short: "IT" },
  { id: "finance", label: "Finance", short: "Finance" },
  { id: "fnb", label: "Food & Beverage", short: "F&B" },
  { id: "healthcare", label: "Healthcare", short: "Health" },
  { id: "manufacturing", label: "Manufacturing", short: "Mfg" },
  { id: "general", label: "General", short: "General" },
];

const CARD_GAP_OPTIONS = [2, 3, 5, 8, 12];
const SPEED_OPTIONS = [0.5, 1.0, 1.5, 2.0];

export const PresentView: React.FC<PresentViewProps> = ({ verbs, profile, onVerbUpdated }) => {
  // Navigation & Filter State
  const [selectedJlpt, setSelectedJlpt] = useState<string>("All");
  const [selectedTracks, setSelectedTracks] = useState<IndustryTrack[]>(() =>
    Array.isArray(profile.target_industries) ? profile.target_industries : []
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  // Card Reveal States
  const [isRevealed, setIsRevealed] = useState(false);
  const [showFurigana, setShowFurigana] = useState(true);

  // Auto-Presentation State
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [cardGapDuration, setCardGapDuration] = useState<number>(5); // 2s, 3s, 5s, 8s, 12s
  const [autoSpeed, setAutoSpeed] = useState<number>(1.0); // 0.5x, 1.0x, 1.5x, 2.0x (Controls TTS + reveal cadence)
  const [autoOrder, setAutoOrder] = useState<AutoModeOrder>("priority");
  const [autoStep, setAutoStep] = useState<number>(1); // 1: Kanji, 2: Furigana+TTS, 3: Meaning, 4: Transition
  const [countdownProgress, setCountdownProgress] = useState(0); // 0 to 100 for SVG ring
  const [remainingSeconds, setRemainingSeconds] = useState(cardGapDuration);
  const [loopEnabled] = useState(true);
  const [showControlsDrawer, setShowControlsDrawer] = useState(false);

  // Filter verbs based on JLPT & Multi-Select Industry filters
  const filteredVerbs = React.useMemo(() => {
    let list = [...verbs];
    if (selectedJlpt !== "All") {
      list = list.filter((v) => v.jlpt_level === selectedJlpt);
    }

    // Zero-Selection Default Rule: Regular JLPT Requirements (is_core_jlpt === 1)
    if (selectedTracks.length === 0) {
      list = list.filter((v) => v.is_core_jlpt === 1);
    } else {
      // Multi-Track Union Rule: Core JLPT verbs OR tagged with ANY selected track
      list = list.filter(
        (v) => v.is_core_jlpt === 1 || v.industry_tags.some((t) => selectedTracks.includes(t))
      );
    }

    if (autoOrder === "priority") {
      list.sort((a, b) => b.priorityScore - a.priorityScore);
    }
    return list;
  }, [verbs, selectedJlpt, selectedTracks, autoOrder]);

  const currentVerb = filteredVerbs[currentIndex] || filteredVerbs[0] || null;

  // Reset index when filter changes
  useEffect(() => {
    setCurrentIndex(0);
    setIsRevealed(false);
    setAutoStep(1);
    setCountdownProgress(0);
    setRemainingSeconds(cardGapDuration);
  }, [selectedJlpt, selectedTracks, cardGapDuration]);

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
    setCountdownProgress(0);
    setRemainingSeconds(cardGapDuration);
  }, [currentIndex, filteredVerbs.length, loopEnabled, cardGapDuration]);

  const handlePrev = useCallback(() => {
    if (filteredVerbs.length === 0) return;
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    } else if (loopEnabled) {
      setCurrentIndex(filteredVerbs.length - 1);
    }
    setIsRevealed(false);
    setAutoStep(1);
    setCountdownProgress(0);
    setRemainingSeconds(cardGapDuration);
  }, [currentIndex, filteredVerbs.length, loopEnabled, cardGapDuration]);

  // Audio Playback with TTS rate control
  const handleSpeak = useCallback(() => {
    if (currentVerb) {
      speakJapanese(currentVerb.furigana_reading || currentVerb.kanji_form, autoSpeed);
    }
  }, [currentVerb, autoSpeed]);

  // FSRS Triage Action
  const handleTriage = async (rating: FsrsRating) => {
    if (!currentVerb) return;
    const updated = updateFsrsProgress(currentVerb.progress, currentVerb.id, rating, "both");
    await saveVerbProgress(updated);
    onVerbUpdated();
    handleNext();
  };

  // Toggle Industry Track
  const toggleTrack = (trackId: IndustryTrack) => {
    setSelectedTracks((prev) =>
      prev.includes(trackId) ? prev.filter((t) => t !== trackId) : [...prev, trackId]
    );
  };

  // Auto-Presentation Timer Loop (Independent Card Gap Duration vs. TTS Speed)
  const autoTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!isAutoPlaying || !currentVerb) {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      setCountdownProgress(0);
      setRemainingSeconds(cardGapDuration);
      return;
    }

    const totalMs = cardGapDuration * 1000;
    const intervalTick = 50;
    let elapsedMs = 0;
    let spoken = false;
    let meaningRevealed = false;

    // Choreography thresholds
    // Kanji alone: 0% -> 30%
    // Furigana + TTS: 30% -> 60%
    // Meaning revealed: 60% -> 100%
    setIsRevealed(false);
    setAutoStep(1);

    autoTimerRef.current = setInterval(() => {
      elapsedMs += intervalTick;
      const progressPct = Math.min(100, (elapsedMs / totalMs) * 100);
      setCountdownProgress(progressPct);

      const remSec = Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000));
      setRemainingSeconds(remSec);

      if (progressPct >= 30 && !spoken) {
        spoken = true;
        setAutoStep(2);
        handleSpeak();
      }

      if (progressPct >= 60 && !meaningRevealed) {
        meaningRevealed = true;
        setAutoStep(3);
        setIsRevealed(true);
      }

      if (elapsedMs >= totalMs) {
        clearInterval(autoTimerRef.current);
        handleNext();
      }
    }, intervalTick);

    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    };
  }, [isAutoPlaying, currentIndex, cardGapDuration, autoSpeed, handleNext, handleSpeak, currentVerb]);

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
            setSelectedTracks([]);
          }}
          className="mt-4 px-4 py-2 rounded-full glass-panel hover:bg-surface-hover text-sm font-medium transition-colors"
        >
          Reset to Core JLPT Requirements
        </button>
      </div>
    );
  }

  // Circular countdown calculation
  const circleRadius = 24;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference - (countdownProgress / 100) * circleCircumference;

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto px-4 py-6">
      {/* Top Filter & Calibration Pills Bar */}
      <div className="w-full flex flex-col gap-3 mb-6">
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          {/* JLPT Level Filter Pills */}
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
                "flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium glass-panel transition-colors",
                showControlsDrawer ? "text-accent bg-accent/10 border-accent/40" : "text-primary-muted hover:text-primary"
              )}
            >
              <Sliders className="w-4 h-4" />
              <span>Config ({cardGapDuration}s • {autoSpeed}x)</span>
            </button>
          </div>
        </div>

        {/* Multi-Select Career Industry Tracks Toggle Bar */}
        <div className="w-full flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl glass-panel border border-border-subtle">
          <span className="text-[11px] font-semibold text-primary-muted px-2 flex items-center gap-1">
            <Briefcase className="w-3 h-3" />
            <span>Tracks:</span>
          </span>

          {/* Regular JLPT Core Indicator / Clear button */}
          <button
            onClick={() => setSelectedTracks([])}
            className={cn(
              "px-2.5 py-1 rounded-xl text-xs font-medium transition-all",
              selectedTracks.length === 0
                ? "bg-accent text-white shadow-neon-glow"
                : "text-primary-muted hover:text-primary glass-panel"
            )}
          >
            Core JLPT (Default)
          </button>

          {ALL_INDUSTRY_TRACKS.map((track) => {
            const isSelected = selectedTracks.includes(track.id);
            return (
              <button
                key={track.id}
                onClick={() => toggleTrack(track.id)}
                className={cn(
                  "px-2.5 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1",
                  isSelected
                    ? "bg-accent/20 border border-accent text-accent font-semibold shadow-sm"
                    : "glass-panel text-primary-muted hover:text-primary border border-transparent"
                )}
              >
                <span>{track.short}</span>
                {isSelected && <CheckCircle2 className="w-3 h-3 text-accent" />}
              </button>
            );
          })}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Card Gap Dwell Interval */}
              <div>
                <span className="text-primary-muted font-medium flex items-center gap-1 mb-2">
                  <Clock className="w-3.5 h-3.5 text-accent" />
                  <span>Card Gap Dwell Interval:</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {CARD_GAP_OPTIONS.map((gap) => (
                    <button
                      key={gap}
                      onClick={() => setCardGapDuration(gap)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-center font-semibold transition-all",
                        cardGapDuration === gap
                          ? "bg-accent text-white shadow-neon-glow"
                          : "glass-panel text-primary-muted hover:text-primary"
                      )}
                    >
                      {gap}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Reveal & TTS Speed */}
              <div>
                <span className="text-primary-muted font-medium flex items-center gap-1 mb-2">
                  <Gauge className="w-3.5 h-3.5 text-accent" />
                  <span>TTS Audio & Reveal Speed:</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {SPEED_OPTIONS.map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setAutoSpeed(spd)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-center font-semibold transition-all",
                        autoSpeed === spd
                          ? "bg-accent text-white shadow-neon-glow"
                          : "glass-panel text-primary-muted hover:text-primary"
                      )}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Presentation Order */}
              <div>
                <span className="text-primary-muted font-medium flex items-center gap-1 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span>Queue Order:</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {(["priority", "random", "sequential"] as AutoModeOrder[]).map((ord) => (
                    <button
                      key={ord}
                      onClick={() => setAutoOrder(ord)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-center capitalize font-semibold transition-all",
                        autoOrder === ord
                          ? "bg-accent text-white shadow-neon-glow"
                          : "glass-panel text-primary-muted hover:text-primary"
                      )}
                    >
                      {ord}
                    </button>
                  ))}
                </div>
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
              title={isAutoPlaying ? "Pause Slideshow" : `Start Auto-Presentation (${cardGapDuration}s)`}
              className="relative z-10 w-12 h-12 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center shadow-neon-glow transition-transform active:scale-95"
            >
              {isAutoPlaying ? (
                <div className="flex flex-col items-center justify-center">
                  <Pause className="w-4 h-4" />
                  <span className="text-[9px] font-mono leading-none mt-0.5">{remainingSeconds}s</span>
                </div>
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
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
