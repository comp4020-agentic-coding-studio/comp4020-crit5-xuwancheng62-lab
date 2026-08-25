/**
 * A linear level-scaling lookup, shared by weapon levels (1..4) and character
 * levels (uncapped). Every number fed into this is a placeholder pending
 * playtesting — see weapons/weapon-stats.ts and leveling/player-stats.ts,
 * where the base/perLevel constants live, never scattered inline.
 */
export function statAt(level: number, base: number, perLevel: number): number {
  return base + perLevel * (level - 1);
}
