import * as Sentry from '@sentry/node'
import TransportStream from 'winston-transport'
import {
  ensureSentryInitialized,
  toSeverityLevel,
} from './sentry/sentry-client'

/**
 * スタックから node_modules / Node 内部を除いた最初のフレームを返す
 *
 * デプロイ先のパスや行番号の変化でグループが割れないよう、関数名とファイル名だけにする
 */
function firstAppFrame(error: Error): string | undefined {
  return error.stack
    ?.split('\n')
    .find(
      (line) =>
        line.trimStart().startsWith('at ') &&
        !line.includes('node_modules') &&
        !line.includes('node:internal')
    )
    ?.trim()
    .replace(/\(?(?:[^()]*[\\/])?([^\\/()]+?):\d+:\d+\)?$/, '$1')
}

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
    if (level === 'error' || level === 'warn') {
      this.capture(level, messageText, info, rest.stack)
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

  /**
   * ログを Sentry へ送る
   *
   * winston は `logger.error(msg, err)` のとき message に `msg + err.message` を連結するため、
   * そのまま送るとタイトルがログメッセージ込みで変動しグルーピングが崩れる。
   * 元の Error (splat から取得。なければ stack から再構築) を送り、ログメッセージはタグへ、グルーピングは fingerprint で固定する。
   * message のみのイベントは captureMessage だと合成スタックが付きタイトルが変わるため captureEvent で送る
   */
  private capture(
    level: 'error' | 'warn',
    message: string,
    info: Record<string, unknown>,
    stack: unknown
  ): void {
    // Sentry は同一 Error インスタンスの 2 回目以降の送信を捨てるため、
    // 元の Error は複製して送る (同じ Error を warn → error と連続してログしても欠落しない)
    const original = this.findError(info)
    const error = original
      ? this.toError(original.message, original.stack ?? '', original.name)
      : typeof stack === 'string'
        ? this.toError(message, stack)
        : undefined
    Sentry.withScope((scope) => {
      scope.setLevel(toSeverityLevel(level))
      scope.setTag('log.message', message)
      if (error) {
        scope.setFingerprint([
          level,
          error.name,
          firstAppFrame(error) ?? error.message,
        ])
        Sentry.captureException(error)
      } else {
        // メッセージの可変部は正規化せず、そのまま fingerprint に使う
        scope.setFingerprint([level, message])
        Sentry.captureEvent({ message, level: toSeverityLevel(level) })
      }
    })
  }

  /**
   * winston が保持する引数 (splat) から元の Error を取り出す
   */
  private findError(info: Record<string, unknown>): Error | undefined {
    const splat = (info as Record<symbol, unknown>)[Symbol.for('splat')]
    if (!Array.isArray(splat)) return undefined
    for (const arg of splat as unknown[]) {
      if (arg instanceof Error) return arg
      const nested = (arg as { error?: unknown } | null)?.error
      if (nested instanceof Error) return nested
    }
    return undefined
  }

  private toError(message: string, stack: string, errorName?: string): Error {
    const error = new Error(message)
    // unicorn/no-error-property-assignment はビルトイン Error への直接代入を禁止するため、
    // winston から受け取った stack 文字列・エラー名を Sentry へそのまま渡すには defineProperty を使う
    const firstLine = stack.split('\n', 1)[0]
    const name =
      errorName ??
      (firstLine.includes(': ')
        ? firstLine.slice(0, firstLine.indexOf(': '))
        : undefined)
    if (name) {
      Object.defineProperty(error, 'name', { value: name, configurable: true })
    }
    Object.defineProperty(error, 'stack', { value: stack, configurable: true })
    return error
  }
}
