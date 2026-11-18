import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Target,
  TrendingUp,
  Cloud,
  CloudOff,
  RefreshCw,
  CheckCircle2,
  Briefcase,
  GraduationCap,
  Sparkles,
  BookOpen,
  ArrowRight,
  Info,
} from "lucide-react";
import { VerbWithProgress } from "../lib/mastery";
import { UserProfile, JlptLevel, IndustryTrack, getDatabase, normalizeUserProfile } from "../lib/db";
import { syncManager, SyncState } from "../lib/sync";
import { cn } from "../lib/utils";

interface MasteryViewProps {
  verbs: VerbWithProgress[];
  profile: UserProfile;
  onProfileUpdated: (updated: UserProfile) => void;
  onNavigateToPresent?: () => void;
  onNavigateToQuiz?: () => void;
}

const ALL_INDUSTRY_TRACKS: { id: IndustryTrack; label: string; short: string }[] = [
  { id: "it", label: "IT & Software Engineering", short: "IT & Tech" },
  { id: "finance", label: "Finance & Banking", short: "Finance" },
  { id: "fnb", label: "Food & Beverage (Culinary)", short: "F&B" },
  { id: "healthcare", label: "Healthcare & Medicine", short: "Healthcare" },
  { id: "manufacturing", label: "Manufacturing & Industrial", short: "Manufacturing" },
  { id: "general", label: "General Workplace Business", short: "General" },
];

export const MasteryView: React.FC<MasteryViewProps> = ({
  verbs,
  profile,
  onProfileUpdated,
  onNavigateToPresent,
  onNavigateToQuiz,
}) => {
  const [localProfile, setLocalProfile] = useState<UserProfile>(() => normalizeUserProfile(profile));
  const [syncState, setSyncState] = useState<SyncState>(syncManager.getState());
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setLocalProfile(normalizeUserProfile(profile));
  }, [profile]);

  useEffect(() => {
    const unsubscribe = syncManager.subscribe((state) => setSyncState(state));
    return () => unsubscribe();
  }, []);

  const safeTargetIndustries: IndustryTrack[] = Array.isArray(localProfile.target_industries)
    ? localProfile.target_industries
    : [];

  // Compute Dual-Track Readiness safely
  const examVerbs = verbs.filter((v) => v.jlpt_level === localProfile.target_jlpt);
  const industryVerbs = verbs.filter((v) =>
    safeTargetIndustries.length === 0
      ? v.is_core_jlpt === 1
      : v.industry_tags.some((t) => safeTargetIndustries.includes(t))
  );

  const examReadiness =
    examVerbs.length > 0
      ? Math.round(examVerbs.reduce((acc, v) => acc + (v.masteryScore || 0), 0) / examVerbs.length)
      : 0;

  const industryReadiness =
    industryVerbs.length > 0
      ? Math.round(
          industryVerbs.reduce((acc, v) => acc + (v.masteryScore || 0), 0) / industryVerbs.length
        )
      : 0;

  // Mastery Tier Breakdown
  const tierCounts = {
    Mastered: verbs.filter((v) => v.tier === "Mastered").length,
    Familiar: verbs.filter((v) => v.tier === "Familiar").length,
    Struggling: verbs.filter((v) => v.tier === "Struggling").length,
    Unseen: verbs.filter((v) => v.tier === "Unseen").length,
  };

  const totalReviews = verbs.reduce(
    (acc, v) => acc + (v.progress ? v.progress.repetitions + v.progress.lapses : 0),
    0
  );

  const toggleIndustryTrack = (trackId: IndustryTrack) => {
    setLocalProfile((prev) => {
      const current = Array.isArray(prev.target_industries) ? prev.target_industries : [];
      let updated: IndustryTrack[];
      if (current.includes(trackId)) {
        updated = current.filter((t) => t !== trackId);
      } else {
        updated = [...current, trackId];
      }
      return { ...prev, target_industries: updated };
    });
  };

  const handleSaveProfile = async () => {
    const db = await getDatabase();
    const updatedIso = new Date().toISOString();
    const normalized = normalizeUserProfile({
      ...localProfile,
      updated_at: updatedIso,
    });

    await db.execute(
      `UPDATE user_profiles SET
        current_jlpt = ?,
        target_jlpt = ?,
        target_industries = ?,
        industry_blend_ratio = ?,
        daily_goal = ?,
        updated_at = ?
      WHERE id = ?;`,
      [
        normalized.current_jlpt,
        normalized.target_jlpt,
        JSON.stringify(normalized.target_industries),
        normalized.industry_blend_ratio,
        normalized.daily_goal,
        updatedIso,
        normalized.id,
      ]
    );

    onProfileUpdated(normalized);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleSyncNow = () => {
    syncManager.triggerSync();
  };

  const industryDisplayLabel =
    safeTargetIndustries.length > 0
      ? safeTargetIndustries
          .map((id) => ALL_INDUSTRY_TRACKS.find((t) => t.id === id)?.short || id)
          .join(" + ")
      : "Regular JLPT Requirements (Core)";

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Zero-Review Onboarding Card */}
      {totalReviews === 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 rounded-[var(--card-radius)] border border-accent/30 bg-gradient-to-r from-accent/10 to-purple-500/10 shadow-glass"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center shrink-0 shadow-neon-glow">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-primary flex items-center gap-2">
                  <span>Welcome to JLPT Verb & Grammar Studio!</span>
                </h3>
                <p className="text-xs text-primary-muted mt-1 leading-relaxed">
                  Your dual-axis FSRS memory engine is calibrated and ready. Complete your first study
                  session in <strong>Present</strong> or take a <strong>Quiz</strong> to start tracking memory retention curves.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              {onNavigateToPresent && (
                <button
                  onClick={onNavigateToPresent}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-transform active:scale-95 shadow-neon-glow"
                >
                  <span>Start Present</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              {onNavigateToQuiz && (
                <button
                  onClick={onNavigateToQuiz}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl glass-panel hover:bg-surface-hover text-primary text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Take Quiz</span>
                  <BookOpen className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Top Dual Side-by-Side Readiness Meters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* JLPT Exam Readiness Meter */}
        <div className="glass-card p-6 rounded-[var(--card-radius)] border border-border-glass relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-primary">JLPT Exam Readiness</h3>
                <p className="text-xs text-primary-muted">Target: {localProfile.target_jlpt}</p>
              </div>
            </div>
            <span className="text-3xl font-extrabold text-indigo-400 tabular-nums">
              {examReadiness}%
            </span>
          </div>

          <div className="w-full h-3 bg-border-glass rounded-full overflow-hidden mt-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(0, examReadiness))}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full bg-indigo-500 rounded-full"
            />
          </div>
          <p className="text-xs text-primary-muted mt-2">
            Calculated across {examVerbs.length} {localProfile.target_jlpt} verbs.
          </p>
        </div>

        {/* Industry Career Readiness Meter */}
        <div className="glass-card p-6 rounded-[var(--card-radius)] border border-border-glass relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-primary">Career Track Readiness</h3>
                <p className="text-xs text-primary-muted truncate max-w-[180px]">
                  {industryDisplayLabel}
                </p>
              </div>
            </div>
            <span className="text-3xl font-extrabold text-sky-400 tabular-nums">
              {industryReadiness}%
            </span>
          </div>

          <div className="w-full h-3 bg-border-glass rounded-full overflow-hidden mt-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(0, industryReadiness))}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full bg-sky-500 rounded-full"
            />
          </div>
          <p className="text-xs text-primary-muted mt-2">
            Calculated across {industryVerbs.length} verbs.
          </p>
        </div>
      </div>

      {/* Goal Calibration Panel */}
      <div className="glass-card p-6 md:p-8 rounded-[var(--card-radius)] border border-border-glass shadow-glass">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <Target className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-bold text-primary">Goal Calibration</h2>
          </div>
          {saveSuccess && (
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Changes saved!
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Target JLPT Level */}
          <div>
            <label className="block text-xs font-semibold text-primary-muted uppercase tracking-wider mb-2">
              Target JLPT Level Goal
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(["N5", "N4", "N3", "N2", "N1"] as JlptLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setLocalProfile({ ...localProfile, target_jlpt: lvl })}
                  className={cn(
                    "py-2.5 rounded-xl font-bold text-xs transition-all border",
                    localProfile.target_jlpt === lvl
                      ? "bg-accent text-white border-accent shadow-neon-glow"
                      : "glass-panel text-primary-muted hover:text-primary border-border-glass"
                  )}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Current JLPT Level */}
          <div>
            <label className="block text-xs font-semibold text-primary-muted uppercase tracking-wider mb-2">
              Current Baseline JLPT
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(["N5", "N4", "N3", "N2", "N1"] as JlptLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setLocalProfile({ ...localProfile, current_jlpt: lvl })}
                  className={cn(
                    "py-2.5 rounded-xl font-bold text-xs transition-all border",
                    localProfile.current_jlpt === lvl
                      ? "bg-accent text-white border-accent shadow-neon-glow"
                      : "glass-panel text-primary-muted hover:text-primary border-border-glass"
                  )}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-Select Target Career Industry Tracks */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-primary-muted uppercase tracking-wider">
                Career Industry Tracks (Multi-Select)
              </label>
              <span className="text-[11px] text-accent font-medium">
                {safeTargetIndustries.length === 0
                  ? "Core JLPT default active"
                  : `${safeTargetIndustries.length} track${safeTargetIndustries.length > 1 ? "s" : ""} selected`}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_INDUSTRY_TRACKS.map((track) => {
                const isSelected = safeTargetIndustries.includes(track.id);
                return (
                  <button
                    key={track.id}
                    onClick={() => toggleIndustryTrack(track.id)}
                    className={cn(
                      "p-3 rounded-xl text-left text-xs font-medium transition-all border flex items-center justify-between",
                      isSelected
                        ? "bg-accent/20 border-accent text-white shadow-neon-glow"
                        : "glass-panel border-border-glass text-primary-muted hover:text-primary hover:border-border-glass/80"
                    )}
                  >
                    <span>{track.label}</span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0 ml-1.5" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-primary-muted mt-1.5 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>
                Selecting 0 tracks defaults to <strong>Regular JLPT Requirements</strong> so you only study exam-required verbs.
              </span>
            </p>
          </div>

          {/* Exam vs. Industry Blend Ratio Slider */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between text-xs font-semibold mb-2">
              <span className="text-primary-muted uppercase tracking-wider">
                Exam vs. Industry Priority Blend Ratio
              </span>
              <span className="text-accent font-bold">
                {Math.round(localProfile.industry_blend_ratio * 100)}% Exam /{" "}
                {Math.round((1 - localProfile.industry_blend_ratio) * 100)}% Industry
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={localProfile.industry_blend_ratio}
              onChange={(e) =>
                setLocalProfile({
                  ...localProfile,
                  industry_blend_ratio: parseFloat(e.target.value),
                })
              }
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-primary-muted mt-1">
              <span>More Industry-focused</span>
              <span>Balanced (70/30 Recommended)</span>
              <span>More Exam-focused</span>
            </div>
          </div>

          {/* Daily Verb Target */}
          <div>
            <label className="block text-xs font-semibold text-primary-muted uppercase tracking-wider mb-2">
              Daily Target Review Goal
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[10, 15, 25, 50].map((goal) => (
                <button
                  key={goal}
                  onClick={() => setLocalProfile({ ...localProfile, daily_goal: goal })}
                  className={cn(
                    "py-2 rounded-xl text-xs font-bold transition-all border",
                    localProfile.daily_goal === goal
                      ? "bg-accent text-white border-accent"
                      : "glass-panel text-primary-muted hover:text-primary border-border-glass"
                  )}
                >
                  {goal} verbs
                </button>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-end">
            <button
              onClick={handleSaveProfile}
              className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-sm transition-transform active:scale-98 shadow-neon-glow"
            >
              Apply Calibrated Goals
            </button>
          </div>
        </div>
      </div>

      {/* FSRS Mastery Distribution & Memory Retention */}
      <div className="glass-card p-6 md:p-8 rounded-[var(--card-radius)] border border-border-glass">
        <h3 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" />
          <span>FSRS Memory Retention & Mastery Distribution</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl glass-panel text-center">
            <span className="text-xs text-primary-muted font-medium block mb-1">Mastered</span>
            <span className="text-2xl font-bold text-emerald-400">{tierCounts.Mastered}</span>
            <span className="text-[10px] text-primary-muted block mt-1">80%+ retention</span>
          </div>

          <div className="p-4 rounded-xl glass-panel text-center">
            <span className="text-xs text-primary-muted font-medium block mb-1">Familiar</span>
            <span className="text-2xl font-bold text-amber-400">{tierCounts.Familiar}</span>
            <span className="text-[10px] text-primary-muted block mt-1">40-79% stability</span>
          </div>

          <div className="p-4 rounded-xl glass-panel text-center">
            <span className="text-xs text-primary-muted font-medium block mb-1">Struggling</span>
            <span className="text-2xl font-bold text-rose-400">{tierCounts.Struggling}</span>
            <span className="text-[10px] text-primary-muted block mt-1">&lt;40% lapses</span>
          </div>

          <div className="p-4 rounded-xl glass-panel text-center">
            <span className="text-xs text-primary-muted font-medium block mb-1">Unseen</span>
            <span className="text-2xl font-bold text-primary-muted">{tierCounts.Unseen}</span>
            <span className="text-[10px] text-primary-muted block mt-1">Queued</span>
          </div>
        </div>
      </div>

      {/* Neon Serverless Multi-Device Sync Card */}
      <div className="glass-card p-6 rounded-[var(--card-radius)] border border-border-glass">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl glass-panel flex items-center justify-center text-accent">
              {syncState.isOnline ? (
                <Cloud className="w-5 h-5 text-emerald-400" />
              ) : (
                <CloudOff className="w-5 h-5 text-rose-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-primary">Multi-Device Cloud Sync</h4>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-semibold",
                    syncState.isOnline ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                  )}
                >
                  {syncState.isOnline ? "Online" : "Offline"}
                </span>
              </div>
              <p className="text-xs text-primary-muted mt-0.5">
                {syncState.pendingCount > 0
                  ? `${syncState.pendingCount} local updates pending sync`
                  : "All local verb progress synced"}
              </p>
            </div>
          </div>

          <button
            onClick={handleSyncNow}
            disabled={syncState.isSyncing}
            className="px-4 py-2.5 rounded-xl glass-panel hover:bg-surface-hover text-xs font-semibold text-primary flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", syncState.isSyncing && "animate-spin")} />
            <span>{syncState.isSyncing ? "Syncing..." : "Sync Now"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
