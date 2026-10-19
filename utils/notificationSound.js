import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";

let cachedPlayer = null;
let webAudioCtx = null;

/**
 * Configures audio so the notification can play even when the device is in silent mode (iOS)
 * and on Android in background. Call once at app startup.
 */
export async function configureNotificationAudio() {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "duckOthers",
      interruptionModeAndroid: "duckOthers",
      shouldRouteThroughEarpiece: false,
    });
  } catch (e) {
    console.warn("configureNotificationAudio failed", e);
  }
}

/**
 * Plays the new-order alert sound. Loops it for `loopCount` times by replaying on finish.
 */
export async function playNewOrderSound(loopCount = 3) {
  try {
    if (Platform.OS === "web") {
      // On web, use Web Audio API to synthesize an annoying beep pattern
      // (file playback can be blocked by autoplay policy if not preceded by user gesture).
      playWebBeepPattern(loopCount);
      return;
    }
    if (!cachedPlayer) {
      cachedPlayer = createAudioPlayer(require("../assets/sounds/new_order.mp3"));
    }
    cachedPlayer.volume = 1.0;
    let plays = 0;
    const sub = cachedPlayer.addListener("playbackStatusUpdate", (st) => {
      if (st.didJustFinish) {
        plays += 1;
        if (plays < loopCount && cachedPlayer) {
          cachedPlayer.seekTo(0);
          cachedPlayer.play();
        } else {
          sub.remove();
        }
      }
    });
    cachedPlayer.seekTo(0);
    cachedPlayer.play();
  } catch (e) {
    console.warn("playNewOrderSound failed", e);
  }
}

export function stopNewOrderSound() {
  try {
    cachedPlayer?.pause();
  } catch {}
}

// --- WEB FALLBACK: synthesize an annoying triple-beep alarm ---
function playWebBeepPattern(cycles = 3) {
  try {
    const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return;
    if (!webAudioCtx) webAudioCtx = new Ctx();
    const ctx = webAudioCtx;
    const start = ctx.currentTime + 0.05;
    const beepDur = 0.18;
    const gap = 0.07;
    const groupGap = 0.5;
    for (let c = 0; c < cycles; c++) {
      for (let b = 0; b < 3; b++) {
        const t = start + c * (3 * (beepDur + gap) + groupGap) + b * (beepDur + gap);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = 1100;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + beepDur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + beepDur + 0.02);
      }
    }
  } catch (e) {
    console.warn("web beep failed", e);
  }
}
