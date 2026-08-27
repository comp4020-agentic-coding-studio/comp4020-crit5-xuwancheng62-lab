import { describe, expect, it } from "vitest";
import { createRng } from "../src/game/rng";
import {
  fireBeam,
  fireBeamVisual,
  fireBlade,
  firePistol,
  fireRocket,
  fireScattergun,
} from "../src/game/weapons/attached-weapons";

const PLAYER_POS = { x: 0, y: 0 };
const TARGET_POS = { x: 100, y: 0 };

describe("attached weapons: knockback, Beam excepted", () => {
  it("Blade's area effect carries a positive knockback", () => {
    expect(fireBlade(1, PLAYER_POS).knockback).toBeGreaterThan(0);
  });

  it("Pistol's projectile carries a positive knockback", () => {
    expect(firePistol(1, PLAYER_POS, PLAYER_POS, TARGET_POS).knockback).toBeGreaterThan(0);
  });

  it("every Scattergun pellet carries a positive knockback", () => {
    const { spawns } = fireScattergun(1, PLAYER_POS, PLAYER_POS, TARGET_POS, createRng(1));
    expect(spawns.length).toBeGreaterThan(0);
    for (const spawn of spawns) expect(spawn.knockback).toBeGreaterThan(0);
  });

  it("Rocket's projectile carries a positive knockback", () => {
    expect(fireRocket(1, PLAYER_POS, PLAYER_POS, TARGET_POS).knockback).toBeGreaterThan(0);
  });

  it("Beam's line effect has no knockback field at all", () => {
    const effect = fireBeam(1, PLAYER_POS, TARGET_POS);
    expect("knockback" in effect).toBe(false);
  });
});

describe("fireBeamVisual: the cosmetic line, separate from the damage effect", () => {
  const MUZZLE_POS = { x: 10, y: 4 };

  it("starts at the given muzzle position, not the player's own center", () => {
    const visual = fireBeamVisual(1, PLAYER_POS, MUZZLE_POS, TARGET_POS);
    expect(visual.from).toEqual(MUZZLE_POS);
  });

  it("aims the same direction as the damage effect (toward the nearest enemy from the player)", () => {
    const damageEffect = fireBeam(1, PLAYER_POS, TARGET_POS);
    const visual = fireBeamVisual(1, PLAYER_POS, MUZZLE_POS, TARGET_POS);
    const damageDir = Math.atan2(damageEffect.to.y - damageEffect.from.y, damageEffect.to.x - damageEffect.from.x);
    const visualDir = Math.atan2(visual.to.y - visual.from.y, visual.to.x - visual.from.x);
    expect(visualDir).toBeCloseTo(damageDir);
  });

  it("reaches the same range as the damage effect", () => {
    const damageEffect = fireBeam(2, PLAYER_POS, TARGET_POS);
    const visual = fireBeamVisual(2, PLAYER_POS, MUZZLE_POS, TARGET_POS);
    const damageLength = Math.hypot(damageEffect.to.x - damageEffect.from.x, damageEffect.to.y - damageEffect.from.y);
    const visualLength = Math.hypot(visual.to.x - visual.from.x, visual.to.y - visual.from.y);
    expect(visualLength).toBeCloseTo(damageLength);
  });
});
