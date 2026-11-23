import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { LeakError, explain } from '../lib/ai'
import { applyVault } from '../lib/redact'
import type { Entity, InferenceWhere, Vault } from '../lib/types'
import { AnswerText } from './AnswerText'
import { TYPE_LABELS, messageOf } from './labels'

const LEAK_TITLE = 'Stopped: these details were still visible, so nothing was sent'
const LEAK_HELP = 'Go back to the check step, hide them, then try again.'

interface Answer {
  id: number
  /** What the user typed, shown back to them. */
  question: string | null
  /** The question as it was sent: known details replaced by placeholders. */
  sentQuestion: string | null
  status: 'pending' | 'done' | 'error'
  text: string
  rawText: string
  source: InferenceWhere
  error: string | null
  leaks: Entity[]
}

function newAnswer(id: number, question: string | null, sentQuestion: string | null): Answer {
  return {
    id,
    question,
    sentQuestion,
    status: 'pending',
    text: '',
    rawText: '',
    source: 'none',
    error: null,
    leaks: [],
  }
}

interface StepUnderstandProps {
  /** The document with hidden details replaced, exactly what the AI gets. */
  redactedText: string
  vault: Vault
  onBackToCheck: () => void
  onStartOver: () => void
}

export function StepUnderstand({
  redactedText,
  vault,
  onBackToCheck,
  onStartOver,
}: StepUnderstandProps) {
  const headingId = useId()
  const followUpId = useId()
  const [answers, setAnswers] = useState<Answer[]>([])
  const [draft, setDraft] = useState('')
  const nextId = useRef(1)
  const started = useRef(false)

  const patch = useCallback((id: number, change: Partial<Answer>) => {
    setAnswers((prev) => prev.map((a) => (a.id === id ? { ...a, ...change } : a)))
  }, [])

  const run = useCallback(
    async (id: number, sentQuestion: string | null) => {
      try {
        const result = await explain({
          redactedText,
          vault,
          question: sentQuestion ?? undefined,
          onChunk: (soFar: string) => patch(id, { text: soFar }),
        })
        patch(id, {
          status: 'done',
          text: result.text,
          rawText: result.rawText,
          source: result.source,
          error: null,
          leaks: [],
        })
      } catch (err) {
        if (err instanceof LeakError) {
          patch(id, { status: 'error', text: '', error: LEAK_TITLE, leaks: err.leaks })
        } else {
          patch(id, { status: 'error', text: '', error: messageOf(err), leaks: [] })
        }
      }
    },
    [redactedText, vault, patch],
  )

  const ask = useCallback(
    (question: string | null) => {
      const id = nextId.current++
      // Known details typed into a follow-up are replaced before anything is sent.
      const sentQuestion = question === null ? null : applyVault(question, vault)
      setAnswers((prev) => [...prev, newAnswer(id, question, sentQuestion)])
      void run(id, sentQuestion)
    },
    [run, vault],
  )

  useEffect(() => {
    if (started.current) return
    started.current = true
    ask(null)
  }, [ask])

  function retry(answer: Answer) {
    patch(answer.id, { status: 'pending', text: '', error: null, leaks: [] })
    void run(answer.id, answer.sentQuestion)
  }

  const busy = answers.some((a) => a.status === 'pending')

  function handleFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const question = draft.trim()
    if (question === '' || busy) return
    setDraft('')
    ask(question)
  }

  return (
    <section className="step step-understand" aria-labelledby={headingId}>
      <h1 id={headingId} tabIndex={-1}>
        Understand
      </h1>
      <p className="lede">
        The AI read only the safe version. Your details are put back into the answer here, on
        this device.
      </p>

      {answers.map((answer) => (
        <AnswerCard
          key={answer.id}
          answer={answer}
          redactedText={redactedText}
          onRetry={() => retry(answer)}
          onBackToCheck={onBackToCheck}
        />
      ))}

      <form className="follow-up" onSubmit={handleFollowUp}>
        <label htmlFor={followUpId} className="field-label">
          Ask a follow-up question
        </label>
        <div className="follow-up-row">
          <input
            id={followUpId}
            className="text-input"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="For example, what does this mean for me?"
            disabled={busy}
          />
          <button type="submit" className="btn btn--primary" disabled={busy || draft.trim() === ''}>
            Ask
          </button>
        </div>
      </form>

      <div className="step-actions">
        <button type="button" className="btn btn--ghost" onClick={onStartOver}>
          Start over
        </button>
      </div>

      <p className="footnote">General information, not medical, legal or financial advice.</p>
    </section>
  )
}

interface AnswerCardProps {
  answer: Answer
  redactedText: string
  onRetry: () => void
  onBackToCheck: () => void
}

function AnswerCard({ answer, redactedText, onRetry, onBackToCheck }: AnswerCardProps) {
  const { question, sentQuestion, status, text, rawText, source, error, leaks } = answer

  if (status === 'error') {
    const isLeak = leaks.length > 0 || error === LEAK_TITLE
    return (
      <article className="answer-card">
        {question && <QuestionLine question={question} />}
        <div className="error-box" role="alert">
          <p className="error-title">{error}</p>
          {isLeak ? (
            <>
              {leaks.length > 0 && (
                <ul className="leak-list">
                  {leaks.map((leak) => (
                    <li key={leak.placeholder}>
                      <span className={`type-tag type--${leak.type}`}>
                        {TYPE_LABELS[leak.type]}
                      </span>
                      {leak.value}
                    </li>
                  ))}
                </ul>
              )}
              <p>{LEAK_HELP}</p>
              <button type="button" className="btn btn--ghost" onClick={onBackToCheck}>
                Back to check
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      </article>
    )
  }

  const pending = status === 'pending'
  return (
    <article className="answer-card" aria-busy={pending}>
      {question && <QuestionLine question={question} />}

      {pending && (
        <p className="thinking" role="status" aria-live="polite">
          {text === '' ? 'Thinking…' : 'Writing the answer…'}
        </p>
      )}

      {text !== '' && (
        <div className="answer-body">
          <AnswerText text={text} />
        </div>
      )}

      {status === 'done' && (
        <div className="answer-meta">
          {source === 'on_device' && (
            <span className="badge badge--safe">Answered on this device (offline)</span>
          )}
          {source === 'in_cloud' && (
            <span className="badge badge--leave">
              Answered by cloud AI — it never saw your details
            </span>
          )}

          <details className="proof">
            <summary>See exactly what the AI received</summary>
            <pre className="proof-text">
              {sentQuestion !== null
                ? `${redactedText}\n\nQuestion: ${sentQuestion}`
                : redactedText}
            </pre>
          </details>

          <details className="proof">
            <summary>…and what it wrote back</summary>
            <pre className="proof-text">{rawText}</pre>
          </details>
        </div>
      )}
    </article>
  )
}

function QuestionLine({ question }: { question: string }) {
  return (
    <p className="question">
      <span className="question-label">You asked:</span>
      <span>{question}</span>
    </p>
  )
}
