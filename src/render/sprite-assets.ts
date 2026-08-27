// Every raster image the renderer draws, loaded once and cached here. Source
// art lives in resources/ (full-resolution, as provided); src/sprites/ holds
// game-ready resized copies actually imported below — the multi-megabyte
// originals have no business in a five-minute browser game's payload.
//
// Images load asynchronously; canvas-renderer.ts must check `ready(img)`
// before drawing one and fall back to a vector shape otherwise, since the
// very first frame(s) can render before the network/cache has resolved them.
//
// Loaded once at module scope (this file only ever runs once per page load)
// and reused by every draw call — nothing here re-fetches or re-decodes an
// image per frame.

import beamUrl from "../sprites/beam.png";
import bossIdleUrl from "../sprites/boss_left_idle.png";
import bossMoveLeftUrl from "../sprites/boss_left_move_left.png";
import bossMovePassUrl from "../sprites/boss_left_move_pass.png";
import bossMoveRightUrl from "../sprites/boss_left_move_right.png";
import bulletProjectileUrl from "../sprites/bullet_projectile.png";
import cannonballProjectileUrl from "../sprites/cannonball_projectile.png";
import crateUrl from "../sprites/crate.png";
import explosionUrl from "../sprites/explosion.png";
import healthUrl from "../sprites/health.png";
import katanaUrl from "../sprites/katana.png";
import launcherUrl from "../sprites/launcher.png";
import mapUrl from "../sprites/map.png";
import playerHitUrl from "../sprites/player_hit.png";
import playerIdleUrl from "../sprites/player_left_idle.png";
import playerWalkLeftUrl from "../sprites/player_left_walk_left.png";
import playerWalkPassUrl from "../sprites/player_left_walk_pass.png";
import playerWalkRightUrl from "../sprites/player_left_walk_right.png";
import projectileUrl from "../sprites/projectile.png";
import rocketProjectileUrl from "../sprites/rocket_projectile.png";
import rusherIdleUrl from "../sprites/rusher_left_idle.png";
import rusherWalkLeftUrl from "../sprites/rusher_left_walk_left.png";
import rusherWalkPassUrl from "../sprites/rusher_left_walk_pass.png";
import rusherWalkRightUrl from "../sprites/rusher_left_walk_right.png";
import scattergunUrl from "../sprites/scattergun.png";
import shooterIdleUrl from "../sprites/shooter_left_idle.png";
import shooterWalkLeftUrl from "../sprites/shooter_left_walk_left.png";
import shooterWalkPassUrl from "../sprites/shooter_left_walk_pass.png";
import shooterWalkRightUrl from "../sprites/shooter_left_walk_right.png";
import smgUrl from "../sprites/smg.png";
import tankIdleUrl from "../sprites/tank_left_idle.png";
import tankWalkLeftUrl from "../sprites/tank_left_walk_left.png";
import tankWalkPassUrl from "../sprites/tank_left_walk_pass.png";
import tankWalkRightUrl from "../sprites/tank_left_walk_right.png";
import turretBaseUrl from "../sprites/turret_base.png";
import turretHeadUrl from "../sprites/turret_head.png";
import xpOrbUrl from "../sprites/xp_orb.png";

function loadImage(url: string): HTMLImageElement {
  // spec/*.test.ts run this module under plain Node (no DOM at all — see
  // CLAUDE.md's identical lesson about AudioContext), so `Image` must be
  // feature-detected rather than constructed unconditionally at module
  // scope. The stand-in reports "not ready", which is exactly what makes
  // every draw*() function take its vector fallback path in tests.
  if (typeof Image === "undefined") {
    return { complete: false, naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement;
  }
  const img = new Image();
  img.src = url;
  return img;
}

/** The four poses every animated character (player + all 3 enemy kinds)
 * needs — see character-animation.ts for how these get selected and
 * mirrored frame-to-frame. Every source image is drawn "facing left" (a
 * mostly front-facing view angled slightly left); facing right is always
 * produced by mirroring one of these four, never a separate asset. */
export interface CharacterSpriteSet {
  readonly idle: HTMLImageElement;
  readonly walkLeft: HTMLImageElement;
  readonly walkPass: HTMLImageElement;
  readonly walkRight: HTMLImageElement;
}

export type CharacterKind = "player" | "rusher" | "shooter" | "tank" | "boss";

export const CHARACTER_SPRITES: Record<CharacterKind, CharacterSpriteSet> = {
  player: {
    idle: loadImage(playerIdleUrl),
    walkLeft: loadImage(playerWalkLeftUrl),
    walkPass: loadImage(playerWalkPassUrl),
    walkRight: loadImage(playerWalkRightUrl),
  },
  // Legless and hovering rather than walking, but the same 4-pose set and
  // left-facing-source/mirror-for-right convention as every other enemy
  // kind (see CharacterSpriteSet's own doc comment) — its move_left/
  // move_pass/move_right frames slot into the shared walkLeft/walkPass/
  // walkRight fields unchanged.
  boss: {
    idle: loadImage(bossIdleUrl),
    walkLeft: loadImage(bossMoveLeftUrl),
    walkPass: loadImage(bossMovePassUrl),
    walkRight: loadImage(bossMoveRightUrl),
  },
  rusher: {
    idle: loadImage(rusherIdleUrl),
    walkLeft: loadImage(rusherWalkLeftUrl),
    walkPass: loadImage(rusherWalkPassUrl),
    walkRight: loadImage(rusherWalkRightUrl),
  },
  shooter: {
    idle: loadImage(shooterIdleUrl),
    walkLeft: loadImage(shooterWalkLeftUrl),
    walkPass: loadImage(shooterWalkPassUrl),
    walkRight: loadImage(shooterWalkRightUrl),
  },
  tank: {
    idle: loadImage(tankIdleUrl),
    walkLeft: loadImage(tankWalkLeftUrl),
    walkPass: loadImage(tankWalkPassUrl),
    walkRight: loadImage(tankWalkRightUrl),
  },
};

export const SPRITES = {
  map: loadImage(mapUrl),
  // Brief red flash shown instead of the normal walk/idle frame while
  // contactInvulnerableRemaining is counting down after a hit.
  playerHit: loadImage(playerHitUrl),
  // Weapon icons, keyed by WeaponId.
  blade: loadImage(katanaUrl),
  pistol: loadImage(smgUrl),
  scattergun: loadImage(scattergunUrl),
  beam: loadImage(beamUrl),
  rocket: loadImage(launcherUrl),
  crate: loadImage(crateUrl),
  health: loadImage(healthUrl),
  xpOrb: loadImage(xpOrbUrl),
  projectile: loadImage(projectileUrl),
  // The actual flying rocket-launcher projectile — distinct from `rocket`
  // above, which is the launcher weapon's pickup/HUD icon.
  rocketProjectile: loadImage(rocketProjectileUrl),
  // Pistol and Scattergun's flying projectile (every pellet included).
  bulletProjectile: loadImage(bulletProjectileUrl),
  // Turret's flying projectile.
  cannonballProjectile: loadImage(cannonballProjectileUrl),
  // One-shot visual played where splash damage from an exploding projectile
  // (Rocket today) actually lands — see game/state.ts's `explosions`.
  explosion: loadImage(explosionUrl),
  turretBase: loadImage(turretBaseUrl),
  turretHead: loadImage(turretHeadUrl),
} as const;

export function ready(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}
