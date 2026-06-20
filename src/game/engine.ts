import { GAME_CONFIG } from './config'
import { loadProgress, saveProgress, type SavedProgress } from './storage'
import type {
  FeedbackEvent,
  GameConfig,
  GamePhase,
  GameSnapshot,
  InputAction,
  Minion,
  Team,
  Turret,
  Vec2,
  WorldState,
} from './types'

type Listener = (snapshot: GameSnapshot) => void

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export class GameEngine {
  private readonly config: GameConfig
  private readonly listeners = new Set<Listener>()
  private readonly minionById = new Map<number, Minion>()
  private readonly progress: SavedProgress
  private phase: GamePhase = 'loading'
  private previousPhase: GamePhase = 'playing'
  private remainingTime: number
  private countdown = 3
  private elapsed = 0
  private nextWaveAt = 0
  private entityId = 1
  private eventId = 1
  private lastHits = 0
  private gold = 0
  private combo = 0
  private bestCombo = 0
  private attacks = 0
  private lastEmitAt = 0
  private feedback: FeedbackEvent | null = null
  private cursor: WorldState['cursor'] = null
  private minions: Minion[] = []
  private hero = this.createHero()
  private turrets!: {
    blue: Turret
    red: Turret
  }
  private worldView!: WorldState

  constructor(config: GameConfig = GAME_CONFIG) {
    this.config = config
    this.remainingTime = config.duration
    this.progress = loadProgress()
    this.initTurrets()
    this.worldView = {
      phase: this.phase,
      hero: this.hero,
      minions: this.minions,
      turrets: this.turrets,
      cursor: this.cursor,
      feedback: this.feedback,
      elapsed: this.elapsed,
    }
  }

  private createHero() {
    return {
      position: { x: 0.5, y: 0.68 },
      destination: { x: 0.5, y: 0.68 },
      selectedTargetId: null as number | null,
      attackCooldown: 0,
      attackWindup: 0,
      attackAnimation: 0,
      pendingTargetId: null as number | null,
      moving: false,
      attacking: false,
      facing: { x: 0, y: -1 },
    }
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot(): GameSnapshot {
    return {
      phase: this.phase,
      remainingTime: this.remainingTime,
      countdown: this.countdown,
      lastHits: this.lastHits,
      goal: this.config.goal,
      gold: this.gold,
      combo: this.combo,
      bestCombo: this.bestCombo,
      attacks: this.attacks,
      accuracy: this.attacks ? Math.round((this.lastHits / this.attacks) * 100) : 0,
      selectedTargetId: this.hero.selectedTargetId,
      attackCooldown: this.hero.attackCooldown,
      attackCooldownMax: this.config.hero.attackCooldown,
      bestLastHits: this.progress.bestLastHits,
      bestClearTime: this.progress.bestClearTime,
      muted: this.progress.muted,
    }
  }

  getWorldState(): WorldState {
    this.worldView.phase = this.phase
    this.worldView.hero = this.hero
    this.worldView.minions = this.minions
    this.worldView.turrets = this.turrets
    this.worldView.cursor = this.cursor
    this.worldView.feedback = this.feedback
    this.worldView.elapsed = this.elapsed
    return this.worldView
  }

  markReady() {
    if (this.phase !== 'loading') return
    this.phase = this.progress.tutorialSeen ? 'ready' : 'tutorial'
    this.emit(true)
  }

  completeTutorial() {
    this.progress.tutorialSeen = true
    saveProgress(this.progress)
    this.start()
  }

  start() {
    this.resetMatch()
    this.phase = 'countdown'
    this.emit(true)
  }

  restart() {
    this.start()
  }

  pause() {
    if (this.phase !== 'playing' && this.phase !== 'countdown') return
    this.previousPhase = this.phase
    this.phase = 'paused'
    this.emit(true)
  }

  resume() {
    if (this.phase !== 'paused') return
    this.phase = this.previousPhase
    this.emit(true)
  }

  setMuted(muted: boolean) {
    this.progress.muted = muted
    saveProgress(this.progress)
    this.emit(true)
  }

  dispatchInput(action: InputAction) {
    if (action.type === 'pause') {
      if (this.phase === 'paused') this.resume()
      else this.pause()
      return
    }
    if (this.phase !== 'playing') return

    if (action.type === 'move') {
      const position = { x: clamp(action.position.x, 0.25, 0.75), y: clamp(action.position.y, 0.24, 0.83) }
      this.hero.destination = position
      this.hero.moving = true
      this.hero.selectedTargetId = null
      this.hero.pendingTargetId = null
      this.cursor = { position, age: 0 }
      this.pushFeedback('move', position)
    } else if (action.type === 'selectTarget') {
      const target = this.findEnemy(action.targetId)
      if (!target) return
      this.hero.selectedTargetId = target.id
      this.hero.destination = this.attackPositionFor(target)
      this.hero.moving = distance(this.hero.position, target.position) > this.config.hero.attackRange
      this.tryStartAttack(target)
      this.emit(true)
    } else if (action.type === 'basicAttack') {
      const target = this.pickAttackTarget()
      if (!target) return
      this.hero.selectedTargetId = target.id
      this.hero.destination = this.attackPositionFor(target)
      this.hero.moving = distance(this.hero.position, target.position) > this.config.hero.attackRange
      this.tryStartAttack(target)
      this.emit(true)
    }
  }

  findEnemyAt(position: Vec2, radius = 0.065) {
    let best: Minion | null = null
    let bestDistance = radius
    for (const minion of this.minions) {
      if (!minion.alive || minion.team !== 'red') continue
      const d = distance(position, minion.position)
      if (d < bestDistance) {
        best = minion
        bestDistance = d
      }
    }
    return best
  }

  update(dt: number) {
    const step = Math.min(dt, 0.05)
    if (this.phase === 'paused' || this.phase === 'loading' || this.phase === 'tutorial' || this.phase === 'ready' || this.phase === 'result') return

    this.elapsed += step
    if (this.cursor) {
      this.cursor.age += step
      if (this.cursor.age >= 0.55) this.cursor = null
    }

    if (this.phase === 'countdown') {
      this.countdown -= step
      if (this.countdown <= 0) {
        this.phase = 'playing'
        this.countdown = 0
      }
      this.emit()
      return
    }

    this.remainingTime = Math.max(0, this.remainingTime - step)
    if (this.elapsed >= this.nextWaveAt) {
      this.spawnWave()
      this.nextWaveAt += this.config.waveInterval
    }

    this.updateHero(step)
    this.updateMinions(step)
    this.updateTurrets(step)
    this.removeDeadMinions()

    if (
      this.lastHits >= this.config.goal || 
      this.remainingTime <= 0 || 
      !this.turrets.blue.alive || 
      this.turrets.blue.hp <= 0 ||
      !this.turrets.red.alive ||
      this.turrets.red.hp <= 0
    ) {
      if (!this.turrets.red.alive || this.turrets.red.hp <= 0) {
        this.lastHits = Math.max(this.lastHits, this.config.goal)
      }
      if (this.turrets.blue.hp <= 0) this.turrets.blue.alive = false
      if (this.turrets.red.hp <= 0) this.turrets.red.alive = false
      this.finish()
    }
    this.emit()
  }

  destroy() {
    this.listeners.clear()
  }

  private resetMatch() {
    this.remainingTime = this.config.duration
    this.countdown = 3
    this.elapsed = 0
    this.nextWaveAt = this.config.waveInterval
    this.lastHits = 0
    this.gold = 0
    this.combo = 0
    this.bestCombo = 0
    this.attacks = 0
    this.feedback = null
    this.cursor = null
    this.minions = []
    this.minionById.clear()
    this.hero = this.createHero()
    this.initTurrets()
    this.worldView.turrets = this.turrets
    this.spawnWave()
  }

  private spawnWave() {
    const formation = [
      { x: -0.12, kind: 'melee' as const },
      { x: 0, kind: 'melee' as const },
      { x: 0.12, kind: 'melee' as const },
      { x: -0.115, kind: 'ranged' as const },
      { x: 0, kind: 'ranged' as const },
      { x: 0.115, kind: 'ranged' as const },
    ]
    for (const team of ['blue', 'red'] as Team[]) {
      for (let i = 0; i < formation.length; i += 1) {
        const slot = formation[i]
        const melee = slot.kind === 'melee'
        const baseY = team === 'blue' ? 0.62 : 0.32
        const rowOffset = melee ? 0 : team === 'blue' ? 0.072 : -0.072
        const hp = melee ? this.config.minions.meleeHp : this.config.minions.rangedHp
        const minion: Minion = {
          id: this.entityId++,
          team,
          kind: slot.kind,
          position: { x: 0.5 + slot.x, y: baseY + rowOffset },
          hp,
          maxHp: hp,
          attackCooldown: 0.25 + i * 0.11,
          targetId: null,
          alive: true,
          spawnIndex: this.entityId,
          facing: { x: 0, y: team === 'blue' ? -1 : 1 },
          moving: false,
          attackAnimation: 0,
          formationOffset: slot.x,
        }
        this.minions.push(minion)
        this.minionById.set(minion.id, minion)
      }
    }
    if (this.minions.length > 30) {
      const removed = this.minions.splice(0, this.minions.length - 30)
      for (const minion of removed) this.minionById.delete(minion.id)
    }
  }

  private updateHero(dt: number) {
    this.hero.attackCooldown = Math.max(0, this.hero.attackCooldown - dt)
    this.hero.attackAnimation = Math.max(0, this.hero.attackAnimation - dt)
    if (this.hero.attackWindup > 0) {
      this.hero.attackWindup -= dt
      this.hero.attacking = true
      if (this.hero.attackWindup <= 0) this.resolveHeroAttack()
      return
    }
    this.hero.attacking = false

    const selected = this.findEnemy(this.hero.selectedTargetId)
    if (selected) this.hero.destination = this.attackPositionFor(selected)
    const remaining = distance(this.hero.position, this.hero.destination)
    if (remaining > 0.006) {
      this.hero.facing.x = (this.hero.destination.x - this.hero.position.x) / remaining
      this.hero.facing.y = (this.hero.destination.y - this.hero.position.y) / remaining
      const amount = Math.min(remaining, this.config.hero.moveSpeed * dt)
      this.hero.position.x += ((this.hero.destination.x - this.hero.position.x) / remaining) * amount
      this.hero.position.y += ((this.hero.destination.y - this.hero.position.y) / remaining) * amount
      this.hero.moving = true
    } else {
      this.hero.moving = false
    }
    if (selected && distance(this.hero.position, selected.position) <= this.config.hero.attackRange) this.tryStartAttack(selected)
  }

  private updateMinions(dt: number) {
    for (const minion of this.minions) {
      if (!minion.alive) continue
      minion.attackCooldown = Math.max(0, minion.attackCooldown - dt)
      minion.attackAnimation = Math.max(0, minion.attackAnimation - dt)
      minion.moving = false
      let target = this.findTarget(minion.targetId)
      if (!target || target.team === minion.team) {
        const nearestMinion = this.nearestOpponent(minion)
        if (nearestMinion) {
          target = nearestMinion
          minion.targetId = nearestMinion.id
        } else {
          const opponentTurret = minion.team === 'blue' ? this.turrets.red : this.turrets.blue
          if (opponentTurret.alive) {
            target = opponentTurret
            minion.targetId = opponentTurret.id
          } else {
            target = null
            minion.targetId = null
          }
        }
      }
      if (!target) continue
      const range = minion.kind === 'melee' ? this.config.minions.meleeRange : this.config.minions.rangedRange
      const d = distance(minion.position, target.position)
      if (d > range) {
        minion.facing.x = (target.position.x - minion.position.x) / d
        minion.facing.y = (target.position.y - minion.position.y) / d
        minion.moving = true
        const speed = this.config.minions.moveSpeed * dt
        minion.position.x += ((target.position.x - minion.position.x) / d) * Math.min(speed, d)
        minion.position.y += ((target.position.y - minion.position.y) / d) * Math.min(speed, d)
      } else if (minion.attackCooldown <= 0) {
        minion.facing.x = (target.position.x - minion.position.x) / Math.max(d, 0.001)
        minion.facing.y = (target.position.y - minion.position.y) / Math.max(d, 0.001)
        const damage = minion.kind === 'melee' ? this.config.minions.meleeDamage : this.config.minions.rangedDamage
        target.hp -= damage
        minion.attackCooldown = minion.kind === 'melee' ? this.config.minions.meleeCooldown : this.config.minions.rangedCooldown
        minion.attackAnimation = 0.24
        if (target.hp <= 0) {
          target.alive = false
          target.hp = 0
          if (target.team === 'red' && target.id > 0) {
            this.combo = 0
            this.pushFeedback('miss', target.position)
          }
        }
      }
    }
    this.applyMinionSeparation()
  }

  private applyMinionSeparation() {
    const minimumGap = 0.078
    for (let i = 0; i < this.minions.length; i += 1) {
      const first = this.minions[i]
      if (!first.alive) continue
      for (let j = i + 1; j < this.minions.length; j += 1) {
        const second = this.minions[j]
        if (!second.alive || first.team !== second.team) continue
        const dx = second.position.x - first.position.x
        const dy = second.position.y - first.position.y
        const currentGap = Math.hypot(dx, dy)
        if (currentGap >= minimumGap) continue
        const safeGap = Math.max(currentGap, 0.001)
        const push = (minimumGap - currentGap) * 0.5
        const nx = currentGap < 0.001 ? (first.id % 2 ? 1 : -1) : dx / safeGap
        const ny = currentGap < 0.001 ? 0 : dy / safeGap
        first.position.x = clamp(first.position.x - nx * push, 0.31, 0.69)
        first.position.y = clamp(first.position.y - ny * push, 0.24, 0.78)
        second.position.x = clamp(second.position.x + nx * push, 0.31, 0.69)
        second.position.y = clamp(second.position.y + ny * push, 0.24, 0.78)
      }
    }
  }

  private removeDeadMinions() {
    let writeIndex = 0
    for (let readIndex = 0; readIndex < this.minions.length; readIndex += 1) {
      const minion = this.minions[readIndex]
      if (minion.alive) {
        this.minions[writeIndex++] = minion
      } else {
        this.minionById.delete(minion.id)
      }
    }
    this.minions.length = writeIndex
  }

  private tryStartAttack(target: Minion) {
    if (this.hero.attackCooldown > 0 || this.hero.attackWindup > 0) return
    if (distance(this.hero.position, target.position) > this.config.hero.attackRange) return
    this.hero.attackWindup = this.config.hero.attackWindup
    this.hero.attackAnimation = 0.42
    const d = Math.max(distance(this.hero.position, target.position), 0.001)
    this.hero.facing.x = (target.position.x - this.hero.position.x) / d
    this.hero.facing.y = (target.position.y - this.hero.position.y) / d
    this.hero.pendingTargetId = target.id
    this.hero.attacking = true
    this.attacks += 1
    this.pushFeedback('attack', target.position)
  }

  private resolveHeroAttack() {
    const target = this.findEnemy(this.hero.pendingTargetId)
    this.hero.pendingTargetId = null
    this.hero.attackCooldown = this.config.hero.attackCooldown
    this.hero.attacking = false
    if (!target || distance(this.hero.position, target.position) > this.config.hero.attackRange * 1.35) return
    target.hp -= this.config.hero.attackDamage
    if (target.hp <= 0) {
      target.hp = 0
      target.alive = false
      this.lastHits += 1
      this.gold += this.config.goldPerLastHit
      this.combo += 1
      this.bestCombo = Math.max(this.bestCombo, this.combo)
      this.hero.selectedTargetId = null
      this.pushFeedback('lastHit', target.position, this.config.goldPerLastHit)
      this.emit(true)
    }
  }

  private attackPositionFor(target: Minion): Vec2 {
    const d = distance(this.hero.position, target.position)
    if (d <= this.config.hero.attackRange * 0.88) return { ...this.hero.position }
    const ratio = (d - this.config.hero.attackRange * 0.82) / d
    return {
      x: clamp(this.hero.position.x + (target.position.x - this.hero.position.x) * ratio, 0.28, 0.72),
      y: clamp(this.hero.position.y + (target.position.y - this.hero.position.y) * ratio, 0.26, 0.82),
    }
  }

  private pickAttackTarget() {
    const selected = this.findEnemy(this.hero.selectedTargetId)
    if (selected && distance(this.hero.position, selected.position) <= this.config.hero.targetSearchRange) return selected
    let best: Minion | null = null
    for (const minion of this.minions) {
      if (!minion.alive || minion.team !== 'red') continue
      if (distance(this.hero.position, minion.position) > this.config.hero.targetSearchRange) continue
      if (!best || minion.hp < best.hp) best = minion
    }
    return best
  }

  private nearestOpponent(source: Minion) {
    let best: Minion | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const candidate of this.minions) {
      if (!candidate.alive || candidate.team === source.team) continue
      const d = distance(source.position, candidate.position)
      if (d < bestDistance) {
        best = candidate
        bestDistance = d
      }
    }
    return best
  }

  private findEnemy(id: number | null) {
    const minion = this.findMinion(id)
    return minion?.team === 'red' ? minion : null
  }

  private initTurrets() {
    this.turrets = {
      blue: {
        id: -1,
        team: 'blue',
        position: { x: 0.5, y: 0.9 },
        hp: this.config.turrets.maxHp,
        maxHp: this.config.turrets.maxHp,
        alive: true,
        attackCooldown: 0,
        targetId: null,
        laserActive: false,
        laserTimer: 0,
        lastTargetPosition: null,
      },
      red: {
        id: -2,
        team: 'red',
        position: { x: 0.5, y: 0.11 },
        hp: this.config.turrets.maxHp,
        maxHp: this.config.turrets.maxHp,
        alive: true,
        attackCooldown: 0,
        targetId: null,
        laserActive: false,
        laserTimer: 0,
        lastTargetPosition: null,
      },
    }
  }

  private findTarget(id: number | null) {
    if (id === null) return null
    if (id === -1) return this.turrets.blue.alive ? this.turrets.blue : null
    if (id === -2) return this.turrets.red.alive ? this.turrets.red : null
    const minion = this.minionById.get(id)
    return minion?.alive ? minion : null
  }

  private findFirstEnemyInRange(turret: Turret): Minion | null {
    for (const minion of this.minions) {
      if (!minion.alive || minion.team === turret.team) continue
      if (distance(turret.position, minion.position) <= this.config.turrets.attackRange) {
        return minion
      }
    }
    return null
  }

  private updateTurrets(dt: number) {
    for (const team of ['blue', 'red'] as Team[]) {
      const turret = team === 'blue' ? this.turrets.blue : this.turrets.red
      if (!turret.alive) continue

      turret.attackCooldown = Math.max(0, turret.attackCooldown - dt)

      if (turret.laserActive) {
        turret.laserTimer -= dt
        if (turret.laserTimer <= 0) {
          turret.laserActive = false
          turret.lastTargetPosition = null
        }
      }

      let target = this.findMinion(turret.targetId)
      if (
        !target || 
        !target.alive || 
        target.team === turret.team || 
        distance(turret.position, target.position) > this.config.turrets.attackRange
      ) {
        target = this.findFirstEnemyInRange(turret)
        turret.targetId = target?.id ?? null
      }

      if (target && turret.attackCooldown <= 0) {
        const isMelee = target.kind === 'melee'
        const ratio = isMelee ? this.config.turrets.attackDamageMeleeRatio : this.config.turrets.attackDamageRangedRatio
        const damage = Math.round(target.maxHp * ratio)

        target.hp = Math.max(0, target.hp - damage)
        turret.attackCooldown = this.config.turrets.attackCooldown

        turret.laserActive = true
        turret.laserTimer = 0.18
        turret.lastTargetPosition = { ...target.position }

        if (target.hp <= 0) {
          target.alive = false
          target.hp = 0
          if (target.team === 'red') {
            this.combo = 0
            this.pushFeedback('miss', target.position)
          }
        }
      }
    }
  }

  private findMinion(id: number | null) {
    if (id === null) return null
    const minion = this.minionById.get(id)
    return minion?.alive ? minion : null
  }

  private pushFeedback(type: FeedbackEvent['type'], position: Vec2, value?: number) {
    this.feedback = { id: this.eventId++, type, position: { ...position }, value }
  }

  private finish() {
    this.phase = 'result'
    this.progress.bestLastHits = Math.max(this.progress.bestLastHits, this.lastHits)
    if (this.lastHits >= this.config.goal) {
      const clearTime = this.config.duration - this.remainingTime
      this.progress.bestClearTime = this.progress.bestClearTime === null ? clearTime : Math.min(this.progress.bestClearTime, clearTime)
    }
    saveProgress(this.progress)
    this.emit(true)
  }

  private emit(force = false) {
    if (!force && this.elapsed - this.lastEmitAt < 0.08) return
    this.lastEmitAt = this.elapsed
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}
