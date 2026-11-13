/**
 * Ringtone & Caller Tune Audio Utility
 * - Plays loud and clear through headsets, headphones, or phone speakers.
 * - For Incoming calls: Plays /sounds/ringtone.mp3 with fallback synthesizer.
 * - For Outgoing calls: Synthesizes an authentic PBX telephone ringback tone
 *   (440Hz + 480Hz dual harmonic tone: 1.6s ring, 2.4s pause) via Web Audio API.
 */

let ringtoneAudio: HTMLAudioElement | null = null;
let pendingPlayHandler: (() => void) | null = null;

// Web Audio synthesizer for Outgoing Ringback Tone ("tuuut ... tuuut ...")
let ringbackAudioContext: AudioContext | null = null;
let ringbackIntervalId: NodeJS.Timeout | null = null;
let isRingbackActive = false;

function getAudioInstance(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!ringtoneAudio) {
    try {
      ringtoneAudio = new Audio("/sounds/ringtone.mp3");
      ringtoneAudio.preload = "auto";
    } catch {
      ringtoneAudio = null;
    }
  }
  return ringtoneAudio;
}

/**
 * Play incoming call ringtone (looping, loud for headsets/speakers)
 */
export function playRingtone(volume = 1.0) {
  if (typeof window === "undefined") return;
  const audio = getAudioInstance();
  if (!audio) return;

  try {
    audio.loop = true;
    audio.volume = Math.max(0.1, Math.min(1.0, volume));
    audio.currentTime = 0;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        if (err.name === "AbortError") return;
        console.warn("Autoplay audio blocked by browser policy, waiting for interaction:", err);
        if (pendingPlayHandler) {
          window.removeEventListener("pointerdown", pendingPlayHandler);
          window.removeEventListener("keydown", pendingPlayHandler);
        }
        pendingPlayHandler = () => {
          if (ringtoneAudio && ringtoneAudio.paused) {
            ringtoneAudio.play().catch(console.warn);
          }
          if (pendingPlayHandler) {
            window.removeEventListener("pointerdown", pendingPlayHandler);
            window.removeEventListener("keydown", pendingPlayHandler);
            pendingPlayHandler = null;
          }
        };
        window.addEventListener("pointerdown", pendingPlayHandler, { once: true });
        window.addEventListener("keydown", pendingPlayHandler, { once: true });
      });
    }
  } catch (error) {
    console.warn("Failed to play ringtone:", error);
  }
}

/**
 * Synthesizes a realistic telephone ringback tone pulse
 * (440Hz + 480Hz dual harmonic tone: 1.6 seconds sound, then silence)
 */
function playRingbackPulse(ctx: AudioContext, volume: number) {
  try {
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const duration = 1.6; // 1.6s ring duration

    // Master gain for the pulse
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(Math.min(0.35, volume * 0.35), now + 0.08);
    masterGain.gain.setValueAtTime(Math.min(0.35, volume * 0.35), now + duration - 0.08);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    masterGain.connect(ctx.destination);

    // Tone 1: 440 Hz (Standard North American / International ringback component)
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(440, now);
    osc1.connect(masterGain);

    // Tone 2: 480 Hz (Harmonic beat frequency)
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(480, now);
    osc2.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  } catch (err) {
    console.warn("Ringback pulse error:", err);
  }
}

/**
 * Play outgoing caller tune while dialer waits for recipient to answer
 * Generates an authentic telephone ringing sound ("ring... ring...")
 */
export function playCallerTune(volume = 0.8) {
  if (typeof window === "undefined") return;

  // Stop any existing tone first
  stopRingtone();

  isRingbackActive = true;

  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      if (!ringbackAudioContext || ringbackAudioContext.state === "closed") {
        ringbackAudioContext = new AudioCtx();
      }
      if (ringbackAudioContext.state === "suspended") {
        void ringbackAudioContext.resume();
      }

      // Play immediate first pulse
      playRingbackPulse(ringbackAudioContext, volume);

      // Repeat every 4 seconds (1.6s ring + 2.4s pause)
      ringbackIntervalId = setInterval(() => {
        if (!isRingbackActive || !ringbackAudioContext) {
          if (ringbackIntervalId) clearInterval(ringbackIntervalId);
          return;
        }
        playRingbackPulse(ringbackAudioContext, volume);
      }, 4000);
      return;
    }
  } catch (e) {
    console.warn("Web Audio caller tune fallback:", e);
  }

  // Fallback to audio file if Web Audio is unsupported
  playRingtone(volume);
}

/**
 * Stop any ringing or caller tune sound immediately
 */
export function stopRingtone() {
  if (typeof window === "undefined") return;

  isRingbackActive = false;

  if (ringbackIntervalId) {
    clearInterval(ringbackIntervalId);
    ringbackIntervalId = null;
  }

  if (ringbackAudioContext) {
    try {
      if (ringbackAudioContext.state !== "closed") {
        void ringbackAudioContext.close();
      }
    } catch {
      // Ignore
    }
    ringbackAudioContext = null;
  }

  if (pendingPlayHandler) {
    window.removeEventListener("pointerdown", pendingPlayHandler);
    window.removeEventListener("keydown", pendingPlayHandler);
    pendingPlayHandler = null;
  }

  if (ringtoneAudio) {
    try {
      ringtoneAudio.pause();
      ringtoneAudio.currentTime = 0;
    } catch (e) {
      console.warn("Error stopping ringtone:", e);
    }
  }
}
