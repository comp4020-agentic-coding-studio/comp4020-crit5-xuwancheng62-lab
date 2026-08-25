// The character-level curve. Placeholder shape, deliberately: whether this
// feels too slow (nothing changes for too long) or too fast (levels blur
// together) is a "did you play it" question, not a "did you read it" one.

export interface XpProgress {
  readonly level: number;
  readonly xp: number;
}

export const INITIAL_XP_PROGRESS: XpProgress = { level: 1, xp: 0 };

/** XP required to advance from `level` to `level + 1`. */
export function xpToNextLevel(level: number): number {
  return Math.round(10 + level * 6);
}

/**
 * Pure. Handles more than one level-up in a single call (a big kill streak,
 * or many XP orbs collected the same frame) without ever leaving leftover xp
 * that should have rolled into a further level-up.
 */
export function gainXp(progress: XpProgress, amount: number): XpProgress {
  if (amount <= 0) return progress;
  let level = progress.level;
  let xp = progress.xp + amount;
  while (xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level += 1;
  }
  return { level, xp };
}
