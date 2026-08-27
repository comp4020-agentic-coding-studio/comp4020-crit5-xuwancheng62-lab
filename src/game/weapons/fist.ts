// Always active from second 0, independent of the 3-weapon-slot system —
// never picked up, never merges, never occupies a slot. Exists so "the
// opening screen invites the first move" holds without depending on the
// player reaching a pickup first. Deliberately weak: finding a real weapon
// should feel like a genuine step up, not noise.

import type { AreaEffect } from "./attached-weapons";
import { fistBaseStats } from "./weapon-stats";
import type { Vector2 } from "../types";

export function fireFist(playerPos: Vector2): AreaEffect {
  const stats = fistBaseStats();
  return { kind: "area", center: playerPos, radius: stats.range, damage: stats.damage, knockback: stats.knockback };
}
