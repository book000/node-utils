import winston, { format } from 'winston'
import WinstonDailyRotateFile from 'winston-daily-rotate-file'
import cycle from 'cycle'
import moment from 'moment-timezone'
import * as Sentry from '@sentry/node'
import {
  SentryMeta,
  SentryTransport,
  toSentryMetaArg,
} from './sentry-transport'
import { resetSentryInitialized } from './sentry/sentry-client'

/**
 * Formats the current time as `YYYY-MM-DD HH:mm:ss.SSS` in the `TZ` environment variable's timezone.
 * Falls back to Asia/Tokyo when `TZ` is unset or not a known timezone.
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

/**
 * Logger wrapper around winston.
 *
 * Create instances with {@link Logger.configure}.
 * Writes to the console and to daily-rotated files, and forwards `warn`/`error` logs to Sentry when `SENTRY_DSN` is set.
 */
export class Logger {
  private static readonly cache = new Map<string, Logger>()

  private readonly logger: winston.Logger

  private constructor(logger: winston.Logger) {
    this.logger = logger
  }

  /**
   * Outputs a debug log.
   *
   * @param message Message
   * @param metadata Metadata
   */
  public debug(message: string, metadata?: Record<string, unknown>): void {
    this.logger.debug(message, metadata ?? {})
  }

  /**
   * Outputs an info log.
   *
   * @param message Message
   * @param metadata Metadata
   */
  public info(message: string, metadata?: Record<string, unknown>): void {
    this.logger.info(message, metadata ?? {})
  }

  /**
   * Outputs a warning log.
   *
   * @param message Message
   * @param error Error
   * @param meta Controls what is sent to Sentry (when omitted, the log is sent automatically)
   */
  public warn(message: string, error?: Error, meta?: SentryMeta): void {
    if (meta === undefined) {
      this.logger.warn(message, error)
      return
    }
    // Always fill the error position so that meta is not spread into the top level of info and leaked into the output
    this.logger.warn(message, error, toSentryMetaArg(meta))
  }

  /**
   * Outputs an error log.
   *
   * @param message Message
   * @param error Error
   * @param meta Controls what is sent to Sentry (when omitted, the log is sent automatically)
   */
  public error(message: string, error?: Error, meta?: SentryMeta): void {
    if (meta === undefined) {
      this.logger.error(message, error)
      return
    }
    // Always fill the error position so that meta is not spread into the top level of info and leaked into the output
    this.logger.error(message, error, toSentryMetaArg(meta))
  }

  /**
   * Creates and configures a logger.
   *
   * Subsequent calls with the same category return the instance created by the first call
   * (it is not recreated even if environment variables changed). This prevents file descriptor leaks
   * from loops or frequent calls.
   *
   * The internal cache is never evicted per category, so a high-cardinality category such as a user ID
   * or request ID makes the cache grow without bound.
   * Use a fixed, low-cardinality value such as a class or module name.
   *
   * The following environment variables are read (only on the first call for a category):
   * - LOG_LEVEL: console log level (default `info`)
   * - LOG_FILE_LEVEL: file log level (default `info`)
   * - LOG_DIR: log directory (default `logs`). When `VERCEL` is set, `/tmp/logs` is used regardless of LOG_DIR
   * - LOG_FILE_MAX_AGE: maximum retention of log files (default `30d`)
   * - LOG_FILE_FORMAT: log file format, `text` (default, `.log`) or `ndjson` (`.ndjson`)
   * - TZ: timezone of the timestamps (default `Asia/Tokyo`)
   * - SENTRY_DSN, SENTRY_LOG_LEVEL (default `warn`), SENTRY_ENVIRONMENT: when SENTRY_DSN is set, a {@link SentryTransport} is added
   *
   * @param category Category
   * @returns The logger (an existing instance is reused for the same category)
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

      const filteredRest = Object.keys(rest).reduce((accumulator, key) => {
        return key === 'stack'
          ? accumulator
          : {
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

    const transports: winston.transport[] = [
      new winston.transports.Console({
        level: logLevel,
        format: consoleFormat,
      }),
      transportRotateFile,
      ...(process.env.SENTRY_DSN
        ? [
            new SentryTransport({
              level: process.env.SENTRY_LOG_LEVEL ?? 'warn',
              dsn: process.env.SENTRY_DSN,
              environment: process.env.SENTRY_ENVIRONMENT,
            }),
          ]
        : []),
    ]

    const logger = winston.createLogger({ transports })
    const instance = new Logger(logger)
    this.cache.set(category, instance)
    return instance
  }

  /**
   * Closes every cached logger and clears the internal cache.
   *
   * Each cached winston logger (including its transports) is explicitly closed before the cache is discarded,
   * so the next configure() call creates a new instance per category.
   * Use it on process shutdown, or to reset logger state between tests,
   * when you want to release the file descriptors of all cached loggers at once.
   * When SENTRY_DSN is set, it also starts Sentry.close() (2000 ms timeout) to flush pending events.
   * This method is synchronous and does not wait for that promise.
   * After the call, Logger.configure() can initialize loggers (and Sentry) again.
   */
  public static closeAll(): void {
    for (const instance of this.cache.values()) {
      instance.logger.close()
    }
    this.cache.clear()
    if (!process.env.SENTRY_DSN) {
      return
    }

    Sentry.close(2000).catch((error: unknown) => {
      // Swallowing a close failure would hide GlitchTip-side problems,
      // so surface it with console.error as a last resort during process shutdown
      console.error('Failed to close Sentry client', error)
    })
    resetSentryInitialized()
  }

  static getTimestamp(): () => string {
    // 'YYYY-MM-DD HH:mm:ss.SSS' in the TZ environment variable's timezone (default Asia/Tokyo)
    return getTimestampFormatter
  }
}

// Importing this module deliberately registers these handlers at the top level so that unhandled exceptions
// and rejections are logged automatically. Making it opt-in would change the behavior for existing consumers.
// eslint-disable-next-line unicorn/no-top-level-side-effects
process.on('unhandledRejection', (reason) => {
  const logger = Logger.configure('main')
  logger.error('unhandledRejection', reason as Error)
})
// eslint-disable-next-line unicorn/no-top-level-side-effects
process.on('uncaughtException', (error) => {
  const logger = Logger.configure('main')
  logger.error('uncaughtException', error)
})
