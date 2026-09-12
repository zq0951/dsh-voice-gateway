/**
 * Ambient type definitions for DeepSeek Harness client and API packages.
 * Decouples the plugin from monorepo-internal private packages while preserving
 * exact compile-time contracts, declaration emission, and autocompletion.
 */

declare module '@deepseek-ai/dsh-session/types' {
  export type SessionId = string & { readonly __brand?: 'SessionId' }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  export interface HostObservable<T> {
    subscribe(listener: () => void): () => void
    getSnapshot(): T
  }

  export interface LocaleNamespaceMap {}

  export type PropsRuntime<S extends string = string> = {
    readonly slotName?: S
    [key: string]: unknown
  }

  export type PropsLocale<N extends keyof LocaleNamespaceMap & string> = {
    t: (key: LocaleNamespaceMap[N] & string, args?: Record<string, string | number>) => string
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

  declare module '@deepseek-ai/cordis' {
    interface Context {
      sessions?: {
        list?: {
          getSnapshot(): { current?: SessionId }
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
