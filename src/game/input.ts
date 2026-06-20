export type PointerKind = 'mouse' | 'touch' | 'pen' | string

export function isGameCommandPointer(pointerType: PointerKind, button: number, isPrimary = true) {
  if (!isPrimary) return false
  return pointerType === 'touch' || pointerType === 'pen' || button === 2
}

export function pointerHitRadius(pointerType: PointerKind) {
  if (pointerType === 'touch') return 0.095
  if (pointerType === 'pen') return 0.08
  return 0.065
}

export function shouldUseHaptics(pointerType: PointerKind) {
  return pointerType === 'touch' || pointerType === 'pen'
}
