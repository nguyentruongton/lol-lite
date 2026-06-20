import { describe, expect, it } from 'vitest'
import { screenToWorld } from './coordinates'

describe('screenToWorld', () => {
  it('maps the center of a portrait viewport to the center of the world', () => {
    expect(screenToWorld(195, 422, { left: 0, top: 0, width: 390, height: 844 })).toEqual({ x: 0.5, y: 0.5 })
  })

  it('keeps the landscape combat center stable while exposing extra width', () => {
    const rect = { left: 0, top: 0, width: 1366, height: 768 }
    expect(screenToWorld(683, 384, rect)).toEqual({ x: 0.5, y: 0.5 })
    expect(screenToWorld(100, 384, rect).x).toBeLessThan(0)
    expect(screenToWorld(1266, 384, rect).x).toBeGreaterThan(1)
  })
})
