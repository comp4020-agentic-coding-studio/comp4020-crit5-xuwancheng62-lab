// Deliberately minimal: only what genuinely needs to persist frame-to-frame.
// maxHealth/moveSpeed/etc. are DERIVED from the character's level each time
// they're needed (leveling/player-stats.ts) rather than duplicated here —
// storing them redundantly is exactly how a level-up updating one but not
// the other becomes a real bug.

import type { Vector2 } from "../types";
import { add, scale } from "../vector";

export interface PlayerState {
  readonly pos: Vector2;
  readonly hp: number;
  /** Brief window after taking contact damage where it can't happen again —
   * without this, standing inside an enemy's hitbox for multiple frames
   * would deal damage every single frame at 60fps. */
  readonly contactInvulnerableRemaining: number;
}

export function movePlayer(player: PlayerState, moveVector: Vector2, moveSpeed: number, dt: number): PlayerState {
  if (moveVector.x === 0 && moveVector.y === 0) return player;
  return { ...player, pos: add(player.pos, scale(moveVector, moveSpeed * dt)) };
}

export function regenerate(player: PlayerState, maxHealth: number, hpRegenPerSecond: number, dt: number): PlayerState {
  if (player.hp >= maxHealth) return player;
  return { ...player, hp: Math.min(maxHealth, player.hp + hpRegenPerSecond * dt) };
}

export function damagePlayer(player: PlayerState, amount: number): PlayerState {
  return { ...player, hp: Math.max(0, player.hp - amount) };
}

export function healPlayer(player: PlayerState, amount: number, maxHealth: number): PlayerState {
  return { ...player, hp: Math.min(maxHealth, player.hp + amount) };
}
