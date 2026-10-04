import { useState, useEffect, useRef } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { VoiceprintModal } from './VoiceprintModal.tsx'
import type {
  VoiceControlInjected,
  VoiceGatewayState,
  PropsRuntime,
  PropsLocale,
  InjectFace,
  ComposerInputActions,
} from './slots.ts'
import type { VoiceSnapshot } from './voice-service.ts'
import css from './VoiceControl.module.css'

export interface VoiceControlProps
  extends PropsRuntime<'conversation.input.right'>,
    PropsLocale<'voice'>,
    InjectFace<VoiceControlInjected> {
  /** Standard Session-scope prop: the Session this composer belongs to. */
  sessionId?: SessionId
  /** Standard Session-scope prop: the composer's action face (draft + submit). */
  inputActions?: ComposerInputActions
}

function MicIcon(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

function UserIcon(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export function VoiceControl(props: VoiceControlProps) {
  const {
    t,
    useVoice,
    voiceManager,
    inputActions,
    sessionId,
    setTriggerMode,
    setAutoSpeak,
    stopSpeaking,
    updateGatewayUrl,
    listProfiles,
    deleteProfile,
    startEnroll,
    recordEnrollStep,
    finishEnroll,
    abortEnroll,
  } = props

  // Framework-synthesized reactive hook from the injected hooks compartment
  const { state, status, gatewayUrl } = useVoice((s: VoiceSnapshot) => s)

  const [menuOpen, setMenuOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUrl, setEditingUrl] = useState(false)
  const [customUrlInput, setCustomUrlInput] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Close dropdown menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setEditingUrl(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  // Bridge this composer to the voice manager: DSH mounts this cell only for
  // the Session shown in the conversation panel, so handing over its
  // `sessionId` + `inputActions` is what lets recognized speech be typed into
  // the input box and submitted automatically.
  useEffect(() => {
    if (!voiceManager || !inputActions || sessionId === undefined) return
    voiceManager.attachComposer(sessionId, inputActions)
    return () => voiceManager.detachComposer(inputActions)
  }, [voiceManager, inputActions, sessionId])

  const stateClass: Record<VoiceGatewayState, string | undefined> = {
    idle: css.stateIdle,
    listening: css.stateListening,
    thinking: css.stateThinking,
    generating: css.stateGenerating,
    speaking: css.stateSpeaking,
    disconnected: css.stateDisconnected,
  }

  const statusDotClass: Record<VoiceGatewayState, string | undefined> = {
    listening: css.dotListening,
    thinking: css.dotThinking,
    generating: css.dotGenerating,
    speaking: css.dotSpeaking,
    idle: css.dotIdle,
    disconnected: css.dotDisconnected,
  }

  const statusLabel: Record<VoiceGatewayState, string> = {
    idle: t('voice.status.idle'),
    listening: t('voice.status.listening'),
    thinking: t('voice.status.thinking'),
    generating: t('voice.status.generating'),
    speaking: t('voice.status.speaking'),
    disconnected: t('voice.status.disconnected'),
  }

  const handleSaveUrl = () => {
    if (customUrlInput.trim()) {
      updateGatewayUrl(customUrlInput.trim())
      setEditingUrl(false)
    }
  }

  return (
    <div className={css.voiceContainer} ref={menuRef}>
      {/* Mic status button on the right side of conversation input bar */}
      <button
        className={`${css.voiceButton} ${stateClass[state] || ''}`}
        title={t('voice.button.tooltip')}
        onClick={() => setMenuOpen((prev: boolean) => !prev)}
      >
        <span className={css.micIcon}>
          <MicIcon />
        </span>
        {state === 'listening' && <span className={`${css.statusBadge} ${css.badgeListening}`} />}
        {state === 'thinking' && <span className={`${css.statusBadge} ${css.badgeThinking}`} />}
        {state === 'generating' && <span className={`${css.statusBadge} ${css.badgeGenerating}`} />}
        {state === 'speaking' && <span className={`${css.statusBadge} ${css.badgeSpeaking}`} />}
      </button>

      {/* Popover settings menu */}
      {menuOpen && (
        <div className={css.popoverMenu}>
          <div className={css.menuHeader}>
            <div className={css.statusIndicator}>
              <span className={`${css.statusDot} ${statusDotClass[state] || ''}`} />
              <span className={css.statusText}>{statusLabel[state] || statusLabel.idle}</span>
            </div>
            {(state === 'speaking' || state === 'generating') && (
              <button
                className={css.stopSpeakingBtn}
                onClick={() => void stopSpeaking()}
                title={t('voice.menu.stop_speaking')}
              >
                <span className={css.stopIcon} />
                <span>{t('voice.menu.stop_speaking')}</span>
              </button>
            )}
          </div>

          <div className={css.menuDivider} />

          {/* Trigger mode selection */}
          <div className={css.menuSection}>
            <div className={css.sectionTitle}>{t('voice.menu.mode_title')}</div>
            <div className={css.modeOptions}>
              <label className={`${css.modeItem} ${status.trigger_mode === 'hybrid' ? css.active : ''}`}>
                <span>{t('voice.menu.mode_hybrid')}</span>
                <input
                  type="radio"
                  className={css.radio}
                  name="trigger_mode"
                  checked={status.trigger_mode === 'hybrid'}
                  onChange={() => void setTriggerMode('hybrid')}
                />
              </label>
              <label className={`${css.modeItem} ${status.trigger_mode === 'voiceprint_passive' ? css.active : ''}`}>
                <span>{t('voice.menu.mode_passive')}</span>
                <input
                  type="radio"
                  className={css.radio}
                  name="trigger_mode"
                  checked={status.trigger_mode === 'voiceprint_passive'}
                  onChange={() => void setTriggerMode('voiceprint_passive')}
                />
              </label>
              <label className={`${css.modeItem} ${status.trigger_mode === 'wake_word' ? css.active : ''}`}>
                <span>{t('voice.menu.mode_wakeword')}</span>
                <input
                  type="radio"
                  className={css.radio}
                  name="trigger_mode"
                  checked={status.trigger_mode === 'wake_word'}
                  onChange={() => void setTriggerMode('wake_word')}
                />
              </label>
            </div>
          </div>

          <div className={css.menuDivider} />

          {/* Auto-speak toggle */}
          <label className={css.toggleRow}>
            <span className={css.toggleLabel}>{t('voice.menu.autospeak_title')}</span>
            <input
              type="checkbox"
              className={css.toggle}
              checked={status.auto_speak}
              onChange={(e) => void setAutoSpeak(e.target.checked)}
            />
          </label>

          <div className={css.menuDivider} />

          {/* Open voiceprint enrollment wizard button */}
          <button
            className={css.menuActionBtn}
            onClick={() => {
              setMenuOpen(false)
              setModalOpen(true)
            }}
          >
            <span className={css.actionIcon}><UserIcon /></span>
            <span>{t('voice.menu.open_enroll_modal')}</span>
          </button>

          <div className={css.menuDivider} />

          {/* Dynamic gateway URL configuration */}
          <div className={css.gatewayUrlSection}>
            <div className={css.urlLabelRow}>
              <span className={css.urlTitle}>{t('voice.menu.gateway_url')}</span>
              <button
                className={css.urlEditBtn}
                onClick={() => {
                  setEditingUrl((v: boolean) => !v)
                  setCustomUrlInput(gatewayUrl)
                }}
              >
                {editingUrl ? t('voice.menu.url_cancel') : t('voice.menu.url_edit')}
              </button>
            </div>
            {editingUrl ? (
              <div className={css.urlInputRow}>
                <input
                  type="text"
                  className={css.urlInput}
                  value={customUrlInput}
                  placeholder={t('voice.menu.url_placeholder')}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                />
                <button className={css.urlSaveBtn} onClick={handleSaveUrl}>
                  {t('voice.menu.url_save')}
                </button>
              </div>
            ) : (
              <div className={css.urlDisplay} title={gatewayUrl}>{gatewayUrl}</div>
            )}
          </div>
        </div>
      )}

      {/* Voiceprint modal */}
      <VoiceprintModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        t={t}
        listProfiles={listProfiles}
        deleteProfile={deleteProfile}
        startEnroll={startEnroll}
        recordEnrollStep={recordEnrollStep}
        finishEnroll={finishEnroll}
        abortEnroll={abortEnroll}
      />
    </div>
  )
}
