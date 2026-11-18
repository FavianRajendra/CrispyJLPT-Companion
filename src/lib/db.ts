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

async function createTauriDatabase(): Promise<AppDatabase> {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const nativeDb = await withTimeout(
    Database.load("sqlite:jlpt_verbs.db"),
    4000,
    "Tauri Database.load"
  );
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
  const BATCH_SIZE = 100; // 100 rows * 10 cols = 1,000 bind parameters per query

  for (let i = 0; i < verbs.length; i += BATCH_SIZE) {
    const chunk = verbs.slice(i, i + BATCH_SIZE);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
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
        jlpt_level, verb_group, constituent_kanji, industry_tags, is_core_jlpt
      ) VALUES ${placeholders};`,
      params
    );
  }
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

  // Seed or top up verbs table if fewer rows exist than in seed_verbs.json
  const existingVerbs = await db.select<any[]>("SELECT COUNT(*) as count FROM verbs;");
  const count = existingVerbs[0]?.count || 0;

  if (count < (seedVerbs as any[]).length) {
    console.log(`[DB] Seeding corpus (${count} -> ${(seedVerbs as any[]).length} verbs)...`);
    await seedCorpusInBatches(db);
  }

  // Ensure default profile exists
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