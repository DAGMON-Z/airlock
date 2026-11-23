import type { ReactNode } from 'react'

interface IconProps {
  className?: string
}

/** Small inline line icons. All decorative: labels sit next to them in the UI. */
function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function LockIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </Svg>
  )
}

export function DeviceIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3l7.5 2.8v5.7c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V5.8L12 3z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </Svg>
  )
}

export function SendIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 12h15" />
      <path d="M13 6l6 6-6 6" />
    </Svg>
  )
}

export function ArrowIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </Svg>
  )
}

export function ImageIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-8 8" />
    </Svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  )
}
