import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Volume2,
  X,
  Briefcase,
  CheckCircle2,
} from "lucide-react";
import { VerbWithProgress, updateFsrsProgress, saveVerbProgress } from "../lib/mastery";
import { IndustryTrack, UserProfile } from "../lib/db";
import { speakJapanese } from "../lib/audio";
import { cn } from "../lib/utils";

interface DirectoryViewProps {
  verbs: VerbWithProgress[];
  profile: UserProfile;
  onVerbUpdated: () => void;
}

const ALL_INDUSTRY_TRACKS: { id: IndustryTrack; label: string; short: string }[] = [
  { id: "it", label: "IT & Tech", short: "IT" },
  { id: "finance", label: "Finance", short: "Finance" },
  { id: "fnb", label: "Food & Beverage", short: "F&B" },
  { id: "healthcare", label: "Healthcare", short: "Health" },
  { id: "manufacturing", label: "Manufacturing", short: "Mfg" },
  { id: "general", label: "General", short: "General" },
];

export const DirectoryView: React.FC<DirectoryViewProps> = ({ verbs, profile, onVerbUpdated }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJlpt, setSelectedJlpt] = useState<string>("All");
  const [selectedTracks, setSelectedTracks] = useState<IndustryTrack[]>(() =>
    Array.isArray(profile.target_industries) ? profile.target_industries : []
  );
  const [selectedTier, setSelectedTier] = useState<string>("All");
  const [activeVerbModal, setActiveVerbModal] = useState<VerbWithProgress | null>(null);

  const toggleTrack = (trackId: IndustryTrack) => {
    setSelectedTracks((prev) =>
      prev.includes(trackId) ? prev.filter((t) => t !== trackId) : [...prev, trackId]
    );
  };

  // Filtered verbs computation
  const filteredVerbs = useMemo(() => {
    return verbs.filter((v) => {
      // Search matching (Kanji, Kana, English)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const kanjiMatch = v.kanji_form.toLowerCase().includes(q);
        const kanaMatch = v.furigana_reading.toLowerCase().includes(q);
        const englishMatch = v.meanings.some((m) => m.toLowerCase().includes(q));
        if (!kanjiMatch && !kanaMatch && !englishMatch) return false;
      }

      // JLPT Filter
      if (selectedJlpt !== "All" && v.jlpt_level !== selectedJlpt) {
        return false;
      }

      // Zero-Selection Default Rule: Regular JLPT Requirements (is_core_jlpt === 1)
      if (selectedTracks.length === 0) {
        if (v.is_core_jlpt !== 1) return false;
      } else {
        // Multi-Track Union Rule: core JLPT verbs OR any selected track
        const matchesTrack =
          v.is_core_jlpt === 1 || v.industry_tags.some((t) => selectedTracks.includes(t));
        if (!matchesTrack) return false;
      }

      // Mastery Tier Filter
      if (selectedTier !== "All" && v.tier !== selectedTier) {
        return false;
      }

      return true;
    });
  }, [verbs, searchQuery, selectedJlpt, selectedTracks, selectedTier]);

  const handleTriageModal = async (rating: "again" | "hard" | "easy") => {
    if (!activeVerbModal) return;
    const updated = updateFsrsProgress(activeVerbModal.progress, activeVerbModal.id, rating, "both");
    await saveVerbProgress(updated);
    onVerbUpdated();
    // Update local modal state
    setActiveVerbModal((prev) => (prev ? { ...prev, progress: updated } : null));
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6">
      {/* Header Search & Filtering Controls */}
      <div className="flex flex-col gap-4 mb-6">
        {/* Search Input */}
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search verbs by Kanji, Furigana (e.g. かんりする), or English..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl glass-panel text-sm text-primary placeholder:text-primary-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/50 border border-border-glass"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-primary-muted hover:text-primary"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* JLPT Levels */}
          <div className="flex items-center gap-1.5 p-1 rounded-full glass-panel overflow-x-auto scrollbar-none">
            {["All", "N5", "N4", "N3", "N2", "N1"].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setSelectedJlpt(lvl)}
                className={cn(
                  "px-3 py-1.5 rounded-full font-semibold transition-all",
                  selectedJlpt === lvl
                    ? "bg-accent text-white shadow-neon-glow"
                    : "text-primary-muted hover:text-primary hover:bg-surface-hover"
                )}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Mastery Tier */}
          <div className="flex items-center gap-2">
            <span className="text-primary-muted font-medium">Status:</span>
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="bg-transparent border border-border-glass rounded-xl px-3 py-1.5 text-xs text-primary focus:outline-none"
            >
              <option value="All" className="bg-zinc-900 text-zinc-100">All Statuses</option>
              <option value="Unseen" className="bg-zinc-900 text-zinc-100">Unseen</option>
              <option value="Struggling" className="bg-zinc-900 text-zinc-100">Struggling (&lt;40%)</option>
              <option value="Familiar" className="bg-zinc-900 text-zinc-100">Familiar (40-79%)</option>
              <option value="Mastered" className="bg-zinc-900 text-zinc-100">Mastered (80%+)</option>
            </select>
          </div>
        </div>

        {/* Multi-Select Industry Tracks Bar */}
        <div className="w-full flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl glass-panel border border-border-subtle text-xs">
          <span className="text-[11px] font-semibold text-primary-muted px-2 flex items-center gap-1">
            <Briefcase className="w-3 h-3" />
            <span>Tracks:</span>
          </span>

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

      {/* Verbs Count Header */}
      <div className="flex items-center justify-between text-xs text-primary-muted mb-4 px-1">
        <span>Showing {filteredVerbs.length} verbs</span>
        <span>
          {selectedTracks.length === 0
            ? "Showing Core JLPT verbs"
            : `Filtered by ${selectedTracks.length} track${selectedTracks.length > 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Verbs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredVerbs.map((verb) => (
          <div
            key={verb.id}
            onClick={() => setActiveVerbModal(verb)}
            className="group glass-card p-4 rounded-2xl border border-border-glass hover:border-accent/40 cursor-pointer transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                      verb.jlpt_level === "N5" && "bg-cyan-500/20 text-cyan-400",
                      verb.jlpt_level === "N4" && "bg-blue-500/20 text-blue-400",
                      verb.jlpt_level === "N3" && "bg-violet-500/20 text-violet-400",
                      verb.jlpt_level === "N2" && "bg-purple-500/20 text-purple-400",
                      verb.jlpt_level === "N1" && "bg-fuchsia-500/20 text-fuchsia-400"
                    )}
                  >
                    {verb.jlpt_level}
                  </span>

                  <span className="text-[10px] text-primary-muted font-medium">
                    {verb.verb_group}
                  </span>

                  {verb.industry_tags.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded text-[10px] glass-panel text-accent capitalize"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                {/* Quick Audio Play Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    speakJapanese(verb.furigana_reading);
                  }}
                  title="Pronounce"
                  className="p-1.5 rounded-full glass-panel hover:bg-surface-hover text-primary-muted hover:text-accent transition-colors"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Kanji & Furigana */}
              <div className="flex items-baseline gap-2 mb-1">
                <h3 className="font-jp text-xl font-bold text-primary group-hover:text-accent transition-colors">
                  {verb.kanji_form}
                </h3>
                <span className="text-xs text-primary-muted font-jp">
                  【{verb.furigana_reading}】
                </span>
              </div>

              {/* English Meanings */}
              <p className="text-xs text-primary-muted line-clamp-1 mb-3">
                {verb.meanings.join("; ")}
              </p>
            </div>

            {/* Bottom Progress Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-[11px]">
              <span className="text-primary-muted">
                Status:{" "}
                <span
                  className={cn(
                    "font-semibold",
                    verb.tier === "Mastered" && "text-emerald-400",
                    verb.tier === "Familiar" && "text-amber-400",
                    verb.tier === "Struggling" && "text-rose-400",
                    verb.tier === "Unseen" && "text-primary-muted"
                  )}
                >
                  {verb.tier} ({verb.masteryScore}%)
                </span>
              </span>

              <div className="w-16 h-1 rounded-full bg-border-glass overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full"
                  style={{ width: `${verb.masteryScore}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Verb Detail Modal */}
      <AnimatePresence>
        {activeVerbModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg glass-card p-6 md:p-8 rounded-[var(--card-radius)] border border-border-glass shadow-glass"
            >
              {/* Close Button */}
              <button
                onClick={() => setActiveVerbModal(null)}
                className="absolute top-4 right-4 p-2 rounded-full glass-panel hover:bg-surface-hover text-primary-muted hover:text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-accent/20 text-accent uppercase">
                    {activeVerbModal.jlpt_level}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs glass-panel text-primary-muted">
                    {activeVerbModal.verb_group}
                  </span>
                </div>

                {/* Ruby Kanji Large Presentation */}
                <h2 className="font-jp text-5xl font-bold text-primary mb-3">
                  <ruby>
                    {activeVerbModal.ruby_segments.map((seg, idx) => (
                      <React.Fragment key={idx}>
                        {seg.base}
                        {seg.ruby && <rt className="text-lg text-accent">{seg.ruby}</rt>}
                      </React.Fragment>
                    ))}
                  </ruby>
                </h2>

                <button
                  onClick={() => speakJapanese(activeVerbModal.furigana_reading)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel hover:bg-surface-hover text-xs text-primary-muted hover:text-accent transition-colors"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{activeVerbModal.furigana_reading}</span>
                </button>
              </div>

              {/* Definitions */}
              <div className="space-y-3 mb-6">
                <div className="p-3.5 rounded-xl glass-panel">
                  <span className="text-[11px] font-semibold text-primary-muted uppercase tracking-wider block mb-1">
                    English Meanings
                  </span>
                  <p className="text-sm font-medium text-primary">
                    {activeVerbModal.meanings.join("; ")}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl glass-panel">
                  <span className="text-[11px] font-semibold text-primary-muted uppercase tracking-wider block mb-1">
                    Constituent Kanji Characters
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    {activeVerbModal.constituent_kanji.map((kanji) => (
                      <span
                        key={kanji}
                        className="w-8 h-8 rounded-lg glass-card flex items-center justify-center font-jp font-bold text-base text-accent border border-accent/20"
                      >
                        {kanji}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl glass-panel">
                  <span className="text-[11px] font-semibold text-primary-muted uppercase tracking-wider block mb-1">
                    Industry Career Tracks
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {activeVerbModal.industry_tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 rounded-md text-xs glass-card text-primary font-medium capitalize"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick FSRS Adjustment */}
              <div className="pt-4 border-t border-border-glass">
                <span className="text-[11px] font-semibold text-primary-muted block text-center mb-2">
                  Update Memory Status
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleTriageModal("again")}
                    className="py-2.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
                  >
                    Again
                  </button>
                  <button
                    onClick={() => handleTriageModal("hard")}
                    className="py-2.5 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-colors"
                  >
                    Hard
                  </button>
                  <button
                    onClick={() => handleTriageModal("easy")}
                    className="py-2.5 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors"
                  >
                    Easy
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
