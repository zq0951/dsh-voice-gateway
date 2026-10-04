/**
 * Ambient type definitions for DeepSeek Harness client and API packages.
 * Decouples the plugin from monorepo-internal private packages while preserving
 * exact compile-time contracts, declaration emission, and autocompletion.
 */

declare module '@deepseek-ai/dsh-session/types' {
  export type SessionId = string & { readonly __brand?: 'SessionId' }
}

declare module '@deepseek-ai/dsh-client-locale/client' {
  import type { Context } from '@deepseek-ai/cordis'

  declare module '@deepseek-ai/cordis' {
    interface Context {
      locale: {
        register(ns: string, dicts: Record<string, Record<string, string>>): () => void
      }
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-renderer/client' {
  import type { Context } from '@deepseek-ai/cordis'
  import type { ComponentType } from 'react'

  declare module '@deepseek-ai/cordis' {
    interface Context {
      slots: {
        inject(slot: string, factory: () => any): () => void
        register(options: Record<string, unknown>, component: ComponentType<any>): () => void
      }
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  // Ambient module augmentation for conversation UI slots
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  import type { Context } from '@deepseek-ai/cordis'
  import type { SessionId } from '@deepseek-ai/dsh-session/types'

  export interface SessionBinding {
    readonly session: {
      prompt(content: Array<{ type: string; text?: string }>, mode?: string): Promise<unknown>
      getSnapshot(): { running?: boolean; [key: string]: unknown }
      subscribe(listener: () => void): () => void
    }
    readonly eventSource: {
      getSnapshot(): {
        entries: Array<{
          type: string
          event: {
            type: string
            seq: number
            time?: number
            data: {
              interrupted?: boolean
              message?: {
                content?: Array<{ type: string; text?: string }>
              }
              [key: string]: unknown
            }
            [key: string]: unknown
          }
        }>
      }
      subscribe(listener: () => void): () => void
    }
  }

  /**
   * One metadata row of the Client session list. Local retention counters live
   * in `retainedBy`; `mainView` marks the Session rendered by the main
   * conversation panel.
   */
  export interface SessionListRow {
    id: SessionId
    retainedBy?: Record<string, number | undefined>
  }

  /**
   * The Client session-list snapshot.
   *
   * NOTE: this snapshot carries list metadata only — `ids`, `byId`, `phase`,
   * `projectionsBySession`. It has NO `current` field; the displayed Session is
   * the row whose `retainedBy.mainView` counter is positive.
   */
  export interface SessionListSnapshot {
    ids: SessionId[]
    byId: Record<string, SessionListRow>
    phase?: string
    projectionsBySession?: Record<string, unknown>
  }

  declare module '@deepseek-ai/cordis' {
    interface Context {
      sessions?: {
        list?: {
          getSnapshot(): SessionListSnapshot
          subscribe(listener: () => void): () => void
        }
        binding(sessionId: SessionId): SessionBinding | undefined
      }
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-session/client' {
  // Ambient module augmentation for session UI slots
}
