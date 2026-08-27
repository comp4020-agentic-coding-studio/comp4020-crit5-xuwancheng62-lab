// The map is a bounded circular clearing, not an infinite plane — this is
// the one source of truth for where its edge is, in both directions:
// step.ts clamps player/enemy positions to it, and canvas-renderer.ts draws
// the boundary (and the background art) at the same radius, so the visible
// wall and the actual movement limit can never drift apart.

import { clampLength } from "./vector";
import type { Vector2 } from "./types";

/** World origin (0,0) is the clearing's center — also the player's start
 * position (see state.ts). Was 560; shrunk to ~71% (400) of that so the map
 * doesn't dwarf the action — every other world-size-dependent number (map
 * art scale in canvas-renderer.ts, spawn ring radius and density in
 * spawn-tuning.ts) derives from this one constant rather than repeating the
 * ratio, so they can't drift out of sync with it. */
export const WORLD_RADIUS = 400;

/** Clamps `pos` to at most `WORLD_RADIUS - margin` from the origin, so an
 * entity's own circle (radius `margin`) never visually pokes through the
 * boundary — only its center is clamped, which is enough since the caller
 * already knows its own radius. */
export function clampToWorld(pos: Vector2, margin: number): Vector2 {
  return clampLength(pos, Math.max(0, WORLD_RADIUS - margin));
}
