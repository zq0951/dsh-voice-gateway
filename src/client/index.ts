/**
 * Voice Gateway client plugin, browser half.
 * Renders the VoiceControl button in conversation.input.right slot,
 * connects to Local Voice Gateway event stream via WebSocket,
 * filters speech by speaker voiceprint, injects into active session prompt,
 * and provides voiceprint enrollment panel.
 */
/// <reference path="../types/dsh-ambient.d.ts" />
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the renderer-owned slots service.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the conversation SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the Session standard props and Context merge (ctx.sessions).
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { VoiceControl } from './VoiceControl.tsx'
import { createVoiceManager } from './voice-service.ts'
import { en, zh } from './locales.ts'
import type { VoiceControlInjected } from './slots.ts'
import './slots.ts'

export type { VoiceKey } from './locales.ts'
export type { VoiceGatewayState, VoiceGatewayStatus, VoiceControlInjected } from './slots.ts'

const NS = 'voice'

/** Required services for the voice control slot and sessions prompt injection */
export const inject = ['slots', 'sessions', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'voice-gateway: dictionaries')

  const voiceManager = createVoiceManager(ctx)
  ctx.effect(() => () => {
    voiceManager.dispose()
  }, 'voice-gateway: voiceManager lifecycle')

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'voice-control',
    order: 5,
    locale: NS,
    inject: (_sessionId: SessionId): VoiceControlInjected => ({
      hooks: {
        voice: voiceManager,
      },
      setTriggerMode: (mode) => voiceManager.setTriggerMode(mode),
      setAutoSpeak: (enabled) => voiceManager.setAutoSpeak(enabled),
      stopSpeaking: () => voiceManager.stopSpeaking(),
      speakText: (text) => voiceManager.speakText(text),
      updateGatewayUrl: (url) => voiceManager.updateGatewayUrl(url),
      listProfiles: () => voiceManager.listProfiles(),
      deleteProfile: (name) => voiceManager.deleteProfile(name),
      startEnroll: (name, steps) => voiceManager.startEnroll(name, steps),
      recordEnrollStep: (sid) => voiceManager.recordEnrollStep(sid),
      finishEnroll: (sid) => voiceManager.finishEnroll(sid),
      abortEnroll: (sid) => voiceManager.abortEnroll(sid),
    }),
  }, VoiceControl))
}
