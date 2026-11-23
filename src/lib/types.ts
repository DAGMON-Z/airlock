// Shared contract between the privacy engine (src/lib) and the UI (src/ui).
// Do not change these shapes without updating both sides.

export type EntityType =
  | 'NAME'
  | 'ID'
  | 'PHONE'
  | 'EMAIL'
  | 'ADDRESS'
  | 'DOB'
  | 'ACCOUNT'
  | 'ORG'
  | 'OTHER'

/** How an identifier was found. */
export type DetectionSource = 'model' | 'pattern' | 'manual'

/** One private value and the placeholder that stands in for it. */
export interface Entity {
  /** Exact text as it appears in the document, e.g. "Ahmed Hassan". */
  value: string
  type: EntityType
  /** Placeholder sent to the cloud instead, e.g. "[NAME_1]". */
  placeholder: string
  source: DetectionSource
  /** false = the user chose to let this value through. */
  redacted: boolean
}

/** The vault never leaves the device. */
export interface Vault {
  entities: Entity[]
}

export type InferenceWhere = 'on_device' | 'in_cloud' | 'none'

export type LocalModelStatus =
  | 'checking'
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'

export interface DetectionResult {
  vault: Vault
  /** 'on_device' when Gemini Nano ran, 'none' when only patterns ran. */
  detectedBy: InferenceWhere
  /** Human-readable notes, e.g. "Local model unavailable, pattern-only mode". */
  warnings: string[]
}

export interface Explanation {
  /** Text with real values put back in. */
  text: string
  /** Text exactly as the model produced it (placeholders still in). */
  rawText: string
  source: InferenceWhere
}

export interface SampleDoc {
  id: string
  title: string
  kind: string
  text: string
}
