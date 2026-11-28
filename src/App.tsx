import { useEffect, useMemo, useReducer, useRef } from 'react'
import { firebaseConfigured } from './lib/firebase'
import { applyVault } from './lib/redact'
import type { DetectionResult, Vault } from './lib/types'
import { LockIcon } from './ui/icons'
import { StepAdd } from './ui/StepAdd'
import { StepCheck } from './ui/StepCheck'
import { StepIndicator, type Step } from './ui/StepIndicator'
import { StepUnderstand } from './ui/StepUnderstand'
import './App.css'

interface AppState {
  step: Step
  text: string
  /** The text the current vault was built from. null until the first check. */
  checkedText: string | null
  vault: Vault
  detectedBy: DetectionResult['detectedBy']
  warnings: string[]
}

const initialState: AppState = {
  step: 1,
  text: '',
  checkedText: null,
  vault: { entities: [] },
  detectedBy: 'none',
  warnings: [],
}

type Action =
  | { type: 'text'; text: string }
  | { type: 'goto'; step: Step }
  | { type: 'checked'; text: string; result: DetectionResult }
  | { type: 'vault'; vault: Vault }
  | { type: 'reset' }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'text':
      return { ...state, text: action.text }
    case 'goto':
      return { ...state, step: action.step }
    case 'checked':
      return {
        ...state,
        step: 2,
        text: action.text,
        checkedText: action.text,
        vault: action.result.vault,
        detectedBy: action.result.detectedBy,
        warnings: action.result.warnings,
      }
    case 'vault':
      return { ...state, vault: action.vault }
    case 'reset':
      return initialState
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { step, text, checkedText, vault, detectedBy, warnings } = state

  const redactedText = useMemo(() => applyVault(text, vault), [text, vault])

  // Move focus to the new step's heading so keyboard and screen reader users land on it.
  const mainRef = useRef<HTMLElement>(null)
  const previousStep = useRef(step)
  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    mainRef.current?.querySelector<HTMLElement>('h1')?.focus()
  }, [step])

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="site-header">
        <div className="brand">
          <span className="brand-mark">
            <LockIcon />
          </span>
          <span className="brand-name">Airlock</span>
        </div>
        <p className="tagline">Ask AI about private documents — without telling it who you are.</p>
      </header>

      <StepIndicator current={step} />

      <main id="main" ref={mainRef} className="app-main" tabIndex={-1}>
        {step === 1 && (
          <StepAdd
            text={text}
            checkedText={checkedText}
            vault={vault}
            onTextChange={(value) => dispatch({ type: 'text', text: value })}
            onAdvance={(result) =>
              result === null
                ? dispatch({ type: 'goto', step: 2 })
                : dispatch({ type: 'checked', text, result })
            }
          />
        )}

        {step === 2 && (
          <StepCheck
            text={text}
            vault={vault}
            detectedBy={detectedBy}
            warnings={warnings}
            firebaseReady={firebaseConfigured}
            onVaultChange={(next) => dispatch({ type: 'vault', vault: next })}
            onBack={() => dispatch({ type: 'goto', step: 1 })}
            onSend={() => dispatch({ type: 'goto', step: 3 })}
          />
        )}

        {step === 3 && (
          <StepUnderstand
            redactedText={redactedText}
            vault={vault}
            detectedBy={detectedBy}
            onBackToCheck={() => dispatch({ type: 'goto', step: 2 })}
            onStartOver={() => dispatch({ type: 'reset' })}
          />
        )}
      </main>
    </div>
  )
}
