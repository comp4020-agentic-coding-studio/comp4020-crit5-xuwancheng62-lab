import { describe, expect, it } from "vitest";
import { PICKUP_COLLECT_RADIUS } from "../src/game/entities/pickups";
import { fistBaseStats } from "../src/game/weapons/weapon-stats";

describe("PICKUP_COLLECT_RADIUS", () => {
  it("matches Fist's own attack range exactly", () => {
    expect(PICKUP_COLLECT_RADIUS).toBe(fistBaseStats().range);
  });
});
