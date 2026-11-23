import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { addManual, applyVault, toggleEntity } from '../lib/redact'
import type { DetectionResult, EntityType, Vault } from '../lib/types'
import { DocumentPane } from './DocumentPane'
import { EntityList } from './EntityList'
import { LockIcon } from './icons'
import { TYPE_LABELS, TYPE_ORDER, plural } from './labels'
import { markText, type Mark } from './marks'

interface PickState {
  value: string
  top: number
  left: number
}

interface StepCheckProps {
  text: string
  vault: Vault
  detectedBy: DetectionResult['detectedBy']
  warnings: readonly string[]
  firebaseReady: boolean
  onVaultChange: (vault: Vault) => void
  onBack: () => void
  onSend: () => void
}

export function StepCheck({
  text,
  vault,
  detectedBy,
  warnings,
  firebaseReady,
  onVaultChange,
  onBack,
  onSend,
}: StepCheckProps) {
  const headingId = useId()
  const manualInputId = useId()
  const manualTypeId = useId()
  const pickTypeId = useId()
  const sendNoteId = useId()

  const deviceBody = useRef<HTMLDivElement>(null)
  const sentBody = useRef<HTMLDivElement>(null)
  const pickPanel = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  const [pick, setPick] = useState<PickState | null>(null)
  const [pickType, setPickType] = useState<EntityType>('OTHER')
  const [manualText, setManualText] = useState('')
  const [manualType, setManualType] = useState<EntityType>('OTHER')
  const [notice, setNotice] = useState('')

  const sent = useMemo(() => applyVault(text, vault), [text, vault])

  // Only details that actually occur in this text are shown to the user.
  const entities = useMemo(
    () => vault.entities.filter((e) => e.value !== '' && text.includes(e.value)),
    [text, vault],
  )
  const hidden = entities.filter((e) => e.redacted)
  const shownCount = entities.length - hidden.length
  // A hidden value that still appears in the sent text would leave the device.
  const leavingCount = hidden.filter((e) => sent.includes(e.value)).length

  const leftNodes = useMemo(
    () =>
      markText(
        text,
        entities.map(
          (e): Mark => ({
            text: e.value,
            className: e.redacted ? `hl hl--${e.type}` : 'hl hl--shown',
            title: e.redacted
              ? `Hidden on this device: ${TYPE_LABELS[e.type].toLowerCase()}`
              : 'Shown to the AI',
          }),
        ),
      ),
    [text, entities],
  )

  const sentNodes = useMemo(
    () =>
      markText(
        sent,
        entities.map(
          (e): Mark =>
            e.redacted
              ? {
                  text: e.placeholder,
                  className: `chip chip--${e.type}`,
                  title: `Stands in for a hidden ${TYPE_LABELS[e.type].toLowerCase()}`,
                }
              : { text: e.value, className: 'plain-shown', title: 'You chose to show this' },
        ),
      ),
    [sent, entities],
  )

  // Keep the two panes scrolled to the same relative position (wide layout only).
  function mirror(from: HTMLDivElement | null, to: HTMLDivElement | null) {
    if (!from || !to || syncing.current) return
    if (!window.matchMedia('(min-width: 800px)').matches) return
    const fromRange = from.scrollHeight - from.clientHeight
    const toRange = to.scrollHeight - to.clientHeight
    if (fromRange <= 0 || toRange <= 0) return
    syncing.current = true
    to.scrollTop = (from.scrollTop / fromRange) * toRange
    window.requestAnimationFrame(() => {
      syncing.current = false
    })
  }

  // Selecting text in the left pane offers a "Hide this" control near the selection.
  useEffect(() => {
    function handleSelection() {
      const selection = document.getSelection()
      const body = deviceBody.current
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !body) return
      const range = selection.getRangeAt(0)
      if (!body.contains(range.commonAncestorContainer)) return

      const value = selection.toString().trim()
      if (value === '' || value.length > 200) {
        setPick(null)
        return
      }
      const rect = range.getBoundingClientRect()
      const left = Math.min(Math.max(rect.left + rect.width / 2, 150), window.innerWidth - 150)
      const above = rect.top - 52
      const top = above >= 8 ? above : rect.bottom + 8
      setPick({ value, top, left })
    }

    function handleMouseDown(event: MouseEvent) {
      if (event.target instanceof Node && pickPanel.current?.contains(event.target)) return
      setPick(null)
    }

    function dismiss() {
      setPick(null)
    }

    document.addEventListener('selectionchange', handleSelection)
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('selectionchange', handleSelection)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('scroll', dismiss, true)
    }
  }, [])

  function addValue(value: string, type: EntityType): boolean {
    const clean = value.trim()
    if (clean === '') return false
    if (vault.entities.some((e) => e.value === clean)) {
      setNotice(`"${clean}" is already in the list below.`)
      return false
    }
    onVaultChange(addManual(vault, clean, type))
    setNotice('Added. It is hidden unless you show it to the AI.')
    return true
  }

  function handlePickSubmit() {
    if (!pick) return
    addValue(pick.value, pickType)
    setPick(null)
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (addValue(manualText, manualType)) setManualText('')
  }

  function toggle(placeholder: string) {
    onVaultChange(toggleEntity(vault, placeholder))
  }

  return (
    <section className="step step-check" aria-labelledby={headingId}>
      <h1 id={headingId} tabIndex={-1}>
        Check what will be sent
      </h1>
      <p className="lede">
        Compare the two sides. Only the right-hand version is sent to the AI.
      </p>

      <div className="summary">
        <p className="summary-main" aria-live="polite">
          <strong>{plural(hidden.length, 'detail')} hidden</strong>
          {' · '}
          {leavingCount} of them will leave this device
        </p>
        <p className="muted">
          {detectedBy === 'on_device'
            ? 'Found by the on-device AI and pattern checks.'
            : 'Found by pattern checks only. The on-device AI was not available.'}
        </p>
      </div>

      {shownCount > 0 && (
        <p className="notice notice--leave">
          {plural(shownCount, 'detail')} you chose to show will be sent as they are.
        </p>
      )}

      {warnings.length > 0 && (
        <div className="notice" role="note">
          <p className="notice-title">Heads up</p>
          <ul>
            {warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="check-stage">
        <DocumentPane
          tone="device"
          title="Stays on this device"
          caption="Hidden details are highlighted"
          nodes={leftNodes}
          bodyRef={deviceBody}
          onScroll={() => mirror(deviceBody.current, sentBody.current)}
        />

        <div className="airlock">
          <span className="airlock-rail" />
          <span className="airlock-lock">
            <LockIcon />
          </span>
          <span className="airlock-caption">Only the right side leaves</span>
          <span className="airlock-rail" />
        </div>

        <DocumentPane
          tone="sent"
          title="Will be sent to the AI"
          caption="Hidden details are replaced"
          nodes={sentNodes}
          bodyRef={sentBody}
          onScroll={() => mirror(sentBody.current, deviceBody.current)}
        />
      </div>

      {pick && (
        <div
          ref={pickPanel}
          className="pick"
          role="group"
          aria-label="Hide the selected text"
          style={{ top: pick.top, left: pick.left }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPick(null)
          }}
        >
          <label className="visually-hidden" htmlFor={pickTypeId}>
            Type of detail
          </label>
          <select
            id={pickTypeId}
            className="pick-select"
            value={pickType}
            onChange={(event) => setPickType(event.target.value as EntityType)}
          >
            {TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <button type="button" className="pick-button" onClick={handlePickSubmit}>
            Hide this
          </button>
        </div>
      )}

      <div className="check-grid">
        <EntityList entities={entities} onToggle={toggle} />

        <div className="manual-panel">
          <form className="manual" onSubmit={handleManualSubmit}>
            <label htmlFor={manualInputId} className="field-label">
              Hide another word or number
            </label>
            <input
              id={manualInputId}
              className="text-input"
              type="text"
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              placeholder="For example, a nickname or a house name"
            />
            <div className="manual-row">
              <div>
                <label htmlFor={manualTypeId} className="field-label">
                  Type
                </label>
                <select
                  id={manualTypeId}
                  className="select-input"
                  value={manualType}
                  onChange={(event) => setManualType(event.target.value as EntityType)}
                >
                  {TYPE_ORDER.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="btn btn--ghost"
                disabled={manualText.trim() === ''}
              >
                Hide it
              </button>
            </div>
          </form>
          <p className="status-line" role="status" aria-live="polite">
            {notice}
          </p>
        </div>
      </div>

      {!firebaseReady && (
        <div className="notice notice--leave" role="note" id={sendNoteId}>
          <p className="notice-title">Sending is turned off</p>
          <p>
            This app is not connected to Firebase yet. Add your keys to a .env file (see the
            README). Hiding and checking still work.
          </p>
        </div>
      )}

      <div className="step-actions">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn btn--primary btn--large"
          onClick={onSend}
          disabled={!firebaseReady}
          aria-describedby={firebaseReady ? undefined : sendNoteId}
        >
          Send the safe version
        </button>
      </div>
    </section>
  )
}
