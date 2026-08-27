export type Ending = "playing" | "won" | "lost";

export interface EndingCheckInput {
  readonly playerHp: number;
  readonly elapsedSeconds: number;
  readonly runLengthSeconds: number;
  /** Has the Boss ever been spawned this run (see step.ts's one-time 80s
   * trigger)? Once true, the timer-based win below is permanently disabled
   * — the only way to win from here on is killing the Boss. */
  readonly bossSpawned: boolean;
  /** Is the Boss currently alive? Only meaningful once bossSpawned is true;
   * ignored otherwise. */
  readonly bossAlive: boolean;
}

/**
 * Loss is checked before win: if both would be true on the same tick (health
 * hits zero on the exact frame the timer also elapses), the run reads as a
 * loss, since it's the more informative outcome — a player who died right at
 * the buzzer still died.
 *
 * Once the Boss has spawned, the normal timer-based win is bypassed entirely
 * (checked second, before the timer) — the run keeps going past
 * runLengthSeconds for as long as the Boss is alive, and ends in a win the
 * instant it isn't.
 */
export function checkEnding(input: EndingCheckInput): Ending {
  if (input.playerHp <= 0) return "lost";
  if (input.bossSpawned) return input.bossAlive ? "playing" : "won";
  if (input.elapsedSeconds >= input.runLengthSeconds) return "won";
  return "playing";
}
