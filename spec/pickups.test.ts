import { describe, expect, it } from "vitest";
import { HEALTH_DROP_CHANCE, PICKUP_COLLECT_RADIUS } from "../src/game/entities/pickups";

describe("PICKUP_COLLECT_RADIUS", () => {
  it("keeps pickups comfortably collectible without a melee weapon", () => {
    expect(PICKUP_COLLECT_RADIUS).toBe(42);
  });
});

describe("HEALTH_DROP_CHANCE", () => {
  it("is half of the previous five-percent drop rate", () => {
    expect(HEALTH_DROP_CHANCE).toBe(0.025);
  });
});
