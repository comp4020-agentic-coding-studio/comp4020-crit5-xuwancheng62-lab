// The Tank's charge telegraph and the Boss's roar both need sounds distinct
// enough to notice over everything else on screen — there's very little
// other audio in the game, so they mostly only have to compete with
// silence. jsdom has no Web Audio API at all (see CLAUDE.md), so the
// AudioContext is created lazily, never at module scope, and only from
// inside a real user-gesture handler (browser autoplay rules require the
// create+resume to happen synchronously in that handler, before any await —
// see primeTankWarningAudio). Every sound in this file shares that one
// context and its priming.

let audioContext: AudioContext | null = null;

/** Call this from inside an actual pointerdown/keydown handler. */
export function primeTankWarningAudio(): void {
  if (audioContext) return;
  audioContext = new AudioContext();
  void audioContext.resume();
}

/** Two short, sharp beeps. Deliberately unlike anything else in the game
 * (which has no other sound), so it reads unambiguously as "incoming". */
export function playTankChargeWarning(): void {
  if (!audioContext) return;
  const ctx = audioContext;

  function beepAt(startOffsetSeconds: number): void {
    const now = ctx.currentTime + startOffsetSeconds;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.02, now + 0.12);
    gain.gain.linearRampToValueAtTime(0, now + 0.14); // never ramp exponentially TO zero
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  beepAt(0);
  beepAt(0.18);
}

/** The soonest another roar may start after one begins — playBossRoar
 * silently no-ops if called again before this elapses, which is what keeps
 * two roars (e.g. the Boss appearing right as a fast-triggered special
 * warning starts) from stacking into a distorted mess. */
const BOSS_ROAR_MIN_INTERVAL_SECONDS = 1.2;
let lastBossRoarAt = -Infinity;

/** A short, low, intimidating growl — deliberately low-pitched and noisy,
 * unlike the Tank's high square-wave beeps, so the two read as distinct
 * threats. Played once when the Boss first appears and again before every
 * 24-projectile special attack (see app.ts for both trigger points). */
export function playBossRoar(): void {
  if (!audioContext) return;
  const ctx = audioContext;
  if (ctx.currentTime - lastBossRoarAt < BOSS_ROAR_MIN_INTERVAL_SECONDS) return;
  lastBossRoarAt = ctx.currentTime;

  const now = ctx.currentTime;
  const duration = 0.55;

  // The growl: a low sawtooth sweeping downward in pitch.
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + duration);
  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.exponentialRampToValueAtTime(0.5, now + 0.06);
  oscGain.gain.exponentialRampToValueAtTime(0.02, now + duration * 0.85);
  oscGain.gain.linearRampToValueAtTime(0, now + duration); // never ramp exponentially TO zero
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);

  // A layer of noise underneath, for texture ("roar" rather than a clean tone).
  const noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const channel = noiseBuffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.setValueAtTime(500, now);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.18, now + 0.08);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.9);
  noiseGain.gain.linearRampToValueAtTime(0, now + duration);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + duration);
}
