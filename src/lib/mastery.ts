import { Verb, VerbProgress, UserProfile, JlptLevel, IndustryTrack, getDatabase } from "./db";

export type FsrsRating = "again" | "hard" | "easy";
export type MasteryTier = "Unseen" | "Struggling" | "Familiar" | "Mastered";

export interface VerbWithProgress extends Verb {
  progress?: VerbProgress;
  retention: number; // 0.0 - 1.0
  masteryScore: number; // 0 - 100
  tier: MasteryTier;
  priorityScore: number;
}

const JLPT_RANKS: Record<JlptLevel, number> = {
  N5: 1,
  N4: 2,
  N3: 3,
  N2: 4,
  N1: 5,
};

/**
 * Calculates FSRS memory retention R(t) = e^(-t / S)
 * @param lastReviewedIso ISO timestamp of last review
 * @param stabilityDays Memory stability S in days
 */
export function calculateRetention(lastReviewedIso: string | null, stabilityDays: number): number {
  if (!lastReviewedIso) return 0.0;
  const now = Date.now();
  const last = new Date(lastReviewedIso).getTime();
  const elapsedDays = Math.max(0, (now - last) / (1000 * 60 * 60 * 24));
  const s = Math.max(0.1, stabilityDays);
  return Math.exp(-elapsedDays / s);
}

/**
 * Computes the 0-100% Understanding Score combining Reading, Meaning, and Decay.
 */
export function calculateMasteryScore(
  readingScore: number,
  meaningScore: number,
  retention: number,
  repetitions: number
): number {
  if (repetitions === 0) return 0;
  const rawBase = readingScore * 0.5 + meaningScore * 0.5;
  const decayed = rawBase * retention;
  return Math.round(Math.min(100, Math.max(0, decayed * 100)));
}

/**
 * Assigns a human-readable mastery category.
 */
export function getMasteryTier(repetitions: number, score: number): MasteryTier {
  if (repetitions === 0) return "Unseen";
  if (score < 40) return "Struggling";
  if (score < 80) return "Familiar";
  return "Mastered";
}

/**
 * Calculates JLPT exam relevance score S_jlpt(v)
 */
function calculateJlptScore(verbLevel: JlptLevel, targetLevel: JlptLevel): number {
  const vRank = JLPT_RANKS[verbLevel] || 1;
  const tRank = JLPT_RANKS[targetLevel] || 4;

  if (vRank === tRank) return 1.0;
  if (vRank < tRank) return 0.85; // Foundation verbs below target level
  return 0.35; // Verbs above target level
}

/**
 * Calculates domain relevance score S_domain(v)
 */
function calculateDomainScore(verbTags: IndustryTrack[], targetIndustries: IndustryTrack[]): number {
  const matches = verbTags.some((tag) => targetIndustries.includes(tag));
  if (matches) return 1.0;
  if (verbTags.includes("general")) return 0.5;
  return 0.15;
}

/**
 * Calculates Session Priority Score:
 * P_v = (W_exam * S_jlpt(v)) + (W_industry * S_domain(v)) + (W_fsrs * U_decay(v))
 */
export function calculatePriorityScore(
  verb: Verb,
  progress: VerbProgress | undefined,
  profile: UserProfile
): number {
  const wExam = profile.industry_blend_ratio; // e.g. 0.70
  const wIndustry = 1.0 - wExam; // e.g. 0.30
  const wFsrs = 0.60;

  const sJlpt = calculateJlptScore(verb.jlpt_level, profile.target_jlpt);
  const sDomain = calculateDomainScore(verb.industry_tags, profile.target_industries);

  let uDecay = 1.0;
  if (progress && progress.repetitions > 0) {
    const r = calculateRetention(progress.last_reviewed_at, progress.stability_days);
    uDecay = 1.0 - r; // Higher urgency as memory fades
  }

  return wExam * sJlpt + wIndustry * sDomain + wFsrs * uDecay;
}

/**
 * FSRS Rating Updater
 * Updates memory stability, repetitions, scores, and schedules next review.
 */
export function updateFsrsProgress(
  current: VerbProgress | undefined,
  verbId: number,
  rating: FsrsRating,
  axisTested: "reading" | "meaning" | "both" = "both"
): VerbProgress {
  const now = new Date();
  const nowIso = now.toISOString();

  let readingScore = current?.reading_score ?? 0.0;
  let meaningScore = current?.meaning_score ?? 0.0;
  let stability = current?.stability_days ?? 1.0;
  let repetitions = current?.repetitions ?? 0;
  let lapses = current?.lapses ?? 0;

  switch (rating) {
    case "again": {
      lapses += 1;
      repetitions = 0;
      stability = Math.max(0.3, stability * 0.4);
      if (axisTested === "reading" || axisTested === "both") {
        readingScore = Math.max(0.1, readingScore * 0.6);
      }
      if (axisTested === "meaning" || axisTested === "both") {
        meaningScore = Math.max(0.1, meaningScore * 0.6);
      }
      break;
    }
    case "hard": {
      stability = Math.max(0.8, stability * 1.3);
      repetitions += 1;
      if (axisTested === "reading" || axisTested === "both") {
        readingScore = Math.min(1.0, readingScore + 0.15);
      }
      if (axisTested === "meaning" || axisTested === "both") {
        meaningScore = Math.min(1.0, meaningScore + 0.15);
      }
      break;
    }
    case "easy": {
      stability = Math.max(2.0, stability * 2.4 + 1.0);
      repetitions += 1;
      if (axisTested === "reading" || axisTested === "both") {
        readingScore = Math.min(1.0, readingScore + 0.35);
      }
      if (axisTested === "meaning" || axisTested === "both") {
        meaningScore = Math.min(1.0, meaningScore + 0.35);
      }
      break;
    }
  }

  // Next review scheduled in `stability` days
  const nextReviewDate = new Date(now.getTime() + stability * 24 * 60 * 60 * 1000);

  return {
    verb_id: verbId,
    reading_score: parseFloat(readingScore.toFixed(3)),
    meaning_score: parseFloat(meaningScore.toFixed(3)),
    stability_days: parseFloat(stability.toFixed(3)),
    repetitions,
    lapses,
    last_reviewed_at: nowIso,
    next_review_at: nextReviewDate.toISOString(),
    sync_dirty: 1,
    updated_at: nowIso,
  };
}

/**
 * Persist updated progress to local SQLite database.
 */
export async function saveVerbProgress(progress: VerbProgress): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO user_verb_progress (
      verb_id, reading_score, meaning_score, stability_days,
      repetitions, lapses, last_reviewed_at, next_review_at,
      sync_dirty, updated_at
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
      progress.verb_id,
      progress.reading_score,
      progress.meaning_score,
      progress.stability_days,
      progress.repetitions,
      progress.lapses,
      progress.last_reviewed_at,
      progress.next_review_at,
      progress.updated_at,
    ]
  );
}

/**
 * Fetch all verbs decorated with progress, retention, mastery, and priority.
 */
export async function getDecoratedVerbs(profile: UserProfile): Promise<VerbWithProgress[]> {
  const db = await getDatabase();
  const rawVerbs = await db.select<any[]>("SELECT * FROM verbs ORDER BY id ASC;");
  const rawProgress = await db.select<any[]>("SELECT * FROM user_verb_progress;");

  const progressMap = new Map<number, VerbProgress>();
  for (const p of rawProgress) {
    progressMap.set(p.verb_id, {
      verb_id: p.verb_id,
      reading_score: p.reading_score ?? 0,
      meaning_score: p.meaning_score ?? 0,
      stability_days: p.stability_days ?? 1.0,
      repetitions: p.repetitions ?? 0,
      lapses: p.lapses ?? 0,
      last_reviewed_at: p.last_reviewed_at,
      next_review_at: p.next_review_at,
      sync_dirty: p.sync_dirty ?? 0,
      updated_at: p.updated_at,
    });
  }

  return rawVerbs.map((v) => {
    const prog = progressMap.get(v.id);
    const retention = prog ? calculateRetention(prog.last_reviewed_at, prog.stability_days) : 0;
    const masteryScore = prog
      ? calculateMasteryScore(prog.reading_score, prog.meaning_score, retention, prog.repetitions)
      : 0;
    const tier = getMasteryTier(prog?.repetitions ?? 0, masteryScore);

    const parsedVerb: Verb = {
      id: v.id,
      kanji_form: v.kanji_form,
      furigana_reading: v.furigana_reading,
      ruby_segments: typeof v.ruby_segments === "string" ? JSON.parse(v.ruby_segments) : v.ruby_segments,
      meanings: typeof v.meanings === "string" ? JSON.parse(v.meanings) : v.meanings,
      jlpt_level: v.jlpt_level,
      verb_group: v.verb_group,
      constituent_kanji:
        typeof v.constituent_kanji === "string" ? JSON.parse(v.constituent_kanji) : v.constituent_kanji,
      industry_tags: typeof v.industry_tags === "string" ? JSON.parse(v.industry_tags) : v.industry_tags,
      is_core_jlpt: v.is_core_jlpt,
    };

    const priorityScore = calculatePriorityScore(parsedVerb, prog, profile);

    return {
      ...parsedVerb,
      progress: prog,
      retention,
      masteryScore,
      tier,
      priorityScore,
    };
  });
}
