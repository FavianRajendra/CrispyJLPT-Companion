# CrispyJLPT Companion

> Offline-first Japanese verb & kanji learning studio for **Android** and **macOS**. Study JLPT (`N5`–`N1`) and industry-specific vocabulary with dual-axis spaced repetition—100% locally on your device, with zero account or internet required.

---

## Download (Offline Edition)

Grab the latest installer directly from the **[Releases](https://github.com/FavianRajendra/CrispyJLPT-Companion/releases/latest)** page:

| Platform | Installer | Status |
| :--- | :--- | :--- |
| **Android** | `.apk` (ARM64) | Available on [Releases](https://github.com/FavianRajendra/CrispyJLPT-Companion/releases/latest) |
| **macOS** | `.dmg` (Universal Apple Silicon & Intel) | Available on [Releases](https://github.com/FavianRajendra/CrispyJLPT-Companion/releases/latest) |
| **Windows** | `.msi` / `.exe` | Coming soon |

*All progress, quiz history, and custom kanji notes are stored locally on your device using SQLite.*

---

## Features

- **Present Mode:** Flashcard study with FSRS triage (`Again`, `Hard`, `Easy`), hands-free slideshow (`0.5x`–`2.0x`), furigana toggle, and native `ja-JP` audio pronunciation.
- **Quiz Mode:** Adaptive drills across Reading, Meaning, Reverse Recognition, and Weakness Review.
- **Daily Kanji & Furigana Notes (`+ Kanji`):** Quick-log vocabulary with automatic Romaji-to-Hiragana conversion and instant offline dictionary lookup.
- **Directory & Mastery:** Filterable corpus across JLPT `N5`–`N1` and 6 career tracks (`IT`, `Finance`, `F&B`, `Healthcare`, `Manufacturing`, `General`) with dual-axis reading/meaning mastery tracking.

---

## Keyboard Shortcuts (Desktop)

| Key | Action |
| :--- | :--- |
| `Space` | Reveal meaning / Advance quiz |
| `←` / `→` | Previous / Next card |
| `R` | Pronounce Japanese audio (`ja-JP`) |
| `1` / `2` / `3` | FSRS rating (`Again` / `Hard` / `Easy`) |
| `1` – `4` | Select quiz option |

---

## Run from Source (Optional)

Requires **Node.js 20+** and **Rust 1.78+**:

```bash
npm install
npm run dev       # Launch native Tauri desktop app
npm run dev:web   # Preview in browser (WASM SQLite)
```

---

## Author & Support

Built by **[FavianRajendra](https://github.com/FavianRajendra)**. If CrispyJLPT Companion helps with your Japanese studies, you can support the project here:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/favianrajed)