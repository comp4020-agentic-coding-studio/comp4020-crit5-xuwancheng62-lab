// The looping background track (src/sounds/bgm.m4a — a game-ready copy of
// resources/bgm.m4a, same resources-vs-copy split as every other asset).
// Categorically different from sound-effects.ts's one-shots: started once,
// loops forever, and sits at a lower gain so it never competes with a
// weapon fire or the Boss's roar.

import bgmUrl from "../sounds/bgm.m4a";
import { getAudioContext } from "./audio-context";

// Behind every sound effect, never in front of one.
const MUSIC_GAIN = 0.28;
const FADE_IN_SECONDS = 2;

let bufferPromise: Promise<AudioBuffer> | null = null;

function loadBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  if (!bufferPromise) {
    bufferPromise = fetch(bgmUrl)
      .then((response) => response.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data));
  }
  return bufferPromise;
}

let started = false;

/** Starts the looping track, once — safe to call repeatedly (e.g. every
 * prime-audio gesture) since `started` makes every call after the first a
 * no-op, never layering a second copy on top. Fades in over a couple
 * seconds rather than starting at full volume mid-gesture. */
export function playBackgroundMusic(): void {
  const ctx = getAudioContext();
  if (!ctx || started) return;
  started = true;
  loadBuffer(ctx).then((buffer) => {
    const liveCtx = getAudioContext();
    if (!liveCtx) return;
    const source = liveCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = liveCtx.createGain();
    gain.gain.setValueAtTime(0.0001, liveCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(MUSIC_GAIN, liveCtx.currentTime + FADE_IN_SECONDS);
    source.connect(gain);
    gain.connect(liveCtx.destination);
    source.start();
  });
}
