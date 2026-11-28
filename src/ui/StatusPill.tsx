import { useEffect, useState } from 'react'
import type { LocalModelStatus } from '../lib/types'

interface StatusPillProps {
  status: LocalModelStatus
  /** 0 to 1 while downloading, otherwise null. */
  progress: number | null
  onDownload: () => void
}

/** How long a download may sit at no progress before we explain how to unblock it. */
const STALL_MS = 20_000

const FLAGS = [
  {
    url: 'chrome://flags/#optimization-guide-on-device-model',
    setTo: 'Enabled BypassPerfRequirement',
  },
  {
    url: 'chrome://flags/#prompt-api-for-gemini-nano-multimodal-input',
    setTo: 'Enabled',
  },
]

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
        ? 'On-device AI not ready yet'
        : `Downloading on-device AI · ${percent}%`
    case 'unavailable':
      return 'On-device AI not available in this browser — basic protection only'
  }
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="flag-row">
      <code>{url}</code>
      <button
        type="button"
        className="btn btn--small btn--ghost"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
          })
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  )
}

/**
 * Pages cannot open chrome:// links or change Chrome's settings, so the best we can do is
 * show the exact steps. Chrome skips the download on devices it rates as too slow; the first
 * flag lifts that check.
 */
function ChromeSetupHelp({ summary }: { summary: string }) {
  return (
    <details className="status-details">
      <summary>{summary}</summary>
      <div className="status-help">
        <p className="muted">
          Chrome decides whether to download its on-device AI, and skips devices it rates as too
          slow. To download it anyway:
        </p>
        <ol>
          {FLAGS.map((flag) => (
            <li key={flag.url}>
              Paste this into the address bar and set it to <strong>{flag.setTo}</strong>:
              <CopyLink url={flag.url} />
            </li>
          ))}
          <li>
            Click <strong>Relaunch</strong>, come back here and click <strong>Start download</strong>.
          </li>
        </ol>
        <p className="muted">
          Progress shows in <code>chrome://on-device-internals</code>. This needs desktop Chrome.
          Until then, the pattern check still hides numbers, emails, labelled names and addresses.
        </p>
      </div>
    </details>
  )
}

export function StatusPill({ status, progress, onDownload }: StatusPillProps) {
  const percent =
    progress === null ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100)

  // A download that never moves past 0% is almost always Chrome's hardware check.
  const noProgress = status === 'downloading' && (percent === null || percent === 0)
  const [stalled, setStalled] = useState(false)
  useEffect(() => {
    if (!noProgress) return
    const timer = window.setTimeout(() => setStalled(true), STALL_MS)
    return () => {
      window.clearTimeout(timer)
      setStalled(false)
    }
  }, [noProgress])

  return (
    <div className={`status-pill status-pill--${status}`} role="status" aria-live="polite">
      <span className="status-dot" aria-hidden="true" />
      <span>{copyFor(status, percent)}</span>

      {status === 'downloadable' && (
        <button type="button" className="btn btn--small btn--ghost" onClick={onDownload}>
          Download now
        </button>
      )}

      {/* Chrome reports "downloading" before any page has asked for the model, and then waits
          for a click. With no progress to show, offer that click instead of waiting forever. */}
      {status === 'downloading' && percent === null && (
        <button type="button" className="btn btn--small btn--ghost" onClick={onDownload}>
          Start download
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

      {stalled && <ChromeSetupHelp summary="Download not starting?" />}

      {status === 'unavailable' && <ChromeSetupHelp summary="How to turn it on" />}
    </div>
  )
}
