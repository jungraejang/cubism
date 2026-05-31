"use client";

/**
 * Web Speech API wrapper that picks the most natural-sounding voice the
 * browser exposes. The default voice on most platforms (Microsoft David
 * on Windows, etc.) is a clipped, robotic concatenative synth; the
 * modern Edge / Chrome runtimes ship cloud-backed *neural* voices
 * alongside it under names like:
 *
 *   - "Microsoft Aria Online (Natural) - English (United States)"
 *   - "Microsoft Jenny Online (Natural) - English (United States)"
 *   - "Microsoft Guy Online (Natural) - English (United States)"
 *   - "Google US English" (Chrome's higher-quality bundled voice)
 *
 * They sound dramatically better — close to professional voiceover —
 * but the API never picks them automatically. We have to scan
 * `getVoices()` and select by name. Voices load asynchronously, so we
 * also subscribe to the one-shot `voiceschanged` event.
 *
 * `rate: 0.95` and `pitch: 1.05` round off the slightly-rushed cadence
 * the neural voices ship with at the API defaults — keeps replies
 * sounding conversational rather than newsroom-fast.
 */

/**
 * Substrings to look for, in priority order. The first voice whose
 * name contains any of these substrings (case-insensitive) is picked.
 * Putting the Windows "Natural" voices first means Edge/Chrome users
 * get the best option without configuration; Google's bundled voice
 * is a solid Chrome-on-Linux fallback; "neural" / "natural" catch any
 * platform-specific voices we don't know about by name.
 */
const VOICE_PREFERENCES = [
  "Aria Online",
  "Jenny Online",
  "Guy Online",
  "Sonia Online",
  "Davis Online",
  "Online (Natural)",
  "Natural",
  "Neural",
  "Google US English",
  "Google UK English",
  "Samantha", // macOS — much better than Alex
];

let cachedVoice: SpeechSynthesisVoice | null = null;
let voicesLoadedListener: (() => void) | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  const synth = window.speechSynthesis;
  if (!synth) return null;
  const voices = synth.getVoices();
  if (voices.length === 0) return null;

  for (const needle of VOICE_PREFERENCES) {
    const match = voices.find((v) =>
      v.name.toLowerCase().includes(needle.toLowerCase()),
    );
    if (match) return match;
  }
  // Last resort: any en-US voice, otherwise the platform default.
  return (
    voices.find((v) => v.lang === "en-US" && v.localService === false) ??
    voices.find((v) => v.lang === "en-US") ??
    voices[0] ??
    null
  );
}

/**
 * Pre-loads the voice list. Call once on app mount so the first
 * utterance doesn't have to wait for `voiceschanged`.
 */
export function primeSpeechVoices(): void {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  cachedVoice = pickVoice();
  if (cachedVoice) return;
  if (voicesLoadedListener) return;
  voicesLoadedListener = () => {
    cachedVoice = pickVoice();
    if (cachedVoice && voicesLoadedListener) {
      synth.removeEventListener("voiceschanged", voicesLoadedListener);
      voicesLoadedListener = null;
    }
  };
  synth.addEventListener("voiceschanged", voicesLoadedListener);
}

/**
 * Plays a chunk of audio bytes (typically MP3 from a server-side TTS
 * synthesis call) on the desktop's speakers. Cancels any in-flight
 * Web Speech utterance AND any in-flight audio playback before
 * starting the new clip, so back-to-back assistant responses don't
 * pile up.
 *
 * Returns a promise that resolves once playback finishes or rejects
 * if the browser refuses to play (autoplay policy, decode error, etc).
 */
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;

function stopCurrentAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
}

export function playAudioBytes(
  bytes: ArrayBuffer | Uint8Array,
  mime: string,
): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // Stop both pipelines — covers the case where a Web Speech
  // utterance from a previous fallback is still playing.
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  stopCurrentAudio();

  const arrayBuffer =
    bytes instanceof Uint8Array
      ? (bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer)
      : bytes;
  const blob = new Blob([arrayBuffer], { type: mime || "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  currentAudioUrl = url;

  return new Promise((resolve, reject) => {
    audio.addEventListener(
      "ended",
      () => {
        if (currentAudio === audio) stopCurrentAudio();
        resolve();
      },
      { once: true },
    );
    audio.addEventListener(
      "error",
      () => {
        if (currentAudio === audio) stopCurrentAudio();
        reject(new Error("HTMLAudioElement failed to play TTS clip"));
      },
      { once: true },
    );
    audio.play().catch((err) => {
      if (currentAudio === audio) stopCurrentAudio();
      reject(err);
    });
  });
}

/**
 * Returns a promise that resolves when the utterance finishes (onend)
 * or is cancelled / errors. Never rejects — the caller usually just
 * wants to know "is the assistant done talking yet" so it can update
 * UI, and a synthesis hiccup shouldn't bubble up as an unhandled
 * promise rejection.
 */
export function speak(text: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const synth = window.speechSynthesis;
  if (!synth) return Promise.resolve();
  try {
    // Drop anything currently playing so back-to-back assistant
    // responses don't queue up; the user is asking now. Also cancel
    // any HTMLAudioElement playback from the server-TTS path so a
    // fresh fallback isn't drowned out by the previous clip.
    stopCurrentAudio();
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voice = cachedVoice ?? pickVoice();
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    }
    // Slight slowdown reads as more natural than the API default; a
    // touch more pitch warms up flatter voices. Tweak to taste.
    utter.rate = 0.95;
    utter.pitch = 1.05;
    utter.volume = 1;

    return new Promise<void>((resolve) => {
      // `onend` fires on natural completion, `onerror` on synth
      // failure, and crucially neither fires after `cancel()` on
      // some browsers — so we also resolve eagerly if the utterance
      // never gets a chance to start.
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      synth.speak(utter);
    });
  } catch (err) {
    console.warn("[speech] speak failed:", err);
    return Promise.resolve();
  }
}
