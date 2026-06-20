import { memo, useEffect, useRef } from 'react'
import type { GameEngine } from '../game/engine'
import { screenToWorld } from '../game/coordinates'
import { isGameCommandPointer, pointerHitRadius, shouldUseHaptics } from '../game/input'

interface GameSurfaceProps {
  engine: GameEngine
  onReady: () => void
}

export const GameSurface = memo(function GameSurface({ engine, onReady }: GameSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let renderer: import('../game/renderer').GameRenderer | null = null
    void import('../game/renderer').then(async ({ GameRenderer }) => {
      if (disposed) return
      renderer = new GameRenderer(host, engine, onReady)
      await renderer.init()
    })

    const toWorld = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      return screenToWorld(event.clientX, event.clientY, rect)
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!isGameCommandPointer(event.pointerType, event.button, event.isPrimary)) return
      const point = toWorld(event)
      const target = engine.findEnemyAt(point, pointerHitRadius(event.pointerType))
      event.preventDefault()
      if (shouldUseHaptics(event.pointerType)) {
        try {
          host.setPointerCapture(event.pointerId)
          navigator.vibrate?.(target ? 9 : 5)
        } catch {
          // Pointer capture and haptics are progressive enhancements.
        }
      }
      if (target) {
        engine.dispatchInput({ type: 'selectTarget', targetId: target.id })
      } else {
        engine.dispatchInput({ type: 'move', position: point })
      }
    }
    const onContextMenu = (event: Event) => event.preventDefault()
    const onDragStart = (event: DragEvent) => event.preventDefault()
    const onVisibilityChange = () => {
      if (document.hidden) engine.pause()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault()
        engine.dispatchInput({ type: 'basicAttack' })
      } else if (event.code === 'Escape') {
        engine.dispatchInput({ type: 'pause' })
      }
    }
    host.addEventListener('pointerdown', onPointerDown, { passive: false })
    host.addEventListener('contextmenu', onContextMenu)
    host.addEventListener('dragstart', onDragStart)
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('contextmenu', onContextMenu)
      host.removeEventListener('dragstart', onDragStart)
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      renderer?.destroy()
    }
  }, [engine, onReady])

  return <div ref={hostRef} className="game-surface" aria-label="Đấu trường Last-Hit Challenge" />
})
