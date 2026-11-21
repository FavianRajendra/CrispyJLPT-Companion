import { getDatabase, JlptLevel, Verb, VerbProgress } from "./db";
import seedKanji from "../data/seed_kanji.json";
import {
  PARTICLES_ENCYCLOPEDIA,
  GRAMMAR_QUIZ_QUESTIONS,
} from "../data/grammar_corpus";

export type StudyLogItemType = "kanji" | "vocab" | "verb" | "grammar";
export type StudyLogSource = "manual" | "auto_mastered";

export interface StudyLogEntry {
  id: string; // e.g. "kanji:聞", "vocab:1042", "verb:12", "grammar:particle_wa"
  item_type: StudyLogItemType;
  item_key: string;
  title: string;
  reading: string;
  meaning: string;
  jlpt_level: JlptLevel;
  source: StudyLogSource;
  is_deleted?: number;
  sync_dirty?: number;
  logged_at: string;
  updated_at: string;
}

const MASTERY_THRESHOLD = 0.8; // 80% combined reading + meaning score

export async function ensureStudyLogsTable(): Promise<void> {
  const db = await getDatabase();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_study_logs (
      id TEXT PRIMARY KEY,
      item_type TEXT NOT NULL,
      item_key TEXT NOT NULL,
      title TEXT NOT NULL,
      reading TEXT NOT NULL,
      meaning TEXT NOT NULL,
      jlpt_level TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      sync_dirty INTEGER NOT NULL DEFAULT 1,
      logged_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  for (const colDef of [
    "is_deleted INTEGER NOT NULL DEFAULT 0",
    "sync_dirty INTEGER NOT NULL DEFAULT 1",
    "updated_at TEXT NOT NULL DEFAULT ''",
  ]) {
    try {
      await db.execute(`ALTER TABLE user_study_logs ADD COLUMN ${colDef};`);
    } catch {
      // Column already exists
    }
  }
}

export async function getAllStudyLogs(): Promise<StudyLogEntry[]> {
  await ensureStudyLogsTable();
  const db = await getDatabase();
  const rows = await db.select<StudyLogEntry[]>(
    "SELECT * FROM user_study_logs WHERE is_deleted = 0 ORDER BY logged_at DESC;"
  );
  return rows || [];
}

export async function upsertStudyLog(
  entry: Omit<StudyLogEntry, "logged_at" | "updated_at" | "is_deleted" | "sync_dirty">
): Promise<void> {
  await ensureStudyLogsTable();
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO user_study_logs (
      id, item_type, item_key, title, reading, meaning, jlpt_level,
      source, is_deleted, sync_dirty, logged_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      reading = excluded.reading,
      meaning = excluded.meaning,
      jlpt_level = excluded.jlpt_level,
      is_deleted = 0,
      sync_dirty = 1,
      updated_at = excluded.updated_at,
      source = CASE
        WHEN user_study_logs.source = 'manual' THEN 'manual'
        ELSE excluded.source
      END;`,
    [
      entry.id,
      entry.item_type,
      entry.item_key,
      entry.title,
      entry.reading,
      entry.meaning,
      entry.jlpt_level,
      entry.source,
      now,
      now,
    ]
  );

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("study-logs-updated"));
  }
}

export async function removeStudyLog(id: string): Promise<void> {
  await ensureStudyLogsTable();
  const db = await getDatabase();
  const now = new Date().toISOString();

  // Soft-delete with sync_dirty = 1 so Turso sync propagates removal across devices
  await db.execute(
    `UPDATE user_study_logs
     SET is_deleted = 1, sync_dirty = 1, updated_at = ?
     WHERE id = ?;`,
    [now, id]
  );

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("study-logs-updated"));
  }
}

/**
 * Automatically logs mastered Verbs, Vocabs, Constituent Kanji, and Grammar
 * whenever mastery scores cross the 80% threshold.
 */
export async function syncAutoMasteredLogs(
  verbs: Verb[],
  progressMap: Map<number, VerbProgress>,
  masteredGrammarIds: string[] = []
): Promise<number> {
  await ensureStudyLogsTable();
  const existing = await getAllStudyLogs();
  const existingIds = new Set(existing.map((e) => e.id));

  const kanjiByChar = new Map<string, any>();
  for (const k of seedKanji as any[]) {
    kanjiByChar.set(k.character, k);
  }

  let newlyAdded = 0;
  const kanjiMasteryTracker = new Map<string, { masteredCount: number; totalCount: number }>();

  for (const v of verbs) {
    const prog = progressMap.get(v.id);
    const avgScore = prog ? (prog.reading_score + prog.meaning_score) / 2 : 0;
    const isMastered = avgScore >= MASTERY_THRESHOLD;
    const isVerb = (v.category || "verb") === "verb";
    const type: StudyLogItemType = isVerb ? "verb" : "vocab";

    for (const ch of v.constituent_kanji || []) {
      const stat = kanjiMasteryTracker.get(ch) || { masteredCount: 0, totalCount: 0 };
      stat.totalCount += 1;
      if (isMastered) stat.masteredCount += 1;
      kanjiMasteryTracker.set(ch, stat);
    }

    if (isMastered) {
      const logId = `${type}:${v.id}`;
      if (!existingIds.has(logId)) {
        await upsertStudyLog({
          id: logId,
          item_type: type,
          item_key: String(v.id),
          title: v.kanji_form,
          reading: v.furigana_reading,
          meaning: v.meanings.slice(0, 3).join("; "),
          jlpt_level: v.jlpt_level,
          source: "auto_mastered",
        });
        existingIds.add(logId);
        newlyAdded++;
      }
    }
  }

  for (const [ch, stat] of kanjiMasteryTracker.entries()) {
    if (stat.masteredCount >= 2 || (stat.totalCount === 1 && stat.masteredCount === 1)) {
      const logId = `kanji:${ch}`;
      const kInfo = kanjiByChar.get(ch);
      if (kInfo && !existingIds.has(logId)) {
        await upsertStudyLog({
          id: logId,
          item_type: "kanji",
          item_key: ch,
          title: ch,
          reading: [...(kInfo.kunyomi || []), ...(kInfo.onyomi || [])].slice(0, 3).join("・"),
          meaning: (kInfo.meanings || []).slice(0, 3).join(", "),
          jlpt_level: kInfo.jlpt_level || "N5",
          source: "auto_mastered",
        });
        existingIds.add(logId);
        newlyAdded++;
      }
    }
  }

  for (const gId of masteredGrammarIds) {
    const logId = `grammar:${gId}`;
    if (existingIds.has(logId)) continue;

    const particle = PARTICLES_ENCYCLOPEDIA.find((p) => p.id === gId);
    const quizQ = GRAMMAR_QUIZ_QUESTIONS.find((q) => String(q.id) === gId);

    if (particle) {
      await upsertStudyLog({
        id: logId,
        item_type: "grammar",
        item_key: gId,
        title: particle.particle,
        reading: particle.role,
        meaning: particle.nuanceAndContrast,
        jlpt_level: particle.jlpt_level,
        source: "auto_mastered",
      });
      existingIds.add(logId);
      newlyAdded++;
    } else if (quizQ) {
      await upsertStudyLog({
        id: logId,
        item_type: "grammar",
        item_key: gId,
        title: quizQ.correctAnswer,
        reading: `${quizQ.sentencePre}（ ${quizQ.correctAnswer} ）${quizQ.sentencePost}`,
        meaning: quizQ.ruleSummary,
        jlpt_level: quizQ.jlpt_level,
        source: "auto_mastered",
      });
      existingIds.add(logId);
      newlyAdded++;
    }
  }

  return newlyAdded;
}