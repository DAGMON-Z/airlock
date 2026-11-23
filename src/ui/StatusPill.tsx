import type { LocalModelStatus } from '../lib/types'

interface StatusPillProps {
  status: LocalModelStatus
  /** 0 to 1 while downloading, otherwise null. */
  progress: number | null
  onDownload: () => void
}

function copyFor(status: LocalModelStatus, percent: number | null): string {
  switch (status) {
    case 'checking':
      return 'Checking this device…'
    case 'available':
      return 'On-device AI ready'
    case 'downloadable':
      return 'On-device AI needs a one-time download'
    case 'downloading':
      return percent === null
        ? 'Downloading on-device AI…'
        : `Downloading on-device AI · ${percent}%`
    case 'unavailable':
      return 'On-device AI not available in this browser — basic protection only'
  }
}

export function StatusPill({ status, progress, onDownload }: StatusPillProps) {
  const percent =
    progress === null ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100)

  return (
    <div className={`status-pill status-pill--${status}`} role="status" aria-live="polite">
      <span className="status-dot" aria-hidden="true" />
      <span>{copyFor(status, percent)}</span>

      {status === 'downloadable' && (
        <button type="button" className="btn btn--small btn--ghost" onClick={onDownload}>
          Download now
        </button>
      )}

      {status === 'downloading' && percent !== null && (
        <progress
          className="status-progress"
          max={100}
          value={percent}
          aria-label="Download progress"
        />
      )}

      {status === 'unavailable' && (
        <details className="status-details">
          <summary>Why?</summary>
          <p className="muted">The on-device AI needs Chrome on a desktop computer.</p>
        </details>
      )}
    </div>
  )
}
