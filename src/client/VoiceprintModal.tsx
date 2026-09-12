import { useState, useEffect } from 'react'
import type { VoiceKey } from './locales.ts'
import type {
  ProfileItem,
  EnrollSession,
  StartEnrollResult,
  RecordStepResult,
  FinishEnrollResult,
} from './slots.ts'
import css from './VoiceprintModal.module.css'

interface VoiceprintModalProps {
  isOpen: boolean
  onClose: () => void
  t: (key: VoiceKey, args?: Record<string, string | number>) => string
  listProfiles: () => Promise<ProfileItem[]>
  deleteProfile: (name: string) => Promise<boolean>
  startEnroll: (name: string, steps?: number) => Promise<StartEnrollResult>
  recordEnrollStep: (sessionId: string) => Promise<RecordStepResult>
  finishEnroll: (sessionId: string) => Promise<FinishEnrollResult>
  abortEnroll: (sessionId: string) => Promise<void>
}

function MicIcon(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
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

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export function VoiceprintModal(props: VoiceprintModalProps) {
  const {
    isOpen,
    onClose,
    t,
    listProfiles,
    deleteProfile,
    startEnroll,
    recordEnrollStep,
    finishEnroll,
    abortEnroll,
  } = props
  const [profiles, setProfiles] = useState<ProfileItem[]>([])
  const [speakerName, setSpeakerName] = useState('')
  const [sessionInfo, setSessionInfo] = useState<EnrollSession | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)
  const [successNotice, setSuccessNotice] = useState<string | null>(null)

  // Reset input field and previous wizard state when modal re-opens
  useEffect(() => {
    if (isOpen) {
      void refreshProfiles()
      setSpeakerName('')
      setSessionInfo(null)
      setStepError(null)
      setSuccessNotice(null)
    }
  }, [isOpen])

  const refreshProfiles = async () => {
    const list = await listProfiles()
    setProfiles(list || [])
  }

  const handleCloseModal = () => {
    void handleAbort()
    onClose()
  }

  // Handle Escape key to gracefully abort active session and close modal
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseModal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, sessionInfo])

  const handleDelete = async (name: string) => {
    if (window.confirm(t('voice.enroll.delete_confirm', { name }))) {
      await deleteProfile(name)
      await refreshProfiles()
    }
  }

  const handleStartEnroll = async () => {
    if (!speakerName.trim()) return
    setStepError(null)
    setSuccessNotice(null)
    try {
      const res = await startEnroll(speakerName.trim(), 5)
      const session = res.session || (res as unknown as EnrollSession)
      setSessionInfo(session)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setStepError(msg)
    }
  }

  const handleRecordStep = async () => {
    if (!sessionInfo || isRecording) return
    setIsRecording(true)
    setStepError(null)
    try {
      const res = await recordEnrollStep(sessionInfo.session_id)
      if (res.status === 'ok' && res.success !== false) {
        if (res.is_final_step || res.is_completed) {
          // Final step completed, finalize enrollment session
          await finishEnroll(sessionInfo.session_id)
          setSuccessNotice(t('voice.enroll.done_success', { name: sessionInfo.speaker_name }))
          setSessionInfo(null)
          setSpeakerName('')
          await refreshProfiles()
        } else {
          // Advance to next phrase step
          setSessionInfo((prev) => {
            if (!prev) return null
            return {
              ...prev,
              current_step: res.next_step ?? res.current_step ?? prev.current_step,
              current_prompt: res.next_prompt ?? res.current_prompt ?? prev.current_prompt,
            }
          })
        }
      } else {
        setStepError(res.error || res.message || t('voice.enroll.record_failed'))
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setStepError(msg)
    } finally {
      setIsRecording(false)
    }
  }

  const handleAbort = async () => {
    if (sessionInfo) {
      await abortEnroll(sessionInfo.session_id)
      setSessionInfo(null)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className={css.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCloseModal()
        }
      }}
    >
      <div className={css.modalCard}>
        <div className={css.header}>
          <div className={css.titleRow}>
            <span className={css.titleIcon}><MicIcon /></span>
            <h3 className={css.title}>{t('voice.enroll.modal_title')}</h3>
          </div>
          <button
            className={css.closeBtn}
            onClick={handleCloseModal}
            aria-label={t('voice.enroll.close_aria')}
          >
            <CloseIcon />
          </button>
        </div>

        <div className={css.body}>
          {/* Left panel: enrolled speaker voiceprints */}
          <div className={css.leftPanel}>
            <h4 className={css.sectionTitle}>{t('voice.enroll.profiles_list_title')}</h4>
            <div className={css.profileList}>
              {profiles.length === 0 ? (
                <div className={css.emptyList}>{t('voice.enroll.no_profiles')}</div>
              ) : (
                profiles.map((p: ProfileItem) => (
                  <div key={p.name} className={css.profileItem}>
                    <div className={css.profileInfo}>
                      <div className={css.profileName}>{p.name}</div>
                      <div className={css.profileMeta}>{t('voice.enroll.sample_count', { count: p.sample_count })}</div>
                    </div>
                    <button className={css.deleteBtn} onClick={() => void handleDelete(p.name)}>
                      {t('voice.enroll.delete_btn')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right panel: guided enrollment wizard */}
          <div className={css.rightPanel}>
            <h4 className={css.sectionTitle}>{t('voice.enroll.new_enroll_title')}</h4>

            {successNotice && <div className={css.successAlert}>{successNotice}</div>}
            {stepError && <div className={css.errorAlert}>{stepError}</div>}

            {!sessionInfo ? (
              <div className={css.startForm}>
                <label className={css.fieldLabel}>{t('voice.enroll.speaker_name_label')}</label>
                <input
                  type="text"
                  className={css.input}
                  placeholder={t('voice.enroll.speaker_name_placeholder')}
                  value={speakerName}
                  onChange={(e) => setSpeakerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void handleStartEnroll()
                    }
                  }}
                  autoFocus
                />
                <button
                  className={css.primaryBtn}
                  disabled={!speakerName.trim()}
                  onClick={() => void handleStartEnroll()}
                >
                  {t('voice.enroll.start_enroll_btn')}
                </button>
              </div>
            ) : (
              <div className={css.stepWizard}>
                <div className={css.stepIndicator}>
                  {t('voice.enroll.step_indicator', {
                    current: sessionInfo.current_step + 1,
                    total: sessionInfo.total_steps,
                  })}
                </div>

                <div className={css.promptBox}>
                  <div className={css.promptLabel}>{t('voice.enroll.prompt_guide_title')}</div>
                  <div className={css.promptText}>{sessionInfo.current_prompt}</div>
                </div>

                {isRecording ? (
                  <div className={css.recordingStatus}>
                    <div className={css.recordingWaves}>
                      <span /><span /><span /><span /><span />
                    </div>
                    <p>{t('voice.enroll.recording_in_progress')}</p>
                  </div>
                ) : (
                  <div className={css.wizardActions}>
                    <button className={css.recordBtn} onClick={() => void handleRecordStep()}>
                      {t('voice.enroll.record_step_btn')}
                    </button>
                    <button className={css.cancelBtn} onClick={() => void handleAbort()}>
                      {t('voice.enroll.abort_btn')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
