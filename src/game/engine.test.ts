import { beforeEach, describe, expect, it } from 'vitest'
import { GAME_CONFIG } from './config'
import { GameEngine } from './engine'

function advance(engine: GameEngine, seconds: number) {
  const steps = Math.ceil(seconds * 60)
  for (let i = 0; i < steps; i += 1) engine.update(1 / 60)
}

function enterMatch(engine: GameEngine) {
  engine.markReady()
  engine.completeTutorial()
  advance(engine, 3.1)
}

describe('GameEngine', () => {
  beforeEach(() => localStorage.clear())

  it('moves through tutorial, countdown and active play', () => {
    const engine = new GameEngine()
    engine.markReady()
    expect(engine.getSnapshot().phase).toBe('tutorial')
    engine.completeTutorial()
    expect(engine.getSnapshot().phase).toBe('countdown')
    advance(engine, 3.1)
    expect(engine.getSnapshot().phase).toBe('playing')
    expect(engine.getWorldState().minions).toHaveLength(12)
    const blueFrontLine = engine.getWorldState().minions
      .filter((minion) => minion.team === 'blue' && minion.kind === 'melee')
      .map((minion) => minion.position.x)
      .sort((a, b) => a - b)
    expect(blueFrontLine[1] - blueFrontLine[0]).toBeGreaterThan(0.09)
    expect(blueFrontLine[2] - blueFrontLine[1]).toBeGreaterThan(0.09)
  })

  it('attributes gold and score only when the hero lands the final hit', () => {
    const engine = new GameEngine()
    enterMatch(engine)
    const target = engine.getWorldState().minions.find((minion) => minion.team === 'red')!
    target.hp = 20
    engine.getWorldState().hero.position = { ...target.position }
    engine.dispatchInput({ type: 'selectTarget', targetId: target.id })
    advance(engine, GAME_CONFIG.hero.attackWindup + 0.05)
    const snapshot = engine.getSnapshot()
    expect(snapshot.lastHits).toBe(1)
    expect(snapshot.gold).toBe(21)
    expect(snapshot.combo).toBe(1)
    expect(snapshot.accuracy).toBe(100)
  })

  it('keeps allied minions separated while they move and fight', () => {
    const engine = new GameEngine()
    enterMatch(engine)
    const allies = engine.getWorldState().minions.filter((minion) => minion.team === 'blue')
    allies[1].position = { ...allies[0].position }
    engine.update(1 / 60)
    const gap = Math.hypot(
      allies[1].position.x - allies[0].position.x,
      allies[1].position.y - allies[0].position.y,
    )
    expect(gap).toBeGreaterThan(0.075)
  })

  it('stops the timer while paused and resets match state on restart', () => {
    const engine = new GameEngine()
    enterMatch(engine)
    advance(engine, 1)
    engine.pause()
    const pausedAt = engine.getSnapshot().remainingTime
    advance(engine, 4)
    expect(engine.getSnapshot().remainingTime).toBe(pausedAt)
    engine.restart()
    expect(engine.getSnapshot().remainingTime).toBe(180)
    expect(engine.getSnapshot().lastHits).toBe(0)
    expect(engine.getWorldState().minions).toHaveLength(12)
  })

  it('finishes when time expires', () => {
    const engine = new GameEngine({ ...GAME_CONFIG, duration: 0.2 })
    enterMatch(engine)
    advance(engine, 0.3)
    expect(engine.getSnapshot().phase).toBe('result')
  })

  it('initializes turrets and updates turret targeting and damage', () => {
    const engine = new GameEngine()
    enterMatch(engine)
    const state = engine.getWorldState()
    expect(state.turrets.blue.alive).toBe(true)
    expect(state.turrets.red.alive).toBe(true)
    expect(state.turrets.blue.hp).toBe(1000)

    const redMinion = state.minions.find((minion) => minion.team === 'red')!
    redMinion.position = { x: 0.5, y: 0.88 }
    const prevHp = redMinion.hp

    engine.update(1 / 60)
    expect(state.turrets.blue.targetId).toBe(redMinion.id)
    expect(redMinion.hp).toBeLessThan(prevHp)
    expect(state.turrets.blue.laserActive).toBe(true)
  })

  it('ends game when blue turret is destroyed', () => {
    const engine = new GameEngine()
    enterMatch(engine)
    const state = engine.getWorldState()
    state.turrets.blue.hp = 0
    engine.update(1 / 60)
    expect(engine.getSnapshot().phase).toBe('result')
  })
})
