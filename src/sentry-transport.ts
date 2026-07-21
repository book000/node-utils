import * as Sentry from '@sentry/node'
import TransportStream from 'winston-transport'
import {
  ensureSentryInitialized,
  toSeverityLevel,
} from './sentry/sentry-client'

export interface SentryTransportOptions
  extends TransportStream.TransportStreamOptions {
  dsn: string
  environment?: string
}

/**
 * winston の error/warn ログを Sentry (GlitchTip 互換) へ転送するトランスポート
 *
 * SENTRY_DSN が設定されている場合のみ Logger.configure() から transports 配列に追加される
 */
export class SentryTransport extends TransportStream {
  constructor(options: SentryTransportOptions) {
    super(options)
    ensureSentryInitialized(options)
  }

  /**
   * winston から渡されたログ情報を Sentry へ転送する
   *
   * level が 'error' で stack が付いている場合は captureException、それ以外の error/warn は
   * captureMessage で送信する。error レベルのみ Sentry.flush() を待ち合わせてからコールバックする
   *
   * @param info winston が渡すログ情報
   * @param callback 転送処理完了後に呼び出すコールバック
   */
  log(info: Record<string, unknown>, callback: () => void): void {
    setImmediate(() => this.emit('logged', info))

    const { level, message, ...rest } = info
    if (level === 'error' && typeof rest.stack === 'string') {
      Sentry.captureException(this.toError(message as string, rest.stack))
    } else if (level === 'error' || level === 'warn') {
      Sentry.captureMessage(
        message as string,
        toSeverityLevel(level as string)
      )
    }

    if (level === 'error') {
      // 短命なバッチ系プロセスがこの直後に終了しても送信が完了するよう待ち合わせる
      void Sentry.flush(2000).finally(() => callback())
      return
    }
    callback()
  }

  private toError(message: string, stack: string): Error {
    const error = new Error(message)
    error.stack = stack
    return error
  }
}
