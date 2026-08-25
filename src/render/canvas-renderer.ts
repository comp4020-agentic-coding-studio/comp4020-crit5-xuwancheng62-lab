// Draws the game world onto a 2D context. Impure (it's a Canvas), but takes
// a pure GameState + Camera as input and never mutates either — all the
// actual game logic already happened in step(). HUD text/health/timer live
// as DOM overlay elements instead (render/hud.ts), which is simpler and more
// accessible than drawing text on canvas.

import { worldToScreen, type Camera } from "../game/camera";
import { findNearestEnemy, type EnemyState } from "../game/entities/enemies";
import type { Pickup } from "../game/entities/pickups";
import type { PlacedEntity } from "../game/entities/placed-entities";
import type { Projectile } from "../game/entities/projectiles";
import type { GameState } from "../game/state";
import { angleOf, subtract } from "../game/vector";
import { PLAYER_SHAPE, colorForWeapon, shapeFor } from "./shapes";
import {
  beamStats,
  bladeStats,
  fistBaseStats,
  pistolStats,
  rocketStats,
  scattergunStats,
} from "../game/weapons/weapon-stats";
import type { WeaponId } from "../game/weapons/weapon-types";

const GRID_SPACING = 48;
const GRID_COLOR = "rgba(255,255,255,0.045)";
const BACKGROUND_COLOR = "#0c0d14";

function cooldownSecondsFor(type: WeaponId, level: number): number {
  switch (type) {
    case "blade":
      return bladeStats(level).cooldownSeconds;
    case "pistol":
      return pistolStats(level).cooldownSeconds;
    case "scattergun":
      return scattergunStats(level).cooldownSeconds;
    case "beam":
      return beamStats(level).cooldownSeconds;
    case "rocket":
      return rocketStats(level).cooldownSeconds;
    case "turret":
      return Number.POSITIVE_INFINITY;
  }
}

/** A weapon "just fired" if its cooldown was reset to (close to) its full
 * value this frame — read from state alone, no separate transient-effect
 * channel needed. */
function justFired(remaining: number | undefined, full: number): boolean {
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

function drawEnemy(ctx: CanvasRenderingContext2D, camera: Camera, enemy: EnemyState, playerScreenPos: { x: number; y: number }): void {
  const shape = shapeFor(enemy.kind);
  const screenPos = worldToScreen(camera, enemy.pos);
  drawBlob(
    ctx,
    screenPos,
    shape.radiusX,
    shape.radiusY,
    shape.color,
    shape.outlineColor,
    shape.outlineWidth,
    shape.eyeOffsets,
    shape.eyeRadius,
  );

  if (enemy.kind === "shooter") {
    // The aiming nub: a small stalk pointing at wherever the player is,
    // which is both the shooter's distinguishing feature and the visual
    // tell for "this is where the shot comes from".
    const angle = angleOf(subtract(playerScreenPos, screenPos));
    const nubLength = shape.radiusX + 6;
    ctx.beginPath();
    ctx.moveTo(screenPos.x, screenPos.y);
    ctx.lineTo(screenPos.x + Math.cos(angle) * nubLength, screenPos.y + Math.sin(angle) * nubLength);
    ctx.strokeStyle = shape.outlineColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  if (enemy.hp < enemy.maxHp) {
    drawHealthBar(ctx, { x: screenPos.x, y: screenPos.y - shape.radiusY - 8 }, shape.radiusX * 2, enemy.hp / enemy.maxHp);
  }
}

function drawHealthBar(ctx: CanvasRenderingContext2D, topCenter: { x: number; y: number }, width: number, fraction: number): void {
  const height = 3;
  const left = topCenter.x - width / 2;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(left, topCenter.y, width, height);
  ctx.fillStyle = fraction > 0.35 ? "#7be08a" : "#ff6a6a";
  ctx.fillRect(left, topCenter.y, width * Math.max(0, fraction), height);
}

function drawPlayer(ctx: CanvasRenderingContext2D, screenPos: { x: number; y: number }, moving: boolean): void {
  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, PLAYER_SHAPE.radius, 0, Math.PI * 2);
  ctx.fillStyle = PLAYER_SHAPE.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PLAYER_SHAPE.outlineColor;
  ctx.stroke();
  if (moving) {
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, PLAYER_SHAPE.radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(232,237,255,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawProjectile(ctx: CanvasRenderingContext2D, camera: Camera, projectile: Projectile): void {
  const screenPos = worldToScreen(camera, projectile.pos);
  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, projectile.radius, 0, Math.PI * 2);
  ctx.fillStyle = projectile.onImpact === "explode" ? "#ff8a4a" : "#ffe9a8";
  ctx.fill();
}

function drawPickup(ctx: CanvasRenderingContext2D, camera: Camera, pickup: Pickup): void {
  const screenPos = worldToScreen(camera, pickup.pos);
  const color = colorForWeapon(pickup.weaponType);
  ctx.save();
  ctx.translate(screenPos.x, screenPos.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color;
  ctx.fillRect(-5, -5, 10, 10);
  ctx.restore();
}

function drawTurret(ctx: CanvasRenderingContext2D, camera: Camera, turret: PlacedEntity): void {
  const screenPos = worldToScreen(camera, turret.pos);
  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#8dffb0";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#2f6b45";
  ctx.stroke();
  if (turret.hp < turret.maxHp) {
    drawHealthBar(ctx, { x: screenPos.x, y: screenPos.y - 18 }, 20, turret.hp / turret.maxHp);
  }
}

function drawWeaponFlash(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  playerScreenPos: { x: number; y: number },
  state: GameState,
): void {
  const characterAttackSpeed = 1; // flashes are cosmetic; exact scaling doesn't matter for the "just fired" heuristic

  if (justFired(state.fistCooldownRemaining, fistBaseStats().cooldownSeconds / characterAttackSpeed)) {
    ctx.beginPath();
    ctx.arc(playerScreenPos.x, playerScreenPos.y, fistBaseStats().range, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (const slot of state.loadout.slots) {
    const remaining = state.weaponCooldowns[slot.type];
    const full = cooldownSecondsFor(slot.type, slot.level);
    if (!justFired(remaining, full)) continue;

    if (slot.type === "blade") {
      ctx.beginPath();
      ctx.arc(playerScreenPos.x, playerScreenPos.y, bladeStats(slot.level).ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(217,217,227,0.8)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (slot.type === "beam") {
      const nearest = findNearestEnemy(
        // approximate: draw toward wherever the nearest enemy currently is
        { x: camera.centerWorld.x, y: camera.centerWorld.y },
        state.enemies,
      );
      if (nearest) {
        const stats = beamStats(slot.level);
        const dir = angleOf(subtract(nearest.pos, camera.centerWorld));
        const to = worldToScreen(camera, {
          x: camera.centerWorld.x + Math.cos(dir) * stats.rangeDistance,
          y: camera.centerWorld.y + Math.sin(dir) * stats.rangeDistance,
        });
        ctx.beginPath();
        ctx.moveTo(playerScreenPos.x, playerScreenPos.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = "rgba(255,106,213,0.85)";
        ctx.lineWidth = stats.width;
        ctx.stroke();
      }
    }
  }
}

export function renderFrame(ctx: CanvasRenderingContext2D, camera: Camera, state: GameState, isMoving: boolean): void {
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, camera.viewportCssWidth, camera.viewportCssHeight);
  drawGrid(ctx, camera);

  for (const pickup of state.pickups) drawPickup(ctx, camera, pickup);
  for (const turret of state.placedEntities) drawTurret(ctx, camera, turret);

  const playerScreenPos = worldToScreen(camera, state.player.pos);
  for (const enemy of state.enemies) drawEnemy(ctx, camera, enemy, playerScreenPos);
  for (const projectile of state.projectiles) drawProjectile(ctx, camera, projectile);

  drawWeaponFlash(ctx, camera, playerScreenPos, state);
  drawPlayer(ctx, playerScreenPos, isMoving);
}
