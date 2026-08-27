import { describe, expect, it } from "vitest";
import { justFired, renderFrame } from "../src/render/canvas-renderer";
import { createInitialGameState } from "../src/game/state";
import { beamStats } from "../src/game/weapons/weapon-stats";
import type { Camera } from "../src/game/camera";

describe("justFired: the weapon-flash heuristic", () => {
  it("fires right after a cooldown reset when full is scaled by attack speed, matching step.ts", () => {
    const rawCooldown = 1.2; // e.g. beamStats(level).cooldownSeconds
    const attackSpeedMultiplier = 1.2; // a leveled-up character, well past the old 1.09x cliff
    const actualStoredRemaining = rawCooldown / attackSpeedMultiplier; // exactly what step.ts stores on fire

    // The caller MUST divide `full` by the same multiplier before calling
    // this — that's the contract this test is pinning down.
    const full = rawCooldown / attackSpeedMultiplier;
    expect(justFired(actualStoredRemaining, full)) .toBe(true);
  });

  it("stops firing once enough of the cooldown has actually elapsed", () => {
    const rawCooldown = 1.2;
    const attackSpeedMultiplier = 1.2;
    const full = rawCooldown / attackSpeedMultiplier;
    const remaining = full * 0.5; // well past the "just fired" window
    expect(justFired(remaining, full)).toBe(false);
  });

  it("is false with no cooldown state or a non-finite full (e.g. Turret slot)", () => {
    expect(justFired(undefined, 1)).toBe(false);
    expect(justFired(1, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

/** A minimal ctx double: every method call is counted by name, every
 * property assignment is just accepted. Enough surface for renderFrame to
 * run start to finish without a real Canvas. */
function makeMockCtx(): { ctx: CanvasRenderingContext2D; calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const store: Record<string, unknown> = {};
  const ctx = new Proxy(store, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      if (typeof target[prop] === "function") return target[prop];
      return (...args: unknown[]) => {
        calls[prop] = (calls[prop] ?? 0) + 1;
        void args;
      };
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("renderFrame: Beam's flash stays in sync with its actual cooldown reset", () => {
  it("draws the beam line the instant it fires, even well past the leveled-up attack-speed cliff", () => {
    const attackSpeedMultiplier = 1.2; // character level 5 — see leveling/player-stats.ts
    const rawCooldown = beamStats(1).cooldownSeconds;
    const state = {
      ...createInitialGameState(1),
      xp: { level: 5, xp: 0 },
      loadout: { slots: [{ type: "beam" as const, level: 1 }] },
      weaponCooldowns: { beam: rawCooldown / attackSpeedMultiplier }, // exactly what step.ts stores on fire
      enemies: [
        { id: "e", kind: "rusher" as const, pos: { x: 50, y: 0 }, radius: 11, hp: 6, maxHp: 6, attackCooldownRemaining: 0 },
      ],
      // What step.ts would have locked in at the same instant it reset the
      // cooldown above — the renderer now draws this fixed line rather than
      // recomputing one from the current player/enemy positions.
      beamVisual: { from: { x: 0, y: 0 }, to: { x: 50, y: 0 }, width: beamStats(1).width },
    };
    // Zero viewport so drawGrid's own lineTo calls (unrelated to the beam)
    // never fire, keeping `lineTo` an unambiguous signal for the beam line.
    const camera: Camera = { centerWorld: state.player.pos, viewportCssWidth: 0, viewportCssHeight: 0 };
    const { ctx, calls } = makeMockCtx();
    renderFrame(ctx, camera, state, false);
    expect(calls.lineTo ?? 0).toBeGreaterThan(0);
  });
});
