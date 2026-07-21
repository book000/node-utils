import * as Sentry from '@sentry/node'
import TransportStream from 'winston-transport'
import {
  ensureSentryInitialized,
  toSeverityLevel,
} from './sentry/sentry-client'

/**
 * SentryTransport の初期化オプション
 */
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
   * @param info winston が渡すログ情報
   * @param callback 転送処理完了後に呼び出すコールバック
   */
  log(info: Record<string, unknown>, callback: () => void): void {
    setImmediate(() => this.emit('logged', info))

    const { level, message, ...rest } = info
    const messageText = typeof message === 'string' ? message : String(message)
    if (level === 'error' && typeof rest.stack === 'string') {
      Sentry.captureException(this.toError(messageText, rest.stack))
    } else if (level === 'error' || level === 'warn') {
      Sentry.captureMessage(messageText, toSeverityLevel(level))
    }

    if (level === 'error') {
      // 短命なバッチ系プロセスがこの直後に終了しても送信が完了するよう待ち合わせる
      Sentry.flush(2000)
        .catch((error: unknown) => {
          // flush 失敗を握りつぶすと GlitchTip 側の障害に気づけなくなるため、
          // winston の 'error' イベントとして通知する (transport 自体は例外を投げない)
          this.emit('error', error)
        })
        .finally(() => {
          callback()
        })
      return
    }
    callback()
  }

  private toError(message: string, stack: string): Error {
    const error = new Error(message)
    // unicorn/no-error-property-assignment はビルトイン Error への直接代入を禁止するため、
    // winston から受け取った stack 文字列・エラー名を Sentry へそのまま渡すには defineProperty を使う
    const firstLine = stack.split('\n', 1)[0]
    const name = firstLine.includes(': ')
      ? firstLine.slice(0, firstLine.indexOf(': '))
      : undefined
    if (name) {
      Object.defineProperty(error, 'name', { value: name, configurable: true })
    }
    Object.defineProperty(error, 'stack', { value: stack, configurable: true })
    return error
  }
}
