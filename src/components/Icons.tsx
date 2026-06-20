interface IconProps {
  className?: string
}

export function SwordIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M49.5 7 25 31.5l7.5 7.5L57 14.5 58.5 5z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      <path d="m27 36-6.5 6.5 4 4L31 40M17.5 43.5l3 3-9 9-3-3z" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
      <path d="m18 35 11 11" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
    </svg>
  )
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 6h6v20H8zm10 0h6v20h-6z" fill="currentColor" />
    </svg>
  )
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M16 9v7l5 3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
    </svg>
  )
}

export function CrossSwordsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path d="m7 5 5 5-2 2 12 12 4 2-2-4-12-12-2 2zm18 0-5 5 2 2L10 24l-4 2 2-4 12-12 2 2z" fill="currentColor" />
    </svg>
  )
}

export function VolumeIcon({ muted, className }: IconProps & { muted: boolean }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 13h6l6-5v16l-6-5H5z" fill="currentColor" />
      {muted ? <path d="m21 12 7 8m0-8-7 8" fill="none" stroke="currentColor" strokeWidth="2.5" /> : <path d="M21 12c2 2 2 6 0 8m3-11c4 4 4 10 0 14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />}
    </svg>
  )
}
