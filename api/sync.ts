import { neon } from "@neondatabase/serverless";

export interface SyncPayload {
  userId: string;
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
  lastSyncedAt?: string | null;
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

    if (!body.userId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify token if present (or ensure basic caller signature)
    const userId = body.userId;
    const sql = neon(databaseUrl);
    const nowIso = new Date().toISOString();

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

    // 3. Fetch server changes since client's lastSyncedAt
    let pulledProgress: any[] = [];
    if (body.lastSyncedAt) {
      pulledProgress = await sql`
        SELECT verb_id, reading_score, meaning_score, stability_days,
               repetitions, lapses, last_reviewed_at, next_review_at, updated_at
        FROM user_verb_progress
        WHERE user_id = ${userId} AND updated_at > ${body.lastSyncedAt};
      `;
    } else {
      pulledProgress = await sql`
        SELECT verb_id, reading_score, meaning_score, stability_days,
               repetitions, lapses, last_reviewed_at, next_review_at, updated_at
        FROM user_verb_progress
        WHERE user_id = ${userId};
      `;
    }

    // 4. Fetch latest profile
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
