/**
 * Native Japanese Speech Synthesis helper using Web Speech API (ja-JP).
 * Works offline on modern OS (macOS, Windows, Android).
 */
export function speakJapanese(text: string, rate: number = 0.9): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }

    // Cancel any active speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = rate;
    utterance.pitch = 1.0;

    // Try finding native ja-JP voice if available
    const voices = window.speechSynthesis.getVoices();
    const jaVoice = voices.find(
      (v) => v.lang.startsWith("ja") || v.name.includes("Kyoko") || v.name.includes("Otoya")
    );
    if (jaVoice) {
      utterance.voice = jaVoice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}
