// Echo's voice: the browser's own speech recognition and speech synthesis,
// so there's no extra service, key or cost. Everything else talks to the two
// small interfaces below, so a better voice provider can replace either side
// later without touching the panel.
//
// Recognition is in Chrome, Edge and Safari (Chrome and Edge send the audio
// to Google/Microsoft to transcribe it); Firefox has none, so the panel hides
// the mic there. Text always works.

export type Listener = { stop(): void; abort(): void };

export type ListenErrorCode = "blocked" | "no-speech" | "no-mic" | "network" | "failed";

// The bits of the Web Speech API used here (not in TypeScript's DOM types).
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionClass = new () => Recognition;

// South African English, which the dashboard is written for; the browser
// falls back to its closest English model if it doesn't have it.
const LANG = "en-ZA";

function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return recognitionClass() !== null;
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

const ERROR_CODES: Record<string, ListenErrorCode> = {
  "not-allowed": "blocked",
  "service-not-allowed": "blocked",
  "no-speech": "no-speech",
  "audio-capture": "no-mic",
  network: "network",
};

// One utterance: it stops by itself when they pause. `onInterim` gets the
// words so far (for showing as they talk), `onEnd` the final text, or "" if
// nothing was said or it was aborted.
export function listen(handlers: {
  onInterim(text: string): void;
  onEnd(text: string): void;
  onError(code: ListenErrorCode): void;
}): Listener | null {
  const Recognition = recognitionClass();
  if (!Recognition) return null;
  const recognition = new Recognition();
  recognition.lang = LANG;
  recognition.interimResults = true;
  recognition.continuous = false;

  let finalText = "";
  let aborted = false;
  recognition.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    handlers.onInterim((finalText + interim).trim());
  };
  recognition.onerror = (e) => {
    // "aborted" is us stopping it on purpose.
    if (e.error !== "aborted") handlers.onError(ERROR_CODES[e.error] ?? "failed");
  };
  recognition.onend = () => handlers.onEnd(aborted ? "" : finalText.trim());
  recognition.start();

  return {
    stop: () => recognition.stop(),
    abort: () => {
      aborted = true;
      recognition.abort();
    },
  };
}

export const LISTEN_ERRORS: Record<ListenErrorCode, string> = {
  blocked: "I can't hear you: the microphone is blocked for this site. Allow it from the icon in the address bar, then try again.",
  "no-speech": "I didn't catch anything. Tap the mic and try again?",
  "no-mic": "I can't find a microphone. Check one is plugged in and allowed.",
  network: "Voice needs an internet connection. You can still type to me.",
  failed: "The microphone didn't work just then. Try again, or type instead.",
};

// Speaks text as it arrives, a sentence at a time: the first sentence starts
// while the rest of the reply is still coming, and short utterances avoid
// Chrome cutting off long ones partway.
export type Speaker = { say(text: string): void; stop(): void };

export function createSpeaker(handlers: { onStart(): void; onDone(): void }): Speaker {
  let pending = 0;
  let stopped = false;

  const voice = () => {
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    // Natural-sounding voices first (Edge's "Natural", Chrome's "Google"),
    // South African or British English when there's a choice.
    const score = (v: SpeechSynthesisVoice) =>
      (/natural|neural/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.lang === LANG ? 2 : v.lang === "en-GB" ? 1 : 0);
    return voices.sort((a, b) => score(b) - score(a))[0];
  };

  return {
    say(text) {
      if (stopped || !canSpeak()) return;
      for (const sentence of speakableSentences(text)) {
        const utterance = new SpeechSynthesisUtterance(sentence);
        const v = voice();
        if (v) utterance.voice = v;
        utterance.lang = v?.lang ?? LANG;
        utterance.rate = 1.05;
        utterance.onstart = () => handlers.onStart();
        utterance.onend = utterance.onerror = () => {
          pending--;
          if (pending === 0 && !stopped) handlers.onDone();
        };
        pending++;
        window.speechSynthesis.speak(utterance);
      }
    },
    stop() {
      stopped = true;
      pending = 0;
      if (canSpeak()) window.speechSynthesis.cancel();
      handlers.onDone();
    },
  };
}

// What's worth saying out loud: sentences, without list numbers or symbols
// that sound odd spoken ("1." reads as "one dot").
export function speakableSentences(text: string): string[] {
  return text
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/[*_`#>]/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[a-z0-9]/i.test(s));
}
