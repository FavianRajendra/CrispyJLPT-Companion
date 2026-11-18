import { getDatabase, VerbProgress, normalizeUserProfile } from "./db";

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  pendingCount: number;
  error: string | null;
}

export type SyncListener = (state: SyncState) => void;

class SyncManager {
  private listeners: Set<SyncListener> = new Set();
  private isSyncing = false;
  private lastSyncedAt: string | null = null;
  private pendingCount = 0;
  private error: string | null = null;
  private syncEndpoint = "/api/sync";

  constructor() {
    if (typeof window !== "undefined") {
      this.lastSyncedAt = localStorage.getItem("jlpt_last_synced_at");
      window.addEventListener("online", () => {
        this.notify();
        this.triggerSync();
      });
      window.addEventListener("offline", () => this.notify());
      // Initial count check
      this.refreshPendingCount();
    }
  }

  public setEndpoint(endpointUrl: string) {
    this.syncEndpoint = endpointUrl;
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public getState(): SyncState {
    return {
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
      isSyncing: this.isSyncing,
      lastSyncedAt: this.lastSyncedAt,
      pendingCount: this.pendingCount,
      error: this.error,
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }

  public async refreshPendingCount(): Promise<number> {
    try {
      const db = await getDatabase();
      const rows = await db.select<any[]>(
        "SELECT COUNT(*) as count FROM user_verb_progress WHERE sync_dirty = 1;"
      );
      this.pendingCount = rows[0]?.count ?? 0;
      this.notify();
      return this.pendingCount;
    } catch {
      return 0;
    }
  }

  /**
   * Main sync method. Pushes dirty rows and pulls remote updates.
   */
  public async triggerSync(userToken?: string): Promise<boolean> {
    if (this.isSyncing) return false;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.error = "Offline - sync will resume when connection is restored.";
      this.notify();
      return false;
    }

    this.isSyncing = true;
    this.error = null;
    this.notify();

    try {
      const db = await getDatabase();

      // 1. Load active profile
      const profiles = await db.select<any[]>("SELECT * FROM user_profiles LIMIT 1;");
      const profile = profiles[0] ? normalizeUserProfile(profiles[0]) : null;

      // 2. Load dirty progress
      const dirtyRows = await db.select<VerbProgress[]>(
        "SELECT * FROM user_verb_progress WHERE sync_dirty = 1;"
      );

      // In guest or local-only mode without remote endpoint configured, we simply reconcile locally
      const response = await fetch(this.syncEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
        },
        body: JSON.stringify({
          userId: profile?.id || "guest_user",
          profile,
          dirtyProgress: dirtyRows,
          lastSyncedAt: this.lastSyncedAt,
        }),
      });

      if (!response.ok) {
        throw new Error(`Sync server responded with HTTP ${response.status}`);
      }

      const data = await response.json();

      // 3. Mark uploaded rows as clean
      if (dirtyRows.length > 0) {
        const ids = dirtyRows.map((r) => r.verb_id).join(",");
        await db.execute(
          `UPDATE user_verb_progress SET sync_dirty = 0 WHERE verb_id IN (${ids});`
        );
      }

      // 4. Merge incoming pulled progress
      if (data.pulledProgress && Array.isArray(data.pulledProgress)) {
        for (const p of data.pulledProgress) {
          await db.execute(
            `INSERT INTO user_verb_progress (
              verb_id, reading_score, meaning_score, stability_days,
              repetitions, lapses, last_reviewed_at, next_review_at,
              sync_dirty, updated_at
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
              updated_at = excluded.updated_at
            WHERE excluded.updated_at >= user_verb_progress.updated_at;`,
            [
              p.verb_id,
              p.reading_score,
              p.meaning_score,
              p.stability_days,
              p.repetitions,
              p.lapses,
              p.last_reviewed_at,
              p.next_review_at,
              p.updated_at,
            ]
          );
        }
      }

      this.lastSyncedAt = data.serverTime || new Date().toISOString();
      if (typeof localStorage !== "undefined" && this.lastSyncedAt) {
        localStorage.setItem("jlpt_last_synced_at", this.lastSyncedAt);
      }

      await this.refreshPendingCount();
      this.isSyncing = false;
      this.notify();
      return true;
    } catch (err: any) {
      // Graceful offline degradation
      this.error = err?.message || "Sync encountered an error";
      this.isSyncing = false;
      await this.refreshPendingCount();
      this.notify();
      return false;
    }
  }

  /**
   * Merges guest local data into an authenticated account upon sign-in.
   */
  public async mergeGuestAccount(newUserId: string): Promise<void> {
    const db = await getDatabase();
    await db.execute("UPDATE user_profiles SET id = ?, updated_at = ?;", [
      newUserId,
      new Date().toISOString(),
    ]);
    // Mark all existing progress as dirty so they sync to the new account
    await db.execute("UPDATE user_verb_progress SET sync_dirty = 1;");
    await this.refreshPendingCount();
    await this.triggerSync();
  }
}

export const syncManager = new SyncManager();
