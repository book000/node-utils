import * as Sentry from '@sentry/node'
import TransportStream from 'winston-transport'
import {
  ensureSentryInitialized,
  toSeverityLevel,
} from './sentry/sentry-client'

/**
 * Returns the first stack frame that is neither in node_modules nor in Node internals.
 *
 * Only the function and file names are kept, so that deploy paths and line numbers do not split issue groups.
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

  // The input is a stack string of arbitrary length, so split it with string operations instead of a regular expression (avoids ReDoS)
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

/** Reserved key under which SentryMeta is passed to winston */
const SENTRY_META_KEY = 'sentryMeta'

/**
 * Identifies meta arguments created by Logger.
 *
 * Membership in this set, not the key name, decides what counts as meta,
 * so user data such as an error object with a same-named key is never mistaken for meta.
 */
const metaArgs = new WeakSet<object>()

/**
 * Error instances already reported, with the levels they were reported at.
 *
 * Logger creates a transport per category while the unhandledRejection hook logs under the 'main' category,
 * so this is shared between transports.
 */
const reportedErrors = new WeakMap<Error, Set<string>>()

/**
 * Wraps SentryMeta as a trailing winston argument (splat).
 *
 * It is not spread into the top level of info, so it never appears in console or file output.
 * The caller must fill the error position and then pass this return value as the last argument.
 *
 * @param meta Metadata that controls what is sent to Sentry
 * @returns The argument to pass to winston
 */
export function toSentryMetaArg(meta: SentryMeta): Record<string, SentryMeta> {
  const arg = { [SENTRY_META_KEY]: meta }
  metaArgs.add(arg)
  return arg
}

/**
 * Metadata that lets the caller control what is sent to Sentry (GlitchTip).
 */
export interface SentryMeta {
  /** When false, this log is not sent to Sentry */
  sentry?: boolean
  /** Replaces the automatic fingerprint. The '{{ default }}' token can be used */
  fingerprint?: string[]
  /** Tags to attach to the event (string values only) */
  tags?: Record<string, string>
  /** Extra data to attach to the event. Do not include secrets */
  extra?: Record<string, unknown>
}

/**
 * Validates SentryMeta at runtime and returns a value with mistyped items dropped.
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
 * Options of SentryTransport.
 */
export interface SentryTransportOptions
  extends TransportStream.TransportStreamOptions {
  dsn: string
  environment?: string
}

/**
 * Winston transport that forwards error/warn logs to Sentry (GlitchTip compatible).
 *
 * Logger.configure() adds it to the transports only when SENTRY_DSN is set.
 */
export class SentryTransport extends TransportStream {
  constructor(options: SentryTransportOptions) {
    super(options)
    ensureSentryInitialized(options)
  }

  /**
   * Forwards the log info passed by winston to Sentry.
   *
   * @param info Log info passed by winston
   * @param callback Callback to call when forwarding has finished
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
        // Keep winston from stalling when something such as a getter on meta.extra throws before callback is called
        this.emit('error', error)
      }
    }

    if (level === 'error' && captured) {
      // Wait for the flush so the event is delivered even if a short-lived batch process exits right after
      Sentry.flush(2000)
        .catch((error: unknown) => {
          // Swallowing a flush failure would hide GlitchTip-side problems,
          // so report it as a winston 'error' event (the transport itself does not throw)
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
   * Sends the log to Sentry.
   *
   * For `logger.error(msg, err)`, winston concatenates `msg + err.message` into message,
   * so sending it as is would make the title vary with the log message and break grouping.
   * Instead, the original Error (taken from the splat, or rebuilt from the stack) is sent,
   * the log message goes into a tag, and grouping is pinned by the fingerprint.
   * Message-only events are sent with captureEvent because captureMessage would add a synthetic stack and change the title.
   *
   * The fingerprint / tags / extra of SentryMeta are applied.
   * Logs with `sentry: false`, and Error instances already reported at the same level, are not sent.
   *
   * @returns true if the log was sent, false if it was skipped
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
    // Do not report twice when the same instance is logged again at the same level (e.g. by a hook after a rethrow)
    if (original && reportedErrors.get(original)?.has(level)) return false
    // Sentry drops second and later sends of the same Error instance,
    // so send a copy of the original (logging the same Error as warn and then error loses neither)
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
      // Set log.message last so that the caller's tags cannot override it
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
        // The variable part of the message is not normalized and is used in the fingerprint as is
        scope.setFingerprint(meta.fingerprint ?? [level, message])
        Sentry.captureEvent({ message, level: toSeverityLevel(level) })
      }
    })
    // Mark as reported only after sending succeeded (so that a failure does not suppress later reports)
    if (original) {
      const levels = reportedErrors.get(original) ?? new Set<string>()
      levels.add(level)
      reportedErrors.set(original, levels)
    }
    return true
  }

  /**
   * Extracts SentryMeta from the arguments (splat) held by winston.
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
   * Extracts the original Error from the arguments (splat) held by winston.
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
    // unicorn/no-error-property-assignment forbids assigning to built-in Error properties directly,
    // so use defineProperty to pass the stack string and error name received from winston to Sentry as is
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
