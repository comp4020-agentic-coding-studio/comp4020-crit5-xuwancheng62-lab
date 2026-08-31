// The only file allowed to touch a Canvas 2D context, requestAnimationFrame,
// ResizeObserver, or the DOM directly. Everything it wires together —
// step(), the renderer, the HUD, the input sources — is either pure or takes
// its clock/DOM as an explicit dependency.

import { advanceCameraFollow, CAMERA_DEAD_ZONE_SCREEN_FRACTION, initialCameraFollowState } from "./game/camera-follow";
import type { Camera } from "./game/camera";
import { statsAtCharacterLevel } from "./game/leveling/player-stats";
import { createInitialGameState, type GameState } from "./game/state";
import { step } from "./game/step";
import { WEAPON_IDS } from "./game/weapons/weapon-types";
import { attachKeyboardMovement } from "./input/keyboard-source";
import { combineMovementSources } from "./input/movement-input";
import { attachPointerMovement } from "./input/pointer-source";
import { renderFrame } from "./render/canvas-renderer";
import { queryHud, updateHud } from "./render/hud";
import { primeAudio } from "./audio/audio-context";
import { playBackgroundMusic } from "./audio/music";
import {
  playBossRoar,
  playSoundEffect,
  playTankWindupRoar,
  playTurretFire,
  playWeaponFireSound,
  preloadSoundEffects,
} from "./audio/sound-effects";

// A backgrounded tab can hand rAF one huge elapsed gap on refocus; without a
// clamp that would spawn-storm or let a fast projectile tunnel straight
// through a target.
const MAX_DT_SECONDS = 1 / 20;

// Purely a rendering choice — every world-unit occupies this many CSS pixels
// instead of 1. Spawn cadence/positions are all in world-units and don't
// know this exists, so it changes nothing about difficulty.
const CAMERA_ZOOM = 2.1;

export function initGame(root: ParentNode = document): () => void {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-testid="game-canvas"]');
  if (!canvas) throw new Error("initGame: no [data-testid=game-canvas] found");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("initGame: 2D canvas context unavailable");

  const hud = queryHud(root);
  const restartButton = root.querySelector<HTMLButtonElement>('[data-testid="restart-button"]');

  let state: GameState = createInitialGameState((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  let cameraFollow = initialCameraFollowState(state.player.pos);

  let viewportCssWidth = 0;
  let viewportCssHeight = 0;

  function resize(): void {
    const rect = canvas!.getBoundingClientRect();
    viewportCssWidth = rect.width;
    viewportCssHeight = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas!.width = Math.max(1, Math.round(viewportCssWidth * dpr));
    canvas!.height = Math.max(1, Math.round(viewportCssHeight * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  const movement = combineMovementSources([
    attachKeyboardMovement(window),
    attachPointerMovement(canvas, {}),
  ]);

  // Audio needs a real user gesture to start (browser autoplay rules) —
  // the player's first key press or tap doubles as that gesture. Kicking
  // off preloadSoundEffects() right after priming means the decode delay
  // (network fetch + decodeAudioData) is long done by the time any of them
  // actually needs to play. playBackgroundMusic() starts the looping track
  // the same instant — it no-ops on every call after its first.
  function primeAllAudio(): void {
    primeAudio();
    preloadSoundEffects();
    playBackgroundMusic();
  }
  window.addEventListener("pointerdown", primeAllAudio, { once: true });
  window.addEventListener("keydown", primeAllAudio, { once: true });

  // Edge-triggered off state alone: a Tank's chargePhase turning "windup"
  // this frame (and not last frame) is exactly the moment to play the
  // warning — derived here by diffing, not carried in GameState itself,
  // since it's a transient render-layer concern, not game state.
  let previousChargePhaseById = new Map<string, string>();
  // Same idea for the Boss: roar once the instant it appears, and again
  // the instant its own phase turns "specialWarning" — both are edges in
  // otherwise-persistent state, not events GameState itself carries.
  let previousBossSpawned = false;
  let previousBossPhase = "idle";
  let previousBossAlive = false;
  // A weapon's own cooldown only ever counts down except at the exact
  // instant it fires and gets reset to a fresh full value — so an increase
  // frame-to-frame is precisely "this weapon just fired", with no need to
  // re-derive cooldownSecondsFor/attackSpeedMultiplier here at all.
  let previousWeaponCooldowns: Partial<Record<string, number>> = {};
  // Same idea, per placed Turret instance (its own attackCooldownRemaining,
  // not weaponCooldowns.turret — that one only tracks the "deploy the next
  // batch" timer, not an individual shot).
  let previousTurretCooldownById = new Map<string, number>();
  // A new id appearing in state.explosions is a rocket having just detonated.
  let previousExplosionIds = new Set<string>();
  // contactInvulnerableRemaining is 0 except right after a hit, when it
  // jumps up to the full invulnerability window — that jump is the edge.
  let previousContactInvulnerableRemaining = 0;

  function restart(): void {
    state = createInitialGameState((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    // A fresh run's camera should sit right on the new player, not ease in
    // from wherever the last run's camera happened to end up.
    cameraFollow = initialCameraFollowState(state.player.pos);
    previousBossSpawned = false;
    previousBossPhase = "idle";
    previousBossAlive = false;
    previousWeaponCooldowns = {};
    previousTurretCooldownById = new Map();
    previousExplosionIds = new Set();
    previousContactInvulnerableRemaining = 0;
  }
  restartButton?.addEventListener("click", restart);

  let lastTimestampMs: number | null = null;
  let animationFrameHandle = 0;

  function frame(timestampMs: number): void {
    if (lastTimestampMs === null) lastTimestampMs = timestampMs;
    const dt = Math.min(MAX_DT_SECONDS, (timestampMs - lastTimestampMs) / 1000);
    lastTimestampMs = timestampMs;

    const moveVector = movement.vector();
    state = step(state, { moveVector }, dt);

    const nextChargePhaseById = new Map<string, string>();
    for (const enemy of state.enemies) {
      const phase = enemy.chargePhase ?? "approaching";
      const previousPhase = previousChargePhaseById.get(enemy.id);
      nextChargePhaseById.set(enemy.id, phase);
      if (enemy.kind !== "tank") continue;
      // The Tank's entire charge-telegraph sound: one roar the instant it
      // enters windup, never again when that same charge later launches
      // into charging — a distinct, later phase this deliberately ignores.
      if (phase === "windup" && previousPhase !== "windup") {
        playTankWindupRoar();
      }
    }
    previousChargePhaseById = nextChargePhaseById;

    if (state.bossSpawned && !previousBossSpawned) playBossRoar();
    previousBossSpawned = state.bossSpawned;

    const boss = state.enemies.find((enemy) => enemy.kind === "boss");
    const bossPhase = boss?.bossPhase ?? "idle";
    if (bossPhase === "specialWarning" && previousBossPhase !== "specialWarning") playBossRoar();
    previousBossPhase = bossPhase;

    // Was alive last frame, isn't any more -> it died this tick (as opposed
    // to "hasn't spawned yet", which also has no boss in `enemies` but was
    // never alive to begin with).
    const bossAlive = boss !== undefined;
    if (previousBossAlive && !bossAlive) playSoundEffect("bossDeath");
    previousBossAlive = bossAlive;

    for (const weaponType of WEAPON_IDS) {
      const previousCooldown = previousWeaponCooldowns[weaponType] ?? 0;
      const currentCooldown = state.weaponCooldowns[weaponType] ?? 0;
      if (currentCooldown > previousCooldown + 1e-6) playWeaponFireSound(weaponType);
    }
    previousWeaponCooldowns = { ...state.weaponCooldowns };

    const currentTurretIds = new Set<string>();
    for (const turret of state.placedEntities) {
      currentTurretIds.add(turret.id);
      const previousCooldown = previousTurretCooldownById.get(turret.id) ?? 0;
      if (turret.attackCooldownRemaining > previousCooldown + 1e-6) playTurretFire();
      previousTurretCooldownById.set(turret.id, turret.attackCooldownRemaining);
    }
    for (const id of previousTurretCooldownById.keys()) {
      if (!currentTurretIds.has(id)) previousTurretCooldownById.delete(id);
    }

    for (const explosion of state.explosions) {
      if (!previousExplosionIds.has(explosion.id)) playSoundEffect("rocketExplosion");
    }
    previousExplosionIds = new Set(state.explosions.map((e) => e.id));

    if (state.player.contactInvulnerableRemaining > previousContactInvulnerableRemaining + 1e-6) {
      playSoundEffect("playerHit");
    }
    previousContactInvulnerableRemaining = state.player.contactInvulnerableRemaining;

    // Dead zone is a fraction of the screen, so it has to be converted to
    // world units (divide by zoom) before the world-space follow math can
    // use it — this module knows viewport/zoom, camera-follow.ts doesn't.
    const deadZoneHalfExtentWorld = {
      x: (CAMERA_DEAD_ZONE_SCREEN_FRACTION * viewportCssWidth) / 2 / CAMERA_ZOOM,
      y: (CAMERA_DEAD_ZONE_SCREEN_FRACTION * viewportCssHeight) / 2 / CAMERA_ZOOM,
    };
    cameraFollow = advanceCameraFollow(cameraFollow, state.player.pos, deadZoneHalfExtentWorld, dt);

    const camera: Camera = {
      centerWorld: cameraFollow.pos,
      viewportCssWidth,
      viewportCssHeight,
      zoom: CAMERA_ZOOM,
    };
    const isMoving = moveVector.x !== 0 || moveVector.y !== 0;
    renderFrame(ctx!, camera, state, isMoving);

    if (hud) updateHud(hud, state, statsAtCharacterLevel(state.xp.level).maxHealth);

    animationFrameHandle = requestAnimationFrame(frame);
  }
  animationFrameHandle = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(animationFrameHandle);
    resizeObserver.disconnect();
    movement.destroy();
    restartButton?.removeEventListener("click", restart);
  };
}
