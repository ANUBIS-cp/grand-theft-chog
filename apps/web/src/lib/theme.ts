import type { DistrictId, GangId } from '@chog-city/data';

/** District colours, sampled from the Background trait colours in the Chog art (8 Oct 2026). */
export const DISTRICT_COLOR: Record<DistrictId, { bg: string; fg: string }> = {
  'mon-square': { bg: '#95a5f2', fg: '#111111' },
  'purple-hill': { bg: '#e4a6ec', fg: '#111111' },
  'lemon-row': { bg: '#f2f19a', fg: '#111111' },
  'aqua-docks': { bg: '#96e9f3', fg: '#111111' },
  'pink-strip': { bg: '#f29899', fg: '#111111' },
  'green-park': { bg: '#9cf2b4', fg: '#111111' },
  'blue-heights': { bg: '#5572ea', fg: '#ffffff' },
  'radioactive-zone': { bg: '#292344', fg: '#c6d986' },
};

/** One colour per gang, picked from its trait (Bitcoin orange for BTC Gang, Monad purple for Mon Gang...). */
export const GANG_COLOR: Record<GangId, { bg: string; fg: string }> = {
  mcga: { bg: '#d7263d', fg: '#ffffff' },
  lazoor: { bg: '#c026d3', fg: '#ffffff' },
  gangstas: { bg: '#141414', fg: '#e8b931' },
  robbers: { bg: '#2e7d32', fg: '#ffffff' },
  suits: { bg: '#1e3a8a', fg: '#ffffff' },
  royals: { bg: '#e8b931', fg: '#111111' },
  wizards: { bg: '#4b1f8c', fg: '#ffffff' },
  'squid-game': { bg: '#f25c8a', fg: '#111111' },
  jailbirds: { bg: '#d9d9d9', fg: '#111111' },
  clowns: { bg: '#ffd60a', fg: '#111111' },
  'btc-maxis': { bg: '#f7931a', fg: '#111111' },
  'mon-maxis': { bg: '#836ef9', fg: '#ffffff' },
  crybabies: { bg: '#4fc3f7', fg: '#111111' },
  'visor-gang': { bg: '#14b8a6', fg: '#111111' },
  skulls: { bg: '#f5f0e1', fg: '#111111' },
  radioactive: { bg: '#9be33b', fg: '#111111' },
  caps: { bg: '#2563eb', fg: '#ffffff' },
  durags: { bg: '#8b5a2b', fg: '#ffffff' },
  naked: { bg: '#ffb5a7', fg: '#111111' },
  legends: { bg: '#3a0ca3', fg: '#ffd23f' },
};
