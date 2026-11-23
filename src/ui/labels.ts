import type { DetectionSource, EntityType } from '../lib/types'

export const TYPE_ORDER: readonly EntityType[] = [
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

export const TYPE_LABELS: Record<EntityType, string> = {
  NAME: 'Name',
  ID: 'ID number',
  PHONE: 'Phone',
  EMAIL: 'Email',
  ADDRESS: 'Address',
  DOB: 'Date of birth',
  ACCOUNT: 'Account number',
  ORG: 'Organisation',
  OTHER: 'Other',
}

export const SOURCE_LABELS: Record<DetectionSource, string> = {
  model: 'found by on-device AI',
  pattern: 'found by pattern check',
  manual: 'added by you',
}

/** "1 detail" / "7 details". */
export function plural(count: number, one: string, many: string = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** Plain-language message for anything unexpected. */
export function messageOf(err: unknown): string {
  return err instanceof Error && err.message !== ''
    ? err.message
    : 'Something went wrong. Please try again.'
}
