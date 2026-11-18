import seedVerbs from "../data/seed_verbs.json";

export interface RubySegment {
  base: string;
  ruby: string | null;
}

export type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";
export type VerbGroup = "Ichidan" | "Godan" | "Irregular";
export type IndustryTrack = "general" | "it" | "finance" | "fnb" | "healthcare" | "manufacturing";

export interface Verb {
  id: number;
  kanji_form: string;
  furigana_reading: string;
  ruby_segments: RubySegment[];
  meanings: string[];
  jlpt_level: JlptLevel;
  verb_group: VerbGroup;
  constituent_kanji: string[];
  industry_tags: IndustryTrack[];
  is_core_jlpt: number;
}

export interface UserProfile {
  id: string;
  current_jlpt: JlptLevel;
  target_jlpt: JlptLevel;
  target_industries: IndustryTrack[];
  industry_blend_ratio: number; // e.g. 0.70 = 70% exam, 30% industry
  daily_goal: number;
  updated_at: string;
}

export interface VerbProgress {
  verb_id: number;
  reading_score: number; // 0.0 - 1.0
  meaning_score: number; // 0.0 - 1.0
  stability_days: number; // FSRS memory stability S
  repetitions: number;
  lapses: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  sync_dirty: number; // 1 = modified locally, 0 = synced
  updated_at: string;
}

export interface AppDatabase {
  execute(query: string, bindValues?: any[]): Promise<any>;
  select<T>(query: string, bindValues?: any[]): Promise<T>;
}

// Global singleton instance
let dbInstance: AppDatabase | null = null;
let initPromise: Promise<AppDatabase> | null = null;

// IndexedDB Helper for browser WASM persistence
const IDB_NAME = "jlpt_verbs_browser_db";
const IDB_STORE = "sqlite_file_store";
const IDB_KEY = "database_sqlite_bin";

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
    const idb = await openIndexedDB();
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
  return typeof window !== "undefined" && (Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__));
}

async function createTauriDatabase(): Promise<AppDatabase> {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const nativeDb = await Database.load("sqlite:jlpt_verbs.db");
  return {
    async execute(query: string, bindValues: any[] = []): Promise<any> {
      return nativeDb.execute(query, bindValues);
    },
    async select<T>(query: string, bindValues: any[] = []): Promise<T> {
      return nativeDb.select<T>(query, bindValues);
    },
  };
}

async function createBrowserDatabase(): Promise<AppDatabase> {
  const initSqlJs = (window as any).initSqlJs || (await import("sql.js")).default;
  const SQL = await initSqlJs({
    locateFile: (file: string) => `/${file}`,
  });

  const savedBuffer = await loadSqliteFromIDB();
  const db = savedBuffer ? new SQL.Database(savedBuffer) : new SQL.Database();

  const persist = () => {
    try {
      const binary = db.export();
      saveSqliteToIDB(binary);
    } catch (err) {
      console.warn("Failed to export sql.js db:", err);
    }
  };

  return {
    async execute(query: string, bindValues: any[] = []): Promise<any> {
      try {
        db.run(query, bindValues);
        persist();
        return { rowsAffected: 1 };
      } catch (err) {
        console.error("SQL.js execute error:", err, "Query:", query, "Values:", bindValues);
        throw err;
      }
    },
    async select<T>(query: string, bindValues: any[] = []): Promise<T> {
      try {
        const stmt = db.prepare(query);
        stmt.bind(bindValues);
        const results: any[] = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results as unknown as T;
      } catch (err) {
        console.error("SQL.js select error:", err, "Query:", query, "Values:", bindValues);
        throw err;
      }
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
        db = await createTauriDatabase();
      } catch (e) {
        console.warn("Tauri SQL plugin load failed, falling back to Browser SQL.js:", e);
        db = await createBrowserDatabase();
      }
    } else {
      db = await createBrowserDatabase();
    }

    await initializeSchema(db);
    dbInstance = db;
    return db;
  })();

  return initPromise;
}

async function initializeSchema(db: AppDatabase): Promise<void> {
  // 1. Verbs Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS verbs (
      id INTEGER PRIMARY KEY,
      kanji_form TEXT NOT NULL,
      furigana_reading TEXT NOT NULL,
      ruby_segments TEXT NOT NULL,
      meanings TEXT NOT NULL,
      jlpt_level TEXT NOT NULL,
      verb_group TEXT NOT NULL,
      constituent_kanji TEXT NOT NULL,
      industry_tags TEXT NOT NULL,
      is_core_jlpt INTEGER NOT NULL DEFAULT 1
    );
  `);

  // 2. User Profiles Table
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

  // 3. User Verb Progress Table (Dual-Axis FSRS)
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

  // Check if verbs table needs seeding
  const existingVerbs = await db.select<any[]>("SELECT COUNT(*) as count FROM verbs;");
  const count = existingVerbs[0]?.count || 0;

  if (count === 0) {
    for (const v of seedVerbs as any[]) {
      await db.execute(
        `INSERT INTO verbs (
          id, kanji_form, furigana_reading, ruby_segments, meanings,
          jlpt_level, verb_group, constituent_kanji, industry_tags, is_core_jlpt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          v.id,
          v.kanji_form,
          v.furigana_reading,
          typeof v.ruby_segments === "string" ? v.ruby_segments : JSON.stringify(v.ruby_segments),
          typeof v.meanings === "string" ? v.meanings : JSON.stringify(v.meanings),
          v.jlpt_level,
          v.verb_group,
          typeof v.constituent_kanji === "string" ? v.constituent_kanji : JSON.stringify(v.constituent_kanji),
          typeof v.industry_tags === "string" ? v.industry_tags : JSON.stringify(v.industry_tags),
          v.is_core_jlpt ?? 1,
        ]
      );
    }
  }

  // Ensure default profile exists
  const existingProfile = await db.select<any[]>("SELECT * FROM user_profiles WHERE id = 'guest_user';");
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
