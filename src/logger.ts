import winston, { format } from 'winston'
import WinstonDailyRotateFile from 'winston-daily-rotate-file'
import cycle from 'cycle'
import moment from 'moment-timezone'

/**
 * ロガーラッパークラス
 */
const getTimestampFormatter = (): string => {
  const timezone =
    process.env.TZ && moment.tz.zone(process.env.TZ)
      ? process.env.TZ
      : 'Asia/Tokyo'
  const format = 'YYYY-MM-DD HH:mm:ss.SSS'
  const zonedTime = moment().tz(timezone)
  return zonedTime.format(format)
}

export class Logger {
  private static readonly cache = new Map<string, Logger>()

  private readonly logger: winston.Logger

  private constructor(logger: winston.Logger) {
    this.logger = logger
  }

  /**
   * デバッグログを出力する
   *
   * @param message メッセージ
   * @param metadata メタデータ
   */
  public debug(message: string, metadata?: Record<string, unknown>): void {
    this.logger.debug(message, metadata ?? {})
  }

  /**
   * 情報ログを出力する
   *
   * @param message メッセージ
   * @param metadata メタデータ
   */
  public info(message: string, metadata?: Record<string, unknown>): void {
    this.logger.info(message, metadata ?? {})
  }

  /**
   * 警告ログを出力する
   *
   * @param message メッセージ
   * @param error エラー
   */
  public warn(message: string, error?: Error): void {
    this.logger.warn(message, error)
  }

  /**
   * エラーログを出力する
   *
   * @param message メッセージ
   * @param error エラー
   */
  public error(message: string, error?: Error): void {
    this.logger.error(message, error)
  }

  /**
   * ロガーを初期化・設定する
   *
   * 同一 category に対する 2 回目以降の呼び出しでは、初回生成時のインスタンスをそのまま返す
   * (環境変数を変更していても再生成されない)。これにより、ループや高頻度呼び出しによる
   * ファイルディスクリプタリークを防止する。
   *
   * 環境変数で以下の設定が可能 (初回呼び出し時のみ反映される)
   * - LOG_LEVEL: ログレベル (デフォルト info)
   * - LOG_FILE_LEVEL: ファイル出力のログレベル (デフォルト info)
   * - LOG_DIR: ログ出力先 (デフォルト logs)。Vercelで動作する場合は /tmp/logs に出力する
   * - LOG_FILE_MAX_AGE: ログファイルの最大保存期間 (デフォルト 30d)
   * - LOG_FILE_FORMAT: ログファイルのフォーマット (デフォルト text)
   *
   * @param category カテゴリ
   * @returns ロガー (同一 category では既存インスタンスを再利用する)
   */
  public static configure(category: string): Logger {
    const cached = this.cache.get(category)
    if (cached) {
      return cached
    }

    const logLevel = process.env.LOG_LEVEL ?? 'info'
    const logFileLevel = process.env.LOG_FILE_LEVEL ?? 'info'
    const logDirectory = process.env.VERCEL
      ? '/tmp/logs'
      : (process.env.LOG_DIR ?? 'logs')
    const logFileMaxAge = process.env.LOG_FILE_MAX_AGE ?? '30d'
    const selectLogFileFormat = process.env.LOG_FILE_FORMAT ?? 'text'

    const textFormat = format.printf((info) => {
      const { timestamp, level, message, ...rest } = info
      // eslint-disable-next-line unicorn/no-array-reduce
      const filteredRest = Object.keys(rest).reduce((accumulator, key) => {
        if (key === 'stack') {
          return accumulator
        }
        return {
          ...accumulator,
          [key]: rest[key],
        }
      }, {})
      const standardLine = [
        '[',
        timestamp,
        '] [',
        category,
        category ? '/' : '',
        level.toLocaleUpperCase(),
        ']: ',
        message,
        Object.keys(filteredRest).length > 0
          ? ` (${JSON.stringify(filteredRest)})`
          : '',
      ].join('')
      let errorLine
      if (info.stack && typeof info.stack === 'string') {
        errorLine = info.stack.split('\n').slice(1).join('\n')
      } else if (info.stack) {
        errorLine = JSON.stringify(info.stack)
      } else {
        errorLine = undefined
      }

      return [standardLine, errorLine].filter((l) => l !== undefined).join('\n')
    })
    const logFileFormat =
      selectLogFileFormat === 'ndjson' ? format.json() : textFormat
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const decycleFormat = format((info) => cycle.decycle(info))
    const fileFormat = format.combine(
      format.errors({ stack: true }),
      selectLogFileFormat === 'ndjson'
        ? format.colorize({
            message: true,
          })
        : format.uncolorize(),
      decycleFormat(),
      format.timestamp({
        format: this.getTimestamp(),
      }),
      logFileFormat
    )
    const consoleFormat = format.combine(
      format.colorize({
        message: true,
      }),
      decycleFormat(),
      format.timestamp({
        format: this.getTimestamp(),
      }),
      textFormat
    )
    const extension = selectLogFileFormat === 'ndjson' ? 'ndjson' : 'log'
    const transportRotateFile = new WinstonDailyRotateFile({
      level: logFileLevel,
      dirname: logDirectory,
      filename: `%DATE%.` + extension,
      datePattern: 'YYYY-MM-DD',
      maxFiles: logFileMaxAge,
      format: fileFormat,
      auditFile: `${logDirectory}/audit.json`,
    })

    const logger = winston.createLogger({
      transports: [
        new winston.transports.Console({
          level: logLevel,
          format: consoleFormat,
        }),
        transportRotateFile,
      ],
    })
    const instance = new Logger(logger)
    this.cache.set(category, instance)
    return instance
  }

  /**
   * テスト用途: 内部キャッシュをクリアする
   *
   * category ごとの Logger インスタンスキャッシュを破棄し、次回の configure() 呼び出しで
   * 新規に生成し直させる。プロダクションコードから呼び出すことは想定していない。
   */
  public static resetForTesting(): void {
    this.cache.clear()
  }

  static getTimestamp(): () => string {
    // 'YYYY-MM-DD hh:mm:ss.SSS'
    // Asia/Tokyo
    return getTimestampFormatter
  }
}

process.on('unhandledRejection', (reason) => {
  const logger = Logger.configure('main')
  logger.error('unhandledRejection', reason as Error)
})
process.on('uncaughtException', (error) => {
  const logger = Logger.configure('main')
  logger.error('uncaughtException', error)
})
