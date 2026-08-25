export type Ending = "playing" | "won" | "lost";

export interface EndingCheckInput {
  readonly playerHp: number;
  readonly elapsedSeconds: number;
  readonly runLengthSeconds: number;
}

/**
 * Loss is checked before win: if both would be true on the same tick (health
 * hits zero on the exact frame the timer also elapses), the run reads as a
 * loss, since it's the more informative outcome — a player who died right at
 * the buzzer still died.
 */
export function checkEnding(input: EndingCheckInput): Ending {
  if (input.playerHp <= 0) return "lost";
  if (input.elapsedSeconds >= input.runLengthSeconds) return "won";
  return "playing";
}
