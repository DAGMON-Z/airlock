import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { detectEntities, getLocalStatus, prepareLocalModel, transcribeImage } from '../lib/ai'
import { samples } from '../lib/samples'
import type { DetectionResult, LocalModelStatus, Vault } from '../lib/types'
import { ImageIcon } from './icons'
import { messageOf } from './labels'
import { StatusPill } from './StatusPill'

interface StepAddProps {
  text: string
  /** The text the current vault was built from, or null if never checked. */
  checkedText: string | null
  vault: Vault
  onTextChange: (text: string) => void
  /** Pass a detection result to move on with it, or null to move on as-is. */
  onAdvance: (result: DetectionResult | null) => void
}

export function StepAdd({ text, checkedText, vault, onTextChange, onAdvance }: StepAddProps) {
  const headingId = useId()
  const textId = useId()
  const fileInput = useRef<HTMLInputElement>(null)

  const [localStatus, setLocalStatus] = useState<LocalModelStatus>('checking')
  const [progress, setProgress] = useState<number | null>(null)
  const [hiding, setHiding] = useState(false)
  const [hideError, setHideError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let alive = true
    void getLocalStatus().then((status) => {
      if (alive) setLocalStatus(status)
    })
    return () => {
      alive = false
    }
  }, [])

  // A download started earlier (or in another tab) reports no percentage here,
  // so keep checking until Chrome says the model is ready.
  useEffect(() => {
    if (localStatus !== 'downloading' || progress !== null) return
    const timer = window.setInterval(() => {
      void getLocalStatus().then((status) => {
        if (status !== 'downloading') setLocalStatus(status)
      })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [localStatus, progress])

  async function downloadModel() {
    setLocalStatus('downloading')
    setProgress(0)
    try {
      const status = await prepareLocalModel((fraction) => setProgress(fraction))
      setLocalStatus(status)
    } catch {
      setLocalStatus(await getLocalStatus())
    } finally {
      setProgress(null)
    }
  }

  async function hideDetails() {
    setHideError(null)
    setHiding(true)
    try {
      if (checkedText === text) {
        // Nothing has changed since the last check, so reuse it.
        onAdvance(null)
        return
      }

      // Never wait for a multi-GB model download here. If the model is not on this device yet,
      // start the download in the background (this click lets Chrome begin it) and check now
      // with the pattern safety net; the status pill shows the download's progress.
      const status = await getLocalStatus()
      setLocalStatus(status)
      if ((status === 'downloadable' || status === 'downloading') && progress === null) {
        void downloadModel()
      }

      const result = await detectEntities(
        text,
        checkedText === null ? undefined : vault,
      )
      onAdvance(result)
    } catch (err) {
      setHideError(messageOf(err))
    } finally {
      setHiding(false)
    }
  }

  async function readPhoto(file: File) {
    if (!file.type.startsWith('image/')) {
      setReadError('Please choose a photo file.')
      return
    }
    setReadError(null)
    setReading(true)
    try {
      const extracted = (await transcribeImage(file)).trim()
      if (extracted === '') {
        setReadError('No text was found in that photo. Try a clearer picture.')
      } else {
        onTextChange(text.trim() === '' ? extracted : `${text.trimEnd()}\n\n${extracted}`)
      }
    } catch (err) {
      setReadError(messageOf(err))
    } finally {
      setReading(false)
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void readPhoto(file)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(true)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file && !reading && !hiding) void readPhoto(file)
  }

  const busy = hiding || reading
  const examples = samples

  return (
    <section className="step step-add" aria-labelledby={headingId}>
      <h1 id={headingId} tabIndex={-1}>
        Add your document
      </h1>
      <p className="lede">
        Paste the text or add a photo. Names, numbers and addresses are hidden on this device
        before anything goes to the AI.
      </p>

      <StatusPill
        status={localStatus}
        progress={progress}
        onDownload={() => void downloadModel()}
      />

      <div
        className={dragging ? 'dropzone is-dragging' : 'dropzone'}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <label htmlFor={textId} className="field-label">
          Your document
        </label>
        <textarea
          id={textId}
          className="doc-input"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Paste the letter, contract or test results here"
          rows={12}
          spellCheck={false}
          disabled={busy}
        />

        <div className="dropzone-foot">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            <ImageIcon />
            Add a photo
          </button>
          <span className="hint">or drop a photo here</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="visually-hidden"
            tabIndex={-1}
            aria-label="Choose a photo of your document"
            onChange={handleFileChange}
          />
        </div>

        <p className="status-line" role="status" aria-live="polite">
          {reading ? 'Reading the photo…' : ''}
        </p>
        {readError && (
          <p className="error" role="alert">
            {readError}
          </p>
        )}
      </div>

      <div className="examples">
        <p className="field-label">Try an example</p>
        <div className="chip-row">
          {examples.map((sample) => (
            <button
              key={sample.id}
              type="button"
              className="chip-btn"
              title={sample.kind}
              onClick={() => onTextChange(sample.text)}
              disabled={busy}
            >
              {sample.title}
            </button>
          ))}
        </div>
      </div>

      <div className="step-actions">
        <button
          type="button"
          className="btn btn--primary btn--large"
          onClick={() => void hideDetails()}
          disabled={text.trim() === '' || busy}
        >
          Hide my details
        </button>
        <p className="status-line" role="status" aria-live="polite">
          {hiding ? 'Finding personal details on this device…' : ''}
        </p>
      </div>

      {hideError && (
        <p className="error" role="alert">
          {hideError}
        </p>
      )}
    </section>
  )
}
