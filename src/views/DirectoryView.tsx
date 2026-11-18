import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Volume2,
  BookOpen,
  Calendar,
  Eye,
  EyeOff,
  Trash2,
  Sparkles,
  Layers,
  X,
} from "lucide-react";
import {
  Verb,
  UserProfile,
  VerbProgress,
  JlptLevel,
  IndustryTrack,
  getDatabase,
} from "../lib/db";
import { speakJapanese } from "../lib/audio";

export interface DirectoryViewProps {
  verbs: Verb[];
  profile?: UserProfile;
  progressMap?: Map<number, VerbProgress> | Record<number, VerbProgress>;
  onUpdateProgress?: (progress: VerbProgress) => void | Promise<void>;
}

export interface LoggedKanjiNoteItem {
  id: string;
  kanji: string;
  furigana: string;
  meaning: string;
  source_note: string;
  jlpt_level: string;
  learned_at: string;
  deleted_at: string | null;
}

const JLPT_LEVELS: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

const INDUSTRY_LABELS: Array<{ id: IndustryTrack; label: string }> = [
  { id: "general", label: "General" },
  { id: "it", label: "IT & Tech" },
  { id: "finance", label: "Finance" },
  { id: "fnb", label: "F&B" },
  { id: "healthcare", label: "Healthcare" },
  { id: "manufacturing", label: "Manufacturing" },
];

function getProgressEntry(
  progressMap: Map<number, VerbProgress> | Record<number, VerbProgress> | undefined,
  verbId: number
): VerbProgress | undefined {
  if (!progressMap) return undefined;
  if (progressMap instanceof Map) {
    return progressMap.get(verbId);
  }
  return progressMap[verbId];
}

function formatShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  verbs,
  progressMap,
}) => {
  const [sourceTab, setSourceTab] = useState<"all" | "notes" | "corpus">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<JlptLevel | "ALL">("ALL");
  const [selectedTrack, setSelectedTrack] = useState<IndustryTrack | "ALL">("ALL");
  const [showFurigana, setShowFurigana] = useState<boolean>(true);
  const [visibleLimit, setVisibleLimit] = useState<number>(60);

  // Logged kanji notes from KanjiNoteWidget
  const [loggedNotes, setLoggedNotes] = useState<LoggedKanjiNoteItem[]>([]);
  const [selectedVerb, setSelectedVerb] = useState<Verb | null>(null);

  const loadLoggedKanjiNotes = useCallback(async () => {
    try {
      const db = await getDatabase();
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
      const rows = await db.select<LoggedKanjiNoteItem[]>(
        `SELECT * FROM learned_kanji_notes WHERE deleted_at IS NULL ORDER BY learned_at DESC;`
      );
      setLoggedNotes(rows || []);
    } catch (err) {
      console.warn("[DirectoryView] Failed to load logged kanji notes:", err);
    }
  }, []);

  useEffect(() => {
    loadLoggedKanjiNotes();

    const handleRefresh = () => loadLoggedKanjiNotes();
    window.addEventListener("kanji-notes-updated", handleRefresh);
    window.addEventListener("focus", handleRefresh);
    return () => {
      window.removeEventListener("kanji-notes-updated", handleRefresh);
      window.removeEventListener("focus", handleRefresh);
    };
  }, [loadLoggedKanjiNotes]);

  const handleDeleteLoggedNote = async (id: string) => {
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE learned_kanji_notes SET deleted_at = ?, updated_at = ?, sync_dirty = 1 WHERE id = ?;`,
        [now, now, id]
      );
      await loadLoggedKanjiNotes();
    } catch (err) {
      console.warn("[DirectoryView] Failed to delete logged note:", err);
    }
  };

  // Filtered Logged Kanji Notes
  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return loggedNotes.filter((n) => {
      if (selectedLevel !== "ALL" && n.jlpt_level && n.jlpt_level !== selectedLevel) {
        return false;
      }
      if (!q) return true;
      return (
        n.kanji.toLowerCase().includes(q) ||
        n.furigana.toLowerCase().includes(q) ||
        n.meaning.toLowerCase().includes(q) ||
        n.source_note.toLowerCase().includes(q)
      );
    });
  }, [loggedNotes, searchQuery, selectedLevel]);

  // Filtered Corpus Verbs
  const filteredVerbs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return verbs.filter((v) => {
      if (selectedLevel !== "ALL" && v.jlpt_level !== selectedLevel) return false;
      if (
        selectedTrack !== "ALL" &&
        (!Array.isArray(v.industry_tags) || !v.industry_tags.includes(selectedTrack))
      ) {
        return false;
      }
      if (!q) return true;
      return (
        v.kanji_form.toLowerCase().includes(q) ||
        v.furigana_reading.toLowerCase().includes(q) ||
        v.meanings.some((m) => m.toLowerCase().includes(q))
      );
    });
  }, [verbs, searchQuery, selectedLevel, selectedTrack]);

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleLimit(60);
  }, [searchQuery, selectedLevel, selectedTrack, sourceTab]);

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-24 md:pb-10">
      {/* Top Search & Source Switcher Card */}
      <div className="p-4 rounded-3xl glass-card border border-border-glass space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Source Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl glass-panel overflow-x-auto">
            <button
              type="button"
              onClick={() => setSourceTab("all")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                sourceTab === "all"
                  ? "bg-accent text-white shadow-neon-glow"
                  : "text-primary-muted hover:text-primary"
              }`}
            >
              All ({loggedNotes.length + verbs.length})
            </button>
            <button
              type="button"
              onClick={() => setSourceTab("notes")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                sourceTab === "notes"
                  ? "bg-accent text-white shadow-neon-glow"
                  : "text-primary-muted hover:text-primary"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>My Logged Kanji ({loggedNotes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSourceTab("corpus")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                sourceTab === "corpus"
                  ? "bg-accent text-white shadow-neon-glow"
                  : "text-primary-muted hover:text-primary"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>JLPT Verb Corpus ({verbs.length})</span>
            </button>
          </div>

          {/* Furigana Visibility Toggle */}
          <button
            type="button"
            onClick={() => setShowFurigana((prev) => !prev)}
            className={`flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
              showFurigana
                ? "border-accent bg-accent/15 text-accent"
                : "border-border-glass glass-panel text-primary-muted hover:text-primary"
            }`}
          >
            {showFurigana ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Furigana: {showFurigana ? "ON" : "OFF"}</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-primary-muted absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search kanji, furigana, English meaning, or book/source note..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-2xl glass-panel border border-border-glass text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {/* JLPT & Industry Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div className="flex items-center gap-1 p-1 rounded-full glass-panel overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedLevel("ALL")}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                selectedLevel === "ALL"
                  ? "bg-accent text-white"
                  : "text-primary-muted hover:text-primary"
              }`}
            >
              All JLPT
            </button>
            {JLPT_LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setSelectedLevel(lvl)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  selectedLevel === lvl
                    ? "bg-accent text-white"
                    : "text-primary-muted hover:text-primary"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {sourceTab !== "notes" && (
            <div className="flex items-center gap-1 p-1 rounded-full glass-panel overflow-x-auto">
              <button
                type="button"
                onClick={() => setSelectedTrack("ALL")}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  selectedTrack === "ALL"
                    ? "bg-accent/20 text-accent"
                    : "text-primary-muted hover:text-primary"
                }`}
              >
                All Tracks
              </button>
              {INDUSTRY_LABELS.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => setSelectedTrack(tr.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                    selectedTrack === tr.id
                      ? "bg-accent/20 text-accent"
                      : "text-primary-muted hover:text-primary"
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 1: MY LOGGED KANJI & FURIGANA NOTES (FROM + KANJI WIDGET) */}
      {(sourceTab === "all" || sourceTab === "notes") && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>My Logged Kanji & Furigana Notes ({filteredNotes.length})</span>
            </h3>
            <span className="text-[11px] text-primary-muted">
              Saved from the floating + Kanji widget
            </span>
          </div>

          {filteredNotes.length === 0 ? (
            <div className="p-6 rounded-3xl glass-card border border-border-glass text-center text-xs text-primary-muted">
              No logged kanji notes match your filter yet. Click the{" "}
              <strong className="text-accent">+ Kanji</strong> button in the bottom-right corner to log new words!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredNotes.map((note) => {
                const hasKanji = Boolean(note.kanji && note.kanji.trim());
                return (
                  <div
                    key={note.id}
                    className="p-4 rounded-2xl glass-card border border-accent/25 flex flex-col justify-between gap-2.5"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          {hasKanji ? (
                            <div className="font-jp">
                              {showFurigana && note.furigana && (
                                <div className="text-xs text-accent font-medium">
                                  {note.furigana}
                                </div>
                              )}
                              <div className="text-xl font-bold text-primary">
                                {note.kanji}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-jp text-xl font-bold text-primary">
                                {note.furigana}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-semibold">
                                Furigana
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {note.jlpt_level && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-bold">
                              {note.jlpt_level}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => speakJapanese(note.furigana || note.kanji)}
                            aria-label="Pronounce logged kanji"
                            className="p-1.5 rounded-lg text-primary-muted hover:text-accent hover:bg-surface-hover"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLoggedNote(note.id)}
                            aria-label="Delete logged kanji"
                            className="p-1.5 rounded-lg text-primary-muted hover:text-rose-400 hover:bg-surface-hover"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs sm:text-sm text-primary font-medium">
                        {note.meaning}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border-glass text-[11px] text-primary-muted">
                      <span className="flex items-center gap-1 truncate">
                        <BookOpen className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {note.source_note || "Field Note"}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <Calendar className="w-3 h-3" />
                        {formatShortDate(note.learned_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: BUNDLED JLPT VERB CORPUS */}
      {(sourceTab === "all" || sourceTab === "corpus") && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary-muted">
              JLPT Verb Corpus ({filteredVerbs.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredVerbs.slice(0, visibleLimit).map((verb) => {
              const prog = getProgressEntry(progressMap, verb.id);
              const masteryPct = prog
                ? Math.round(((prog.reading_score + prog.meaning_score) / 2) * 100)
                : 0;

              return (
                <div
                  key={verb.id}
                  onClick={() => setSelectedVerb(verb)}
                  className="p-4 rounded-2xl glass-card border border-border-glass hover:border-accent/50 transition-all cursor-pointer flex flex-col justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-jp">
                        {showFurigana && (
                          <div className="text-xs text-accent font-medium">
                            {verb.furigana_reading}
                          </div>
                        )}
                        <div className="text-xl font-bold text-primary">
                          {verb.kanji_form}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-accent/15 text-accent font-bold">
                          {verb.jlpt_level}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            speakJapanese(verb.furigana_reading || verb.kanji_form);
                          }}
                          aria-label="Pronounce verb"
                          className="p-1.5 rounded-lg text-primary-muted hover:text-accent hover:bg-surface-hover"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-primary font-medium line-clamp-2">
                      {verb.meanings.slice(0, 3).join(", ")}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border-glass text-[11px] text-primary-muted">
                    <span>{verb.verb_group}</span>
                    <span className="tabular-nums font-semibold">
                      Mastery: {masteryPct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredVerbs.length > visibleLimit && (
            <div className="pt-3 text-center">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 60)}
                className="min-h-[42px] px-6 py-2 rounded-2xl glass-panel border border-border-glass text-xs font-semibold text-primary hover:border-accent"
              >
                Load More ({filteredVerbs.length - visibleLimit} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Verb Detail Modal */}
      {selectedVerb && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedVerb(null)}
        >
          <div
            className="w-full max-w-md p-6 rounded-3xl glass-card bg-surface-card border border-border-glass space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-accent/15 text-accent text-xs font-bold">
                  {selectedVerb.jlpt_level}
                </span>
                <span className="px-2.5 py-1 rounded-lg glass-panel text-primary-muted text-xs font-semibold">
                  {selectedVerb.verb_group}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVerb(null)}
                className="p-1.5 rounded-xl text-primary-muted hover:text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center py-3 space-y-1">
              <div className="font-jp text-sm text-accent font-semibold">
                {selectedVerb.furigana_reading}
              </div>
              <div className="font-jp text-4xl font-bold text-primary">
                {selectedVerb.kanji_form}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl glass-panel space-y-1">
              <div className="text-[11px] font-semibold uppercase text-primary-muted">
                Meanings
              </div>
              <div className="text-sm text-primary font-medium">
                {selectedVerb.meanings.join("; ")}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                speakJapanese(selectedVerb.furigana_reading || selectedVerb.kanji_form)
              }
              className="w-full min-h-[44px] rounded-xl bg-accent text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Volume2 className="w-4 h-4" />
              <span>Pronounce Verb</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};