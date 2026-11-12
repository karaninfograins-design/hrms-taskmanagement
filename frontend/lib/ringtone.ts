/**
 * Ringtone & Caller Tune Audio Utility
 * Uses the custom uploaded audio (/sounds/ringtone.mp3)
 * Plays loud and clear through headsets, headphones, or speakers.
 */

let ringtoneAudio: HTMLAudioElement | null = null;
let pendingPlayHandler: (() => void) | null = null;

function getAudioInstance(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!ringtoneAudio) {
    ringtoneAudio = new Audio("/sounds/ringtone.mp3");
    ringtoneAudio.preload = "auto";
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
        console.warn("Autoplay audio blocked by browser policy, waiting for interaction:", err);
        // Clean up previous handler if any
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
 * Play outgoing caller tune while dialer waits for recipient to answer
 */
export function playCallerTune(volume = 0.8) {
  playRingtone(volume);
}

/**
 * Stop any ringing or caller tune sound immediately
 */
export function stopRingtone() {
  if (typeof window === "undefined") return;

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

