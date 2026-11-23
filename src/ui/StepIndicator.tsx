import { CheckIcon } from './icons'

export type Step = 1 | 2 | 3

const STEPS: readonly { n: Step; label: string }[] = [
  { n: 1, label: 'Add' },
  { n: 2, label: 'Check' },
  { n: 3, label: 'Understand' },
]

interface StepIndicatorProps {
  current: Step
}

export function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <nav aria-label="Progress">
      <ol>
        {STEPS.map((step) => {
          const state = step.n < current ? 'done' : step.n === current ? 'current' : 'todo'
          return (
            <li
              key={step.n}
              className={`step-dot step-dot--${state}`}
              aria-current={step.n === current ? 'step' : undefined}
            >
              <span className="step-num">
                {state === 'done' ? <CheckIcon className="step-check-icon" /> : step.n}
              </span>
              <span>
                <span className="visually-hidden">Step {step.n} of 3: </span>
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
