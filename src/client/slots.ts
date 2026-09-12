/// <reference path="../types/dsh-ambient.d.ts" />
import type { VoiceKey } from './locales.ts'
import type { VoiceSnapshot } from './voice-service.ts'

export interface HostObservable<T> {
  subscribe(listener: () => void): () => void
  getSnapshot(): T
}

export type PropsRuntime<S extends string = string> = {
  readonly slotName?: S
  [key: string]: unknown
}

export type PropsLocale<N extends string = string> = {
  t: (key: string, args?: Record<string, string | number>) => string
}

export type PropsHooks<HS extends Record<string, HostObservable<any>>> = {
  [N in keyof HS & string as `use${Capitalize<N>}`]: <Selected = HS[N] extends HostObservable<infer T> ? T : never>(
    selector: (snapshot: HS[N] extends HostObservable<infer T> ? T : never) => Selected,
  ) => Selected
}

export type InjectFace<I extends object> =
  I extends { hooks: infer HS extends Record<string, HostObservable<any>> }
    ? Omit<I, 'hooks'> & PropsHooks<HS>
    : I

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Voice interaction plugin copy. */
    voice: VoiceKey
  }
}

export type VoiceGatewayState = 'idle' | 'listening' | 'thinking' | 'generating' | 'speaking' | 'disconnected'

export interface VoiceGatewayStatus {
  status: string
  trigger_mode: string
  audio_duplex_mode: string
  auto_speak: boolean
  registered_speakers: string[]
  connected: boolean
}

export interface ProfileItem {
  name: string
  sample_count: number
  created_at?: string
  is_active?: boolean
}

export interface EnrollSession {
  session_id: string
  speaker_name: string
  total_steps: number
  current_step: number
  current_prompt?: string | undefined
  is_completed?: boolean
}

export interface StartEnrollResult {
  status: string
  session?: EnrollSession
  session_id?: string
  speaker_name?: string
  total_steps?: number
  current_step?: number
  current_prompt?: string
}

export interface RecordStepResult {
  status: string
  success?: boolean
  current_step?: number
  next_step?: number
  current_prompt?: string
  next_prompt?: string
  is_final_step?: boolean
  is_completed?: boolean
  error?: string
  message?: string
}

export interface FinishEnrollResult {
  status: string
  message?: string
  speaker_name?: string
}

export interface VoiceControlInjected {
  /** Observable voice gateway state source, bound to `useVoice` by the renderer. */
  hooks: {
    voice: HostObservable<VoiceSnapshot>
  }
  setTriggerMode: (mode: string) => Promise<void>
  setAutoSpeak: (enabled: boolean) => Promise<void>
  stopSpeaking: () => Promise<void>
  speakText: (text: string) => Promise<void>
  updateGatewayUrl: (url: string) => void
  listProfiles: () => Promise<ProfileItem[]>
  deleteProfile: (name: string) => Promise<boolean>
  startEnroll: (name: string, steps?: number) => Promise<StartEnrollResult>
  recordEnrollStep: (sessionId: string) => Promise<RecordStepResult>
  finishEnroll: (sessionId: string) => Promise<FinishEnrollResult>
  abortEnroll: (sessionId: string) => Promise<void>
}
