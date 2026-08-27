// The only file allowed to touch a Canvas 2D context, requestAnimationFrame,
// ResizeObserver, or the DOM directly. Everything it wires together —
// step(), the renderer, the HUD, the input sources — is either pure or takes
// its clock/DOM as an explicit dependency.

import { advanceCameraFollow, CAMERA_DEAD_ZONE_SCREEN_FRACTION, initialCameraFollowState } from "./game/camera-follow";
import type { Camera } from "./game/camera";
import { statsAtCharacterLevel } from "./game/leveling/player-stats";
import { createInitialGameState, type GameState } from "./game/state";
import { step } from "./game/step";
import { attachKeyboardMovement } from "./input/keyboard-source";
import { combineMovementSources } from "./input/movement-input";
import { attachPointerMovement } from "./input/pointer-source";
import { renderFrame } from "./render/canvas-renderer";
import { queryHud, updateHud } from "./render/hud";
import { playBossRoar, playTankChargeWarning, primeTankWarningAudio } from "./audio/tank-warning";

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
  // the player's first key press or tap doubles as that gesture.
  window.addEventListener("pointerdown", primeTankWarningAudio, { once: true });
  window.addEventListener("keydown", primeTankWarningAudio, { once: true });

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

  function restart(): void {
    state = createInitialGameState((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    // A fresh run's camera should sit right on the new player, not ease in
    // from wherever the last run's camera happened to end up.
    cameraFollow = initialCameraFollowState(state.player.pos);
    previousBossSpawned = false;
    previousBossPhase = "idle";
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
      nextChargePhaseById.set(enemy.id, phase);
      if (enemy.kind === "tank" && phase === "windup" && previousChargePhaseById.get(enemy.id) !== "windup") {
        playTankChargeWarning();
      }
    }
    previousChargePhaseById = nextChargePhaseById;

    if (state.bossSpawned && !previousBossSpawned) playBossRoar();
    previousBossSpawned = state.bossSpawned;

    const boss = state.enemies.find((enemy) => enemy.kind === "boss");
    const bossPhase = boss?.bossPhase ?? "idle";
    if (bossPhase === "specialWarning" && previousBossPhase !== "specialWarning") playBossRoar();
    previousBossPhase = bossPhase;

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
