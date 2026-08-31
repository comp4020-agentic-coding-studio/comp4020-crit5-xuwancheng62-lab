// Real sampled sound effects (src/sounds/ — trimmed/cleaned copies of the
// full-resolution originals in resources/sounds/processed/, same
// resources-vs-game-ready-copy split as src/sprites/), decoded once into
// AudioBuffers and played through the shared AudioContext (audio-context.ts)
// with a fresh BufferSourceNode per trigger. Everything here is a one-shot,
// fire-and-forget effect keyed off an edge app.ts already detects (a weapon
// cooldown just reset, a new explosion appeared, the player just got hit,
// the Boss just appeared/died) — nothing here reads or affects GameState.

import beamFireUrl from "../sounds/beam_fire.wav";
import bossDeathUrl from "../sounds/boss_death.wav";
import bossRoar1Url from "../sounds/boss_roar_01.wav";
import bossRoar2Url from "../sounds/boss_roar_02.wav";
import bossRoar3Url from "../sounds/boss_roar_03.wav";
import bossRoar4Url from "../sounds/boss_roar_04.wav";
import bossRoar5Url from "../sounds/boss_roar_05.wav";
import bossRoar6Url from "../sounds/boss_roar_06.wav";
import nukeExplosionUrl from "../sounds/nuke_explosion.wav";
import nukeLaunchUrl from "../sounds/nuke_launch.wav";
import playerHitUrl from "../sounds/player_hit.wav";
import rocketExplosionUrl from "../sounds/rocket_explosion.wav";
import rocketLaunchUrl from "../sounds/rocket_launch.wav";
import scattergunFireUrl from "../sounds/scattergun_fire.wav";
import smgFireUrl from "../sounds/smg_fire.wav";
import turretFireUrl from "../sounds/turret_fire.wav";
import { getAudioContext } from "./audio-context";
import type { WeaponId } from "../game/weapons/weapon-types";

export type SoundEffectName =
  | "smgFire"
  | "scattergunFire"
  | "turretFire"
  | "beamFire"
  | "rocketLaunch"
  | "rocketExplosion"
  | "nukeLaunch"
  | "nukeExplosion"
  | "playerHit"
  | "bossDeath";

const SOUND_URLS: Record<SoundEffectName, string> = {
  smgFire: smgFireUrl,
  scattergunFire: scattergunFireUrl,
  turretFire: turretFireUrl,
  beamFire: beamFireUrl,
  rocketLaunch: rocketLaunchUrl,
  rocketExplosion: rocketExplosionUrl,
  nukeLaunch: nukeLaunchUrl,
  nukeExplosion: nukeExplosionUrl,
  playerHit: playerHitUrl,
  bossDeath: bossDeathUrl,
};

/** The default per-shot fire sound for each attached/placed weapon that has
 * one — Blade has no matching sample in the provided library, so it stays
 * silent rather than getting a mismatched stand-in. Turret's own per-shot
 * fire is triggered separately (see playTurretFire, called per placed
 * turret instance) since weaponCooldowns.turret tracks the "deploy the next
 * batch of turrets" timer, not an individual shot. */
const WEAPON_FIRE_SOUND: Partial<Record<WeaponId, SoundEffectName>> = {
  smg: "smgFire",
  scattergun: "scattergunFire",
  beam: "beamFire",
  rocket: "rocketLaunch",
  nuke: "nukeLaunch",
};

const BOSS_ROAR_URLS = [bossRoar1Url, bossRoar2Url, bossRoar3Url, bossRoar4Url, bossRoar5Url, bossRoar6Url];

// Decoded lazily (and cached) rather than up front at module scope, since
// decodeAudioData needs a real AudioContext — see primeSoundEffects for
// where loading actually kicks off, right after the context is primed.
const bufferCache = new Map<string, Promise<AudioBuffer>>();

function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  const promise = fetch(url)
    .then((response) => response.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data));
  bufferCache.set(url, promise);
  return promise;
}

/** Kicks off decoding every known sound effect so the first time one is
 * actually needed (the player's first shot, say) it plays without a
 * network/decode delay. Call once, right after the AudioContext is primed —
 * safe to call again (loadBuffer's cache makes it a no-op). */
export function preloadSoundEffects(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  for (const url of Object.values(SOUND_URLS)) loadBuffer(ctx, url);
  for (const url of BOSS_ROAR_URLS) loadBuffer(ctx, url);
}

/** Modest headroom so several one-shot effects overlapping (rapid SMG
 * fire, a turret volley, a hit landing) don't sum into clipping — Web Audio
 * has no limiter on ctx.destination by default. */
const DEFAULT_GAIN = 0.6;

// Roars need to sit clearly above the music and weapon bed. A dedicated
// chain gives them weight without making every other effect louder: the
// low shelf adds body, while the compressor reins in the boosted transient
// so the extra gain does not turn into brittle clipping.
const BOSS_ROAR_GAIN = 1.15;
const BOSS_ROAR_LOW_SHELF_HZ = 180;
const BOSS_ROAR_LOW_SHELF_DB = 6;

function playBuffer(url: string, gain: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  loadBuffer(ctx, url).then((buffer) => {
    // The context may have been torn down/replaced by the time this
    // resolves in principle; in practice it never is, but re-reading it
    // rather than closing over the outer `ctx` costs nothing and avoids
    // ever connecting a node to a stale context.
    const liveCtx = getAudioContext();
    if (!liveCtx) return;
    const source = liveCtx.createBufferSource();
    source.buffer = buffer;
    const gainNode = liveCtx.createGain();
    gainNode.gain.value = gain;
    source.connect(gainNode);
    gainNode.connect(liveCtx.destination);
    source.start();
  });
}

// Shared by the Boss's own roar (playBossRoar) and the Tank's windup roar
// (playTankWindupRoar) — the same low-shelf + compressor chain gives both
// the same punchy presence, played through whichever of the six samples
// gets picked.
function playMonsterRoarBuffer(url: string): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  loadBuffer(ctx, url).then((buffer) => {
    const liveCtx = getAudioContext();
    if (!liveCtx) return;

    const source = liveCtx.createBufferSource();
    source.buffer = buffer;

    const lowShelf = liveCtx.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = BOSS_ROAR_LOW_SHELF_HZ;
    lowShelf.gain.value = BOSS_ROAR_LOW_SHELF_DB;

    const compressor = liveCtx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 10;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;

    const gainNode = liveCtx.createGain();
    gainNode.gain.value = BOSS_ROAR_GAIN;

    source.connect(lowShelf);
    lowShelf.connect(compressor);
    compressor.connect(gainNode);
    gainNode.connect(liveCtx.destination);
    source.start();
  });
}

export function playSoundEffect(name: SoundEffectName, gain: number = DEFAULT_GAIN): void {
  playBuffer(SOUND_URLS[name], gain);
}

/** The fire sound for a loadout slot that just fired, if it has one (see
 * WEAPON_FIRE_SOUND) — silently does nothing for Blade/Turret. */
export function playWeaponFireSound(weapon: WeaponId): void {
  const sound = WEAPON_FIRE_SOUND[weapon];
  if (sound) playSoundEffect(sound);
}

/** A single placed Turret instance actually firing a volley — distinct from
 * playWeaponFireSound("turret"), which is never called (see its own doc
 * comment). */
export function playTurretFire(): void {
  playSoundEffect("turretFire");
}

/** The soonest another roar may start after one begins — silently no-ops if
 * called again before this elapses, which is what keeps two roars (e.g. the
 * Boss appearing right as a fast-triggered special warning starts) from
 * stacking into a distorted mess. */
const BOSS_ROAR_MIN_INTERVAL_SECONDS = 1.2;
let lastBossRoarAt = -Infinity;

/** One of the six provided monster-roar samples, picked at random each time
 * for variety. Played once when the Boss first appears and again before
 * every 24-projectile special attack (see app.ts for both trigger points). */
export function playBossRoar(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.currentTime - lastBossRoarAt < BOSS_ROAR_MIN_INTERVAL_SECONDS) return;
  lastBossRoarAt = ctx.currentTime;
  const url = BOSS_ROAR_URLS[Math.floor(Math.random() * BOSS_ROAR_URLS.length)];
  playMonsterRoarBuffer(url);
}

/** The soonest another Tank wind-up roar may start — separate from the
 * Boss's own BOSS_ROAR_MIN_INTERVAL_SECONDS/lastBossRoarAt (a Tank roaring
 * shouldn't silence, or be silenced by, the Boss's own roar), so several
 * Tanks entering wind-up within the same moment layer into one roar instead
 * of an overlapping mess. */
const TANK_ROAR_MIN_INTERVAL_SECONDS = 1.0;
let lastTankRoarAt = -Infinity;

/** One of the six provided monster-roar samples, picked at random each
 * time — the Tank's entire charge-telegraph sound (replaces the old
 * synthesized "beep-beep" warning). Played once at the exact instant a
 * Tank enters `windup` (see app.ts for the transition this is
 * edge-triggered off); never again when that same charge later launches
 * into `charging` — only the one phase change fires it. */
export function playTankWindupRoar(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.currentTime - lastTankRoarAt < TANK_ROAR_MIN_INTERVAL_SECONDS) return;
  lastTankRoarAt = ctx.currentTime;
  const url = BOSS_ROAR_URLS[Math.floor(Math.random() * BOSS_ROAR_URLS.length)];
  playMonsterRoarBuffer(url);
}
