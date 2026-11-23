import { useId, type ReactNode, type RefObject } from 'react'
import { ArrowIcon, DeviceIcon } from './icons'

interface DocumentPaneProps {
  tone: 'device' | 'sent'
  title: string
  caption: string
  nodes: ReactNode[]
  bodyRef: RefObject<HTMLDivElement | null>
  onScroll: () => void
}

export function DocumentPane({ tone, title, caption, nodes, bodyRef, onScroll }: DocumentPaneProps) {
  const titleId = useId()
  return (
    <section className={`doc-pane doc-pane--${tone}`} aria-labelledby={titleId}>
      <header className="doc-pane__head">
        {tone === 'device' ? <DeviceIcon /> : <ArrowIcon />}
        <div>
          <h2 id={titleId} className="doc-pane__title">
            {title}
          </h2>
          <p className="doc-pane__caption">{caption}</p>
        </div>
      </header>
      <div
        ref={bodyRef}
        className="doc-pane__body"
        tabIndex={0}
        aria-labelledby={titleId}
        onScroll={onScroll}
      >
        <div className="doc-text">{nodes}</div>
      </div>
    </section>
  )
}
