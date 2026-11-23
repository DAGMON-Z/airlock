import { Fragment, type ReactNode } from 'react'

type Block =
  | { kind: 'heading'; level: 3 | 4; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] }

/**
 * Turns the AI's plain-text answer into blocks. Understands "#"/"##" headings,
 * whole-line **bold** headings, "- " / "* " bullets, "1. " numbered items,
 * and blank lines as paragraph breaks. Nothing is parsed as HTML.
 */
function parseBlocks(source: string): Block[] {
  const out: Block[] = []
  let para: string[] = []
  let items: string[] = []
  let ordered = false

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    const bold = /^\*\*([^*]+)\*\*:?$/.exec(line)
    const item = bullet ?? numbered

    if (item) {
      if (para.length > 0) {
        out.push({ kind: 'paragraph', lines: para })
        para = []
      }
      const isNumbered = numbered !== null
      if (items.length > 0 && ordered !== isNumbered) {
        out.push({ kind: 'list', ordered, items })
        items = []
      }
      ordered = isNumbered
      items.push(item[1])
      continue
    }

    if (items.length > 0) {
      out.push({ kind: 'list', ordered, items })
      items = []
    }

    if (line === '') {
      if (para.length > 0) {
        out.push({ kind: 'paragraph', lines: para })
        para = []
      }
    } else if (heading) {
      if (para.length > 0) {
        out.push({ kind: 'paragraph', lines: para })
        para = []
      }
      out.push({ kind: 'heading', level: heading[1].length === 1 ? 3 : 4, text: heading[2] })
    } else if (bold) {
      if (para.length > 0) {
        out.push({ kind: 'paragraph', lines: para })
        para = []
      }
      out.push({ kind: 'heading', level: 4, text: bold[1] })
    } else {
      para.push(line)
    }
  }

  if (para.length > 0) out.push({ kind: 'paragraph', lines: para })
  if (items.length > 0) out.push({ kind: 'list', ordered, items })
  return out
}

/** Inline **bold** only. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
    if (part === '') return null
    const strong = /^\*\*([^*]+)\*\*$/.exec(part)
    return strong ? <strong key={i}>{strong[1]}</strong> : <Fragment key={i}>{part}</Fragment>
  })
}

interface AnswerTextProps {
  text: string
}

/** Renders the answer as React elements. Never uses innerHTML. */
export function AnswerText({ text }: AnswerTextProps) {
  return (
    <>
      {parseBlocks(text).map((block, i) => {
        if (block.kind === 'heading') {
          const Tag = block.level === 3 ? 'h3' : 'h4'
          return <Tag key={i}>{renderInline(block.text)}</Tag>
        }
        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul'
          return (
            <Tag key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </Tag>
          )
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </>
  )
}
