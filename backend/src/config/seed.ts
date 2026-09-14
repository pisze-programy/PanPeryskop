const daysAhead = 5;
const intervalDays = 3;

export const seed = {
  deviceId: 'panperyskop-seed',
  window: {
    daysAhead,
    intervalDays,
    refillAhead: daysAhead + intervalDays - 1,
  },
  // Generous on purpose: the VPS egresses through the phone's cellular node, where
  // a tight 10-20s timeout drops valid responses.
  fetchTimeoutMs: 60_000,
} as const;
