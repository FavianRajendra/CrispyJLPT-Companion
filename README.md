# JLPT Verb Kanji Studio

> Cross-Platform Offline-First Japanese Verb Kanji Learning Studio targeting **Android (`.apk`)**, **macOS (`.dmg`)**, and **Windows (`.msi`/`.exe`)** from a single codebase.

Built with **Tauri v2**, **React 19**, **TypeScript**, **Tailwind CSS**, **Framer Motion**, **SQLite (Dual-Driver Native / WebAssembly)**, and **Neon Serverless PostgreSQL**.

---

## Key Highlights & Architecture

### 1. Dual-Driver Database Layer (`src/lib/db.ts`)
- **Native Tauri (Desktop & Mobile):** Runs `@tauri-apps/plugin-sql` interfacing with native SQLite (`jlpt_verbs.db`) with zero overhead and full offline operation.
- **Web Browser Fallback:** Seamlessly switches to `sql.js` (WASM SQLite) persisted in IndexedDB, allowing 100% feature-complete testing and preview inside any modern browser without needing to recompile native binaries.

### 2. Dual-Axis FSRS Mastery & Priority Scheduler (`src/lib/mastery.ts`)
- Evaluates **Reading Mastery** and **Meaning Mastery** separately on independent axes (0.0 to 1.0).
- Applies exponential memory decay:
  $$R(t) = e^{-t / S}$$
  where $S$ is memory stability in days and $t$ is elapsed time since last review.
- Dynamic session priority queue:
  $$P_v = (W_{\text{exam}} \cdot S_{\text{jlpt}}(v)) + (W_{\text{industry}} \cdot S_{\text{domain}}(v)) + (W_{\text{fsrs}} \cdot U_{\text{decay}}(v))$$
  calibrated to balance core exam readiness (e.g. N2) with targeted career vocabulary (e.g. IT, Finance, Healthcare).

### 3. Modern Glassmorphic Design System (`src/styles/tokens.css`)
- **Three-Layer CSS Token Architecture:**
  - Layer 1: Primitives (`--raw-zinc-950`, `--raw-indigo-500`, `--raw-emerald-500`, `--raw-amber-500`, `--raw-rose-500`)
  - Layer 2: Semantics (`--bg-canvas`, `--surface-glass`, `--border-glass`, `--text-primary`, `--text-muted`)
  - Layer 3: Components (`--card-radius: 1.5rem`, `--touch-target-min: 44px`, fixed vertical layout slots)
- **Zero Cumulative Layout Shift (`CLS < 0.1`):** Fixed vertical height reservation for `<ruby>` Furigana and English definitions prevents visual jumping during card flips.
- **Framer Motion Choreography:** Staggered eye-tracking reveal (`0.00s` Kanji pulse -> `0.08s` Ruby Furigana glide -> `0.18s` English meaning fade).

### 4. Core Study Modes
- **Present Mode:** Manual study with FSRS triage (Again, Hard, Easy) + Hands-Free Slideshow with customizable speed (`0.5x`–`2.0x`), loop toggle, native `ja-JP` speech synthesis, and SVG circular countdown ring.
- **Quiz Mode:** 4 adaptive formats (Reading Test, Meaning Test, Reverse Recognition, and Dual-Track Weakness Exam).
- **Directory Mode:** Searchable verb dictionary across all JLPT levels (`N5`–`N1`) and 6 career tracks (`IT`, `Finance`, `Food & Beverage`, `Healthcare`, `Manufacturing`, `General`).
- **Mastery Mode:** Career goal calibration, dual progress meters (JLPT Exam Readiness % & Industry Readiness %), and FSRS memory distribution.

### 5. Multi-Device Cloud Sync (`db/schema.sql`, `api/sync.ts`, `src/lib/sync.ts`)
- Edge-compatible serverless handler powered by `@neondatabase/serverless` for Neon PostgreSQL.
- Delta sync with timestamp conflict resolution and "Continue as Local Guest" automatic merge.

---

## Getting Started

### Prerequisites
- Node.js >= 20
- Rust & Cargo >= 1.78
- Python 3.11+ (for corpus scraping)

### Installation & Development
```bash
# Install dependencies
npm install

# Single-command native desktop app launch (macOS / Windows)
npm run dev

# Fast browser preview with WebAssembly SQLite fallback
npm run dev:web

# Production build
npm run build
npm run build:tauri
```

### Keyboard Shortcuts
| Key | Action |
| --- | --- |
| `Space` | Reveal English Meaning / Advance Quiz |
| `←` / `→` | Previous / Next Verb |
| `R` | Pronounce Japanese Audio (ja-JP) |
| `1` / `2` / `3` | FSRS Triage (Again / Hard / Easy) |
| `1` – `4` | Select Quiz Option |

---

## Cross-Platform Packaging & CI/CD
Automated builds for **macOS (`.dmg`)**, **Windows (`.msi`)**, and **Android (`.apk`)** are configured via GitHub Actions in [build.yml](file:///.github/workflows/build.yml).
