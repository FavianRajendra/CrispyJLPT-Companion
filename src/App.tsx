import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlaySquare,
  HelpCircle,
  FolderKanban,
  Award,
  Sun,
  Moon,
  Keyboard,
  X,
} from "lucide-react";
import { PresentView } from "./views/PresentView";
import { QuizView } from "./views/QuizView";
import { DirectoryView } from "./views/DirectoryView";
import { MasteryView } from "./views/MasteryView";
import { getDatabase, UserProfile, JlptLevel } from "./lib/db";
import { getDecoratedVerbs, VerbWithProgress } from "./lib/mastery";
import { cn } from "./lib/utils";

type NavTab = "present" | "quiz" | "directory" | "mastery";

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>("present");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [verbs, setVerbs] = useState<VerbWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Load Database & Initial State
  const loadAppState = useCallback(async () => {
    try {
      const db = await getDatabase();
      const profiles = await db.select<UserProfile[]>("SELECT * FROM user_profiles LIMIT 1;");
      const activeProf = profiles[0] || {
        id: "guest_user",
        current_jlpt: "N5" as JlptLevel,
        target_jlpt: "N2" as JlptLevel,
        target_industries: ["it"],
        industry_blend_ratio: 0.7,
        daily_goal: 15,
        updated_at: new Date().toISOString(),
      };

      setProfile(activeProf);
      const decorated = await getDecoratedVerbs(activeProf);
      setVerbs(decorated);
    } catch (err) {
      console.error("Failed to load application state:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAppState();
  }, [loadAppState]);

  // Handle Theme Toggle
  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
      }
      return next;
    });
  };

  const navItems = [
    { id: "present", label: "Present", icon: PlaySquare },
    { id: "quiz", label: "Quiz", icon: HelpCircle },
    { id: "directory", label: "Directory", icon: FolderKanban },
    { id: "mastery", label: "Mastery", icon: Award },
  ] as const;

  if (isLoading || !profile) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center text-center p-6">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
          className="w-12 h-12 rounded-full border-2 border-accent border-t-transparent mb-4"
        />
        <h2 className="text-lg font-bold text-primary">JLPT Verb Kanji Studio</h2>
        <p className="text-xs text-primary-muted mt-1">Initializing SQLite engine & corpus...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-primary flex flex-col font-sans pb-24 md:pb-8">
      {/* Top Header Navigation (Desktop & Mobile Unified Header) */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-border-glass px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center font-jp font-extrabold text-lg shadow-neon-glow">
              動
            </div>
            <div>
              <h1 className="text-sm font-bold text-primary flex items-center gap-1.5 leading-tight">
                <span>JLPT Verb Studio</span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent/20 text-accent">
                  v2.0
                </span>
              </h1>
              <p className="text-[11px] text-primary-muted leading-tight">
                {profile.target_jlpt} • {profile.target_industries[0]?.toUpperCase() || "IT"} Track
              </p>
            </div>
          </div>

          {/* Desktop Top Segmented Pill Bar */}
          <nav className="hidden md:flex items-center p-1 rounded-full glass-panel border border-border-glass">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "relative flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold transition-all duration-200 select-none",
                    isActive ? "text-white" : "text-primary-muted hover:text-primary"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-nav-pill"
                      className="absolute inset-0 rounded-full bg-accent shadow-neon-glow"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon className="relative z-10 w-4 h-4" />
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Action Icons: Shortcuts Guide & Theme Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowShortcutsModal(true)}
              title="Keyboard Shortcuts"
              className="p-2 rounded-full glass-panel hover:bg-surface-hover text-primary-muted hover:text-primary transition-colors"
            >
              <Keyboard className="w-4 h-4" />
            </button>

            <button
              onClick={toggleTheme}
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="p-2 rounded-full glass-panel hover:bg-surface-hover text-primary-muted hover:text-primary transition-colors"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-6xl mx-auto py-2">
        <AnimatePresence mode="wait">
          {activeTab === "present" && (
            <motion.div
              key="present"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <PresentView verbs={verbs} profile={profile} onVerbUpdated={loadAppState} />
            </motion.div>
          )}

          {activeTab === "quiz" && (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <QuizView verbs={verbs} profile={profile} onVerbUpdated={loadAppState} />
            </motion.div>
          )}

          {activeTab === "directory" && (
            <motion.div
              key="directory"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <DirectoryView verbs={verbs} profile={profile} onVerbUpdated={loadAppState} />
            </motion.div>
          )}

          {activeTab === "mastery" && (
            <motion.div
              key="mastery"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <MasteryView
                verbs={verbs}
                profile={profile}
                onProfileUpdated={(updated) => {
                  setProfile(updated);
                  loadAppState();
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Floating Bottom Glass Bar */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 z-40 p-2 rounded-2xl glass-card border border-border-glass shadow-glass flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "relative min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] flex flex-col items-center justify-center px-3 py-1 rounded-xl text-[11px] font-semibold transition-all",
                isActive ? "text-accent" : "text-primary-muted hover:text-primary"
              )}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{item.label}</span>
              {isActive && (
                <motion.div
                  layoutId="active-mobile-pill"
                  className="absolute bottom-0 w-6 h-0.5 rounded-full bg-accent"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Keyboard Shortcuts Dialog */}
      <AnimatePresence>
        {showShortcutsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md glass-card p-6 rounded-[var(--card-radius)] border border-border-glass shadow-glass"
            >
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="absolute top-4 right-4 p-2 rounded-full glass-panel hover:bg-surface-hover text-primary-muted hover:text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-base font-bold text-primary mb-4 flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-accent" />
                <span>Keyboard Shortcuts</span>
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl glass-panel">
                  <span className="text-primary-muted font-medium">Reveal English Meaning</span>
                  <kbd className="px-2.5 py-1 rounded-lg bg-surface-card border border-border-glass font-mono font-bold text-primary">
                    Space
                  </kbd>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl glass-panel">
                  <span className="text-primary-muted font-medium">Next / Previous Verb</span>
                  <kbd className="px-2.5 py-1 rounded-lg bg-surface-card border border-border-glass font-mono font-bold text-primary">
                    ← / →
                  </kbd>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl glass-panel">
                  <span className="text-primary-muted font-medium">Pronounce Japanese Audio</span>
                  <kbd className="px-2.5 py-1 rounded-lg bg-surface-card border border-border-glass font-mono font-bold text-primary">
                    R
                  </kbd>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl glass-panel">
                  <span className="text-primary-muted font-medium">FSRS Triage (Again / Hard / Easy)</span>
                  <kbd className="px-2.5 py-1 rounded-lg bg-surface-card border border-border-glass font-mono font-bold text-primary">
                    1 / 2 / 3
                  </kbd>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl glass-panel">
                  <span className="text-primary-muted font-medium">Quiz Multiple-Choice Answers</span>
                  <kbd className="px-2.5 py-1 rounded-lg bg-surface-card border border-border-glass font-mono font-bold text-primary">
                    1, 2, 3, 4
                  </kbd>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
