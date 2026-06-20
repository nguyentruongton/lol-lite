import { describe, expect, it } from 'vitest'
import { isGameCommandPointer, pointerHitRadius, shouldUseHaptics } from './input'

describe('pointer input policy', () => {
  it('accepts right-click, touch and pen while ignoring left-click and secondary touches', () => {
    expect(isGameCommandPointer('mouse', 2)).toBe(true)
    expect(isGameCommandPointer('mouse', 0)).toBe(false)
    expect(isGameCommandPointer('touch', 0)).toBe(true)
    expect(isGameCommandPointer('pen', 0)).toBe(true)
    expect(isGameCommandPointer('touch', 0, false)).toBe(false)
  })

  it('uses larger forgiving hit areas for coarse pointers', () => {
    expect(pointerHitRadius('touch')).toBeGreaterThan(pointerHitRadius('mouse'))
    expect(pointerHitRadius('pen')).toBeGreaterThan(pointerHitRadius('mouse'))
    expect(shouldUseHaptics('touch')).toBe(true)
    expect(shouldUseHaptics('mouse')).toBe(false)
  })
})
