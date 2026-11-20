/**
 * Native Japanese Speech Synthesis helper using Web Speech API (ja-JP).
 * Hardened for macOS WKWebView, Windows WebView2, and Android WebView.
 */

let cachedJaVoice: SpeechSynthesisVoice | null = null;
// let activeUtterance: SpeechSynthesisUtterance | null = null;

function resolveJapaneseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return cachedJaVoice;

  const preferredNames = [
    "Kyoko",
    "Otoya",
    "O-Ren",
    "Hattori",
    "Google 日本語",
    "Nanami",
    "Haruka",
  ];

  for (const name of preferredNames) {
    const match = voices.find(
      (v) => v.lang.toLowerCase().startsWith("ja") && v.name.includes(name)
    );
    if (match) {
      cachedJaVoice = match;
      return match;
    }
  }

  const anyJa = voices.find((v) => v.lang.toLowerCase().startsWith("ja"));
  if (anyJa) {
    cachedJaVoice = anyJa;
  }
  return cachedJaVoice;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  resolveJapaneseVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    resolveJapaneseVoice();
  };
}

function sanitizeJapaneseForSpeech(raw: string): string {
  return raw
    .replace(/（\s*）/g, "、")
    .replace(/\(\s*\)/g, "、")
    .replace(/＿+/g, "、")
    .replace(/\s+/g, " ")
    .trim();
}

export function speakJapanese(text: string, rate: number = 0.95): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }

    const cleanText = sanitizeJapaneseForSpeech(text);
    if (!cleanText) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      // let activeUtterance: SpeechSynthesisUtterance
      resolve();
    };

    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = "ja-JP";
      utterance.rate = Math.min(2.0, Math.max(0.5, rate));
      utterance.pitch = 1.0;

      const jaVoice = resolveJapaneseVoice();
      if (jaVoice) {
        utterance.voice = jaVoice;
      }

      // Retain strong reference so macOS WKWebView does not GC utterance mid-speech
      // activeUtterance = utterance;

      // Safety fallback timer in case WKWebView drops the onend event
      const estimatedMs = Math.max(2500, cleanText.length * 320 + 1500);
      const fallbackTimer = window.setTimeout(finish, estimatedMs);

      utterance.onend = () => {
        window.clearTimeout(fallbackTimer);
        finish();
      };
      utterance.onerror = () => {
        window.clearTimeout(fallbackTimer);
        finish();
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      finish();
    }
  });
}

export const playJapaneseAudio = speakJapanese;
export const speakText = speakJapanese;