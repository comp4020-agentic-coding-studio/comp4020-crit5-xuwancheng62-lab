import { describe, expect, it } from "vitest";
import { DEFAULT_SPAWN_TUNING, RUN_LENGTH_SECONDS } from "../src/game/spawn/spawn-tuning";

describe("DEFAULT_SPAWN_TUNING: the difficulty ramp", () => {
  it("starts with a small enemy cap and a slow spawn rate, not maxed out from second 0", () => {
    expect(DEFAULT_SPAWN_TUNING.maxAliveEnemiesAt(0)).toBeLessThan(10);
    expect(DEFAULT_SPAWN_TUNING.spawnIntervalAt(0)).toBeGreaterThanOrEqual(0.5);
  });

  it("ramps up gradually across most of the run, not within its first few seconds", () => {
    const capAt10s = DEFAULT_SPAWN_TUNING.maxAliveEnemiesAt(10);
    const capAtRunEnd = DEFAULT_SPAWN_TUNING.maxAliveEnemiesAt(RUN_LENGTH_SECONDS);
    // Still meaningfully below the endgame cap ten seconds in — a fast ramp
    // (the earlier, since-replaced tuning) would already be maxed out here.
    expect(capAt10s).toBeLessThan(capAtRunEnd * 0.6);
  });

  it("the enemy cap and spawn rate are both monotonic over elapsed time — never a mid-run easing off", () => {
    const samples = [0, 5, 15, 30, 45, 60, 75, 90];
    for (let i = 1; i < samples.length; i += 1) {
      const prevT = samples[i - 1];
      const t = samples[i];
      expect(DEFAULT_SPAWN_TUNING.maxAliveEnemiesAt(t)).toBeGreaterThanOrEqual(
        DEFAULT_SPAWN_TUNING.maxAliveEnemiesAt(prevT),
      );
      expect(DEFAULT_SPAWN_TUNING.spawnIntervalAt(t)).toBeLessThanOrEqual(
        DEFAULT_SPAWN_TUNING.spawnIntervalAt(prevT),
      );
    }
  });

  it("reaches its endgame cap and floor by the run's final stretch, and holds there", () => {
    // 45 and 0.09 were the pre-shrink (WORLD_RADIUS 560) values; both are now
    // scaled by DENSITY_FACTOR = (400/560)^2 * 0.8 ≈ 0.4082 to keep enemy
    // density comparable in the smaller world — see spawn-tuning.ts.
    expect(DEFAULT_SPAWN_TUNING.maxAliveEnemiesAt(RUN_LENGTH_SECONDS)).toBe(18);
    expect(DEFAULT_SPAWN_TUNING.spawnIntervalAt(RUN_LENGTH_SECONDS)).toBeCloseTo(0.2205, 3);
  });
});
