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
  const frame = error.stack
    ?.split('\n')
    .find(
      (line) =>
        line.trimStart().startsWith('at ') &&
        !line.includes('node_modules') &&
        !line.includes('node:internal')
    )
    ?.trim()
  if (frame === undefined) {
    return undefined
  }

  // 入力はスタック文字列で長さが不定なため、正規表現ではなく文字列操作で分解する (ReDoS 回避)
  const open = frame.endsWith(')') ? frame.lastIndexOf('(') : -1
  const prefix = open === -1 ? 'at ' : frame.slice(0, open)
  const location = open === -1 ? frame.slice(3) : frame.slice(open + 1, -1)
  const file = location.slice(
    Math.max(location.lastIndexOf('/'), location.lastIndexOf('\\')) + 1
  )
  const parts = file.split(':')
  const hasPosition =
    parts.length >= 3 &&
    /^\d+$/.test(parts.at(-1) ?? '') &&
    /^\d+$/.test(parts.at(-2) ?? '')
  return prefix + (hasPosition ? parts.slice(0, -2).join(':') : file)
}

/** winston へ渡す際に SentryMeta を格納する予約キー */
const SENTRY_META_KEY = 'sentryMeta'

/**
 * Logger が生成した meta 引数の識別用
 *
 * エラーオブジェクトなど利用者データが同名キーを持っていても meta と誤認しないよう、
 * キー名ではなくこの集合への所属で判定する
 */
const metaArgs = new WeakSet<object>()

/**
 * 報告済みの Error インスタンスとそのレベル
 *
 * Logger は category ごとにトランスポートを生成するが、unhandledRejection フックは
 * 'main' カテゴリで記録するため、トランスポート間で共有する
 */
const reportedErrors = new WeakMap<Error, Set<string>>()

/**
 * SentryMeta を winston の末尾引数 (splat) として渡す形に包む
 *
 * info のトップレベルへ展開されないため、コンソール・ファイル出力には現れない。
 * 呼び出し側は error 位置を必ず埋めてから、この戻り値を最後の引数に渡すこと
 *
 * @param meta Sentry への送信を制御するメタ情報
 * @returns winston へ渡す引数
 */
export function toSentryMetaArg(meta: SentryMeta): Record<string, SentryMeta> {
  const arg = { [SENTRY_META_KEY]: meta }
  metaArgs.add(arg)
  return arg
}

/**
 * Sentry (GlitchTip) への送信を呼び出し側から制御するためのメタ情報
 */
export interface SentryMeta {
  /** false を指定すると、このログを Sentry へ送らない */
  sentry?: boolean
  /** 自動生成の fingerprint を置き換える。'{{ default }}' トークンも使用可能 */
  fingerprint?: string[]
  /** イベントへ付与するタグ (値は文字列のみ) */
  tags?: Record<string, string>
  /** イベントへ付与する追加情報。機密情報を含めないこと */
  extra?: Record<string, unknown>
}

/**
 * 実行時に SentryMeta を検証し、型の合わない項目は無視した値を返す
 */
function sanitizeMeta(raw: unknown): SentryMeta {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const { sentry, fingerprint, tags, extra } = raw as Record<string, unknown>
  const meta: SentryMeta = {}
  if (sentry === false) meta.sentry = false
  if (
    Array.isArray(fingerprint) &&
    fingerprint.length > 0 &&
    fingerprint.every((v) => typeof v === 'string')
  ) {
    meta.fingerprint = fingerprint
  }
  if (typeof tags === 'object' && tags !== null && !Array.isArray(tags)) {
    meta.tags = Object.fromEntries(
      Object.entries(tags).filter(([, v]) => typeof v === 'string')
    )
  }
  if (typeof extra === 'object' && extra !== null && !Array.isArray(extra)) {
    meta.extra = extra as Record<string, unknown>
  }
  return meta
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
    let captured = false
    if (level === 'error' || level === 'warn') {
      try {
        captured = this.capture(level, messageText, info, rest.stack)
      } catch (error) {
        // meta.extra の getter などが投げても callback を呼べず winston が停止しないようにする
        this.emit('error', error)
      }
    }

    if (level === 'error' && captured) {
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
   *
   * SentryMeta の fingerprint / tags / extra を反映し、`sentry: false` のログと、
   * 同じレベルで報告済みの Error インスタンスは送らない
   *
   * @returns 送信した場合は true、スキップした場合は false
   */
  private capture(
    level: 'error' | 'warn',
    message: string,
    info: Record<string, unknown>,
    stack: unknown
  ): boolean {
    const meta = this.findMeta(info)
    if (meta.sentry === false) return false

    const original = this.findError(info)
    // 同一インスタンスを同じレベルで再度ログした場合 (再 throw 後のフック等) は二重に報告しない
    if (original && reportedErrors.get(original)?.has(level)) return false
    // Sentry は同一 Error インスタンスの 2 回目以降の送信を捨てるため、
    // 元の Error は複製して送る (同じ Error を warn → error と連続してログしても欠落しない)
    const error = original
      ? this.toError(original.message, original.stack ?? '', original.name)
      : typeof stack === 'string'
        ? this.toError(message, stack)
        : undefined
    Sentry.withScope((scope) => {
      scope.setLevel(toSeverityLevel(level))
      const tagEntries = Object.entries(meta.tags ?? {})
      for (const [key, value] of tagEntries) {
        scope.setTag(key, value)
      }
      const extraEntries = Object.entries(meta.extra ?? {})
      for (const [key, value] of extraEntries) {
        scope.setExtra(key, value)
      }
      // log.message は呼び出し側のタグで上書きされないよう最後に設定する
      scope.setTag('log.message', message)
      if (error) {
        scope.setFingerprint(
          meta.fingerprint ?? [
            level,
            error.name,
            firstAppFrame(error) ?? error.message,
          ]
        )
        Sentry.captureException(error)
      } else {
        // メッセージの可変部は正規化せず、そのまま fingerprint に使う
        scope.setFingerprint(meta.fingerprint ?? [level, message])
        Sentry.captureEvent({ message, level: toSeverityLevel(level) })
      }
    })
    // 送信処理が成功してから報告済みにする (失敗時に以降の報告まで失われないように)
    if (original) {
      const levels = reportedErrors.get(original) ?? new Set<string>()
      levels.add(level)
      reportedErrors.set(original, levels)
    }
    return true
  }

  /**
   * winston が保持する引数 (splat) から SentryMeta を取り出す
   */
  private findMeta(info: Record<string, unknown>): SentryMeta {
    const splat = (info as Record<symbol, unknown>)[Symbol.for('splat')]
    if (!Array.isArray(splat)) return {}
    for (const arg of splat as unknown[]) {
      if (typeof arg === 'object' && arg !== null && metaArgs.has(arg)) {
        return sanitizeMeta((arg as Record<string, unknown>)[SENTRY_META_KEY])
      }
    }
    return {}
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
