// Pure animation-state logic shared by the player and all three enemy kinds
// — no Canvas, no game rules, just "given a position history and the clock,
// which of the four provided frames (idle/walk_left/walk_pass/walk_right)
// should show, and which way is it facing". canvas-renderer.ts is the only
// caller; kept separate so this logic (and its failure modes — sliding feet,
// facing flipping on vertical-only movement) has its own focused tests.

import type { Vector2 } from "../game/types";
import type { CharacterSpriteSet } from "./sprite-assets";

export type WalkFrame = "idle" | "walkLeft" | "walkPass" | "walkRight";

/** 120ms — inside the requested 100-150ms band. This is a fixed wall-clock
 * duration per frame regardless of the character's own movement speed
 * (Rusher's 100 u/s vs. Tank's 38 u/s): the frame shown is a function of
 * elapsed simulation time alone, never of distance travelled, which is what
 * keeps a slow mover's feet from "sliding" between two frames instead of
 * stepping. */
export const WALK_FRAME_SECONDS = 0.12;

/** left-foot-forward -> feet-together -> right-foot-forward -> feet-together,
 * looping — the natural walk cycle requested: feet alternate every other
 * frame rather than every frame, so the character is never seen jumping
 * straight from one planted foot to the other. */
const WALK_CYCLE: readonly WalkFrame[] = ["walkLeft", "walkPass", "walkRight", "walkPass"];

/** Which of the 4 walk frames is current, driven by `elapsedSeconds` — the
 * pure step() reducer's own accumulated simulation clock, not
 * `performance.now()` or requestAnimationFrame's timestamp. That's what
 * makes the cycle's speed independent of the display's actual frame rate:
 * a tab rendering at 30fps and one at 240fps land on the same frame at the
 * same simulated instant. `frameSeconds` defaults to WALK_FRAME_SECONDS —
 * pass a larger value for a deliberately slower cadence (the Boss's hover,
 * per canvas-renderer.ts). */
export function walkCycleFrame(elapsedSeconds: number, frameSeconds: number = WALK_FRAME_SECONDS): WalkFrame {
  // The tiny epsilon guards against a real boundary case, not just a test
  // artifact: floating-point division can land a hair under an exact frame
  // boundary (e.g. 0.84 / 0.12 evaluating to 6.999999999999999), which
  // would floor to the previous frame and hold it one extra tick.
  const index = Math.floor(elapsedSeconds / frameSeconds + 1e-9) % WALK_CYCLE.length;
  return WALK_CYCLE[index];
}

export interface FacingState {
  readonly lastPos: Vector2;
  readonly facingRight: boolean;
}

/** Positional delta below this (world units) reads as "didn't actually
 * move" rather than as real motion — a guard against float noise, not
 * against slow movement: even Tank's 38 u/s crosses this by a wide margin
 * every single frame. */
const STILL_EPSILON = 1e-4;

export interface FacingUpdate {
  readonly moving: boolean;
  readonly facingRight: boolean;
  readonly next: FacingState;
}

/**
 * Compares this frame's position against the last one the caller handed
 * back (via `next`), so a single generic tracker works for the player and
 * for every enemy kind alike — nothing here reads game rules, only
 * position history. Facing comes from the horizontal delta; a purely
 * vertical move (dx ~ 0) leaves facing exactly as it was, and a character
 * that hasn't moved at all this frame (moving: false) always reports its
 * *previous* facing rather than resetting, so idle correctly mirrors
 * whichever way it last walked. `prev === undefined` is a character's very
 * first rendered frame — starts idle, facing left, matching the source art's
 * own canonical orientation.
 */
export function updateFacing(pos: Vector2, prev: FacingState | undefined): FacingUpdate {
  if (!prev) {
    return { moving: false, facingRight: false, next: { lastPos: pos, facingRight: false } };
  }
  const dx = pos.x - prev.lastPos.x;
  const dy = pos.y - prev.lastPos.y;
  const moving = Math.abs(dx) > STILL_EPSILON || Math.abs(dy) > STILL_EPSILON;
  const facingRight = Math.abs(dx) > STILL_EPSILON ? dx > 0 : prev.facingRight;
  return { moving, facingRight, next: { lastPos: pos, facingRight } };
}

/** idle when not moving, otherwise whichever of the 3 walk frames the clock
 * currently lands on. Mirroring for a right-facing character is the
 * caller's job (drawing, not frame selection) — see drawCharacterSprite in
 * canvas-renderer.ts. */
export function spriteForCharacter(
  sprites: CharacterSpriteSet,
  moving: boolean,
  elapsedSeconds: number,
  frameSeconds: number = WALK_FRAME_SECONDS,
): HTMLImageElement {
  if (!moving) return sprites.idle;
  return sprites[walkCycleFrame(elapsedSeconds, frameSeconds)];
}
