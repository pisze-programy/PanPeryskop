export const vps = {
  ipv4ProxyHost: '127.0.0.1',
  ipv4ProxyPort: 1057,
  // Europe/Warsaw — outside this window a kick is a no-op.
  windowStartHour: 5,
  windowEndHour: 22,
  exitIphone: 'iphone-14-pro-max',
  exitMac: 'macos',
  exitProbeTimeoutMs: 20_000,
  exitSwitchWaitMs: 2_000,
  // 256 MB box: pause when memory or load is too tight.
  minMemAvailableMb: 80,
  maxLoad1: 2.0,
  concurrency: Number(process.env.VPS_CONCURRENCY || 8),
} as const;
