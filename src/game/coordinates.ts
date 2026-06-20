import type { Vec2 } from './types'

export interface ViewportRect {
  left: number
  top: number
  width: number
  height: number
}

export function screenToWorld(clientX: number, clientY: number, rect: ViewportRect): Vec2 {
  const portrait = rect.height > rect.width
  if (portrait) {
    const padY = rect.height * 0.15
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top - padY) / (rect.height - 2 * padY),
    }
  }
  return {
    x: 0.5 + (clientX - rect.left - rect.width / 2) / (rect.height * 1.08),
    y: (clientY - rect.top) / rect.height,
  }
}
