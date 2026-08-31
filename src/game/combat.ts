// Damage application. Two shapes cover every weapon: an instant circle
// (Blade and explosive splash) and an instant line (Beam) — both
// resolved the moment they fire, nothing persists. Traveling projectiles
// (SMG/Scattergun/Rocket/Nuke direct hits) are plain circle-circle, handled
// the same way as any other point-in-time hit.

import { circlesOverlap, segmentIntersectsCircle } from "./collision";
import { BOSS_KNOCKBACK_RESISTANCE, hasSuperArmor, type EnemyState } from "./entities/enemies";
import type { Vector2 } from "./types";
import { normalize } from "./vector";

/** How much of a would-be knockback actually applies to this enemy: 0 for a
 * charging Tank and the Boss (both fully immune), 1 for everyone else. */
function knockbackMultiplierFor(enemy: EnemyState): number {
  if (hasSuperArmor(enemy)) return 0;
  if (enemy.kind === "boss") return BOSS_KNOCKBACK_RESISTANCE;
  return 1;
}

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

/** Blade and explosive splash: everyone within `radius` of `center`.
 * `knockbackDistance`, when supplied, shoves a
 * surviving hit directly away from `center`; a kill is never also shoved. */
export function applyAreaDamage(
  enemies: readonly EnemyState[],
  center: Vector2,
  radius: number,
  damage: number,
  knockbackDistance = 0,
): DamageResult {
  const survivors: EnemyState[] = [];
  const killed: EnemyState[] = [];
  for (const enemy of enemies) {
    if (!circlesOverlap({ pos: center, radius }, { pos: enemy.pos, radius: enemy.radius })) {
      survivors.push(enemy);
      continue;
    }
    const hp = enemy.hp - damage;
    if (hp <= 0) {
      killed.push(enemy);
      continue;
    }
    const effectiveKnockback = knockbackDistance * knockbackMultiplierFor(enemy);
    survivors.push({
      ...enemy,
      hp,
      pos: effectiveKnockback > 0 ? pushAway(center, enemy.pos, effectiveKnockback) : enemy.pos,
    });
  }
  return { survivors, killed };
}

/** `pos` shoved further along the ray from `from` through `pos`. Falls back
 * to an arbitrary direction on an exact-overlap (zero-length ray) rather
 * than producing a NaN. */
function pushAway(from: Vector2, pos: Vector2, distance: number): Vector2 {
  const dx = pos.x - from.x;
  const dy = pos.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: pos.x + distance, y: pos.y };
  return { x: pos.x + (dx / len) * distance, y: pos.y + (dy / len) * distance };
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

/** A single traveling projectile's direct hit. `knockback`, when given,
 * shoves a surviving hit further along the projectile's own travel
 * direction — physically closer to "it got hit by a moving object" than
 * "it got pushed away from wherever the player happens to be standing now". */
export function applyPointDamage(
  enemy: EnemyState,
  damage: number,
  knockback?: { direction: Vector2; distance: number },
): EnemyState {
  const hp = Math.max(0, enemy.hp - damage);
  if (hp <= 0 || !knockback) return { ...enemy, hp };
  const multiplier = knockbackMultiplierFor(enemy);
  if (multiplier <= 0) return { ...enemy, hp };
  const dir = normalize(knockback.direction);
  const distance = knockback.distance * multiplier;
  return { ...enemy, hp, pos: { x: enemy.pos.x + dir.x * distance, y: enemy.pos.y + dir.y * distance } };
}

export function isDead(enemy: EnemyState): boolean {
  return enemy.hp <= 0;
}
