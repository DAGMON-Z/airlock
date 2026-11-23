// The only module that calls models. Local (on-device) calls use
// ONLY_ON_DEVICE so they can never fall back to the cloud. The cloud call is
// gated by findLeaks() so no redacted value can leave the device.

import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  type GenerativeModel,
} from 'firebase/ai'
import { firebaseConfigured, getAi, readEnv } from './firebase'
import {
  applyVault,
  buildVault,
  chunkText,
  detectPatterns,
  findLeaks,
  rehydrate,
  valueSource,
  type Found,
} from './redact'
import type {
  DetectionResult,
  EntityType,
  Entity,
  Explanation,
  InferenceWhere,
  LocalModelStatus,
  Vault,
} from './types'

const ENTITY_TYPES: readonly EntityType[] = [
  'NAME',
  'ID',
  'PHONE',
  'EMAIL',
  'ADDRESS',
  'DOB',
  'ACCOUNT',
  'ORG',
  'OTHER',
]

const DEFAULT_CLOUD_MODEL = 'gemini-3.5-flash-lite'
const MAX_IMAGE_SIDE = 1600
const PHOTO_UNAVAILABLE =
  'Reading photos needs the on-device model, which is not available in this browser. Paste the text instead.'
const LOCAL_ONLY_WARNING =
  'On-device model not available — only pattern matching ran. Review carefully and hide names by selecting them.'

export class LeakError extends Error {
  leaks: Entity[]

  constructor(leaks: Entity[]) {
    super('Refusing to send: private details would have left the device.')
    this.name = 'LeakError'
    this.leaks = leaks
  }
}

// ---------------------------------------------------------------------------
// Chrome's on-device model (Prompt API). Not in the TypeScript DOM lib, so typed here.
// ---------------------------------------------------------------------------

interface LanguageModelGlobal {
  availability: (options?: AvailabilityOptions) => Promise<string>
}

interface AvailabilityOptions {
  expectedInputs?: Array<{ type: string; languages?: string[] }>
  expectedOutputs?: Array<{ type: string; languages?: string[] }>
}

const AVAILABILITY_OPTIONS: AvailabilityOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
}

function languageModelGlobal(): LanguageModelGlobal | undefined {
  if (!('LanguageModel' in globalThis)) return undefined
  return (globalThis as unknown as { LanguageModel?: LanguageModelGlobal }).LanguageModel
}

function toStatus(raw: string): LocalModelStatus {
  switch (raw) {
    case 'available':
    case 'readily': // older Chrome builds
      return 'available'
    case 'downloadable':
    case 'after-download':
      return 'downloadable'
    case 'downloading':
      return 'downloading'
    default:
      return 'unavailable'
  }
}

export async function getLocalStatus(): Promise<LocalModelStatus> {
  const model = languageModelGlobal()
  if (!model) return 'unavailable'
  try {
    return toStatus(await model.availability(AVAILABILITY_OPTIONS))
  } catch {
    try {
      return toStatus(await model.availability())
    } catch {
      return 'unavailable'
    }
  }
}

function deviceModel(responseConstraint?: object): GenerativeModel {
  return getGenerativeModel(getAi(), {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: responseConstraint ? { promptOptions: { responseConstraint } } : undefined,
  })
}

export async function prepareLocalModel(onProgress?: (fraction: number) => void): Promise<LocalModelStatus> {
  try {
    const status = await getLocalStatus()
    if (firebaseConfigured && status !== 'unavailable') {
      await deviceModel().initializeDeviceModel(onProgress)
    }
    return await getLocalStatus()
  } catch {
    return 'unavailable'
  }
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

interface ModelImage {
  data: string
  mimeType: string
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'))
    reader.onload = () => {
      const url = String(reader.result)
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

function drawToBlob(source: ImageBitmap, width: number, height: number, mimeType: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('Canvas is not available in this browser.'))
  context.drawImage(source, 0, 0, width, height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be converted.'))),
      mimeType,
      0.92,
    ),
  )
}

/** Re-encodes any image as JPEG or PNG, downscaled so its longest side is at most MAX_IMAGE_SIDE. */
async function toModelImage(file: File): Promise<ModelImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('That image could not be read. Try a JPEG or PNG photo, or paste the text instead.')
  }
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const mimeType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    const blob = await drawToBlob(bitmap, width, height, mimeType)
    return { data: await blobToBase64(blob), mimeType }
  } finally {
    bitmap.close()
  }
}

const TRANSCRIBE_PROMPT =
  'Transcribe the document in this image exactly as written, as plain text. ' +
  'Keep the original line breaks and the order of the text. ' +
  'Output only the transcription, with no commentary, headings or markdown.'

export async function transcribeImage(file: File): Promise<string> {
  if (!firebaseConfigured || (await getLocalStatus()) !== 'available') {
    throw new Error(PHOTO_UNAVAILABLE)
  }
  const image = await toModelImage(file)
  const result = await deviceModel().generateContent([
    TRANSCRIBE_PROMPT,
    { type: 'inlineData', inlineData: image },
  ])
  const text = result.response.text().trim()
  if (!text) throw new Error('No readable text was found in that photo.')
  return text
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const DETECTION_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          type: { type: 'string', enum: [...ENTITY_TYPES] },
        },
        required: ['text', 'type'],
      },
    },
  },
  required: ['entities'],
}

function detectionPrompt(chunk: string): string {
  return `You are a privacy assistant. Read the document below and list every piece of text that could identify a specific person or account. Include:
- names of people (patient, doctor, landlord, tenant, signatory, family members)
- ID, record, passport, medical record and case numbers
- phone numbers, email addresses and street addresses
- dates of birth
- bank, card and account numbers
- names of small organisations, such as a specific clinic or employer

Copy each item EXACTLY as written in the document, character for character.
Do NOT list medical values, test names, measurements, amounts, medications, generic terms, or dates other than dates of birth.

Reply with JSON only, in this shape: {"entities":[{"text":"...","type":"NAME"}]}
Allowed types: ${ENTITY_TYPES.join(', ')}.

DOCUMENT:
${chunk}`
}

interface ModelItem {
  text: string
  type: EntityType
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value)
}

/** Parses the model's JSON reply. Returns null when the reply is unusable. */
function parseModelItems(raw: string): ModelItem[] | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let data: unknown
  try {
    data = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (!isRecord(data)) return null
  const list: unknown = data.entities
  if (!Array.isArray(list)) return null

  const items: ModelItem[] = []
  for (const item of list as unknown[]) {
    if (!isRecord(item) || typeof item.text !== 'string') continue
    const type = typeof item.type === 'string' && isEntityType(item.type) ? item.type : 'OTHER'
    items.push({ text: item.text, type })
  }
  return items
}

/** Keeps a model suggestion only if it really occurs in the chunk, and returns the document's own spelling. */
function locate(item: ModelItem, chunk: string): Found | null {
  const value = item.text.trim()
  if (value.length < 2) return null
  const match = new RegExp(valueSource(value), 'iu').exec(chunk)
  return match ? { value: match[0], type: item.type, source: 'model' } : null
}

interface OnDeviceOutcome {
  found: Found[]
  succeeded: number
  failed: number
}

async function detectOnDevice(chunks: string[]): Promise<OnDeviceOutcome> {
  const outcome: OnDeviceOutcome = { found: [], succeeded: 0, failed: 0 }
  let model: GenerativeModel
  try {
    model = deviceModel(DETECTION_SCHEMA)
  } catch {
    outcome.failed = chunks.length
    return outcome
  }

  for (const chunk of chunks) {
    try {
      const result = await model.generateContent(detectionPrompt(chunk))
      // Detection must never run in the cloud; treat that as a failed chunk.
      if (result.response.inferenceSource === InferenceSource.IN_CLOUD) {
        outcome.failed++
        continue
      }
      const items = parseModelItems(result.response.text())
      if (items === null) {
        outcome.failed++
        continue
      }
      outcome.succeeded++
      for (const item of items) {
        const found = locate(item, chunk)
        if (found) outcome.found.push(found)
      }
    } catch {
      outcome.failed++
    }
  }
  return outcome
}

/**
 * Finds identifiers. Pattern matching always runs. The on-device model runs
 * when it is available, and a chunk that fails does not fail the whole call.
 */
export async function detectEntities(text: string, existing?: Vault): Promise<DetectionResult> {
  const found: Found[] = detectPatterns(text)
  const warnings: string[] = []
  let detectedBy: InferenceWhere = 'none'

  const chunks = chunkText(text)
  if (chunks.length > 0 && firebaseConfigured && (await getLocalStatus()) === 'available') {
    const outcome = await detectOnDevice(chunks)
    found.push(...outcome.found)
    if (outcome.succeeded > 0) detectedBy = 'on_device'
    if (outcome.succeeded > 0 && outcome.failed > 0) {
      warnings.push(`${outcome.failed} of ${chunks.length} sections could not be checked on-device. Review carefully.`)
    }
  }
  if (detectedBy === 'none' && chunks.length > 0) warnings.push(LOCAL_ONLY_WARNING)

  return { vault: buildVault(found, existing), detectedBy, warnings }
}

// ---------------------------------------------------------------------------
// Explanation (cloud)
// ---------------------------------------------------------------------------

const EXPLAIN_RULES = `The document has been anonymised. Tokens in square brackets such as [NAME_1] or [ID_1] are placeholders for private details.
- Keep every placeholder EXACTLY as written, in square brackets, whenever you refer to it.
- Never guess or invent what a placeholder stands for.
- Only use a placeholder when you mean the exact detail it replaces in the document. Never attach one to a different item, a test result or a question, for example in brackets after it.
- Explain in plain, simple language for a non-expert, in the same language as the document.`

const EXPLAIN_STRUCTURE = `Use this structure, with these headings in bold:
**In short**: 1 to 2 sentences.
**What it says**: short bullet points.
**Things to notice**: anything unusual, out of range, a deadline or a risk.
**Questions to ask**: 2 to 4 questions for the doctor, lawyer or bank.
End with one short line saying this is general information, not professional advice.`

function explainPrompt(document: string, question: string | undefined): string {
  if (question) {
    return `${EXPLAIN_RULES}

Answer the question below about the document, concisely, in plain language. End with one short line saying this is general information, not professional advice.

DOCUMENT:
<<<
${document}
>>>

QUESTION: ${question}`
  }
  return `${EXPLAIN_RULES}

${EXPLAIN_STRUCTURE}

DOCUMENT:
<<<
${document}
>>>`
}

function sourceOf(raw: InferenceSource | undefined): InferenceWhere {
  return raw === InferenceSource.ON_DEVICE ? 'on_device' : 'in_cloud'
}

function cloudModelName(): string {
  return readEnv(import.meta.env.VITE_CLOUD_MODEL) ?? DEFAULT_CLOUD_MODEL
}

export async function explain(args: {
  redactedText: string
  vault: Vault
  question?: string
  onChunk?: (rehydratedSoFar: string) => void
}): Promise<Explanation> {
  const { redactedText, question, onChunk } = args
  const trimmedQuestion = question?.trim() ? question.trim() : undefined

  // A follow-up question can contain a new phone number, email or ID that the
  // document never had. Hide those too, for this request only.
  const vault = trimmedQuestion ? buildVault(detectPatterns(trimmedQuestion), args.vault) : args.vault

  // Redact again here: the document and question must be safe whatever the caller passed.
  const safeDocument = applyVault(redactedText, vault)
  const safeQuestion = trimmedQuestion ? applyVault(trimmedQuestion, vault) : undefined

  // Last gate before the network: nothing redacted may appear in what is sent.
  const leaks = findLeaks(`${safeDocument}\n${safeQuestion ?? ''}`, vault)
  if (leaks.length > 0) throw new LeakError(leaks)

  const model = getGenerativeModel(getAi(), {
    mode: InferenceMode.PREFER_IN_CLOUD,
    inCloudParams: { model: cloudModelName() },
  })
  const stream = await model.generateContentStream(explainPrompt(safeDocument, safeQuestion))

  let rawText = ''
  for await (const chunk of stream.stream) {
    try {
      rawText += chunk.text()
    } catch {
      // A chunk with no text (for example a blocked candidate) is skipped.
    }
    onChunk?.(rehydrate(rawText, vault))
  }

  const response = await stream.response
  return {
    text: rehydrate(rawText, vault),
    rawText,
    source: sourceOf(response.inferenceSource),
  }
}
