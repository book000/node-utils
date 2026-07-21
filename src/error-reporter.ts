import * as Sentry from '@sentry/node'
import {
  ensureSentryInitialized,
  isSentryInitialized,
} from './sentry/sentry-client'

/**
 * Sentry (GlitchTip 互換) への明示的なエラー送信ラッパー
 *
 * Logger を経由しない箇所で、タグやコンテキスト情報を付けて明示的にエラーを送信したい場合に
 * 使うオプトイン API。利用側で configure() の呼び出しが必要で、呼ばなければ何も起きない
 */
export class ErrorReporter {
  /**
   * Sentry SDK を初期化する。SENTRY_DSN が未設定なら no-op
   */
  public static configure(): void {
    if (!process.env.SENTRY_DSN) return
    ensureSentryInitialized({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT,
    })
  }

  /**
   * 例外を Sentry へ送信する
   *
   * configure() が呼ばれていない、または SENTRY_DSN 未設定の場合は no-op
   *
   * @param error 送信する例外
   * @param context 付加するタグ・コンテキスト情報
   */
  public static captureException(
    error: Error,
    context?: Record<string, unknown>
  ): void {
    if (!isSentryInitialized()) return
    Sentry.captureException(error, { extra: context })
  }
}
