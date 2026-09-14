const hourMs = 3_600_000;

export const time = {
  hourMs,
  dayMs: 24 * hourMs,
  visibilityOffsetMs: 6 * hourMs,
  graceMs: hourMs,
  unknownTime: '00:00',
} as const;
