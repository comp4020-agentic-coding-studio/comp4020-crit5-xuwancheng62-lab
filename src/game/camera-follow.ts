// A comfortable player-following camera: a dead zone around screen center so
// small movements don't drag the view, and critically-damped smoothing (no
// overshoot, no bounce) once the player leaves it. Pure math — app.ts owns
// the CameraFollowState across frames (it's a rendering/view concern, not
// gameplay simulation, so it doesn't belong in GameState/step.ts) and feeds
// its result straight into Camera.centerWorld.

import { clampToWorld } from "./world-bounds";
import type { Vector2 } from "./types";

export interface CameraFollowState {
  readonly pos: Vector2;
  readonly vel: Vector2;
}

/** Settle time for the critically-damped smoothing — matches "approximately
 * 0.2 seconds" from the brief. Lower = snappier, higher = laggier; this is
 * the one knob a designer would ever want to touch. */
export const CAMERA_SMOOTH_TIME_SECONDS = 0.2;

/** The dead zone spans this fraction of the viewport's width/height, evenly
 * split around center — e.g. 0.1 means the zone reaches 5% of the viewport
 * each way from the exact center. */
export const CAMERA_DEAD_ZONE_SCREEN_FRACTION = 0.1;

export function initialCameraFollowState(playerPos: Vector2): CameraFollowState {
  return { pos: playerPos, vel: { x: 0, y: 0 } };
}

/** Exact critically-damped spring integration (no overshoot for a fixed
 * target, by construction — this is what "critically damped" means) for a
 * single axis. Same shape as Unity's Mathf.SmoothDamp / the "Critically
 * Damped Ease-In/Ease-Out" technique from Game Programming Gems 4. */
function smoothDampAxis(
  current: number,
  target: number,
  velocity: number,
  smoothTimeSeconds: number,
  dtSeconds: number,
): { value: number; velocity: number } {
  const omega = 2 / Math.max(smoothTimeSeconds, 1e-4);
  const x = omega * dtSeconds;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x); // fast, standard exp(-x) approximation
  const delta = current - target;
  const temp = (velocity + omega * delta) * dtSeconds;
  const nextVelocity = (velocity - omega * temp) * exp;
  const nextValue = target + (delta + temp) * exp;
  return { value: nextValue, velocity: nextVelocity };
}

/** Where the spring should actually pull toward: the player's own position
 * if it's already inside the dead zone (i.e. no pull — zero-length case
 * below), otherwise pulled back so the player sits exactly on the dead
 * zone's edge rather than snapping all the way to screen center. Dead zone
 * is centered on the CURRENT camera position (where screen-center actually
 * is right now), not the smoothed target — it's a "how far can the subject
 * wander on screen" zone. */
function deadZoneTarget(cameraPos: Vector2, playerPos: Vector2, halfExtent: Vector2): Vector2 {
  const dx = playerPos.x - cameraPos.x;
  const dy = playerPos.y - cameraPos.y;
  const excessX = Math.max(0, Math.abs(dx) - halfExtent.x) * Math.sign(dx);
  const excessY = Math.max(0, Math.abs(dy) - halfExtent.y) * Math.sign(dy);
  return { x: cameraPos.x + excessX, y: cameraPos.y + excessY };
}

/** Advances the camera one frame: dead zone -> critically-damped smoothing
 * -> clamp inside the world boundary. `deadZoneHalfExtentWorld` is the dead
 * zone's half-width/half-height already converted to world units (i.e.
 * screen fraction / camera.zoom) — this module has no notion of zoom itself. */
export function advanceCameraFollow(
  state: CameraFollowState,
  playerPos: Vector2,
  deadZoneHalfExtentWorld: Vector2,
  dtSeconds: number,
): CameraFollowState {
  const target = deadZoneTarget(state.pos, playerPos, deadZoneHalfExtentWorld);
  const x = smoothDampAxis(state.pos.x, target.x, state.vel.x, CAMERA_SMOOTH_TIME_SECONDS, dtSeconds);
  const y = smoothDampAxis(state.pos.y, target.y, state.vel.y, CAMERA_SMOOTH_TIME_SECONDS, dtSeconds);
  const clamped = clampToWorld({ x: x.value, y: y.value }, 0);
  return { pos: clamped, vel: { x: x.velocity, y: y.velocity } };
}
