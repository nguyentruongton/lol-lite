const STORAGE_KEY = 'last-hit-challenge:v1'

export interface SavedProgress {
  tutorialSeen: boolean
  bestLastHits: number
  bestClearTime: number | null
  muted: boolean
}

const DEFAULT_PROGRESS: SavedProgress = {
  tutorialSeen: false,
  bestLastHits: 0,
  bestClearTime: null,
  muted: false,
}

export function loadProgress(): SavedProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_PROGRESS, ...JSON.parse(raw) } : { ...DEFAULT_PROGRESS }
  } catch {
    return { ...DEFAULT_PROGRESS }
  }
}

export function saveProgress(progress: SavedProgress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // The game remains playable when storage is unavailable.
  }
}
