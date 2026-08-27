// Pure geometry for where each equipped, held weapon visually sits around
// the player and where its muzzle point is — shared by step.ts (real
// projectile spawn positions) and canvas-renderer.ts (the orbiting weapon
// icons), so gameplay and visuals can never drift out of sync with each
// other. Turret is excluded from the orbit: it deploys away from the player
// as its own standalone entity (see entities/placed-entities.ts) rather than
// being held.

import type { Vector2 } from "../types";
import { add, scale } from "../vector";
import type { WeaponSlot } from "./weapon-types";

/** World units from the player's center to each orbiting weapon icon. */
export const WEAPON_ORBIT_RADIUS = 24;

/** World units an orbiting weapon's muzzle sits beyond its own orbit
 * position, along its current aim direction — the barrel reaching a bit
 * further out than the icon's grip/pivot. */
export const WEAPON_MUZZLE_FORWARD_DISTANCE = 12;

export interface OrbitIndices {
  /** Parallel to the input slots array. -1 for a turret slot (it doesn't orbit). */
  readonly indices: readonly number[];
  /** Count of orbiting (non-turret) slots. */
  readonly total: number;
}

/** Assigns each non-turret slot a stable index (in loadout order) among only
 * the other non-turret slots — turret slots get -1 and don't count towards
 * `total`. Computed once per frame and reused for every slot so a weapon's
 * orbit position never depends on firing timing, only on what's equipped. */
export function orbitIndices(slots: readonly WeaponSlot[]): OrbitIndices {
  let cursor = 0;
  const indices = slots.map((slot) => (slot.type === "turret" ? -1 : cursor++));
  return { indices, total: cursor };
}

/** Evenly spaces `total` weapons in a ring around the player, starting from
 * straight up so a single weapon sits at the top rather than an arbitrary
 * side. `index < 0` (turret) or `total <= 0` (nothing equipped) both fall
 * back to the player's own position rather than dividing by zero. */
export function weaponOrbitPosition(playerPos: Vector2, index: number, total: number): Vector2 {
  if (total <= 0 || index < 0) return playerPos;
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return {
    x: playerPos.x + Math.cos(angle) * WEAPON_ORBIT_RADIUS,
    y: playerPos.y + Math.sin(angle) * WEAPON_ORBIT_RADIUS,
  };
}

export function weaponMuzzlePosition(orbitPos: Vector2, aimDirection: Vector2): Vector2 {
  return add(orbitPos, scale(aimDirection, WEAPON_MUZZLE_FORWARD_DISTANCE));
}
