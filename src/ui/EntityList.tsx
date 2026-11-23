import { useId } from 'react'
import type { Entity } from '../lib/types'
import { ArrowIcon } from './icons'
import { SOURCE_LABELS, TYPE_LABELS } from './labels'

interface EntityListProps {
  entities: readonly Entity[]
  onToggle: (placeholder: string) => void
}

export function EntityList({ entities, onToggle }: EntityListProps) {
  const headingId = useId()

  return (
    <section className="entities" aria-labelledby={headingId}>
      <h2 id={headingId} className="section-title">
        Every detail found
      </h2>

      {entities.length === 0 ? (
        <p className="muted">No personal details were found. You can still add one below.</p>
      ) : (
        <ul className="entity-list">
          {entities.map((entity) => {
            const shown = !entity.redacted
            return (
              <li
                key={entity.placeholder}
                className={shown ? 'entity entity--shown' : 'entity'}
              >
                <div className="entity-main">
                  <span className={`type-tag type--${entity.type}`}>
                    {TYPE_LABELS[entity.type]}
                  </span>
                  <span className="entity-source">{SOURCE_LABELS[entity.source]}</span>
                </div>

                <div className="entity-flow">
                  <span className="entity-value">{entity.value}</span>
                  <ArrowIcon className="entity-arrow" />
                  {shown ? (
                    <span className="entity-placeholder">Sent as it is</span>
                  ) : (
                    <code className="entity-placeholder">{entity.placeholder}</code>
                  )}
                </div>

                <button
                  type="button"
                  className="entity-toggle"
                  onClick={() => onToggle(entity.placeholder)}
                >
                  {shown ? 'Hide again' : 'Show to AI'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
