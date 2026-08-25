import { describe, expect, it } from "vitest";
import { INITIAL_XP_PROGRESS, gainXp, xpToNextLevel } from "../src/game/leveling/xp";

describe("gainXp", () => {
  it("accumulates without leveling up while under the threshold", () => {
    const result = gainXp(INITIAL_XP_PROGRESS, 3);
    expect(result).toEqual({ level: 1, xp: 3 });
  });

  it("levels up exactly on the threshold, with zero leftover", () => {
    const threshold = xpToNextLevel(1);
    const result = gainXp(INITIAL_XP_PROGRESS, threshold);
    expect(result).toEqual({ level: 2, xp: 0 });
  });

  it("carries leftover xp into the new level rather than discarding it", () => {
    const threshold = xpToNextLevel(1);
    const result = gainXp(INITIAL_XP_PROGRESS, threshold + 4);
    expect(result.level).toBe(2);
    expect(result.xp).toBe(4);
  });

  it("can level up more than once from a single large gain", () => {
    const bigGain = xpToNextLevel(1) + xpToNextLevel(2) + 2;
    const result = gainXp(INITIAL_XP_PROGRESS, bigGain);
    expect(result.level).toBe(3);
    expect(result.xp).toBe(2);
  });

  it("is a no-op for zero or negative amounts", () => {
    expect(gainXp(INITIAL_XP_PROGRESS, 0)).toEqual(INITIAL_XP_PROGRESS);
    expect(gainXp(INITIAL_XP_PROGRESS, -5)).toEqual(INITIAL_XP_PROGRESS);
  });

  it("never mutates the progress it was given", () => {
    const before = { ...INITIAL_XP_PROGRESS };
    gainXp(INITIAL_XP_PROGRESS, 999);
    expect(INITIAL_XP_PROGRESS).toEqual(before);
  });
});

describe("xpToNextLevel", () => {
  it("increases with level, so the game doesn't get easier to level up over time", () => {
    expect(xpToNextLevel(5)).toBeGreaterThan(xpToNextLevel(1));
  });
});
