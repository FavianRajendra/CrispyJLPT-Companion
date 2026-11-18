import React, { useState, useMemo, useEffect } from "react";
import {
  BookOpen,
  Layers,
  HelpCircle,
  Volume2,
  Search,
  Shuffle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  Flag,
} from "lucide-react";
import {
  CONJUGATION_ROWS,
  PARTICLE_ENTRIES,
  GRAMMAR_QUIZ_QUESTIONS,
  GrammarQuizQuestion,
} from "../data/grammar_corpus";
import seedVerbs from "../data/seed_verbs.json";
import { conjugateVerb } from "../lib/conjugator";
import { speakJapanese } from "../lib/audio";
import { JlptLevel, Verb, getDatabase } from "../lib/db";
import { AnnotatedJapaneseText } from "../lib/kanjiAnnotator";

type GrammarSubTab = "tables" | "particles" | "quiz";
type SessionPreset = 10 | 20 | 30 | 40 | "infinite";

const JLPT_LEVELS: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

const IDK_LABELS = [
  "🤷 Honestly, I don't know (No Gacha)",
  "🫠 Brain empty — show me the answer",
  "🎲 Skip guessing — flag for review",
];

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const GrammarView: React.FC = () => {
  const [subTab, setSubTab] = useState<GrammarSubTab>("tables");
  const [selectedLevel, setSelectedLevel] = useState<JlptLevel | "ALL">("ALL");

  // --- TAB 1: Verb Conjugation Matrix (All 3,437 Verbs) ---
  const allCorpusVerbs = seedVerbs as unknown as Verb[];
  const [verbQuery, setVerbQuery] = useState("");
  const [registerFilter, setRegisterFilter] = useState<"all" | "plain" | "polite">("all");
  const [selectedVerb, setSelectedVerb] = useState<Verb>(
    () => allCorpusVerbs.find((v) => v.kanji_form === "食べる") || allCorpusVerbs[0]
  );

  const matchingVerbs = useMemo(() => {
    const q = verbQuery.trim().toLowerCase();
    return allCorpusVerbs
      .filter((v) => {
        if (selectedLevel !== "ALL" && v.jlpt_level !== selectedLevel) return false;
        if (!q) return true;
        return (
          v.kanji_form.toLowerCase().includes(q) ||
          v.furigana_reading.toLowerCase().includes(q) ||
          v.meanings.some((m) => m.toLowerCase().includes(q))
        );
      })
      .slice(0, 24);
  }, [verbQuery, selectedLevel, allCorpusVerbs]);

  const dynamicConjugations = useMemo(
    () => conjugateVerb(selectedVerb),
    [selectedVerb]
  );

  const filteredConjugations = useMemo(() => {
    return dynamicConjugations.filter((row) => {
      if (registerFilter === "all") return true;
      return row.register === registerFilter;
    });
  }, [dynamicConjugations, registerFilter]);

  const handlePickRandomVerb = () => {
    const pool =
      selectedLevel === "ALL"
        ? allCorpusVerbs
        : allCorpusVerbs.filter((v) => v.jlpt_level === selectedLevel);
    if (pool.length > 0) {
      const random = pool[Math.floor(Math.random() * pool.length)];
      setSelectedVerb(random);
    }
  };

  // --- TAB 2: Particles Encyclopedia ---
  const filteredParticles = useMemo(() => {
    if (selectedLevel === "ALL") return PARTICLE_ENTRIES;
    return PARTICLE_ENTRIES.filter((p) => p.jlpt_level === selectedLevel);
  }, [selectedLevel]);

  const [activeParticleId, setActiveParticleId] = useState<string>(
    PARTICLE_ENTRIES[0]?.id || ""
  );

  const activeParticle = useMemo(() => {
    return (
      filteredParticles.find((p) => p.id === activeParticleId) ||
      filteredParticles[0] ||
      PARTICLE_ENTRIES[0]
    );
  }, [filteredParticles, activeParticleId]);

  // --- TAB 3: JLPT Sentence & Particle Quiz + "Honestly, I Don't Know" Flagging ---
  const [sessionLength, setSessionLength] = useState<SessionPreset>(10);
  const [showQuizFurigana, setShowQuizFurigana] = useState<boolean>(true);
  const [quizScope, setQuizScope] = useState<"all" | "flagged">("all");
  const [flaggedIdkIds, setFlaggedIdkIds] = useState<string[]>([]);

  const [quizDeck, setQuizDeck] = useState<GrammarQuizQuestion[]>(() =>
    shuffleArray(GRAMMAR_QUIZ_QUESTIONS)
  );
  const [qIndex, setQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answeredAsIdk, setAnsweredAsIdk] = useState(false);

  const [score, setScore] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [sessionIdkCount, setSessionIdkCount] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);

  // Load persisted flagged IDK grammar IDs from SQLite
  useEffect(() => {
    (async () => {
      try {
        const db = await getDatabase();
        await db.execute(`
          CREATE TABLE IF NOT EXISTS grammar_flagged_idk (
            question_id TEXT PRIMARY KEY,
            flagged_at TEXT NOT NULL
          );
        `);
        const rows = await db.select<Array<{ question_id: string }>>(
          `SELECT question_id FROM grammar_flagged_idk ORDER BY flagged_at DESC;`
        );
        if (rows) {
          setFlaggedIdkIds(rows.map((r) => r.question_id));
        }
      } catch (err) {
        console.warn("[GrammarView] Could not load flagged IDK table:", err);
      }
    })();
  }, []);

  const persistFlaggedIdk = async (questionId: string) => {
    setFlaggedIdkIds((prev) =>
      prev.includes(questionId) ? prev : [questionId, ...prev]
    );
    try {
      const db = await getDatabase();
      await db.execute(
        `INSERT OR REPLACE INTO grammar_flagged_idk (question_id, flagged_at) VALUES (?, ?);`,
        [questionId, new Date().toISOString()]
      );
    } catch (err) {
      console.warn("[GrammarView] Failed to save flagged IDK:", err);
    }
  };

  const clearFlaggedIdk = async (questionId: string) => {
    setFlaggedIdkIds((prev) => prev.filter((id) => id !== questionId));
    try {
      const db = await getDatabase();
      await db.execute(`DELETE FROM grammar_flagged_idk WHERE question_id = ?;`, [
        questionId,
      ]);
    } catch {
      // ignore
    }
  };

  const resetQuizSession = (
    level: JlptLevel | "ALL" = selectedLevel,
    scope: "all" | "flagged" = quizScope
  ) => {
    let pool =
      level === "ALL"
        ? GRAMMAR_QUIZ_QUESTIONS
        : GRAMMAR_QUIZ_QUESTIONS.filter((q) => q.jlpt_level === level);

    if (scope === "flagged") {
      const flaggedPool = pool.filter((q) => flaggedIdkIds.includes(q.id));
      pool = flaggedPool.length > 0 ? flaggedPool : pool;
    }

    const shuffled = shuffleArray(pool.length > 0 ? pool : GRAMMAR_QUIZ_QUESTIONS);
    setQuizDeck(shuffled);
    setQIndex(0);
    setSelectedOption(null);
    setAnsweredAsIdk(false);
    setScore(0);
    setAnsweredCount(0);
    setStreak(0);
    setSessionIdkCount(0);
    setSessionComplete(false);
  };

  useEffect(() => {
    resetQuizSession(selectedLevel, quizScope);
  }, [selectedLevel, quizScope]);

  const currentQuestion = quizDeck[qIndex % Math.max(1, quizDeck.length)];
  const isAnswered = selectedOption !== null || answeredAsIdk;
  const idkButtonLabel = IDK_LABELS[qIndex % IDK_LABELS.length];

  const handleSelectOption = (idx: number) => {
    if (isAnswered || !currentQuestion) return;
    setSelectedOption(idx);
    setAnsweredCount((c) => c + 1);

    if (idx === currentQuestion.correct_index) {
      setScore((s) => s + 1);
      setStreak((st) => st + 1);
      // If user got a previously flagged item right, unflag it automatically
      if (flaggedIdkIds.includes(currentQuestion.id)) {
        clearFlaggedIdk(currentQuestion.id);
      }
    } else {
      setStreak(0);
      if (sessionLength === "infinite") {
        setQuizDeck((prev) => {
          const copy = [...prev];
          const insertPos = Math.min(copy.length, qIndex + 4);
          copy.splice(insertPos, 0, currentQuestion);
          return copy;
        });
      }
    }
  };

  const handleHonestlyDontKnow = () => {
    if (isAnswered || !currentQuestion) return;
    setAnsweredAsIdk(true);
    setAnsweredCount((c) => c + 1);
    setSessionIdkCount((k) => k + 1);
    setStreak(0);
    persistFlaggedIdk(currentQuestion.id);

    if (sessionLength === "infinite") {
      setQuizDeck((prev) => {
        const copy = [...prev];
        const insertPos = Math.min(copy.length, qIndex + 3);
        copy.splice(insertPos, 0, currentQuestion);
        return copy;
      });
    }
  };

  const handleNextQuestion = () => {
    if (sessionLength !== "infinite" && answeredCount >= sessionLength) {
      setSessionComplete(true);
      return;
    }
    setSelectedOption(null);
    setAnsweredAsIdk(false);
    setQIndex((prev) => {
      if (prev + 1 >= quizDeck.length) {
        setQuizDeck(shuffleArray(quizDeck));
        return 0;
      }
      return prev + 1;
    });
  };

  // Keyboard shortcuts for Grammar Quiz (1-4, ? for IDK, Enter/Space for Next)
  useEffect(() => {
    if (subTab !== "quiz") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (!isAnswered) {
        if (e.key === "1") handleSelectOption(0);
        if (e.key === "2") handleSelectOption(1);
        if (e.key === "3") handleSelectOption(2);
        if (e.key === "4") handleSelectOption(3);
        if (e.key === "?" || e.key === "0") handleHonestlyDontKnow();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleNextQuestion();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const accuracyPct =
    answeredCount === 0 ? 0 : Math.round((score / answeredCount) * 100);

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-24 md:pb-10">
      {/* Top Sub-Tab Switcher & JLPT Filter */}
      <div className="p-4 rounded-3xl glass-card border border-border-glass flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl glass-panel overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab("tables")}
            className={`flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              subTab === "tables"
                ? "bg-accent text-white shadow-neon-glow"
                : "text-primary-muted hover:text-primary"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Verb Tense Tables</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("particles")}
            className={`flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              subTab === "particles"
                ? "bg-accent text-white shadow-neon-glow"
                : "text-primary-muted hover:text-primary"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Particles (N5–N1)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("quiz")}
            className={`flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              subTab === "quiz"
                ? "bg-accent text-white shadow-neon-glow"
                : "text-primary-muted hover:text-primary"
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>JLPT Grammar Quiz</span>
          </button>
        </div>

        {/* JLPT Level Filter */}
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
            All
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
      </div>

      {/* ================================================================= */}
      {/* SUB-TAB 1: VERB CONJUGATION MATRIX (ALL 3,437 VERBS)              */}
      {/* ================================================================= */}
      {subTab === "tables" && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl glass-card border border-border-glass space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-primary-muted absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={verbQuery}
                  onChange={(e) => setVerbQuery(e.target.value)}
                  placeholder="Search any of 3,437 verbs to conjugate (e.g., 食べる, 書く, 実装する)..."
                  className="w-full min-h-[40px] pl-10 pr-4 py-1.5 rounded-xl glass-panel border border-border-glass text-xs sm:text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <button
                type="button"
                onClick={handlePickRandomVerb}
                className="flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl glass-panel border border-border-glass text-xs font-semibold text-primary hover:border-accent"
              >
                <Shuffle className="w-3.5 h-3.5 text-accent" />
                <span>Random Verb</span>
              </button>

              <div className="flex items-center gap-1 p-1 rounded-xl glass-panel">
                {(["all", "plain", "polite"] as const).map((reg) => (
                  <button
                    key={reg}
                    type="button"
                    onClick={() => setRegisterFilter(reg)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${
                      registerFilter === reg
                        ? "bg-accent text-white"
                        : "text-primary-muted hover:text-primary"
                    }`}
                  >
                    {reg}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick-pick & Matching Verb Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {matchingVerbs.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVerb(v)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-jp font-semibold whitespace-nowrap shrink-0 border transition-all ${
                    selectedVerb?.id === v.id
                      ? "bg-accent/15 border-accent text-accent"
                      : "glass-panel border-border-glass text-primary-muted hover:text-primary"
                  }`}
                >
                  {v.kanji_form}
                </button>
              ))}
            </div>

            {/* Active Selected Verb Header */}
            {selectedVerb && (
              <div className="p-3.5 rounded-2xl glass-panel border border-accent/25 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-jp text-xl font-bold text-primary">
                      {selectedVerb.kanji_form}
                    </span>
                    <span className="font-jp text-sm text-accent font-medium">
                      （{selectedVerb.furigana_reading}）
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-accent/15 text-accent font-bold">
                      {selectedVerb.jlpt_level} • {selectedVerb.verb_group}
                    </span>
                  </div>
                  <p className="text-xs text-primary-muted mt-0.5">
                    {selectedVerb.meanings.slice(0, 4).join(", ")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    speakJapanese(
                      selectedVerb.furigana_reading || selectedVerb.kanji_form
                    )
                  }
                  className="flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-accent text-white text-xs font-semibold"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Pronounce Base</span>
                </button>
              </div>
            )}
          </div>

          {/* Conjugation Table */}
          <div className="rounded-3xl glass-card border border-border-glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-glass text-[11px] uppercase tracking-wider text-primary-muted bg-surface-hover/40">
                    <th className="py-3 px-4">Form / Tense</th>
                    <th className="py-3 px-4">Conjugated Verb</th>
                    <th className="py-3 px-4">Furigana Reading</th>
                    <th className="py-3 px-4 text-right">Audio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-glass text-xs sm:text-sm">
                  {filteredConjugations.map((row, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-surface-hover/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-primary">
                        <div>{row.tense_label}</div>
                        <span className="text-[10px] uppercase text-primary-muted">
                          {row.register} • {row.polarity}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-jp font-bold text-base text-primary">
                        {row.kanjiForm}
                      </td>
                      <td className="py-3 px-4 font-jp text-accent">
                        {row.furiganaForm}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => speakJapanese(row.furiganaForm)}
                          aria-label={`Pronounce ${row.kanjiForm}`}
                          className="p-2 rounded-xl text-primary-muted hover:text-accent hover:bg-surface-hover inline-flex"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* General Pattern Reference Matrix */}
          <div className="rounded-3xl glass-card border border-border-glass p-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary-muted">
              Standard Verb Group Rules & Example Sentences
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {CONJUGATION_ROWS.map((r, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-2xl glass-panel border border-border-glass space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-accent">
                      {r.tense_label}
                    </span>
                    <button
                      type="button"
                      onClick={() => speakJapanese(r.example_jp)}
                      className="p-1 rounded-lg text-primary-muted hover:text-accent"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-[11px] text-primary-muted space-y-0.5">
                    <div>
                      <strong>Ichidan:</strong> {r.ichidan_rule}
                    </div>
                    <div>
                      <strong>Godan:</strong> {r.godan_rule}
                    </div>
                    <div>
                      <strong>Irregular:</strong> {r.irregular_rule}
                    </div>
                  </div>
                  <div className="pt-1 border-t border-border-glass">
                    <div className="font-jp text-xs text-primary font-medium">
                      {r.example_jp}
                    </div>
                    <div className="text-[11px] text-primary-muted">
                      {r.example_en}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-TAB 2: PARTICLES ENCYCLOPEDIA (HORIZONTAL PILLS)              */}
      {/* ================================================================= */}
      {subTab === "particles" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {filteredParticles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveParticleId(p.id)}
                className={`min-w-[3.25rem] min-h-[42px] px-3 py-2 rounded-2xl font-jp text-sm font-bold whitespace-nowrap shrink-0 border transition-all ${
                  activeParticle?.id === p.id
                    ? "bg-accent text-white border-accent shadow-neon-glow"
                    : "glass-card border-border-glass text-primary hover:border-accent/50"
                }`}
              >
                {p.particle}
              </button>
            ))}
          </div>

          {activeParticle && (
            <div className="p-5 rounded-3xl glass-card border border-border-glass space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-jp text-3xl font-bold text-accent">
                      {activeParticle.particle}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-accent/15 text-accent text-xs font-bold">
                      {activeParticle.jlpt_level}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-primary mt-1">
                    {activeParticle.role_title}
                  </h3>
                </div>
              </div>

              <p className="text-sm text-primary leading-relaxed">
                {activeParticle.explanation}
              </p>

              {activeParticle.contrast_note && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                  <strong>Nuance & Contrast:</strong> {activeParticle.contrast_note}
                </div>
              )}

              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary-muted">
                  Annotated Examples
                </h4>
                {activeParticle.examples.map((ex, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-2xl glass-panel border border-border-glass flex items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="font-jp text-sm sm:text-base font-bold text-primary">
                        <AnnotatedJapaneseText
                          text={ex.jp}
                          showFurigana={true}
                          fallbackFuriganaHint={ex.furigana}
                        />
                      </div>
                      <div className="text-xs text-primary-muted">{ex.en}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => speakJapanese(ex.furigana || ex.jp)}
                      aria-label="Play example audio"
                      className="p-2.5 rounded-xl glass-card text-primary-muted hover:text-accent shrink-0"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-TAB 3: JLPT GRAMMAR & PARTICLE QUIZ (FURIGANA + TOOLTIP + IDK)*/}
      {/* ================================================================= */}
      {subTab === "quiz" && (
        <div className="space-y-4">
          {/* Quiz Controls & Live Telemetry HUD */}
          <div className="p-4 rounded-3xl glass-card border border-border-glass space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Session Length Presets */}
              <div className="flex items-center gap-1 p-1 rounded-xl glass-panel overflow-x-auto">
                {([10, 20, 30, 40, "infinite"] as SessionPreset[]).map((len) => (
                  <button
                    key={String(len)}
                    type="button"
                    onClick={() => {
                      setSessionLength(len);
                      resetQuizSession(selectedLevel, quizScope);
                    }}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      sessionLength === len
                        ? "bg-accent text-white"
                        : "text-primary-muted hover:text-primary"
                    }`}
                  >
                    {len === "infinite" ? "∞ Loop" : `${len} Qs`}
                  </button>
                ))}
              </div>

              {/* Deck Scope: All vs Flagged IDK */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setQuizScope("all")}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    quizScope === "all"
                      ? "bg-accent/15 border-accent text-accent"
                      : "glass-panel border-border-glass text-primary-muted hover:text-primary"
                  }`}
                >
                  All Grammar
                </button>

                <button
                  type="button"
                  onClick={() => setQuizScope("flagged")}
                  disabled={flaggedIdkIds.length === 0}
                  className={`flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    quizScope === "flagged"
                      ? "bg-amber-500/20 border-amber-400 text-amber-300"
                      : "glass-panel border-border-glass text-primary-muted hover:text-primary disabled:opacity-40"
                  }`}
                >
                  <span>🤷 Flagged IDK ({flaggedIdkIds.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowQuizFurigana((prev) => !prev)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    showQuizFurigana
                      ? "bg-accent/15 border-accent text-accent"
                      : "glass-panel border-border-glass text-primary-muted hover:text-primary"
                  }`}
                >
                  Furigana: {showQuizFurigana ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            {/* Live Score HUD */}
            <div className="grid grid-cols-4 gap-2 pt-1 text-center">
              <div className="p-2 rounded-2xl glass-panel">
                <div className="text-[10px] uppercase text-primary-muted">Score</div>
                <div className="text-sm font-bold text-primary tabular-nums">
                  {score}/{answeredCount} ({accuracyPct}%)
                </div>
              </div>
              <div className="p-2 rounded-2xl glass-panel">
                <div className="text-[10px] uppercase text-primary-muted">Streak</div>
                <div className="text-sm font-bold text-emerald-400 tabular-nums">
                  {streak} 🔥
                </div>
              </div>
              <div className="p-2 rounded-2xl glass-panel">
                <div className="text-[10px] uppercase text-primary-muted">
                  Flagged IDK
                </div>
                <div className="text-sm font-bold text-amber-400 tabular-nums">
                  {sessionIdkCount} 🤷
                </div>
              </div>
              <div className="p-2 rounded-2xl glass-panel">
                <div className="text-[10px] uppercase text-primary-muted">Progress</div>
                <div className="text-sm font-bold text-accent tabular-nums">
                  {answeredCount} / {sessionLength === "infinite" ? "∞" : sessionLength}
                </div>
              </div>
            </div>
          </div>

          {/* Session Summary Card */}
          {sessionComplete ? (
            <div className="p-8 rounded-3xl glass-card border border-border-glass text-center space-y-4">
              <Sparkles className="w-10 h-10 text-accent mx-auto" />
              <h3 className="text-xl font-bold text-primary">
                Grammar Session Complete!
              </h3>
              <p className="text-sm text-primary-muted">
                You scored{" "}
                <strong className="text-primary">
                  {score} / {answeredCount} ({accuracyPct}%)
                </strong>{" "}
                and flagged{" "}
                <strong className="text-amber-400">
                  {sessionIdkCount} questions 🤷
                </strong>{" "}
                for honest review instead of guessing.
              </p>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => resetQuizSession(selectedLevel, "all")}
                  className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-accent text-white text-xs font-semibold flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Start New Session</span>
                </button>
                {flaggedIdkIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuizScope("flagged");
                      resetQuizSession(selectedLevel, "flagged");
                    }}
                    className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-semibold"
                  >
                    🤷 Review {flaggedIdkIds.length} Flagged IDK Items
                  </button>
                )}
              </div>
            </div>
          ) : (
            currentQuestion && (
              <div className="p-5 sm:p-6 rounded-3xl glass-card border border-border-glass space-y-5">
                {/* Question Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-accent/15 text-accent text-xs font-bold">
                      {currentQuestion.jlpt_level}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg glass-panel text-primary-muted text-xs font-semibold capitalize">
                      {currentQuestion.category}
                    </span>
                    <span className="text-[11px] text-primary-muted hidden sm:inline">
                      Hover or tap any underlined kanji for English meaning
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      speakJapanese(
                        currentQuestion.furigana_hint ||
                          currentQuestion.sentence_with_blank
                      )
                    }
                    className="flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl glass-panel border border-border-glass text-xs font-semibold text-primary hover:border-accent"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-accent" />
                    <span>Listen</span>
                  </button>
                </div>

                {/* Sentence Prompt with Full Kanji Furigana + Meaning Hover/Tap */}
                <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-border-glass space-y-2">
                  <div className="text-lg sm:text-2xl font-bold text-primary">
                    <AnnotatedJapaneseText
                      text={currentQuestion.sentence_with_blank}
                      showFurigana={showQuizFurigana}
                      fallbackFuriganaHint={currentQuestion.furigana_hint}
                    />
                  </div>
                  <p className="text-xs sm:text-sm text-primary-muted">
                    {currentQuestion.translation_en}
                  </p>
                </div>

                {/* 4 Multiple-Choice Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {currentQuestion.options.map((opt, idx) => {
                    const isCorrect = idx === currentQuestion.correct_index;
                    const isPicked = idx === selectedOption;

                    let cardStyle =
                      "glass-panel border-border-glass hover:border-accent/60 text-primary";
                    if (isAnswered) {
                      if (isCorrect) {
                        cardStyle =
                          "bg-emerald-500/15 border-emerald-400 text-emerald-200";
                      } else if (isPicked) {
                        cardStyle =
                          "bg-rose-500/15 border-rose-400 text-rose-200";
                      } else {
                        cardStyle =
                          "glass-panel border-border-glass opacity-60 text-primary-muted";
                      }
                    }

                    return (
                      <div
                        key={idx}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectOption(idx)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSelectOption(idx);
                        }}
                        className={`min-h-[54px] p-3.5 rounded-2xl border flex items-center justify-between gap-2 transition-all cursor-pointer ${cardStyle}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-surface-hover text-xs font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="text-base font-bold">
                            <AnnotatedJapaneseText
                              text={opt.text}
                              showFurigana={showQuizFurigana}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              speakJapanese(opt.text);
                            }}
                            aria-label={`Pronounce option ${opt.text}`}
                            className="p-1.5 rounded-lg text-primary-muted hover:text-accent hover:bg-surface-hover"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                          {isAnswered && isCorrect && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          )}
                          {isAnswered && isPicked && !isCorrect && (
                            <XCircle className="w-4 h-4 text-rose-400" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 5th Action: "Honestly, I Don't Know" Anti-Gacha Flag Button */}
                {!isAnswered && (
                  <button
                    type="button"
                    onClick={handleHonestlyDontKnow}
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                  >
                    <Flag className="w-4 h-4" />
                    <span>{idkButtonLabel}</span>
                  </button>
                )}

                {/* Diagnostic Feedback Banner (Correct / Wrong Option Meaning / Flagged IDK) */}
                {isAnswered && (
                  <div
                    className={`p-4 rounded-2xl border space-y-2 ${
                      answeredAsIdk
                        ? "bg-amber-500/10 border-amber-400/40"
                        : selectedOption === currentQuestion.correct_index
                        ? "bg-emerald-500/10 border-emerald-400/40"
                        : "bg-rose-500/10 border-rose-400/40"
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-bold">
                      {answeredAsIdk ? (
                        <span className="text-amber-300">
                          🤷 Flagged as "Honestly, I don't know" — saved to your
                          Flagged Review deck (no lucky guess counted!).
                        </span>
                      ) : selectedOption === currentQuestion.correct_index ? (
                        <span className="text-emerald-300">
                          Correct! Great grammar & particle recall.
                        </span>
                      ) : (
                        <span className="text-rose-300">
                          Not quite — you chose{" "}
                          <strong className="font-jp">
                            {selectedOption !== null
                              ? currentQuestion.options[selectedOption]?.text
                              : ""}
                          </strong>{" "}
                          (
                          {selectedOption !== null
                            ? currentQuestion.options[selectedOption]?.meaning_or_role
                            : ""}
                          ).
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-primary leading-relaxed">
                      <strong>Correct Answer:</strong>{" "}
                      <span className="font-jp font-bold text-accent">
                        {
                          currentQuestion.options[currentQuestion.correct_index]
                            ?.text
                        }
                      </span>{" "}
                      — {currentQuestion.rule_explanation}
                    </p>

                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={handleNextQuestion}
                        className="min-h-[42px] px-5 py-2 rounded-xl bg-accent text-white text-xs font-semibold"
                      >
                        Next Question →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};