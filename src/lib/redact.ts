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

/** Regex source matching a label in any letter case without the `i` flag, so name capitals still count. */
function anyCase(label: string): string {
  return label.replace(/[A-Za-z]/g, (ch) => `[${ch.toLowerCase()}${ch.toUpperCase()}]`)
}

// A capitalised word, e.g. "Samira", "O'Neil", "Al-Sayed". Words are joined by spaces or tabs only,
// never line breaks, so a name cannot run into the next line.
const CAP_WORD = "\\p{Lu}[\\p{L}'\u2019-]*"
const HONORIFIC = '(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof)\\.?'
const NAME_LABELS = [
  'patient name', 'full name', 'name', 'patient', 'landlord', 'tenant', 'lessor', 'lessee', 'referring doctor',
  'doctor', 'physician', 'consultant', 'customer name', 'customer', 'account holder', 'account name',
  'applicant', 'employee', 'policyholder', 'signed by', 'in the name of', 'attention', 'attn',
]
  .sort((a, b) => b.length - a.length)
  .map((label) => anyCase(label).replace(/ /g, '\\s+'))
  .join('|')
const ORG_LABELS = ['requesting clinic', 'clinic', 'hospital', 'employer', 'company', 'school', 'university']
  .sort((a, b) => b.length - a.length)
  .map((label) => anyCase(label).replace(/ /g, '\\s+'))
  .join('|')
const STREET_SUFFIX =
  'Street|St\\.?|Road|Rd\\.?|Avenue|Ave\\.?|Row|Lane|Ln\\.?|Drive|Boulevard|Blvd\\.?|Way|View|Close|Court|Place|Square|Terrace|Crescent|Highway|Gardens|Corniche'
// Comma-separated parts after the street: "Block C", "Riverside District", "Cairo 11511".
const ADDRESS_PART = `(?:Block|Building|Floor)\\s+\\w+|${CAP_WORD}(?:[ \\t]+${CAP_WORD})*(?:[ \\t]+\\d{3,6})?`

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
  },  {
    // "14 Juniper Row, Block C, Riverside District, Cairo 11511", "Flat 4, 17 Acacia Road, Nasr City".
    type: 'ADDRESS',
    re: new RegExp(
      `(?:(?:Flat|Apt\\.?|Apartment|Unit|Suite)\\s+\\w+,\\s*)?(?<![\\p{L}\\p{N}])\\d{1,5}[A-Za-z]?[ \\t]+(?:${CAP_WORD}[ \\t]+){0,3}(?:${STREET_SUFFIX})(?![\\p{L}])(?:,[ \\t]*(?:${ADDRESS_PART}))*`,
      'gdu',
    ),
    group: 0,
    accept: () => true,
  },
  {
    // A name after a label: "Patient name: Samira Noor Haddad", "Tenant: Lina Mahmoud Serag".
    type: 'NAME',
    re: new RegExp(
      `(?<![\\p{L}])(?:${NAME_LABELS})[ \\t]*[:\\-\u2013][ \\t]*(?:${HONORIFIC}[ \\t]+)?(${CAP_WORD}(?:[ \\t]+${CAP_WORD}){1,3})`,
      'gdu',
    ),
    group: 1,
    accept: () => true,
  },
  {
    // A name after a title: "Dr. Karim Adel Mansour", "Ms. Yasmin Kareem Adel", "Dear Ms. Adel".
    type: 'NAME',
    re: new RegExp(`(?<![\\p{L}])${HONORIFIC}[ \\t]+(${CAP_WORD}(?:[ \\t]+${CAP_WORD}){0,3})`, 'gdu'),
    group: 1,
    accept: (value) => value.length >= 3,
  },
  {
    // "in the name of Omar Tarek Fawzy" (no colon).
    type: 'NAME',
    re: new RegExp(`(?<![\\p{L}])${anyCase('in the name of')}[ \\t]+(${CAP_WORD}(?:[ \\t]+${CAP_WORD}){1,3})`, 'gdu'),
    group: 1,
    accept: () => true,
  },
  {
    // An organisation after a label: "Requesting clinic: Lakeview Family Health Clinic".
    type: 'ORG',
    re: new RegExp(`(?<![\\p{L}])(?:${ORG_LABELS})[ \\t]*:[ \\t]*(${CAP_WORD}(?:[ \\t]+${CAP_WORD}){0,5})`, 'gdu'),
    group: 1,
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

/** The words of a value, normalised, e.g. "Yasmin Kareem Adel" -> ["yasmin", "kareem", "adel"]. */
function wordsOf(value: string): string[] {
  return norm(value).split(' ')
}

/**
 * Adds newly found values to a vault. Existing entities keep their placeholders.
 * Values are deduplicated case-insensitively; values shorter than 2 characters are ignored.
 * A one-word name that is part of a longer name ("Adel" in "Yasmin Kareem Adel") shares that
 * name's placeholder, so the cloud model sees one person, not two.
 */
export function buildVault(found: Found[], existing?: Vault): Vault {
  const entities: Entity[] = existing ? [...existing.entities] : []
  const seen = new Set(entities.map((entity) => norm(entity.value)))
  const highest = highestIndexByType(entities)

  const isNamePart = (item: Found): boolean =>
    item.type === 'NAME' &&
    wordsOf(item.value).length === 1 &&
    [...entities, ...found].some(
      (other) => other.type === 'NAME' && wordsOf(other.value).length > 1 && wordsOf(other.value).includes(norm(item.value)),
    )

  const parts = found.filter(isNamePart)
  for (const item of found) {
    if (parts.includes(item)) continue
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

  for (const item of parts) {
    const value = item.value.trim()
    const key = norm(value)
    if (key.length < 2 || seen.has(key)) continue
    const whole = entities.find(
      (entity) => entity.type === 'NAME' && wordsOf(entity.value).length > 1 && wordsOf(entity.value).includes(key),
    )
    if (!whole) continue
    seen.add(key)
    entities.push({ value, type: 'NAME', placeholder: whole.placeholder, source: item.source, redacted: whole.redacted })
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
  for (const entity of vault.entities) {
    // When a surname shares a full name's placeholder, the full name (added first) is put back.
    const key = placeholderKey(entity.placeholder)
    if (!valueByKey.has(key)) valueByKey.set(key, entity.value)
  }

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
