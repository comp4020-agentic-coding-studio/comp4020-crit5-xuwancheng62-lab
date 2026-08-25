// Two kinds of thing on the ground: XP orbs (dropped by kills, always the
// same value) and weapon pickups (dropped by kills too, one of the 6 types,
// collected by simply walking over them — no separate input, per the whole
// game's one-mechanic design). No stat-upgrade pickups exist — leveling is
// automatic from XP, per the design.

import type { EntityId, Vector2 } from "../types";
import type { WeaponId } from "../weapons/weapon-types";

export type Pickup =
  | { readonly kind: "xp"; readonly id: EntityId; readonly pos: Vector2; readonly amount: number }
  | { readonly kind: "weapon"; readonly id: EntityId; readonly pos: Vector2; readonly weaponType: WeaponId };

export const PICKUP_COLLECT_RADIUS = 16;
export const XP_ORB_VALUE = 3;
/** Chance an enemy kill also drops a weapon, on top of its guaranteed XP
 * orb. Placeholder — tune once there's a build to actually play. */
export const WEAPON_DROP_CHANCE = 0.18;
