export type GamePhase = 'loading' | 'tutorial' | 'ready' | 'countdown' | 'playing' | 'paused' | 'result'
export type Team = 'blue' | 'red'
export type MinionKind = 'melee' | 'ranged'

export interface Vec2 {
  x: number
  y: number
}

export interface Minion {
  id: number
  team: Team
  kind: MinionKind
  position: Vec2
  hp: number
  maxHp: number
  attackCooldown: number
  targetId: number | null
  alive: boolean
  spawnIndex: number
  facing: Vec2
  moving: boolean
  attackAnimation: number
  formationOffset: number
}

export interface HeroState {
  position: Vec2
  destination: Vec2
  selectedTargetId: number | null
  attackCooldown: number
  attackWindup: number
  attackAnimation: number
  pendingTargetId: number | null
  moving: boolean
  attacking: boolean
  facing: Vec2
}

export interface FeedbackEvent {
  id: number
  type: 'attack' | 'lastHit' | 'miss' | 'move'
  position: Vec2
  value?: number
}

export interface GameSnapshot {
  phase: GamePhase
  remainingTime: number
  countdown: number
  lastHits: number
  goal: number
  gold: number
  combo: number
  bestCombo: number
  attacks: number
  accuracy: number
  selectedTargetId: number | null
  attackCooldown: number
  attackCooldownMax: number
  bestLastHits: number
  bestClearTime: number | null
  muted: boolean
}

export interface Turret {
  id: number
  team: Team
  position: Vec2
  hp: number
  maxHp: number
  alive: boolean
  attackCooldown: number
  targetId: number | null
  laserActive: boolean
  laserTimer: number
  lastTargetPosition: Vec2 | null
}

export interface WorldState {
  phase: GamePhase
  hero: HeroState
  minions: Minion[]
  turrets: {
    blue: Turret
    red: Turret
  }
  cursor: { position: Vec2; age: number } | null
  feedback: FeedbackEvent | null
  elapsed: number
}

export type InputAction =
  | { type: 'move'; position: Vec2 }
  | { type: 'selectTarget'; targetId: number }
  | { type: 'basicAttack' }
  | { type: 'pause' }

export interface GameConfig {
  duration: number
  goal: number
  waveInterval: number
  goldPerLastHit: number
  hero: {
    moveSpeed: number
    attackDamage: number
    attackCooldown: number
    attackWindup: number
    attackRange: number
    targetSearchRange: number
  }
  minions: {
    meleeHp: number
    rangedHp: number
    meleeDamage: number
    rangedDamage: number
    meleeCooldown: number
    rangedCooldown: number
    meleeRange: number
    rangedRange: number
    moveSpeed: number
  }
  turrets: {
    maxHp: number
    attackDamageMeleeRatio: number
    attackDamageRangedRatio: number
    attackCooldown: number
    attackRange: number
  }
}
