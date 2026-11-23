import { createClient, Client as LibsqlClient } from "@libsql/client/web";
import seedVerbs from "../data/seed_verbs.json";

export interface RubySegment {
  base: string;
  ruby: string | null;
}

export type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";
export type VerbGroup = "Ichidan" | "Godan" | "Irregular";
export type IndustryTrack = "general" | "it" | "finance" | "fnb" | "healthcare" | "manufacturing";
export type ItemCategory = "verb" | "noun" | "adjective" | "time_number" | "adverb";

export interface Verb {
  id: number;
  kanji_form: string;
  furigana_reading: string;
  ruby_segments: RubySegment[];
  meanings: string[];
  jlpt_level: JlptLevel;
  verb_group: VerbGroup;
  category?: ItemCategory;
  constituent_kanji: string[];
  industry_tags: IndustryTrack[];
  is_core_jlpt: number;
}

export interface UserProfile {
  id: string;
  current_jlpt: JlptLevel;
  target_jlpt: JlptLevel;
  target_industries: IndustryTrack[];
  industry_blend_ratio: number;
  daily_goal: number;
  updated_at: string;
}

export function normalizeUserProfile(raw: any): UserProfile {
  if (!raw || typeof raw !== "object") {
    return {
      id: "guest_user",
      current_jlpt: "N5",
      target_jlpt: "N2",
      target_industries: ["it"],
      industry_blend_ratio: 0.7,
      daily_goal: 15,
      updated_at: new Date().toISOString(),
    };
  }

  let parsedIndustries: IndustryTrack[] = [];
  if (Array.isArray(raw.target_industries)) {
    parsedIndustries = raw.target_industries;
  } else if (typeof raw.target_industries === "string") {
    try {
      const parsed = JSON.parse(raw.target_industries);
      if (Array.isArray(parsed)) {
        parsedIndustries = parsed;
      } else if (typeof parsed === "string") {
        parsedIndustries = [parsed as IndustryTrack];
      }
    } catch {
      parsedIndustries = ["it"];
    }
  }

  const validIndustries: IndustryTrack[] = [
    "general",
    "it",
    "finance",
    "fnb",
    "healthcare",
    "manufacturing",
  ];
  parsedIndustries = parsedIndustries.filter((t) => validIndustries.includes(t));

  const validJlpt: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
  const current_jlpt: JlptLevel = validJlpt.includes(raw.current_jlpt) ? raw.current_jlpt : "N5";
  const target_jlpt: JlptLevel = validJlpt.includes(raw.target_jlpt) ? raw.target_jlpt : "N2";
  const blendRatio =
    typeof raw.industry_blend_ratio === "number" && !isNaN(raw.industry_blend_ratio)
      ? Math.max(0.1, Math.min(0.9, raw.industry_blend_ratio))
      : 0.7;
  const daily_goal =
    typeof raw.daily_goal === "number" && !isNaN(raw.daily_goal) ? raw.daily_goal : 15;

  return {
    id: String(raw.id || "guest_user"),
    current_jlpt,
    target_jlpt,
    target_industries: parsedIndustries,
    industry_blend_ratio: blendRatio,
    daily_goal,
    updated_at: String(raw.updated_at || new Date().toISOString()),
  };
}

export interface VerbProgress {
  verb_id: number;
  reading_score: number;
  meaning_score: number;
  stability_days: number;
  repetitions: number;
  lapses: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  sync_dirty: number;
  updated_at: string;
}

export interface AppDatabase {
  execute(query: string, bindValues?: any[]): Promise<any>;
  select<T>(query: string, bindValues?: any[]): Promise<T>;
}

export interface SyncStatus {
  configured: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

let dbInstance: AppDatabase | null = null;
let initPromise: Promise<AppDatabase> | null = null;
let tursoClient: LibsqlClient | null = null;
let remoteSchemaInitialized = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<boolean> | null = null;

const syncStatus: SyncStatus = {
  configured: false,
  isSyncing: false,
  lastSyncedAt:
    typeof localStorage !== "undefined" ? localStorage.getItem("turso_last_synced_at") : null,
  lastError: null,
};

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  return fetch(input, {
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
}

function getTursoClient(): LibsqlClient | null {
  if (tursoClient) return tursoClient;

  const rawUrl = (import.meta as any).env?.VITE_TURSO_DATABASE_URL?.trim();
  const authToken = (import.meta as any).env?.VITE_TURSO_AUTH_TOKEN?.trim();

  if (!rawUrl || !authToken) {
    syncStatus.configured = false;
    return null;
  }

  const httpUrl = rawUrl.replace(/^libsql:\/\//i, "https://");

  tursoClient = createClient({
    url: httpUrl,
    authToken,
    fetch: fetchWithTimeout as any,
  });
  syncStatus.configured = true;
  return tursoClient;
}

export function getSyncStatus(): SyncStatus {
  getTursoClient();
  return { ...syncStatus };
}

function scheduleBackgroundSync(delayMs = 1500) {
  if (!getTursoClient()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncWithTurso(false).catch((err) => {
      console.warn("[Turso Sync] Background sync skipped:", err);
    });
  }, delayMs);
}

async function ensureRemoteSchema(remote: LibsqlClient): Promise<void> {
  if (remoteSchemaInitialized) return;

  await remote.batch(
    [
      `CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        current_jlpt TEXT NOT NULL DEFAULT 'N5',
        target_jlpt TEXT NOT NULL DEFAULT 'N2',
        target_industries TEXT NOT NULL DEFAULT '["it"]',
        industry_blend_ratio REAL NOT NULL DEFAULT 0.70,
        daily_goal INTEGER NOT NULL DEFAULT 15,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS user_verb_progress (
        user_id TEXT NOT NULL,
        verb_id INTEGER NOT NULL,
        reading_score REAL NOT NULL DEFAULT 0.0,
        meaning_score REAL NOT NULL DEFAULT 0.0,
        stability_days REAL NOT NULL DEFAULT 1.0,
        repetitions INTEGER NOT NULL DEFAULT 0,
        lapses INTEGER NOT NULL DEFAULT 0,
        last_reviewed_at TEXT,
        next_review_at TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, verb_id)
      );`,
      `CREATE TABLE IF NOT EXISTS quiz_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        verb_id INTEGER NOT NULL,
        kanji_form TEXT NOT NULL,
        furigana_reading TEXT NOT NULL,
        correct_meaning TEXT NOT NULL,
        jlpt_level TEXT NOT NULL,
        quiz_mode TEXT NOT NULL,
        is_correct INTEGER NOT NULL,
        is_idk INTEGER NOT NULL DEFAULT 0,
        is_not_sure INTEGER NOT NULL DEFAULT 0,
        selected_label TEXT NOT NULL,
        selected_kanji TEXT NOT NULL,
        selected_furigana TEXT NOT NULL,
        selected_meaning TEXT NOT NULL,
        correct_label TEXT NOT NULL,
        answered_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS user_study_logs (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        item_type TEXT NOT NULL,
        item_key TEXT NOT NULL,
        title TEXT NOT NULL,
        reading TEXT NOT NULL,
        meaning TEXT NOT NULL,
        jlpt_level TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        is_deleted INTEGER NOT NULL DEFAULT 0,
        logged_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, id)
      );`,
      `CREATE TABLE IF NOT EXISTS learned_kanji_notes (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        kanji TEXT NOT NULL,
        furigana TEXT NOT NULL,
        meaning TEXT NOT NULL,
        source_note TEXT NOT NULL DEFAULT '',
        jlpt_level TEXT NOT NULL DEFAULT '',
        learned_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        PRIMARY KEY (user_id, id)
      );`,
    ],
    "write"
  );

  remoteSchemaInitialized = true;
}

/**
 * Bidirectional sync between local SQLite and Turso Cloud.
 * Pass forceFull = true to push ALL local progress/notes and pull ALL remote rows regardless of lastSyncedAt.
 */
export async function syncWithTurso(forceFull = false): Promise<boolean> {
  const remote = getTursoClient();
  if (!remote) {
    syncStatus.lastError = "Turso URL or Token missing in build";
    return false;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    syncStatus.lastError = "Device is offline";
    return false;
  }
  if (syncInFlight) return syncInFlight;

  syncInFlight = withTimeout(
    (async () => {
      syncStatus.isSyncing = true;
      syncStatus.lastError = null;

      try {
        const local = await getDatabase();

        // 0. Guarantee remote tables exist on Turso
        await ensureRemoteSchema(remote);

        await local.execute(`
          CREATE TABLE IF NOT EXISTS quiz_history (
            id TEXT PRIMARY KEY,
            verb_id INTEGER NOT NULL,
            kanji_form TEXT NOT NULL,
            furigana_reading TEXT NOT NULL,
            correct_meaning TEXT NOT NULL,
            jlpt_level TEXT NOT NULL,
            quiz_mode TEXT NOT NULL,
            is_correct INTEGER NOT NULL,
            is_idk INTEGER NOT NULL DEFAULT 0,
            is_not_sure INTEGER NOT NULL DEFAULT 0,
            selected_label TEXT NOT NULL,
            selected_kanji TEXT NOT NULL,
            selected_furigana TEXT NOT NULL,
            selected_meaning TEXT NOT NULL,
            correct_label TEXT NOT NULL,
            answered_at TEXT NOT NULL
          );
        `);

        await local.execute(`
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

        await local.execute(`
          CREATE TABLE IF NOT EXISTS learned_kanji_notes (
            id TEXT PRIMARY KEY,
            kanji TEXT NOT NULL,
            furigana TEXT NOT NULL,
            meaning TEXT NOT NULL,
            source_note TEXT NOT NULL DEFAULT '',
            jlpt_level TEXT NOT NULL DEFAULT '',
            learned_at TEXT NOT NULL,
            sync_dirty INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
          );
        `);

        // 1. Sync User Profile
        const localProfiles = await local.select<any[]>(
          "SELECT * FROM user_profiles LIMIT 1;"
        );
        const localProf = localProfiles[0]
          ? normalizeUserProfile(localProfiles[0])
          : normalizeUserProfile(null);
        const userId = localProf.id;

        const remoteProfRes = await remote.execute({
          sql: "SELECT * FROM user_profiles WHERE id = ? LIMIT 1;",
          args: [userId],
        });
        const remoteProfRow = remoteProfRes.rows?.[0] as any;

        const localHasActivity = await local.select<any[]>(
          "SELECT COUNT(*) as cnt FROM user_verb_progress WHERE repetitions > 0;"
        );
        const hasLocalProgress = (localHasActivity[0]?.cnt || 0) > 0;

        if (
          !remoteProfRow ||
          String(localProf.updated_at) > String(remoteProfRow.updated_at || "") ||
          (hasLocalProgress && remoteProfRow.target_jlpt === "N2" && localProf.target_jlpt !== "N2")
        ) {
          await remote.execute({
            sql: `INSERT INTO user_profiles (
                    id, current_jlpt, target_jlpt, daily_goal, target_industries, updated_at
                  ) VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET
                    current_jlpt = excluded.current_jlpt,
                    target_jlpt = excluded.target_jlpt,
                    daily_goal = excluded.daily_goal,
                    target_industries = excluded.target_industries,
                    updated_at = excluded.updated_at;`,
            args: [
              localProf.id,
              localProf.current_jlpt,
              localProf.target_jlpt,
              localProf.daily_goal,
              JSON.stringify(localProf.target_industries ?? []),
              localProf.updated_at,
            ],
          });
        } else if (String(remoteProfRow.updated_at) > String(localProf.updated_at)) {
          const merged = normalizeUserProfile(remoteProfRow);
          await local.execute(
            `UPDATE user_profiles
             SET current_jlpt = ?,
                 target_jlpt = ?,
                 daily_goal = ?,
                 target_industries = ?,
                 updated_at = ?
             WHERE id = ?;`,
            [
              merged.current_jlpt,
              merged.target_jlpt,
              merged.daily_goal,
              JSON.stringify(merged.target_industries),
              merged.updated_at,
              merged.id,
            ]
          );
        }

        const sinceTimestamp =
          forceFull || !syncStatus.lastSyncedAt
            ? "1970-01-01T00:00:00.000Z"
            : syncStatus.lastSyncedAt;

        // 2. Push local verb progress rows to Turso
        const rowsToPush = forceFull
          ? await local.select<VerbProgress[]>(
              "SELECT * FROM user_verb_progress WHERE repetitions > 0 OR reading_score > 0 OR meaning_score > 0 OR sync_dirty = 1;"
            )
          : await local.select<VerbProgress[]>(
              "SELECT * FROM user_verb_progress WHERE sync_dirty = 1;"
            );

        if (rowsToPush.length > 0) {
          const CHUNK = 50;
          for (let i = 0; i < rowsToPush.length; i += CHUNK) {
            const slice = rowsToPush.slice(i, i + CHUNK);
            const stmts = slice.map((row) => ({
              sql: `INSERT INTO user_verb_progress (
                      user_id, verb_id, reading_score, meaning_score, stability_days,
                      repetitions, lapses, last_reviewed_at, next_review_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, verb_id) DO UPDATE SET
                      reading_score = excluded.reading_score,
                      meaning_score = excluded.meaning_score,
                      stability_days = excluded.stability_days,
                      repetitions = excluded.repetitions,
                      lapses = excluded.lapses,
                      last_reviewed_at = excluded.last_reviewed_at,
                      next_review_at = excluded.next_review_at,
                      updated_at = excluded.updated_at
                    WHERE excluded.updated_at >= user_verb_progress.updated_at;`,
              args: [
                userId,
                row.verb_id,
                row.reading_score,
                row.meaning_score,
                row.stability_days,
                row.repetitions,
                row.lapses,
                row.last_reviewed_at,
                row.next_review_at,
                row.updated_at,
              ],
            }));

            await remote.batch(stmts, "write");

            const syncedIds = slice.map((r) => r.verb_id);
            const placeholders = syncedIds.map(() => "?").join(", ");
            await local.execute(
              `UPDATE user_verb_progress SET sync_dirty = 0 WHERE verb_id IN (${placeholders});`,
              syncedIds
            );
          }
        }

        // 3. Pull newer verb progress rows from Turso
        const remoteProgressRes = await remote.execute({
          sql: `SELECT * FROM user_verb_progress
                WHERE user_id = ? AND updated_at > ?
                ORDER BY updated_at ASC;`,
          args: [userId, sinceTimestamp],
        });

        for (const r of (remoteProgressRes.rows || []) as any[]) {
          const verbId = Number(r.verb_id);
          const localMatch = await local.select<VerbProgress[]>(
            "SELECT updated_at FROM user_verb_progress WHERE verb_id = ? LIMIT 1;",
            [verbId]
          );
          const localUpdated = localMatch[0]?.updated_at || "";
          const remoteUpdated = String(r.updated_at || "");

          if (remoteUpdated > localUpdated) {
            await local.execute(
              `INSERT INTO user_verb_progress (
                verb_id, reading_score, meaning_score, stability_days,
                repetitions, lapses, last_reviewed_at, next_review_at, sync_dirty, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
              ON CONFLICT(verb_id) DO UPDATE SET
                reading_score = excluded.reading_score,
                meaning_score = excluded.meaning_score,
                stability_days = excluded.stability_days,
                repetitions = excluded.repetitions,
                lapses = excluded.lapses,
                last_reviewed_at = excluded.last_reviewed_at,
                next_review_at = excluded.next_review_at,
                sync_dirty = 0,
                updated_at = excluded.updated_at;`,
              [
                verbId,
                Number(r.reading_score ?? 0),
                Number(r.meaning_score ?? 0),
                Number(r.stability_days ?? 1.0),
                Number(r.repetitions ?? 0),
                Number(r.lapses ?? 0),
                r.last_reviewed_at ? String(r.last_reviewed_at) : null,
                r.next_review_at ? String(r.next_review_at) : null,
                remoteUpdated,
              ]
            );
          }
        }

        // 4. Push & pull quiz_history
        const recentLocalHistory = await local.select<any[]>(
          forceFull
            ? "SELECT * FROM quiz_history ORDER BY answered_at DESC LIMIT 500;"
            : "SELECT * FROM quiz_history ORDER BY answered_at DESC LIMIT 100;"
        );
        if (recentLocalHistory.length > 0) {
          const historyStmts = recentLocalHistory.map((h) => ({
            sql: `INSERT OR IGNORE INTO quiz_history (
                    id, user_id, verb_id, kanji_form, furigana_reading, correct_meaning,
                    jlpt_level, quiz_mode, is_correct, is_idk, is_not_sure,
                    selected_label, selected_kanji, selected_furigana, selected_meaning,
                    correct_label, answered_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            args: [
              h.id,
              userId,
              h.verb_id,
              h.kanji_form,
              h.furigana_reading,
              h.correct_meaning,
              h.jlpt_level,
              h.quiz_mode,
              h.is_correct,
              h.is_idk ?? 0,
              h.is_not_sure ?? 0,
              h.selected_label,
              h.selected_kanji,
              h.selected_furigana,
              h.selected_meaning,
              h.correct_label,
              h.answered_at,
            ],
          }));
          await remote.batch(historyStmts, "write");
        }

        const remoteHistoryRes = await remote.execute({
          sql: `SELECT * FROM quiz_history
                WHERE user_id = ? AND answered_at > ?
                ORDER BY answered_at DESC LIMIT 300;`,
          args: [userId, sinceTimestamp],
        });

        for (const h of (remoteHistoryRes.rows || []) as any[]) {
          await local.execute(
            `INSERT OR IGNORE INTO quiz_history (
              id, verb_id, kanji_form, furigana_reading, correct_meaning,
              jlpt_level, quiz_mode, is_correct, is_idk, is_not_sure,
              selected_label, selected_kanji, selected_furigana, selected_meaning,
              correct_label, answered_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              String(h.id),
              Number(h.verb_id),
              String(h.kanji_form),
              String(h.furigana_reading),
              String(h.correct_meaning),
              String(h.jlpt_level),
              String(h.quiz_mode),
              Number(h.is_correct ?? 0),
              Number(h.is_idk ?? 0),
              Number(h.is_not_sure ?? 0),
              String(h.selected_label),
              String(h.selected_kanji),
              String(h.selected_furigana),
              String(h.selected_meaning),
              String(h.correct_label),
              String(h.answered_at),
            ]
          );
        }

        // 5. Bidirectional Sync for user_study_logs
        const logsToPush = forceFull
          ? await local.select<any[]>("SELECT * FROM user_study_logs;")
          : await local.select<any[]>("SELECT * FROM user_study_logs WHERE sync_dirty = 1;");

        if (logsToPush.length > 0) {
          const logStmts = logsToPush.map((log) => ({
            sql: `INSERT INTO user_study_logs (
                    user_id, id, item_type, item_key, title, reading, meaning,
                    jlpt_level, source, is_deleted, logged_at, updated_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(user_id, id) DO UPDATE SET
                    title = excluded.title,
                    reading = excluded.reading,
                    meaning = excluded.meaning,
                    jlpt_level = excluded.jlpt_level,
                    source = excluded.source,
                    is_deleted = excluded.is_deleted,
                    updated_at = excluded.updated_at
                  WHERE excluded.updated_at >= user_study_logs.updated_at;`,
            args: [
              userId,
              String(log.id),
              String(log.item_type),
              String(log.item_key),
              String(log.title),
              String(log.reading),
              String(log.meaning),
              String(log.jlpt_level),
              String(log.source || "manual"),
              Number(log.is_deleted ?? 0),
              String(log.logged_at),
              String(log.updated_at || log.logged_at),
            ],
          }));

          await remote.batch(logStmts, "write");

          const syncedLogIds = logsToPush.map((l) => l.id);
          const logPlaceholders = syncedLogIds.map(() => "?").join(", ");
          await local.execute(
            `UPDATE user_study_logs SET sync_dirty = 0 WHERE id IN (${logPlaceholders});`,
            syncedLogIds
          );
        }

        const remoteLogsRes = await remote.execute({
          sql: `SELECT * FROM user_study_logs
                WHERE user_id = ? AND updated_at > ?
                ORDER BY updated_at ASC;`,
          args: [userId, sinceTimestamp],
        });

        for (const rl of (remoteLogsRes.rows || []) as any[]) {
          const logId = String(rl.id);
          const localLogMatch = await local.select<any[]>(
            "SELECT updated_at FROM user_study_logs WHERE id = ? LIMIT 1;",
            [logId]
          );
          const localLogUpdated = localLogMatch[0]?.updated_at || "";
          const remoteLogUpdated = String(rl.updated_at || "");

          if (remoteLogUpdated > localLogUpdated) {
            await local.execute(
              `INSERT INTO user_study_logs (
                id, item_type, item_key, title, reading, meaning, jlpt_level,
                source, is_deleted, sync_dirty, logged_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                reading = excluded.reading,
                meaning = excluded.meaning,
                jlpt_level = excluded.jlpt_level,
                source = excluded.source,
                is_deleted = excluded.is_deleted,
                sync_dirty = 0,
                updated_at = excluded.updated_at;`,
              [
                logId,
                String(rl.item_type),
                String(rl.item_key),
                String(rl.title),
                String(rl.reading),
                String(rl.meaning),
                String(rl.jlpt_level),
                String(rl.source || "manual"),
                Number(rl.is_deleted ?? 0),
                String(rl.logged_at),
                remoteLogUpdated,
              ]
            );
          }
        }

        // 6. Bidirectional Sync for learned_kanji_notes (+ Kanji Popup & Directory My Logged Kanji)
        const notesToPush = forceFull
          ? await local.select<any[]>("SELECT * FROM learned_kanji_notes;")
          : await local.select<any[]>("SELECT * FROM learned_kanji_notes WHERE sync_dirty = 1;");

        if (notesToPush.length > 0) {
          const CHUNK = 50;
          for (let i = 0; i < notesToPush.length; i += CHUNK) {
            const slice = notesToPush.slice(i, i + CHUNK);
            const noteStmts = slice.map((note) => ({
              sql: `INSERT INTO learned_kanji_notes (
                      user_id, id, kanji, furigana, meaning, source_note,
                      jlpt_level, learned_at, updated_at, deleted_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, id) DO UPDATE SET
                      kanji = excluded.kanji,
                      furigana = excluded.furigana,
                      meaning = excluded.meaning,
                      source_note = excluded.source_note,
                      jlpt_level = excluded.jlpt_level,
                      learned_at = excluded.learned_at,
                      updated_at = excluded.updated_at,
                      deleted_at = excluded.deleted_at
                    WHERE excluded.updated_at >= learned_kanji_notes.updated_at;`,
              args: [
                userId,
                String(note.id),
                String(note.kanji || ""),
                String(note.furigana || ""),
                String(note.meaning || ""),
                String(note.source_note || ""),
                String(note.jlpt_level || ""),
                String(note.learned_at),
                String(note.updated_at || note.learned_at),
                note.deleted_at ? String(note.deleted_at) : null,
              ],
            }));

            await remote.batch(noteStmts, "write");

            const syncedNoteIds = slice.map((n) => n.id);
            const notePlaceholders = syncedNoteIds.map(() => "?").join(", ");
            await local.execute(
              `UPDATE learned_kanji_notes SET sync_dirty = 0 WHERE id IN (${notePlaceholders});`,
              syncedNoteIds
            );
          }
        }

        const remoteNotesRes = await remote.execute({
          sql: `SELECT * FROM learned_kanji_notes
                WHERE user_id = ? AND updated_at > ?
                ORDER BY updated_at ASC;`,
          args: [userId, sinceTimestamp],
        });

        for (const rn of (remoteNotesRes.rows || []) as any[]) {
          const noteId = String(rn.id);
          const localNoteMatch = await local.select<any[]>(
            "SELECT updated_at FROM learned_kanji_notes WHERE id = ? LIMIT 1;",
            [noteId]
          );
          const localNoteUpdated = localNoteMatch[0]?.updated_at || "";
          const remoteNoteUpdated = String(rn.updated_at || "");

          if (remoteNoteUpdated > localNoteUpdated) {
            await local.execute(
              `INSERT INTO learned_kanji_notes (
                id, kanji, furigana, meaning, source_note, jlpt_level,
                learned_at, sync_dirty, updated_at, deleted_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                kanji = excluded.kanji,
                furigana = excluded.furigana,
                meaning = excluded.meaning,
                source_note = excluded.source_note,
                jlpt_level = excluded.jlpt_level,
                learned_at = excluded.learned_at,
                sync_dirty = 0,
                updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at;`,
              [
                noteId,
                String(rn.kanji || ""),
                String(rn.furigana || ""),
                String(rn.meaning || ""),
                String(rn.source_note || ""),
                String(rn.jlpt_level || ""),
                String(rn.learned_at),
                remoteNoteUpdated,
                rn.deleted_at ? String(rn.deleted_at) : null,
              ]
            );
          }
        }

        const nowIso = new Date().toISOString();
        syncStatus.lastSyncedAt = nowIso;
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("turso_last_synced_at", nowIso);
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("kanji-notes-updated"));
          window.dispatchEvent(new Event("study-logs-updated"));
          window.dispatchEvent(new Event("daily-streak-updated"));
          window.dispatchEvent(new Event("turso-sync-completed"));
        }

        console.log("[Turso Sync] Synced successfully at", nowIso);
        return true;
      } catch (err: any) {
        const msg =
          err?.name === "AbortError"
            ? "Network timeout (10s) connecting to Turso"
            : err?.message || "Sync failed";
        syncStatus.lastError = msg;
        console.warn("[Turso Sync] Failed:", err);
        return false;
      } finally {
        syncStatus.isSyncing = false;
        syncInFlight = null;
      }
    })(),
    25000,
    "Turso sync"
  ).catch((err: any) => {
    syncStatus.isSyncing = false;
    syncInFlight = null;
    syncStatus.lastError = err?.message || "Sync timed out";
    return false;
  });

  return syncInFlight;
}

const IDB_NAME = "jlpt_verbs_browser_db";
const IDB_STORE = "sqlite_file_store";
const IDB_KEY = "database_sqlite_bin";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms during ${label}`)), ms)
    ),
  ]);
}

function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadSqliteFromIDB(): Promise<Uint8Array | null> {
  try {
    const idb = await withTimeout(openIndexedDB(), 2000, "IndexedDB open");
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveSqliteToIDB(data: Uint8Array): Promise<void> {
  try {
    const idb = await openIndexedDB();
    const tx = idb.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    store.put(data, IDB_KEY);
  } catch (e) {
    console.warn("Failed to persist SQLite to IndexedDB:", e);
  }
}

function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    (Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__))
  );
}

function isUserMutationQuery(query: string): boolean {
  return (
    /\b(user_verb_progress|user_profiles|quiz_history|user_study_logs|learned_kanji_notes)\b/i.test(
      query
    ) && /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(query)
  );
}

async function createTauriDatabase(): Promise<AppDatabase> {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const nativeDb = await withTimeout(
    Database.load("sqlite:jlpt_verbs.db"),
    4000,
    "Tauri Database.load"
  );
  return {
    async execute(query: string, bindValues: any[] = []): Promise<any> {
      const res = await nativeDb.execute(query, bindValues);
      if (isUserMutationQuery(query)) {
        scheduleBackgroundSync(1500);
      }
      return res;
    },
    async select<T>(query: string, bindValues: any[] = []): Promise<T> {
      return nativeDb.select<T>(query, bindValues);
    },
  };
}

async function createBrowserDatabase(): Promise<AppDatabase> {
  const sqlJsModule: any = await import("sql.js");
  const initSqlJs =
    (window as any).initSqlJs ||
    (typeof sqlJsModule === "function"
      ? sqlJsModule
      : sqlJsModule.default?.default || sqlJsModule.default);

  if (typeof initSqlJs !== "function") {
    throw new Error("initSqlJs export could not be resolved");
  }

  const SQL = await withTimeout<any>(
    initSqlJs({
      locateFile: (file: string) => `/${file}`,
    }),
    4000,
    "sql.js WASM init"
  );

  const savedBuffer = await loadSqliteFromIDB();
  const db = savedBuffer ? new SQL.Database(savedBuffer) : new SQL.Database();

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try {
        const binary = db.export();
        saveSqliteToIDB(binary);
      } catch (err) {
        console.warn("Failed to export sql.js db:", err);
      }
    }, 250);
  };

  return {
    async execute(query: string, bindValues: any[] = []): Promise<any> {
      db.run(query, bindValues);
      schedulePersist();
      if (isUserMutationQuery(query)) {
        scheduleBackgroundSync(1500);
      }
      return { rowsAffected: 1 };
    },
    async select<T>(query: string, bindValues: any[] = []): Promise<T> {
      const stmt = db.prepare(query);
      stmt.bind(bindValues);
      const results: any[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results as unknown as T;
    },
  };
}

export async function getDatabase(): Promise<AppDatabase> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let db: AppDatabase;
    if (isTauriEnvironment()) {
      try {
        console.log("[DB] Connecting to native Tauri SQLite...");
        db = await createTauriDatabase();
      } catch (e) {
        console.warn("[DB] Native SQLite unavailable, falling back to WASM SQL.js:", e);
        db = await createBrowserDatabase();
      }
    } else {
      console.log("[DB] Browser mode detected, initializing WASM SQL.js...");
      db = await createBrowserDatabase();
    }

    await initializeSchema(db);
    dbInstance = db;
    console.log("[DB] Initialization complete.");

    setTimeout(() => {
      syncWithTurso(true).catch(() => {});
    }, 400);

    return db;
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

async function seedCorpusInBatches(db: AppDatabase): Promise<void> {
  const verbs = seedVerbs as any[];
  const BATCH_SIZE = 90;

  for (let i = 0; i < verbs.length; i += BATCH_SIZE) {
    const chunk = verbs.slice(i, i + BATCH_SIZE);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const params: any[] = [];

    for (const v of chunk) {
      params.push(
        v.id,
        v.kanji_form,
        v.furigana_reading,
        typeof v.ruby_segments === "string" ? v.ruby_segments : JSON.stringify(v.ruby_segments),
        typeof v.meanings === "string" ? v.meanings : JSON.stringify(v.meanings),
        v.jlpt_level,
        v.verb_group,
        v.category || "verb",
        typeof v.constituent_kanji === "string"
          ? v.constituent_kanji
          : JSON.stringify(v.constituent_kanji),
        typeof v.industry_tags === "string" ? v.industry_tags : JSON.stringify(v.industry_tags),
        v.is_core_jlpt ?? 1
      );
    }

    await db.execute(
      `INSERT OR IGNORE INTO verbs (
        id, kanji_form, furigana_reading, ruby_segments, meanings,
        jlpt_level, verb_group, category, constituent_kanji, industry_tags, is_core_jlpt
      ) VALUES ${placeholders};`,
      params
    );
  }
}

async function initializeSchema(db: AppDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS verbs (
      id INTEGER PRIMARY KEY,
      kanji_form TEXT NOT NULL,
      furigana_reading TEXT NOT NULL,
      ruby_segments TEXT NOT NULL,
      meanings TEXT NOT NULL,
      jlpt_level TEXT NOT NULL,
      verb_group TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'verb',
      constituent_kanji TEXT NOT NULL,
      industry_tags TEXT NOT NULL,
      is_core_jlpt INTEGER NOT NULL DEFAULT 1
    );
  `);

  try {
    await db.execute(`ALTER TABLE verbs ADD COLUMN category TEXT NOT NULL DEFAULT 'verb';`);
  } catch {
    // Column already exists
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      current_jlpt TEXT NOT NULL DEFAULT 'N5',
      target_jlpt TEXT NOT NULL DEFAULT 'N2',
      target_industries TEXT NOT NULL DEFAULT '["it"]',
      industry_blend_ratio REAL NOT NULL DEFAULT 0.70,
      daily_goal INTEGER NOT NULL DEFAULT 15,
      updated_at TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_verb_progress (
      verb_id INTEGER PRIMARY KEY,
      reading_score REAL NOT NULL DEFAULT 0.0,
      meaning_score REAL NOT NULL DEFAULT 0.0,
      stability_days REAL NOT NULL DEFAULT 1.0,
      repetitions INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      last_reviewed_at TEXT,
      next_review_at TEXT,
      sync_dirty INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS learned_kanji_notes (
      id TEXT PRIMARY KEY,
      kanji TEXT NOT NULL,
      furigana TEXT NOT NULL,
      meaning TEXT NOT NULL,
      source_note TEXT NOT NULL DEFAULT '',
      jlpt_level TEXT NOT NULL DEFAULT '',
      learned_at TEXT NOT NULL,
      sync_dirty INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);

  const existingVerbs = await db.select<any[]>("SELECT COUNT(*) as count FROM verbs;");
  const count = existingVerbs[0]?.count || 0;

  if (count < (seedVerbs as any[]).length) {
    console.log(`[DB] Seeding corpus (${count} -> ${(seedVerbs as any[]).length} items)...`);
    await seedCorpusInBatches(db);
  }

  const nonVerbItems = (seedVerbs as any[]).filter((v) => v.category && v.category !== "verb");
  if (nonVerbItems.length > 0) {
    const sampleCheck = await db.select<any[]>(
      "SELECT COUNT(*) as count FROM verbs WHERE category != 'verb';"
    );
    if ((sampleCheck[0]?.count || 0) === 0) {
      const byCat = new Map<string, number[]>();
      for (const v of nonVerbItems) {
        const list = byCat.get(v.category) || [];
        list.push(v.id);
        byCat.set(v.category, list);
      }
      for (const [cat, ids] of byCat.entries()) {
        for (let i = 0; i < ids.length; i += 500) {
          const slice = ids.slice(i, i + 500);
          await db.execute(
            `UPDATE verbs SET category = ? WHERE id IN (${slice.join(",")});`,
            [cat]
          );
        }
      }
    }
  }

  const existingProfile = await db.select<any[]>(
    "SELECT * FROM user_profiles WHERE id = 'guest_user';"
  );
  if (!existingProfile || existingProfile.length === 0) {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO user_profiles (
        id, current_jlpt, target_jlpt, target_industries, industry_blend_ratio, daily_goal, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      ["guest_user", "N5", "N2", JSON.stringify(["it"]), 0.70, 15, now]
    );
  }
}