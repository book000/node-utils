/**
 * ctix による src/index.ts 自動生成の対象から除外する
 * (sentry-transport.ts / error-reporter.ts からのみ import される内部モジュールのため)
 *
 * @ctix-exclude
 */
import * as Sentry from '@sentry/node'
import { detectAppRelease } from './sentry-release'

export interface SentryClientOptions {
  dsn: string
  environment?: string
}

// プロセスあたり 1 回だけ Sentry.init() するための共有フラグ
// (SentryTransport は Logger.configure() のカテゴリごとに複数回インスタンス化されうり、
// ErrorReporter とも独立して呼ばれうるため、両者が共有するモジュールスコープの変数として持つ)
let initialized = false

/**
 * Sentry SDK をプロセスあたり 1 回だけ初期化する
 *
 * 2 回目以降の呼び出しは no-op (最初に渡された options がそのまま使われ続ける)
 *
 * @param options DSN・environment 等の初期化オプション
 */
export function ensureSentryInitialized(options: SentryClientOptions): void {
  if (initialized) return
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment ?? process.env.NODE_ENV ?? 'production',
    release: process.env.SENTRY_RELEASE ?? detectAppRelease(),
    // logger.ts 末尾の unhandledRejection/uncaughtException フック経由の転送と
    // 二重に送信されるのを防ぐため、Sentry 自身のデフォルト統合を無効化する
    integrations: (integrations) =>
      integrations.filter(
        (integration) =>
          integration.name !== 'OnUncaughtException' &&
          integration.name !== 'OnUnhandledRejection'
      ),
  })
  initialized = true
}

/**
 * Winston の npm ログレベルを Sentry の SeverityLevel に変換する
 *
 * Winston の 'warn' は Sentry の SeverityLevel では 'warning' であり文字列が一致しないため、
 * 単純キャストでは無効な値が GlitchTip に送られてしまう
 *
 * @param level Winston のログレベル文字列
 * @returns 対応する Sentry SeverityLevel
 */
export function toSeverityLevel(level: string): Sentry.SeverityLevel {
  return level === 'warn' ? 'warning' : (level as Sentry.SeverityLevel)
}

/**
 * Sentry SDK が初期化済みかどうかを返す
 *
 * @returns 初期化済みなら true
 */
export function isSentryInitialized(): boolean {
  return initialized
}

/**
 * 初期化済みフラグをリセットする
 *
 * Logger.closeAll() で Sentry.close() した後、次の Logger.configure() で
 * 再度 Sentry.init() できるようにするために呼び出す
 */
export function resetSentryInitialized(): void {
  initialized = false
}
