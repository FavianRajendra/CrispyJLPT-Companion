-- =====================================================================
-- Neon Serverless PostgreSQL Schema
-- JLPT Verb Kanji Studio Multi-Device Synchronization
-- =====================================================================

-- Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
    id VARCHAR(128) PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    current_jlpt VARCHAR(10) NOT NULL DEFAULT 'N5',
    target_jlpt VARCHAR(10) NOT NULL DEFAULT 'N2',
    target_industries JSONB NOT NULL DEFAULT '["it"]'::jsonb,
    industry_blend_ratio NUMERIC(3, 2) NOT NULL DEFAULT 0.70,
    daily_goal INTEGER NOT NULL DEFAULT 15,
    theme VARCHAR(10) NOT NULL DEFAULT 'dark',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Verb Progress & Dual-Axis FSRS Mastery Table
CREATE TABLE IF NOT EXISTS user_verb_progress (
    user_id VARCHAR(128) NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    verb_id INTEGER NOT NULL,
    reading_score NUMERIC(4, 3) NOT NULL DEFAULT 0.000,
    meaning_score NUMERIC(4, 3) NOT NULL DEFAULT 0.000,
    stability_days NUMERIC(8, 3) NOT NULL DEFAULT 1.000,
    repetitions INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    last_reviewed_at TIMESTAMPTZ,
    next_review_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, verb_id)
);


CREATE TABLE IF NOT EXISTS learned_kanji_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kanji TEXT NOT NULL,
  furigana TEXT NOT NULL,
  meaning TEXT NOT NULL,
  source_note TEXT NOT NULL DEFAULT '',
  jlpt_level TEXT NOT NULL DEFAULT '',
  learned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_learned_kanji_notes_user
  ON learned_kanji_notes(user_id, learned_at DESC);

  
-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_verb_progress_user ON user_verb_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_verb_progress_review ON user_verb_progress(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
