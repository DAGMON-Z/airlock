// Pure redaction helpers. No network, no Firebase: safe to unit test and to
// run anywhere. The vault these functions build never leaves the device.

import type { DetectionSource, Entity, EntityType, Vault } from './types'

export interface Found {
  value: string
  type: EntityType
  source: DetectionSource
}

// ---------------------------------------------------------------------------
// Normalisation and flexible matching
// ---------------------------------------------------------------------------

function norm(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function escapeRegex(text: string): string {
  // Only syntax characters: escaping anything else is invalid under the `u` flag.
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const WORD_CHAR = /[\p{L}\p{N}_]/u

/**
 * Regex source that matches a value case-insensitively, tolerates any run of
 * whitespace (including line breaks) between its words, and only matches whole
 * words when the value starts or ends with a word character.
 */
export function valueSource(value: string): string {
  const trimmed = value.trim()
  const body = trimmed.split(/\s+/).map(escapeRegex).join('\\s+')
  const first = trimmed.charAt(0)
  const last = trimmed.charAt(trimmed.length - 1)
  const before = WORD_CHAR.test(first) ? '(?<![\\p{L}\\p{N}_])' : ''
  const after = WORD_CHAR.test(last) ? '(?![\\p{L}\\p{N}_])' : ''
  return before + body + after
}

// ---------------------------------------------------------------------------
// Pattern detection (safety net for what the on-device model misses)
// ---------------------------------------------------------------------------

interface Rule {
  type: EntityType
  re: RegExp
  /** Index of the capture group that holds the private value. 0 = whole match. */
  group: number
  accept: (value: string) => boolean
}

const digitCount = (value: string): number => value.replace(/\D/g, '').length
const hasDigit = (value: string): boolean => /\d/.test(value)

// A value token: contains at least one digit, e.g. "448812", "CU-7741920", "X123".
const ID_TOKEN = '[A-Za-z0-9/-]*\\d[A-Za-z0-9/-]*'

const RULES: Rule[] = [
  {
    type: 'EMAIL',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/gd,
    group: 0,
    accept: () => true,
  },
  {
    type: 'ACCOUNT',
    re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/gd,
    group: 0,
    accept: (value) => {
      const compact = value.replace(/ /g, '')
      return compact.length >= 15 && compact.length <= 34 && hasDigit(compact)
    },
  },
  {
    type: 'DOB',
    re: /\b(?:DOB|D\.O\.B\.?|date of birth|born(?: on)?)\s*[:\-–]?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/gid,
    group: 1,
    accept: () => true,
  },
  {
    type: 'ACCOUNT',
    re: new RegExp(
      `\\b(?:bank\\s+account|account|acct|a/c)(?:\\s*(?:no\\.?|number|nr\\.?|#))?\\s*[:#]?\\s*(${ID_TOKEN}(?: ${ID_TOKEN})*)`,
      'gid',
    ),
    group: 1,
    accept: (value) => digitCount(value) >= 6,
  },
  {
    type: 'ID',
    re: new RegExp(
      `\\b(?:MRN|medical record(?: no\\.?| number)?|patient (?:id|no\\.?|number)|national id(?: no\\.?| number)?|NID|ID(?: no\\.?| number| #)?|passport(?: no\\.?| number)?|SSN|social security(?: no\\.?| number)?|file (?:no\\.?|number)|record (?:no\\.?|number)|reference (?:no\\.?|number)|case (?:no\\.?|number))\\s*[:#]?\\s*(${ID_TOKEN})`,
      'gid',
    ),
    group: 1,
    accept: (value) => value.length >= 3 && hasDigit(value),
  },
  {
    // Card-like: 13 to 19 digits split into groups by spaces or dashes.
    type: 'ACCOUNT',
    re: /(?<![\d+.-])\d+(?:[ -]\d+)+(?!\d)/gd,
    group: 0,
    accept: (value) => digitCount(value) >= 13 && digitCount(value) <= 19,
  },
  {
    type: 'PHONE',
    re: /\+\d{1,3}(?:[ .()-]*\d{1,4}){2,6}(?!\d)/gd,
    group: 0,
    accept: (value) => digitCount(value) >= 9 && digitCount(value) <= 15,
  },
  {
    type: 'PHONE',
    re: /(?<![\w+.])(?:\(\d{2,4}\)[ .-]?)?\d{2,4}(?:[ .-]\d{2,4}){1,4}(?!\w)/gd,
    group: 0,
    accept: (value) => {
      const digits = digitCount(value)
      if (digits < 9 || digits > 15) return false
      return /[()-]/.test(value) || /^0/.test(value) || /^\d{3} \d{3} \d{4}$/.test(value)
    },
  },
  {
    type: 'PHONE',
    re: /(?<![\d.,/+-])0\d{9,10}(?!\d)/gd,
    group: 0,
    accept: () => true,
  },
  {
    type: 'ID',
    re: /(?<![\d.,/+-])\d{9,}(?!\d)/gd,
    group: 0,
    accept: () => true,
  },
]

/** Finds identifiers with regular expressions. Returns unique, trimmed values. */
export function detectPatterns(text: string): Found[] {
  const claimed: Array<[number, number]> = []
  const seen = new Set<string>()
  const found: Found[] = []

  for (const rule of RULES) {
    for (const match of text.matchAll(rule.re)) {
      const span = match.indices?.[rule.group]
      if (!span) continue
      const [start, end] = span
      const value = text.slice(start, end).trim()
      if (!rule.accept(value)) continue
      // Earlier (more specific) rules win over later ones on the same text.
      if (claimed.some(([s, e]) => start < e && s < end)) continue
      claimed.push([start, end])

      const key = norm(value)
      if (key.length < 2 || seen.has(key)) continue
      seen.add(key)
      found.push({ value, type: rule.type, source: 'pattern' })
    }
  }
  return found
}

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

const PLACEHOLDER_SHAPE = /^\[([A-Za-z]+)_(\d+)\]$/

/** Canonical "TYPE_n" key so that "[name_1]" and "[NAME_1]" compare equal. */
function placeholderKey(placeholder: string): string {
  const match = PLACEHOLDER_SHAPE.exec(placeholder.trim())
  return match ? `${match[1].toUpperCase()}_${Number(match[2])}` : placeholder
}

/** Highest placeholder number already used for each type. */
function highestIndexByType(entities: Entity[]): Map<EntityType, number> {
  const highest = new Map<EntityType, number>()
  for (const entity of entities) {
    const match = /_(\d+)\]$/.exec(entity.placeholder)
    const n = match ? Number(match[1]) : 0
    highest.set(entity.type, Math.max(highest.get(entity.type) ?? 0, n))
  }
  return highest
}

/**
 * Adds newly found values to a vault. Existing entities keep their placeholders.
 * Values are deduplicated case-insensitively; values shorter than 2 characters are ignored.
 */
export function buildVault(found: Found[], existing?: Vault): Vault {
  const entities: Entity[] = existing ? [...existing.entities] : []
  const seen = new Set(entities.map((entity) => norm(entity.value)))
  const highest = highestIndexByType(entities)

  for (const item of found) {
    const value = item.value.trim()
    const key = norm(value)
    if (key.length < 2 || seen.has(key)) continue
    seen.add(key)

    const n = (highest.get(item.type) ?? 0) + 1
    highest.set(item.type, n)
    entities.push({
      value,
      type: item.type,
      placeholder: `[${item.type}_${n}]`,
      source: item.source,
      redacted: true,
    })
  }
  return { entities }
}

/**
 * Replaces every active (redacted) value with its placeholder in one pass, so
 * inserted placeholders are never rescanned. Longer values are tried first, so
 * "Ahmed Hassan" wins over "Ahmed".
 */
export function applyVault(text: string, vault: Vault): string {
  const active = vault.entities.filter((entity) => entity.redacted && norm(entity.value).length > 0)
  if (active.length === 0) return text

  const placeholderByKey = new Map<string, string>()
  for (const entity of active) placeholderByKey.set(norm(entity.value), entity.placeholder)

  const longestFirst = [...active].sort((a, b) => norm(b.value).length - norm(a.value).length)
  const pattern = new RegExp(longestFirst.map((entity) => valueSource(entity.value)).join('|'), 'giu')
  return text.replace(pattern, (match) => placeholderByKey.get(norm(match)) ?? match)
}

// Matches [NAME_1], [name_1], [NAME 1], **[NAME_1]** (asterisks sit outside the match)
// and bare NAME_1. Unknown types or numbers are left alone by rehydrate().
const PLACEHOLDER_ANY = /\[\s*([A-Za-z]+)[ _]+(\d+)\s*\]|\b([A-Za-z]+)_(\d+)\b/g

/** Puts real values back into text the model produced. */
export function rehydrate(text: string, vault: Vault): string {
  const valueByKey = new Map<string, string>()
  for (const entity of vault.entities) valueByKey.set(placeholderKey(entity.placeholder), entity.value)

  return text.replace(
    PLACEHOLDER_ANY,
    (match: string, bracketType?: string, bracketN?: string, bareType?: string, bareN?: string) => {
      const type = bracketType ?? bareType ?? ''
      const n = bracketN ?? bareN ?? ''
      return valueByKey.get(`${type.toUpperCase()}_${Number(n)}`) ?? match
    },
  )
}

/** Adds a value the user selected by hand. Returns a new vault. */
export function addManual(vault: Vault, value: string, type: EntityType = 'OTHER'): Vault {
  return buildVault([{ value, type, source: 'manual' }], vault)
}

/** Flips whether a value is redacted. Returns a new vault. */
export function toggleEntity(vault: Vault, placeholder: string): Vault {
  const key = placeholderKey(placeholder)
  return {
    entities: vault.entities.map((entity) =>
      placeholderKey(entity.placeholder) === key ? { ...entity, redacted: !entity.redacted } : entity,
    ),
  }
}

/** Redacted values that still appear in outgoing text. An empty result means it is safe to send. */
export function findLeaks(outgoing: string, vault: Vault): Entity[] {
  return vault.entities.filter((entity) => {
    if (!entity.redacted || norm(entity.value).length === 0) return false
    return new RegExp(valueSource(entity.value), 'iu').test(outgoing)
  })
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

function sliceLong(line: string, maxChars: number): string[] {
  const pieces: string[] = []
  for (let i = 0; i < line.length; i += maxChars) pieces.push(line.slice(i, i + maxChars))
  return pieces
}

/**
 * Splits text into chunks of at most maxChars, on line boundaries. A line is
 * only split when it alone exceeds maxChars.
 */
export function chunkText(text: string, maxChars = 2500): string[] {
  const chunks: string[] = []
  let current = ''

  const flush = (): void => {
    if (current.trim()) chunks.push(current)
    current = ''
  }

  for (const line of text.split('\n')) {
    if (line.length > maxChars) {
      flush()
      for (const piece of sliceLong(line, maxChars)) {
        if (piece.trim()) chunks.push(piece)
      }
      continue
    }
    const candidate = current === '' ? line : `${current}\n${line}`
    if (candidate.length > maxChars) {
      flush()
      current = line
    } else {
      current = candidate
    }
  }
  flush()
  return chunks
}
