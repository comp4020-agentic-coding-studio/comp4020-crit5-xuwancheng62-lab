// The one AudioContext every sound in the game shares — every sound in
// sound-effects.ts is sampled through it. jsdom has no Web Audio API at all
// (see CLAUDE.md), so this is created lazily, never at module scope, and
// only from inside a real user-gesture handler (browser autoplay rules
// require the create+resume to happen synchronously in that handler, before
// any await).

let audioContext: AudioContext | null = null;

/** Call this from inside an actual pointerdown/keydown handler. */
export function primeAudio(): void {
  if (audioContext) return;
  audioContext = new AudioContext();
  void audioContext.resume();
}

/** Null until primeAudio() has run — every playback function in this game
 * checks this and silently no-ops otherwise, rather than throwing before
 * the player's first input. */
export function getAudioContext(): AudioContext | null {
  return audioContext;
}
