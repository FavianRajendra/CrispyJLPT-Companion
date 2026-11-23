-- =====================================================================
-- Turso (libSQL / SQLite) Multi-Device Synchronization Schema
-- CrispyJLPT Companion
-- =====================================================================

-- User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY,
    current_jlpt TEXT NOT NULL DEFAULT 'N5',
    target_jlpt TEXT NOT NULL DEFAULT 'N2',
    target_industries TEXT NOT NULL DEFAULT '["it"]',
    industry_blend_ratio REAL NOT NULL DEFAULT 0.70,
    daily_goal INTEGER NOT NULL DEFAULT 15,
    updated_at TEXT NOT NULL
);

-- User Verb Progress & Dual-Axis FSRS Mastery Table
CREATE TABLE IF NOT EXISTS user_verb_progress (
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
);

-- Quiz History Table
CREATE TABLE IF NOT EXISTS quiz_history (
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
);

-- User Study Logs Table
CREATE TABLE IF NOT EXISTS user_study_logs (
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
);

-- Learned Kanji & Furigana Notes Table (+ Kanji Popup & Directory)
CREATE TABLE IF NOT EXISTS learned_kanji_notes (
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
);

CREATE INDEX IF NOT EXISTS idx_learned_kanji_notes_user
    ON learned_kanji_notes(user_id, learned_at DESC);
CREATE INDEX IF NOT EXISTS idx_verb_progress_user
    ON user_verb_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_verb_progress_review
    ON user_verb_progress(user_id, next_review_at);