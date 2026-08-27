import { describe, expect, it } from "vitest";
import {
  advanceCameraFollow,
  CAMERA_SMOOTH_TIME_SECONDS,
  initialCameraFollowState,
  type CameraFollowState,
} from "../src/game/camera-follow";
import { WORLD_RADIUS } from "../src/game/world-bounds";

const DT = 1 / 60;
const HALF_EXTENT = { x: 20, y: 15 }; // stand-in for "10% of screen" already converted to world units

function settle(state: CameraFollowState, playerPos: { x: number; y: number }, seconds: number): CameraFollowState {
  let s = state;
  for (let t = 0; t < seconds; t += DT) s = advanceCameraFollow(s, playerPos, HALF_EXTENT, DT);
  return s;
}

describe("advanceCameraFollow: dead zone — camera holds still while the player stays inside it", () => {
  it("does not move at all when the player is already at the camera's center", () => {
    const state = initialCameraFollowState({ x: 0, y: 0 });
    const after = advanceCameraFollow(state, { x: 0, y: 0 }, HALF_EXTENT, DT);
    expect(after.pos).toEqual({ x: 0, y: 0 });
    expect(after.vel).toEqual({ x: 0, y: 0 });
  });

  it("does not move while the player is within the dead zone but off-center", () => {
    const state = initialCameraFollowState({ x: 0, y: 0 });
    const after = advanceCameraFollow(state, { x: HALF_EXTENT.x * 0.5, y: -HALF_EXTENT.y * 0.5 }, HALF_EXTENT, DT);
    expect(after.pos.x).toBeCloseTo(0);
    expect(after.pos.y).toBeCloseTo(0);
  });

  it("stays put exactly at the dead zone's edge, not a hair before", () => {
    const state = initialCameraFollowState({ x: 0, y: 0 });
    const after = advanceCameraFollow(state, { x: HALF_EXTENT.x, y: 0 }, HALF_EXTENT, DT);
    expect(after.pos.x).toBeCloseTo(0);
  });
});

describe("advanceCameraFollow: follows once the player leaves the dead zone, without overshoot", () => {
  it("moves toward the player when they exceed the dead zone", () => {
    const state = initialCameraFollowState({ x: 0, y: 0 });
    const after = advanceCameraFollow(state, { x: 200, y: 0 }, HALF_EXTENT, DT);
    expect(after.pos.x).toBeGreaterThan(0);
  });

  it("never overshoots the settled dead-zone-edge target, at any point while catching up", () => {
    const playerPos = { x: 300, y: 0 };
    const settledTargetX = playerPos.x - HALF_EXTENT.x;
    let state = initialCameraFollowState({ x: 0, y: 0 });
    for (let t = 0; t < 2; t += DT) {
      state = advanceCameraFollow(state, playerPos, HALF_EXTENT, DT);
      expect(state.pos.x).toBeLessThanOrEqual(settledTargetX + 1e-6);
    }
  });

  it("settles close to the dead-zone-edge target well within a couple of smoothing windows", () => {
    const playerPos = { x: 150, y: -80 };
    const after = settle(initialCameraFollowState({ x: 0, y: 0 }), playerPos, CAMERA_SMOOTH_TIME_SECONDS * 6);
    expect(after.pos.x).toBeCloseTo(playerPos.x - HALF_EXTENT.x, 0);
    expect(after.pos.y).toBeCloseTo(playerPos.y + HALF_EXTENT.y, 0);
  });

  it("comes to rest (near-zero velocity) once settled, rather than oscillating forever", () => {
    const after = settle(initialCameraFollowState({ x: 0, y: 0 }), { x: 150, y: 0 }, CAMERA_SMOOTH_TIME_SECONDS * 8);
    expect(Math.abs(after.vel.x)).toBeLessThan(0.5);
  });
});

describe("advanceCameraFollow: clamped inside the world boundary", () => {
  it("never places the camera further than WORLD_RADIUS from the origin", () => {
    const farAway = { x: WORLD_RADIUS * 5, y: 0 };
    const after = settle(initialCameraFollowState({ x: 0, y: 0 }), farAway, CAMERA_SMOOTH_TIME_SECONDS * 10);
    expect(Math.hypot(after.pos.x, after.pos.y)).toBeLessThanOrEqual(WORLD_RADIUS + 1e-6);
  });
});
