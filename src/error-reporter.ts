import * as Sentry from '@sentry/node'
import {
  ensureSentryInitialized,
  isSentryInitialized,
} from './sentry/sentry-client'

/**
 * Opt-in wrapper for explicitly sending errors to Sentry (GlitchTip compatible).
 *
 * Use it where the error does not go through Logger and you want to attach extra context.
 * It does nothing unless Sentry has been initialized, either by configure() or by a Logger created with SENTRY_DSN set.
 */
export class ErrorReporter {
  /**
   * Initializes the Sentry SDK. No-op when SENTRY_DSN is unset.
   */
  public static configure(): void {
    if (!process.env.SENTRY_DSN) return
    ensureSentryInitialized({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT,
    })
  }

  /**
   * Sends an exception to Sentry.
   *
   * No-op when Sentry has not been initialized (configure() not called and no Logger created with SENTRY_DSN set).
   *
   * @param error Exception to send
   * @param context Additional context, attached to the event as `extra`
   */
  public static captureException(
    error: Error,
    context?: Record<string, unknown>
  ): void {
    if (!isSentryInitialized()) return
    Sentry.captureException(error, { extra: context })
  }
}
