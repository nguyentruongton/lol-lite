import type { GameConfig } from './types'

export const GAME_CONFIG: GameConfig = {
  duration: 180,
  goal: 20,
  waveInterval: 24,
  goldPerLastHit: 21,
  hero: {
    moveSpeed: 0.29,
    attackDamage: 34,
    attackCooldown: 0.95,
    attackWindup: 0.25,
    attackRange: 0.105,
    targetSearchRange: 0.5,
  },
  minions: {
    meleeHp: 118,
    rangedHp: 82,
    meleeDamage: 13,
    rangedDamage: 10,
    meleeCooldown: 1.18,
    rangedCooldown: 1.42,
    meleeRange: 0.07,
    rangedRange: 0.19,
    moveSpeed: 0.055,
  },
  turrets: {
    maxHp: 1000,
    attackDamageMeleeRatio: 0.45,
    attackDamageRangedRatio: 0.70,
    attackCooldown: 1.2,
    attackRange: 0.23,
  },
}
