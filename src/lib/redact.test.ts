import { describe, expect, it } from 'vitest'
import {
  addManual,
  applyVault,
  buildVault,
  chunkText,
  detectPatterns,
  findLeaks,
  rehydrate,
  toggleEntity,
} from './redact'
import type { EntityType, Vault } from './types'

const LAB_REPORT = `NORTHVALE MEDICAL LABORATORY
Patient name: Samira Noor Haddad
Date of birth: 14 March 1984
MRN: 448812
Patient phone: +20 100 123 4567
Referring doctor: Dr. Karim Adel Mansour
Email: samira.haddad@example.com

TEST                 RESULT       REFERENCE RANGE   FLAG
Haemoglobin          10.9 g/dL    12.0 - 15.5       LOW
Ferritin             9 ug/L       15 - 150          LOW
ALT                  58 U/L       7 - 40            HIGH
Fasting glucose      5.4 mmol/L   3.9 - 5.5
Samira Noor Haddad has a repeat test booked.`

function vaultOf(...values: Array<[string, EntityType]>): Vault {
  return buildVault(values.map(([value, type]) => ({ value, type, source: 'pattern' })))
}

const valuesOf = (found: ReturnType<typeof detectPatterns>): string[] => found.map((f) => f.value)

describe('detectPatterns', () => {
  it('flags email addresses', () => {
    expect(valuesOf(detectPatterns('Write to samira.haddad@example.com today'))).toContain(
      'samira.haddad@example.com',
    )
  })

  it.each(['+20 100 123 4567', '(555) 123-4567', '01001234567'])('flags phone number %s as PHONE', (phone) => {
    const found = detectPatterns(`Call me on ${phone} after noon`)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ type: 'PHONE', value: phone })
  })

  it('flags IBANs and card-like digit groups as ACCOUNT', () => {
    const found = detectPatterns('Rent to IBAN EG00 1234 5678 9012 3456 7890 1234 or card 4111 1111 1111 1111')
    expect(found.filter((f) => f.type === 'ACCOUNT').map((f) => f.value)).toEqual([
      'EG00 1234 5678 9012 3456 7890 1234',
      '4111 1111 1111 1111',
    ])
  })

  it('captures only the identifier value for labelled IDs', () => {
    expect(valuesOf(detectPatterns('MRN: 448812'))).toEqual(['448812'])
    expect(valuesOf(detectPatterns('ID No. A1234567'))).toEqual(['A1234567'])
    expect(valuesOf(detectPatterns('Passport: X123'))).toEqual(['X123'])
    expect(valuesOf(detectPatterns('SSN 123-45-6789'))).toEqual(['123-45-6789'])
  })

  it('captures only the date for a labelled date of birth', () => {
    const found = detectPatterns('Date of birth: 14 March 1984 (adult)')
    expect(found).toEqual([{ value: '14 March 1984', type: 'DOB', source: 'pattern' }])
  })

  it('does not flag lab values, amounts, or unlabelled dates', () => {
    const text = [
      'Haemoglobin 13.5 g/dL, reference 13.5-17.5',
      'Platelets 250 mg/dL and WBC 9.8',
      'Total due EGP 12,500.00 on 03 November 2026',
      'Visit on 2026-11-12 at 08:15',
    ].join('\n')
    expect(detectPatterns(text)).toEqual([])
  })

  it('returns unique, trimmed values', () => {
    const found = detectPatterns('MRN: 448812 and again MRN:   448812')
    expect(found.map((f) => f.value)).toEqual(['448812'])
  })

  it('flags names after a label, a title, or "in the name of"', () => {
    const text = [
      'Patient name: Samira Noor Haddad',
      'TENANT: Lina Mahmoud Serag, National ID 1',
      'Referring doctor: Dr. Karim Adel Mansour',
      'Dear Ms. Adel,',
      'payable in the name of Omar Tarek Fawzy.',
    ].join('\n')
    const names = detectPatterns(text).filter((f) => f.type === 'NAME').map((f) => f.value)
    expect(names).toEqual(['Samira Noor Haddad', 'Lina Mahmoud Serag', 'Karim Adel Mansour', 'Adel', 'Omar Tarek Fawzy'])
  })

  it('never lets a name run onto the next line or swallow lowercase words', () => {
    expect(valuesOf(detectPatterns('Patient name: Samira Haddad\nDate Of Visit'))).toEqual(['Samira Haddad'])
    expect(detectPatterns('the tenant pays a late fee')).toEqual([])
    expect(detectPatterns('Name: please fill in')).toEqual([])
  })

  it('flags street addresses with their area and postcode', () => {
    expect(valuesOf(detectPatterns('Lab, 14 Juniper Row, Block C, Riverside District, Cairo 11511\nTel'))).toEqual([
      '14 Juniper Row, Block C, Riverside District, Cairo 11511',
    ])
    expect(valuesOf(detectPatterns('Property. Flat 4, 17 Acacia Road, Nasr City, Cairo, including parking.'))).toEqual([
      'Flat 4, 17 Acacia Road, Nasr City, Cairo',
    ])
  })

  it('flags a labelled clinic or employer as ORG', () => {
    const found = detectPatterns('Requesting clinic: Lakeview Family Health Clinic, Maadi')
    expect(found).toContainEqual({ value: 'Lakeview Family Health Clinic', type: 'ORG', source: 'pattern' })
  })

  it('does not flag test names or sentences as names or addresses', () => {
    const text = [
      'Vitamin D (25-OH) 22 nmol/L 50 - 125 LOW',
      'Repeat the ferritin test in 8 weeks.',
      'Either party may end this agreement with 60 days notice.',
      'Doctor: please review',
    ].join('\n')
    expect(detectPatterns(text)).toEqual([])
  })
})

describe('buildVault', () => {
  it('numbers placeholders per type from 1', () => {
    const vault = buildVault([
      { value: 'Ahmed Hassan', type: 'NAME', source: 'model' },
      { value: 'Mona Ali', type: 'NAME', source: 'model' },
      { value: '448812', type: 'ID', source: 'pattern' },
    ])
    expect(vault.entities.map((e) => e.placeholder)).toEqual(['[NAME_1]', '[NAME_2]', '[ID_1]'])
    expect(vault.entities.every((e) => e.redacted)).toBe(true)
  })

  it('gives a surname on its own the placeholder of the full name it belongs to', () => {
    const vault = buildVault([
      { value: 'Adel', type: 'NAME', source: 'pattern' },
      { value: 'Yasmin Kareem Adel', type: 'NAME', source: 'pattern' },
      { value: 'Mona Ali', type: 'NAME', source: 'pattern' },
    ])
    expect(vault.entities.map((e) => [e.value, e.placeholder])).toEqual([
      ['Yasmin Kareem Adel', '[NAME_1]'],
      ['Mona Ali', '[NAME_2]'],
      ['Adel', '[NAME_1]'],
    ])
    const sent = applyVault('Ms. Yasmin Kareem Adel\nDear Ms. Adel,', vault)
    expect(sent).toBe('Ms. [NAME_1]\nDear Ms. [NAME_1],')
    expect(rehydrate('Write to [NAME_1].', vault)).toBe('Write to Yasmin Kareem Adel.')
    // Showing the full name shows the surname too: they are one person.
    expect(toggleEntity(vault, '[NAME_1]').entities.filter((e) => !e.redacted).map((e) => e.value)).toEqual([
      'Yasmin Kareem Adel',
      'Adel',
    ])
  })

  it('deduplicates case-insensitively and ignores values shorter than 2 characters', () => {
    const vault = buildVault([
      { value: 'Ahmed Hassan', type: 'NAME', source: 'model' },
      { value: 'ahmed  hassan ', type: 'NAME', source: 'pattern' },
      { value: 'x', type: 'OTHER', source: 'model' },
    ])
    expect(vault.entities).toHaveLength(1)
    expect(vault.entities[0].value).toBe('Ahmed Hassan')
  })

  it('keeps one entity when model and pattern report the same value', () => {
    const vault = buildVault([
      { value: '448812', type: 'ID', source: 'model' },
      { value: '448812', type: 'ID', source: 'pattern' },
    ])
    expect(vault.entities).toHaveLength(1)
    expect(vault.entities[0].source).toBe('model')
  })

  it('keeps existing entities unchanged and continues numbering after them', () => {
    const first = buildVault([{ value: 'Ahmed Hassan', type: 'NAME', source: 'model' }])
    const second = buildVault([{ value: 'Mona Ali', type: 'NAME', source: 'model' }], first)
    expect(second.entities[0]).toEqual(first.entities[0])
    expect(second.entities[1].placeholder).toBe('[NAME_2]')
  })
})

describe('applyVault and rehydrate', () => {
  it('replaces every occurrence, case-insensitively', () => {
    const vault = vaultOf(['Ahmed Hassan', 'NAME'])
    expect(applyVault('ahmed hassan met AHMED HASSAN.', vault)).toBe('[NAME_1] met [NAME_1].')
  })

  it('tolerates flexible whitespace and line breaks inside multi-word values', () => {
    const vault = vaultOf(['Ahmed Hassan', 'NAME'])
    expect(applyVault('Ahmed  Hassan and Ahmed\nHassan', vault)).toBe('[NAME_1] and [NAME_1]')
  })

  it('replaces longest values first so "Ahmed Hassan" wins over "Ahmed"', () => {
    const vault = vaultOf(['Ahmed', 'OTHER'], ['Ahmed Hassan', 'NAME'])
    const redacted = applyVault('Ahmed Hassan signed; Ahmed paid.', vault)
    expect(redacted).toBe('[NAME_1] signed; [OTHER_1] paid.')
  })

  it('does not replace inside an already-inserted placeholder', () => {
    // The value "NAME" must not be matched inside the placeholder "[NAME_1]".
    const vault = vaultOf(['Mona Ali', 'NAME'], ['NAME', 'OTHER'])
    expect(applyVault('[NAME_1] Mona Ali', vault)).toBe('[NAME_1] [NAME_1]')
    expect(applyVault('Mona Ali NAME', vault)).toBe('[NAME_1] [OTHER_1]')
  })

  it('does not replace a value that was toggled off', () => {
    const base = vaultOf(['Mona Ali', 'NAME'])
    const released = toggleEntity(base, '[NAME_1]')
    expect(applyVault('Mona Ali', released)).toBe('Mona Ali')
    expect(applyVault('Mona Ali', toggleEntity(released, '[NAME_1]'))).toBe('[NAME_1]')
  })

  it('tolerates placeholder variants the model may echo', () => {
    const vault = vaultOf(['Mona Ali', 'NAME'])
    expect(rehydrate('[NAME_1] / [name_1] / [NAME 1] / NAME_1', vault)).toBe(
      'Mona Ali / Mona Ali / Mona Ali / Mona Ali',
    )
    expect(rehydrate('**[NAME_1]** is due.', vault)).toBe('**Mona Ali** is due.')
  })

  it('leaves unknown placeholders as they are', () => {
    const vault = vaultOf(['Mona Ali', 'NAME'])
    expect(rehydrate('[NAME_9] and [PHONE_1] stay put', vault)).toBe('[NAME_9] and [PHONE_1] stay put')
  })

  it('round-trips a realistic lab report', () => {
    const patterns = buildVault(detectPatterns(LAB_REPORT))
    const vault = buildVault(
      [
        { value: 'Samira Noor Haddad', type: 'NAME', source: 'model' },
        { value: 'Dr. Karim Adel Mansour', type: 'NAME', source: 'model' },
      ],
      patterns,
    )
    const redacted = applyVault(LAB_REPORT, vault)

    expect(redacted).not.toContain('Samira')
    expect(redacted).not.toContain('448812')
    expect(redacted).not.toContain('+20 100 123 4567')
    expect(redacted).toContain('10.9 g/dL')
    expect(findLeaks(redacted, vault)).toEqual([])
    expect(rehydrate(redacted, vault)).toBe(LAB_REPORT)
  })
})

describe('findLeaks', () => {
  it('reports redacted values that still appear, ignoring case and whitespace', () => {
    const vault = vaultOf(['Mona Ali', 'NAME'], ['448812', 'ID'])
    const leaks = findLeaks('Patient mona   ALI, file 448812', vault)
    expect(leaks.map((e) => e.value)).toEqual(['Mona Ali', '448812'])
  })

  it('returns nothing for redacted text and for values let through', () => {
    const vault = toggleEntity(vaultOf(['Mona Ali', 'NAME']), '[NAME_1]')
    expect(findLeaks('Patient Mona Ali', vault)).toEqual([])
    expect(findLeaks('Patient [NAME_1]', vaultOf(['Mona Ali', 'NAME']))).toEqual([])
  })

  it('does not flag a placeholder that merely contains a type name', () => {
    const vault = vaultOf(['ID', 'OTHER'])
    expect(findLeaks('Record [ID_1] attached', vault)).toEqual([])
  })
})

describe('addManual and toggleEntity', () => {
  it('adds a manual value as OTHER by default and returns a new vault', () => {
    const before = vaultOf()
    const after = addManual(before, 'Lakeview Clinic')
    expect(before.entities).toHaveLength(0)
    expect(after.entities[0]).toMatchObject({
      value: 'Lakeview Clinic',
      type: 'OTHER',
      placeholder: '[OTHER_1]',
      source: 'manual',
      redacted: true,
    })
  })

  it('flips redaction for one placeholder without mutating the input', () => {
    const before = vaultOf(['Mona Ali', 'NAME'], ['448812', 'ID'])
    const after = toggleEntity(before, '[ID_1]')
    expect(before.entities[1].redacted).toBe(true)
    expect(after.entities.map((e) => e.redacted)).toEqual([true, false])
  })
})

describe('chunkText', () => {
  it('returns no chunks for empty text', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('  \n  ')).toEqual([])
  })

  it('keeps short text in one chunk', () => {
    expect(chunkText('one\ntwo\nthree')).toEqual(['one\ntwo\nthree'])
  })

  it('splits on line boundaries and never exceeds maxChars', () => {
    const text = Array.from({ length: 10 }, (_, i) => `line ${i} with text`).join('\n')
    const chunks = chunkText(text, 40)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(40)
      for (const line of chunk.split('\n')) expect(text.split('\n')).toContain(line)
    }
    expect(chunks.join('\n').split('\n')).toEqual(text.split('\n'))
  })

  it('splits a single over-long line, and only then', () => {
    const long = 'x'.repeat(25)
    expect(chunkText(`short\n${long}\nafter`, 10)).toEqual([
      'short',
      'xxxxxxxxxx',
      'xxxxxxxxxx',
      'xxxxx',
      'after',
    ])
  })

  it('does not split a line that exactly fits', () => {
    const line = 'y'.repeat(10)
    expect(chunkText(line, 10)).toEqual([line])
  })
})

describe('samples', () => {
  it('the family message has no labels, so the pattern check alone finds none of its names or places', async () => {
    const { samples } = await import('./samples')
    const message = samples.find((sample) => sample.id === 'family-message')
    expect(message).toBeDefined()
    const found = detectPatterns(message!.text).filter((f) => ['NAME', 'ORG', 'ADDRESS'].includes(f.type))
    expect(found).toEqual([])
  })
})
