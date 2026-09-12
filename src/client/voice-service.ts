/// <reference path="../types/dsh-ambient.d.ts" />
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  HostObservable,
  VoiceGatewayState,
  VoiceGatewayStatus,
  ProfileItem,
  StartEnrollResult,
  RecordStepResult,
  FinishEnrollResult,
} from './slots.ts'

interface MessageContentBlock {
  type: string
  text?: string
}

interface MessageEventData {
  interrupted?: boolean
  message?: {
    content?: MessageContentBlock[]
  }
}

interface AssistantMessageEventPayload {
  time?: number
  seq: number
  data: MessageEventData
}

export interface VoiceEvent {
  event: string
  speaker?: string
  text?: string
  emotion?: string
  score?: number
  model?: string
  new_mode?: string
  enabled?: boolean
}

export interface VoiceSnapshot {
  state: VoiceGatewayState
  status: VoiceGatewayStatus
  gatewayUrl: string
}

type Listener = () => void

/** Cleans markdown syntax and formatting for natural text-to-speech synthesis. */
export function cleanSpeechText(text: string): string {
  if (!text) return ''
  let cleaned = text
  // 1. Code blocks replaced with a concise spoken indicator
  cleaned = cleaned.replace(/```[\s\S]*?```/g, ', code block omitted. ')
  // 2. Inline code
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1')
  // 3. Links and images
  cleaned = cleaned.replace(/!\[(.*?)\]\(.*?\)/g, '$1')
  cleaned = cleaned.replace(/\[(.*?)\]\(.*?\)/g, '$1')
  // 4. Markdown emphasis tokens (*, _, ~~)
  cleaned = cleaned.replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
  cleaned = cleaned.replace(/_{1,3}(.*?)_{1,3}/g, '$1')
  cleaned = cleaned.replace(/~~(.*?)~~/g, '$1')
  // 5. Headings, blockquotes, and list items
  cleaned = cleaned.replace(/^[#*>\-+]+\s*/gm, '')
  // 6. Isolated formatting tokens
  cleaned = cleaned.replace(/[*_~`|#\\]/g, '')
  // 7. Consecutive newlines converted to natural pauses
  cleaned = cleaned.replace(/\n+/g, ', ')
  return cleaned.trim()
}

/** Resolves HTTP and WebSocket URLs for the voice gateway, adapting to LAN or HTTPS/WSS. */
export function resolveGatewayUrls(customUrl?: string) {
  let baseUrl = customUrl || (typeof localStorage !== 'undefined' ? localStorage.getItem('dsh.voice.gateway_url') : null)
  if (!baseUrl) {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
    const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : '127.0.0.1'
    const proto = isHttps ? 'https:' : 'http:'
    baseUrl = `${proto}//${host}:8765`
  }
  baseUrl = baseUrl.replace(/\/+$/, '')
  const isHttps = baseUrl.startsWith('https:')
  const wsProto = isHttps ? 'wss:' : 'ws:'
  const httpProto = isHttps ? 'https:' : 'http:'
  const hostPart = baseUrl.replace(/^https?:\/\//, '')
  return {
    httpUrl: `${httpProto}//${hostPart}`,
    wsUrl: `${wsProto}//${hostPart}/v1/events`,
  }
}

/**
 * Manages the connection, state machine, prompt injection, and auto-speak
 * pipelines between the browser client and the local voice gateway.
 */
export class VoiceManager implements HostObservable<VoiceSnapshot> {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private listeners: Set<Listener> = new Set()
  private ctx: ClientContext

  public state: VoiceGatewayState = 'disconnected'
  public status: VoiceGatewayStatus = {
    status: 'unknown',
    trigger_mode: (typeof localStorage !== 'undefined' && (localStorage.getItem('dsh.voice.trigger_mode') as string)) || 'voiceprint_passive',
    audio_duplex_mode: 'half',
    auto_speak: typeof localStorage !== 'undefined' && localStorage.getItem('dsh.voice.auto_speak') !== null
      ? localStorage.getItem('dsh.voice.auto_speak') === 'true'
      : true,
    registered_speakers: [],
    connected: false,
  }

  private urls = resolveGatewayUrls()
  private snapshot: VoiceSnapshot = {
    state: this.state,
    status: { ...this.status },
    gatewayUrl: this.urls.httpUrl,
  }

  private isDisposed = false
  private disposeSessionListSubscription: (() => void) | null = null
  private disposeEventSourceSubscription: (() => void) | null = null
  private disposeSessionStateSubscription: (() => void) | null = null
  private currentObservedSessionId: SessionId | null = null
  private spokenSeqs = new Map<SessionId, number>()
  public isAgentRunning = false

  public isListeningMode(mode: string = this.status.trigger_mode): boolean {
    return mode === 'voiceprint_passive' || mode === 'hybrid'
  }

  constructor(ctx: ClientContext) {
    this.ctx = ctx
    this.connect()
    this.setupAutoSpeakListener()
  }

  public dispose() {
    this.isDisposed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      try {
        this.ws.close()
      } catch {}
      this.ws = null
    }
    if (this.disposeEventSourceSubscription) {
      this.disposeEventSourceSubscription()
      this.disposeEventSourceSubscription = null
    }
    if (this.disposeSessionStateSubscription) {
      this.disposeSessionStateSubscription()
      this.disposeSessionStateSubscription = null
    }
    if (this.disposeSessionListSubscription) {
      this.disposeSessionListSubscription()
      this.disposeSessionListSubscription = null
    }
    this.spokenSeqs.clear()
    this.listeners.clear()
  }

  public subscribe = (listener: Listener): () => void => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  public getSnapshot = (): VoiceSnapshot => {
    return this.snapshot
  }

  private notify() {
    this.snapshot = {
      state: this.state,
      status: { ...this.status },
      gatewayUrl: this.urls.httpUrl,
    }
    for (const l of this.listeners) {
      try { l() } catch {}
    }
  }

  /** Safely updates the gateway URL without event handler races or state corruption. */
  public updateGatewayUrl(newUrl: string) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dsh.voice.gateway_url', newUrl)
    }
    this.urls = resolveGatewayUrls(newUrl)
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      try {
        this.ws.close()
      } catch {}
      this.ws = null
    }
    this.connect()
    this.notify()
  }

  public connect() {
    if (typeof WebSocket === 'undefined' || this.isDisposed) return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    try {
      this.ws = new WebSocket(this.urls.wsUrl)

      this.ws.onopen = async () => {
        if (this.isDisposed) return
        this.status.connected = true
        this.state = this.isListeningMode() ? 'listening' : 'idle'
        this.notify()
        await this.fetchStatus()
      }

      this.ws.onmessage = (event) => {
        if (this.isDisposed) return
        try {
          const data: VoiceEvent = JSON.parse(event.data)
          this.handleEvent(data)
        } catch {}
      }

      this.ws.onclose = () => {
        if (this.isDisposed) return
        this.status.connected = false
        this.state = 'disconnected'
        this.notify()
        this.scheduleReconnect()
      }

      this.ws.onerror = () => {
        if (this.isDisposed) return
        this.status.connected = false
        this.state = 'disconnected'
        this.notify()
      }
    } catch {
      if (this.isDisposed) return
      this.status.connected = false
      this.state = 'disconnected'
      this.notify()
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.isDisposed) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 3000)
  }

  private async handleEvent(data: VoiceEvent) {
    if (this.isDisposed) return

    switch (data.event) {
      case 'wake_word_detected':
        this.state = 'listening'
        this.notify()
        break

      case 'speech_recognized':
        {
          const speaker = data.speaker || 'unknown'
          const text = data.text || ''

          // Filter guest or unregistered speakers when registered profiles exist
          const isEnrolled = this.status.registered_speakers.includes(speaker)
          const isGuest = speaker === 'guest' || speaker === 'unknown' || (!isEnrolled && this.status.registered_speakers.length > 0)

          if (isGuest) {
            this.state = this.isListeningMode() ? 'listening' : 'idle'
            this.notify()
            return
          }

          this.state = 'thinking'
          this.notify()

          // Inject recognized voice prompt into current active session
          if (text.trim()) {
            const currentSessionId = this.ctx.sessions?.list?.getSnapshot()?.current
            if (currentSessionId) {
              const binding = this.ctx.sessions?.binding(currentSessionId)
              if (binding?.session) {
                const promptText = (speaker && speaker !== 'authorized_user' && speaker !== 'unknown')
                  ? `[${speaker}] ${text.trim()}`
                  : text.trim()

                try {
                  await binding.session.prompt([{ type: 'text', text: promptText }], 'queue')
                } catch (err) {
                  console.error('[VoiceManager] Failed to inject voice prompt into session:', err)
                }
              }
            }
          }
        }
        break

      case 'tts_generating':
        this.state = 'generating'
        this.notify()
        break

      case 'tts_playing':
      case 'speak_triggered':
      case 'playback_started':
        this.state = 'speaking'
        this.notify()
        break

      case 'tts_idle':
      case 'tts_stopped':
      case 'playback_idle':
      case 'playback_stopped':
        if (this.isAgentRunning && this.status.connected && this.state !== 'disconnected') {
          // Agent is still running multi-step tools or deep reasoning; preserve thinking state after speech
          this.state = 'thinking'
        } else {
          this.state = this.status.connected ? (this.isListeningMode() ? 'listening' : 'idle') : 'disconnected'
        }
        this.notify()
        break

      case 'mode_changed':
        if (data.new_mode) {
          this.status.trigger_mode = data.new_mode
          this.state = this.isListeningMode(data.new_mode) ? 'listening' : 'idle'
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('dsh.voice.trigger_mode', data.new_mode)
          }
          this.notify()
        }
        break

      case 'autospeak_changed':
        if (data.enabled !== undefined) {
          this.status.auto_speak = data.enabled
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('dsh.voice.auto_speak', String(data.enabled))
          }
          this.notify()
        }
        break

      case 'voice_profile_enrolled':
      case 'voice_profile_deleted':
        void this.fetchStatus()
        break
    }
  }

  /**
   * Subscribes to the active Session event stream to automatically speak
   * finished assistant messages without fragile chat-view DOM/state crawling.
   */
  private setupAutoSpeakListener() {
    const attachSession = (sessionId: SessionId | undefined) => {
      if (this.disposeEventSourceSubscription) {
        this.disposeEventSourceSubscription()
        this.disposeEventSourceSubscription = null
      }
      if (this.disposeSessionStateSubscription) {
        this.disposeSessionStateSubscription()
        this.disposeSessionStateSubscription = null
      }

      // Immediately interrupt any active playback or generation when switching sessions
      void this.stopSpeaking()

      this.currentObservedSessionId = sessionId ?? null
      if (!sessionId || !this.ctx.sessions) return

      const binding = this.ctx.sessions.binding(sessionId)
      if (!binding?.eventSource) return

      // Observe real-time session execution state (running=true indicates thinking or active tool execution)
      if (
        binding.session &&
        typeof (binding.session as any).getSnapshot === 'function' &&
        typeof (binding.session as any).subscribe === 'function'
      ) {
        const syncSessionState = () => {
          if (this.isDisposed) return
          const snap = binding.session.getSnapshot()
          const isRunning = Boolean(snap?.running)
          this.isAgentRunning = isRunning

          // Guard: when voice gateway is not connected, never tamper state into thinking or listening/idle
          if (!this.status.connected || this.state === 'disconnected') {
            return
          }

          if (isRunning) {
            if (this.state !== 'speaking' && this.state !== 'generating') {
              this.state = 'thinking'
              this.notify()
            }
          } else {
            if (this.state === 'thinking') {
              this.state = this.isListeningMode() ? 'listening' : 'idle'
              this.notify()
            }
          }
        }
        syncSessionState()
        this.disposeSessionStateSubscription = binding.session.subscribe(syncSessionState)
      }

      const sessionAttachTime = Date.now()
      let isInitialLoad = true

      // Initialize high-water mark to suppress speaking historical messages on cold boot / session switch
      const initialWin = binding.eventSource.getSnapshot()
      let maxSeq = 0
      for (const entry of initialWin.entries) {
        if (entry.type === 'event' && entry.event.type === 'assistant/message') {
          if (entry.event.seq > maxSeq) maxSeq = entry.event.seq
        }
      }
      if (!this.spokenSeqs.has(sessionId)) {
        this.spokenSeqs.set(sessionId, maxSeq)
      } else {
        const prev = this.spokenSeqs.get(sessionId) || 0
        if (maxSeq > prev) this.spokenSeqs.set(sessionId, maxSeq)
      }

      // Bound map size to prevent unbounded memory growth in long-running processes
      if (this.spokenSeqs.size > 50) {
        const oldestKey = this.spokenSeqs.keys().next().value
        if (oldestKey) this.spokenSeqs.delete(oldestKey)
      }

      this.disposeEventSourceSubscription = binding.eventSource.subscribe(() => {
        if (this.isDisposed || !this.status.auto_speak || !this.status.connected) return
        const currentWin = binding.eventSource.getSnapshot()
        const lastSpoken = this.spokenSeqs.get(sessionId) ?? 0
        let newHighSeq = lastSpoken

        // Calibrate high-water mark on initial load to avoid speaking historical turns
        if (isInitialLoad) {
          isInitialLoad = false
          for (const entry of currentWin.entries) {
            if (entry.type === 'event' && entry.event.type === 'assistant/message') {
              if (entry.event.seq > newHighSeq) newHighSeq = entry.event.seq
            }
          }
          this.spokenSeqs.set(sessionId, newHighSeq)
          return
        }

        for (const entry of currentWin.entries) {
          if (entry.type === 'event' && entry.event.type === 'assistant/message') {
            const msgEvent = entry.event as AssistantMessageEventPayload
            // Timestamp guard: skip historical catch-up messages generated before attaching to this session
            const eventTime = typeof msgEvent.time === 'number' ? msgEvent.time : 0
            const isHistorical = eventTime > 0 && eventTime < sessionAttachTime - 1000

            if (msgEvent.seq > lastSpoken && !msgEvent.data.interrupted) {
              if (msgEvent.seq > newHighSeq) newHighSeq = msgEvent.seq

              if (isHistorical) {
                continue
              }

              const content = msgEvent.data.message?.content || []
              const rawText = content
                .filter((b) => b.type === 'text' && Boolean(b.text))
                .map((b) => b.text || '')
                .join('\n')
              const speechText = cleanSpeechText(rawText)
              if (speechText) {
                void this.speakText(speechText)
              }
            }
          }
        }
        this.spokenSeqs.set(sessionId, newHighSeq)
      })
    }

    if (this.ctx.sessions?.list) {
      attachSession(this.ctx.sessions.list.getSnapshot().current)
      this.disposeSessionListSubscription = this.ctx.sessions.list.subscribe(() => {
        const activeId = this.ctx.sessions?.list?.getSnapshot().current
        if (activeId !== this.currentObservedSessionId) {
          attachSession(activeId)
        }
      })
    }
  }

  /**
   * Fetches the authoritative status from the voice gateway backend.
   * Note: The gateway is authoritative; local cached values are updated, never used to overwrite gateway mode.
   */
  public async fetchStatus() {
    try {
      const resp = await fetch(`${this.urls.httpUrl}/v1/system/status`)
      if (resp.ok) {
        const data = await resp.json()

        const serverMode = data.trigger_mode || 'voiceprint_passive'
        const serverAutoSpeak = data.auto_speak !== undefined ? data.auto_speak : true

        this.status = {
          status: data.status || 'running',
          trigger_mode: serverMode,
          audio_duplex_mode: data.audio_duplex_mode || 'half',
          auto_speak: serverAutoSpeak,
          registered_speakers: Array.isArray(data.registered_speakers) ? data.registered_speakers : [],
          connected: true,
        }

        if (this.state === 'idle' || this.state === 'listening') {
          this.state = this.isListeningMode(serverMode) ? 'listening' : 'idle'
        }

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('dsh.voice.trigger_mode', serverMode)
          localStorage.setItem('dsh.voice.auto_speak', String(serverAutoSpeak))
        }

        this.notify()
      }
    } catch {
      // Keep existing state if gateway is temporarily unreachable
    }
  }

  public async setTriggerMode(mode: string) {
    try {
      const resp = await fetch(`${this.urls.httpUrl}/v1/system/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (resp.ok) {
        this.status.trigger_mode = mode
        this.state = this.isListeningMode(mode) ? 'listening' : 'idle'
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('dsh.voice.trigger_mode', mode)
        }
        this.notify()
      }
    } catch (e) {
      console.error('[VoiceManager] Failed to set trigger mode:', e)
    }
  }

  public async setAutoSpeak(enabled: boolean) {
    try {
      const resp = await fetch(`${this.urls.httpUrl}/v1/system/autospeak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (resp.ok) {
        this.status.auto_speak = enabled
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('dsh.voice.auto_speak', String(enabled))
        }
        this.notify()
      }
    } catch (e) {
      console.error('[VoiceManager] Failed to set auto speak:', e)
    }
  }

  public async stopSpeaking() {
    try {
      await fetch(`${this.urls.httpUrl}/v1/audio/stop`, { method: 'POST' })
      this.state = this.isListeningMode() ? 'listening' : 'idle'
      this.notify()
    } catch (e) {
      console.error('[VoiceManager] Failed to stop playback:', e)
    }
  }

  public async speakText(text: string) {
    if (!text || !text.trim() || !this.status.connected) return
    this.state = 'generating'
    this.notify()
    try {
      await fetch(`${this.urls.httpUrl}/v1/audio/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      })
    } catch (e) {
      console.error('[VoiceManager] Failed to speak text:', e)
      this.state = this.isListeningMode() ? 'listening' : 'idle'
      this.notify()
    }
  }

  public async listProfiles(): Promise<ProfileItem[]> {
    try {
      const resp = await fetch(`${this.urls.httpUrl}/v1/voiceprint/profiles`)
      if (resp.ok) {
        const data = (await resp.json()) as { profiles?: ProfileItem[] }
        return data.profiles || []
      }
    } catch (e) {
      console.error('[VoiceManager] Failed to list voice profiles:', e)
    }
    return []
  }

  public async deleteProfile(speakerName: string): Promise<boolean> {
    try {
      const resp = await fetch(`${this.urls.httpUrl}/v1/voiceprint/${encodeURIComponent(speakerName)}`, {
        method: 'DELETE',
      })
      if (resp.ok) {
        await this.fetchStatus()
        return true
      }
    } catch (e) {
      console.error('[VoiceManager] Failed to delete profile:', e)
    }
    return false
  }

  public async startEnroll(speakerName: string, totalSteps = 5): Promise<StartEnrollResult> {
    const resp = await fetch(`${this.urls.httpUrl}/v1/voiceprint/enroll/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: speakerName, steps: totalSteps }),
    })
    const data = (await resp.json()) as StartEnrollResult
    return data
  }

  public async recordEnrollStep(sessionId: string): Promise<RecordStepResult> {
    const resp = await fetch(`${this.urls.httpUrl}/v1/voiceprint/enroll/record_step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
    return (await resp.json()) as RecordStepResult
  }

  public async finishEnroll(sessionId: string): Promise<FinishEnrollResult> {
    const resp = await fetch(`${this.urls.httpUrl}/v1/voiceprint/enroll/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
    const data = (await resp.json()) as FinishEnrollResult
    await this.fetchStatus()
    return data
  }

  public async abortEnroll(sessionId: string): Promise<void> {
    try {
      await fetch(`${this.urls.httpUrl}/v1/voiceprint/enroll/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
    } catch {}
  }
}

export function createVoiceManager(ctx: ClientContext): VoiceManager {
  return new VoiceManager(ctx)
}
