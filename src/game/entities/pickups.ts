// Weapon pickups on the ground, dropped by kills, one of the 6 types,
// collected by simply walking over them — no separate input, per the whole
// game's one-mechanic design. No stat-upgrade pickups exist — leveling is
// automatic from XP.
//
// XP itself is NOT a ground pickup: a kill grants it immediately (see
// step.ts's lootFor), rather than dropping an orb the player has to also
// path over. Walking over a *weapon* is still meaningful — which one you
// happen to be near is the whole "first 4 distinct types lock the build"
// tension — but XP has no such decision attached to it, so making the
// player detour for it added friction without adding depth.

import type { EntityId, Vector2 } from "../types";
import type { WeaponId } from "../weapons/weapon-types";

export interface WeaponPickup {
  readonly kind: "weapon";
  readonly id: EntityId;
  readonly pos: Vector2;
  readonly weaponType: WeaponId;
}

export interface HealthPickup {
  readonly kind: "health";
  readonly id: EntityId;
  readonly pos: Vector2;
}

export type Pickup = WeaponPickup | HealthPickup;

/** Generous enough to collect a drop without pixel-perfect overlap. */
export const PICKUP_COLLECT_RADIUS = 42;
export const XP_ORB_VALUE = 3;
/** Chance an enemy kill also drops a weapon, on top of its guaranteed XP. */
export const WEAPON_DROP_CHANCE = 0.18;
/** Independent chance for a small healing drop. */
export const HEALTH_DROP_CHANCE = 0.0125;
export const HEALTH_RESTORE_FRACTION = 0.2;
