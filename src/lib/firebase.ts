import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai'

/** Reads a VITE_ variable, treating empty strings as unset. */
export function readEnv(name: string): string | undefined {
  const value: unknown = import.meta.env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

const config: FirebaseOptions = {
  apiKey: readEnv('VITE_FIREBASE_API_KEY'),
  authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv('VITE_FIREBASE_APP_ID'),
}

export const firebaseConfigured: boolean = Boolean(
  readEnv('VITE_FIREBASE_API_KEY') && readEnv('VITE_FIREBASE_PROJECT_ID') && readEnv('VITE_FIREBASE_APP_ID'),
)

const APP_CHECK_SITE_KEY = readEnv('VITE_RECAPTCHA_ENTERPRISE_SITE_KEY')
const APP_CHECK_DEBUG_TOKEN = readEnv('VITE_APPCHECK_DEBUG_TOKEN')

/** App Check reads this global to accept a registered debug token in local development. */
function setAppCheckDebugToken(value: string | true): void {
  ;(globalThis as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | true }).FIREBASE_APPCHECK_DEBUG_TOKEN = value
}

function startAppCheck(app: FirebaseApp): void {
  if (!APP_CHECK_SITE_KEY) return
  // The debug token must be set before initializeAppCheck runs.
  if (APP_CHECK_DEBUG_TOKEN) setAppCheckDebugToken(APP_CHECK_DEBUG_TOKEN)
  else if (import.meta.env.DEV) setAppCheckDebugToken(true)
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    })
  } catch (error) {
    console.warn('App Check could not start; requests will not carry an App Check token.', error)
  }
}

let aiInstance: AI | undefined

/** Lazily creates the Firebase AI Logic instance. Throws when Firebase is not configured. */
export function getAi(): AI {
  if (!firebaseConfigured) throw new Error('Firebase is not configured')
  if (!aiInstance) {
    const app = getApps().length > 0 ? getApp() : initializeApp(config)
    startAppCheck(app)
    aiInstance = getAI(app, { backend: new GoogleAIBackend() })
  }
  return aiInstance
}
