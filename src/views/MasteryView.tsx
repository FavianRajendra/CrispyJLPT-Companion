import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Award,
  Target,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Flame,
  TrendingUp,
  Trophy,
  BookOpen,
  Layers,
} from "lucide-react";
import {
  Verb,
  UserProfile,
  VerbProgress,
  JlptLevel,
  IndustryTrack,
  getDatabase,
} from "../lib/db";
import seedKanji from "../data/seed_kanji.json";

export interface MasteryViewProps {
  verbs: Verb[];
  profile: UserProfile;
  progressMap?: Map<number, VerbProgress> | Record<number, VerbProgress>;
  onUpdateProfile: (updated: UserProfile) => void | Promise<void>;
}

interface DailyCheckinRow {
  date_key: string;
  reviews_count: number;
  quizzes_count: number;
  checked_in_at: string;
}

interface SeedKanjiItem {
  character: string;
  jlpt_level: JlptLevel;
  meanings: string[];
}

interface JlptOfficialThreshold {
  level: JlptLevel;
  totalMax: number;
  passScore: number;
  passPct: number;
  langReadingMin: string;
  listeningMin: string;
  approxVocabKanji: string;
  benchmarkKanji: number;
}

const ALL_SEED_KANJI = seedKanji as unknown as SeedKanjiItem[];
const KANJI_RE = /[\u4e00-\u9faf\u3400-\u4dbf]/g;
const MASTERY_THRESHOLD = 0.8; // 80% combined reading + meaning FSRS score

const OFFICIAL_JLPT_GRADES: JlptOfficialThreshold[] = [
  {
    level: "N5",
    totalMax: 180,
    passScore: 80,
    passPct: 44.4,
    langReadingMin: "19 / 120 pts",
    listeningMin: "19 / 60 pts",
    approxVocabKanji: "~800 words / ~100 kanji",
    benchmarkKanji: 103,
  },
  {
    level: "N4",
    totalMax: 180,
    passScore: 90,
    passPct: 50.0,
    langReadingMin: "38 / 120 pts",
    listeningMin: "19 / 60 pts",
    approxVocabKanji: "~1,500 words / ~300 kanji",
    benchmarkKanji: 284,
  },
  {
    level: "N3",
    totalMax: 180,
    passScore: 95,
    passPct: 52.8,
    langReadingMin: "19/60 Vocab • 19/60 Read",
    listeningMin: "19 / 60 pts",
    approxVocabKanji: "~3,750 words / ~650 kanji",
    benchmarkKanji: 650,
  },
  {
    level: "N2",
    totalMax: 180,
    passScore: 90,
    passPct: 50.0,
    langReadingMin: "19/60 Vocab • 19/60 Read",
    listeningMin: "19 / 60 pts",
    approxVocabKanji: "~6,000 words / ~1,000 kanji",
    benchmarkKanji: 1020,
  },
  {
    level: "N1",
    totalMax: 180,
    passScore: 100,
    passPct: 55.6,
    langReadingMin: "19/60 Vocab • 19/60 Read",
    listeningMin: "19 / 60 pts",
    approxVocabKanji: "~10,000 words / ~2,000 kanji",
    benchmarkKanji: 2211,
  },
];

const JLPT_LEVELS: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

const INDUSTRY_TRACKS: Array<{ id: IndustryTrack; label: string }> = [
  { id: "general", label: "General" },
  { id: "it", label: "IT & Engineering" },
  { id: "finance", label: "Finance & Banking" },
  { id: "fnb", label: "Hospitality & F&B" },
  { id: "healthcare", label: "Healthcare" },
  { id: "manufacturing", label: "Manufacturing" },
];

function safeGetProgress(
  map: Map<number, VerbProgress> | Record<number, VerbProgress> | undefined,
  verbId: number
): VerbProgress | undefined {
  if (!map) return undefined;
  if (typeof (map as Map<number, VerbProgress>).get === "function") {
    return (map as Map<number, VerbProgress>).get(verbId);
  }
  return (map as Record<number, VerbProgress>)[verbId];
}

function safeProgressValues(
  map: Map<number, VerbProgress> | Record<number, VerbProgress> | undefined
): VerbProgress[] {
  if (!map) return [];
  if (typeof (map as Map<number, VerbProgress>).values === "function") {
    return Array.from((map as Map<number, VerbProgress>).values());
  }
  return Object.values(map);
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getFishMascotForStreak(streak: number): {
  emote: string;
  rankTitle: string;
} {
  if (streak >= 30) return { emote: "🐋", rankTitle: "Legendary JLPT Whale" };
  if (streak >= 14) return { emote: "🦈", rankTitle: "Apex Kanji Shark" };
  if (streak >= 7) return { emote: "🐡", rankTitle: "Pufferfish Scholar" };
  if (streak >= 3) return { emote: "🐠", rankTitle: "Tropical Reef Learner" };
  return { emote: "🐟", rankTitle: "Freshwater Fry" };
}

function safeIndustriesArray(raw: unknown): IndustryTrack[] {
  if (Array.isArray(raw)) return raw as IndustryTrack[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as IndustryTrack[];
    } catch {
      return [];
    }
  }
  return [];
}

function extractKanjiFromItem(item: Verb): string[] {
  if (Array.isArray(item.constituent_kanji) && item.constituent_kanji.length > 0) {
    return Array.from(new Set(item.constituent_kanji));
  }
  return Array.from(new Set(item.kanji_form.match(KANJI_RE) || []));
}

export const MasteryView: React.FC<MasteryViewProps> = ({
  verbs = [],
  profile,
  progressMap,
  onUpdateProfile,
}) => {
  const [checkins, setCheckins] = useState<DailyCheckinRow[]>([]);
  const [trophyFilter, setTrophyFilter] = useState<"mastered" | "logged">("mastered");
  const [quizStats, setQuizStats] = useState<{
    totalAnswered: number;
    correctCount: number;
    idkCount: number;
    flaggedGrammarCount: number;
  }>({
    totalAnswered: 0,
    correctCount: 0,
    idkCount: 0,
    flaggedGrammarCount: 0,
  });

  const todayKey = formatDateKey(new Date());

  const loadStreakAndQuizTelemetry = useCallback(async () => {
    try {
      const db = await getDatabase();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS daily_checkins (
          date_key TEXT PRIMARY KEY,
          reviews_count INTEGER NOT NULL DEFAULT 0,
          quizzes_count INTEGER NOT NULL DEFAULT 0,
          checked_in_at TEXT NOT NULL
        );
      `);
      const rows = await db.select<DailyCheckinRow[]>(
        `SELECT * FROM daily_checkins ORDER BY date_key DESC LIMIT 60;`
      );
      setCheckins(rows || []);

      const checkinSet = new Set((rows || []).map((r) => r.date_key));
      let streak = 0;
      const cursor = new Date();
      if (!checkinSet.has(formatDateKey(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
      }
      while (checkinSet.has(formatDateKey(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }

      const todayRow = (rows || []).find((r) => r.date_key === todayKey);
      try {
        localStorage.setItem(
          "crispyjlpt_streak_widget",
          JSON.stringify({
            streakCount: streak,
            checkedInToday: Boolean(todayRow),
            todayReviews: todayRow?.reviews_count ?? 0,
            dailyGoal: profile?.daily_goal || 15,
            fishEmote: getFishMascotForStreak(streak).emote,
          })
        );
      } catch {
        // ignore storage errors
      }

      let totalAnswered = 0;
      let correctCount = 0;
      let idkCount = 0;
      let flaggedGrammarCount = 0;

      try {
        const qRows = await db.select<
          Array<{ is_correct: number; is_idk?: number }>
        >(`SELECT is_correct, is_idk FROM quiz_history;`);
        if (qRows) {
          totalAnswered = qRows.length;
          correctCount = qRows.filter((q) => q.is_correct === 1).length;
          idkCount = qRows.filter((q) => q.is_idk === 1).length;
        }
      } catch {
        // table may not exist yet
      }

      try {
        const gRows = await db.select<Array<{ question_id: string }>>(
          `SELECT question_id FROM grammar_flagged_idk;`
        );
        if (gRows) {
          flaggedGrammarCount = gRows.length;
        }
      } catch {
        // table may not exist yet
      }

      setQuizStats({
        totalAnswered,
        correctCount,
        idkCount,
        flaggedGrammarCount,
      });
    } catch (err) {
      console.warn("[MasteryView] Failed to load streak/quiz stats:", err);
    }
  }, [todayKey, profile?.daily_goal]);

  useEffect(() => {
    loadStreakAndQuizTelemetry();
    const onRefresh = () => loadStreakAndQuizTelemetry();
    window.addEventListener("daily-streak-updated", onRefresh);
    return () => window.removeEventListener("daily-streak-updated", onRefresh);
  }, [loadStreakAndQuizTelemetry]);

  const handleManualDailyCheckin = async () => {
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO daily_checkins (date_key, reviews_count, quizzes_count, checked_in_at)
         VALUES (?, 1, 0, ?)
         ON CONFLICT(date_key) DO UPDATE SET
           checked_in_at = excluded.checked_in_at;`,
        [todayKey, now]
      );
      await loadStreakAndQuizTelemetry();
    } catch (err) {
      console.warn("[MasteryView] Check-in failed:", err);
    }
  };

  const { currentStreak, checkedInToday, last7Days, todayReviews } = useMemo(() => {
    const map = new Map<string, DailyCheckinRow>();
    for (const r of checkins) {
      map.set(r.date_key, r);
    }

    const doneToday = map.has(todayKey);
    let streak = 0;
    const cursor = new Date();
    if (!doneToday) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (map.has(formatDateKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    const days: Array<{
      dateKey: string;
      dayLabel: string;
      checked: boolean;
      isToday: boolean;
    }> = [];
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      const key = formatDateKey(d);
      const label = d.toLocaleDateString(undefined, { weekday: "short" });
      days.push({
        dateKey: key,
        dayLabel: label,
        checked: map.has(key),
        isToday: key === todayKey,
      });
    }

    return {
      currentStreak: streak,
      checkedInToday: doneToday,
      last7Days: days,
      todayReviews: map.get(todayKey)?.reviews_count ?? 0,
    };
  }, [checkins, todayKey]);

  const fishMascot = getFishMascotForStreak(currentStreak);

  // =========================================================================
  // TROPHY & MILESTONE ENGINE (Kanji Logged, Kanji Mastered, Verbs Mastered)
  // =========================================================================
  const trophyMetrics = useMemo(() => {
    const kanjiInfoMap = new Map<string, SeedKanjiItem>();
    for (const k of ALL_SEED_KANJI) {
      kanjiInfoMap.set(k.character, k);
    }

    // Track score sums & counts per kanji character from reviewed/scored items
    const kanjiAccumulator = new Map<
      string,
      { totalScore: number; count: number; maxScore: number }
    >();

    let loggedVerbsCount = 0;
    let masteredVerbsCount = 0;
    let totalVerbsCount = 0;

    let loggedOtherVocabCount = 0;
    let masteredOtherVocabCount = 0;
    let totalOtherVocabCount = 0;

    for (const item of verbs) {
      const cat = (item as Verb & { category?: string }).category || "verb";
      const isVerb = cat === "verb";
      if (isVerb) totalVerbsCount++;
      else totalOtherVocabCount++;

      const prog = safeGetProgress(progressMap, item.id);
      if (!prog) continue;

      const avgScore = (prog.reading_score + prog.meaning_score) / 2;
      const isLogged = prog.repetitions > 0 || avgScore > 0;
      const isMastered = avgScore >= MASTERY_THRESHOLD;

      if (isLogged) {
        if (isVerb) loggedVerbsCount++;
        else loggedOtherVocabCount++;
      }
      if (isMastered) {
        if (isVerb) masteredVerbsCount++;
        else masteredOtherVocabCount++;
      }

      if (isLogged) {
        const chars = extractKanjiFromItem(item);
        for (const ch of chars) {
          const prev = kanjiAccumulator.get(ch) || {
            totalScore: 0,
            count: 0,
            maxScore: 0,
          };
          kanjiAccumulator.set(ch, {
            totalScore: prev.totalScore + avgScore,
            count: prev.count + 1,
            maxScore: Math.max(prev.maxScore, avgScore),
          });
        }
      }
    }

    const loggedKanjiList: Array<{
      character: string;
      jlpt_level: JlptLevel;
      meaning: string;
      scorePct: number;
      isMastered: boolean;
    }> = [];

    for (const [char, stats] of kanjiAccumulator.entries()) {
      const avg = stats.totalScore / stats.count;
      // Consider a kanji mastered if its average score across studied words >= 80%
      // OR its strongest studied word reaches >= 85%
      const isMastered = avg >= MASTERY_THRESHOLD || stats.maxScore >= 0.85;
      const meta = kanjiInfoMap.get(char);

      loggedKanjiList.push({
        character: char,
        jlpt_level: meta?.jlpt_level || "N5",
        meaning: meta?.meanings?.[0] || "Kanji",
        scorePct: Math.round(Math.max(avg, stats.maxScore) * 100),
        isMastered,
      });
    }

    // Sort mastered first, then highest score
    loggedKanjiList.sort(
      (a, b) =>
        Number(b.isMastered) - Number(a.isMastered) || b.scorePct - a.scorePct
    );

    const masteredKanjiList = loggedKanjiList.filter((k) => k.isMastered);

    // Level-by-level breakdown (N5 -> N1)
    const levelBreakdown = JLPT_LEVELS.map((lvl) => {
      const totalKanjiInLevel =
        ALL_SEED_KANJI.filter((k) => k.jlpt_level === lvl).length ||
        OFFICIAL_JLPT_GRADES.find((g) => g.level === lvl)?.benchmarkKanji ||
        100;
      const masteredInLevel = masteredKanjiList.filter(
        (k) => k.jlpt_level === lvl
      ).length;
      const loggedInLevel = loggedKanjiList.filter(
        (k) => k.jlpt_level === lvl
      ).length;

      return {
        level: lvl,
        totalKanji: totalKanjiInLevel,
        masteredKanji: masteredInLevel,
        loggedKanji: loggedInLevel,
        pct: Math.min(
          100,
          Math.round((masteredInLevel / Math.max(1, totalKanjiInLevel)) * 100)
        ),
      };
    });

    return {
      loggedKanjiCount: loggedKanjiList.length,
      masteredKanjiCount: masteredKanjiList.length,
      totalSeedKanji: ALL_SEED_KANJI.length || 2211,
      loggedVerbsCount,
      masteredVerbsCount,
      totalVerbsCount,
      loggedOtherVocabCount,
      masteredOtherVocabCount,
      totalOtherVocabCount,
      loggedKanjiList,
      masteredKanjiList,
      levelBreakdown,
    };
  }, [verbs, progressMap]);

  const analytics = useMemo(() => {
    const targetLvl = profile?.target_jlpt || "N5";
    const activeIndustries = safeIndustriesArray(profile?.target_industries);

    const targetVerbs = verbs.filter((v) => v.jlpt_level === targetLvl);
    const industryVerbs =
      activeIndustries.length > 0
        ? verbs.filter(
            (v) =>
              Array.isArray(v.industry_tags) &&
              v.industry_tags.some((t) => activeIndustries.includes(t))
          )
        : targetVerbs;

    const computeAverageMastery = (subset: Verb[]) => {
      if (subset.length === 0) return 0;
      let sum = 0;
      for (const v of subset) {
        const p = safeGetProgress(progressMap, v.id);
        if (p) {
          sum += (p.reading_score + p.meaning_score) / 2;
        }
      }
      return sum / subset.length;
    };

    const corpusRetention = computeAverageMastery(targetVerbs);
    const industryRetention = computeAverageMastery(industryVerbs);

    const jlptReadinessPct = Math.round(corpusRetention * 100);
    const industryReadinessPct = Math.round(industryRetention * 100);

    const honestQuizAccuracy =
      quizStats.totalAnswered > 0
        ? quizStats.correctCount / quizStats.totalAnswered
        : corpusRetention;

    const idkPenalty = Math.min(
      0.15,
      (quizStats.idkCount + quizStats.flaggedGrammarCount) * 0.01
    );

    const streakFactor = Math.min(1, currentStreak / 14);
    const compositeSkill = Math.max(
      0,
      Math.min(
        1,
        corpusRetention * 0.5 +
          honestQuizAccuracy * 0.35 +
          streakFactor * 0.15 -
          idkPenalty
      )
    );

    const estimatedScore = Math.round(compositeSkill * 180);
    const officialThreshold =
      OFFICIAL_JLPT_GRADES.find((g) => g.level === targetLvl) ||
      OFFICIAL_JLPT_GRADES[0];

    const scoreMargin = estimatedScore - officialThreshold.passScore;
    const rawPassProb = 1 / (1 + Math.exp(-scoreMargin / 12));
    const passProbabilityPct = Math.max(
      1,
      Math.min(99, Math.round(rawPassProb * 100))
    );

    const clearsOverall = estimatedScore >= officialThreshold.passScore;

    return {
      targetLvl,
      targetCount: targetVerbs.length,
      reviewedCount: safeProgressValues(progressMap).filter(
        (p) => p.repetitions > 0
      ).length,
      jlptReadinessPct,
      industryReadinessPct,
      estimatedScore,
      officialThreshold,
      passProbabilityPct,
      clearsOverall,
      honestQuizAccuracyPct: Math.round(honestQuizAccuracy * 100),
    };
  }, [verbs, profile, progressMap, quizStats, currentStreak]);

  const toggleProfileIndustry = (track: IndustryTrack) => {
    if (!profile) return;
    const current = safeIndustriesArray(profile.target_industries);
    const updated = current.includes(track)
      ? current.filter((t) => t !== track)
      : [...current, track];
    onUpdateProfile({
      ...profile,
      target_industries: updated,
    });
  };

  const displayedTrophyKanji =
    trophyFilter === "mastered"
      ? trophyMetrics.masteredKanjiList
      : trophyMetrics.loggedKanjiList;

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24 md:pb-10">
      {/* 1. Daily Fish Streak Banner */}
      <div className="p-5 sm:p-6 rounded-3xl glass-card border border-accent/30 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center text-3xl select-none">
              {fishMascot.emote}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-primary flex items-center gap-1.5">
                  <span>{currentStreak}-Day Fish Streak</span>
                  <Flame className="w-5 h-5 text-amber-400" />
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-accent/15 text-accent text-[11px] font-bold">
                  {fishMascot.rankTitle}
                </span>
              </div>
              <p className="text-xs text-primary-muted mt-0.5">
                Today's activity: {todayReviews} / {profile?.daily_goal || 15}{" "}
                items • Keep your fish swimming daily!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleManualDailyCheckin}
            className={`min-h-[44px] px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
              checkedInToday
                ? "bg-emerald-500/20 border border-emerald-400/50 text-emerald-300"
                : "bg-accent text-white shadow-neon-glow hover:opacity-95"
            }`}
          >
            <span>
              {checkedInToday
                ? `${fishMascot.emote} Checked In Today!`
                : "🐟 Daily Check-In (+1 Streak)"}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 pt-1">
          {last7Days.map((day) => (
            <div
              key={day.dateKey}
              className={`p-2.5 rounded-2xl border text-center transition-all ${
                day.checked
                  ? "bg-accent/15 border-accent text-primary"
                  : day.isToday
                  ? "glass-panel border-amber-400/50 text-amber-300"
                  : "glass-panel border-border-glass text-primary-muted opacity-65"
              }`}
            >
              <div className="text-[10px] font-bold uppercase">
                {day.dayLabel}
              </div>
              <div className="text-xl my-1">
                {day.checked ? "🐟" : day.isToday ? "🫧" : "·"}
              </div>
              <div className="text-[10px] font-semibold">
                {day.checked ? "Done" : day.isToday ? "Today" : "Missed"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. NEW: Trophy & Milestone Showcase (Logged Kanji, Mastered Kanji, Mastered Verbs & Vocab) */}
      <div className="p-5 sm:p-6 rounded-3xl glass-card border border-amber-400/30 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-primary flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <span>Your JLPT Trophy Cabinet & Mastery Milestones</span>
            </h3>
            <p className="text-xs text-primary-muted">
              Calculated live from your FSRS reading & meaning scores (≥80% retention = Mastered)
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-bold">
            {analytics.reviewedCount.toLocaleString()} Total Reviews Logged
          </span>
        </div>

        {/* 4 Hero Milestone Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/15 to-amber-600/5 border border-amber-400/35 space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
              <span>Mastered Kanji</span>
              <Trophy className="w-4 h-4" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-primary tabular-nums">
              {trophyMetrics.masteredKanjiCount.toLocaleString()}
              <span className="text-xs font-normal text-primary-muted ml-1">
                / {trophyMetrics.totalSeedKanji.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-primary-muted">
              Characters ≥80% FSRS retention
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-500/15 to-sky-600/5 border border-sky-400/35 space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-sky-300">
              <span>Logged Kanji</span>
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-primary tabular-nums">
              {trophyMetrics.loggedKanjiCount.toLocaleString()}
              <span className="text-xs font-normal text-primary-muted ml-1">
                chars
              </span>
            </div>
            <p className="text-[11px] text-primary-muted">
              Unique kanji encountered & scored
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-600/5 border border-emerald-400/35 space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-300">
              <span>Mastered Verbs</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-primary tabular-nums">
              {trophyMetrics.masteredVerbsCount.toLocaleString()}
              <span className="text-xs font-normal text-primary-muted ml-1">
                / {trophyMetrics.totalVerbsCount.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-primary-muted">
              {trophyMetrics.loggedVerbsCount.toLocaleString()} verbs logged in FSRS
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/15 to-purple-600/5 border border-purple-400/35 space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-purple-300">
              <span>Mastered Vocab</span>
              <Layers className="w-4 h-4" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-primary tabular-nums">
              {trophyMetrics.masteredOtherVocabCount.toLocaleString()}
              <span className="text-xs font-normal text-primary-muted ml-1">
                / {trophyMetrics.totalOtherVocabCount.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-primary-muted">
              Nouns, adjectives & time words
            </p>
          </div>
        </div>

        {/* JLPT N5 -> N1 Kanji Mastery Progress Ladder */}
        <div className="p-4 rounded-2xl glass-panel border border-border-glass space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-primary">
              Kanji Mastery Progress Across JLPT Levels (N5 → N1)
            </span>
            <span className="text-primary-muted">
              Mastered / Total Level Kanji
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            {trophyMetrics.levelBreakdown.map((lvlStat) => {
              const isCurrentTarget = lvlStat.level === profile?.target_jlpt;
              return (
                <div
                  key={lvlStat.level}
                  className={`p-3 rounded-xl border space-y-1.5 ${
                    isCurrentTarget
                      ? "bg-accent/15 border-accent"
                      : "bg-surface-card/60 border-border-glass"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-primary">
                      {lvlStat.level}
                    </span>
                    <span className="font-bold text-accent tabular-nums">
                      {lvlStat.pct}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500"
                      style={{ width: `${lvlStat.pct}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-primary-muted tabular-nums">
                    <strong className="text-primary">
                      {lvlStat.masteredKanji}
                    </strong>{" "}
                    / {lvlStat.totalKanji} mastered
                  </div>
                  <div className="text-[10px] text-primary-muted">
                    ({lvlStat.loggedKanji} logged)
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Interactive Mastered & Logged Kanji Wall */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 p-1 rounded-xl glass-panel border border-border-glass text-xs">
              <button
                type="button"
                onClick={() => setTrophyFilter("mastered")}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  trophyFilter === "mastered"
                    ? "bg-amber-500 text-slate-950"
                    : "text-primary-muted hover:text-primary"
                }`}
              >
                🏆 Mastered Kanji Wall ({trophyMetrics.masteredKanjiCount})
              </button>
              <button
                type="button"
                onClick={() => setTrophyFilter("logged")}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  trophyFilter === "logged"
                    ? "bg-accent text-white"
                    : "text-primary-muted hover:text-primary"
                }`}
              >
                📘 All Logged Kanji ({trophyMetrics.loggedKanjiCount})
              </button>
            </div>

            <span className="text-[11px] text-primary-muted">
              Every kanji you master in Flashcards or Quiz is immortalized here
            </span>
          </div>

          {displayedTrophyKanji.length === 0 ? (
            <div className="p-6 rounded-2xl glass-panel border border-border-glass text-center text-xs text-primary-muted">
              {trophyFilter === "mastered"
                ? "No kanji at ≥80% mastery yet — rate words 'Easy' in Present or ace them in Quiz to unlock your first kanji trophy!"
                : "Start reviewing words in Present or Quiz to begin logging kanji characters here."}
            </div>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 max-h-[240px] overflow-y-auto pr-1">
              {displayedTrophyKanji.map((item) => (
                <div
                  key={item.character}
                  title={`${item.character} (${item.jlpt_level}) — ${item.meaning} • ${item.scorePct}% mastery`}
                  className={`p-2 rounded-xl border text-center flex flex-col items-center justify-center ${
                    item.isMastered
                      ? "bg-amber-500/15 border-amber-400/50 text-amber-200"
                      : "glass-panel border-border-glass text-primary"
                  }`}
                >
                  <span className="font-jp text-xl font-extrabold leading-tight">
                    {item.character}
                  </span>
                  <span className="text-[9px] font-bold opacity-85">
                    {item.scorePct}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. JLPT Passability Estimator & Exam Calibration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-3xl glass-card border border-border-glass space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-primary flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-accent" />
                <span>JLPT {analytics.targetLvl} Passability Estimator</span>
              </h3>
              <p className="text-xs text-primary-muted">
                Predicted from FSRS retention, honest quiz accuracy (excluding
                gacha guesses), and study streak
              </p>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                analytics.clearsOverall
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                  : "bg-amber-500/20 text-amber-300 border border-amber-400/40"
              }`}
            >
              {analytics.clearsOverall ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Projected PASS</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Below Pass Mark</span>
                </>
              )}
            </span>
          </div>

          <div className="p-4 rounded-2xl glass-panel border border-border-glass space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[11px] uppercase text-primary-muted font-semibold">
                  Estimated JLPT {analytics.targetLvl} Score
                </div>
                <div className="text-3xl font-bold text-primary tabular-nums">
                  {analytics.estimatedScore}{" "}
                  <span className="text-sm font-normal text-primary-muted">
                    / 180 pts
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] uppercase text-primary-muted font-semibold">
                  Pass Likelihood
                </div>
                <div
                  className={`text-3xl font-bold tabular-nums ${
                    analytics.passProbabilityPct >= 65
                      ? "text-emerald-400"
                      : analytics.passProbabilityPct >= 40
                      ? "text-amber-400"
                      : "text-rose-400"
                  }`}
                >
                  {analytics.passProbabilityPct}%
                </div>
              </div>
            </div>

            <div className="relative h-4 rounded-full bg-surface-hover overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  analytics.clearsOverall ? "bg-emerald-500" : "bg-accent"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((analytics.estimatedScore / 180) * 100)
                  )}%`,
                }}
              />
              <div
                title={`Official ${analytics.targetLvl} Pass Mark: ${analytics.officialThreshold.passScore}/180`}
                className="absolute top-0 bottom-0 w-0.5 bg-amber-300 z-10"
                style={{
                  left: `${Math.round(
                    (analytics.officialThreshold.passScore / 180) * 100
                  )}%`,
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between text-[11px] text-primary-muted gap-2">
              <span>
                Official {analytics.targetLvl} Pass Mark:{" "}
                <strong className="text-amber-300">
                  {analytics.officialThreshold.passScore} / 180 pts (
                  {analytics.officialThreshold.passPct}%)
                </strong>
              </span>
              <span>
                Honest Quiz Accuracy:{" "}
                <strong className="text-primary">
                  {analytics.honestQuizAccuracyPct}%
                </strong>{" "}
                ({quizStats.idkCount} IDK flags)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl glass-panel border border-border-glass">
              <div className="text-xs text-primary-muted">
                {analytics.targetLvl} Corpus Retention
              </div>
              <div className="text-xl font-bold text-accent tabular-nums mt-0.5">
                {analytics.jlptReadinessPct}%
              </div>
              <div className="text-[11px] text-primary-muted">
                {analytics.targetCount.toLocaleString()} target-level items
              </div>
            </div>

            <div className="p-3.5 rounded-2xl glass-panel border border-border-glass">
              <div className="text-xs text-primary-muted">
                Industry Track Retention
              </div>
              <div className="text-xl font-bold text-cyan-400 tabular-nums mt-0.5">
                {analytics.industryReadinessPct}%
              </div>
              <div className="text-[11px] text-primary-muted">
                {analytics.reviewedCount.toLocaleString()} total items studied
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-3xl glass-card border border-border-glass space-y-4">
          <h3 className="text-sm font-bold text-primary flex items-center gap-2">
            <Target className="w-4 h-4 text-accent" />
            <span>Target Exam Calibration</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-primary-muted">
              Target JLPT Level
            </label>
            <div className="grid grid-cols-5 gap-1 p-1 rounded-xl glass-panel">
              {JLPT_LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() =>
                    profile && onUpdateProfile({ ...profile, target_jlpt: lvl })
                  }
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                    profile?.target_jlpt === lvl
                      ? "bg-accent text-white"
                      : "text-primary-muted hover:text-primary"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-primary-muted">
              Daily Study Goal: {profile?.daily_goal || 15} items/day
            </label>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={profile?.daily_goal || 15}
              onChange={(e) =>
                profile &&
                onUpdateProfile({
                  ...profile,
                  daily_goal: Number(e.target.value),
                })
              }
              className="w-full accent-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-primary-muted">
              Career Industry Tracks
            </label>
            <div className="flex flex-wrap gap-1.5">
              {INDUSTRY_TRACKS.map((tr) => {
                const active = safeIndustriesArray(
                  profile?.target_industries
                ).includes(tr.id);
                return (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => toggleProfileIndustry(tr.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                      active
                        ? "bg-accent/20 border-accent text-accent"
                        : "glass-panel border-border-glass text-primary-muted hover:text-primary"
                    }`}
                  >
                    {tr.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Official JLPT Passing Grades Reference Table */}
      <div className="p-5 rounded-3xl glass-card border border-border-glass space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-primary flex items-center gap-2">
            <Award className="w-4 h-4 text-accent" />
            <span>Official JLPT Passing Grades & Sectional Minimums (N5–N1)</span>
          </h3>
          <span className="text-[11px] text-primary-muted hidden sm:inline">
            Must pass BOTH Overall Score & every Sectional Minimum
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border-glass text-[11px] uppercase tracking-wider text-primary-muted">
                <th className="py-2.5 px-3">Level</th>
                <th className="py-2.5 px-3">Overall Pass Mark</th>
                <th className="py-2.5 px-3">Language / Reading Min</th>
                <th className="py-2.5 px-3">Listening Min</th>
                <th className="py-2.5 px-3">Target Benchmark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-glass">
              {OFFICIAL_JLPT_GRADES.map((row) => {
                const isTarget = row.level === profile?.target_jlpt;
                return (
                  <tr
                    key={row.level}
                    onClick={() =>
                      profile &&
                      onUpdateProfile({ ...profile, target_jlpt: row.level })
                    }
                    className={`cursor-pointer transition-colors ${
                      isTarget
                        ? "bg-accent/15 text-primary font-semibold"
                        : "hover:bg-surface-hover/50 text-primary-muted"
                    }`}
                  >
                    <td className="py-3 px-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                          isTarget
                            ? "bg-accent text-white"
                            : "glass-panel text-primary"
                        }`}
                      >
                        {row.level}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-primary tabular-nums">
                      {row.passScore} / {row.totalMax} ({row.passPct}%)
                    </td>
                    <td className="py-3 px-3">{row.langReadingMin}</td>
                    <td className="py-3 px-3">{row.listeningMin}</td>
                    <td className="py-3 px-3 text-xs">{row.approxVocabKanji}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-primary-muted pt-1">
          <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
          <span>
            Tip: Click any JLPT level row above to set it as your active target
            and recalculate your Passability Estimator immediately.
          </span>
        </div>
      </div>
    </div>
  );
};