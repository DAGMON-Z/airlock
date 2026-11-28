import type { InferenceWhere, Vault } from '../lib/types'

interface HandoffTrailProps {
  /** Who found the details: 'on_device' when Gemini Nano ran, 'none' when only patterns ran. */
  detectedBy: InferenceWhere
  /** Where the answer was produced. */
  answeredBy: InferenceWhere
  cloudModel: string
  vault: Vault
}

interface Stage {
  where: 'device' | 'cloud'
  title: string
  detail: string
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * Shows the hybrid handoff for one answer: what ran on this device, what ran in the cloud,
 * and with which model, so the privacy boundary is visible rather than claimed.
 */
export function HandoffTrail({ detectedBy, answeredBy, cloudModel, vault }: HandoffTrailProps) {
  const hidden = vault.entities.filter((entity) => entity.redacted)
  const placeholders = new Set(hidden.map((entity) => entity.placeholder)).size
  const byModel = hidden.filter((entity) => entity.source === 'model').length

  const stages: Stage[] = [
    {
      where: 'device',
      title: detectedBy === 'on_device' ? 'Gemini Nano, on this device' : 'Pattern check, on this device',
      detail:
        detectedBy === 'on_device'
          ? `Found ${plural(hidden.length, 'detail')} (${byModel} by the model) and hid them`
          : `Found and hid ${plural(hidden.length, 'detail')}`,
    },
    answeredBy === 'on_device'
      ? {
          where: 'device',
          title: 'Gemini Nano, on this device',
          detail: 'Explained it here, because the cloud was unreachable',
        }
      : {
          where: 'cloud',
          title: `${cloudModel}, in the cloud`,
          detail: `Explained the safe version: ${plural(placeholders, 'placeholder')}, no real details`,
        },
    {
      where: 'device',
      title: 'This device',
      detail: 'Put your real details back into the answer',
    },
  ]

  return (
    <section className="handoff" aria-label="How this answer was made">
      <h3 className="handoff-title">How this answer was made</h3>
      <ol className="handoff-list">
        {stages.map((stage, i) => (
          <li key={i} className={`handoff-stage handoff-stage--${stage.where}`}>
            <span className="handoff-where">{stage.where === 'device' ? 'On device' : 'Cloud'}</span>
            <strong className="handoff-name">{stage.title}</strong>
            <span className="handoff-detail">{stage.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
