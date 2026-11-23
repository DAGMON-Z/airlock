import { Fragment, type ReactNode } from 'react'

export interface Mark {
  /** Exact text to find in the source. */
  text: string
  className: string
  title?: string
}

interface Hit {
  start: number
  end: number
  mark: Mark
}

/**
 * Splits `source` into plain text and <span>s, one per occurrence of each mark.
 * Where marks overlap, the one that starts first (then the longer one) wins.
 */
export function markText(source: string, marks: readonly Mark[]): ReactNode[] {
  const hits: Hit[] = []
  for (const mark of marks) {
    if (mark.text === '') continue
    let idx = source.indexOf(mark.text)
    while (idx !== -1) {
      hits.push({ start: idx, end: idx + mark.text.length, mark })
      idx = source.indexOf(mark.text, idx + mark.text.length)
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end)

  const nodes: ReactNode[] = []
  let cursor = 0
  let key = 0
  for (const hit of hits) {
    if (hit.start < cursor) continue
    if (hit.start > cursor) {
      nodes.push(<Fragment key={key++}>{source.slice(cursor, hit.start)}</Fragment>)
    }
    nodes.push(
      <span key={key++} className={hit.mark.className} title={hit.mark.title}>
        {hit.mark.text}
      </span>,
    )
    cursor = hit.end
  }
  if (cursor < source.length) {
    nodes.push(<Fragment key={key++}>{source.slice(cursor)}</Fragment>)
  }
  return nodes
}
