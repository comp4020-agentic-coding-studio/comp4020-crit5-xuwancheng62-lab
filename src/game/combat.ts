// Damage application. Two shapes cover every weapon: an instant circle
// (Blade, Fist, and a Rocket's splash) and an instant line (Beam) — both
// resolved the moment they fire, nothing persists. Traveling projectiles
// (Pistol/Scattergun/Rocket's direct hit) are plain circle-circle, handled
// the same way as any other point-in-time hit.

import { circlesOverlap, segmentIntersectsCircle } from "./collision";
import type { EnemyState } from "./entities/enemies";
import type { Vector2 } from "./types";

export interface DamageResult {
  readonly survivors: EnemyState[];
  readonly killed: EnemyState[];
}

function partition(
  enemies: readonly EnemyState[],
  hits: (enemy: EnemyState) => boolean,
  damage: number,
): DamageResult {
  const survivors: EnemyState[] = [];
  const killed: EnemyState[] = [];
  for (const enemy of enemies) {
    if (!hits(enemy)) {
      survivors.push(enemy);
      continue;
    }
    const hp = enemy.hp - damage;
    if (hp <= 0) killed.push(enemy);
    else survivors.push({ ...enemy, hp });
  }
  return { survivors, killed };
}

/** Blade, Fist, and a Rocket's splash: everyone within `radius` of `center`. */
export function applyAreaDamage(
  enemies: readonly EnemyState[],
  center: Vector2,
  radius: number,
  damage: number,
): DamageResult {
  return partition(enemies, (enemy) => circlesOverlap({ pos: center, radius }, { pos: enemy.pos, radius: enemy.radius }), damage);
}

/** Beam: everyone the line from `from` to `to` (at half-width `width/2`) touches. */
export function applyLineDamage(
  enemies: readonly EnemyState[],
  from: Vector2,
  to: Vector2,
  width: number,
  damage: number,
): DamageResult {
  return partition(
    enemies,
    (enemy) => segmentIntersectsCircle(from, to, { pos: enemy.pos, radius: enemy.radius + width / 2 }),
    damage,
  );
}

/** A single traveling projectile's direct hit. */
export function applyPointDamage(enemy: EnemyState, damage: number): EnemyState {
  return { ...enemy, hp: Math.max(0, enemy.hp - damage) };
}

export function isDead(enemy: EnemyState): boolean {
  return enemy.hp <= 0;
}
