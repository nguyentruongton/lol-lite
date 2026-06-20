import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js'
import type { GameEngine } from './engine'
import type { FeedbackEvent, Minion, Vec2 } from './types'

const ASSETS = {
  map: '/assets/game/lane-master.webp',
  heroSheet: '/assets/game/hero-sheet.webp',
  blueMinionSheet: '/assets/game/minion-blue-sheet.webp',
  redMinionSheet: '/assets/game/minion-red-sheet.webp',
  blueTurret: '/assets/game/turret-blue.webp',
  redTurret: '/assets/game/turret-red.webp',
}

const BLUE_TURRET_POSITION = { x: 0.5, y: 0.9 }
const RED_TURRET_POSITION = { x: 0.5, y: 0.11 }

interface EntityView {
  root: Container
  shadow: Graphics
  sprite: Sprite
  health: Graphics
  selection: Graphics
  lastHp: number
  lastSelected: boolean
  lastUnit: number
}

interface ActiveEffect {
  root: Container
  age: number
  duration: number
  type: FeedbackEvent['type']
}

type AnimationAction = 'idle' | 'run' | 'attack'
type FacingDirection = 'up' | 'down'
type FrameSet = Record<FacingDirection, Record<AnimationAction, Texture>>

export class GameRenderer {
  private readonly app = new Application()
  private readonly world = new Container()
  private readonly entityLayer = new Container()
  private readonly effectLayer = new Container()
  private readonly minionViews = new Map<number, EntityView>()
  private readonly activeMinionIds = new Set<number>()
  private readonly projectedPoint: Vec2 = { x: 0, y: 0 }
  private readonly effects: ActiveEffect[] = []
  private readonly engine: GameEngine
  private readonly host: HTMLElement
  private readonly onReady: () => void
  private background!: Sprite
  private heroView!: EntityView
  private blueTurret!: Sprite
  private redTurret!: Sprite
  private blueTurretHealth = new Graphics()
  private redTurretHealth = new Graphics()
  private laserGraphics = new Graphics()
  private cursor = new Container()
  private cursorArrows: Graphics[] = []
  private cursorRing = new Graphics()
  private cursorDot = new Graphics()
  private textures!: Record<keyof typeof ASSETS, Texture>
  private heroFrames!: FrameSet
  private blueMinionFrames!: FrameSet
  private redMinionFrames!: FrameSet
  private resizeObserver: ResizeObserver | null = null
  private width = 1
  private height = 1
  private lastFeedbackId = 0
  private accumulator = 0
  private destroyed = false

  constructor(host: HTMLElement, engine: GameEngine, onReady: () => void) {
    this.host = host
    this.engine = engine
    this.onReady = onReady
  }

  async init() {
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
    const lowPowerDevice = coarsePointer && deviceMemory <= 4
    const maximumResolution = lowPowerDevice ? 1.25 : coarsePointer ? 1.5 : 2
    await this.app.init({
      antialias: !lowPowerDevice,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: import.meta.env.DEV ? 1 : Math.min(window.devicePixelRatio || 1, maximumResolution),
      preference: 'webgl',
      preserveDrawingBuffer: import.meta.env.DEV,
    })
    if (this.destroyed) return
    this.app.canvas.className = 'game-canvas'
    this.host.appendChild(this.app.canvas)

    const entries = await Promise.all(
      Object.entries(ASSETS).map(async ([key, src]) => [key, await Assets.load<Texture>(src)] as const),
    )
    if (this.destroyed) return
    this.textures = Object.fromEntries(entries) as Record<keyof typeof ASSETS, Texture>
    this.heroFrames = this.createFrameSet(this.textures.heroSheet)
    this.blueMinionFrames = this.createFrameSet(this.textures.blueMinionSheet)
    this.redMinionFrames = this.createFrameSet(this.textures.redMinionSheet)
    this.buildScene()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.host)
    this.resize()
    this.app.ticker.add(this.tick)
    this.app.ticker.start()
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.onReady()
  }

  destroy() {
    this.destroyed = true
    this.resizeObserver?.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.app.ticker.remove(this.tick)
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false })
  }

  private buildScene() {
    this.background = new Sprite(this.textures.map)
    this.background.anchor.set(0.5)
    this.world.addChild(this.background)

    this.blueTurret = this.makeSprite(this.textures.blueTurret)
    this.redTurret = this.makeSprite(this.textures.redTurret)
    this.world.addChild(
      this.blueTurret, 
      this.redTurret, 
      this.blueTurretHealth, 
      this.redTurretHealth, 
      this.laserGraphics, 
      this.entityLayer, 
      this.effectLayer
    )

    this.heroView = this.createEntityView(this.heroFrames.up.idle)
    this.entityLayer.addChild(this.heroView.root)
    this.cursor = this.createCursor()
    this.effectLayer.addChild(this.cursor)
    this.app.stage.addChild(this.world)
  }

  private makeSprite(texture: Texture) {
    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5)
    return sprite
  }

  private createEntityView(texture: Texture): EntityView {
    const root = new Container()
    const shadow = new Graphics().ellipse(0, 0, 34, 13).fill({ color: 0x02090b, alpha: 0.46 })
    const sprite = this.makeSprite(texture)
    const health = new Graphics()
    const selection = new Graphics()
    root.addChild(shadow, selection, sprite, health)
    return { root, shadow, sprite, health, selection, lastHp: -1, lastSelected: false, lastUnit: -1 }
  }

  private createFrameSet(sheet: Texture): FrameSet {
    const frameWidth = sheet.width / 3
    const frameHeight = sheet.height / 2
    const frame = (column: number, row: number) => new Texture({
      source: sheet.source,
      frame: new Rectangle(column * frameWidth, row * frameHeight, frameWidth, frameHeight),
    })
    return {
      up: { idle: frame(0, 0), run: frame(1, 0), attack: frame(2, 0) },
      down: { idle: frame(0, 1), run: frame(1, 1), attack: frame(2, 1) },
    }
  }

  private createCursor() {
    const root = new Container()
    this.cursorArrows = []
    for (let i = 0; i < 4; i += 1) {
      const arrow = new Graphics()
        .poly([0, -7, 4.5, 1.5, 0, -0.5, -4.5, 1.5])
        .fill({ color: 0x68e8ff, alpha: 0.94 })
        .stroke({ color: 0xd2faff, alpha: 0.9, width: 1 })
      this.cursorArrows.push(arrow)
      root.addChild(arrow)
    }
    this.cursorRing = new Graphics().circle(0, 0, 7).stroke({ color: 0x5be2ff, alpha: 0.8, width: 1.5 })
    this.cursorDot = new Graphics().circle(0, 0, 2.6).fill({ color: 0xd4fbff }).stroke({ color: 0x0b8fb8, width: 1 })
    root.addChild(this.cursorRing, this.cursorDot)
    root.visible = false
    return root
  }

  private readonly tick = () => {
    const deltaSeconds = Math.min(this.app.ticker.deltaMS / 1000, 0.1)
    this.accumulator += deltaSeconds
    while (this.accumulator >= 1 / 60) {
      this.engine.update(1 / 60)
      this.accumulator -= 1 / 60
    }
    this.renderWorld(deltaSeconds)
  }

  private readonly onVisibilityChange = () => {
    if (document.hidden) this.app.ticker.stop()
    else this.app.ticker.start()
  }

  private renderWorld(dt: number) {
    const world = this.engine.getWorldState()
    const unit = Math.min(this.width, this.height)

    this.blueTurret.visible = world.turrets.blue.alive
    this.blueTurret.alpha = world.turrets.blue.alive ? 1 : 0
    this.redTurret.visible = world.turrets.red.alive
    this.redTurret.alpha = world.turrets.red.alive ? 1 : 0

    this.drawTurretHealth(this.blueTurretHealth, world.turrets.blue, unit, true)
    this.drawTurretHealth(this.redTurretHealth, world.turrets.red, unit, false)

    this.laserGraphics.clear()
    if (world.turrets.blue.laserActive && world.turrets.blue.lastTargetPosition) {
      this.drawLaserBeam(
        world.turrets.blue.position,
        world.turrets.blue.lastTargetPosition,
        0x36cdef,
        world.turrets.blue.laserTimer / 0.18
      )
    }
    if (world.turrets.red.laserActive && world.turrets.red.lastTargetPosition) {
      this.drawLaserBeam(
        world.turrets.red.position,
        world.turrets.red.lastTargetPosition,
        0xec3b3b,
        world.turrets.red.laserTimer / 0.18
      )
    }
    const heroPoint = this.worldToScreen(world.hero.position)
    const heroAction: AnimationAction = world.hero.attackAnimation > 0 ? 'attack' : world.hero.moving ? 'run' : 'idle'
    this.applyAnimation(this.heroView, this.heroFrames, heroAction, world.hero.facing, unit * 0.31)
    this.updateEntityPosition(this.heroView, heroPoint)
    this.heroView.root.y += world.hero.moving ? Math.abs(Math.sin(world.elapsed * 14)) * -unit * 0.005 : Math.sin(world.elapsed * 3) * unit * 0.0015
    this.heroView.sprite.rotation = world.hero.moving ? world.hero.facing.x * 0.035 : 0
    if (world.hero.attackAnimation > 0) {
      const t = world.hero.attackAnimation / 0.42
      const punch = 1 + Math.sin(t * Math.PI) * 0.08
      const baseWidth = unit * 0.31
      this.heroView.sprite.width = baseWidth * punch
      this.heroView.sprite.scale.y = Math.abs(this.heroView.sprite.scale.x)
      if (world.hero.facing.x < -0.06) this.heroView.sprite.scale.x = -Math.abs(this.heroView.sprite.scale.x)
    }
    if (this.heroView.lastUnit !== unit) {
      this.drawHeroHealth(this.heroView.health, unit)
      this.heroView.lastUnit = unit
    }

    const livingIds = this.activeMinionIds
    livingIds.clear()
    for (const minion of world.minions) {
      livingIds.add(minion.id)
      let view = this.minionViews.get(minion.id)
      if (!view) {
        const initialFrames = minion.team === 'blue' ? this.blueMinionFrames : this.redMinionFrames
        view = this.createEntityView(initialFrames.up.idle)
        this.minionViews.set(minion.id, view)
        this.entityLayer.addChild(view.root)
      }
      const point = this.worldToScreen(minion.position)
      const action: AnimationAction = minion.attackAnimation > 0 ? 'attack' : minion.moving ? 'run' : 'idle'
      const frames = minion.team === 'blue' ? this.blueMinionFrames : this.redMinionFrames
      const minionWidth = unit * (minion.kind === 'melee' ? 0.145 : 0.135)
      this.applyAnimation(view, frames, action, minion.facing, minionWidth)
      this.updateEntityPosition(view, point)
      view.root.y += minion.moving
        ? Math.abs(Math.sin(world.elapsed * 15 + minion.id)) * -unit * 0.003
        : Math.sin(world.elapsed * 4 + minion.id) * unit * 0.0008
      view.sprite.rotation = minion.moving ? minion.facing.x * 0.025 : 0
      if (minion.attackAnimation > 0) {
        const t = minion.attackAnimation / 0.24
        const punch = 1 + Math.sin(t * Math.PI) * 0.09
        view.sprite.width = minionWidth * punch
        view.sprite.scale.y = Math.abs(view.sprite.scale.x)
      }
      const selected = world.hero.selectedTargetId === minion.id
      if (view.lastHp !== minion.hp || view.lastSelected !== selected || view.lastUnit !== unit) {
        this.drawMinionHealth(view, minion, unit, selected)
        view.lastHp = minion.hp
        view.lastSelected = selected
        view.lastUnit = unit
      }
    }
    for (const [id, view] of this.minionViews) {
      if (livingIds.has(id)) continue
      view.root.destroy({ children: true })
      this.minionViews.delete(id)
    }

    this.updateCursor(world.cursor, unit)
    const feedback = world.feedback
    if (feedback && feedback.id !== this.lastFeedbackId) {
      this.lastFeedbackId = feedback.id
      if (feedback.type !== 'move') this.spawnEffect(feedback, unit)
    }
    this.updateEffects(dt)
    this.entityLayer.children.sort((a, b) => a.y - b.y)
  }

  private applyAnimation(view: EntityView, frames: FrameSet, action: AnimationAction, facing: Vec2, width: number) {
    const direction: FacingDirection = facing.y > 0.08 ? 'down' : 'up'
    view.sprite.texture = frames[direction][action]
    view.sprite.width = width
    view.sprite.scale.y = Math.abs(view.sprite.scale.x)
    view.sprite.scale.x = (facing.x < -0.06 ? -1 : 1) * Math.abs(view.sprite.scale.x)
    view.shadow.width = width * 0.42
    view.shadow.height = width * 0.12
    view.shadow.y = width * 0.2
  }

  private updateEntityPosition(view: EntityView, point: Vec2) {
    view.root.position.set(point.x, point.y)
  }

  private drawHeroHealth(graphics: Graphics, unit: number) {
    const width = unit * 0.18
    const height = Math.max(7, unit * 0.012)
    const y = -unit * 0.11
    graphics.clear().roundRect(-width / 2 - 3, y - 3, width + 6, height + 6, 3).fill(0x071112)
    graphics.rect(-width / 2, y, width, height).fill(0x28bf55)
    graphics.rect(-width / 2, y, width, height * 0.25).fill({ color: 0x9bf77e, alpha: 0.7 })
    graphics.stroke({ color: 0xc6a75d, width: 1.5 })
  }

  private drawMinionHealth(view: EntityView, minion: Minion, unit: number, selected: boolean) {
    const width = unit * 0.105
    const height = Math.max(4, unit * 0.007)
    const ratio = Math.max(0, minion.hp / minion.maxHp)
    const y = -unit * 0.075
    view.health.clear().roundRect(-width / 2 - 2, y - 2, width + 4, height + 4, 2).fill(0x071112)
    view.health.rect(-width / 2, y, width * ratio, height).fill(minion.team === 'blue' ? 0x36cdef : 0xec3b3b)
    view.health.rect(-width / 2, y, width * ratio, height * 0.25).fill({ color: 0xffffff, alpha: 0.32 })
    view.selection.clear()
    if (selected) {
      view.selection.ellipse(0, unit * 0.023, width * 0.7, height * 2.7).stroke({ color: 0xf6c94b, width: 2.5, alpha: 0.95 })
    }
  }

  private updateCursor(cursor: { position: Vec2; age: number } | null, unit: number) {
    if (!cursor) {
      this.cursor.visible = false
      return
    }
    const point = this.worldToScreen(cursor.position)
    this.cursor.visible = true
    this.cursor.position.set(point.x, point.y)
    const progress = Math.min(1, cursor.age / 0.55)
    const arrival = Math.min(1, progress / 0.34)
    const easedArrival = 1 - Math.pow(1 - arrival, 3)
    const radius = 23 - easedArrival * 9 + Math.sin(progress * Math.PI) * 1.5
    const fade = Math.max(0, 1 - Math.max(0, progress - 0.68) / 0.32)
    for (let i = 0; i < this.cursorArrows.length; i += 1) {
      const angle = (Math.PI / 2) * i
      const arrow = this.cursorArrows[i]
      arrow.position.set(Math.sin(angle) * radius, -Math.cos(angle) * radius)
      arrow.rotation = angle + Math.sin(progress * Math.PI) * 0.055
      arrow.scale.set(0.72 + easedArrival * 0.28)
      arrow.alpha = fade
    }
    this.cursorRing.scale.set(0.7 + progress * 1.05)
    this.cursorRing.alpha = Math.max(0, 0.9 - progress)
    this.cursorDot.scale.set(0.85 + Math.sin(progress * Math.PI) * 0.18)
    this.cursorDot.alpha = fade
    this.cursor.scale.set(unit / 620)
    this.cursor.alpha = fade
  }

  private spawnEffect(feedback: FeedbackEvent, unit: number) {
    const root = new Container()
    const point = this.worldToScreen(feedback.position)
    root.position.set(point.x, point.y)
    if (feedback.type === 'lastHit') {
      const text = new Text({
        text: `+${feedback.value ?? 21} ◈`,
        style: { fontFamily: 'Trebuchet MS, sans-serif', fontSize: Math.max(18, unit * 0.04), fontWeight: '800', fill: 0xffd75a, stroke: { color: 0x3a1c05, width: 5 } },
      })
      text.anchor.set(0.5)
      root.addChild(text)
    } else if (feedback.type === 'attack') {
      root.addChild(
        new Graphics()
          .poly([-unit * 0.05, unit * 0.025, unit * 0.045, -unit * 0.03, unit * 0.018, unit * 0.004])
          .fill({ color: 0xc8f8ff, alpha: 0.74 })
          .stroke({ color: 0x39cfff, alpha: 0.95, width: 2 }),
      )
    } else {
      const text = new Text({ text: 'MISS', style: { fontFamily: 'Trebuchet MS, sans-serif', fontSize: Math.max(12, unit * 0.025), fontWeight: '800', fill: 0xa9b6b8 } })
      text.anchor.set(0.5)
      root.addChild(text)
    }
    this.effectLayer.addChild(root)
    this.effects.push({ root, age: 0, duration: feedback.type === 'attack' ? 0.24 : 0.72, type: feedback.type })
  }

  private updateEffects(dt: number) {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i]
      effect.age += dt
      const progress = effect.age / effect.duration
      effect.root.alpha = Math.max(0, 1 - progress)
      if (effect.type !== 'attack') effect.root.y -= dt * 42
      else effect.root.scale.set(1 + progress * 1.25)
      if (effect.age >= effect.duration) {
        effect.root.destroy({ children: true })
        this.effects.splice(i, 1)
      }
    }
  }

  private resize() {
    const rect = this.host.getBoundingClientRect()
    this.width = Math.max(1, Math.round(rect.width))
    this.height = Math.max(1, Math.round(rect.height))
    this.app.renderer.resize(this.width, this.height)

    const cover = Math.max(this.width / this.background.texture.width, this.height / this.background.texture.height)
    this.background.scale.set(cover)
    this.background.position.set(this.width / 2, this.height / 2)

    const unit = Math.min(this.width, this.height)
    this.placeTurret(this.blueTurret, BLUE_TURRET_POSITION, unit * 0.43)
    this.placeTurret(this.redTurret, RED_TURRET_POSITION, unit * 0.43)
  }

  private drawTurretHealth(graphics: Graphics, turret: any, unit: number, isBlue: boolean) {
    if (!turret.alive) {
      graphics.clear()
      return
    }
    const width = unit * 0.22
    const height = Math.max(8, unit * 0.014)
    const ratio = Math.max(0, turret.hp / turret.maxHp)
    
    const point = this.worldToScreen(turret.position)
    const yOffset = -unit * 0.19
    const y = point.y + yOffset
    const x = point.x

    graphics.clear()
      .roundRect(x - width / 2 - 3, y - 3, width + 6, height + 6, 3)
      .fill(0x071112)
      .rect(x - width / 2, y, width * ratio, height)
      .fill(isBlue ? 0x2c9cf0 : 0xec3b3b)
      .rect(x - width / 2, y, width * ratio, height * 0.25)
      .fill({ color: 0xffffff, alpha: 0.32 })
      .stroke({ color: 0xc6a75d, width: 1.5 })
  }

  private drawLaserBeam(from: Vec2, to: Vec2, color: number, progressRatio: number) {
    const startPoint = this.worldToScreen(from)
    const endPoint = this.worldToScreen(to)
    
    const unit = Math.min(this.width, this.height)
    const turretTopY = startPoint.y - unit * 0.08
    const alpha = Math.min(1, progressRatio * 1.5)
    const width = 3 + progressRatio * 4

    this.laserGraphics.moveTo(startPoint.x, turretTopY)
      .lineTo(endPoint.x, endPoint.y)
      .stroke({ color, width, alpha })
      
    this.laserGraphics.moveTo(startPoint.x, turretTopY)
      .lineTo(endPoint.x, endPoint.y)
      .stroke({ color: 0xffffff, width: width * 0.4, alpha: alpha * 0.9 })
  }

  private placeTurret(sprite: Sprite, position: Vec2, width: number) {
    const point = this.worldToScreen(position)
    sprite.position.set(point.x, point.y)
    sprite.width = width
    sprite.scale.y = sprite.scale.x
  }

  private worldToScreen(position: Vec2, out: Vec2 = this.projectedPoint): Vec2 {
    const portrait = this.height > this.width
    if (portrait) {
      const padY = this.height * 0.15
      out.x = position.x * this.width
      out.y = padY + position.y * (this.height - 2 * padY)
      return out
    }
    out.x = this.width / 2 + (position.x - 0.5) * this.height * 1.08
    out.y = position.y * this.height
    return out
  }
}
