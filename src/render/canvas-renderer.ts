// Draws the game world onto a 2D context. Impure (it's a Canvas), but takes
// a pure GameState + Camera as input and never mutates either — all the
// actual game logic already happened in step(). HUD text/health/timer live
// as DOM overlay elements instead (render/hud.ts), which is simpler and more
// accessible than drawing text on canvas.
//
// Every entity prefers its raster sprite (src/render/sprite-assets.ts) and
// falls back to the original flat-vector shape whenever that sprite hasn't
// finished loading yet (or, for Turret, has no art at all) — so the game is
// never one slow image load away from drawing nothing.
//
// Every size (radius, stroke width, image dimension) drawn here is a
// world-space number run through worldLengthToScreen — camera.zoom scales
// them all consistently, so a bigger zoom can never look "zoomed in on
// position but not on size".

import { worldLengthToScreen, worldToScreen, type Camera } from "../game/camera";
import { findNearestEnemy, type EnemyKind, type EnemyState } from "../game/entities/enemies";
import { statsAtCharacterLevel } from "../game/leveling/player-stats";
import type { Pickup } from "../game/entities/pickups";
import { turretAimDirection, type PlacedEntity } from "../game/entities/placed-entities";
import type { Projectile } from "../game/entities/projectiles";
import { explosionEffectDurationSeconds } from "../game/step";
import type { ExplosionEffect, GameState } from "../game/state";
import { add, angleOf, fromAngle, subtract } from "../game/vector";
import type { Vector2 } from "../game/types";
import { WORLD_RADIUS } from "../game/world-bounds";
import { type FacingState, spriteForCharacter, updateFacing, WALK_FRAME_SECONDS } from "./character-animation";
import { CHARACTER_SPRITES, ready, SPRITES, type CharacterKind } from "./sprite-assets";
import { PLAYER_SHAPE, colorForWeapon, shapeFor, type BlobShape } from "./shapes";
import {
  beamStats,
  bladeStats,
  nukeStats,
  rocketStats,
  scattergunStats,
  smgStats,
} from "../game/weapons/weapon-stats";
import { orbitIndices, weaponOrbitPosition } from "../game/weapons/weapon-orbit";
import type { WeaponId } from "../game/weapons/weapon-types";

const GRID_SPACING = 48;
// Dark olive rather than the old navy — on a wide viewport the map image
// (scaled for its clearing to line up with WORLD_RADIUS, not for full
// coverage at every possible viewport size) can run out before the visible
// edge; this keeps that unreachable margin a plausible dark forest rather
// than a jarring sci-fi blue. The area inside the wall — the only part
// anyone can actually stand in — is always fully covered by the art.
const GRID_COLOR = "rgba(210,225,180,0.05)";
const BACKGROUND_COLOR = "#12160c";

/** World units per source pixel of src/sprites/map.png (already resized to
 * 768x768 — see resources/ for the original). The base value (2) was
 * calibrated so the image's own clearing reads close to the *old*
 * WORLD_RADIUS of 560; deriving from the ratio to the current WORLD_RADIUS
 * (rather than a second hardcoded literal) keeps the art scaled down by
 * exactly the same amount the playable world just was, so it still fits the
 * new, smaller boundary instead of spilling past it. An exact pixel-perfect
 * match isn't worth chasing by hand either way — the explicit boundary ring
 * below is what actually guarantees the wall is visible regardless. */
const CALIBRATED_MAP_SCALE = 2;
const CALIBRATED_MAP_WORLD_RADIUS = 560;
const MAP_IMAGE_SCALE = CALIBRATED_MAP_SCALE * (WORLD_RADIUS / CALIBRATED_MAP_WORLD_RADIUS);

/** Per-entity walk/idle animation memory, keyed by "player" for the player
 * and by EnemyState.id for enemies — a plain position-delta tracker (see
 * character-animation.ts), not game state: losing it (e.g. on a hot reload)
 * only costs one frame of "which way was it last facing", never anything
 * that affects gameplay. Pruned each renderFrame call so ids from despawned
 * enemies don't accumulate over a long run. */
const facingTrackers = new Map<string, FacingState>();

/** Icons used both for a dropped weapon pickup's crate icon (drawPickup)
 * and for the equipped-weapon icons orbiting the player
 * (drawEquippedWeapons). Turret uses its own turret-head art rather than a
 * dedicated pickup icon — there's no separate "held turret" asset, and the
 * cannon itself reads clearly as "this is the turret weapon". */
const WEAPON_ICON_SPRITES: Partial<Record<WeaponId, HTMLImageElement>> = {
  blade: SPRITES.blade,
  smg: SPRITES.smg,
  scattergun: SPRITES.scattergun,
  beam: SPRITES.beam,
  rocket: SPRITES.rocket,
  turret: SPRITES.turretHead,
  nuke: SPRITES.nuke,
};

function cooldownSecondsFor(type: WeaponId, level: number): number {
  switch (type) {
    case "blade":
      return bladeStats(level).cooldownSeconds;
    case "smg":
      return smgStats(level).cooldownSeconds;
    case "scattergun":
      return scattergunStats(level).cooldownSeconds;
    case "beam":
      return beamStats(level).cooldownSeconds;
    case "rocket":
      return rocketStats(level).cooldownSeconds;
    case "turret":
      return Number.POSITIVE_INFINITY;
    case "nuke":
      return nukeStats(level).cooldownSeconds;
  }
}

/** A weapon "just fired" if its cooldown was reset to (close to) its full
 * value this frame — read from state alone, no separate transient-effect
 * channel needed. `full` MUST already have the character's attack-speed
 * multiplier applied, exactly like the value step.ts actually stores in
 * weaponCooldowns — comparing against the raw,
 * unscaled stat here silently stopped the flash from ever firing (Beam
 * included) once attack speed climbed past ~1.09x, because the real
 * `remaining` was always smaller than that unscaled 92% threshold. */
export function justFired(remaining: number | undefined, full: number): boolean {
  if (remaining === undefined || !Number.isFinite(full)) return false;
  return remaining > full * 0.92;
}

function drawGrid(ctx: CanvasRenderingContext2D, camera: Camera): void {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  const originScreen = worldToScreen(camera, { x: 0, y: 0 });
  const startX = ((originScreen.x % GRID_SPACING) + GRID_SPACING) % GRID_SPACING;
  const startY = ((originScreen.y % GRID_SPACING) + GRID_SPACING) % GRID_SPACING;
  ctx.beginPath();
  for (let x = startX; x < camera.viewportCssWidth; x += GRID_SPACING) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, camera.viewportCssHeight);
  }
  for (let y = startY; y < camera.viewportCssHeight; y += GRID_SPACING) {
    ctx.moveTo(0, y);
    ctx.lineTo(camera.viewportCssWidth, y);
  }
  ctx.stroke();
}

/** The forest-clearing art (if loaded) plus an explicit boundary ring drawn
 * every frame regardless — the ring, not the art's alignment with it, is
 * what actually guarantees "the wall is visible" per the map's hard
 * movement limit in game/world-bounds.ts. */
function drawMapAndBoundary(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const mapImage = SPRITES.map;
  if (ready(mapImage)) {
    const worldWidth = mapImage.naturalWidth * MAP_IMAGE_SCALE;
    const worldHeight = mapImage.naturalHeight * MAP_IMAGE_SCALE;
    const topLeft = worldToScreen(camera, { x: -worldWidth / 2, y: -worldHeight / 2 });
    ctx.drawImage(
      mapImage,
      topLeft.x,
      topLeft.y,
      worldLengthToScreen(camera, worldWidth),
      worldLengthToScreen(camera, worldHeight),
    );
  }

  const center = worldToScreen(camera, { x: 0, y: 0 });
  const boundaryRadius = worldLengthToScreen(camera, WORLD_RADIUS);
  ctx.beginPath();
  ctx.arc(center.x, center.y, boundaryRadius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 214, 130, 0.5)";
  ctx.lineWidth = worldLengthToScreen(camera, 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(center.x, center.y, boundaryRadius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(35, 18, 10, 0.9)";
  ctx.lineWidth = worldLengthToScreen(camera, 3);
  ctx.stroke();
}

function drawBlob(
  ctx: CanvasRenderingContext2D,
  screenPos: { x: number; y: number },
  radiusX: number,
  radiusY: number,
  color: string,
  outlineColor: string,
  outlineWidth: number,
  eyeOffsets: readonly { x: number; y: number }[],
  eyeRadius: number,
): void {
  ctx.beginPath();
  ctx.ellipse(screenPos.x, screenPos.y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = outlineWidth;
  ctx.strokeStyle = outlineColor;
  ctx.stroke();

  ctx.fillStyle = "#12131a";
  for (const eye of eyeOffsets) {
    ctx.beginPath();
    ctx.arc(screenPos.x + eye.x, screenPos.y + eye.y, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draws `img` centered at `screenPos`, scaled to fit within a
 * `targetDiameter` (already in screen-space) box while preserving its
 * native aspect ratio. Returns false (drawing nothing) when the image
 * hasn't finished loading, so the caller can fall back to a vector shape.
 * `mirror: true` flips it horizontally about its own center — every
 * animated character's art is drawn "facing left", so a right-facing pose
 * is always this mirror, never a separate asset. */
function drawSpriteCentered(
  ctx: CanvasRenderingContext2D,
  screenPos: Vector2,
  img: HTMLImageElement,
  targetDiameter: number,
  mirror = false,
): boolean {
  if (!ready(img)) return false;
  const aspect = img.naturalWidth / img.naturalHeight;
  const width = aspect >= 1 ? targetDiameter : targetDiameter * aspect;
  const height = aspect >= 1 ? targetDiameter / aspect : targetDiameter;
  if (mirror) {
    ctx.save();
    ctx.translate(screenPos.x, screenPos.y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
    ctx.restore();
  } else {
    ctx.drawImage(img, screenPos.x - width / 2, screenPos.y - height / 2, width, height);
  }
  return true;
}

/** Shared by the player and every enemy kind: looks up (and advances) this
 * entity's facing/moving state from its current world position, picks the
 * idle/walk_left/walk_pass/walk_right frame, and draws it — mirrored when
 * last facing right. `trackerId` is "player" for the player, otherwise the
 * enemy's own id. Returns false when the chosen sprite hasn't loaded yet, so
 * the caller can fall back to its vector shape exactly like drawSpriteCentered. */
function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  screenPos: Vector2,
  trackerId: string,
  kind: CharacterKind,
  pos: Vector2,
  elapsedSeconds: number,
  targetDiameter: number,
  frameSeconds: number = WALK_FRAME_SECONDS,
): boolean {
  const { moving, facingRight, next } = updateFacing(pos, facingTrackers.get(trackerId));
  facingTrackers.set(trackerId, next);
  const sprite = spriteForCharacter(CHARACTER_SPRITES[kind], moving, elapsedSeconds, frameSeconds);
  return drawSpriteCentered(ctx, screenPos, sprite, worldLengthToScreen(camera, targetDiameter), facingRight);
}

/** How much bigger than its own vector-shape radius (shapes.ts) each enemy
 * kind's raster sprite renders — purely cosmetic; collision keeps using
 * entities/enemies.ts's own radiusFor, and the vector-fallback blob/eyes/
 * health-bar position all still use shape.radiusX/radiusY directly,
 * untouched. Tank gets a smaller multiplier than Rusher/Shooter: at the
 * shared 2.6x its sprite (67.6 world units across) obscured other enemies,
 * health bars and projectiles behind it — 1.7x (44.2) brings its rendered
 * size close to its actual 22-unit collision radius while staying clearly
 * the largest enemy on screen (Shooter's sprite is 31.2, Rusher's 28.6).
 * Unused for Boss — see BOSS_RENDER_SCALE_OVER_TANK below, sized directly
 * off Tank's own rendered diameter instead of its own shape.radiusX. */
function spriteScaleFor(kind: EnemyKind): number {
  return kind === "tank" ? 1.7 : 2.6;
}

/** How much bigger the Boss renders than the Tank — computed directly from
 * Tank's own current rendered diameter (shape.radiusX * spriteScaleFor
 * ("tank")) rather than through Boss's own shape.radiusX, so the
 * relationship holds even if Tank's own numbers change later. Bumped from
 * the original 1.7x to 2.6x for a more imposing presence, then another 20%
 * for the reinforced final encounter. */
const BOSS_RENDER_SCALE_OVER_TANK = 3.12;
/** "Slightly slower" than every other enemy's WALK_FRAME_SECONDS cadence —
 * a legless hover reads as heavier/slower than a walk cycle. */
const BOSS_ANIMATION_FRAME_SECONDS = WALK_FRAME_SECONDS * 1.5;

function targetSpriteDiameterFor(kind: EnemyKind, shape: BlobShape): number {
  if (kind === "boss") {
    const tankShape = shapeFor("tank");
    return tankShape.radiusX * spriteScaleFor("tank") * BOSS_RENDER_SCALE_OVER_TANK;
  }
  return shape.radiusX * spriteScaleFor(kind);
}

/** Pulsating ring around the Boss while it's telegraphing an attack — "a
 * clear... warning" per the brief for the normal attack, extended to the
 * special attack's own warning too (which the brief otherwise only
 * describes with a roar) so both are visually, not just audibly, readable. */
function drawBossWarningGlow(ctx: CanvasRenderingContext2D, camera: Camera, screenPos: Vector2, diameter: number, elapsedSeconds: number): void {
  const pulse = 0.55 + 0.45 * Math.sin(elapsedSeconds * 18);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, worldLengthToScreen(camera, diameter / 2) * 1.15, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 225, 90, 0.9)";
  ctx.lineWidth = worldLengthToScreen(camera, 4);
  ctx.stroke();
  ctx.restore();
}

/** A soft dark ellipse under the Boss, always on (not just during a
 * warning) — since it hovers rather than standing on legs, a ground shadow
 * is what actually sells its scale and weight, the way the eye-glow ring
 * sells its attacks. */
function drawBossGroundShadow(ctx: CanvasRenderingContext2D, camera: Camera, screenPos: Vector2, diameter: number): void {
  const radiusX = worldLengthToScreen(camera, diameter * 0.34);
  const radiusY = worldLengthToScreen(camera, diameter * 0.14);
  const shadowY = screenPos.y + worldLengthToScreen(camera, diameter * 0.42);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(screenPos.x, shadowY, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, camera: Camera, enemy: EnemyState, elapsedSeconds: number): void {
  const shape = shapeFor(enemy.kind);
  const screenPos = worldToScreen(camera, enemy.pos);
  const targetDiameter = targetSpriteDiameterFor(enemy.kind, shape);
  const isBoss = enemy.kind === "boss";

  if (isBoss) drawBossGroundShadow(ctx, camera, screenPos, targetDiameter);

  const drewSprite = drawCharacterSprite(
    ctx,
    camera,
    screenPos,
    enemy.id,
    enemy.kind,
    enemy.pos,
    elapsedSeconds,
    targetDiameter,
    isBoss ? BOSS_ANIMATION_FRAME_SECONDS : WALK_FRAME_SECONDS,
  );
  if (!drewSprite) {
    drawBlob(
      ctx,
      screenPos,
      worldLengthToScreen(camera, shape.radiusX),
      worldLengthToScreen(camera, shape.radiusY),
      shape.color,
      shape.outlineColor,
      shape.outlineWidth,
      shape.eyeOffsets.map((eye) => ({ x: worldLengthToScreen(camera, eye.x), y: worldLengthToScreen(camera, eye.y) })),
      worldLengthToScreen(camera, shape.eyeRadius),
    );
  }

  if (isBoss) {
    if ((enemy.bossPhase ?? "idle") !== "idle") {
      drawBossWarningGlow(ctx, camera, screenPos, targetDiameter, elapsedSeconds);
    }
    // The Boss gets its own large top-of-screen bar (render/hud.ts) instead
    // of the small per-enemy one every other kind uses here.
    return;
  }

  if (enemy.hp < enemy.maxHp) {
    drawHealthBar(
      ctx,
      camera,
      { x: screenPos.x, y: screenPos.y - worldLengthToScreen(camera, shape.radiusY + 8) },
      worldLengthToScreen(camera, shape.radiusX * 2),
      enemy.hp / enemy.maxHp,
    );
  }
}

function drawHealthBar(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  topCenter: { x: number; y: number },
  width: number,
  fraction: number,
): void {
  const height = worldLengthToScreen(camera, 3);
  const left = topCenter.x - width / 2;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(left, topCenter.y, width, height);
  ctx.fillStyle = fraction > 0.35 ? "#7be08a" : "#ff6a6a";
  ctx.fillRect(left, topCenter.y, width * Math.max(0, fraction), height);
}

/** True for the same 0.5s window step.ts's own CONTACT_INVULNERABILITY_SECONDS
 * grants after a hit — contactInvulnerableRemaining is 0 the rest of the
 * time, so "still counting down" already means "just got hit", with no
 * separate edge-detected transient-effect channel needed. */
function recentlyHit(contactInvulnerableRemaining: number): boolean {
  return contactInvulnerableRemaining > 0;
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  screenPos: { x: number; y: number },
  pos: Vector2,
  inputMoving: boolean,
  contactInvulnerableRemaining: number,
  elapsedSeconds: number,
): void {
  const { moving, facingRight, next } = updateFacing(pos, facingTrackers.get("player"));
  facingTrackers.set("player", next);

  // Unlike the enemy sprites (drawn facing left, mirrored for "facing
  // right" — see drawCharacterSprite above, unchanged), the player's own
  // idle/walk/hit art already faces right in the source image. So moving
  // right draws it directly and moving left is the mirror — the inverse of
  // `facingRight`, not `facingRight` itself. `updateFacing` still just
  // reports "did it move right" (dx > 0); only this player-specific mirror
  // decision is flipped.
  const mirrorForPlayer = !facingRight;
  const drewSprite = recentlyHit(contactInvulnerableRemaining)
    ? drawSpriteCentered(
        ctx,
        screenPos,
        SPRITES.playerHit,
        worldLengthToScreen(camera, PLAYER_SHAPE.radius * 2.8),
        mirrorForPlayer,
      )
    : drawSpriteCentered(
        ctx,
        screenPos,
        spriteForCharacter(CHARACTER_SPRITES.player, moving, elapsedSeconds),
        worldLengthToScreen(camera, PLAYER_SHAPE.radius * 2.8),
        mirrorForPlayer,
      );
  if (!drewSprite) {
    const radius = worldLengthToScreen(camera, PLAYER_SHAPE.radius);
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = PLAYER_SHAPE.color;
    ctx.fill();
    ctx.lineWidth = worldLengthToScreen(camera, 2);
    ctx.strokeStyle = PLAYER_SHAPE.outlineColor;
    ctx.stroke();
  }
  if (inputMoving) {
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, worldLengthToScreen(camera, PLAYER_SHAPE.radius + 4), 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(232,237,255,0.35)";
    ctx.lineWidth = worldLengthToScreen(camera, 1.5);
    ctx.stroke();
  }
}

// Sized generously beyond the actual hitbox (projectile.radius) purely so a
// fast-moving shot reads clearly on screen — this is cosmetic only, the
// collision math elsewhere still uses the real, smaller radius. Separate
// per-weapon scales (rather than one shared constant) because a bullet and
// a cannonball need very different amounts of that generous sizing:
// SMG/Scattergun's bullet.png was reading oversized relative to the
// small-caliber shots it represents, while the turret's cannonball read as
// too small next to its now-bigger barrel (see TURRET_HEAD_DIAMETER above).
const SMG_SCATTERGUN_PROJECTILE_SCALE = 2.3; // small-caliber rounds
const TURRET_CANNONBALL_PROJECTILE_SCALE = 8.0; // was the shared 4.2 -> ~1.9x
const ROCKET_PROJECTILE_SCALE = 4.2; // unchanged
const NUKE_PROJECTILE_SCALE = 5.5;
const DEFAULT_PROJECTILE_SCALE = 4.2; // unchanged — enemy fire and any untagged projectile

function projectileVisualScale(sourceWeapon: WeaponId | undefined): number {
  switch (sourceWeapon) {
    case "smg":
    case "scattergun":
      return SMG_SCATTERGUN_PROJECTILE_SCALE;
    case "turret":
      return TURRET_CANNONBALL_PROJECTILE_SCALE;
    case "rocket":
      return ROCKET_PROJECTILE_SCALE;
    case "nuke":
      return NUKE_PROJECTILE_SCALE;
    default:
      return DEFAULT_PROJECTILE_SCALE;
  }
}

/** rocket.png / cannonball.png / bullet.png are all drawn "nose right, trail
 * left" in the source art, so rotating by the raw velocity angle (no
 * offset) lines the nose up with wherever the projectile is actually
 * travelling. */
function drawRotatedSpriteCentered(
  ctx: CanvasRenderingContext2D,
  screenPos: Vector2,
  img: HTMLImageElement,
  diameter: number,
  rotationRadians: number,
): boolean {
  if (!ready(img)) return false;
  const aspect = img.naturalWidth / img.naturalHeight;
  const width = aspect >= 1 ? diameter : diameter * aspect;
  const height = aspect >= 1 ? diameter / aspect : diameter;
  ctx.save();
  ctx.translate(screenPos.x, screenPos.y);
  ctx.rotate(rotationRadians);
  ctx.drawImage(img, -width / 2, -height / 2, width, height);
  ctx.restore();
  return true;
}

/** Purely visual fattening of the drawn Beam — applied to both the sprite
 * and its canvas-line fallback at their one shared call site, never to
 * beamStats.width (the real hit-test width) or anything gameplay reads. */
const BEAM_VISUAL_THICKNESS_MULTIPLIER = 1.5;

/** SPRITES.laserBeam stretched from `fromScreen` to `toScreen` and rotated
 * to match — unlike every other sprite draw here, this deliberately does
 * NOT preserve the image's own aspect ratio: length has to match however
 * far this exact shot reached, while thickness stays whatever
 * `thicknessScreen` says regardless of length, which is what "stretch only
 * along its length" means. Anchored at `fromScreen` (not centered) since
 * the art's own left edge is a bright origin point and its right edge
 * tapers to the target — drawImage's natural left-to-right, alpha-aware
 * compositing lines that up with no extra work. */
function drawBeamSprite(
  ctx: CanvasRenderingContext2D,
  fromScreen: Vector2,
  toScreen: Vector2,
  thicknessScreen: number,
): boolean {
  const img = SPRITES.laserBeam;
  if (!ready(img)) return false;
  const dx = toScreen.x - fromScreen.x;
  const dy = toScreen.y - fromScreen.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0) return false;
  ctx.save();
  ctx.translate(fromScreen.x, fromScreen.y);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.drawImage(img, 0, -thicknessScreen / 2, length, thicknessScreen);
  ctx.restore();
  return true;
}

/** Keyed by ProjectileSpawn.sourceWeapon (see entities/projectiles.ts) — the
 * one place a fired projectile's weapon determines which travelling-bullet
 * art it uses. Absent for enemy fire (untagged), which keeps the original
 * generic look. */
const PROJECTILE_SPRITES: Partial<Record<WeaponId, HTMLImageElement>> = {
  smg: SPRITES.bulletProjectile,
  scattergun: SPRITES.bulletProjectile,
  rocket: SPRITES.rocketProjectile,
  turret: SPRITES.cannonballProjectile,
  nuke: SPRITES.nukeProjectile,
};

function drawProjectile(ctx: CanvasRenderingContext2D, camera: Camera, projectile: Projectile): void {
  const screenPos = worldToScreen(camera, projectile.pos);
  const diameter = worldLengthToScreen(camera, projectile.radius * projectileVisualScale(projectile.sourceWeapon));
  const sprite = projectile.sourceWeapon ? PROJECTILE_SPRITES[projectile.sourceWeapon] : undefined;
  const drewSprite = sprite
    ? drawRotatedSpriteCentered(ctx, screenPos, sprite, diameter, angleOf(projectile.vel))
    : drawSpriteCentered(ctx, screenPos, SPRITES.projectile, diameter);
  if (!drewSprite) {
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, diameter / 2, 0, Math.PI * 2);
    ctx.fillStyle = projectile.onImpact === "explode" ? "#ff8a4a" : "#ffe9a8";
    ctx.fill();
  }
  if (projectile.onImpact === "explode") {
    // A single shared projectile sprite can't show "this one explodes" by
    // itself — a thin warm ring keeps that signal readable.
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, diameter / 2 + worldLengthToScreen(camera, 4), 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,138,74,0.65)";
    ctx.lineWidth = worldLengthToScreen(camera, 2.5);
    ctx.stroke();
  }
}

/** One-shot splash-damage visual (state.explosions — see step.ts, spawned at
 * the exact instant applyAreaDamage fires for an exploding projectile).
 * Scaled to the effect's own radius (which mirrors the real explodeRadius,
 * never the other way round) and faded out over its short lifetime; skipped
 * entirely if the sprite hasn't loaded rather than drawing any placeholder. */
function drawExplosion(ctx: CanvasRenderingContext2D, camera: Camera, effect: ExplosionEffect, elapsedSeconds: number): void {
  const img = effect.sourceWeapon === "nuke" ? SPRITES.nukeExplosion : SPRITES.explosion;
  if (!ready(img)) return;
  const age = elapsedSeconds - effect.startedAt;
  const progress = Math.min(1, Math.max(0, age / explosionEffectDurationSeconds(effect)));
  const screenPos = worldToScreen(camera, effect.pos);
  const diameter = worldLengthToScreen(camera, effect.radius * 2);
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  drawSpriteCentered(ctx, screenPos, img, diameter);
  ctx.restore();
}

const PICKUP_CRATE_DIAMETER = 38;
const PICKUP_ICON_DIAMETER = 23;
const HEALTH_PICKUP_DIAMETER = 24;

function drawPickup(ctx: CanvasRenderingContext2D, camera: Camera, pickup: Pickup, elapsedSeconds: number): void {
  const screenPos = worldToScreen(camera, pickup.pos);

  // A soft pulsing glow so a drop reads at a glance against the busy
  // forest background — phase offset by position so pickups don't all
  // pulse in lockstep.
  const pulse = 0.8 + 0.2 * Math.sin(elapsedSeconds * 3.4 + pickup.pos.x * 0.15 + pickup.pos.y * 0.15);
  const glowRadius = worldLengthToScreen(camera, PICKUP_CRATE_DIAMETER * 0.75) * pulse;
  const glow = ctx.createRadialGradient(screenPos.x, screenPos.y, 0, screenPos.x, screenPos.y, glowRadius);
  glow.addColorStop(0, "rgba(255, 244, 190, 0.5)");
  glow.addColorStop(1, "rgba(255, 244, 190, 0)");
  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  if (pickup.kind === "health") {
    if (drawSpriteCentered(ctx, screenPos, SPRITES.health, worldLengthToScreen(camera, HEALTH_PICKUP_DIAMETER))) return;
    const size = worldLengthToScreen(camera, 8);
    ctx.fillStyle = "#ff4b4b";
    ctx.fillRect(screenPos.x - size / 3, screenPos.y - size, (size * 2) / 3, size * 2);
    ctx.fillRect(screenPos.x - size, screenPos.y - size / 3, size * 2, (size * 2) / 3);
    return;
  }

  const drewCrate = drawSpriteCentered(ctx, screenPos, SPRITES.crate, worldLengthToScreen(camera, PICKUP_CRATE_DIAMETER));
  const icon = WEAPON_ICON_SPRITES[pickup.weaponType];
  if (icon) drawSpriteCentered(ctx, screenPos, icon, worldLengthToScreen(camera, PICKUP_ICON_DIAMETER));

  if (drewCrate) return; // crate drew; its icon either drew too or hasn't loaded yet this frame

  // Neither sprite ready yet: the original rotated, weapon-colored diamond.
  const color = colorForWeapon(pickup.weaponType);
  const halfSize = worldLengthToScreen(camera, 8);
  ctx.save();
  ctx.translate(screenPos.x, screenPos.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color;
  ctx.fillRect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);
  ctx.restore();
}

// Was 34/22 — bumped 1.35x/1.7x respectively (base within the requested
// 1.3-1.4x, head within 1.6-1.8x) so the turret reads as a substantial
// installation rather than a small prop. Purely visual: turret collision,
// range, health and damage (weapon-stats.ts's turretStats) are untouched,
// and the pivot fraction (TURRET_HEAD_PIVOT below) is scale-invariant since
// it's a fraction of whatever diameter is passed in, so the head stays
// correctly attached with no wobble/orbit at the new size.
const TURRET_BASE_DIAMETER = 46;
const TURRET_HEAD_DIAMETER = 37;

/** Fraction-of-image coordinates for turret_head.png's swivel/hex-bolt joint
 * — the point that has to land exactly on the turret's world position when
 * rotated, or the head visibly orbits/jumps around instead of just turning
 * in place. Read directly off the source art (resources/turret_head.png);
 * a fixed art constant, not something derived at runtime. */
const TURRET_HEAD_PIVOT: Vector2 = { x: 0.4, y: 0.39 };
/** The barrel's own inherent angle in the source art (radians) — it already
 * points a little above horizontal-right rather than dead level, so this is
 * subtracted from the target aim angle before rotating; otherwise "aiming
 * due right" would visually tilt the barrel upward by this much. */
const TURRET_HEAD_BASE_ANGLE = -0.08;

/** Like drawSpriteCentered, but positions/rotates the image about an
 * arbitrary fraction-of-image pivot point instead of its geometric center —
 * needed for the turret head (and, with the flip param, the orbiting
 * equipped-weapon icons) where the on-screen anchor point isn't the middle
 * of the sprite. `verticalFlip: -1` mirrors the image about that same pivot
 * after rotating, for callers that need to avoid an upside-down look past
 * ±90° (see drawEquippedWeapons). */
function drawSpriteAboutPivot(
  ctx: CanvasRenderingContext2D,
  screenPos: Vector2,
  img: HTMLImageElement,
  targetDiameter: number,
  pivotFraction: Vector2,
  rotationRadians: number,
  verticalFlip: 1 | -1 = 1,
): boolean {
  if (!ready(img)) return false;
  const aspect = img.naturalWidth / img.naturalHeight;
  const width = aspect >= 1 ? targetDiameter : targetDiameter * aspect;
  const height = aspect >= 1 ? targetDiameter / aspect : targetDiameter;
  ctx.save();
  ctx.translate(screenPos.x, screenPos.y);
  ctx.rotate(rotationRadians);
  ctx.scale(1, verticalFlip);
  ctx.drawImage(img, -pivotFraction.x * width, -pivotFraction.y * height, width, height);
  ctx.restore();
  return true;
}

function drawTurret(ctx: CanvasRenderingContext2D, camera: Camera, turret: PlacedEntity, enemies: readonly EnemyState[]): void {
  const screenPos = worldToScreen(camera, turret.pos);
  // The base platform never turns — only the head assembly swivels to aim
  // (see turretAimDirection in entities/placed-entities.ts, the same
  // function tickTurret itself uses to decide what to fire at).
  const drewBase = drawSpriteCentered(ctx, screenPos, SPRITES.turretBase, worldLengthToScreen(camera, TURRET_BASE_DIAMETER));
  const aimDirection = turretAimDirection(turret, enemies);
  const rotation = aimDirection ? angleOf(aimDirection) - TURRET_HEAD_BASE_ANGLE : 0;
  const drewHead = drawSpriteAboutPivot(
    ctx,
    screenPos,
    SPRITES.turretHead,
    worldLengthToScreen(camera, TURRET_HEAD_DIAMETER),
    TURRET_HEAD_PIVOT,
    rotation,
  );
  if (!drewBase && !drewHead) {
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, worldLengthToScreen(camera, 10), 0, Math.PI * 2);
    ctx.fillStyle = "#8dffb0";
    ctx.fill();
    ctx.lineWidth = worldLengthToScreen(camera, 2);
    ctx.strokeStyle = "#2f6b45";
    ctx.stroke();
  }
  if (turret.hp < turret.maxHp) {
    drawHealthBar(
      ctx,
      camera,
      { x: screenPos.x, y: screenPos.y - worldLengthToScreen(camera, 18) },
      worldLengthToScreen(camera, 20),
      turret.hp / turret.maxHp,
    );
  }
}

function drawWeaponFlash(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  state: GameState,
): void {
  // Must match step.ts's own division exactly, or "just fired" drifts out
  // of sync with reality as the character levels up attack speed.
  const attackSpeedMultiplier = statsAtCharacterLevel(state.xp.level).attackSpeedMultiplier;

  for (const slot of state.loadout.slots) {
    const remaining = state.weaponCooldowns[slot.type];
    const full = cooldownSecondsFor(slot.type, slot.level) / attackSpeedMultiplier;

    // Blade's attack effect (see drawKatanaAttack) is visible across its own
    // thrust/impact/retract window straddling the fire instant — a
    // different, wider window than the brief post-fire flash justFired
    // gates everything else with — so it's evaluated unconditionally here,
    // every frame, and decides its own visibility internally.
    if (slot.type === "blade") {
      // state.player.pos, not camera.centerWorld — the comfortable-camera
      // dead zone means the camera can now lag behind the player, so the
      // two are no longer interchangeable the way they used to be.
      drawKatanaAttack(ctx, camera, state.player.pos, slot.level, remaining, full);
      continue;
    }

    if (!justFired(remaining, full)) continue;

    if (slot.type === "beam") {
      // state.beamVisual is locked once, at the exact instant Beam fires
      // (see step.ts) — drawn as-is here, never recomputed from the
      // player's or nearest enemy's CURRENT position, so the line can't
      // drift or retarget mid-flash.
      const visual = state.beamVisual;
      if (visual) {
        const from = worldToScreen(camera, visual.from);
        const to = worldToScreen(camera, visual.to);
        // visual.width is beamStats(level).width, the actual hit-test width
        // (see fireBeam in attached-weapons.ts) — BEAM_VISUAL_THICKNESS_
        // MULTIPLIER only fattens how thick it's *drawn*, centered on the
        // same locked from/to line either way, never the hitbox itself.
        const thickness = worldLengthToScreen(camera, visual.width) * BEAM_VISUAL_THICKNESS_MULTIPLIER;
        const drewSprite = drawBeamSprite(ctx, from, to, thickness);
        if (!drewSprite) {
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.strokeStyle = "rgba(255,106,213,0.85)";
          ctx.lineWidth = thickness;
          ctx.stroke();
        }
      }
    }
  }
}

const KATANA_ATTACK_ICON_DIAMETER = 20;
/** How long before an attack actually fires the katanas start visibly
 * thrusting outward, and how long after firing they take retracting back
 * in. Both are capped well below the fastest possible Blade cooldown
 * (level 8 plus a high attack-speed multiplier can drop under 100ms) via
 * the `* 0.4` clamp in drawKatanaAttack, so the animation always fits
 * inside whatever cooldown window is actually available rather than
 * overlapping itself. */
const KATANA_THRUST_LEAD_SECONDS = 0.1;
const KATANA_RETRACT_SECONDS = 0.14;

/** Blade's attack effect, replacing the old flat ring: `3 + level` katanas
 * (katana.png) evenly spaced around a full circle, each pointing straight
 * outward, animated ready (invisible, right at the player) -> thrust
 * outward -> impact (full reach, exactly bladeStats(level).ringRadius — the
 * same radius applyAreaDamage in step.ts actually used) -> retract back to
 * invisible. The thrust window sits in the tail of the *previous* cooldown
 * and the retract window in the head of the new one, so "impact" (full
 * extension) lands exactly on the frame step.ts resets the cooldown to
 * full and applies the area damage — see justFired's own doc comment for
 * why that reset instant is detectable from `remaining` alone. Purely
 * cosmetic: the actual hit always uses bladeStats(level) directly and is
 * applied exactly once per attack in step.ts, never anything computed
 * here. */
function drawKatanaAttack(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  playerWorldPos: Vector2,
  level: number,
  remaining: number | undefined,
  full: number,
): void {
  if (!Number.isFinite(full) || full <= 0) return;
  const thrustLead = Math.min(KATANA_THRUST_LEAD_SECONDS, full * 0.4);
  const retract = Math.min(KATANA_RETRACT_SECONDS, full * 0.4);
  // A never-yet-fired weapon (remaining undefined, see GameState.weaponCooldowns'
  // own doc comment) is treated as fully rested — nothing drawn until its
  // first actual attack.
  const timeRemaining = remaining ?? full;
  const elapsedSinceFire = full - timeRemaining;

  let reachFraction: number;
  if (elapsedSinceFire >= 0 && elapsedSinceFire <= retract) {
    reachFraction = 1 - elapsedSinceFire / retract; // impact -> retract
  } else if (timeRemaining <= thrustLead) {
    reachFraction = 1 - timeRemaining / thrustLead; // ready -> thrust outward
  } else {
    return; // resting between attacks — nothing to draw
  }

  const ringRadius = bladeStats(level).ringRadius;
  const reachDistance = ringRadius * reachFraction;
  const katanaCount = 3 + level;
  for (let i = 0; i < katanaCount; i += 1) {
    const angle = (2 * Math.PI * i) / katanaCount;
    const worldPos = add(playerWorldPos, fromAngle(angle, reachDistance));
    const screenPos = worldToScreen(camera, worldPos);
    const { rotation, verticalFlip } = equippedWeaponTransform(angle, EQUIPPED_WEAPON_ICON_BASE_ANGLE);
    drawSpriteAboutPivot(
      ctx,
      screenPos,
      SPRITES.blade,
      worldLengthToScreen(camera, KATANA_ATTACK_ICON_DIAMETER),
      EQUIPPED_WEAPON_ICON_PIVOT,
      rotation,
      verticalFlip,
    );
  }
}

const EQUIPPED_WEAPON_ICON_DIAMETER = 18;

/** katana.png / smg.png / scattergun.png / beam.png / launcher.png are all
 * drawn along roughly the same diagonal in their source art — grip at
 * lower-left, business end at upper-right — rather than pointing along a
 * clean local +x axis. Both the pivot (near the grip, so the icon stays
 * visually attached to its orbit position when rotated) and this inherent
 * forward angle are shared approximations across all five rather than
 * individually measured per icon; at the small size these render on screen
 * the difference is not visually meaningful. */
const EQUIPPED_WEAPON_ICON_PIVOT: Vector2 = { x: 0.25, y: 0.75 };
const EQUIPPED_WEAPON_ICON_BASE_ANGLE = -Math.PI / 6;
const NUKE_ICON_PIVOT: Vector2 = { x: 0.28, y: 0.62 };
const NUKE_ICON_BASE_ANGLE = 0;

/** Rotating a sprite continuously past ±90° from its own inherent forward
 * angle makes an icon with an implied "this side up" (a grip, a stock) read
 * as upside-down. The fix used here — and in countless 2D shooters — is to
 * cap the rotation to the right hemisphere and mirror vertically for the
 * left one instead of continuing to spin past it; aimAngle itself (not the
 * eventual rotation value) decides which hemisphere, since that's the
 * on-screen direction actually being represented. */
function equippedWeaponTransform(aimAngle: number, baseAngle: number): { rotation: number; verticalFlip: 1 | -1 } {
  if (Math.cos(aimAngle) >= 0) return { rotation: aimAngle - baseAngle, verticalFlip: 1 };
  return { rotation: aimAngle + baseAngle, verticalFlip: -1 };
}

/** Every non-Turret loadout slot, drawn as its icon orbiting the player
 * (see weapon-orbit.ts for the shared position math step.ts's own muzzle
 * spawn points are built from) rather than stacked at the player's center.
 * Turret is excluded — it deploys away from the player as its own
 * standalone entity, so there's nothing of it to draw "held". Purely
 * cosmetic: nothing here feeds back into step.ts's collision or damage math. */
function drawEquippedWeapons(ctx: CanvasRenderingContext2D, camera: Camera, state: GameState): void {
  const nearest = findNearestEnemy(state.player.pos, state.enemies);
  const aimAngle = nearest ? angleOf(subtract(nearest.pos, state.player.pos)) : -Math.PI / 2;
  const { indices, total } = orbitIndices(state.loadout.slots);
  if (total <= 0) return;

  state.loadout.slots.forEach((slot, i) => {
    if (slot.type === "turret") return;
    const icon = WEAPON_ICON_SPRITES[slot.type];
    if (!icon) return;
    const orbitPos = weaponOrbitPosition(state.player.pos, indices[i], total);
    const screenPos = worldToScreen(camera, orbitPos);
    const isNuke = slot.type === "nuke";
    const { rotation, verticalFlip } = equippedWeaponTransform(
      aimAngle,
      isNuke ? NUKE_ICON_BASE_ANGLE : EQUIPPED_WEAPON_ICON_BASE_ANGLE,
    );
    drawSpriteAboutPivot(
      ctx,
      screenPos,
      icon,
      worldLengthToScreen(camera, isNuke ? EQUIPPED_WEAPON_ICON_DIAMETER * 1.2 : EQUIPPED_WEAPON_ICON_DIAMETER),
      isNuke ? NUKE_ICON_PIVOT : EQUIPPED_WEAPON_ICON_PIVOT,
      rotation,
      verticalFlip,
    );
  });
}

/** Drops facing-tracker entries for enemies no longer in `state.enemies` —
 * otherwise every enemy id ever spawned across a run stays in the map
 * forever. "player" is never pruned; it always exists. */
function pruneFacingTrackers(state: GameState): void {
  const aliveIds = new Set(state.enemies.map((enemy) => enemy.id));
  for (const id of facingTrackers.keys()) {
    if (id !== "player" && !aliveIds.has(id)) facingTrackers.delete(id);
  }
}

export function renderFrame(ctx: CanvasRenderingContext2D, camera: Camera, state: GameState, isMoving: boolean): void {
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, camera.viewportCssWidth, camera.viewportCssHeight);
  drawGrid(ctx, camera);
  drawMapAndBoundary(ctx, camera);

  pruneFacingTrackers(state);

  for (const pickup of state.pickups) drawPickup(ctx, camera, pickup, state.elapsedSeconds);
  for (const turret of state.placedEntities) drawTurret(ctx, camera, turret, state.enemies);

  const playerScreenPos = worldToScreen(camera, state.player.pos);
  for (const enemy of state.enemies) drawEnemy(ctx, camera, enemy, state.elapsedSeconds);
  for (const projectile of state.projectiles) drawProjectile(ctx, camera, projectile);
  for (const explosion of state.explosions) drawExplosion(ctx, camera, explosion, state.elapsedSeconds);

  drawWeaponFlash(ctx, camera, state);
  drawEquippedWeapons(ctx, camera, state);
  drawPlayer(
    ctx,
    camera,
    playerScreenPos,
    state.player.pos,
    isMoving,
    state.player.contactInvulnerableRemaining,
    state.elapsedSeconds,
  );
}
