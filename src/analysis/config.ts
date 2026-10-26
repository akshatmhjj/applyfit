// Verdict thresholds. Change them here, nowhere else. Hard gates always win over the score.
export const VERDICT_THRESHOLDS = {
  // fitScore at or above this: Apply.
  apply: 75,
  // fitScore at or above this (and below apply): Apply with tailored resume. Below: Skip.
  applyWithTailoredResume: 50,
} as const;
