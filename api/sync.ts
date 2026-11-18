import { neon } from "@neondatabase/serverless";

export interface KanjiNoteSyncRow {
  id: string;
  kanji: string;
  furigana: string;
  meaning: string;
  source_note?: string;
  jlpt_level?: string;
  learned_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface SyncPayload {
  userId?: string;
  token?: string;
  profile?: {
    current_jlpt: string;
    target_jlpt: string;
    target_industries: string[];
    industry_blend_ratio: number;
    daily_goal: number;
    updated_at: string;
  };
  dirtyProgress?: Array<{
    verb_id: number;
    reading_score: number;
    meaning_score: number;
    stability_days: number;
    repetitions: number;
    lapses: number;
    last_reviewed_at: string | null;
    next_review_at: string | null;
    updated_at: string;
  }>;
  kanji_notes?: KanjiNoteSyncRow[];
  lastSyncedAt?: string | null;
  last_sync_at?: string | null;
}

/**
 * Serverless Edge handler for JLPT Verb Studio Sync.
 * Compatible with Vercel Edge Functions, Cloudflare Workers, or standard Web Request/Response.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return new Response(
      JSON.stringify({
        error: "Server database configuration missing. Set DATABASE_URL in environment.",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (authHeader && !authHeader.startsWith("Bearer ")) {
      // Optional JWT signature verification hook
    }
    const body: SyncPayload = await req.json();
    const userId = body.userId;

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sql = neon(databaseUrl);
    const nowIso = new Date().toISOString();
    const effectiveLastSync = body.lastSyncedAt || body.last_sync_at || null;

    // 1. Sync User Profile if sent
    if (body.profile) {
      const p = body.profile;
      await sql`
        INSERT INTO user_profiles (
          id, current_jlpt, target_jlpt, target_industries,
          industry_blend_ratio, daily_goal, updated_at
        ) VALUES (
          ${userId}, ${p.current_jlpt}, ${p.target_jlpt},
          ${JSON.stringify(p.target_industries)}::jsonb,
          ${p.industry_blend_ratio}, ${p.daily_goal}, ${p.updated_at || nowIso}
        )
        ON CONFLICT (id) DO UPDATE SET
          current_jlpt = EXCLUDED.current_jlpt,
          target_jlpt = EXCLUDED.target_jlpt,
          target_industries = EXCLUDED.target_industries,
          industry_blend_ratio = EXCLUDED.industry_blend_ratio,
          daily_goal = EXCLUDED.daily_goal,
          updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= user_profiles.updated_at;
      `;
    }

    // 2. Batch-upsert client dirty progress rows with timestamp resolution
    if (body.dirtyProgress && body.dirtyProgress.length > 0) {
      for (const row of body.dirtyProgress) {
        await sql`
          INSERT INTO user_verb_progress (
            user_id, verb_id, reading_score, meaning_score,
            stability_days, repetitions, lapses,
            last_reviewed_at, next_review_at, updated_at
          ) VALUES (
            ${userId}, ${row.verb_id}, ${row.reading_score}, ${row.meaning_score},
            ${row.stability_days}, ${row.repetitions}, ${row.lapses},
            ${row.last_reviewed_at}, ${row.next_review_at}, ${row.updated_at}
          )
          ON CONFLICT (user_id, verb_id) DO UPDATE SET
            reading_score = EXCLUDED.reading_score,
            meaning_score = EXCLUDED.meaning_score,
            stability_days = EXCLUDED.stability_days,
            repetitions = EXCLUDED.repetitions,
            lapses = EXCLUDED.lapses,
            last_reviewed_at = EXCLUDED.last_reviewed_at,
            next_review_at = EXCLUDED.next_review_at,
            updated_at = EXCLUDED.updated_at
          WHERE EXCLUDED.updated_at >= user_verb_progress.updated_at;
        `;
      }
    }

    // 3. Batch-upsert client dirty Kanji Note Widget entries
    if (Array.isArray(body.kanji_notes) && body.kanji_notes.length > 0) {
      for (const note of body.kanji_notes) {
        await sql`
          INSERT INTO learned_kanji_notes (
            id, user_id, kanji, furigana, meaning, source_note, jlpt_level,
            learned_at, updated_at, deleted_at
          ) VALUES (
            ${note.id}, ${userId}, ${note.kanji}, ${note.furigana}, ${note.meaning},
            ${note.source_note || ""}, ${note.jlpt_level || ""},
            ${note.learned_at || nowIso}, ${note.updated_at || nowIso}, ${note.deleted_at || null}
          )
          ON CONFLICT (id) DO UPDATE SET
            kanji = EXCLUDED.kanji,
            furigana = EXCLUDED.furigana,
            meaning = EXCLUDED.meaning,
            source_note = EXCLUDED.source_note,
            jlpt_level = EXCLUDED.jlpt_level,
            learned_at = EXCLUDED.learned_at,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
          WHERE EXCLUDED.updated_at >= learned_kanji_notes.updated_at;
        `;
      }
    }

    // 4. Fetch server verb progress changes since client's lastSyncedAt
    let pulledProgress: any[] = [];
    if (effectiveLastSync) {
      pulledProgress = await sql`
        SELECT verb_id, reading_score, meaning_score, stability_days,
               repetitions, lapses, last_reviewed_at, next_review_at, updated_at
        FROM user_verb_progress
        WHERE user_id = ${userId} AND updated_at > ${effectiveLastSync};
      `;
    } else {
      pulledProgress = await sql`
        SELECT verb_id, reading_score, meaning_score, stability_days,
               repetitions, lapses, last_reviewed_at, next_review_at, updated_at
        FROM user_verb_progress
        WHERE user_id = ${userId};
      `;
    }

    // 5. Fetch server Kanji Note changes since client's lastSyncedAt
    let pulledKanjiNotes: any[] = [];
    if (effectiveLastSync) {
      pulledKanjiNotes = await sql`
        SELECT id, kanji, furigana, meaning, source_note, jlpt_level,
               learned_at, updated_at, deleted_at
        FROM learned_kanji_notes
        WHERE user_id = ${userId} AND updated_at > ${effectiveLastSync}
        ORDER BY learned_at DESC;
      `;
    } else {
      pulledKanjiNotes = await sql`
        SELECT id, kanji, furigana, meaning, source_note, jlpt_level,
               learned_at, updated_at, deleted_at
        FROM learned_kanji_notes
        WHERE user_id = ${userId}
        ORDER BY learned_at DESC;
      `;
    }

    // 6. Fetch latest profile
    const profiles = await sql`
      SELECT id, current_jlpt, target_jlpt, target_industries,
             industry_blend_ratio, daily_goal, updated_at
      FROM user_profiles
      WHERE id = ${userId};
    `;

    return new Response(
      JSON.stringify({
        success: true,
        serverTime: nowIso,
        pulledProgress,
        kanji_notes: pulledKanjiNotes,
        profile: profiles.length > 0 ? profiles[0] : null,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "Sync error occurred",
        details: err?.message || String(err),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}